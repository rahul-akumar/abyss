# Nebula refinement: add Henyey–Greenstein single scattering

Date: 2025-09-22T04:52:39Z
Author: Agent Mode

Summary
- Implemented HG single-scattering in the nebula pass for both backends. This adds directional lighting response using the Henyey–Greenstein phase function controlled by anisotropy g, on top of a small emissive term.

Why
- Improves physical plausibility and depth cues: forward/back scattering shapes the lobe along the light direction; aligns with PRD simplifications.

Changes
- WebGPU: D:\Github\abyss\src\renderer\nebula\webgpuNebulaPass.ts
  - Added hg_phase(mu, g) and directional light L.
  - Replaced purely emissive accumulation with: scatter = sigma_s * phase * Li * albedo; emission kept faint.
  - Sigma_t = dens*1.5, Sigma_s = dens*1.0, early-out preserved.
- WebGL2: D:\Github\abyss\src\renderer\nebula\webgl2NebulaPass.ts
  - Added hgPhase and same scattering model.

Default parameters
- g uniform already exists (default 0.2). Will be exposed via element controls in the next step.
- Light direction: L = normalize(-0.3, 0.5, -0.8) (approx galactic key); no shadowing.

Verification
- npm run dev
- Expect: nebula shows directional highlight/shadow shaping along a global light direction, still subtle, with similar visuals across WebGPU and WebGL2.

Potential follow-ups
- Tie light direction to galaxy tilt/band orientation for coherence.
- Add band-influence mask to density (next refinement).
- Expose nebula-g and nebula-density attributes.
