# Fix: Galaxy impostor tilt alignment and soft edges

Date: 2025-09-22T03:54:55Z
Author: Agent Mode

Summary
- Issue 1: Impostors looked misaligned with the band tilt. Cause: instance angles were uniformly random in [0, π], so many impostors were oriented off the band’s axis.
- Issue 2: Hard square edges. Cause: fragment shading normalized radius using NDC-based size, which didn’t reach 1.0 at the quad boundary; alpha falloff left visible edges.

Fixes
1) Align orientation with band
- Generator now samples angles centered at 0 with small jitter (σ≈0.35 rad) in band space. After the shader rotates centers by band tilt, impostors naturally align with the band.
- File: D:\Github\abyss\src\renderer\galaxy\generateImpostors.ts
  - Lines ~30–32: use `randNormal(rand, 0, 0.35)` for angle; axis ratio range tightened to [0.5, 0.9].

2) Soft edges via elliptical Gaussian in quad-local space
- Fragment shaders compute an elliptical radius rr directly from vCorner rotated by the impostor’s angle, normalized so rr=1.0 at the quad edge; color and alpha are modulated by exp(-4.5*rr^2) and smoothstep(1.0, 0.75, rr).
- WebGPU: D:\Github\abyss\src\renderer\galaxy\webgpuGalaxyPass.ts
  - wgslImpostor() FS: replace rn-based falloff with quad-local elliptical Gaussian and stronger edge fade.
- WebGL2: D:\Github\abyss\src\renderer\galaxy\webgl2GalaxyPass.ts
  - fsImp: same elliptical Gaussian; removed dependency on pixel-scale normalization.

3) Reduce clutter
- Impostor count reduced 300 → 180 in both backends.
  - WebGPU: webgpuGalaxyPass.ts line ~79
  - WebGL2: webgl2GalaxyPass.ts line ~168

4) Minor cleanup
- Removed stray gl.Link_STATUS check in WebGL2 impostor program link.

Verification
- npm run dev
- Expected: Impostors align along the band direction with soft, non-square edges; no visible hard quads; density feels sparser. Both WebGPU and WebGL2 paths match visually.
