export interface MeteorConfigGPU {
  enabled: boolean;
  ratePerMin: number;
  speedPx: number;
  lengthPx: number;
  widthPx: number;
  brightness: number;
}

interface MeteorInst {
  cxNdc: number; cyNdc: number; // center in NDC
  vxNdc: number; vyNdc: number; // velocity in NDC per second
  dirX: number; dirY: number;   // orientation (normalized)
  life: number;                 // remaining life seconds
}

export class WebGPUMeteorPass {
  private device: GPUDevice;
  private format: GPUTextureFormat;
  private pipeline!: GPURenderPipeline;
  private bindGroupLayout!: GPUBindGroupLayout;
  private bindGroup!: GPUBindGroup;
  private quadVbo!: GPUBuffer;
  private quadIbo!: GPUBuffer;
  private instanceBuf!: GPUBuffer;
  private uniformBuf!: GPUBuffer;
  private capacity = 64;
  private active: MeteorInst[] = [];
  private spawnAccum = 0;
  private viewport = { w: 1, h: 1 };
  private config: MeteorConfigGPU = { enabled: true, ratePerMin: 8, speedPx: 500, lengthPx: 180, widthPx: 2, brightness: 1.5 };

  constructor(device: GPUDevice, format: GPUTextureFormat) { this.device = device; this.format = format; this.init(); }

  setViewport(w: number, h: number) { this.viewport.w = w; this.viewport.h = h; this.updateUniforms(); }
  setConfig(cfg: Partial<MeteorConfigGPU>) { this.config = { ...this.config, ...cfg }; this.updateUniforms(); }

  update(dt: number) {
    if (!this.config.enabled) return;
    const ratePerSec = this.config.ratePerMin / 60;
    this.spawnAccum += dt * ratePerSec;
    while (this.spawnAccum >= 1 && this.active.length < this.capacity) {
      this.spawnAccum -= 1;
      const m = this.spawnOne();
      if (m) this.active.push(m);
    }
    const W = this.viewport.w, H = this.viewport.h;
    const margin = 64;
    const killXMin = -margin, killXMax = W + margin;
    const killYMin = -margin, killYMax = H + margin;
    const kept: MeteorInst[] = [];
    for (const m of this.active) {
      m.cxNdc += m.vxNdc * dt; m.cyNdc += m.vyNdc * dt; m.life -= dt;
      const xPx = (m.cxNdc * 0.5 + 0.5) * W;
      const yPx = (m.cyNdc * 0.5 + 0.5) * H;
      if (m.life > 0 && xPx > killXMin && xPx < killXMax && yPx > killYMin && yPx < killYMax) kept.push(m);
    }
    this.active = kept;
  }

  render(encoder: GPUCommandEncoder, view: GPUTextureView) {
    if (!this.config.enabled || this.active.length === 0) return;
    // Update instance buffer
    const data = new Float32Array(this.active.length * 7);
    for (let i = 0; i < this.active.length; i++) {
      const m = this.active[i];
      const base = i * 7;
      data[base+0] = m.cxNdc; data[base+1] = m.cyNdc;
      data[base+2] = m.dirX;  data[base+3] = m.dirY;
      data[base+4] = this.config.lengthPx;
      data[base+5] = this.config.widthPx;
      data[base+6] = this.config.brightness;
    }
    this.device.queue.writeBuffer(this.instanceBuf, 0, data);

    const pass = encoder.beginRenderPass({ colorAttachments: [{ view, loadOp: 'load', storeOp: 'store' }] });
    pass.setPipeline(this.pipeline);
    pass.setBindGroup(0, this.bindGroup);
    pass.setVertexBuffer(0, this.quadVbo);
    pass.setVertexBuffer(1, this.instanceBuf);
    pass.setIndexBuffer(this.quadIbo, 'uint16');
    pass.drawIndexed(6, this.active.length);
    pass.end();
  }

  private spawnOne(): MeteorInst | null {
    const W = this.viewport.w, H = this.viewport.h; if (W <= 0 || H <= 0) return null;
    const margin = 64;
    const side = Math.floor(Math.random()*4);
    const start = { x: 0, y: 0 };
    if (side === 0) { start.x = -margin; start.y = Math.random()*H; }
    else if (side === 1) { start.x = Math.random()*W; start.y = -margin; }
    else if (side === 2) { start.x = W+margin; start.y = Math.random()*H; }
    else { start.x = Math.random()*W; start.y = H+margin; }
    const target = { x: (Math.random()*0.6+0.2)*W, y: (Math.random()*0.6+0.2)*H };
    const dx = target.x - start.x, dy = target.y - start.y; const L = Math.hypot(dx,dy); if (L<1e-3) return null;
    const nx = dx/L, ny = dy/L; const speedPx = this.config.speedPx;
    const vxNdc = (speedPx*nx) * (2/Math.max(1,W));
    const vyNdc = (speedPx*ny) * (2/Math.max(1,H));
    const halfLen = this.config.lengthPx * 0.5;
    const cxPx = start.x + nx*halfLen; const cyPx = start.y + ny*halfLen;
    const cxNdc = (cxPx/W)*2 - 1; const cyNdc = (cyPx/H)*2 - 1;
    const travelPx = Math.hypot(W,H) + 2*margin; const life = Math.min(5.0, travelPx/Math.max(1,speedPx));
    return { cxNdc, cyNdc, vxNdc, vyNdc, dirX: nx, dirY: ny, life };
  }

  private updateUniforms() {
    const u = new Float32Array([this.viewport.w, this.viewport.h, this.config.brightness, 0]);
    this.device.queue.writeBuffer(this.uniformBuf, 0, u);
  }

  private init() {
    const shader = this.device.createShaderModule({ code: this.wgsl() });
    // Quad
    const quad = new Float32Array([ -0.5,-0.5, 0.5,-0.5, 0.5,0.5, -0.5,0.5 ]);
    this.quadVbo = this.device.createBuffer({ size: quad.byteLength, usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST });
    this.device.queue.writeBuffer(this.quadVbo, 0, quad);
    const idx = new Uint16Array([0,1,2, 0,2,3]);
    this.quadIbo = this.device.createBuffer({ size: idx.byteLength, usage: GPUBufferUsage.INDEX | GPUBufferUsage.COPY_DST });
    this.device.queue.writeBuffer(this.quadIbo, 0, idx);

    // Instances
    this.instanceBuf = this.device.createBuffer({ size: this.capacity * 7 * 4, usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST });

    // Uniforms: vec2 res, float brightness, pad
    this.uniformBuf = this.device.createBuffer({ size: 16, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });

    this.bindGroupLayout = this.device.createBindGroupLayout({ entries: [ { binding:0, visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT, buffer:{} }, ] });
    const layout = this.device.createPipelineLayout({ bindGroupLayouts: [this.bindGroupLayout] });

    this.pipeline = this.device.createRenderPipeline({
      layout,
      vertex: { module: shader, entryPoint: 'vs', buffers: [
        { arrayStride: 8, stepMode: 'vertex', attributes: [{ shaderLocation:0, offset:0, format:'float32x2'}] },
        { arrayStride: 28, stepMode: 'instance', attributes: [
          { shaderLocation:1, offset:0, format:'float32x2' }, // center
          { shaderLocation:2, offset:8, format:'float32x2' }, // dir
          { shaderLocation:3, offset:16, format:'float32' },  // lenPx
          { shaderLocation:4, offset:20, format:'float32' },  // widthPx
          { shaderLocation:5, offset:24, format:'float32' },  // brightness
        ]}
      ] },
      fragment: { module: shader, entryPoint: 'fs', targets: [{ format: this.format, blend: {
        color: { srcFactor: 'one', dstFactor: 'one', operation: 'add' },
        alpha: { srcFactor: 'one', dstFactor: 'one', operation: 'add' },
      }}] },
      primitive: { topology: 'triangle-list', cullMode: 'none' },
    });

    this.bindGroup = this.device.createBindGroup({ layout: this.bindGroupLayout, entries: [ { binding:0, resource: { buffer: this.uniformBuf } } ] });

    this.updateUniforms();
  }

  private wgsl(): string { return /* wgsl */`
struct Uniforms { res: vec2<f32>, brightness: f32, _pad: f32 };
@group(0) @binding(0) var<uniform> U: Uniforms;

struct VSIn {
  @location(0) corner: vec2<f32>,
  @location(1) center: vec2<f32>,
  @location(2) dir: vec2<f32>,
  @location(3) lenPx: f32,
  @location(4) widthPx: f32,
  @location(5) bright: f32,
};

struct VSOut { @builtin(position) Position: vec4<f32>, @location(0) rectCoord: vec2<f32>, @location(1) bright: f32 };

@vertex fn vs(input: VSIn) -> VSOut {
  let u = normalize(input.dir);
  let v = vec2<f32>(-u.y, u.x);
  let px2ndc = vec2<f32>(2.0 / max(U.res.x, 1.0), 2.0 / max(U.res.y, 1.0));
  let off = (u * (input.corner.x * input.lenPx) + v * (input.corner.y * input.widthPx)) * px2ndc;
  var out: VSOut;
  out.Position = vec4<f32>(input.center + off, 0.0, 1.0);
  out.rectCoord = input.corner;
  out.bright = input.bright;
  return out;
}

@fragment fn fs(@location(0) rectCoord: vec2<f32>, @location(1) bright: f32) -> @location(0) vec4<f32> {
  let t = rectCoord.x * 0.5 + 0.5; // 0 tail, 1 head
  let w = 1.0 - smoothstep(0.45, 0.5, abs(rectCoord.y));
  let tail = exp(-6.0 * (1.0 - t));
  let intensity = bright * tail * w * U.brightness;
  return vec4<f32>(vec3<f32>(intensity), 1.0);
}
`; }
}