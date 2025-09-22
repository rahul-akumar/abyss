# BH lens fixes (WebGPU) and nebula curl re-enable/clamping

Date: 2025-09-22

Summary
- Fixed black screen risk when enabling Black Hole (BH) lens mode (WebGPU) via alignment, numerical and UV-safety changes.
- Re-enabled nebula curl flow with conservative parameters and new clamps in both WebGPU and WebGL2.
- Kept default lens mode as "glass"; BH can be toggled after verifying rendering.

Changes
1) WebGPU Lens (BH mode)
- Uniform buffer repacked to 16-byte aligned vec4s:
  - v0: res.xy, center.xy
  - v1: radius, zoom, dispersion, mode
  - v2: mass, spin, 0, 0
- Shader fixes in WGSL:
  - Clamp rn = clamp(r / max(radius,1), 1e-3, 1.0)
  - Limit deflection angle: defl = clamp(mass * 0.12 / rn, 0.0, 0.6)
  - Spin skew applied as small multiplier: 1 + spin * 0.3 * n.y
  - Clamp UVs before sampling texture to [0,1]
  - Photon ring retained with stable Gaussian falloff
- Host side updates: packing the 12 floats to match vec4 x 3 layout
- UV sampling: sampleBG() now clamps UVs before textureSample

2) WebGL2 Lens (glass)
- Safety improvements for glass mode:
  - rn clamped to [1e-3, 1]
  - UV clamped to [0,1] inside sampleBG
- Note: BH mode is not exposed in WebGL2, so only safety/stability guards were added.

3) Nebula (both WebGPU, WebGL2)
- Re-enabled curl flow with conservative amplitude and clamping:
  - flowAmp = 0.05
  - Clamp flow vector length to maxLen = 0.5
- Output alpha clamp to mitigate scene overpowering: alpha = min(alpha, 0.85)
- WebGPU pass uses premultiplied blending in pipeline state

Rationale
- BH black screen was likely caused by a combination of uniform misalignment (WGSL std140-like constraints), division by very small rn, and sampling outside texture bounds due to large deflections. The clamps and vec4 packing eliminate those failure modes.
- Nebula curl flow previously caused excessive warping. Lower amplitude plus vector-length clamping provides gentle, stable motion. Alpha clamp ensures nebula doesn’t wash out the star/galaxy layers.

Verification
- Build and run sample scene in both backends
- Toggle lens mode in WebGPU: BH should render stable ring and curved deflections without black frames
- Observe nebula subtle movement and balanced opacity

Files touched
- src/renderer/lens/webgpuLensPass.ts
- src/renderer/lens/webgl2LensPass.ts
- src/renderer/nebula/webgpuNebulaPass.ts
- src/renderer/nebula/webgl2NebulaPass.ts

Default configuration
- lensMode defaults to "glass"; BH can be enabled explicitly once verified.