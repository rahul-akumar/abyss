# M2 addition: galaxy impostor sprites

Date: 2025-09-21T20:53:46Z
Author: Agent Mode

Summary
- Added sparse galaxy impostor sprites to the galaxy layer (RT_galaxy) in both WebGPU and WebGL2 backends.
- Each impostor is an instanced quad shaded with a simplified elliptical profile and a yellow↔blue gradient, composited additively into RT_galaxy.

Why
- Completes PRD M2: Galaxy Band and Impostors. Adds depth and variety along the Milky Way band without heavy cost.

What changed
- New generator
  - D:\Github\abyss\src\renderer\galaxy\generateImpostors.ts
  - Produces Float32Array per-instance: [centerU, centerV, sizePx, angleRad, axisRatio, colorBias, brightness]

- WebGPU galaxy pass
  - D:\Github\abyss\src\renderer\galaxy\webgpuGalaxyPass.ts
  - Split pipelines: pipelineBand (full-screen triangle) and pipelineImpostor (instanced quads with additive blending)
  - Added quad/instance buffers; 300 impostors by default
  - WGSL impostor shading computes an elliptical brightness falloff and gradient color

- WebGL2 galaxy pass
  - D:\Github\abyss\src\renderer\galaxy\webgl2GalaxyPass.ts
  - Added second program/VAO for impostors; uses gl.BLEND ONE,ONE for additive composite
  - Instanced attributes: center(2), size, angle, axis, bias, brightness; stride 28 bytes

Potential issues
- Overdraw on low-end GPUs if impostor count is too high; capped at ~300 initially
- Additive blending can push highlights; we may move tonemapping to final composite later
- Resize correctness: offscreen targets are recreated by engines; impostor buffer remains static (OK for now); dynamic layout or density scaling can be added later

Verification
- npm run dev
- Expect: isotropic stars, thinner dim band, and sparse galaxy shapes along the band. Both WebGPU and WebGL2 look similar and performant.
