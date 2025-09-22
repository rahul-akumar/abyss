export class WebGPUCompositePass {
  private device: GPUDevice;
  private format: GPUTextureFormat;
  private pipeline!: GPURenderPipeline;
  private bindGroupLayout!: GPUBindGroupLayout;
  private bindGroup!: GPUBindGroup;
  private sampler!: GPUSampler;
  private uniformBuf!: GPUBuffer; // currently unused but reserved (e.g., exposure)
  private starsView?: GPUTextureView;
  private galaxyView?: GPUTextureView;
  private nebulaView?: GPUTextureView;

  constructor(device: GPUDevice, format: GPUTextureFormat) {
    this.device = device;
    this.format = format;
    this.init();
  }

  setInputs(stars: GPUTextureView, galaxy: GPUTextureView, nebula?: GPUTextureView) {
    this.starsView = stars;
    this.galaxyView = galaxy;
    this.nebulaView = nebula;
    this.updateBindGroup();
  }

  private init() {
    const shader = this.device.createShaderModule({ code: this.wgsl() });
    this.sampler = this.device.createSampler({ magFilter: 'linear', minFilter: 'linear' });
    this.uniformBuf = this.device.createBuffer({ size: 16, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });

    this.bindGroupLayout = this.device.createBindGroupLayout({
      entries: [
        { binding: 0, visibility: GPUShaderStage.FRAGMENT, sampler: {} },
        { binding: 1, visibility: GPUShaderStage.FRAGMENT, texture: {} },
        { binding: 2, visibility: GPUShaderStage.FRAGMENT, texture: {} },
        { binding: 3, visibility: GPUShaderStage.FRAGMENT, texture: {} },
      ]
    });
    const layout = this.device.createPipelineLayout({ bindGroupLayouts: [this.bindGroupLayout] });

    this.pipeline = this.device.createRenderPipeline({
      layout,
      vertex: { module: shader, entryPoint: 'vs' },
      fragment: { module: shader, entryPoint: 'fs', targets: [{ format: this.format }] },
      primitive: { topology: 'triangle-list', cullMode: 'none' }
    });

    // Empty bind group initially; will be updated with real views
    this.bindGroup = this.device.createBindGroup({
      layout: this.bindGroupLayout,
      entries: [
        { binding: 0, resource: this.sampler },
        { binding: 1, resource: this.device.createTexture({size:{width:1,height:1,depthOrArrayLayers:1}, format: 'rgba8unorm', usage: GPUTextureUsage.TEXTURE_BINDING}).createView() },
        { binding: 2, resource: this.device.createTexture({size:{width:1,height:1,depthOrArrayLayers:1}, format: 'rgba8unorm', usage: GPUTextureUsage.TEXTURE_BINDING}).createView() },
        { binding: 3, resource: this.device.createTexture({size:{width:1,height:1,depthOrArrayLayers:1}, format: 'rgba8unorm', usage: GPUTextureUsage.TEXTURE_BINDING}).createView() },
      ]
    });
  }

  private updateBindGroup() {
    if (!this.starsView || !this.galaxyView) return;
    this.bindGroup = this.device.createBindGroup({
      layout: this.bindGroupLayout,
      entries: [
        { binding: 0, resource: this.sampler },
        { binding: 1, resource: this.starsView },
        { binding: 2, resource: this.galaxyView },
        { binding: 3, resource: (this.nebulaView ?? this.galaxyView) },
      ]
    });
  }

  render(encoder: GPUCommandEncoder, view: GPUTextureView) {
    const pass = encoder.beginRenderPass({ colorAttachments: [{ view, clearValue: { r: 0.02, g: 0.03, b: 0.06, a: 1 }, loadOp: 'clear', storeOp: 'store' }] });
    pass.setPipeline(this.pipeline);
    pass.setBindGroup(0, this.bindGroup);
    pass.draw(3, 1, 0, 0);
    pass.end();
  }

  private wgsl(): string {
    return /* wgsl */`
struct VSOut { @builtin(position) Position: vec4<f32>, @location(0) vUv: vec2<f32>, };

@vertex fn vs(@builtin(vertex_index) vi: u32) -> VSOut {
  var pos = array<vec2<f32>, 3>(vec2<f32>(-1.0, -3.0), vec2<f32>(-1.0, 1.0), vec2<f32>(3.0, 1.0));
  var uv = array<vec2<f32>, 3>(vec2<f32>(0.0, 2.0), vec2<f32>(0.0, 0.0), vec2<f32>(2.0, 0.0));
  var out: VSOut;
  out.Position = vec4<f32>(pos[vi], 0.0, 1.0);
  out.vUv = uv[vi];
  return out;
}

@group(0) @binding(0) var samp: sampler;
@group(0) @binding(1) var texStars: texture_2d<f32>;
@group(0) @binding(2) var texGalaxy: texture_2d<f32>;
@group(0) @binding(3) var texNebula: texture_2d<f32>;

@fragment fn fs(@location(0) vUv: vec2<f32>) -> @location(0) vec4<f32> {
  let cs = textureSample(texStars, samp, vUv);
  let cg = textureSample(texGalaxy, samp, vUv);
  let cn = textureSample(texNebula, samp, vUv);
  var col = min(cs.rgb + cg.rgb, vec3<f32>(1.0));
  // Premultiplied alpha over for nebula
  col = col * (1.0 - cn.a) + cn.rgb;
  return vec4<f32>(col, 1.0);
}
`;
  }
}
