import { generateStars } from './generate';

export class WebGPUStarPass {
  private device: GPUDevice;
  private format: GPUTextureFormat;
  private quadVbo!: GPUBuffer;
  private quadIbo!: GPUBuffer;
  private instanceBuf!: GPUBuffer;
  private pipeline!: GPURenderPipeline;
  private bindGroupLayout!: GPUBindGroupLayout;
  private bindGroup!: GPUBindGroup;
  private uniformBuf!: GPUBuffer;
  private starCount = 0;
  private viewport = { w: 1, h: 1 };
  private exposure = 0.0;
  private starIntensity = 1.0;
  private time = 0.0;
  private twinkleSpeed = 0.12;
  private twinkleAmount = 0.25;
  // Interaction state
  private mousePxX = -1e6; private mousePxY = -1e6;
  private forceRadiusPx = 0.0; private forceStrengthPx = 0.0;
  private shockCenterX = 0.0; private shockCenterY = 0.0;
  private shockStartTime = -1.0; private shockSpeedPx = 1000.0; private shockAmpPx = 60.0; private shockWidthPx = 80.0; private shockDamp = 2.0;

  constructor(device: GPUDevice, format: GPUTextureFormat, starCount: number) {
    this.device = device;
    this.format = format;
    this.init(starCount);
  }

  setExposure(ev: number) { this.exposure = ev; this.updateUniforms(); }
  setStarIntensity(v: number) { this.starIntensity = v; this.updateUniforms(); }
  setViewport(w: number, h: number) { this.viewport.w = w; this.viewport.h = h; this.updateUniforms(); }
  setTwinkleSpeed(s: number) { this.twinkleSpeed = Math.max(0, s); this.updateUniforms(); }
  setTwinkleAmount(a: number) { this.twinkleAmount = Math.max(0, Math.min(1, a)); this.updateUniforms(); }
  setTime(t: number) { this.time = t; this.updateUniforms(); }
  // Interaction API
  setCursor(xPx: number, yPx: number) { this.mousePxX = xPx; this.mousePxY = yPx; this.updateUniforms(); }
  setCursorForce(radiusPx: number, strengthPx: number) { this.forceRadiusPx = Math.max(0, radiusPx); this.forceStrengthPx = strengthPx; this.updateUniforms(); }
  triggerShockwave(xPx: number, yPx: number, ampPx: number = 60, speedPx: number = 1000, widthPx: number = 80, damp: number = 2.0) {
    this.shockCenterX = xPx; this.shockCenterY = yPx; this.shockAmpPx = ampPx; this.shockSpeedPx = speedPx; this.shockWidthPx = widthPx; this.shockDamp = Math.max(0, damp);
    this.shockStartTime = this.time; this.updateUniforms();
  }

  private init(starCount: number) {
    // Geometry: unit quad
    const quad = new Float32Array([
      -0.5, -0.5,
       0.5, -0.5,
       0.5,  0.5,
      -0.5,  0.5
    ]);
    const idx = new Uint16Array([0,1,2, 0,2,3]);

    this.quadVbo = this.device.createBuffer({
      size: quad.byteLength,
      usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST
    });
    this.device.queue.writeBuffer(this.quadVbo, 0, quad);

    this.quadIbo = this.device.createBuffer({
      size: idx.byteLength,
      usage: GPUBufferUsage.INDEX | GPUBufferUsage.COPY_DST
    });
    this.device.queue.writeBuffer(this.quadIbo, 0, idx);

    // Instances
    const data = generateStars({ count: starCount, seed: 1337, bandTiltDeg: 0, bandSigma: 0.25, bandWeight: 0.0 });
    this.starCount = starCount;

    this.instanceBuf = this.device.createBuffer({
      size: data.byteLength,
      usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST
    });
    this.device.queue.writeBuffer(this.instanceBuf, 0, data);

    // Uniforms buffer (expanded for interactions)
    // Layout (float32):
    // [0]=res.x, [1]=res.y, [2]=exposure, [3]=starIntensity,
    // [4]=time, [5]=twinkleSpeed, [6]=twinkleAmount, [7]=pad,
    // [8]=mouse.x, [9]=mouse.y, [10]=forceRadiusPx, [11]=forceStrengthPx,
    // [12]=shock.cx, [13]=shock.cy, [14]=shockStartTime, [15]=shockSpeedPx,
    // [16]=shockAmpPx, [17]=shockWidthPx, [18]=shockDamp, [19]=pad
    this.uniformBuf = this.device.createBuffer({
      size: 20 * 4,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST
    });

    const shader = this.device.createShaderModule({ code: this.wgsl() });

    this.bindGroupLayout = this.device.createBindGroupLayout({
      entries: [{ binding: 0, visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT, buffer: {} }]
    });
    const pipelineLayout = this.device.createPipelineLayout({ bindGroupLayouts: [this.bindGroupLayout] });

    this.pipeline = this.device.createRenderPipeline({
      layout: pipelineLayout,
      vertex: {
        module: shader,
        entryPoint: 'vs',
        buffers: [
          { // quad vertex
            arrayStride: 8,
            stepMode: 'vertex',
            attributes: [{ shaderLocation: 0, offset: 0, format: 'float32x2' }]
          },
          { // instance data: pos(2), size(1), color(3)
            arrayStride: 24,
            stepMode: 'instance',
            attributes: [
              { shaderLocation: 1, offset: 0, format: 'float32x2' },
              { shaderLocation: 2, offset: 8, format: 'float32' },
              { shaderLocation: 3, offset: 12, format: 'float32x3' }
            ]
          }
        ]
      },
      fragment: {
        module: shader,
        entryPoint: 'fs',
        targets: [{ format: this.format }]
      },
      primitive: { topology: 'triangle-list', cullMode: 'none' },
      multisample: { count: 1 }
    });

    this.bindGroup = this.device.createBindGroup({
      layout: this.bindGroupLayout,
      entries: [{ binding: 0, resource: { buffer: this.uniformBuf } }]
    });

    this.updateUniforms();
  }

  render(encoder: GPUCommandEncoder, view: GPUTextureView) {
    const pass = encoder.beginRenderPass({
      colorAttachments: [{ view, clearValue: { r: 0.0, g: 0.0, b: 0.0, a: 1 }, loadOp: 'clear', storeOp: 'store' }]
    });

    pass.setPipeline(this.pipeline);
    pass.setBindGroup(0, this.bindGroup);
    pass.setVertexBuffer(0, this.quadVbo);
    pass.setVertexBuffer(1, this.instanceBuf);
    pass.setIndexBuffer(this.quadIbo, 'uint16');
    pass.drawIndexed(6, this.starCount);

    pass.end();
  }

  private updateUniforms() {
    const data = new Float32Array([
      this.viewport.w, this.viewport.h, this.exposure, this.starIntensity,
      this.time, this.twinkleSpeed, this.twinkleAmount, 0,
      this.mousePxX, this.mousePxY, this.forceRadiusPx, this.forceStrengthPx,
      this.shockCenterX, this.shockCenterY, this.shockStartTime, this.shockSpeedPx,
      this.shockAmpPx, this.shockWidthPx, this.shockDamp, 0,
    ]);
    this.device.queue.writeBuffer(this.uniformBuf, 0, data);
  }

  private wgsl(): string {
    return /* wgsl */`
struct Uniforms {
  resolution : vec2<f32>,
  exposure : f32,
  starIntensity : f32,
  time : f32,
  twinkleSpeed : f32,
  twinkleAmount : f32,
  _pad0 : f32,
  mousePx : vec2<f32>,
  forceRadiusPx : f32,
  forceStrengthPx : f32,
  shockCenterPx : vec2<f32>,
  shockStartTime : f32,
  shockSpeedPx : f32,
  shockAmpPx : f32,
  shockWidthPx : f32,
  shockDamp : f32,
  _pad1 : f32,
};
@group(0) @binding(0) var<uniform> U : Uniforms;

struct VSIn {
  @location(0) pos : vec2<f32>,
  @location(1) starPos : vec2<f32>,
  @location(2) starSize : f32,
  @location(3) starColor : vec3<f32>,
};

struct VSOut {
  @builtin(position) Position : vec4<f32>,
  @location(0) vColor : vec3<f32>,
  @location(1) vCoord : vec2<f32>,
  @location(2) vRand : f32,
};

fn hash21(p: vec2<f32>) -> f32 {
  var p3 = fract(vec3<f32>(p.x, p.y, p.x) * 0.1031);
  let h = dot(p3, p3.yzx + vec3<f32>(33.33, 33.33, 33.33));
  p3 = p3 + vec3<f32>(h, h, h);
  return fract((p3.x + p3.y) * p3.z);
}

@vertex fn vs(input : VSIn) -> VSOut {
  var out : VSOut;
  let px2ndc = vec2<f32>(2.0 / max(U.resolution.x, 1.0), 2.0 / max(U.resolution.y, 1.0));
  let uv = input.starPos * 0.5 + vec2<f32>(0.5, 0.5);
  let starPx = vec2<f32>(uv.x * U.resolution.x, (1.0 - uv.y) * U.resolution.y);
  var dispPx = vec2<f32>(0.0, 0.0);
  // Cursor force field
  if (U.forceRadiusPx > 0.0 && U.forceStrengthPx != 0.0) {
    let d = starPx - U.mousePx;
    let r = length(d);
    if (r < U.forceRadiusPx && r > 1e-3) {
      let fall = 1.0 - (r / U.forceRadiusPx);
      let fall2 = fall * fall;
      let dir = d / r;
      dispPx = dispPx + dir * (U.forceStrengthPx * fall2);
    }
  }
  // Shockwave
  if (U.shockStartTime >= 0.0) {
    let t = max(0.0, U.time - U.shockStartTime);
    let d2 = starPx - U.shockCenterPx;
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
  let ndc = input.starPos + vec2<f32>(dispPx.x * px2ndc.x, -dispPx.y * px2ndc.y) + input.pos * input.starSize * px2ndc;
  out.Position = vec4<f32>(ndc, 0.0, 1.0);
  out.vCoord = input.pos;
  out.vColor = input.starColor * (pow(2.0, U.exposure) * U.starIntensity);
  out.vRand = hash21(input.starPos * 123.47 + input.starColor.rg * 71.13 + vec2<f32>(input.starSize, input.starSize));
  return out;
}

fn aces_tonemap(x: vec3<f32>) -> vec3<f32> {
  let a = 2.51;
  let b = 0.03;
  let c = 2.43;
  let d = 0.59;
  let e = 0.14;
  return clamp((x*(a*x + b)) / (x*(c*x + d) + e), vec3<f32>(0.0), vec3<f32>(1.0));
}

@fragment fn fs(@location(0) vColor: vec3<f32>, @location(1) vCoord: vec2<f32>, @location(2) vRand: f32) -> @location(0) vec4<f32> {
  let r = length(vCoord);
  if (r > 0.5) { discard; }
  let ph = vRand * 6.2831853;
  let s1 = sin(U.time * U.twinkleSpeed * 1.0 + ph);
  let s2 = sin(U.time * U.twinkleSpeed * 1.7 + ph*1.3);
  let tw = 0.5 + 0.5 * (0.6*s1 + 0.4*s2);
  let scale = 1.0 + U.twinkleAmount * (tw - 0.5) * 2.0;
  var col = vColor * scale;
  col = aces_tonemap(col);
  return vec4<f32>(col, 1.0);
}
`;
  }

  setStarCount(count: number) {
    // regenerate instance buffer data for new star count
    const data = generateStars({ count, seed: 1337, bandTiltDeg: 0, bandSigma: 0.25, bandWeight: 0.0 });
    this.starCount = count;
    // destroy previous buffer if possible
    try { (this.instanceBuf as any)?.destroy?.(); } catch {}
    this.instanceBuf = this.device.createBuffer({ size: data.byteLength, usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST });
    this.device.queue.writeBuffer(this.instanceBuf, 0, data);
  }
}
