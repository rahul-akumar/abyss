export class WebGL2StarPass {
  private gl: WebGL2RenderingContext;
  private quadVbo!: WebGLBuffer;
  private quadIbo!: WebGLBuffer;
  private instanceBuf!: WebGLBuffer;
  private program!: WebGLProgram;
  private vao!: WebGLVertexArrayObject;
  private starCount = 0;
  private uResolution!: WebGLUniformLocation;
  private uExposure!: WebGLUniformLocation;
  private uStarIntensity!: WebGLUniformLocation;
  private uTime!: WebGLUniformLocation;
  private uTwinkleSpeed!: WebGLUniformLocation;
  private uTwinkleAmount!: WebGLUniformLocation;
  // New interaction uniforms
  private uMousePx!: WebGLUniformLocation;
  private uForceRadiusPx!: WebGLUniformLocation;
  private uForceStrengthPx!: WebGLUniformLocation;
  private uShockCenterPx!: WebGLUniformLocation;
  private uShockStartTime!: WebGLUniformLocation;
  private uShockSpeedPx!: WebGLUniformLocation;
  private uShockAmpPx!: WebGLUniformLocation;
  private uShockWidthPx!: WebGLUniformLocation;
  private uShockDamp!: WebGLUniformLocation;

  private exposure = 0.0;
  private starIntensity = 1.0;
  private twinkleSpeed = 0.12;
  private twinkleAmount = 0.25;
  private viewport = { w: 1, h: 1 };

  // Interaction state
  private mousePx = { x: -1e6, y: -1e6 };
  private forceRadiusPx = 0.0;
  private forceStrengthPx = 0.0; // positive repel, negative attract
  private shockCenterPx = { x: 0, y: 0 };
  private shockStartTime = -1.0; // seconds; <0 disables
  private shockSpeedPx = 1000.0;
  private shockAmpPx = 60.0;
  private shockWidthPx = 80.0;
  private shockDamp = 2.0;

  constructor(gl: WebGL2RenderingContext, starData: Float32Array) {
    this.gl = gl;
    this.init(starData);
  }

  setExposure(ev: number) { this.exposure = ev; }
  setStarIntensity(v: number) { this.starIntensity = v; }
  setTwinkleSpeed(s: number) { this.twinkleSpeed = Math.max(0, s); }
  setTwinkleAmount(a: number) { this.twinkleAmount = Math.max(0, Math.min(1, a)); }
  setTime(t: number) { const gl = this.gl; gl.useProgram(this.program); gl.uniform1f(this.uTime, t); }
  setViewport(w: number, h: number) { this.viewport.w = w; this.viewport.h = h; }
  setStarData(starData: Float32Array) {
    const gl = this.gl;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.instanceBuf);
    gl.bufferData(gl.ARRAY_BUFFER, starData, gl.STATIC_DRAW);
    this.starCount = Math.floor(starData.length / 6);
  }

  // Interaction API
  setCursor(xPx: number, yPx: number) { this.mousePx.x = xPx; this.mousePx.y = yPx; }
  setCursorForce(radiusPx: number, strengthPx: number) { this.forceRadiusPx = Math.max(0, radiusPx); this.forceStrengthPx = strengthPx; }
  triggerShockwave(xPx: number, yPx: number, ampPx: number = 60, speedPx: number = 1000, widthPx: number = 80, damp: number = 2.0) {
    this.shockCenterPx.x = xPx; this.shockCenterPx.y = yPx;
    this.shockAmpPx = ampPx; this.shockSpeedPx = speedPx; this.shockWidthPx = widthPx; this.shockDamp = Math.max(0, damp);
    this.shockStartTime = performance.now() * 0.001;
  }

  private init(starData: Float32Array) {
    const gl = this.gl;

    // Quad geometry
    const quad = new Float32Array([
      -0.5, -0.5,
       0.5, -0.5,
       0.5,  0.5,
      -0.5,  0.5
    ]);
    const idx = new Uint16Array([0,1,2, 0,2,3]);

    this.quadVbo = gl.createBuffer()!;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.quadVbo);
    gl.bufferData(gl.ARRAY_BUFFER, quad, gl.STATIC_DRAW);

    this.quadIbo = gl.createBuffer()!;
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.quadIbo);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, idx, gl.STATIC_DRAW);

    this.instanceBuf = gl.createBuffer()!;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.instanceBuf);
    gl.bufferData(gl.ARRAY_BUFFER, starData, gl.STATIC_DRAW);
    this.starCount = Math.floor(starData.length / 6);

    // Shaders
    const vs = `#version 300 es
    precision highp float;
    layout(location=0) in vec2 aCorner;           // per-vertex
    layout(location=1) in vec2 aPos;              // per-instance (NDC)
    layout(location=2) in float aSize;            // per-instance (px)
    layout(location=3) in vec3 aColor;            // per-instance

    uniform vec2 uResolution;                     // canvas size in px
    uniform float uExposure;
    uniform float uStarIntensity;

    // Cursor force field (stars only)
    uniform vec2 uMousePx;                        // mouse in px
    uniform float uForceRadiusPx;                 // radius in px
    uniform float uForceStrengthPx;               // max displacement in px (sign: repel/attract)

    // Click shockwave
    uniform vec2 uShockCenterPx;                  // center in px
    uniform float uShockStartTime;                // seconds; <0 disables
    uniform float uShockSpeedPx;                  // px/s
    uniform float uShockAmpPx;                    // px
    uniform float uShockWidthPx;                  // px
    uniform float uShockDamp;                     // 1/s

    uniform float uTime;                          // seconds

    out vec2 vCoord;
    out vec3 vColor;
    out float vRand;

    // simple 2D hash
    float hash21(vec2 p){
      vec3 p3 = fract(vec3(p.xyx) * 0.1031);
      p3 += dot(p3, p3.yzx + 33.33);
      return fract((p3.x + p3.y) * p3.z);
    }

    void main() {
      vec2 px2ndc = vec2(2.0 / max(uResolution.x, 1.0), 2.0 / max(uResolution.y, 1.0));

      // Base star center in pixels from NDC [-1,1], with y-down pixel origin
      vec2 uv = aPos * 0.5 + 0.5;
      vec2 starPx = vec2(uv.x * uResolution.x, (1.0 - uv.y) * uResolution.y);

      // Cursor force displacement (in px)
      vec2 dispPx = vec2(0.0);
      if (uForceRadiusPx > 0.0 && uForceStrengthPx != 0.0) {
        vec2 d = starPx - uMousePx;
        float r = length(d);
        if (r < uForceRadiusPx && r > 1e-3) {
          float fall = 1.0 - (r / uForceRadiusPx);
          fall = fall * fall; // quadratic falloff
          vec2 dir = d / r;
          dispPx += dir * (uForceStrengthPx * fall);
        }
      }

      // Shockwave displacement (in px)
      if (uShockStartTime >= 0.0) {
        float t = max(0.0, uTime - uShockStartTime);
        vec2 d2 = starPx - uShockCenterPx;
        float r2 = length(d2);
        float waveR = uShockSpeedPx * t;
        float g = 0.0;
        if (uShockWidthPx > 0.0) {
          float x = (r2 - waveR) / max(uShockWidthPx, 1e-3);
          g = exp(-0.5 * x * x);
        }
        float decay = exp(-uShockDamp * t);
        if (r2 > 1e-3) {
          vec2 dir2 = d2 / r2;
          dispPx += dir2 * (uShockAmpPx * g * decay);
        }
      }

      // Convert displacement to NDC (flip Y because pixel Y grows down)
      vec2 ndc = aPos + vec2(dispPx.x * px2ndc.x, -dispPx.y * px2ndc.y) + aCorner * aSize * px2ndc;
      gl_Position = vec4(ndc, 0.0, 1.0);
      vCoord = aCorner;
      vColor = aColor * (pow(2.0, uExposure) * uStarIntensity);
      vRand = hash21(aPos * 123.47 + aColor.rg * 71.13 + aSize);
    }`;

    const fs = `#version 300 es
    precision highp float;
    in vec2 vCoord;
    in vec3 vColor;
    in float vRand;
    out vec4 outColor;

    uniform float uTime;
    uniform float uTwinkleSpeed;
    uniform float uTwinkleAmount;

    vec3 aces(vec3 x) {
      const float a=2.51; const float b=0.03; const float c=2.43; const float d=0.59; const float e=0.14;
      return clamp((x*(a*x + b)) / (x*(c*x + d) + e), 0.0, 1.0);
    }

    void main() {
      float r = length(vCoord);
      if (r > 0.5) discard;
      // twinkle: per-star phase, two slow sines mixed
      float ph = vRand * 6.2831853;
      float s1 = sin(uTime * uTwinkleSpeed * 1.0 + ph);
      float s2 = sin(uTime * uTwinkleSpeed * 1.7 + ph*1.3);
      float tw = 0.5 + 0.5 * (0.6*s1 + 0.4*s2);
      float scale = 1.0 + uTwinkleAmount * (tw - 0.5) * 2.0; // ~1±amount
      vec3 col = aces(vColor * scale);
      outColor = vec4(col, 1.0);
    }`;

    const vert = this.createShader(gl.VERTEX_SHADER, vs);
    const frag = this.createShader(gl.FRAGMENT_SHADER, fs);
    const prog = gl.createProgram()!;
    gl.attachShader(prog, vert);
    gl.attachShader(prog, frag);
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
      throw new Error('WebGL program link failed: ' + gl.getProgramInfoLog(prog));
    }
    gl.deleteShader(vert);
    gl.deleteShader(frag);
    this.program = prog;

    this.uResolution = gl.getUniformLocation(prog, 'uResolution')!;
    this.uExposure = gl.getUniformLocation(prog, 'uExposure')!;
    this.uStarIntensity = gl.getUniformLocation(prog, 'uStarIntensity')!;
    this.uTime = gl.getUniformLocation(prog, 'uTime')!;
    this.uTwinkleSpeed = gl.getUniformLocation(prog, 'uTwinkleSpeed')!;
    this.uTwinkleAmount = gl.getUniformLocation(prog, 'uTwinkleAmount')!;
    // Interaction uniforms
    this.uMousePx = gl.getUniformLocation(prog, 'uMousePx')!;
    this.uForceRadiusPx = gl.getUniformLocation(prog, 'uForceRadiusPx')!;
    this.uForceStrengthPx = gl.getUniformLocation(prog, 'uForceStrengthPx')!;
    this.uShockCenterPx = gl.getUniformLocation(prog, 'uShockCenterPx')!;
    this.uShockStartTime = gl.getUniformLocation(prog, 'uShockStartTime')!;
    this.uShockSpeedPx = gl.getUniformLocation(prog, 'uShockSpeedPx')!;
    this.uShockAmpPx = gl.getUniformLocation(prog, 'uShockAmpPx')!;
    this.uShockWidthPx = gl.getUniformLocation(prog, 'uShockWidthPx')!;
    this.uShockDamp = gl.getUniformLocation(prog, 'uShockDamp')!;

    // VAO setup
    this.vao = gl.createVertexArray()!;
    gl.bindVertexArray(this.vao);

    // Vertex buffer (quad corners)
    gl.bindBuffer(gl.ARRAY_BUFFER, this.quadVbo);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 8, 0);

    // Index buffer
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.quadIbo);

    // Instance buffer: aPos(2), aSize(1), aColor(3) => 6 floats stride 24 bytes
    gl.bindBuffer(gl.ARRAY_BUFFER, this.instanceBuf);
    // aPos
    gl.enableVertexAttribArray(1);
    gl.vertexAttribPointer(1, 2, gl.FLOAT, false, 24, 0);
    gl.vertexAttribDivisor(1, 1);
    // aSize
    gl.enableVertexAttribArray(2);
    gl.vertexAttribPointer(2, 1, gl.FLOAT, false, 24, 8);
    gl.vertexAttribDivisor(2, 1);
    // aColor
    gl.enableVertexAttribArray(3);
    gl.vertexAttribPointer(3, 3, gl.FLOAT, false, 24, 12);
    gl.vertexAttribDivisor(3, 1);

    gl.bindVertexArray(null);
  }

  render() {
    const gl = this.gl;
    gl.useProgram(this.program);
    gl.bindVertexArray(this.vao);

    gl.uniform2f(this.uResolution, this.viewport.w, this.viewport.h);
    gl.uniform1f(this.uExposure, this.exposure);
    gl.uniform1f(this.uStarIntensity, this.starIntensity);
    gl.uniform1f(this.uTime, performance.now() * 0.001);
    gl.uniform1f(this.uTwinkleSpeed, this.twinkleSpeed);
    gl.uniform1f(this.uTwinkleAmount, this.twinkleAmount);
    // Interaction uniforms
    gl.uniform2f(this.uMousePx, this.mousePx.x, this.mousePx.y);
    gl.uniform1f(this.uForceRadiusPx, this.forceRadiusPx);
    gl.uniform1f(this.uForceStrengthPx, this.forceStrengthPx);
    gl.uniform2f(this.uShockCenterPx, this.shockCenterPx.x, this.shockCenterPx.y);
    gl.uniform1f(this.uShockStartTime, this.shockStartTime);
    gl.uniform1f(this.uShockSpeedPx, this.shockSpeedPx);
    gl.uniform1f(this.uShockAmpPx, this.shockAmpPx);
    gl.uniform1f(this.uShockWidthPx, this.shockWidthPx);
    gl.uniform1f(this.uShockDamp, this.shockDamp);

    gl.clearColor(0.0, 0.0, 0.0, 1.0);
    gl.clear(gl.COLOR_BUFFER_BIT);

    gl.drawElementsInstanced(gl.TRIANGLES, 6, gl.UNSIGNED_SHORT, 0, this.starCount);

    gl.bindVertexArray(null);
  }

  private createShader(type: number, src: string): WebGLShader {
    const gl = this.gl;
    const sh = gl.createShader(type)!;
    gl.shaderSource(sh, src);
    gl.compileShader(sh);
    if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
      const info = gl.getShaderInfoLog(sh);
      gl.deleteShader(sh);
      throw new Error('Shader compile failed: ' + info);
    }
    return sh;
  }
}
