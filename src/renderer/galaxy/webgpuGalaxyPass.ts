import { generateGalaxyImpostors } from './generateImpostors';

export class WebGPUGalaxyPass {
  private device: GPUDevice;
  private format: GPUTextureFormat;
  private pipelineBand!: GPURenderPipeline;
  private pipelineImpostor!: GPURenderPipeline;
  private bindGroupLayout!: GPUBindGroupLayout;
  private bindGroup!: GPUBindGroup;
  private uniformBuf!: GPUBuffer;
  private sampler!: GPUSampler; // reserved for future textures
  private viewport = { w: 1, h: 1 };
  private tiltRad = (12 * Math.PI) / 180;
  private sigma = 0.18; // band half-width in NDC units (narrower → feels farther)
  // Interaction state (applies to impostor sprites only)
  private time = 0.0;
  private mousePxX = -1e6; private mousePxY = -1e6;
  private forceRadiusPx = 0.0; private forceStrengthPx = 0.0;
  private shockCenterX = 0.0; private shockCenterY = 0.0;
  private shockStartTime = -1.0; private shockSpeedPx = 1000.0; private shockAmpPx = 60.0; private shockWidthPx = 80.0; private shockDamp = 2.0;

  // Impostors
  private quadVbo!: GPUBuffer;
  private quadIbo!: GPUBuffer;
  private instanceBuf!: GPUBuffer;
  private impostorCount = 0;

  constructor(device: GPUDevice, format: GPUTextureFormat) {
    this.device = device;
    this.format = format;
    this.init();
  }

  setViewport(w: number, h: number) { this.viewport.w = w; this.viewport.h = h; this.updateUniforms(); }
  setTiltDeg(deg: number) { this.tiltRad = (deg * Math.PI) / 180; this.updateUniforms(); }
  setSigma(v: number) { this.sigma = v; this.updateUniforms(); }
  // Interaction API (sprites only)
  setTime(t: number) { this.time = t; this.updateUniforms(); }
  setCursor(xPx: number, yPx: number) { this.mousePxX = xPx; this.mousePxY = yPx; this.updateUniforms(); }
  setCursorForce(radiusPx: number, strengthPx: number) { this.forceRadiusPx = Math.max(0, radiusPx); this.forceStrengthPx = strengthPx; this.updateUniforms(); }
  triggerShockwave(xPx: number, yPx: number, ampPx: number = 60, speedPx: number = 1000, widthPx: number = 80, damp: number = 2.0) {
    this.shockCenterX = xPx; this.shockCenterY = yPx; this.shockAmpPx = ampPx; this.shockSpeedPx = speedPx; this.shockWidthPx = widthPx; this.shockDamp = Math.max(0, damp);
    this.shockStartTime = this.time; this.updateUniforms();
  }

  private init() {
    // Uniforms buffer (shared between band and impostors)
    // Layout (float32):
    // [0]=res.x, [1]=res.y, [2]=tilt, [3]=sigma,
    // [4]=time, [5]=mouse.x, [6]=mouse.y, [7]=forceRadiusPx,
    // [8]=forceStrengthPx, [9]=shock.cx, [10]=shock.cy, [11]=shockStartTime,
    // [12]=shockSpeedPx, [13]=shockAmpPx, [14]=shockWidthPx, [15]=shockDamp
    // Note: std140-like padding may increase required size; allocate 20 floats (80 bytes) to be safe
    this.uniformBuf = this.device.createBuffer({ size: 20 * 4, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
    this.sampler = this.device.createSampler({ magFilter: 'linear', minFilter: 'linear' });

    // Band pipeline
    const shaderBand = this.device.createShaderModule({ code: this.wgslBand() });
    this.bindGroupLayout = this.device.createBindGroupLayout({
      entries: [ { binding: 0, visibility: GPUShaderStage.FRAGMENT | GPUShaderStage.VERTEX, buffer: {} } ]
    });
    const layout = this.device.createPipelineLayout({ bindGroupLayouts: [this.bindGroupLayout] });

    this.pipelineBand = this.device.createRenderPipeline({
      layout,
      vertex: { module: shaderBand, entryPoint: 'vsBand' },
      fragment: { module: shaderBand, entryPoint: 'fsBand', targets: [{ format: this.format }] },
      primitive: { topology: 'triangle-list', cullMode: 'none' }
    });

    // Impostor pipeline and buffers
    const shaderImp = this.device.createShaderModule({ code: this.wgslImpostor() });
    this.pipelineImpostor = this.device.createRenderPipeline({
      layout,
      vertex: { module: shaderImp, entryPoint: 'vsImp', buffers: [
        { arrayStride: 8, stepMode: 'vertex', attributes: [{ shaderLocation: 0, offset: 0, format: 'float32x2' }] },
        { arrayStride: 28, stepMode: 'instance', attributes: [
          { shaderLocation: 1, offset: 0, format: 'float32x2' }, // center (band frame)
          { shaderLocation: 2, offset: 8, format: 'float32' },   // sizePx
          { shaderLocation: 3, offset: 12, format: 'float32' },  // angle
          { shaderLocation: 4, offset: 16, format: 'float32' },  // axisRatio
          { shaderLocation: 5, offset: 20, format: 'float32' },  // colorBias
          { shaderLocation: 6, offset: 24, format: 'float32' },  // brightness
        ]}
      ] },
      fragment: { module: shaderImp, entryPoint: 'fsImp', targets: [{ format: this.format, blend: { color: { srcFactor: 'one', dstFactor: 'one', operation: 'add' }, alpha: { srcFactor: 'one', dstFactor: 'one', operation: 'add' } } }] },
      primitive: { topology: 'triangle-list', cullMode: 'none' }
    });

    // Quad and instance data
    const quad = new Float32Array([ -0.5,-0.5, 0.5,-0.5, 0.5,0.5, -0.5,0.5 ]);
    const idx = new Uint16Array([0,1,2, 0,2,3]);
    this.quadVbo = this.device.createBuffer({ size: quad.byteLength, usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST });
    this.device.queue.writeBuffer(this.quadVbo, 0, quad);
    this.quadIbo = this.device.createBuffer({ size: idx.byteLength, usage: GPUBufferUsage.INDEX | GPUBufferUsage.COPY_DST });
    this.device.queue.writeBuffer(this.quadIbo, 0, idx);

    const imp = generateGalaxyImpostors({ count: 180, uRange: [-0.95, 0.95], vRange: [-0.95, 0.95], sizePxRange: [12, 42], seed: 9001 });
    this.impostorCount = Math.floor(imp.length / 7);
    this.instanceBuf = this.device.createBuffer({ size: imp.byteLength, usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST });
    this.device.queue.writeBuffer(this.instanceBuf, 0, imp);

    this.bindGroup = this.device.createBindGroup({ layout: this.bindGroupLayout, entries: [ { binding: 0, resource: { buffer: this.uniformBuf } } ] });
    this.updateUniforms();
  }

  // Separate render entry points to match engine usage
  renderBand(encoder: GPUCommandEncoder, view: GPUTextureView) {
    const pass = encoder.beginRenderPass({
      colorAttachments: [{ view, clearValue: { r: 0, g: 0, b: 0, a: 1 }, loadOp: 'clear', storeOp: 'store' }]
    });
    pass.setPipeline(this.pipelineBand);
    pass.setBindGroup(0, this.bindGroup);
    pass.draw(3, 1, 0, 0);
    pass.end();
  }
  renderImpostors(encoder: GPUCommandEncoder, view: GPUTextureView, clearFirst: boolean) {
    const pass = encoder.beginRenderPass({
      colorAttachments: [{ view, clearValue: { r: 0, g: 0, b: 0, a: 1 }, loadOp: clearFirst ? 'clear' : 'load', storeOp: 'store' }]
    });
    pass.setPipeline(this.pipelineImpostor);
    pass.setBindGroup(0, this.bindGroup);
    pass.setVertexBuffer(0, this.quadVbo);
    pass.setVertexBuffer(1, this.instanceBuf);
    pass.setIndexBuffer(this.quadIbo, 'uint16');
    pass.drawIndexed(6, this.impostorCount);
    pass.end();
  }

  // Legacy combined renderer (unused by current engine but kept for flexibility)
  render(encoder: GPUCommandEncoder, view: GPUTextureView) {
    this.renderBand(encoder, view);
    // Add impostors over the band in the same target
    this.renderImpostors(encoder, view, false);
  }

  private updateUniforms() {
    const data = new Float32Array([
      this.viewport.w, this.viewport.h, this.tiltRad, this.sigma,
      this.time, this.mousePxX, this.mousePxY, this.forceRadiusPx,
      this.forceStrengthPx, this.shockCenterX, this.shockCenterY, this.shockStartTime,
      this.shockSpeedPx, this.shockAmpPx, this.shockWidthPx, this.shockDamp,
      // pad to 20 floats (80 bytes) for alignment safety
      0, 0, 0, 0,
    ]);
    this.device.queue.writeBuffer(this.uniformBuf, 0, data);
  }

  private wgslBand(): string {
    return /* wgsl */`
struct Uniforms {
  resolution: vec2<f32>,
  tilt: f32,
  sigma: f32,
  time: f32,
  mousePx: vec2<f32>,
  forceRadiusPx: f32,
  forceStrengthPx: f32,
  shockCenterPx: vec2<f32>,
  shockStartTime: f32,
  shockSpeedPx: f32,
  shockAmpPx: f32,
  shockWidthPx: f32,
  shockDamp: f32,
};
@group(0) @binding(0) var<uniform> U: Uniforms;

struct VSOut { @builtin(position) Position: vec4<f32>, @location(0) vPos: vec2<f32>, };

@vertex fn vsBand(@builtin(vertex_index) vi: u32) -> VSOut {
  var pos = array<vec2<f32>, 3>(vec2<f32>(-1.0, -3.0), vec2<f32>(-1.0, 1.0), vec2<f32>(3.0, 1.0));
  var out: VSOut;
  out.Position = vec4<f32>(pos[vi], 0.0, 1.0);
  out.vPos = pos[vi];
  return out;
}

fn fract_f(x: f32) -> f32 { return x - floor(x); }
fn hash(p: vec2<f32>) -> f32 {
  let h = sin(dot(p, vec2<f32>(127.1, 311.7))) * 43758.5453123;
  return fract_f(h);
}
fn noise(p: vec2<f32>) -> f32 {
  let i = floor(p);
  let f = p - i;
  let a = hash(i);
  let b = hash(i + vec2<f32>(1.0, 0.0));
  let c = hash(i + vec2<f32>(0.0, 1.0));
  let d = hash(i + vec2<f32>(1.0, 1.0));
  let u = f*f*(vec2<f32>(3.0) - 2.0*f);
  return mix(a, b, u.x) + (c - a) * u.y * (1.0 - u.x) + (d - b) * u.x * u.y;
}
fn fbm(pIn: vec2<f32>) -> f32 {
  var p = pIn;
  var t: f32 = 0.0;
  var amp: f32 = 0.5;
  for (var i: i32 = 0; i < 5; i = i + 1) {
    t = t + noise(p) * amp;
    p = p * 2.0;
    amp = amp * 0.5;
  }
  return t;
}

fn aces_tonemap(x: vec3<f32>) -> vec3<f32> {
  let a = 2.51; let b = 0.03; let c = 2.43; let d = 0.59; let e = 0.14;
  return clamp((x*(a*x + b)) / (x*(c*x + d) + e), vec3<f32>(0.0), vec3<f32>(1.0));
}

@fragment fn fsBand(@location(0) vPos: vec2<f32>) -> @location(0) vec4<f32> {
  let c = cos(U.tilt);
  let s = sin(U.tilt);
  // Rotate NDC position to band frame
  let p = vPos;
  let pr = vec2<f32>(p.x * c - p.y * s, p.x * s + p.y * c);
  let d = abs(pr.y);
  let w = max(U.sigma, 1e-4);

  // Edge breakup noise mostly along the band (x) with tighter freq across (y)
  let n = fbm(vec2<f32>(pr.x * 6.0, pr.y * 28.0));
  let wN = w * (1.0 + 0.28 * (n - 0.5));

  // Core band density with noisy edge breakup
  var denCore = exp(- (d*d) / (2.0*wN*wN));
  // Reduce density near edges using additional noise
  let u = d / wN;
  let edge = smoothstep(0.7, 1.6, u);
  let n2 = fbm(vec2<f32>(pr.x * 9.0, pr.y * 36.0));
  denCore = denCore * (1.0 - 0.5 * edge * n2);

  // Soft outer diffusion halo (broad, faint)
  let wH = w * 2.8;
  let halo = exp(- (d*d) / (2.0*wH*wH)) * 0.18;

  // Color: warm core, cooler edges
  let t = clamp(1.0 - smoothstep(0.0, wN, d), 0.0, 1.0);
  let yellow = vec3<f32>(1.0, 0.9, 0.6);
  let blue = vec3<f32>(0.4, 0.6, 1.0);
  var col = mix(blue, yellow, t) * (denCore * 0.38 + halo);

  col = aces_tonemap(col);
  return vec4<f32>(col, 1.0);
}
`;
  }

  private wgslImpostor(): string {
    return /* wgsl */`
struct Uniforms {
  resolution: vec2<f32>,
  tilt: f32,
  sigma: f32,
  time: f32,
  mousePx: vec2<f32>,
  forceRadiusPx: f32,
  forceStrengthPx: f32,
  shockCenterPx: vec2<f32>,
  shockStartTime: f32,
  shockSpeedPx: f32,
  shockAmpPx: f32,
  shockWidthPx: f32,
  shockDamp: f32,
};
@group(0) @binding(0) var<uniform> U: Uniforms;

struct VSIn {
  @location(0) corner: vec2<f32>,
  @location(1) centerUV: vec2<f32>,
  @location(2) sizePx: f32,
  @location(3) angle: f32,
  @location(4) axis: f32,
  @location(5) colorBias: f32,
  @location(6) brightness: f32,
};

struct VSOut {
  @builtin(position) Position: vec4<f32>,
  @location(0) vCorner: vec2<f32>,
  @location(1) vAngle: f32,
  @location(2) vAxis: f32,
  @location(3) vColorBias: f32,
  @location(4) vBrightness: f32,
  @location(5) vPx2Ndc: vec2<f32>,
};

@vertex fn vsImp(input: VSIn) -> VSOut {
  var out: VSOut;
  let px2ndc = vec2<f32>(2.0 / max(U.resolution.x, 1.0), 2.0 / max(U.resolution.y, 1.0));
  // Rotate center by galaxy tilt (band frame -> screen)
  let ct = cos(U.tilt); let st = sin(U.tilt);
  // Inverse rotation (−tilt) so impostor band aligns with galaxy band tilt
  let p = vec2<f32>(input.centerUV.x * ct + input.centerUV.y * st, -input.centerUV.x * st + input.centerUV.y * ct);

  // Convert center to pixel space for interactions (y-down)
  let uv = p * 0.5 + vec2<f32>(0.5, 0.5);
  let centerPx = vec2<f32>(uv.x * U.resolution.x, (1.0 - uv.y) * U.resolution.y);
  var dispPx = vec2<f32>(0.0, 0.0);
  // Cursor force field
  if (U.forceRadiusPx > 0.0 && U.forceStrengthPx != 0.0) {
    let d = centerPx - U.mousePx;
    let r = length(d);
    if (r < U.forceRadiusPx && r > 1e-3) {
      let fall = 1.0 - (r / U.forceRadiusPx);
      let fall2 = fall * fall;
      let dir = d / r;
      dispPx = dispPx + dir * (U.forceStrengthPx * fall2);
    }
  }
  // Shockwave displacement
  if (U.shockStartTime >= 0.0) {
    let t = max(0.0, U.time - U.shockStartTime);
    let d2 = centerPx - U.shockCenterPx;
    let r2 = length(d2);
    let waveR = U.shockSpeedPx * t;
    var g = 0.0;
    if (U.shockWidthPx > 0.0) {
      let x = (r2 - waveR) / max(U.shockWidthPx, 1e-3);
      g = exp(-0.5 * x * x);
    }
    let decay = exp(-U.shockDamp * t);
    if (r2 > 1e-3) {
      let dir2 = d2 / r2;
      dispPx = dispPx + dir2 * (U.shockAmpPx * g * decay);
    }
  }

  // Rotate corner by local angle for quad placement
  let ca = cos(input.angle); let sa = sin(input.angle);
  let off = input.corner * input.sizePx * px2ndc;
  let offR = vec2<f32>(off.x * ca - off.y * sa, off.x * sa + off.y * ca);

  // Apply pixel displacement as NDC offset (flip Y)
  let ndc = p + vec2<f32>(dispPx.x * px2ndc.x, -dispPx.y * px2ndc.y);
  out.Position = vec4<f32>(ndc + offR, 0.0, 1.0);
  out.vCorner = input.corner;
  out.vAngle = input.angle;
  out.vAxis = input.axis;
  out.vColorBias = input.colorBias;
  out.vBrightness = input.brightness;
  out.vPx2Ndc = px2ndc * input.sizePx; // scale for fragment shading
  return out;
}

fn aces_tonemap(x: vec3<f32>) -> vec3<f32> {
  let a = 2.51; let b = 0.03; let c = 2.43; let d = 0.59; let e = 0.14;
  return clamp((x*(a*x + b)) / (x*(c*x + d) + e), vec3<f32>(0.0), vec3<f32>(1.0));
}

@fragment fn fsImp(@location(0) vCorner: vec2<f32>, @location(1) vAngle: f32, @location(2) vAxis: f32, @location(3) vColorBias: f32, @location(4) vBrightness: f32, @location(5) vPx2Ndc: vec2<f32>) -> @location(0) vec4<f32> {
  // Elliptical Gaussian in quad-local space to ensure soft edges (independent of resolution)
  let ca = cos(vAngle); let sa = sin(vAngle);
  let vc = vCorner; // [-0.5, 0.5]
  let vcr = vec2<f32>(vc.x * ca - vc.y * sa, vc.x * sa + vc.y * ca);
  let q = max(vAxis, 0.01);
  // Normalize to 1.0 at quad edge (0.5 extent) so edges fade to zero
  let rr = length(vec2<f32>(vcr.x / 0.5, (vcr.y / q) / 0.5));
  let fall = exp(-4.5 * rr * rr);
  let yellow = vec3<f32>(1.0, 0.9, 0.6);
  let blue = vec3<f32>(0.45, 0.62, 1.0);
  var col = mix(blue, yellow, clamp(vColorBias, 0.0, 1.0)) * (vBrightness * fall);
  col = aces_tonemap(col);
  let alpha = smoothstep(1.0, 0.75, rr) * fall;
  return vec4<f32>(col, alpha);
}
`;
  }
}
