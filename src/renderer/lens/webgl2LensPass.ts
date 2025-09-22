export class WebGL2LensPass {
  private gl: WebGL2RenderingContext;
  private program!: WebGLProgram;
  private vao!: WebGLVertexArrayObject;
  private uResolution!: WebGLUniformLocation;
  private uCenter!: WebGLUniformLocation;
  private uRadius!: WebGLUniformLocation;
  private uZoom!: WebGLUniformLocation;
  private uDispersion!: WebGLUniformLocation;
  private uStars!: WebGLUniformLocation;
  private uGalaxy!: WebGLUniformLocation;
  private uBloomStrength!: WebGLUniformLocation;
  private uBloomThreshold!: WebGLUniformLocation;
  private uBloomRadiusPx!: WebGLUniformLocation;
  private uStreakStrength!: WebGLUniformLocation;
  private uStreakLengthPx!: WebGLUniformLocation;
  private uStreakAngle!: WebGLUniformLocation;
  // Black hole uniforms
  private uBHEnabled!: WebGLUniformLocation;
  private uBHCenter!: WebGLUniformLocation;
  private uBHRadius!: WebGLUniformLocation;
  private uBHMass!: WebGLUniformLocation;
  private uBHSpin!: WebGLUniformLocation;

  private center = { x: 0.5, y: 0.5 };
  private radiusPx = 200;
  private zoom = 1.25;
  private dispersion = 0.35;
  private bloomStrength = 0.6; private bloomThreshold = 0.7; private bloomRadiusPx = 8.0;
  private streakStrength = 0.8; private streakLengthPx = 120.0; private streakAngleDeg = 0.0;
  // Black hole params mirrored into lens so BH appears through lens
  private bhEnabled = false;
  private bhCenter = { x: 0.5, y: 0.5 };
  private bhRadiusPx = 220.0;
  private bhMass = 1.0;
  private bhSpin = 0.7;

  constructor(gl: WebGL2RenderingContext) { this.gl = gl; this.init(); }

  setParams(radiusPx: number, zoom: number, dispersion: number) {
    this.radiusPx = radiusPx; this.zoom = zoom; this.dispersion = dispersion;
  }
  setCenter(cx: number, cy: number) { this.center.x = cx; this.center.y = cy; }
  setEffects(bloomStrength: number, bloomThreshold: number, bloomRadiusPx: number, streakStrength: number, streakLengthPx: number, streakAngleDeg: number) {
    this.bloomStrength = bloomStrength;
    this.bloomThreshold = bloomThreshold;
    this.bloomRadiusPx = bloomRadiusPx;
    this.streakStrength = streakStrength;
    this.streakLengthPx = streakLengthPx;
    this.streakAngleDeg = streakAngleDeg;
  }

  private init() {
    const gl = this.gl;
    const vs = `#version 300 es
    precision highp float;
    const vec2 POS[3] = vec2[3](vec2(-1.0,-3.0), vec2(-1.0,1.0), vec2(3.0,1.0));
    const vec2 UV[3] = vec2[3](vec2(0.0,2.0), vec2(0.0,0.0), vec2(2.0,0.0));
    out vec2 vUv; void main(){ vUv = UV[gl_VertexID]; gl_Position = vec4(POS[gl_VertexID],0.0,1.0);} `;

    const fs = `#version 300 es
    precision highp float;
    in vec2 vUv; out vec4 outColor;
    uniform vec2 uResolution; uniform vec2 uCenter; uniform float uRadius; uniform float uZoom; uniform float uDispersion;
    uniform sampler2D uStars; uniform sampler2D uGalaxy;
    uniform float uBloomStrength; uniform float uBloomThreshold; uniform float uBloomRadiusPx;
    uniform float uStreakStrength; uniform float uStreakLengthPx; uniform float uStreakAngle; // radians
    // Black hole uniforms
    uniform float uBHEnabled;
    uniform vec2 uBHCenter;
    uniform float uBHRadius;
    uniform float uBHMass;
    uniform float uBHSpin;

    vec2 warpUVByBH(vec2 uv){
      if(uBHEnabled < 0.5) return uv;
      vec2 res = max(uResolution, vec2(1.0));
      vec2 px = vec2(uv.x*res.x, uv.y*res.y);
      vec2 cpx = vec2(uBHCenter.x*res.x, uBHCenter.y*res.y);
      vec2 d = px - cpx; float r = length(d);
      if(r > uBHRadius) return uv;
      vec2 n = normalize(d);
      float rn = max(1e-3, r / max(uBHRadius, 1.0));
      float defl = uBHMass * 0.12 / rn;
      float skew = 1.0 + uBHSpin * 0.3 * n.y;
      defl *= skew;
      float c = cos(defl), s = sin(defl);
      vec2 dR = vec2(d.x * c - d.y * s, d.x * s + d.y * c);
      vec2 pxR = cpx + dR;
      return vec2(pxR.x / res.x, pxR.y / res.y);
    }

    vec3 sampleBG(vec2 uv){
      vec3 col;
      vec2 u = warpUVByBH(uv);
      vec3 cs = texture(uStars, u).rgb; vec3 cg = texture(uGalaxy, u).rgb; col = clamp(cs+cg, 0.0, 1.0);
      if (uBHEnabled > 0.5) {
        vec2 res = max(uResolution, vec2(1.0));
        vec2 px = vec2(uv.x*res.x, uv.y*res.y);
        vec2 cpx = vec2(uBHCenter.x*res.x, uBHCenter.y*res.y);
        float r = length(px - cpx);
        if (r <= uBHRadius) {
          // Inside event horizon: force solid black
          col = vec3(0.0);
        }
      }
      return col;
    }
    vec3 sampleStars(vec2 uv){ return texture(uStars, uv).rgb; }
    float luma(vec3 c){ return max(max(c.r, c.g), c.b); }

    vec3 applyBloom(vec2 uv){
      if(uBloomStrength <= 0.0001) return vec3(0.0);
      vec2 du = vec2(1.0)/max(uResolution, vec2(1.0));
      float rpx = max(1.0, uBloomRadiusPx);
      vec2 offs[8];
      offs[0] = vec2( 1.0, 0.0);
      offs[1] = vec2(-1.0, 0.0);
      offs[2] = vec2( 0.0, 1.0);
      offs[3] = vec2( 0.0,-1.0);
      offs[4] = vec2( 1.0, 1.0);
      offs[5] = vec2(-1.0, 1.0);
      offs[6] = vec2( 1.0,-1.0);
      offs[7] = vec2(-1.0,-1.0);
      vec3 acc = vec3(0.0); float wsum = 0.0;
      for(int i=0;i<8;i++){
        float w = (i<4)?1.0:0.7071; // diagonals slightly less
        vec3 s = sampleStars(uv + offs[i] * (rpx*du));
        float b = max(luma(s) - uBloomThreshold, 0.0);
        acc += s * b * w;
        wsum += w;
      }
      if(wsum>0.0) acc /= wsum;
      return acc * uBloomStrength;
    }

    vec3 applyStreaks(vec2 uv){
      if(uStreakStrength <= 0.0001) return vec3(0.0);
      vec2 du = vec2(1.0)/max(uResolution, vec2(1.0));
      float a = uStreakAngle;
      float angles[2];
      angles[0] = a + 0.0;         // primary axis
      angles[1] = a + 1.5707963;   // orthogonal axis (90°)
      vec3 acc = vec3(0.0); float wsum = 0.0;
      for(int k=0;k<2;k++){
        vec2 dir = vec2(cos(angles[k]), sin(angles[k]));
        for(int s=1;s<=8;s++){
          float t = float(s)/8.0;
          float w = (1.0 - t);
          vec2 off = dir * (t * uStreakLengthPx);
          vec3 c1 = sampleStars(uv + off*du);
          vec3 c2 = sampleStars(uv - off*du);
          float b1 = max(luma(c1) - uBloomThreshold, 0.0);
          float b2 = max(luma(c2) - uBloomThreshold, 0.0);
          acc += (c1*b1 + c2*b2) * w;
          wsum += 2.0*w;
        }
      }
      if(wsum>0.0) acc /= wsum;
      return acc * uStreakStrength;
    }

    void main(){
      vec2 px = vec2(vUv.x*uResolution.x, vUv.y*uResolution.y);
      vec2 cpx = vec2(uCenter.x*uResolution.x, uCenter.y*uResolution.y);
      vec2 d = px - cpx; float r = length(d); if(r > uRadius) discard;
      // If a BH is enabled, completely skip lens rendering inside the BH radius (with a small margin)
      if (uBHEnabled > 0.5) {
        vec2 res = max(uResolution, vec2(1.0));
        vec2 cpxBH = vec2(uBHCenter.x*res.x, uBHCenter.y*res.y);
        float rnBH = length(px - cpxBH) / max(uBHRadius, 1.0);
        float margin = 0.02; // small safety halo
        if (rnBH <= 1.0 + margin) { discard; }
      }
      vec2 n = normalize(d); float rn = r / max(uRadius, 1.0);
      float k1 = 0.05; float k2 = 0.02; 
      vec2 baseUv = vUv + (n * (k1*rn + k2*rn*rn)) / max(uResolution, vec2(1.0));
      vec2 zoomUv = (baseUv - uCenter) / max(uZoom, 1.0) + uCenter;
      float disp = uDispersion * 0.003;
      vec2 uvR = zoomUv + n*disp; vec2 uvB = zoomUv - n*disp;
      float cR = sampleBG(uvR).r; float cG = sampleBG(zoomUv).g; float cB = sampleBG(uvB).b; 
      vec3 col = vec3(cR,cG,cB);
      // Avoid bloom/streaks over BH horizon
      float bhMask = 1.0;
      if (uBHEnabled > 0.5) {
        vec2 res = max(uResolution, vec2(1.0));
        vec2 pxuv = vec2(vUv.x*res.x, vUv.y*res.y);
        vec2 cpxBH = vec2(uBHCenter.x*res.x, uBHCenter.y*res.y);
        float rnBH = length(pxuv - cpxBH) / max(uBHRadius, 1.0);
        // Smoothly suppress star-only effects near the BH horizon to avoid an outer star-only ring
        float margin = 0.06; // fade width in units of BH radius
        bhMask = smoothstep(1.0, 1.0 + margin, rnBH);
      }
      // add bloom and streaks from underlying bright sources
      col += applyBloom(zoomUv) * bhMask;
      col += applyStreaks(zoomUv) * bhMask;
      outColor = vec4(col, 1.0);
    }`;

    const vert = this.createShader(gl.VERTEX_SHADER, vs);
    const frag = this.createShader(gl.FRAGMENT_SHADER, fs);
    const prog = gl.createProgram()!; gl.attachShader(prog, vert); gl.attachShader(prog, frag); gl.linkProgram(prog);
    if(!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error('Lens link failed: '+gl.getProgramInfoLog(prog));
    gl.deleteShader(vert); gl.deleteShader(frag);
    this.program = prog;

    this.uResolution = gl.getUniformLocation(prog, 'uResolution')!;
    this.uCenter = gl.getUniformLocation(prog, 'uCenter')!;
    this.uRadius = gl.getUniformLocation(prog, 'uRadius')!;
    this.uZoom = gl.getUniformLocation(prog, 'uZoom')!;
    this.uDispersion = gl.getUniformLocation(prog, 'uDispersion')!;
    this.uStars = gl.getUniformLocation(prog, 'uStars')!;
    this.uGalaxy = gl.getUniformLocation(prog, 'uGalaxy')!;
    this.uBloomStrength = gl.getUniformLocation(prog, 'uBloomStrength')!;
    this.uBloomThreshold = gl.getUniformLocation(prog, 'uBloomThreshold')!;
    this.uBloomRadiusPx = gl.getUniformLocation(prog, 'uBloomRadiusPx')!;
    this.uStreakStrength = gl.getUniformLocation(prog, 'uStreakStrength')!;
    this.uStreakLengthPx = gl.getUniformLocation(prog, 'uStreakLengthPx')!;
    this.uStreakAngle = gl.getUniformLocation(prog, 'uStreakAngle')!;
    // BH uniforms
    this.uBHEnabled = gl.getUniformLocation(prog, 'uBHEnabled')!;
    this.uBHCenter = gl.getUniformLocation(prog, 'uBHCenter')!;
    this.uBHRadius = gl.getUniformLocation(prog, 'uBHRadius')!;
    this.uBHMass = gl.getUniformLocation(prog, 'uBHMass')!;
    this.uBHSpin = gl.getUniformLocation(prog, 'uBHSpin')!;

    this.vao = gl.createVertexArray()!;
  }

  render(starsTex: WebGLTexture, galaxyTex: WebGLTexture, w: number, h: number) {
    const gl = this.gl; gl.useProgram(this.program); gl.bindVertexArray(this.vao);
    gl.uniform2f(this.uResolution, w, h);
    gl.uniform2f(this.uCenter, this.center.x, this.center.y);
    gl.uniform1f(this.uRadius, this.radiusPx);
    gl.uniform1f(this.uZoom, this.zoom);
    gl.uniform1f(this.uDispersion, this.dispersion);
    gl.uniform1f(this.uBloomStrength, this.bloomStrength);
    gl.uniform1f(this.uBloomThreshold, this.bloomThreshold);
    gl.uniform1f(this.uBloomRadiusPx, this.bloomRadiusPx);
    gl.uniform1f(this.uStreakStrength, this.streakStrength);
    gl.uniform1f(this.uStreakLengthPx, this.streakLengthPx);
    gl.uniform1f(this.uStreakAngle, this.streakAngleDeg * 3.14159265/180.0);
    // BH uniforms
    gl.uniform1f(this.uBHEnabled, this.bhEnabled ? 1.0 : 0.0);
    gl.uniform2f(this.uBHCenter, this.bhCenter.x, this.bhCenter.y);
    gl.uniform1f(this.uBHRadius, this.bhRadiusPx);
    gl.uniform1f(this.uBHMass, this.bhMass);
    gl.uniform1f(this.uBHSpin, this.bhSpin);
    // Textures
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, starsTex); gl.uniform1i(this.uStars, 0);
    gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, galaxyTex); gl.uniform1i(this.uGalaxy, 1);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.bindVertexArray(null);
  }

  private createShader(type: number, src: string): WebGLShader { const gl = this.gl; const sh = gl.createShader(type)!; gl.shaderSource(sh, src); gl.compileShader(sh); if(!gl.getShaderParameter(sh, gl.COMPILE_STATUS)){ const info = gl.getShaderInfoLog(sh); gl.deleteShader(sh); throw new Error('Shader compile failed: '+info);} return sh; }

  // Ensure BH appears through lens by mirroring BH params
  setBH(enabled: boolean, cx: number, cy: number, radiusPx: number, mass: number, spin: number) {
    this.bhEnabled = !!enabled;
    this.bhCenter.x = cx; this.bhCenter.y = cy;
    this.bhRadiusPx = Math.max(1, radiusPx);
    this.bhMass = mass; this.bhSpin = spin;
  }
}
