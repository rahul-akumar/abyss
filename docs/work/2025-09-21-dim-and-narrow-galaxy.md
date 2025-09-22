# Dim and narrow galaxy band

Date: 2025-09-21T20:44:12Z
Author: Agent Mode

Summary
- Galaxy band appeared too bright and “too close.” Reduced brightness and narrowed width to push it back visually while keeping canvas/UI axis-aligned and stars isotropic.

Changes
1) WebGPU galaxy pass
- File: D:\Github\abyss\src\renderer\galaxy\webgpuGalaxyPass.ts
- Default width (sigma) reduced 0.25 → 0.18
  - Line ~11: `private sigma = 0.18; // band half-width in NDC units (narrower → feels farther)`
- Intensity multiplier reduced 0.7 → 0.35
  - WGSL FS line ~97: `var col = mix(blue, yellow, t) * den * 0.35; // reduced intensity`

2) WebGL2 galaxy pass
- File: D:\Github\abyss\src\renderer\galaxy\webgl2GalaxyPass.ts
- Default width (sigma) reduced 0.25 → 0.18
  - Line ~9: `private sigma = 0.18;`
- Intensity multiplier reduced 0.7 → 0.35
  - GLSL FS line ~57: `vec3 col = mix(blue, yellow, t) * den * 0.35;`

Why
- Narrower sigma makes the band thinner and less dominant, which reads as more distant.
- Lower intensity reduces the perceived exposure of the band, letting stars read better in the composite.

Potential side effects
- On very dark monitors, the band may become too subtle; we can slighty raise intensity (e.g., 0.4) or widen sigma (e.g., 0.20) based on feedback.
- When we add impostor galaxies, additive blending may push the midtones; we may move tonemapping to the final composite for better control.

Verification
- npm run dev
- Expect a thinner, dimmer band; stars stand out more; no canvas tilt; stars remain isotropic.
