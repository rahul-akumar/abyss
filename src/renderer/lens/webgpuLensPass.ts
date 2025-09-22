import { WebGPUStarPass } from '../stars/webgpuStarPass';

export class WebGPULensPass {
  private device: GPUDevice;
  private format: GPUTextureFormat;
  private pipeline!: GPURenderPipeline;
  private bindGroupLayout!: GPUBindGroupLayout;
  private bindGroup!: GPUBindGroup;
  private uniformBuf!: GPUBuffer;
  private sampler!: GPUSampler;
  private starsView?: GPUTextureView;
  private galaxyView?: GPUTextureView;
  private viewport = { w: 1, h: 1 };
  private center = { x: 0.5, y: 0.5 };
  private radiusPx = 200;
  private zoom = 1.25;
  private dispersion = 0.35;
  private mode = 0; // 0 glass
  private mass = 1.0;
  private spin = 0.7;
  private bloomStrength = 0.6; private bloomThreshold = 0.7; private bloomRadiusPx = 8.0;
  private streakStrength = 0.8; private streakLengthPx = 120.0; private streakAngleDeg = 0.0;
  // BH params mirrored here so BH is visible through lens
  private bhEnabled = false;
  private bhCenter = { x: 0.5, y: 0.5 };
  private bhRadiusPx = 220;

  constructor(device: GPUDevice, format: GPUTextureFormat) {
    this.device = device; this.format = format; this.init();
  }

  setInputs(stars: GPUTextureView, galaxy: GPUTextureView) {
    this.starsView = stars; this.galaxyView = galaxy; this.updateBindGroup();
  }
  setViewport(w: number, h: number) { this.viewport.w = w; this.viewport.h = h; this.updateUniforms(); }
  setParams(radiusPx: number, zoom: number, dispersion: number) {
    this.radiusPx = radiusPx; this.zoom = zoom; this.dispersion = dispersion; this.updateUniforms();
  }
  setCenter(cx: number, cy: number) { this.center.x = cx; this.center.y = cy; this.updateUniforms(); }
  setMode(mode: 'glass'|'blackhole') { this.mode = mode === 'blackhole' ? 1 : 0; this.updateUniforms(); }
  setBHParams(mass: number, spin: number) { this.mass = mass; this.spin = spin; this.updateUniforms(); }
  setEffects(bloomStrength: number, bloomThreshold: number, bloomRadiusPx: number, streakStrength: number, streakLengthPx: number, streakAngleDeg: number) {
    this.bloomStrength = bloomStrength; this.bloomThreshold = bloomThreshold; this.bloomRadiusPx = bloomRadiusPx;
    this.streakStrength = streakStrength; this.streakLengthPx = streakLengthPx; this.streakAngleDeg = streakAngleDeg; this.updateUniforms();
  }

  private init() {
    this.sampler = this.device.createSampler({ magFilter: 'linear', minFilter: 'linear' });
    // Allocate with headroom to satisfy minBindingSize after driver padding
    this.uniformBuf = this.device.createBuffer({ size: 96, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
    const shader = this.device.createShaderModule({ code: this.wgsl() });
    this.bindGroupLayout = this.device.createBindGroupLayout({ entries: [
      { binding: 0, visibility: GPUShaderStage.FRAGMENT, sampler: {} },
      { binding: 1, visibility: GPUShaderStage.FRAGMENT, texture: {} },
      { binding: 2, visibility: GPUShaderStage.FRAGMENT, texture: {} },
      { binding: 3, visibility: GPUShaderStage.FRAGMENT | GPUShaderStage.VERTEX, buffer: {} },
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
    const stars = this.starsView ?? this.device.createTexture({size:{width:1,height:1,depthOrArrayLayers:1}, format:'rgba8unorm', usage: GPUTextureUsage.TEXTURE_BINDING}).createView();
    const galaxy = this.galaxyView ?? this.device.createTexture({size:{width:1,height:1,depthOrArrayLayers:1}, format:'rgba8unorm', usage: GPUTextureUsage.TEXTURE_BINDING}).createView();
    this.bindGroup = this.device.createBindGroup({ layout: this.bindGroupLayout, entries: [
      { binding: 0, resource: this.sampler },
      { binding: 1, resource: stars },
      { binding: 2, resource: galaxy },
      { binding: 3, resource: { buffer: this.uniformBuf } },
    ]});
  }

  render(encoder: GPUCommandEncoder, view: GPUTextureView) {
    const pass = encoder.beginRenderPass({ colorAttachments: [{ view, loadOp: 'load', storeOp: 'store' }] });
    pass.setPipeline(this.pipeline);
    pass.setBindGroup(0, this.bindGroup);
    pass.draw(3, 1, 0, 0);
    pass.end();
  }

  setBH(enabled: boolean, cx: number, cy: number, radiusPx: number, mass: number, spin: number) {
    this.bhEnabled = !!enabled; this.bhCenter.x = cx; this.bhCenter.y = cy; this.bhRadiusPx = Math.max(1, radiusPx);
    this.mass = mass; this.spin = spin; this.updateUniforms();
  }

  private updateUniforms() {
    const u = new Float32Array([
      this.viewport.w, this.viewport.h,
      this.center.x, this.center.y,
      this.radiusPx, this.zoom, this.dispersion, this.mode,
      this.mass, this.spin,
      this.bloomStrength, this.bloomThreshold, this.bloomRadiusPx,
      this.streakStrength, this.streakLengthPx, this.streakAngleDeg * Math.PI / 180,
      this.bhEnabled ? 1 : 0, this.bhCenter.x, this.bhCenter.y, this.bhRadiusPx
    ]);
    this.device.queue.writeBuffer(this.uniformBuf, 0, u);
  }

  private wgsl(): string {
    return /* wgsl */`
struct Uniforms {
  res: vec2<f32>, center: vec2<f32>,
  radiusPx: f32, zoom: f32, dispersion: f32, mode: f32,
  mass: f32, spin: f32,
  bloomStrength: f32, bloomThreshold: f32, bloomRadiusPx: f32,
  streakStrength: f32, streakLengthPx: f32, streakAngle: f32,
  bhEnabled: f32, bhCenter: vec2<f32>, bhRadiusPx: f32,
};
@group(0) @binding(0) var samp: sampler;
@group(0) @binding(1) var texStars: texture_2d<f32>;
@group(0) @binding(2) var texGalaxy: texture_2d<f32>;
@group(0) @binding(3) var<uniform> U: Uniforms;

struct VSOut { @builtin(position) Position: vec4<f32>, @location(0) vUv: vec2<f32>, };

@vertex fn vs(@builtin(vertex_index) vi: u32) -> VSOut {
  var pos = array<vec2<f32>, 3>(vec2<f32>(-1.0, -3.0), vec2<f32>(-1.0, 1.0), vec2<f32>(3.0, 1.0));
  var uv = array<vec2<f32>, 3>(vec2<f32>(0.0, 2.0), vec2<f32>(0.0, 0.0), vec2<f32>(2.0, 0.0));
  var out: VSOut; out.Position = vec4<f32>(pos[vi], 0.0, 1.0); out.vUv = uv[vi]; return out;
}

fn warpUVByBH(uv: vec2<f32>) -> vec2<f32> {
  if (U.bhEnabled < 0.5) { return uv; }
  let res = max(U.res, vec2<f32>(1.0));
  let px = vec2<f32>(uv.x * res.x, uv.y * res.y);
  let cpx = vec2<f32>(U.bhCenter.x * res.x, U.bhCenter.y * res.y);
  let d = px - cpx;
  let r = length(d);
  if (r > U.bhRadiusPx) { return uv; }
  let n = normalize(d);
  let rn = max(1e-3, r / max(U.bhRadiusPx, 1.0));
  var defl = U.mass * 0.12 / rn;
  let skew = 1.0 + U.spin * 0.3 * n.y;
  defl = defl * skew;
  let c = cos(defl); let s = sin(defl);
  let dR = vec2<f32>(d.x * c - d.y * s, d.x * s + d.y * c);
  let pxR = cpx + dR;
  return vec2<f32>(pxR.x / res.x, pxR.y / res.y);
}

fn sampleBG(uv: vec2<f32>) -> vec3<f32> {
  var col: vec3<f32>;
  let u = warpUVByBH(uv);
  let cs = textureSample(texStars, samp, u);
  let cg = textureSample(texGalaxy, samp, u);
  col = clamp(cs.rgb + cg.rgb, vec3<f32>(0.0), vec3<f32>(1.0));
  if (U.bhEnabled > 0.5) {
    let res = max(U.res, vec2<f32>(1.0));
    let px = vec2<f32>(uv.x * res.x, uv.y * res.y);
    let cpx = vec2<f32>(U.bhCenter.x * res.x, U.bhCenter.y * res.y);
    let r = length(px - cpx);
    if (r <= U.bhRadiusPx) {
      // Inside event horizon: force solid black, ignore background and rings
      col = vec3<f32>(0.0);
    }
  }
  return col;
}
fn sampleStars(uv: vec2<f32>) -> vec3<f32> {
  let cs = textureSample(texStars, samp, uv);
  return cs.rgb;
}

fn luma(c: vec3<f32>) -> f32 { return max(max(c.r, c.g), c.b); }

fn applyBloom(uv: vec2<f32>) -> vec3<f32> {
  if (U.bloomStrength <= 1e-4) { return vec3<f32>(0.0); }
  let du = vec2<f32>(1.0) / max(U.res, vec2<f32>(1.0));
  let rpx = max(1.0, U.bloomRadiusPx);
  var acc = vec3<f32>(0.0);
  var wsum = 0.0;
  let offs = array<vec2<f32>, 8>(
    vec2<f32>( 1.0, 0.0), vec2<f32>(-1.0, 0.0), vec2<f32>(0.0, 1.0), vec2<f32>(0.0,-1.0),
    vec2<f32>( 1.0, 1.0), vec2<f32>(-1.0, 1.0), vec2<f32>(1.0,-1.0), vec2<f32>(-1.0,-1.0)
  );
  for (var i: i32 = 0; i < 8; i = i + 1) {
    let w = select(0.7071, 1.0, i < 4);
    let s = sampleStars(uv + offs[i] * (rpx * du));
    let b = max(luma(s) - U.bloomThreshold, 0.0);
    acc = acc + s * b * w;
    wsum = wsum + w;
  }
  if (wsum > 0.0) { acc = acc / wsum; }
  return acc * U.bloomStrength;
}

fn applyStreaks(uv: vec2<f32>) -> vec3<f32> {
  if (U.streakStrength <= 1e-4) { return vec3<f32>(0.0); }
  let du = vec2<f32>(1.0) / max(U.res, vec2<f32>(1.0));
  let a = U.streakAngle;
  let angles = array<f32, 2>(a + 0.0, a + 1.5707963); // cross only (two axes)
  var acc = vec3<f32>(0.0);
  var wsum = 0.0;
  for (var k: i32 = 0; k < 2; k = k + 1) {
    let dir = vec2<f32>(cos(angles[k]), sin(angles[k]));
    for (var s: i32 = 1; s <= 8; s = s + 1) {
      let t = f32(s) / 8.0;
      let w = (1.0 - t);
      let off = dir * (t * U.streakLengthPx);
      let c1 = sampleStars(uv + off*du);
      let c2 = sampleStars(uv - off*du);
      let b1 = max(luma(c1) - U.bloomThreshold, 0.0);
      let b2 = max(luma(c2) - U.bloomThreshold, 0.0);
      acc = acc + (c1*b1 + c2*b2) * w;
      wsum = wsum + 2.0*w;
    }
  }
  if (wsum > 0.0) { acc = acc / wsum; }
  return acc * U.streakStrength;
}

@fragment fn fs(@location(0) vUv: vec2<f32>) -> @location(0) vec4<f32> {
  let px = vec2<f32>(vUv.x * U.res.x, vUv.y * U.res.y);
  let cpx = vec2<f32>(U.center.x * U.res.x, U.center.y * U.res.y);
  let d = px - cpx;
  let r = length(d);
  if (r > U.radiusPx) { discard; }

  // If a BH is enabled, completely skip lens rendering inside the BH radius (with a small margin)
  if (U.bhEnabled > 0.5) {
    let res = max(U.res, vec2<f32>(1.0));
    let cpxBH = vec2<f32>(U.bhCenter.x * res.x, U.bhCenter.y * res.y);
    let rnBH = length(px - cpxBH) / max(U.bhRadiusPx, 1.0);
    let margin = 0.02; // small safety halo
    if (rnBH <= 1.0 + margin) { discard; }
  }

  let n = normalize(d);
  let rn = max(1e-3, r / max(U.radiusPx, 1.0));

  var uv = vUv;
  if (U.mode < 0.5) {
    // Glass: mild refraction + zoom + dispersion
    let k1 = 0.05; let k2 = 0.02;
    let baseUv = vUv + (n * (k1 * rn + k2 * rn * rn)) / max(U.res, vec2<f32>(1.0));
    uv = (baseUv - U.center) / max(U.zoom, 1.0) + U.center;
  } else {
    // Black hole: simple radial deflection mapping
    var defl = U.mass * 0.12 / rn; // strong near center, fades outward
    // pseudo spin skew along one axis
    let skew = 1.0 + U.spin * 0.3 * n.y;
    defl = defl * skew;
    // rotate d by small angle defl
    let c = cos(defl); let s = sin(defl);
    let dR = vec2<f32>(d.x * c - d.y * s, d.x * s + d.y * c);
    let pxR = cpx + dR;
    uv = vec2<f32>(pxR.x / U.res.x, pxR.y / U.res.y);
  }

  // chromatic dispersion (kept small even for BH)
  let disp = U.dispersion * 0.003;
  let cR = sampleBG(uv + n * disp).r;
  let cG = sampleBG(uv).g;
  let cB = sampleBG(uv - n * disp).b;
  var col = vec3<f32>(cR, cG, cB);

  // Bloom and star streaks only in glass mode; avoid inside BH horizon
  if (U.mode < 0.5) {
    var bhMask = 1.0;
    if (U.bhEnabled > 0.5) {
      let res = max(U.res, vec2<f32>(1.0));
      let pxuv = vec2<f32>(vUv.x * res.x, vUv.y * res.y);
      let cpxBH = vec2<f32>(U.bhCenter.x * res.x, U.bhCenter.y * res.y);
      let rnBH = length(pxuv - cpxBH) / max(U.bhRadiusPx, 1.0);
      // Smoothly suppress star-only effects near the BH horizon to avoid an outer star-only ring
      let margin = 0.06; // fade width in units of BH radius
      bhMask = smoothstep(1.0, 1.0 + margin, rnBH);
    }
    col = col + applyBloom(uv) * bhMask;
    col = col + applyStreaks(uv) * bhMask;
  }



  return vec4<f32>(col, 1.0);
}
`;
  }
}
