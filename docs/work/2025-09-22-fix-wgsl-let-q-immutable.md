# Fix: WGSL immutability error in nebula curl loop

Date: 2025-09-22T05:07:52Z
Author: Agent Mode

Issue
- Browser console showed WGSL error: cannot assign to value of type 'f32' at q.x = ... because q was declared with `let` inside the march loop (immutable in WGSL).
- This invalidated the pipeline and cascaded into repeated errors.

Change
- WebGPU: D:\Github\abyss\src\renderer\nebula\webgpuNebulaPass.ts
  - Inside the raymarch loop, changed `let q = p + dir * (i * dt);` to `var q: vec3<f32> = p + dir * (i * dt);` so we can update q.x/y.

Guard still active
- flowAmp remains 0.0 to keep curl disabled while we confirm the shader compiles and the scene renders again.

Next steps
- Reload to ensure the scene renders (no black screen). If OK, I will re‑enable curl with a small amplitude (e.g., 0.05) and clamp alpha to prevent blackouts, then iterate.
