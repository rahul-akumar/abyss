# Suggestion: Nebula refinements (step-by-step plan)

Date: 2025-09-22T04:49:25Z
Author: Agent Mode
Status: Proposed (not implemented)

Summary
- Improve the M3 nebula with more physically suggestive lighting and motion, better scene integration, and minimal controls—implemented incrementally to keep performance predictable.

Why
- The current nebula establishes the pass and composition but simplifies lighting and motion. Refinements will increase plausibility and art direction without compromising frame time.

Refinements (to be implemented step-by-step)
1) HG single-scattering (anisotropy g)
- What: Replace purely emissive accumulation with a simple single-scattering model using the Henyey–Greenstein phase function.
- Changes:
  - WebGPU: src/renderer/nebula/webgpuNebulaPass.ts fs() — add Li (approx directional light), Beer–Lambert for transmittance, HG phase p(θ; g), accumulate L = T * σs * Li * p * dt + emission.
  - WebGL2: src/renderer/nebula/webgl2NebulaPass.ts fs() — same logic.
  - Engine/element: expose g in [-0.3, 0.7] and thread as a uniform (already plumbed, currently unused).
- Why: Adds plausible forward/back scattering shaping for depth cues.
- Risks: More ALU inside the loop; keep step count stable; early-out remains.

2) Curl-noise flow (coherent motion)
- What: Introduce a 2D curl noise vector field that advects the sample positions (domain warping) over time for more organic motion.
- Changes:
  - Add a small curl field generator (CPU-side or analytic in-shader) and use it to offset the raymarch sample coordinates per frame.
  - WebGPU+WebGL2: modify fs() to compute a 2D flow offset f(x,y,t) added to q.xy before fbm.
  - Respect reduce-motion: scale flow speed by ~0.5 or lower.
- Why: Current fBm warp animates but lacks coherent flow; curl adds believable swirls.
- Risks: Extra ALU; ensure flow eval is cheap (few octaves) and/or precomputed.

3) Band influence (density vs. galactic plane)
- What: Modulate density by distance to the galactic plane so nebula tends to be denser near/around the band, without overpowering the scene.
- Changes:
  - Reuse the galaxy tilt (θ) to rotate screen coords into band space; compute d = |y_band| and apply a smooth mask M(d) to density (e.g., gaussian with broad σ).
  - WebGPU/WebGL2 nebula shaders: add tilt uniform and mask.
- Why: Scene layering coherence; subtly ties nebula to the visual narrative of the band.
- Risks: If mask too strong, band looks foggy—keep subtle (≤30% boost).

4) Minimal controls (exposed via element attributes)
- What: Expose two safe knobs for art direction without UI noise.
  - nebula-density (0..1), default 0.5
  - nebula-g (-0.3..0.7), default 0.2
- Changes:
  - src/elements/abyss-veil.ts: observe attributes, thread to engine.
  - src/renderer/index.ts: add setNebulaParams(density, g) to IRenderer and Engine.
  - src/renderer/webgpu.ts and webgl2.ts: forward to nebula pass.
- Why: Matches PRD “minimal controls”; useful for presets.
- Risks: Input validation and consistent defaults across backends.

5) Tonemapping location (final composite)
- What: Move ACES tonemapping from individual passes to the final composite so blending happens in linear space first.
- Changes:
  - Stars/galaxy/nebula: output linear color without tonemap (premultiplied where appropriate).
  - Composite passes: perform ACES tonemap on the final combined color.
- Why: Physically consistent blending; predictable color.
- Risks: Requires rebalancing intensities; could change the current look; we can guard behind a feature flag and adjust gradually.

Acceptance criteria
- Lighting: scattering adds directional shaping; g affects lobe as expected.
- Motion: curl flow reads as coherent, slow; reduce-motion scales it down.
- Integration: nebula density subtly increases near band; stars+galaxy remain clear.
- Controls: attributes change look without hitches; defaults remain stable.
- Perf: desktop avg ≤ 16.7 ms, mobile ≤ 33 ms; no major regressions vs. current M3.

Potential issues/considerations
- WebGL2 precision: keep constants and iterations conservative to avoid banding; consider small blue-noise jitter.
- Art direction: ensure OIII/Hα balance remains subtle after tonemap move.
- Testing: add visual snapshot tests for default nebula and an “Orion’s Breath” preset.

Rollback plan
- Each refinement is isolated behind small diffs; we can revert an individual step without impacting others. For tonemap relocation, keep a feature flag to toggle per-pass vs. final tonemap.
