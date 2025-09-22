export class WebGPUAuroraPass {
  private device: GPUDevice;
  private format: GPUTextureFormat;
  private pipeline!: GPURenderPipeline;
  private bindGroupLayout!: GPUBindGroupLayout;
  private bindGroup!: GPUBindGroup;
  private uniformBuf!: GPUBuffer;
  private viewport = { w: 1, h: 1 };
  private time = 0;
  private amplitude = 1.0;
  private blend = 0.5;
  private strength = 1.0;
  private speed = 1.0;
  private colorStops: [number, number, number][] = [
    [0.3215686275, 0.1529411765, 1.0],
    [0.4862745098, 1.0, 0.4039215686],
    [0.3215686275, 0.1529411765, 1.0],
    [0.1, 0.3, 0.9],
    [0.7, 0.2, 0.6],
  ];

  constructor(device: GPUDevice, format: GPUTextureFormat) {
    this.device = device;
    this.format = format;
    this.init();
  }

  setViewport(w: number, h: number) { this.viewport.w = w; this.viewport.h = h; this.updateUniforms(); }
  setTime(t: number) { this.time = t; this.updateUniforms(); }
  setParams(amplitude: number, blend: number, speed: number) { this.amplitude = amplitude; this.blend = blend; this.speed = speed; this.updateUniforms(); }
  setStrength(strength: number) { this.strength = Math.max(0, strength); this.updateUniforms(); }
  setStops(stops: [number, number, number][]) { const MAX=8; const n = Math.max(2, Math.min(MAX, stops.length)); this.colorStops = stops.slice(0,n) as any; this.updateUniforms(); }

  private init() {
    // Allocate with padding/alignment margin
    // generous buffer size for expanded uniforms
    this.uniformBuf = this.device.createBuffer({ size: 16 * 16, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
    const shader = this.device.createShaderModule({ code: this.wgsl() });

    this.bindGroupLayout = this.device.createBindGroupLayout({ entries: [
      { binding: 0, visibility: GPUShaderStage.FRAGMENT | GPUShaderStage.VERTEX, buffer: {} },
    ]});
    const layout = this.device.createPipelineLayout({ bindGroupLayouts: [this.bindGroupLayout] });

    this.pipeline = this.device.createRenderPipeline({
      layout,
      vertex: { module: shader, entryPoint: 'vs' },
      fragment: { module: shader, entryPoint: 'fs', targets: [{ format: this.format, blend: { color: { srcFactor: 'one', dstFactor: 'one-minus-src-alpha', operation: 'add' }, alpha: { srcFactor: 'one', dstFactor: 'one-minus-src-alpha', operation: 'add' } } }] },
      primitive: { topology: 'triangle-list', cullMode: 'none' },
    });

    this.bindGroup = this.device.createBindGroup({ layout: this.bindGroupLayout, entries: [
      { binding: 0, resource: { buffer: this.uniformBuf } },
    ]});

    this.updateUniforms();
  }

  render(encoder: GPUCommandEncoder, view: GPUTextureView) {
    const pass = encoder.beginRenderPass({ colorAttachments: [{ view, loadOp: 'load', storeOp: 'store' }] });
    pass.setPipeline(this.pipeline);
    pass.setBindGroup(0, this.bindGroup);
    pass.draw(3, 1, 0, 0);
    pass.end();
  }

  private updateUniforms() {
    const t = this.time * this.speed * 0.1;
    const MAX = 8;
    const n = Math.min(MAX, Math.max(2, this.colorStops.length));
    const data = new Float32Array(4 + 4 + MAX*4); // header 8 floats + 8 vec4s
    let o = 0;
    // resolution.xy, time, amplitude
    data[o++] = this.viewport.w; data[o++] = this.viewport.h; data[o++] = t; data[o++] = this.amplitude;
    // blend, strength, stopCount, pad
    data[o++] = this.blend; data[o++] = this.strength; data[o++] = n; data[o++] = 0;
    // colors: 8 vec4, fill remainder with last
    const last = (this.colorStops[n-1] ?? [0,0,0]);
    for (let i = 0; i < MAX; i++) {
      const c = i < this.colorStops.length ? this.colorStops[i] : last;
      data[o++] = c[0]; data[o++] = c[1]; data[o++] = c[2]; data[o++] = 0;
    }
    this.device.queue.writeBuffer(this.uniformBuf, 0, data);
  }

  private wgsl(): string {
    return /* wgsl */`
struct Uniforms {
  resolution: vec2<f32>, time: f32, amplitude: f32,
  blend: f32, strength: f32, stopCount: f32, _pad0: f32,
  color0: vec4<f32>,
  color1: vec4<f32>,
  color2: vec4<f32>,
  color3: vec4<f32>,
  color4: vec4<f32>,
  color5: vec4<f32>,
  color6: vec4<f32>,
  color7: vec4<f32>,
};
@group(0) @binding(0) var<uniform> U: Uniforms;

struct VSOut { @builtin(position) Position: vec4<f32>, @location(0) vUv: vec2<f32>, };

@vertex fn vs(@builtin(vertex_index) vi: u32) -> VSOut {
  var pos = array<vec2<f32>, 3>(vec2<f32>(-1.0, -3.0), vec2<f32>(-1.0, 1.0), vec2<f32>(3.0, 1.0));
  var uv = array<vec2<f32>, 3>(vec2<f32>(0.0, 2.0), vec2<f32>(0.0, 0.0), vec2<f32>(2.0, 0.0));
  var out: VSOut;
  out.Position = vec4<f32>(pos[vi], 0.0, 1.0);
  out.vUv = uv[vi];
  return out;
}

fn mod289v3(x: vec3<f32>) -> vec3<f32> { return x - floor(x / vec3<f32>(289.0)) * vec3<f32>(289.0); }
fn mod289v2(x: vec2<f32>) -> vec2<f32> { return x - floor(x / vec2<f32>(289.0)) * vec2<f32>(289.0); }
fn permute(x: vec3<f32>) -> vec3<f32> {
  return mod289v3(((x * 34.0) + vec3<f32>(1.0)) * x);
}

fn snoise(v: vec2<f32>) -> f32 {
  let C = vec4<f32>(0.211324865405187, 0.366025403784439, -0.577350269189626, 0.024390243902439);
  var i = floor(v + vec2<f32>(dot(v, C.yy)));
  let x0 = v - i + vec2<f32>(dot(i, C.xx));
  let i1 = select(vec2<f32>(0.0, 1.0), vec2<f32>(1.0, 0.0), x0.x > x0.y);
  var x12 = vec4<f32>(x0.xy, x0.xy) + C.xxzz;
  let x12xy = (vec2<f32>(x12.x, x12.y) - i1);
  x12 = vec4<f32>(x12xy.x, x12xy.y, x12.z, x12.w);
  i = mod289v2(i);
  let p = permute( permute(vec3<f32>(i.y + 0.0, i.y + i1.y, i.y + 1.0)) + vec3<f32>(i.x + 0.0, i.x + i1.x, i.x + 1.0) );
  var m = max(vec3<f32>(0.5) - vec3<f32>(dot(x0, x0), dot(x12.xy, x12.xy), dot(x12.zw, x12.zw)), vec3<f32>(0.0));
  m = m * m; m = m * m;
  let x = 2.0 * fract(p * C.www) - vec3<f32>(1.0);
  let h = abs(x) - vec3<f32>(0.5);
  let ox = floor(x + vec3<f32>(0.5));
  let a0 = x - ox;
  m = m * (1.79284291400159 - 0.85373472095314 * (a0*a0 + h*h));
  let g = vec3<f32>(a0.x * x0.x + h.x * x0.y, a0.y * x12.x + h.y * x12.y, a0.z * x12.z + h.z * x12.w);
  return 130.0 * dot(m, g);
}

fn getColor(i: u32) -> vec3<f32> {
  switch i {
    case 0u: { return U.color0.xyz; }
    case 1u: { return U.color1.xyz; }
    case 2u: { return U.color2.xyz; }
    case 3u: { return U.color3.xyz; }
    case 4u: { return U.color4.xyz; }
    case 5u: { return U.color5.xyz; }
    case 6u: { return U.color6.xyz; }
    default: { return U.color7.xyz; }
  }
}

fn rampColor(factor: f32) -> vec3<f32> {
  // Evenly spaced stops across [0,1]
  let n = max(2.0, U.stopCount);
  let pos = clamp(factor, 0.0, 1.0) * (n - 1.0);
  let i = u32(floor(pos));
  let i2 = min(i + 1u, u32(n - 1.0));
  let t = fract(pos);
  let c0 = getColor(i);
  let c1 = getColor(i2);
  return mix(c0, c1, t);
}

@fragment fn fs(@location(0) vUv: vec2<f32>) -> @location(0) vec4<f32> {
  let fragCoord = vUv * U.resolution;
  let uv0 = fragCoord / U.resolution;
  let uv = vec2<f32>(uv0.x, 1.0 - uv0.y);
  let colRamp = rampColor(uv.x);
  var height = snoise(vec2<f32>(uv.x * 2.0 + U.time * 0.1, U.time * 0.25)) * 0.5 * U.amplitude;
  height = exp(height);
  height = (uv.y * 2.0 - height + 0.2);
  let intensity = 0.6 * height;
  let midPoint = 0.20;
  let a = smoothstep(midPoint - U.blend * 0.5, midPoint + U.blend * 0.5, intensity) * U.strength;
  let col = intensity * colRamp;
  return vec4<f32>(col * a, a);
}
`;
  }
}
