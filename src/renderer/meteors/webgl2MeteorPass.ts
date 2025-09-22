export interface MeteorConfig {
  enabled: boolean;
  ratePerMin: number;
  speedPx: number;
  lengthPx: number;
  widthPx: number;
  brightness: number;
}

interface MeteorInst {
  cxNdc: number; cyNdc: number; // center in NDC
  vxNdc: number; vyNdc: number; // velocity in NDC per second
  dirX: number; dirY: number;   // orientation (normalized)
  life: number;                 // remaining life seconds
}

export class WebGL2MeteorPass {
  private gl: WebGL2RenderingContext;
  private program!: WebGLProgram;
  private vao!: WebGLVertexArrayObject;
  private quadVbo!: WebGLBuffer;
  private quadIbo!: WebGLBuffer;
  private instanceBuf!: WebGLBuffer;
  private uResolution!: WebGLUniformLocation;
  private viewport = { w: 1, h: 1 };

  private config: MeteorConfig = { enabled: true, ratePerMin: 8, speedPx: 500, lengthPx: 180, widthPx: 2, brightness: 1.5 };

  private capacity = 64;
  private active: MeteorInst[] = [];
  private spawnAccum = 0; // expected spawns

  constructor(gl: WebGL2RenderingContext) {
    this.gl = gl;
    this.init();
  }

  setViewport(w: number, h: number) { this.viewport.w = w; this.viewport.h = h; }
  setConfig(cfg: Partial<MeteorConfig>) { this.config = { ...this.config, ...cfg }; }

  update(dt: number) {
    if (!this.config.enabled) return;
    // Spawn
    const ratePerSec = this.config.ratePerMin / 60;
    this.spawnAccum += dt * ratePerSec;
    while (this.spawnAccum >= 1 && this.active.length < this.capacity) {
      this.spawnAccum -= 1;
      const m = this.spawnOne();
      if (m) this.active.push(m);
    }
    // Integrate and cull
    const W = this.viewport.w, H = this.viewport.h;
    const margin = 64;
    const killXMin = -margin, killXMax = W + margin;
    const killYMin = -margin, killYMax = H + margin;
    const toKeep: MeteorInst[] = [];
    for (const m of this.active) {
      m.cxNdc += m.vxNdc * dt; m.cyNdc += m.vyNdc * dt; m.life -= dt;
      // Convert to pixel for bounds
      const xPx = (m.cxNdc * 0.5 + 0.5) * W;
      const yPx = (m.cyNdc * 0.5 + 0.5) * H;
      if (m.life > 0 && xPx > killXMin && xPx < killXMax && yPx > killYMin && yPx < killYMax) {
        toKeep.push(m);
      }
    }
    this.active = toKeep;
  }

  render() {
    const gl = this.gl;
    if (!this.config.enabled || this.active.length === 0) return;

    // Update instance buffer
    const stride = 7 * 4; // 7 floats per instance
    const data = new Float32Array(this.active.length * 7);
    for (let i = 0; i < this.active.length; i++) {
      const m = this.active[i];
      const base = i * 7;
      data[base+0] = m.cxNdc; data[base+1] = m.cyNdc;
      data[base+2] = m.dirX;  data[base+3] = m.dirY;
      data[base+4] = this.config.lengthPx;
      data[base+5] = this.config.widthPx;
      data[base+6] = this.config.brightness;
    }
    gl.bindBuffer(gl.ARRAY_BUFFER, this.instanceBuf);
    gl.bufferData(gl.ARRAY_BUFFER, data, gl.DYNAMIC_DRAW);

    gl.useProgram(this.program);
    gl.bindVertexArray(this.vao);
    gl.uniform2f(this.uResolution, this.viewport.w, this.viewport.h);

    // Additive blending
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE);

    gl.drawElementsInstanced(gl.TRIANGLES, 6, gl.UNSIGNED_SHORT, 0, this.active.length);

    gl.disable(gl.BLEND);
    gl.bindVertexArray(null);
  }

  private spawnOne(): MeteorInst | null {
    const W = this.viewport.w, H = this.viewport.h;
    if (W <= 0 || H <= 0) return null;
    const margin = 64;
    const sides = 4;
    const side = Math.floor(Math.random() * sides);
    const start = { x: 0, y: 0 };
    if (side === 0) { // left
      start.x = -margin; start.y = Math.random() * H;
    } else if (side === 1) { // top
      start.x = Math.random() * W; start.y = -margin;
    } else if (side === 2) { // right
      start.x = W + margin; start.y = Math.random() * H;
    } else { // bottom
      start.x = Math.random() * W; start.y = H + margin;
    }
    // Target on opposite or adjacent side to ensure crossing viewport
    const target = { x: Math.random() * W, y: Math.random() * H };
    // Bias toward crossing center
    const cx = W * 0.5, cy = H * 0.5;
    if (Math.random() < 0.6) { target.x = (Math.random()*0.6+0.2)*W; target.y = (Math.random()*0.6+0.2)*H; }
    const dirPxX = target.x - start.x; const dirPxY = target.y - start.y;
    const len = Math.hypot(dirPxX, dirPxY);
    if (len < 1e-3) return null;
    const nx = dirPxX / len; const ny = dirPxY / len;
    const speedPx = this.config.speedPx;
    // velocity in NDC per second
    const vxNdc = (speedPx * nx) * (2 / Math.max(1, W));
    const vyNdc = (speedPx * ny) * (2 / Math.max(1, H));
    // Start center offset a bit along direction so head appears inside the quad
    const halfLen = this.config.lengthPx * 0.5;
    const startCxPx = start.x + nx * halfLen;
    const startCyPx = start.y + ny * halfLen;
    const cxNdc = (startCxPx / W) * 2 - 1;
    const cyNdc = (startCyPx / H) * 2 - 1;
    // Lifetime until off screen: approximate distance across diag / speed
    const travelPx = Math.hypot(W, H) + 2*margin;
    const life = Math.min(5.0, travelPx / Math.max(1, speedPx));

    return { cxNdc, cyNdc, vxNdc, vyNdc, dirX: nx, dirY: ny, life };
  }

  private init() {
    const gl = this.gl;
    // Quad geometry
    const quad = new Float32Array([
      -0.5, -0.5,
       0.5, -0.5,
       0.5,  0.5,
      -0.5,  0.5,
    ]);
    const idx = new Uint16Array([0,1,2, 0,2,3]);

    this.quadVbo = gl.createBuffer()!;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.quadVbo);
    gl.bufferData(gl.ARRAY_BUFFER, quad, gl.STATIC_DRAW);

    this.quadIbo = gl.createBuffer()!;
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.quadIbo);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, idx, gl.STATIC_DRAW);

    this.instanceBuf = gl.createBuffer()!;

    const vs = `#version 300 es
    precision highp float;
    layout(location=0) in vec2 aCorner;           // per-vertex [-0.5..0.5]
    layout(location=1) in vec2 aCenterNDC;        // per-instance
    layout(location=2) in vec2 aDir;              // per-instance (normalized)
    layout(location=3) in float aLenPx;           // per-instance
    layout(location=4) in float aWidthPx;         // per-instance
    layout(location=5) in float aBright;          // per-instance

    uniform vec2 uResolution;

    out vec2 vRectCoord; // x: length axis [-0.5..0.5], y: width axis [-0.5..0.5]
    out float vBright;

    void main(){
      vec2 u = normalize(aDir);
      vec2 v = vec2(-u.y, u.x);
      vec2 px2ndc = vec2(2.0 / max(uResolution.x, 1.0), 2.0 / max(uResolution.y, 1.0));
      vec2 offsetNDC = (u * (aCorner.x * aLenPx) + v * (aCorner.y * aWidthPx)) * px2ndc;
      vec2 ndc = aCenterNDC + offsetNDC;
      gl_Position = vec4(ndc, 0.0, 1.0);
      vRectCoord = aCorner;
      vBright = aBright;
    }`;

    const fs = `#version 300 es
    precision highp float;
    in vec2 vRectCoord;
    in float vBright;
    out vec4 outColor;

    void main(){
      // length coord t: 0 at tail (-0.5), 1 at head (+0.5)
      float t = vRectCoord.x * 0.5 + 0.5;
      float w = 1.0 - smoothstep(0.45, 0.5, abs(vRectCoord.y));
      float tail = exp(-6.0 * (1.0 - t));
      float intensity = vBright * tail * w;
      outColor = vec4(vec3(intensity), 1.0);
    }`;

    const vert = this.createShader(gl.VERTEX_SHADER, vs);
    const frag = this.createShader(gl.FRAGMENT_SHADER, fs);
    const prog = gl.createProgram()!;
    gl.attachShader(prog, vert);
    gl.attachShader(prog, frag);
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
      throw new Error('Meteor program link failed: ' + gl.getProgramInfoLog(prog));
    }
    gl.deleteShader(vert); gl.deleteShader(frag);
    this.program = prog;

    this.uResolution = gl.getUniformLocation(prog, 'uResolution')!;

    this.vao = gl.createVertexArray()!;
    gl.bindVertexArray(this.vao);

    gl.bindBuffer(gl.ARRAY_BUFFER, this.quadVbo);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 8, 0);

    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.quadIbo);

    gl.bindBuffer(gl.ARRAY_BUFFER, this.instanceBuf);
    // aCenterNDC
    gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 2, gl.FLOAT, false, 28, 0); gl.vertexAttribDivisor(1, 1);
    // aDir
    gl.enableVertexAttribArray(2); gl.vertexAttribPointer(2, 2, gl.FLOAT, false, 28, 8); gl.vertexAttribDivisor(2, 1);
    // aLenPx
    gl.enableVertexAttribArray(3); gl.vertexAttribPointer(3, 1, gl.FLOAT, false, 28, 16); gl.vertexAttribDivisor(3, 1);
    // aWidthPx
    gl.enableVertexAttribArray(4); gl.vertexAttribPointer(4, 1, gl.FLOAT, false, 28, 20); gl.vertexAttribDivisor(4, 1);
    // aBright
    gl.enableVertexAttribArray(5); gl.vertexAttribPointer(5, 1, gl.FLOAT, false, 28, 24); gl.vertexAttribDivisor(5, 1);

    gl.bindVertexArray(null);
  }

  private createShader(type: number, src: string): WebGLShader {
    const gl = this.gl; const sh = gl.createShader(type)!; gl.shaderSource(sh, src); gl.compileShader(sh);
    if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) { const info = gl.getShaderInfoLog(sh); gl.deleteShader(sh); throw new Error('Meteor shader compile failed: ' + info); }
    return sh;
  }
}