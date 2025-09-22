export class WebGL2CompositePass {
  private gl: WebGL2RenderingContext;
  private program!: WebGLProgram;
  private vao!: WebGLVertexArrayObject;
  private uStars!: WebGLUniformLocation;
  private uGalaxy!: WebGLUniformLocation;
  private uNebula!: WebGLUniformLocation;

  constructor(gl: WebGL2RenderingContext) {
    this.gl = gl;
    this.init();
  }

  private init() {
    const gl = this.gl;
    const vs = `#version 300 es
    precision highp float;
    const vec2 POS[4] = vec2[4](
      vec2(-1.0, -1.0),
      vec2( 1.0, -1.0),
      vec2( 1.0,  1.0),
      vec2(-1.0,  1.0)
    );
    const vec2 UV[4] = vec2[4](
      vec2(0.0, 0.0),
      vec2(1.0, 0.0),
      vec2(1.0, 1.0),
      vec2(0.0, 1.0)
    );
    out vec2 vUv;
    void main(){
      vUv = UV[gl_VertexID];
      gl_Position = vec4(POS[gl_VertexID], 0.0, 1.0);
    }`;

    const fs = `#version 300 es
    precision highp float;
    in vec2 vUv;
    out vec4 outColor;
    uniform sampler2D uStars;
    uniform sampler2D uGalaxy;
    uniform sampler2D uNebula;
    void main(){
      vec3 cs = texture(uStars, vUv).rgb;
      vec3 cg = texture(uGalaxy, vUv).rgb;
      vec4 cn = texture(uNebula, vUv);
      vec3 col = clamp(cs + cg, 0.0, 1.0);
      col = col * (1.0 - cn.a) + cn.rgb;
      outColor = vec4(col, 1.0);
    }`;

    const vert = this.createShader(gl.VERTEX_SHADER, vs);
    const frag = this.createShader(gl.FRAGMENT_SHADER, fs);
    const prog = gl.createProgram()!;
    gl.attachShader(prog, vert);
    gl.attachShader(prog, frag);
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
      throw new Error('Composite program link failed: ' + gl.getProgramInfoLog(prog));
    }
    gl.deleteShader(vert); gl.deleteShader(frag);
    this.program = prog;

    this.uStars = gl.getUniformLocation(prog, 'uStars')!;
    this.uGalaxy = gl.getUniformLocation(prog, 'uGalaxy')!;
    this.uNebula = gl.getUniformLocation(prog, 'uNebula')!;

    this.vao = gl.createVertexArray()!;
  }

  render(starTex: WebGLTexture, galaxyTex: WebGLTexture, nebulaTex: WebGLTexture) {
    const gl = this.gl;
    gl.useProgram(this.program);
    gl.bindVertexArray(this.vao);

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, starTex);
    gl.uniform1i(this.uStars, 0);

    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, galaxyTex);
    gl.uniform1i(this.uGalaxy, 1);

    gl.activeTexture(gl.TEXTURE2);
    gl.bindTexture(gl.TEXTURE_2D, nebulaTex);
    gl.uniform1i(this.uNebula, 2);

    gl.drawArrays(gl.TRIANGLE_FAN, 0, 4);

    gl.bindVertexArray(null);
    gl.bindTexture(gl.TEXTURE_2D, null);
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
