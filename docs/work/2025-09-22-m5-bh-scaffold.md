# M5: Black hole mode — initial scaffold

Date: 2025-09-22T05:23:03Z
Author: Agent Mode

Summary
- Added a Black Hole (BH) mode to the lens pass. When BH mode is active, stars+galaxy are remapped with a simple radial deflection, a photon ring overlay is rendered, and nebula remains excluded within the lens footprint (as in glass).

What’s included (scaffold)
- Mode toggle and parameters
  - lens-mode: 'glass' | 'blackhole' (element attribute)
  - bh-mass (default 1.0), bh-spin (default 0.7)
- WebGPU lens shader (WGSL)
  - Uniforms extended to include mode, mass, spin
  - BH mapping: small-angle rotation of the radial vector by defl = mass * 0.12 / rn with pseudo spin skew
  - Photon ring: gaussian bump near rn ≈ 0.5
- WebGL2 lens shader (GLSL)
  - Mirrors the glass behavior (refractive mapping + zoom + dispersion) and will be upgraded to BH remap in the next patch (stars+galaxy sampling is already set up); initial commit keeps glass mapping for stability.
- Engine + Element
  - Added setLensMode and setBHParams in engines and wiring in abyss-veil attributes.

Acceptance vs PRD
- Lensing applies to stars+galaxy only; nebula remains excluded inside lens.
- Photon ring visible near the specified radius; mapping is simplified and will be refined with a LUT later.

Next steps
- Align WebGL2 lens shader to use the same BH remap as WGSL (current commit keeps glass mapping on WebGL2 for stability — fast follow).
- Validate overall visual with presets; tune mass/spin ranges.
- Begin accretion cues in the nebula pass (density inflow near BH) per PRD.
