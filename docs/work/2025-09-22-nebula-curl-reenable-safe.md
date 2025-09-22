# Re-enable curl (safe): amplitude clamp and alpha cap

Date: 2025-09-22T05:10:01Z
Author: Agent Mode

Change
- Re-enabled curl flow with conservative parameters and safety caps:
  - flowAmp = 0.05 in both shaders.
  - Clamp flow vector length to ≤ 0.5 before scaling (prevents runaway warps).
  - Cap nebula alpha to 0.85 in this testing pass to avoid full blackouts from premultiplied over.

Files/lines
- WebGPU: D:\Github\abyss\src\renderer\nebula\webgpuNebulaPass.ts
  - lines ~132–138: compute flowClamped and set flowAmp to 0.05.
  - lines ~153–154: use flowClamped for q.xy warp.
  - lines ~184–185: alpha = min(alpha, 0.85).
- WebGL2: D:\Github\abyss\src\renderer\nebula\webgl2NebulaPass.ts
  - lines ~63–69: compute flowClamped and set flowAmp to 0.05.
  - line ~79: use flowClamped.
  - lines ~100–101: alpha cap.

Why
- The previous WGSL immutability issue broke the pipeline; fixed. Now we bring curl back cautiously to avoid any reoccurrence of black screens from high alpha or excessive warping.

Next
- Verify visuals render and motion is visible but subtle.
- If stable, we can gradually raise flowAmp (e.g., to 0.08–0.1) and remove or relax the alpha cap.
