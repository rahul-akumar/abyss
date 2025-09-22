export class WebGPUBlackHolePass {
  private device: GPUDevice;
  private format: GPUTextureFormat;
  private pipeline!: GPURenderPipeline;
  private bindGroupLayout!: GPUBindGroupLayout;
  private bindGroup!: GPUBindGroup;
  private uniformBuf!: GPUBuffer;
  private sampler!: GPUSampler;
  private starsView?: GPUTextureView;
  private galaxyImpView?: GPUTextureView;
  private galaxyBandView?: GPUTextureView;
  private dummyView!: GPUTextureView;
  private viewport = { w: 1, h: 1 };
  private center = { x: 0.5, y: 0.5 };
  private radiusPx = 100; // fixed BH radius (px)
  private mass = 1.0;
  private spin = 0.7;
  private overlayOnly = true;

  constructor(device: GPUDevice, format: GPUTextureFormat) {
    this.device = device; this.format = format; this.init();
  }

  setInputs(stars: GPUTextureView, galaxyImpostors: GPUTextureView, galaxyBand: GPUTextureView) {
    this.starsView = stars; this.galaxyImpView = galaxyImpostors; this.galaxyBandView = galaxyBand; this.updateBindGroup();
  }
  setViewport(w: number, h: number) { this.viewport.w = w; this.viewport.h = h; this.updateUniforms(); }
  setParams(mass: number, spin: number) { this.mass = mass; this.spin = spin; this.updateUniforms(); }
  setRadiusPx(r: number) { this.radiusPx = Math.max(10, r|0); this.updateUniforms(); }
  setOverlayOnly(flag: boolean) { this.overlayOnly = !!flag; this.updateUniforms(); this.updateBindGroup(); }

  private init() {
    this.sampler = this.device.createSampler({ magFilter: 'linear', minFilter: 'linear' });
    this.uniformBuf = this.device.createBuffer({ size: 48, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
    const shader = this.device.createShaderModule({ code: this.wgsl() });
    // 1x1 dummy texture for safe binding when overlayOnly=true (avoid sampling RT being written)
    const dummyTex = this.device.createTexture({ size: { width: 1, height: 1 }, format: 'rgba8unorm', usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST });
    this.device.queue.writeTexture({ texture: dummyTex }, new Uint8Array([0,0,0,255]), { bytesPerRow: 4 }, { width: 1, height: 1 });
    this.dummyView = dummyTex.createView();
    this.bindGroupLayout = this.device.createBindGroupLayout({ entries: [
      { binding: 0, visibility: GPUShaderStage.FRAGMENT, sampler: {} },
      { binding: 1, visibility: GPUShaderStage.FRAGMENT, texture: {} }, // stars
      { binding: 2, visibility: GPUShaderStage.FRAGMENT, texture: {} }, // galaxy impostors
      { binding: 3, visibility: GPUShaderStage.FRAGMENT, texture: {} }, // galaxy band (undistorted)
      { binding: 4, visibility: GPUShaderStage.FRAGMENT | GPUShaderStage.VERTEX, buffer: {} },
    ]});
    const layout = this.device.createPipelineLayout({ bindGroupLayouts: [this.bindGroupLayout] });
    this.pipeline = this.device.createRenderPipeline({
      layout,
      vertex: { module: shader, entryPoint: 'vs' },
      fragment: { module: shader, entryPoint: 'fs', targets: [{ format: this.format }] },
      primitive: { topology: 'triangle-list', cullMode: 'none' }
    });
    this.updateBindGroup();
    this.updateUniforms();
  }

  private updateBindGroup() {
    const stars = this.starsView ?? this.dummyView;
    const galaxyImpSel = this.overlayOnly ? this.dummyView : (this.galaxyImpView ?? this.dummyView);
    const galaxyBandSel = this.overlayOnly ? this.dummyView : (this.galaxyBandView ?? this.dummyView);
    this.bindGroup = this.device.createBindGroup({ layout: this.bindGroupLayout, entries: [
      { binding: 0, resource: this.sampler },
      { binding: 1, resource: stars },
      { binding: 2, resource: galaxyImpSel },
      { binding: 3, resource: galaxyBandSel },
      { binding: 4, resource: { buffer: this.uniformBuf } },
    ]});
  }

  render(encoder: GPUCommandEncoder, view: GPUTextureView) {
    const pass = encoder.beginRenderPass({ colorAttachments: [{ view, loadOp: 'load', storeOp: 'store' }] });
    pass.setPipeline(this.pipeline);
    pass.setBindGroup(0, this.bindGroup);
    pass.draw(3, 1, 0, 0);
    pass.end();
  }

  private updateUniforms() {
    const u = new Float32Array([
      this.viewport.w, this.viewport.h,
      this.center.x, this.center.y,
      this.radiusPx, this.mass, this.spin, this.overlayOnly ? 1 : 0,
      // reserved for future params
      0,0,0,0
    ]);
    this.device.queue.writeBuffer(this.uniformBuf, 0, u);
  }

  private wgsl(): string {
    return /* wgsl */`
struct Uniforms {
  res: vec2<f32>, center: vec2<f32>,
  radiusPx: f32, mass: f32, spin: f32, overlayOnly: f32,
  _pad1: vec4<f32>,
};
@group(0) @binding(0) var samp: sampler;
@group(0) @binding(1) var texStars: texture_2d<f32>;
@group(0) @binding(2) var texGalaxyImp: texture_2d<f32>;
@group(0) @binding(3) var texGalaxyBand: texture_2d<f32>;
@group(0) @binding(4) var<uniform> U: Uniforms;

struct VSOut { @builtin(position) Position: vec4<f32>, @location(0) vUv: vec2<f32>, };

@vertex fn vs(@builtin(vertex_index) vi: u32) -> VSOut {
  var pos = array<vec2<f32>, 3>(vec2<f32>(-1.0, -3.0), vec2<f32>(-1.0, 1.0), vec2<f32>(3.0, 1.0));
  var uv = array<vec2<f32>, 3>(vec2<f32>(0.0, 2.0), vec2<f32>(0.0, 0.0), vec2<f32>(2.0, 0.0));
  var out: VSOut; out.Position = vec4<f32>(pos[vi], 0.0, 1.0); out.vUv = uv[vi]; return out;
}

fn sampleLensed(uv: vec2<f32>) -> vec3<f32> {
  let cs = textureSample(texStars, samp, uv);
  let ci = textureSample(texGalaxyImp, samp, uv);
  return clamp(cs.rgb + ci.rgb, vec3<f32>(0.0), vec3<f32>(1.0));
}

@fragment fn fs(@location(0) vUv: vec2<f32>) -> @location(0) vec4<f32> {
  let px = vec2<f32>(vUv.x * U.res.x, vUv.y * U.res.y);
  let cpx = vec2<f32>(U.center.x * U.res.x, U.center.y * U.res.y);
  let d = px - cpx;
  let r = length(d);
  let rn = max(1e-3, r / max(U.radiusPx, 1.0));

  if (U.overlayOnly > 0.5) {
    // Overlay mode: only event horizon and a single accretion ring; no background or lensing
    let horizonR: f32 = 0.32;
    var outC: vec4<f32> = vec4<f32>(0.0, 0.0, 0.0, 0.0);
    if (rn <= horizonR) {
      // Inside horizon: solid black
      outC = vec4<f32>(0.0, 0.0, 0.0, 1.0);
    } else {
      let ringPos: f32 = 0.5; let w: f32 = 0.03;
      let ring = exp(-((rn - ringPos)*(rn - ringPos)) / (2.0*w*w));
      if (ring <= 0.001) { discard; }
      let ringCol = vec3<f32>(1.0, 0.95, 0.85) * ring * 0.8;
      outC = vec4<f32>(ringCol, 1.0);
    }
    return outC;
  }

  // Compute deflected UV for lensed content (stars + galaxy impostors)
  var uvLens = vUv;
  if (r <= U.radiusPx) {
    let n = normalize(d);
    var defl = U.mass * 0.12 / rn; // strong near center, fades outward
    // pseudo spin skew along one axis
    let skew = 1.0 + U.spin * 0.3 * n.y;
    defl = defl * skew;
    // rotate d by small angle defl
    let c = cos(defl); let s = sin(defl);
    let dR = vec2<f32>(d.x * c - d.y * s, d.x * s + d.y * c);
    let pxR = cpx + dR;
    uvLens = vec2<f32>(pxR.x / U.res.x, pxR.y / U.res.y);
  }

  var col = sampleLensed(uvLens);
  // Add undistorted galaxy band sampled at original UV
  let cb = textureSample(texGalaxyBand, samp, vUv).rgb;
  col = clamp(col + cb, vec3<f32>(0.0), vec3<f32>(1.0));

  // Event horizon: black disk via arithmetic mask (uniform control flow)
  let horizon = step(0.32, rn);
  col = mix(vec3<f32>(0.0), col, horizon);
  // Simple photon ring emission around ~0.5 r_s with small width
  let ringPos: f32 = 0.5; let w: f32 = 0.03;
  let ring = exp(-((rn - ringPos)*(rn - ringPos)) / (2.0*w*w));
  col = col + vec3<f32>(1.0, 0.95, 0.85) * ring * 0.8;

  return vec4<f32>(col, 1.0);
}
`;
  }
}
