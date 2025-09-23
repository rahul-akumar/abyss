export class WebGL2BlackHolePass {
  private gl: WebGL2RenderingContext;
  private program!: WebGLProgram;
  private vao!: WebGLVertexArrayObject;
  private uResolution!: WebGLUniformLocation;
  private uCenter!: WebGLUniformLocation;
  private uRadius!: WebGLUniformLocation;
  private uMass!: WebGLUniformLocation;
  private uSpin!: WebGLUniformLocation;
  private uStars!: WebGLUniformLocation;
  private uGalaxyImp!: WebGLUniformLocation;
  private uGalaxyBand!: WebGLUniformLocation;
  private uOverlayOnly!: WebGLUniformLocation;
  private uBHStreakStrength!: WebGLUniformLocation;
  private uBHStreakLengthPx!: WebGLUniformLocation;
  private uTime!: WebGLUniformLocation;
  private uAccretionSpeed!: WebGLUniformLocation;

  private center = { x: 0.5, y: 0.5 };
  private radiusPx = 100;
  private mass = 1.0;
  private spin = 0.7;
  private overlayOnly = true;
  private bhStreakStrength = 0.8;
  private bhStreakLengthPx = 120;
  private time = 0;
  private accretionSpeed = 0.25;

  constructor(gl: WebGL2RenderingContext) { this.gl = gl; this.init(); }

  setParams(mass: number, spin: number) { this.mass = mass; this.spin = spin; }
  setOverlayOnly(flag: boolean) { this.overlayOnly = !!flag; }
  setCenter(cx: number, cy: number) { this.center.x = Math.max(0, Math.min(1, cx)); this.center.y = Math.max(0, Math.min(1, cy)); }
  setRadiusPx(r: number) { this.radiusPx = Math.max(10, r|0); }
  setStreaks(strength: number, lengthPx: number) { this.bhStreakStrength = Math.max(0, strength); this.bhStreakLengthPx = Math.max(0, lengthPx|0); }
  setTime(t: number) { this.time = t; }
  setAccretionSpeed(s: number) { this.accretionSpeed = Math.max(0, s); }

  render(starsTex: WebGLTexture, galaxyImpTex: WebGLTexture, galaxyBandTex: WebGLTexture, w: number, h: number) {
    const gl = this.gl;
    // Ensure the black disc truly occludes background even if previous passes enabled blending
    const wasBlend = gl.isEnabled(gl.BLEND);
    if (wasBlend) gl.disable(gl.BLEND);

    gl.useProgram(this.program);
    gl.bindVertexArray(this.vao);
    gl.uniform2f(this.uResolution, w, h);
    gl.uniform2f(this.uCenter, this.center.x, this.center.y);
    gl.uniform1f(this.uRadius, this.radiusPx);
    gl.uniform1f(this.uMass, this.mass);
    gl.uniform1f(this.uSpin, this.spin);
    gl.uniform1f(this.uOverlayOnly, this.overlayOnly ? 1.0 : 0.0);
    gl.uniform1f(this.uTime, this.time);
    gl.uniform1f(this.uAccretionSpeed, this.accretionSpeed);
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, starsTex); gl.uniform1i(this.uStars, 0);
    gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, galaxyImpTex); gl.uniform1i(this.uGalaxyImp, 1);
    gl.activeTexture(gl.TEXTURE2); gl.bindTexture(gl.TEXTURE_2D, galaxyBandTex); gl.uniform1i(this.uGalaxyBand, 2);
    gl.uniform1f(this.uBHStreakStrength, this.bhStreakStrength);
    gl.uniform1f(this.uBHStreakLengthPx, this.bhStreakLengthPx);
    gl.drawArrays(gl.TRIANGLES, 0, 3);

    if (wasBlend) gl.enable(gl.BLEND);
    gl.bindVertexArray(null);
  }

  private init() {
    const gl = this.gl;
    const vs = `#version 300 es\n    precision highp float;\n    const vec2 POS[3] = vec2[3](vec2(-1.0,-3.0), vec2(-1.0,1.0), vec2(3.0,1.0));\n    const vec2 UV[3] = vec2[3](vec2(0.0,2.0), vec2(0.0,0.0), vec2(2.0,0.0));\n    out vec2 vUv; void main(){ vUv = UV[gl_VertexID]; gl_Position = vec4(POS[gl_VertexID],0.0,1.0);} `;

const fs = `#version 300 es
    precision highp float;
    in vec2 vUv; out vec4 outColor;
    uniform vec2 uResolution; uniform vec2 uCenter; uniform float uRadius;
    uniform float uMass; uniform float uSpin;
    uniform sampler2D uStars; uniform sampler2D uGalaxyImp; uniform sampler2D uGalaxyBand;
    uniform float uOverlayOnly;
    uniform float uBHStreakStrength; uniform float uBHStreakLengthPx;
    uniform float uTime; uniform float uAccretionSpeed;
    vec3 sampleLensed(vec2 uv){ vec3 cs = texture(uStars, uv).rgb; vec3 ci = texture(uGalaxyImp, uv).rgb; return clamp(cs+ci, 0.0, 1.0);} 
    vec3 sampleLensedAtPx(vec2 px, vec2 cpx){
      vec2 d = px - cpx; float r = length(d);
      vec2 uv = vec2(px.x / uResolution.x, px.y / uResolution.y);
      if(r <= uRadius){
        vec2 n = normalize(d); float rn = max(1e-3, r / max(uRadius, 1.0));
        float defl = uMass * 0.12 / rn; float skew = 1.0 + uSpin * 0.3 * n.y; defl *= skew;
        float c = cos(defl), s = sin(defl); vec2 dR = vec2(d.x*c - d.y*s, d.x*s + d.y*c);
        vec2 pxR = cpx + dR; uv = vec2(pxR.x / uResolution.x, pxR.y / uResolution.y);
      }
      return sampleLensed(uv);
    }

    vec3 accretionEmission(float rn, float ang){
      float horizonR = 0.32;
      float rInner = horizonR + 0.04;
      float rOuter = 0.82;
      float inner = smoothstep(rInner - 0.02, rInner, rn);
      float outer = 1.0 - smoothstep(rOuter, rOuter + 0.02, rn);
      float band = clamp(inner * outer, 0.0, 1.0);
      if (band < 1e-4) return vec3(0.0);
      float omega = 0.5 + uSpin * 1.2;
      float a = ang + uTime * omega * uAccretionSpeed;
      float stripes = 0.6 + 0.4 * cos(6.0 * a + rn * 3.0);
      float fall = exp(-pow(max(0.0, rn - rInner) / 0.18, 1.2));
      float dop = 0.7 + 0.3 * cos(a);
      vec3 base = vec3(1.00, 0.92, 0.78);
      vec3 cold = vec3(0.75, 0.85, 1.00);
      vec3 warm = vec3(1.00, 0.70, 0.45);
      vec3 tint = mix(warm, cold, 0.5 - 0.5 * cos(a));
      vec3 col = base * stripes * fall * dop;
      col = mix(col, tint * stripes * fall, 0.35);
      return clamp(col * band, vec3(0.0), vec3(5.0));
    }

    void main(){
      vec2 px = vec2(vUv.x*uResolution.x, vUv.y*uResolution.y);
      vec2 cpx = vec2(uCenter.x*uResolution.x, uCenter.y*uResolution.y);
      vec2 d = px - cpx; float r = length(d);
      float rn = max(1e-3, r / max(uRadius, 1.0));
      float ang = atan(d.y, d.x);
      if (uOverlayOnly > 0.5) {
        // Overlay: event horizon (black) + spinning accretion band
        float horizonR = 0.32;
        if (rn <= horizonR) {
          outColor = vec4(0.0, 0.0, 0.0, 1.0);
          return;
        }
        vec3 disk = accretionEmission(rn, ang);
        if (max(disk.r, max(disk.g, disk.b)) < 1e-3) discard;
        outColor = vec4(clamp(disk, 0.0, 1.0), 1.0);
        return;
      }
      // Full-screen background with BH lensing inside radius, passthrough outside
      vec2 uvLens = vUv;
      if (r <= uRadius) {
        vec2 n = normalize(d);
        float defl = uMass * 0.12 / rn;
        float skew = 1.0 + uSpin * 0.3 * n.y;
        defl *= skew;
        float c = cos(defl), s = sin(defl);
        vec2 dR = vec2(d.x * c - d.y * s, d.x * s + d.y * c);
        vec2 pxR = cpx + dR;
        uvLens = vec2(pxR.x / uResolution.x, pxR.y / uResolution.y);
      }
      // Base lensed color
      vec3 baseCol = sampleLensed(uvLens);
      // Tangential streaks near photon ring
      vec3 col = baseCol;
      if(uBHStreakStrength > 0.0001 && uBHStreakLengthPx > 0.5){
        float ringPos = 0.5; float bw = 0.12; float ringBand = exp(-pow(rn - ringPos, 2.0) / (2.0*bw*bw));
        vec2 tanDir = normalize(vec2(-d.y, d.x)); int samples = 8; vec3 acc = vec3(0.0); float wsum = 0.0;
        for(int s=1; s<=samples; s++){ float t = float(s)/float(samples); float wgt = 1.0 - t; vec2 off = tanDir * (t * uBHStreakLengthPx);
          vec3 c1 = sampleLensedAtPx(px + off, cpx); vec3 c2 = sampleLensedAtPx(px - off, cpx); acc += (c1+c2) * wgt; wsum += 2.0*wgt; }
        if(wsum>0.0) acc /= wsum; col = mix(baseCol, acc, clamp(uBHStreakStrength * ringBand, 0.0, 1.0));
      }
      vec3 band = texture(uGalaxyBand, vUv).rgb;
      col = clamp(col + band, 0.0, 1.0);
      // Add spinning accretion disk emission
      vec3 diskCol = accretionEmission(rn, ang);
      col = clamp(col + diskCol, 0.0, 1.0);
      // Event horizon: black disk with crisp edge
      float horizon = step(0.32, rn);
      col = mix(vec3(0.0), col, horizon);
      outColor = vec4(col, 1.0);
    }`;

    const vert = this.createShader(gl.VERTEX_SHADER, vs);
    const frag = this.createShader(gl.FRAGMENT_SHADER, fs);
    const prog = gl.createProgram()!; gl.attachShader(prog, vert); gl.attachShader(prog, frag); gl.linkProgram(prog);
    if(!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error('BH link failed: '+gl.getProgramInfoLog(prog));
    gl.deleteShader(vert); gl.deleteShader(frag);
    this.program = prog;

    this.uResolution = gl.getUniformLocation(prog, 'uResolution')!;
    this.uCenter = gl.getUniformLocation(prog, 'uCenter')!;
    this.uRadius = gl.getUniformLocation(prog, 'uRadius')!;
    this.uMass = gl.getUniformLocation(prog, 'uMass')!;
    this.uSpin = gl.getUniformLocation(prog, 'uSpin')!;
    this.uStars = gl.getUniformLocation(prog, 'uStars')!;
    this.uGalaxyImp = gl.getUniformLocation(prog, 'uGalaxyImp')!;
    this.uGalaxyBand = gl.getUniformLocation(prog, 'uGalaxyBand')!;
    this.uOverlayOnly = gl.getUniformLocation(prog, 'uOverlayOnly')!;
    this.uBHStreakStrength = gl.getUniformLocation(prog, 'uBHStreakStrength')!;
    this.uBHStreakLengthPx = gl.getUniformLocation(prog, 'uBHStreakLengthPx')!;
    this.uTime = gl.getUniformLocation(prog, 'uTime')!;
    this.uAccretionSpeed = gl.getUniformLocation(prog, 'uAccretionSpeed')!;

    this.vao = gl.createVertexArray()!;
  }

  private createShader(type: number, src: string): WebGLShader { const gl = this.gl; const sh = gl.createShader(type)!; gl.shaderSource(sh, src); gl.compileShader(sh); if(!gl.getShaderParameter(sh, gl.COMPILE_STATUS)){ const info = gl.getShaderInfoLog(sh); gl.deleteShader(sh); throw new Error('Shader compile failed: '+info);} return sh; }
}
