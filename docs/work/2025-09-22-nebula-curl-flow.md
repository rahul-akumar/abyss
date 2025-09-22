# Nebula refinement: curl-noise coherent flow

Date: 2025-09-22T05:01:24Z
Author: Agent Mode

Summary
- Added a curl-noise flow field to the nebula shader. The flow is computed once per pixel (screen-aligned) and used to warp the raymarch sample positions for coherent, swirling motion.

Why
- The prior fBm-only domain warp animated but lacked coherent motion. Curl of a scalar field produces a divergence-free vector flow that reads as natural swirls at low cost when computed once per pixel.

Changes
- WebGPU: D:\Github\abyss\src\renderer\nebula\webgpuNebulaPass.ts
  - Added curl2(p, t) using central differences on fbm() (single evaluation per pixel).
  - Before the march, compute flow = curl2((vUv*2-1)*1.1, time*0.25) and apply q.xy += flow * 0.2 per step.
- WebGL2: D:\Github\abyss\src\renderer\nebula\webgl2NebulaPass.ts
  - Same curl2 function and flow application.

Performance considerations
- Flow is evaluated once per pixel (not per step), adding ~4 fbm calls total per pixel, which is acceptable at half resolution.
- Early-out remains when transmittance T < 0.02; step count unchanged (28).

Verification
- npm run dev
- Expect: Swirling, coherent nebula motion (subtle), similar on WebGPU and WebGL2; frame time remains stable due to half-res and once-per-pixel flow eval.
