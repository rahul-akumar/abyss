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

  private center = { x: 0.5, y: 0.5 };
  private radiusPx = 100;
  private mass = 1.0;
  private spin = 0.7;
  private overlayOnly = true;

  constructor(gl: WebGL2RenderingContext) { this.gl = gl; this.init(); }

  setParams(mass: number, spin: number) { this.mass = mass; this.spin = spin; }
  setOverlayOnly(flag: boolean) { this.overlayOnly = !!flag; }

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
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, starsTex); gl.uniform1i(this.uStars, 0);
    gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, galaxyImpTex); gl.uniform1i(this.uGalaxyImp, 1);
    gl.activeTexture(gl.TEXTURE2); gl.bindTexture(gl.TEXTURE_2D, galaxyBandTex); gl.uniform1i(this.uGalaxyBand, 2);
    gl.drawArrays(gl.TRIANGLES, 0, 3);

    if (wasBlend) gl.enable(gl.BLEND);
    gl.bindVertexArray(null);
  }

  private init() {
    const gl = this.gl;
    const vs = `#version 300 es\n    precision highp float;\n    const vec2 POS[3] = vec2[3](vec2(-1.0,-3.0), vec2(-1.0,1.0), vec2(3.0,1.0));\n    const vec2 UV[3] = vec2[3](vec2(0.0,2.0), vec2(0.0,0.0), vec2(2.0,0.0));\n    out vec2 vUv; void main(){ vUv = UV[gl_VertexID]; gl_Position = vec4(POS[gl_VertexID],0.0,1.0);} `;

const fs = `#version 300 es\n    precision highp float;\n    in vec2 vUv; out vec4 outColor;\n    uniform vec2 uResolution; uniform vec2 uCenter; uniform float uRadius;\n    uniform float uMass; uniform float uSpin;\n    uniform sampler2D uStars; uniform sampler2D uGalaxyImp; uniform sampler2D uGalaxyBand;\n    uniform float uOverlayOnly;\n    vec3 sampleLensed(vec2 uv){ vec3 cs = texture(uStars, uv).rgb; vec3 ci = texture(uGalaxyImp, uv).rgb; return clamp(cs+ci, 0.0, 1.0);} \\n    void main(){\n      vec2 px = vec2(vUv.x*uResolution.x, vUv.y*uResolution.y);\n      vec2 cpx = vec2(uCenter.x*uResolution.x, uCenter.y*uResolution.y);\n      vec2 d = px - cpx; float r = length(d);\n      float rn = max(1e-3, r / max(uRadius, 1.0));\n      if (uOverlayOnly > 0.5) {\n        // Overlay mode: only event horizon and a single accretion ring; no background or lensing\n        float horizonR = 0.32;\n        if (rn <= horizonR) {\n          outColor = vec4(0.0, 0.0, 0.0, 1.0);\n          return;\n        }\n        float ringPos = 0.5; float w = 0.03;\n        float ring = exp(-pow(rn - ringPos, 2.0) / (2.0*w*w));\n        if (ring <= 0.001) discard;\n        vec3 ringCol = vec3(1.0, 0.95, 0.85) * ring * 0.8;\n        outColor = vec4(ringCol, 1.0);\n        return;\n      }\n      // Full-screen background with BH lensing inside radius, passthrough outside\n      vec2 uvLens = vUv;\n      if (r <= uRadius) {\n        vec2 n = normalize(d);\n        float defl = uMass * 0.12 / rn;\n        float skew = 1.0 + uSpin * 0.3 * n.y;\n        defl *= skew;\n        float c = cos(defl), s = sin(defl);\n        vec2 dR = vec2(d.x * c - d.y * s, d.x * s + d.y * c);\n        vec2 pxR = cpx + dR;\n        uvLens = vec2(pxR.x / uResolution.x, pxR.y / uResolution.y);\n      }\n      vec3 col = sampleLensed(uvLens);\n      vec3 band = texture(uGalaxyBand, vUv).rgb;\n      col = clamp(col + band, 0.0, 1.0);\n      // Event horizon: black disk with crisp edge\n      float horizon = step(0.32, rn);\n      col = mix(vec3(0.0), col, horizon);\n      // Simple photon ring emission\n      float ringPos = 0.5; float w = 0.03;\n      float ring = exp(-pow(rn - ringPos, 2.0) / (2.0*w*w));\n      col += vec3(1.0, 0.95, 0.85) * ring * 0.8;\n      outColor = vec4(col, 1.0);\n    }`;

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

    this.vao = gl.createVertexArray()!;
  }

  private createShader(type: number, src: string): WebGLShader { const gl = this.gl; const sh = gl.createShader(type)!; gl.shaderSource(sh, src); gl.compileShader(sh); if(!gl.getShaderParameter(sh, gl.COMPILE_STATUS)){ const info = gl.getShaderInfoLog(sh); gl.deleteShader(sh); throw new Error('Shader compile failed: '+info);} return sh; }
}
