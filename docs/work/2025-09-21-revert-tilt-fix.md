# Revert: Band tilt shader changes (restore CPU-side rotation)

Date: 2025-09-21T20:17:57Z
Author: Agent Mode

Summary
- Status: FAILED experiment — do not retry shader-based band tilt. Outcome was worse visuals in target environment.
- Reverted the previous change that rotated star positions in the shaders and generated unrotated star coordinates.
- Restored the original behavior: apply band tilt on the CPU during star generation; shaders render positions as-is.
- Reason: The shader-based rotation made visuals worse in your environment; you requested a full revert.

Do not retry rationale
- Rotating the band in the shader affected on-screen geometry in a way that conflicted with the expected axis alignment (and future layered passes).
- The per-instance position rotation interacts with pixel-space expansion of the quads and resolution scaling, leading to subtle artifacts and a “tilted canvas” impression.
- We will keep all canvas/UI axis-aligned and handle tilt at the data-generation stage or in a separate galaxy pass.

Why this revert
- Keeps canvas axis untouched and returns to the prior working look where only the band appears tilted.
- Minimizes risk before we pursue any further refinement of band tilt.

Exact changes

1) D:\Github\abyss\src\renderer\stars\generate.ts
- Restored tilt calculations and CPU-side rotation of (u,v) → (x,y).
- Before (lines 18–20, 38–40):
```ts path=D:\Github\abyss\src\renderer\stars\generate.ts start=18
  // Note: Tilt is applied in-shader to keep canvas axis-aligned. Generate band in local (u,v) space.
  const sigma = opts.bandSigma ?? 0.25;
  const bandW = Math.min(1, Math.max(0, opts.bandWeight ?? 0.7));
...
    // Keep in band frame for shader rotation; clamp to NDC bounds softly
    let x = Math.max(-1.0, Math.min(1.0, u));
    let y = Math.max(-1.0, Math.min(1.0, v));
```
- After:
```ts path=D:\Github\abyss\src\renderer\stars\generate.ts start=18
  const tilt = ((opts.bandTiltDeg ?? 12) * Math.PI) / 180;
  const cosT = Math.cos(tilt);
  const sinT = Math.sin(tilt);
  const sigma = opts.bandSigma ?? 0.25;
  const bandW = Math.min(1, Math.max(0, opts.bandWeight ?? 0.7));
...
    // Rotate from band frame to screen frame with tilt
    let x = u * cosT - v * sinT;
    let y = u * sinT + v * cosT;
    // Clamp to NDC bounds softly
    x = Math.max(-1.0, Math.min(1.0, x));
    y = Math.max(-1.0, Math.min(1.0, y));
```

2) D:\Github\abyss\src\renderer\stars\webgpuStarPass.ts
- Removed tilt uniform and shader-side rotation; Uniforms restored to have _pad instead of tilt.
- Before (snippets around uniforms and VS):
```wgsl path=D:\Github\abyss\src\renderer\stars\webgpuStarPass.ts start=134
struct Uniforms {
  resolution : vec2<f32>,
  exposure : f32,
  tiltRad : f32,
};
...
  // Rotate star position by tilt around origin; keep quad axis-aligned
  let c = cos(U.tiltRad);
  let s = sin(U.tiltRad);
  let p = vec2<f32>(input.starPos.x, input.starPos.y);
  let pr = vec2<f32>(p.x * c - p.y * s, p.x * s + p.y * c);
  let ndc = pr + off;
```
- After:
```wgsl path=D:\Github\abyss\src\renderer\stars\webgpuStarPass.ts start=134
struct Uniforms {
  resolution : vec2<f32>,
  exposure : f32,
  _pad : f32,
};
...
  let ndc = vec2<f32>(input.starPos.x, input.starPos.y) + off;
```
- Also removed class members/methods: tiltRad and setTiltDeg; updateUniforms now writes a 0 pad.

3) D:\Github\abyss\src\renderer\stars\webgl2StarPass.ts
- Removed uTilt uniform, tiltRad property, and setTiltDeg.
- Restored VS main to compute ndc = aPos + aCorner * aSize * px2ndc without rotation.
- Before (snippets):
```glsl path=D:\Github\abyss\src\renderer\stars\webgl2StarPass.ts start=58
uniform vec2 uResolution;
uniform float uExposure;
uniform float uTilt;
...
  // Rotate band position by tilt; keep quad axis-aligned
  float c = cos(uTilt);
  float s = sin(uTilt);
  vec2 pr = vec2(aPos.x * c - aPos.y * s, aPos.x * s + aPos.y * c);
  vec2 ndc = pr + aCorner * aSize * px2ndc;
```
- After:
```glsl path=D:\Github\abyss\src\renderer\stars\webgl2StarPass.ts start=56
uniform vec2 uResolution;
uniform float uExposure;
...
  vec2 px2ndc = vec2(2.0 / max(uResolution.x, 1.0), 2.0 / max(uResolution.y, 1.0));
  vec2 ndc = aPos + aCorner * aSize * px2ndc;
  gl_Position = vec4(ndc, 0.0, 1.0);
```

4) D:\Github\abyss\src\renderer\webgpu.ts and D:\Github\abyss\src\renderer\webgl2.ts
- Removed calls to setTiltDeg(12) when constructing the star pass.
- Before:
```ts path=D:\Github\abyss\src\renderer\webgpu.ts start=46
this.stars = new WebGPUStarPass(device, format, 30000);
this.stars.setExposure(this.exposureEV);
this.stars.setTiltDeg(12);
this.stars.setViewport(this.canvas.width, this.canvas.height);
```
- After:
```ts path=D:\Github\abyss\src\renderer\webgpu.ts start=46
this.stars = new WebGPUStarPass(device, format, 30000);
this.stars.setExposure(this.exposureEV);
this.stars.setViewport(this.canvas.width, this.canvas.height);
```

Verification
- npm run dev
- Visual: canvas remains axis-aligned; band of stars appears tilted as before; no warping from shader rotation.
- Test both WebGPU and WebGL2 fallback.
