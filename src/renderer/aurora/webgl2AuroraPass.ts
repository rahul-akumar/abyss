export class WebGL2AuroraPass {
  private gl: WebGL2RenderingContext;
  private program!: WebGLProgram;
  private vao!: WebGLVertexArrayObject;
  private uResolution!: WebGLUniformLocation;
  private uTime!: WebGLUniformLocation;
  private uAmplitude!: WebGLUniformLocation;
  private uBlend!: WebGLUniformLocation;
  private uStrength!: WebGLUniformLocation;
  private uStopCount!: WebGLUniformLocation;
  private uStops!: WebGLUniformLocation;
  private time = 0;
  private amplitude = 1.0;
  private blend = 0.5;
  private speed = 1.0;
  private strength = 1.0;
  private colorStops: [number, number, number][] = [
    [0.3215686275, 0.1529411765, 1.0], // #5227FF -> linear-ish approximated later if needed
    [0.4862745098, 1.0, 0.4039215686], // #7cff67
    [0.3215686275, 0.1529411765, 1.0],
  ];

  constructor(gl: WebGL2RenderingContext) {
    this.gl = gl;
    this.init();
  }

  setParams(amplitude: number, blend: number, speed: number) {
    this.amplitude = amplitude;
    this.blend = blend;
    this.speed = speed;
  }
  setStops(stops: [number, number, number][]) {
    const MAX = 8;
    const n = Math.max(2, Math.min(MAX, stops.length));
    this.colorStops = stops.slice(0, n) as any;
  }
  setStrength(s: number) { this.strength = Math.max(0, s); }
  setTime(t: number) { this.time = t; }

  private init() {
    const gl = this.gl;
    const vs = `#version 300 es
    precision highp float;
    const vec2 POS[3] = vec2[3](vec2(-1.0,-3.0), vec2(-1.0,1.0), vec2(3.0,1.0));
    const vec2 UV[3]  = vec2[3](vec2(0.0, 2.0), vec2(0.0,0.0), vec2(2.0,0.0));
    out vec2 vUv;
    void main(){ vUv = UV[gl_VertexID]; gl_Position = vec4(POS[gl_VertexID],0.0,1.0);} `;

    const fs = `#version 300 es
    precision highp float;
    in vec2 vUv; out vec4 outColor;
    uniform float uTime; uniform float uAmplitude; uniform vec2 uResolution; uniform float uBlend; uniform float uStrength;
    uniform int uStopCount; uniform vec3 uStops[8];

    vec3 permute(vec3 x) { return mod(((x * 34.0) + 1.0) * x, 289.0); }
    float snoise(vec2 v){
      const vec4 C = vec4(0.211324865405187, 0.366025403784439, -0.577350269189626, 0.024390243902439);
      vec2 i  = floor(v + dot(v, C.yy));
      vec2 x0 = v - i + dot(i, C.xx);
      vec2 i1 = (x0.x > x0.y) ? vec2(1.0, 0.0) : vec2(0.0, 1.0);
      vec4 x12 = x0.xyxy + C.xxzz; x12.xy -= i1; i = mod(i, 289.0);
      vec3 p = permute(permute(i.y + vec3(0.0, i1.y, 1.0)) + i.x + vec3(0.0, i1.x, 1.0));
      vec3 m = max(0.5 - vec3(dot(x0,x0), dot(x12.xy,x12.xy), dot(x12.zw,x12.zw)), 0.0);
      m = m*m; m = m*m;
      vec3 x = 2.0 * fract(p * C.www) - 1.0;
      vec3 h = abs(x) - 0.5; vec3 ox = floor(x + 0.5); vec3 a0 = x - ox;
      m *= 1.79284291400159 - 0.85373472095314 * (a0*a0 + h*h);
      vec3 g; g.x = a0.x*x0.x + h.x*x0.y; g.yz = a0.yz*x12.xz + h.yz*x12.yw;
      return 130.0 * dot(m, g);
    }

    vec3 rampEven(vec2 uvx){
      float n = float(uStopCount);
      float pos = clamp(uvx.x, 0.0, 1.0) * max(1.0, n - 1.0);
      int i = int(floor(pos));
      int i2 = min(i + 1, uStopCount - 1);
      float t = fract(pos);
      vec3 c0 = uStops[i];
      vec3 c1 = uStops[i2];
      return mix(c0, c1, t);
    }

    void main(){
      vec2 fragCoord = vUv * uResolution;
      vec2 uv = fragCoord / uResolution;
      uv.y = 1.0 - uv.y;
      vec3 rampColor = rampEven(uv);
      float height = snoise(vec2(uv.x * 2.0 + uTime * 0.1, uTime * 0.25)) * 0.5 * uAmplitude;
      height = exp(height);
      height = (uv.y * 2.0 - height + 0.2);
      float intensity = 0.6 * height;
      float midPoint = 0.20;
      float auroraAlpha = smoothstep(midPoint - uBlend * 0.5, midPoint + uBlend * 0.5, intensity);
      vec3 auroraColor = intensity * rampColor;
      outColor = vec4(auroraColor * auroraAlpha * uStrength, auroraAlpha * uStrength);
    }`;

    const vert = this.createShader(gl.VERTEX_SHADER, vs);
    const frag = this.createShader(gl.FRAGMENT_SHADER, fs);
    const prog = gl.createProgram()!;
    gl.attachShader(prog, vert); gl.attachShader(prog, frag); gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
      throw new Error('Aurora program link failed: ' + gl.getProgramInfoLog(prog));
    }
    gl.deleteShader(vert); gl.deleteShader(frag);
    this.program = prog;

    this.uResolution = gl.getUniformLocation(prog, 'uResolution')!;
    this.uTime = gl.getUniformLocation(prog, 'uTime')!;
    this.uAmplitude = gl.getUniformLocation(prog, 'uAmplitude')!;
    this.uBlend = gl.getUniformLocation(prog, 'uBlend')!;
    this.uStrength = gl.getUniformLocation(prog, 'uStrength')!;
    this.uStopCount = gl.getUniformLocation(prog, 'uStopCount')!;
    this.uStops = gl.getUniformLocation(prog, 'uStops[0]')!;

    this.vao = gl.createVertexArray()!;
  }

  render(w: number, h: number) {
    const gl = this.gl;
    gl.useProgram(this.program);
    gl.bindVertexArray(this.vao);

    gl.uniform2f(this.uResolution, w, h);
    gl.uniform1f(this.uTime, this.time * this.speed * 0.1);
    gl.uniform1f(this.uAmplitude, this.amplitude);
    gl.uniform1f(this.uBlend, this.blend);
    gl.uniform1f(this.uStrength, this.strength);
    // Flatten stops into fixed-size array of 8 vec3
    const MAX = 8;
    const flat = new Float32Array(MAX * 3);
    const n = Math.min(MAX, this.colorStops.length);
    for (let i = 0; i < n; i++) {
      flat[i*3+0] = this.colorStops[i][0];
      flat[i*3+1] = this.colorStops[i][1];
      flat[i*3+2] = this.colorStops[i][2];
    }
    // Duplicate last color for remaining entries to avoid undefined reads (optional)
    const last = n > 0 ? this.colorStops[n-1] : [0,0,0];
    for (let i = n; i < MAX; i++) {
      flat[i*3+0] = last[0];
      flat[i*3+1] = last[1];
      flat[i*3+2] = last[2];
    }
    gl.uniform1i(this.uStopCount, n);
    gl.uniform3fv(this.uStops, flat);

    // Enable premultiplied alpha blending
    const wasBlend = gl.isEnabled(gl.BLEND);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    gl.blendEquation(gl.FUNC_ADD);

    gl.drawArrays(gl.TRIANGLES, 0, 3);

    if (!wasBlend) gl.disable(gl.BLEND);
    gl.bindVertexArray(null);
  }

  private createShader(type: number, src: string): WebGLShader {
    const gl = this.gl; const sh = gl.createShader(type)!; gl.shaderSource(sh, src); gl.compileShader(sh);
    if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) { const info = gl.getShaderInfoLog(sh); gl.deleteShader(sh); throw new Error('Shader compile failed: ' + info); }
    return sh;
  }
}
