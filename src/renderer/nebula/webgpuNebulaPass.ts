export class WebGPUNebulaPass {
  private device: GPUDevice;
  private format: GPUTextureFormat;
  private pipeline!: GPURenderPipeline;
  private bindGroupLayout!: GPUBindGroupLayout;
  private bindGroup!: GPUBindGroup;
  private uniformBuf!: GPUBuffer;
  private viewport = { w: 1, h: 1 };
  private time = 0;
  private density = 0.5;
  private g = 0.2; // anisotropy
  private vibrancy = 1.0;
  private flowSpeed = 0.38;
  private flowAmp = 0.14;
  private swirl = 1.6;
  private driftX = 0.03;
  private driftY = 0.0;
  private warpSpeed = 0.12;
  private noiseScaleX = 0.23; private noiseScaleY = 0.17; private noiseScaleZ = 0.26;
  private samp3D!: GPUSampler;
  private viewDensity3D?: GPUTextureView;
  private viewWarp3D?: GPUTextureView;

  constructor(device: GPUDevice, format: GPUTextureFormat) {
    this.device = device;
    this.format = format;
    this.init();
  }

  setViewport(w: number, h: number) { this.viewport.w = w; this.viewport.h = h; this.updateUniforms(); }
  setTime(t: number) { this.time = t; this.updateUniforms(); }
  setParams(density: number, g: number) { this.density = density; this.g = g; this.updateUniforms(); }
  setVibrancy(v: number) { this.vibrancy = Math.max(0, Math.min(1, v)); this.updateUniforms(); }
  setFlowParams(flowSpeed: number, flowAmp: number, swirl: number, driftX: number, driftY: number, warpSpeed: number) {
    this.flowSpeed = flowSpeed; this.flowAmp = flowAmp; this.swirl = swirl; this.driftX = driftX; this.driftY = driftY; this.warpSpeed = warpSpeed; this.updateUniforms();
  }
  setNoiseScale(sx: number, sy: number, sz: number) { this.noiseScaleX = sx; this.noiseScaleY = sy; this.noiseScaleZ = sz; this.updateUniforms(); }

  private init() {
    // 80 bytes to safely hold our uniforms with alignment headroom
    this.uniformBuf = this.device.createBuffer({ size: 80, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
    const shader = this.device.createShaderModule({ code: this.wgsl() });
    this.samp3D = this.device.createSampler({ magFilter: 'linear', minFilter: 'linear', addressModeU: 'repeat', addressModeV: 'repeat', addressModeW: 'repeat' });
    this.bindGroupLayout = this.device.createBindGroupLayout({ entries: [
      { binding: 0, visibility: GPUShaderStage.FRAGMENT | GPUShaderStage.VERTEX, buffer: {} },
      { binding: 1, visibility: GPUShaderStage.FRAGMENT, sampler: {} },
      { binding: 2, visibility: GPUShaderStage.FRAGMENT, texture: { viewDimension: '3d' } },
      { binding: 3, visibility: GPUShaderStage.FRAGMENT, texture: { viewDimension: '3d' } },
    ] });
    const layout = this.device.createPipelineLayout({ bindGroupLayouts: [this.bindGroupLayout] });
    this.pipeline = this.device.createRenderPipeline({
      layout,
      vertex: { module: shader, entryPoint: 'vs' },
      fragment: { module: shader, entryPoint: 'fs', targets: [{ format: this.format, blend: { color: { srcFactor: 'one', dstFactor: 'one-minus-src-alpha', operation: 'add' }, alpha: { srcFactor: 'one', dstFactor: 'one-minus-src-alpha', operation: 'add' } } }] },
      primitive: { topology: 'triangle-list', cullMode: 'none' }
    });
    // temporary 1x1x1 placeholders until setVolumes is called
    const placeholder = this.device.createTexture({ size: { width:1, height:1, depthOrArrayLayers:1 }, dimension: '3d', format: 'rgba8unorm', usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST });
    this.viewDensity3D = placeholder.createView({ dimension: '3d' });
    this.viewWarp3D = placeholder.createView({ dimension: '3d' });
    this.bindGroup = this.device.createBindGroup({ layout: this.bindGroupLayout, entries: [
      { binding: 0, resource: { buffer: this.uniformBuf } },
      { binding: 1, resource: this.samp3D },
      { binding: 2, resource: this.viewDensity3D },
      { binding: 3, resource: this.viewWarp3D },
    ] });
    this.updateUniforms();
  }

  render(encoder: GPUCommandEncoder, view: GPUTextureView) {
    const pass = encoder.beginRenderPass({ colorAttachments: [{ view, loadOp: 'clear', storeOp: 'store', clearValue: { r: 0, g: 0, b: 0, a: 0 } }] });
    pass.setPipeline(this.pipeline);
    pass.setBindGroup(0, this.bindGroup);
    pass.draw(3, 1, 0, 0);
    pass.end();
  }
  setVolumes(viewDensity: GPUTextureView, viewWarp: GPUTextureView) {
    this.viewDensity3D = viewDensity; this.viewWarp3D = viewWarp;
    // Rebuild bind group with real textures
    this.bindGroup = this.device.createBindGroup({ layout: this.bindGroupLayout, entries: [
      { binding: 0, resource: { buffer: this.uniformBuf } },
      { binding: 1, resource: this.samp3D },
      { binding: 2, resource: this.viewDensity3D },
      { binding: 3, resource: this.viewWarp3D },
    ] });
  }

  private updateUniforms() {
    const data = new Float32Array([
      this.viewport.w, this.viewport.h, this.time, this.density,
      this.g, this.vibrancy, this.flowSpeed, this.flowAmp,
      this.swirl, this.driftX, this.driftY, this.warpSpeed,
      // noiseScale xyz + padding
      this.noiseScaleX, this.noiseScaleY, this.noiseScaleZ, 0,
    ]);
    this.device.queue.writeBuffer(this.uniformBuf, 0, data);
  }

  private wgsl(): string {
    return /* wgsl */`
struct Uniforms {
  resolution: vec2<f32>, time: f32, density: f32,
  g: f32, vibrancy: f32, flowSpeed: f32, flowAmp: f32,
  swirl: f32, drift: vec2<f32>, warpSpeed: f32, _pad0: f32,
  noiseScale: vec3<f32>, _pad1: f32,
};
@group(0) @binding(0) var<uniform> U: Uniforms;
@group(0) @binding(1) var samp3d: sampler;
@group(0) @binding(2) var texDensity: texture_3d<f32>;
@group(0) @binding(3) var texWarp: texture_3d<f32>;

struct VSOut { @builtin(position) Position: vec4<f32>, @location(0) vUv: vec2<f32>, };

@vertex fn vs(@builtin(vertex_index) vi: u32) -> VSOut {
  var pos = array<vec2<f32>, 3>(vec2<f32>(-1.0, -3.0), vec2<f32>(-1.0, 1.0), vec2<f32>(3.0, 1.0));
  var uv = array<vec2<f32>, 3>(vec2<f32>(0.0, 2.0), vec2<f32>(0.0, 0.0), vec2<f32>(2.0, 0.0));
  var out: VSOut;
  out.Position = vec4<f32>(pos[vi], 0.0, 1.0);
  out.vUv = uv[vi];
  return out;
}

fn rand(c: vec2<f32>) -> f32 {
  let h = sin(dot(c, vec2<f32>(12.9898, 78.233))) * 43758.5453;
  return fract(h);
}

fn hueShiftRGB(col: vec3<f32>, deg: f32) -> vec3<f32> {
  let rad = deg * 0.017453292519943295; // radians
  let cosh = cos(rad);
  let sinh = sin(rad);
  let rgb2yiq = mat3x3<f32>(
    0.299, 0.587, 0.114,
    0.596, -0.274, -0.322,
    0.211, -0.523, 0.312);
  let yiq2rgb = mat3x3<f32>(
    1.0, 0.956, 0.621,
    1.0, -0.272, -0.647,
    1.0, -1.106, 1.703);
  let yiq = rgb2yiq * col;
  let yiqShift = vec3<f32>(yiq.x, yiq.y * cosh - yiq.z * sinh, yiq.y * sinh + yiq.z * cosh);
  return clamp(yiq2rgb * yiqShift, vec3<f32>(0.0), vec3<f32>(1.0));
}

fn sigmoid(x: vec4<f32>) -> vec4<f32> { return 1.0 / (1.0 + exp(-x)); }

// Compact CPPN port: preserves the reference look without changing bindings
fn cppn_fn(coordinate: vec2<f32>, in0: f32, in1: f32, in2: f32) -> vec4<f32> {
  var buf: array<vec4<f32>, 8>;
  buf[6] = vec4<f32>(coordinate.x, coordinate.y, 0.3948333106474662 + in0, 0.36 + in1);
  buf[7] = vec4<f32>(0.14 + in2, sqrt(coordinate.x*coordinate.x + coordinate.y*coordinate.y), 0.0, 0.0);
  buf[0] = mat4x4<f32>(vec4<f32>(6.5404263,-3.6126034,0.7590882,-1.13613),vec4<f32>(2.4582713,3.1660357,1.2219609,0.06276096),vec4<f32>(-5.478085,-6.159632,1.8701609,-4.7742867),vec4<f32>(6.039214,-5.542865,-0.90925294,3.251348))*buf[6]
        + mat4x4<f32>(vec4<f32>(0.8473259,-5.722911,3.975766,1.6522468),vec4<f32>(-0.24321538,0.5839259,-1.7661959,-5.350116),vec4<f32>(0.0,0.0,0.0,0.0),vec4<f32>(0.0,0.0,0.0,0.0))*buf[7]
        + vec4<f32>(0.21808943,1.1243913,-1.7969975,5.0294676);
  buf[1] = mat4x4<f32>(vec4<f32>(-3.3522482,-6.0612736,0.55641043,-4.4719114),vec4<f32>(0.8631464,1.7432913,5.643898,1.6106541),vec4<f32>(2.4941394,-3.5012043,1.7184316,6.357333),vec4<f32>(3.310376,8.209261,1.1355612,-1.165539))*buf[6]
        + mat4x4<f32>(vec4<f32>(5.24046,-13.034365,0.009859298,15.870829),vec4<f32>(2.987511,3.129433,-0.89023495,-1.6822904),vec4<f32>(0.0,0.0,0.0,0.0),vec4<f32>(0.0,0.0,0.0,0.0))*buf[7]
        + vec4<f32>(-5.9457836,-6.573602,-0.8812491,1.5436668);
  buf[0] = sigmoid(buf[0]); buf[1] = sigmoid(buf[1]);
  buf[2] = mat4x4<f32>(vec4<f32>(-15.219568,8.095543,-2.429353,-1.9381982),vec4<f32>(-5.951362,4.3115187,2.6393783,1.274315),vec4<f32>(-7.3145227,6.7297835,5.2473326,5.9411426),vec4<f32>(5.0796127,8.979051,-1.7278991,-1.158976))*buf[6]
        + mat4x4<f32>(vec4<f32>(-11.967154,-11.608155,6.1486754,11.237008),vec4<f32>(2.124141,-6.263192,-1.7050359,-0.7021966),vec4<f32>(0.0,0.0,0.0,0.0),vec4<f32>(0.0,0.0,0.0,0.0))*buf[7]
        + vec4<f32>(-4.17164,-3.2281182,-4.576417,-3.6401186);
  buf[3] = mat4x4<f32>(vec4<f32>(3.1832156,-13.738922,1.879223,3.233465),vec4<f32>(0.64300746,12.768129,1.9141049,0.50990224),vec4<f32>(-0.049295485,4.4807224,1.4733979,1.801449),vec4<f32>(5.0039253,13.000481,3.3991797,-4.5561905))*buf[6]
        + mat4x4<f32>(vec4<f32>(-0.1285731,7.720628,-3.1425676,4.742367),vec4<f32>(0.6393625,3.714393,-0.8108378,-0.39174938),vec4<f32>(0.0,0.0,0.0,0.0),vec4<f32>(0.0,0.0,0.0,0.0))*buf[7]
        + vec4<f32>(-1.1811101,-21.621881,0.7851888,1.2329718);
  buf[2] = sigmoid(buf[2]); buf[3] = sigmoid(buf[3]);
  buf[4] = mat4x4<f32>(vec4<f32>(5.214916,-7.183024,2.7228765,2.6592617),vec4<f32>(-5.601878,-25.3591,4.067988,0.4602802),vec4<f32>(-10.57759,24.286327,21.102104,37.546658),vec4<f32>(4.3024497,-1.9625226,2.3458803,-1.372816))*buf[0]
        + mat4x4<f32>(vec4<f32>(-17.6526,-10.507558,2.2587414,12.462782),vec4<f32>(6.265566,-502.75443,-12.642513,0.9112289),vec4<f32>(-10.983244,20.741234,-9.701768,-0.7635988),vec4<f32>(5.383626,1.4819539,-4.1911616,-4.8444734))*buf[1]
        + mat4x4<f32>(vec4<f32>(12.785233,-16.345072,-0.39901125,1.7955981),vec4<f32>(-30.48365,-1.8345358,1.4542528,-1.1118771),vec4<f32>(19.872723,-7.337935,-42.941723,-98.52709),vec4<f32>(8.337645,-2.7312303,-2.2927687,-36.142323))*buf[2]
        + mat4x4<f32>(vec4<f32>(-16.298317,3.5471997,-0.44300047,-9.444417),vec4<f32>(57.5077,-35.609753,16.163465,-4.1534753),vec4<f32>(-0.07470326,-3.8656476,-7.0901804,3.1523974),vec4<f32>(-12.559385,-7.077619,1.490437,-0.8211543))*buf[3]
        + vec4<f32>(-7.67914,15.927437,1.3207729,-1.6686112);
  buf[5] = mat4x4<f32>(vec4<f32>(-1.4109162,-0.372762,-3.770383,-21.367174),vec4<f32>(-6.2103205,-9.35908,0.92529047,8.82561),vec4<f32>(11.460242,-22.348068,13.625772,-18.693201),vec4<f32>(-0.3429052,-3.9905605,-2.4626114,-0.45033523))*buf[0]
        + mat4x4<f32>(vec4<f32>(7.3481627,-4.3661838,-6.3037653,-3.868115),vec4<f32>(1.5462853,6.5488915,1.9701879,-0.58291394),vec4<f32>(6.5858274,-2.2180402,3.7127688,-1.3730392),vec4<f32>(-5.7973905,10.134961,-2.3395722,-5.965605))*buf[1]
        + mat4x4<f32>(vec4<f32>(-2.5132585,-6.6685553,-1.4029363,-0.16285264),vec4<f32>(-0.37908727,0.53738135,4.389061,-1.3024765),vec4<f32>(-0.70647055,2.0111287,-5.1659346,-3.728635),vec4<f32>(-13.562562,10.487719,-0.9173751,-2.6487076))*buf[2]
        + mat4x4<f32>(vec4<f32>(-8.645013,6.5546675,-6.3944063,-5.5933375),vec4<f32>(-0.57783127,-1.077275,36.91025,5.736769),vec4<f32>(14.283112,3.7146652,7.1452246,-4.5958776),vec4<f32>(2.7192075,3.6021907,-4.366337,-2.3653464))*buf[3]
        + vec4<f32>(-5.9000807,-4.329569,1.2427121,8.59503);
  buf[4] = sigmoid(buf[4]); buf[5] = sigmoid(buf[5]);
  buf[6] = mat4x4<f32>(vec4<f32>(-1.61102,0.7970257,1.4675229,0.20917463),vec4<f32>(-28.793737,-7.1390953,1.5025433,4.656581),vec4<f32>(-10.94861,39.66238,0.74318546,-10.095605),vec4<f32>(-0.7229728,-1.5483948,0.7301322,2.1687684))*buf[0]
        + mat4x4<f32>(vec4<f32>(3.2547753,21.489103,-1.0194173,-3.3100595),vec4<f32>(-3.7316632,-3.3792162,-7.223193,-0.23685838),vec4<f32>(13.1804495,0.7916005,5.338587,5.687114),vec4<f32>(-4.167605,-17.798311,-6.815736,-1.6451967))*buf[1]
        + mat4x4<f32>(vec4<f32>(0.604885,-7.800309,-7.213122,-2.741014),vec4<f32>(-3.522382,-0.12359311,-0.5258442,0.43852118),vec4<f32>(9.6752825,-22.853785,2.062431,0.099892326),vec4<f32>(-4.3196306,-17.730087,2.5184598,5.30267))*buf[2]
        + mat4x4<f32>(vec4<f32>(-6.545563,-15.790176,-6.0438633,-5.415399),vec4<f32>(-43.591583,28.551912,-16.00161,18.84728),vec4<f32>(4.212382,8.394307,3.0958717,8.657522),vec4<f32>(-5.0237565,-4.450633,-4.4768,-5.5010443))*buf[3]
        + mat4x4<f32>(vec4<f32>(1.6985557,-67.05806,6.897715,1.9004834),vec4<f32>(1.8680354,2.3915145,2.5231109,4.081538),vec4<f32>(11.158006,1.7294737,2.0738268,7.386411),vec4<f32>(-4.256034,-306.24686,8.258898,-17.132736))*buf[4]
        + mat4x4<f32>(vec4<f32>(1.6889864,-4.5852966,3.8534803,-6.3482175),vec4<f32>(1.3543309,-1.2640043,9.932754,2.9079645),vec4<f32>(-5.2770967,0.07150358,-0.13962056,3.3269649),vec4<f32>(28.34703,-4.918278,6.1044083,4.085355))*buf[5]
        + vec4<f32>(6.6818056,12.522166,-3.7075126,-4.104386);
  buf[7] = mat4x4<f32>(vec4<f32>(-8.265602,-4.7027016,5.098234,0.7509808),vec4<f32>(8.6507845,-17.15949,16.51939,-8.884479),vec4<f32>(-4.036479,-2.3946867,-2.6055532,-1.9866527),vec4<f32>(-2.2167742,-1.8135649,-5.9759874,4.8846445))*buf[0]
        + mat4x4<f32>(vec4<f32>(6.7790847,3.5076547,-2.8191125,-2.7028968),vec4<f32>(-5.743024,-0.27844876,1.4958696,-5.0517144),vec4<f32>(13.122226,15.735168,-2.9397483,-4.101023),vec4<f32>(-14.375265,-5.030483,-6.2599335,2.9848232))*buf[1]
        + mat4x4<f32>(vec4<f32>(4.0950394,-0.94011575,-5.674733,4.755022),vec4<f32>(4.3809423,4.8310084,1.7425908,-3.437416),vec4<f32>(2.117492,0.16342592,-104.56341,16.949184),vec4<f32>(-5.22543,-2.994248,3.8350096,-1.9364246))*buf[2]
        + mat4x4<f32>(vec4<f32>(-5.900337,1.7946124,-13.604192,-3.8060522),vec4<f32>(6.6583457,31.911177,25.164474,91.81147),vec4<f32>(11.840538,4.1503043,-0.7314397,6.768467),vec4<f32>(-6.3967767,4.034772,6.1714606,-0.32874924))*buf[3]
        + mat4x4<f32>(vec4<f32>(3.4992442,-196.91893,-8.923708,2.8142626),vec4<f32>(3.4806502,-3.1846354,5.1725626,5.1804223),vec4<f32>(-2.4009497,15.585794,1.2863957,2.0252278),vec4<f32>(-71.25271,-62.441242,-8.138444,0.50670296))*buf[4]
        + mat4x4<f32>(vec4<f32>(-12.291733,-11.176166,-7.3474145,4.390294),vec4<f32>(10.805477,5.6337385,-0.9385842,-4.7348723),vec4<f32>(-12.869276,-7.039391,5.3029537,7.5436664),vec4<f32>(1.4593618,8.91898,3.5101583,5.840625))*buf[5]
        + vec4<f32>(2.2415268,-6.705987,-0.98861027,-2.117676);
  buf[6] = sigmoid(buf[6]); buf[7] = sigmoid(buf[7]);
  buf[0] = mat4x4<f32>(vec4<f32>(1.6794263,1.3817469,2.9625452,0.0),vec4<f32>(-1.8834411,-1.4806935,-3.5924516,0.0),vec4<f32>(-1.3279216,-1.0918057,-2.3124623,0.0),vec4<f32>(0.2662234,0.23235129,0.44178495,0.0))*buf[0]
        + mat4x4<f32>(vec4<f32>(-0.6299101,-0.5945583,-0.9125601,0.0),vec4<f32>(0.17828953,0.18300213,0.18182953,0.0),vec4<f32>(-2.96544,-2.5819945,-4.9001055,0.0),vec4<f32>(1.4195864,1.1868085,2.5176322,0.0))*buf[1]
        + mat4x4<f32>(vec4<f32>(-1.2584374,-1.0552157,-2.1688404,0.0),vec4<f32>(-0.7200217,-0.52666044,-1.438251,0.0),vec4<f32>(0.15345335,0.15196142,0.272854,0.0),vec4<f32>(0.945728,0.8861938,1.2766753,0.0))*buf[2]
        + mat4x4<f32>(vec4<f32>(-2.4218085,-1.968602,-4.35166,0.0),vec4<f32>(-22.683098,-18.0544,-41.954372,0.0),vec4<f32>(0.63792,0.5470648,1.1078634,0.0),vec4<f32>(-1.5489894,-1.3075932,-2.6444845,0.0))*buf[3]
        + mat4x4<f32>(vec4<f32>(-0.49252132,-0.39877754,-0.91366625,0.0),vec4<f32>(0.95609266,0.7923952,1.640221,0.0),vec4<f32>(0.30616966,0.15693925,0.8639857,0.0),vec4<f32>(1.1825981,0.94504964,2.176963,0.0))*buf[4]
        + mat4x4<f32>(vec4<f32>(0.35446745,0.3293795,0.59547555,0.0),vec4<f32>(-0.58784515,-0.48177817,-1.0614829,0.0),vec4<f32>(2.5271258,1.9991658,4.6846647,0.0),vec4<f32>(0.13042648,0.08864098,0.30187556,0.0))*buf[5]
        + mat4x4<f32>(vec4<f32>(-1.7718065,-1.4033192,-3.3355875,0.0),vec4<f32>(3.1664357,2.638297,5.378702,0.0),vec4<f32>(-3.1724713,-2.6107926,-5.549295,0.0),vec4<f32>(-2.851368,-2.249092,-5.3013067,0.0))*buf[6]
        + mat4x4<f32>(vec4<f32>(1.5203838,1.2212278,2.8404984,0.0),vec4<f32>(1.5210563,1.2651345,2.683903,0.0),vec4<f32>(2.9789467,2.4364579,5.2347264,0.0),vec4<f32>(2.2270417,1.8825914,3.8028636,0.0))*buf[7]
        + vec4<f32>(-1.5468478,-3.6171484,0.24762098,0.0);
  buf[0] = sigmoid(buf[0]);
  return vec4<f32>(buf[0].x, buf[0].y, buf[0].z, 1.0);
}

  @fragment fn fs(@location(0) vUv: vec2<f32>) -> @location(0) vec4<f32> {
  // Recreate the reference (DarkVeil-like) in screen space using existing uniforms
  let fragCoord = vUv * U.resolution;
  var uv = fragCoord / U.resolution * 2.0 - vec2<f32>(1.0, 1.0);
  uv.y = -uv.y;

  let warpAmt = 0.05 * (0.5 + U.flowAmp);
  let t = U.time * (0.4 + U.flowSpeed);
  uv = uv + warpAmt * vec2<f32>(sin(uv.y * 6.2831853 + t), cos(uv.x * 6.2831853 + 0.5 * U.time));

  var col4 = cppn_fn(uv, 0.1 * sin(0.3 * U.time), 0.1 * sin(0.69 * U.time), 0.1 * sin(0.44 * U.time));
  var base = col4.rgb;
  let e = clamp(length(base), 0.0, 1.0);
  var key = fract(0.30*e + 0.20*uv.x + 0.15*uv.y + 0.10*U.time);
  // Dither key slightly to eliminate banding
  key = fract(key + (rand(fragCoord + vec2<f32>(U.time*13.1, U.time*7.7)) - 0.5) * 0.003);

  // Smooth Gaussian blend among purple/blue/orange
  let cPurple = vec3<f32>(0.54, 0.22, 0.80);
  let cBlue   = vec3<f32>(0.12, 0.20, 0.75);
  let cOrange = vec3<f32>(1.00, 0.55, 0.20);
  // Circular gaussian weights (wrap-around) so the palette loops seamlessly
  let sigma = 0.22;
  let dP = abs(fract(key - 0.12 + 0.5) - 0.5);
  let dB = abs(fract(key - 0.50 + 0.5) - 0.5);
  let dO = abs(fract(key - 0.86 + 0.5) - 0.5);
  let wP = exp(-(dP*dP)/(2.0*sigma*sigma));
  let wB = exp(-(dB*dB)/(2.0*sigma*sigma));
  let wO = exp(-(dO*dO)/(2.0*sigma*sigma));
  let sumw = max(wP + wB + wO, 1e-3);
  var pal = (cPurple*wP + cBlue*wB + cOrange*wO) / sumw;
  var col = pal * e;
  // Subtle saturation and gain via vibrancy
  let lumaC = dot(col, vec3<f32>(0.2126, 0.7152, 0.0722));
  let satC = mix(1.0, 1.30, clamp(U.vibrancy, 0.0, 1.0));
  col = vec3<f32>(lumaC, lumaC, lumaC) + (col - vec3<f32>(lumaC, lumaC, lumaC)) * satC;
  col = col * mix(1.0, 1.15, clamp(U.vibrancy, 0.0, 1.0));

  let scan = clamp(U.g, 0.0, 1.0);
  let scanFreq = (2.0 + U.swirl * 2.0 + U.flowSpeed * 4.0);
  let scanline_val = sin(fragCoord.y * scanFreq) * 0.5 + 0.5;
  col = col * (1.0 - (scanline_val * scanline_val) * scan);

  let noise = 0.05 * clamp(U.density, 0.0, 1.0);
  col = col + (rand(fragCoord + vec2<f32>(U.time, U.time)) - 0.5) * noise;

  // Soft alpha from luminance
  let luma = dot(col, vec3<f32>(0.2126, 0.7152, 0.0722));
  var alpha = clamp(mix(0.12, 0.55, luma), 0.0, 0.75);
  return vec4<f32>(clamp(col, vec3<f32>(0.0), vec3<f32>(1.0)), alpha);
}
`;
  }
}
