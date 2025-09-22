# Regression log: curl-noise nebula change → black screen

Date: 2025-09-22T05:04:22Z
Author: Agent Mode

User observation
- After adding curl-noise flow to the nebula, the entire screen turns black (persisted after restarting the dev server).
- This suggests either: (a) shaders/pipelines failed (no draws), or (b) composite result became black (e.g., nebula alpha saturating to 1 and premultiplied over zeroing stars/galaxy), or (c) textures/bindings invalid.

Changes introduced in the curl step
- WebGPU: D:\Github\abyss\src\renderer\nebula\webgpuNebulaPass.ts
  - Added curl2(p, t) (lines ~101–112): central differences on fbm.
  - In fs():
    - Compute flowBase, flow, flowAmp (lines ~129–134)
    - Apply q.x/y += flow * flowAmp before sampling noise (lines ~146–149)
- WebGL2: D:\Github\abyss\src\renderer\nebula\webgl2NebulaPass.ts
  - Added curl2 (line ~51)
  - In fs():
    - Compute flow and flowAmp (lines ~60–64)
    - Apply to q before noise sampling (lines ~73–74)

Potential root causes (to investigate)
1) Alpha over in composite
   - Our composite performs col = (stars+galaxy) * (1 - cn.a) + cn.rgb (premultiplied over).
   - If cn.a ~= 1 everywhere (e.g., due to numerical blow-up in T), result becomes near cn.rgb. If cn.rgb is near zero → black.
2) Shader/pipeline failure
   - If a shader failed to link/compile, draws might not happen (verify console errors in browser devtools).
3) Binding/texture mismatch
   - Ensure nebula RT is created and bound correctly after recent changes; verify WebGL2 uses texNebula in composite.

Immediate next steps (proposed, not applied yet)
- Add a temporary guard to reduce flow amplitude (flowAmp=0.05) or disable curl to confirm whether alpha saturation is the cause.
- Log shader compile/link status in console (both backends) and check for errors.
- Inspect cn.a range by temporarily outputting alpha as grayscale to screen for a quick sanity check.

Rollback plan
- Revert the curl additions in both nebula passes (keep HG scattering) if needed, then re-introduce curl with a smaller amplitude and per-frame perf/visual checks.
