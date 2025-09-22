# M3: Volumetric Nebula (half‑res) — scaffold and integration

Date: 2025-09-22T04:40:23Z
Author: Agent Mode

Summary
- Implemented a lightweight volumetric nebula rendered at half resolution and composited over stars+galaxy using premultiplied alpha. The nebula uses fBm value noise, Beer–Lambert extinction, a simple emissive palette (Hα/OIII/SII), and ACES tonemap. Both WebGPU and WebGL2 backends are supported.

Why
- PRD M3 requires a volumetric nebula with plausible scattering at real‑time performance. This scaffold establishes the pass, data flow, and composition, with room to refine lighting and flow later.

Files added
- WebGPU
  - src/renderer/nebula/webgpuNebulaPass.ts — fullscreen raymarch fragment at half-res; uniforms: resolution, time, density, g; premultiplied output.
- WebGL2
  - src/renderer/nebula/webgl2NebulaPass.ts — GLSL variant mirroring WGSL logic.

Files modified
- Composite passes (added nebula as third input)
  - src/renderer/composite/webgpuCompositePass.ts — now binds texNebula at binding(3) and does premultiplied over.
  - src/renderer/composite/webgl2CompositePass.ts — adds uNebula sampler and performs over.
- Engines
  - src/renderer/webgpu.ts — creates rtNebula at half resolution; instantiates WebGPUNebulaPass; updates loop to render nebula and composite stars+galaxy+nebula; passes animated time.
  - src/renderer/webgl2.ts — creates tex/fboNebula at half resolution; instantiates WebGL2NebulaPass; renders to half-res FBO; composite samples stars+galaxy+nebula.

Key snippets
- WebGPU composite (premultiplied over)
```ts path=D:\Github\abyss\src\renderer\composite\webgpuCompositePass.ts start=96
@group(0) @binding(2) var texGalaxy: texture_2d<f32>;
@group(0) @binding(3) var texNebula: texture_2d<f32>;
...
  let cn = textureSample(texNebula, samp, vUv);
  var col = min(cs.rgb + cg.rgb, vec3<f32>(1.0));
  col = col * (1.0 - cn.a) + cn.rgb;
```

- WebGL2 offscreen half-res for nebula
```ts path=D:\Github\abyss\src\renderer\webgl2.ts start=146
// Nebula (half-res)
const wn = Math.max(1, Math.floor(w/2));
const hn = Math.max(1, Math.floor(h/2));
...
gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, wn, hn, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
...
```

Parameters (initial)
- Steps: 28 desktop, equivalent in both backends.
- Density default: 0.5 (uniform control path exists via setParams but not wired to UI yet).
- Anisotropy g placeholder: stored but currently not used in the simplified emissive model; reserved for HG phase function in a follow-up.

Performance guardrails
- Half-resolution render target; linear upsampling in composite.
- Early-out when transmittance T < 0.02.
- fBm with 4 octaves using analytic value noise; no 3D texture uploads.

Verification
- npm run dev
- Expect: a soft, flowing nebula layer subtly animating, composited over the stars+galaxy without overpowering. Both WebGPU and WebGL2 should visually match within reason.

Next refinements (follow-up tasks)
- Add HG single-scattering using approximate light direction and g.
- Introduce curl-noise flow (2D field advected over time) for coherent motion and then domain-warp density.
- Add band-weight influence so nebula tends to be denser near/around the galactic plane.
- Expose minimal controls: nebulaDensity (0..1), anisotropyG (-0.3..0.7), reduce motion handling.
- Consider moving tonemapping from per-pass to the final composite for consistent color pipeline across layers.
