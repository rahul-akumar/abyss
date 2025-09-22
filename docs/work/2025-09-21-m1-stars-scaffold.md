# M1: Star Field Prototype scaffolding

Date: 2025-09-21T20:07:18Z
Author: Agent Mode

Summary
- Implemented a minimal star field renderer per PRD M1 requirements:
  - Procedural stars (positions, sizes, colors) with a tilted galactic band, magnitude-like brightness distribution, and blackbody color approximation.
  - WebGPU pass using instanced quads (two triangles) with per-instance star attributes; ACES tonemap and exposure uniform.
  - WebGL2 fallback pass with the same instanced approach; ACES tonemap and exposure uniform.
  - Engine integration, resize handling, and an exposure attribute on the <abyss-veil> element.

Why this solution
- Instanced quads work uniformly across WebGPU and WebGL2 and avoid WebGPU’s lack of variable point size.
- CPU-side color mapping keeps shaders simple and enables plausible star colors with a small, deterministic generator.
- Exposure is uniform-driven to align with later pipeline passes (tonemap, trails) and Quality Auto.

Alternatives considered (and why not used)
- GL_POINTS for both backends: WebGPU doesn’t support per-vertex point size; would require geometry-like expansion.
- GPU-side blackbody mapping: feasible but more complex initially; CPU-side mapping is sufficient and fast for M1.
- Single shared shader via transpile: overkill for this milestone; kept separate WGSL/GLSL.

Exact changes

1) Shared utilities
- File: D:\Github\abyss\src\renderer\utils\random.ts (new)
```ts path=D:\Github\abyss\src\renderer\utils\random.ts start=1
export function mulberry32(seed: number): () => number {
  let t = seed >>> 0;
  return function () {
    t += 0x6D2B79F5;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}
...
```
- File: D:\Github\abyss\src\renderer\utils\color.ts (new)
```ts path=D:\Github\abyss\src\renderer\utils\color.ts start=1
export function kelvinToSRGB(tempK: number): { r: number; g: number; b: number } {
  const t = Math.max(1000, Math.min(40000, tempK)) / 100;
  ...
}
export function kelvinToLinear(tempK: number) { ... }
```

2) Star generation
- File: D:\Github\abyss\src\renderer\stars\generate.ts (new)
```ts path=D:\Github\abyss\src\renderer\stars\generate.ts start=1
export function generateStars(opts: StarGenOptions): StarData {
  const count = Math.max(1, Math.floor(opts.count));
  ... // band tilt, gaussian band distribution, brightness, temperature→RGB, interleaved data
}
```

3) WebGPU star pass
- File: D:\Github\abyss\src\renderer\stars\webgpuStarPass.ts (new)
```ts path=D:\Github\abyss\src\renderer\stars\webgpuStarPass.ts start=1
import { generateStars } from './generate';
...
this.pipeline = this.device.createRenderPipeline({
  vertex: { ... },
  fragment: { ... },
  primitive: { topology: 'triangle-list', cullMode: 'none' }
});
...
@vertex fn vs(...) -> ... { /* per-instance expansion and exposure */ }
@fragment fn fs(...) -> ... { /* circular mask + ACES tonemap */ }
```

4) WebGL2 star pass
- File: D:\Github\abyss\src\renderer\stars\webgl2StarPass.ts (new)
```ts path=D:\Github\abyss\src\renderer\stars\webgl2StarPass.ts start=1
// Instanced quads with attributes aPos, aSize, aColor and ACES tonemap in FS
void main() {
  vec2 px2ndc = vec2(2.0 / max(uResolution.x, 1.0), 2.0 / max(uResolution.y, 1.0));
  vec2 ndc = aPos + aCorner * aSize * px2ndc;
  gl_Position = vec4(ndc, 0.0, 1.0);
  ...
}
```

5) Engine integration
- File: D:\Github\abyss\src\renderer\webgpu.ts
  - Added imports and members for WebGPUStarPass
  - Constructed star pass on start and render inside loop
  - Resize updates star pass viewport
  - Added setExposure(ev)
```ts path=D:\Github\abyss\src\renderer\webgpu.ts start=1
import { WebGPUStarPass } from './stars/webgpuStarPass';
...
this.stars = new WebGPUStarPass(device, format, 30000);
this.stars.setExposure(this.exposureEV);
this.stars.setViewport(this.canvas.width, this.canvas.height);
...
  private loop = () => {
    if (this.device && this.ctx && this.stars) {
      const view = this.ctx.getCurrentTexture().createView();
      const encoder = this.device.createCommandEncoder();
      this.stars.render(encoder, view);
      this.device.queue.submit([encoder.finish()]);
    }
    requestAnimationFrame(this.loop);
  };
```
- File: D:\Github\abyss\src\renderer\webgl2.ts
  - Added generateStars + WebGL2StarPass imports
  - Built pass on start and render inside loop; resize updates viewport; added setExposure
```ts path=D:\Github\abyss\src\renderer\webgl2.ts start=1
import { generateStars } from './stars/generate';
import { WebGL2StarPass } from './stars/webgl2StarPass';
...
const starData = generateStars({ count: 20000, ... });
this.stars = new WebGL2StarPass(gl, starData);
...
```

6) API surface updates
- File: D:\Github\abyss\src\renderer\index.ts
  - Added setExposure(ev: number) to IRenderer and forwarded in Engine
```ts path=D:\Github\abyss\src\renderer\index.ts start=11
export interface IRenderer {
  ...
  setExposure(ev: number): void;
}
...
setExposure(ev: number) { this.backend.setExposure(ev); }
```

7) Element attribute
- File: D:\Github\abyss\src\elements\abyss-veil.ts
  - Observes and forwards "exposure" to the engine
```ts path=D:\Github\abyss\src\elements\abyss-veil.ts start=9
static get observedAttributes() { return ['preset','quality','reduce-motion','exposure']; }
...
this.#engine.setExposure(exposure);
...
} else if (name === 'exposure') {
  const exposure = parseFloat(this.getAttribute('exposure') || '0') || 0;
  this.#engine.setExposure(exposure);
}
```

Verification steps
- npm run dev
- In index.html, tweak exposure: <abyss-veil exposure="0" ...> then try 1 or -1
- You should see a dark background with a dense star band tilted ~12°, color-varied stars, exposure responding.
- Test in a browser with WebGPU; test in Firefox (WebGL2 fallback) to verify consistent visuals.
