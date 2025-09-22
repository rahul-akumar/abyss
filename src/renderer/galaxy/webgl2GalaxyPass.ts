import { generateGalaxyImpostors } from './generateImpostors';

export class WebGL2GalaxyPass {
  private gl: WebGL2RenderingContext;
  private bandProgram!: WebGLProgram;
  private bandVao!: WebGLVertexArrayObject;
  private uTiltBand!: WebGLUniformLocation;
  private uSigmaBand!: WebGLUniformLocation;

  // Impostors
  private impProgram!: WebGLProgram;
  private impVao!: WebGLVertexArrayObject;
  private quadVbo!: WebGLBuffer;
  private quadIbo!: WebGLBuffer;
  private instanceBuf!: WebGLBuffer;
  private impostorCount = 0;

  private tiltRad = (12 * Math.PI) / 180;
  private sigma = 0.18;

  // Interaction state (sprites only)
  private time = 0.0;
  private mousePx = { x: -1e6, y: -1e6 };
  private forceRadiusPx = 0.0;
  private forceStrengthPx = 0.0;
  private shockCenterPx = { x: 0, y: 0 };
  private shockStartTime = -1.0; // seconds; <0 disables
  private shockSpeedPx = 1000.0;
  private shockAmpPx = 60.0;
  private shockWidthPx = 80.0;
  private shockDamp = 2.0;

  constructor(gl: WebGL2RenderingContext) {
    this.gl = gl;
    this.init();
  }

  setTiltDeg(deg: number) { this.tiltRad = (deg * Math.PI) / 180; }
  setSigma(v: number) { this.sigma = v; }
  // Interaction API (sprites only)
  setTime(t: number) { this.time = t; }
  setCursor(xPx: number, yPx: number) { this.mousePx.x = xPx; this.mousePx.y = yPx; }
  setCursorForce(radiusPx: number, strengthPx: number) { this.forceRadiusPx = Math.max(0, radiusPx); this.forceStrengthPx = strengthPx; }
  triggerShockwave(xPx: number, yPx: number, ampPx: number = 60, speedPx: number = 1000, widthPx: number = 80, damp: number = 2.0) {
    this.shockCenterPx.x = xPx; this.shockCenterPx.y = yPx;
    this.shockAmpPx = ampPx; this.shockSpeedPx = speedPx; this.shockWidthPx = widthPx; this.shockDamp = Math.max(0, damp);
    this.shockStartTime = this.time;
  }

  private init() {
    const gl = this.gl;
    // Band shaders
    const vsBand = `#version 300 es
    precision highp float;
    const vec2 POS[4] = vec2[4](
      vec2(-1.0, -1.0),
      vec2( 1.0, -1.0),
      vec2( 1.0,  1.0),
      vec2(-1.0,  1.0)
    );
    out vec2 vPos;
    void main() {
      vPos = POS[gl_VertexID];
      gl_Position = vec4(vPos, 0.0, 1.0);
    }`;

    const fsBand = `#version 300 es
    precision highp float;
    in vec2 vPos;
    out vec4 outColor;
    uniform float uTilt;
    uniform float uSigma;

    // Hash-based value noise (2D) and fBm
    float hash(vec2 p){
      return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
    }
    float noise(vec2 p){
      vec2 i = floor(p);
      vec2 f = fract(p);
      float a = hash(i);
      float b = hash(i + vec2(1.0, 0.0));
      float c = hash(i + vec2(0.0, 1.0));
      float d = hash(i + vec2(1.0, 1.0));
      vec2 u = f*f*(3.0 - 2.0*f);
      return mix(a, b, u.x) + (c - a) * u.y * (1.0 - u.x) + (d - b) * u.x * u.y;
    }
    float fbm(vec2 p){
      float t = 0.0;
      float amp = 0.5;
      for(int i=0;i<5;i++){
        t += noise(p) * amp;
        p *= 2.0;
        amp *= 0.5;
      }
      return t;
    }

    vec3 aces(vec3 x){
      const float a=2.51,b=0.03,c=2.43,d=0.59,e=0.14;
      return clamp((x*(a*x + b)) / (x*(c*x + d) + e), 0.0, 1.0);
    }

    void main(){
      float c = cos(uTilt);
      float s = sin(uTilt);
      vec2 pr = vec2(vPos.x * c - vPos.y * s, vPos.x * s + vPos.y * c);

      float d = abs(pr.y);
      float w = max(uSigma, 1e-4);

      // Edge breakup noise mostly along the band (x) with tighter freq across (y)
      float n = fbm(vec2(pr.x * 6.0, pr.y * 28.0));
      float wN = w * (1.0 + 0.28 * (n - 0.5)); // local width modulation (+/- ~14%)

      // Core band density with noisy edge breakup
      float denCore = exp(- (d*d) / (2.0*wN*wN));
      // Reduce density near edges using additional noise
      float u = d / wN;
      float edge = smoothstep(0.7, 1.6, u);
      float n2 = fbm(vec2(pr.x * 9.0, pr.y * 36.0));
      denCore *= (1.0 - 0.5 * edge * n2);

      // Soft outer diffusion halo (broad, faint)
      float wH = w * 2.8;
      float halo = exp(- (d*d) / (2.0*wH*wH)) * 0.18;

      // Color: warm core, cooler edges
      float t = clamp(1.0 - smoothstep(0.0, wN, d), 0.0, 1.0);
      vec3 yellow = vec3(1.0, 0.9, 0.6);
      vec3 blue = vec3(0.4, 0.6, 1.0);
      vec3 col = mix(blue, yellow, t) * (denCore * 0.38 + halo);

      col = aces(col);
      outColor = vec4(col, 1.0);
    }`;

    const vertBand = this.createShader(gl.VERTEX_SHADER, vsBand);
    const fragBand = this.createShader(gl.FRAGMENT_SHADER, fsBand);
    const progBand = gl.createProgram()!;
    gl.attachShader(progBand, vertBand);
    gl.attachShader(progBand, fragBand);
    gl.linkProgram(progBand);
    if (!gl.getProgramParameter(progBand, gl.LINK_STATUS)) { throw new Error('Galaxy band link failed: ' + gl.getProgramInfoLog(progBand)); }
    gl.deleteShader(vertBand); gl.deleteShader(fragBand);
    this.bandProgram = progBand;

    this.uTiltBand = gl.getUniformLocation(progBand, 'uTilt')!;
    this.uSigmaBand = gl.getUniformLocation(progBand, 'uSigma')!;

    this.bandVao = gl.createVertexArray()!;

    // Impostor shaders
    const vsImp = `#version 300 es
    precision highp float;
    layout(location=0) in vec2 aCorner; // per-vertex
    layout(location=1) in vec2 aCenter; // per-instance (band frame)
    layout(location=2) in float aSize;  // px
    layout(location=3) in float aAngle; // rad
    layout(location=4) in float aAxis;  // 0..1
    layout(location=5) in float aBias;  // 0..1
    layout(location=6) in float aBright;// 0..1

    uniform float uTilt;
    uniform vec2 uResolution;

    // Interactions (sprites only)
    uniform vec2 uMousePx;            // px
    uniform float uForceRadiusPx;     // px
    uniform float uForceStrengthPx;   // px (sign: repel/attract)
    uniform vec2 uShockCenterPx;      // px
    uniform float uShockStartTime;    // seconds; <0 disables
    uniform float uShockSpeedPx;      // px/s
    uniform float uShockAmpPx;        // px
    uniform float uShockWidthPx;      // px
    uniform float uShockDamp;         // 1/s
    uniform float uTime;              // seconds

    out vec2 vCorner;
    out float vAngle;
    out float vAxis;
    out float vBias;
    out float vBright;
    out vec2 vPx2Ndc;

    void main(){
      vec2 px2ndc = vec2(2.0 / max(uResolution.x, 1.0), 2.0 / max(uResolution.y, 1.0));
      float ct = cos(uTilt); float st = sin(uTilt);
      // Inverse rotation (−tilt) so impostor band aligns with galaxy band tilt
      vec2 p = vec2(aCenter.x * ct + aCenter.y * st, -aCenter.x * st + aCenter.y * ct);

      // Convert center to pixel space for interactions (y-down)
      vec2 uv = p * 0.5 + 0.5;
      vec2 centerPx = vec2(uv.x * uResolution.x, (1.0 - uv.y) * uResolution.y);

      // Cursor force displacement (in px)
      vec2 dispPx = vec2(0.0);
      if (uForceRadiusPx > 0.0 && uForceStrengthPx != 0.0) {
        vec2 d = centerPx - uMousePx;
        float r = length(d);
        if (r < uForceRadiusPx && r > 1e-3) {
          float fall = 1.0 - (r / uForceRadiusPx);
          fall *= fall; // quadratic falloff
          vec2 dir = d / r;
          dispPx += dir * (uForceStrengthPx * fall);
        }
      }

      // Shockwave displacement (in px)
      if (uShockStartTime >= 0.0) {
        float t = max(0.0, uTime - uShockStartTime);
        vec2 d2 = centerPx - uShockCenterPx;
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

      // Rotate corner by local angle for quad placement
      float ca = cos(aAngle); float sa = sin(aAngle);
      vec2 off = aCorner * aSize * px2ndc;
      vec2 offR = vec2(off.x * ca - off.y * sa, off.x * sa + off.y * ca);

      // Apply pixel displacement as NDC offset (flip Y)
      vec2 ndc = p + vec2(dispPx.x * px2ndc.x, -dispPx.y * px2ndc.y);
      gl_Position = vec4(ndc + offR, 0.0, 1.0);

      vCorner = aCorner;
      vAngle = aAngle; vAxis = aAxis; vBias = aBias; vBright = aBright;
      vPx2Ndc = px2ndc * aSize;
    }`;

    const fsImp = `#version 300 es
    precision highp float;
    in vec2 vCorner; in float vAngle; in float vAxis; in float vBias; in float vBright; in vec2 vPx2Ndc;
    out vec4 outColor;

    vec3 aces(vec3 x){
      const float a=2.51,b=0.03,c=2.43,d=0.59,e=0.14;
      return clamp((x*(a*x + b)) / (x*(c*x + d) + e), 0.0, 1.0);
    }

    void main(){
      // Elliptical Gaussian in quad-local space for soft edges
      float ca = cos(vAngle), sa = sin(vAngle);
      vec2 vc = vCorner; // [-0.5, 0.5]
      vec2 vcr = vec2(vc.x * ca - vc.y * sa, vc.x * sa + vc.y * ca);
      float q = max(vAxis, 0.01);
      float rr = length(vec2(vcr.x / 0.5, (vcr.y / q) / 0.5));
      float fall = exp(-4.5 * rr * rr);
      vec3 yellow = vec3(1.0, 0.9, 0.6);
      vec3 blue = vec3(0.45, 0.62, 1.0);
      vec3 col = mix(blue, yellow, clamp(vBias, 0.0, 1.0)) * (vBright * fall);
      col = aces(col);
      float alpha = smoothstep(1.0, 0.75, rr) * fall;
      outColor = vec4(col, alpha);
    }`;

    const vertImp = this.createShader(gl.VERTEX_SHADER, vsImp);
    const fragImp = this.createShader(gl.FRAGMENT_SHADER, fsImp);
    const progImp = gl.createProgram()!;
    gl.attachShader(progImp, vertImp);
    gl.attachShader(progImp, fragImp);
    gl.linkProgram(progImp);
    if (!gl.getProgramParameter(progImp, gl.LINK_STATUS)) { throw new Error('Galaxy impostor link failed: ' + gl.getProgramInfoLog(progImp)); }
    gl.deleteShader(vertImp); gl.deleteShader(fragImp);
    this.impProgram = progImp;

    // Uniforms for impostor shader
    const uTiltImp = gl.getUniformLocation(progImp, 'uTilt')!;
    const uResolutionImp = gl.getUniformLocation(progImp, 'uResolution')!;
    const uMousePx = gl.getUniformLocation(progImp, 'uMousePx')!;
    const uForceRadiusPx = gl.getUniformLocation(progImp, 'uForceRadiusPx')!;
    const uForceStrengthPx = gl.getUniformLocation(progImp, 'uForceStrengthPx')!;
    const uShockCenterPx = gl.getUniformLocation(progImp, 'uShockCenterPx')!;
    const uShockStartTime = gl.getUniformLocation(progImp, 'uShockStartTime')!;
    const uShockSpeedPx = gl.getUniformLocation(progImp, 'uShockSpeedPx')!;
    const uShockAmpPx = gl.getUniformLocation(progImp, 'uShockAmpPx')!;
    const uShockWidthPx = gl.getUniformLocation(progImp, 'uShockWidthPx')!;
    const uShockDamp = gl.getUniformLocation(progImp, 'uShockDamp')!;
    const uTime = gl.getUniformLocation(progImp, 'uTime')!;

    // Buffers and VAO for impostors
    const quad = new Float32Array([ -0.5,-0.5, 0.5,-0.5, 0.5,0.5, -0.5,0.5 ]);
    const idx = new Uint16Array([0,1,2, 0,2,3]);
    this.quadVbo = gl.createBuffer()!; gl.bindBuffer(gl.ARRAY_BUFFER, this.quadVbo); gl.bufferData(gl.ARRAY_BUFFER, quad, gl.STATIC_DRAW);
    this.quadIbo = gl.createBuffer()!; gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.quadIbo); gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, idx, gl.STATIC_DRAW);

    const imp = generateGalaxyImpostors({ count: 180, uRange: [-0.95, 0.95], vRange: [-0.95, 0.95], sizePxRange: [12, 42], seed: 9001 });
    this.impostorCount = Math.floor(imp.length / 7);
    this.instanceBuf = gl.createBuffer()!; gl.bindBuffer(gl.ARRAY_BUFFER, this.instanceBuf); gl.bufferData(gl.ARRAY_BUFFER, imp, gl.STATIC_DRAW);

    this.impVao = gl.createVertexArray()!;
    gl.bindVertexArray(this.impVao);
    // Vertex corner
    gl.bindBuffer(gl.ARRAY_BUFFER, this.quadVbo);
    gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 8, 0);
    // Index
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.quadIbo);
    // Instance buffer: center(2), size(1), angle(1), axis(1), bias(1), bright(1) = 7 floats stride 28
    gl.bindBuffer(gl.ARRAY_BUFFER, this.instanceBuf);
    gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 2, gl.FLOAT, false, 28, 0); gl.vertexAttribDivisor(1, 1);
    gl.enableVertexAttribArray(2); gl.vertexAttribPointer(2, 1, gl.FLOAT, false, 28, 8); gl.vertexAttribDivisor(2, 1);
    gl.enableVertexAttribArray(3); gl.vertexAttribPointer(3, 1, gl.FLOAT, false, 28, 12); gl.vertexAttribDivisor(3, 1);
    gl.enableVertexAttribArray(4); gl.vertexAttribPointer(4, 1, gl.FLOAT, false, 28, 16); gl.vertexAttribDivisor(4, 1);
    gl.enableVertexAttribArray(5); gl.vertexAttribPointer(5, 1, gl.FLOAT, false, 28, 20); gl.vertexAttribDivisor(5, 1);
    gl.enableVertexAttribArray(6); gl.vertexAttribPointer(6, 1, gl.FLOAT, false, 28, 24); gl.vertexAttribDivisor(6, 1);
    gl.bindVertexArray(null);

    // Store uniform locations for later use
    this._impUniforms = { uTiltImp, uResolutionImp, uMousePx, uForceRadiusPx, uForceStrengthPx, uShockCenterPx, uShockStartTime, uShockSpeedPx, uShockAmpPx, uShockWidthPx, uShockDamp, uTime } as any;
  }

  private _impUniforms: { uTiltImp: WebGLUniformLocation; uResolutionImp: WebGLUniformLocation; uMousePx: WebGLUniformLocation; uForceRadiusPx: WebGLUniformLocation; uForceStrengthPx: WebGLUniformLocation; uShockCenterPx: WebGLUniformLocation; uShockStartTime: WebGLUniformLocation; uShockSpeedPx: WebGLUniformLocation; uShockAmpPx: WebGLUniformLocation; uShockWidthPx: WebGLUniformLocation; uShockDamp: WebGLUniformLocation; uTime: WebGLUniformLocation } | undefined;

  // New split render API to match engine expectations
  renderBand() {
    const gl = this.gl;
    gl.useProgram(this.bandProgram);
    gl.bindVertexArray(this.bandVao);
    gl.uniform1f(this.uTiltBand, this.tiltRad);
    gl.uniform1f(this.uSigmaBand, this.sigma);
    gl.drawArrays(gl.TRIANGLE_FAN, 0, 4);
    gl.bindVertexArray(null);
  }
  renderImpostors() {
    const gl = this.gl;
    if (this.impVao && this.impProgram && this._impUniforms) {
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.ONE, gl.ONE);
      gl.useProgram(this.impProgram);
      gl.bindVertexArray(this.impVao);
      gl.uniform1f(this._impUniforms.uTiltImp, this.tiltRad);
      gl.uniform2f(this._impUniforms.uResolutionImp, gl.drawingBufferWidth, gl.drawingBufferHeight);
      // Interactions
      gl.uniform2f(this._impUniforms.uMousePx, this.mousePx.x, this.mousePx.y);
      gl.uniform1f(this._impUniforms.uForceRadiusPx, this.forceRadiusPx);
      gl.uniform1f(this._impUniforms.uForceStrengthPx, this.forceStrengthPx);
      gl.uniform2f(this._impUniforms.uShockCenterPx, this.shockCenterPx.x, this.shockCenterPx.y);
      gl.uniform1f(this._impUniforms.uShockStartTime, this.shockStartTime);
      gl.uniform1f(this._impUniforms.uShockSpeedPx, this.shockSpeedPx);
      gl.uniform1f(this._impUniforms.uShockAmpPx, this.shockAmpPx);
      gl.uniform1f(this._impUniforms.uShockWidthPx, this.shockWidthPx);
      gl.uniform1f(this._impUniforms.uShockDamp, this.shockDamp);
      gl.uniform1f(this._impUniforms.uTime, this.time);

      gl.drawElementsInstanced(gl.TRIANGLES, 6, gl.UNSIGNED_SHORT, 0, this.impostorCount);
      gl.bindVertexArray(null);
      gl.disable(gl.BLEND);
    }
  }

  // Legacy combined renderer (kept for convenience)
  render() {
    this.renderBand();
    this.renderImpostors();
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
