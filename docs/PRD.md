# Abyss Veil — Physically Inspired Real‑Time Cosmic Visualizer (PRD)

Status: Draft v1.0
Owner: Rahul Kumar
Reviewers: Rendering/Physics/Design
Last Updated: 2025-09-21

1. Summary
Abyss Veil is a real-time, interactive cosmic scene rendered in the browser that balances physical plausibility with aesthetic direction. The experience presents:
- A realistic star field (plausible spatial and magnitude distributions, color-temperature mapping)
- Background galaxies and dust lanes
- A volumetric, organic nebula with ethereal multi-hued emission
- Transients like long-exposure star trails
- A central circular lens that can morph from optical glass to a black hole (gravitational lensing, photon ring, accretion disk cues)

The goal is to ground visuals in first principles while remaining performant and art-directable on consumer GPUs.

Performance-first and simulation-only: The experience ships with minimal UI by default (no educational overlays or multi-knob control panels). A small, art-directable set of parameters is available for presets and light tuning.

Lens behavior: In glass mode, the circular lens ignores the nebula volume and magnifies the combined stars + galaxy background that cuts across the star field, replacing any nebula within the lens footprint. In black-hole mode, gravitational lensing applies to stars and the galaxy but not the nebula; the nebula is instead accreted (advected inward with swirl) near the event horizon.

2. Goals and Non‑Goals
Goals
- Physics-grounded visuals:
  - Stars: color vs. temperature (blackbody approximation), apparent magnitude distribution, plausible spatial anisotropy (Milky Way band), parallax layers.
  - Nebula: participating media with Beer–Lambert extinction and single scattering (Henyey–Greenstein), density driven by divergence-free flow (curl noise and/or low-cost fluid advection), spectral band palette (Hα, OIII, SII) mapped to perceptual color.
  - Galaxies: Sersic-like brightness profiles and logarithmic spiral structure with color gradients (older yellowish bulge → bluish star-forming arms).
  - Lens → Black hole: transition from thin-lens refraction/dispersion/Fresnel to simplified GR lensing (Schwarzschild/Kerr-inspired), photon ring depiction, gravitational redshift and Doppler beaming cues.
- Aesthetic direction: ethereal, layered color fields, cinematic tonemapping, subtle motion; parameters exposed for art direction (kept minimal for simplicity).
- Performance-first: prioritize stable frame time with dynamic resolution, half/quarter-res volumetrics, and adaptive quality.
- Real-time performance: 60 FPS on mid- to high-tier laptops; graceful degradation to 30 FPS on integrated GPUs/mobile.
- Minimal controls: ship with a small, art-directable set (see Controls) and no educational UI.
- Portable: modern browsers via WebGPU (preferred) with WebGL2 fallback.

Non‑Goals
- Full fidelity MHD or N-body simulations.
- Exact Kerr ray tracing and radiative transfer with multi-bounce scattering.
- Photometrically accurate astrophotography reproduction; we aim for plausibility over scientific publication accuracy.
- Educational UI or tutorial overlays; this ships as a pure simulation with minimal art controls.

3. Users and Use Cases
- Interactive art/site hero: ambient background that responds to pointer/touch.
- Product/brand reveal: morphing lens → black hole moment.
- Ambient installations: performance-first loop with minimal UI.

Scenarios
- User drags the lens; refraction subtly shifts the background. A toggle morphs it into a black hole that distorts stars and “consumes” nearby nebula.
- Slow camera parallax and volumetric flow create depth; optional star trail effects under longer simulated exposure.

4. Visual Narrative
- Foreground: a circular “lens” element centered by default.
- Midground: an organic, flowing nebula with multi-band emission color blending, perceived as volumetric.
- Background: star field with magnitude/color variation, a bright Milky Way band, and sparse galaxy sprites.
- Transients: long-exposure star trails; optional intermittent satellite-like glints.

5. Physics Grounding and Simplifications
5.1 Reference Frame and Camera
- Reference frame: deep-space vantage by default (no atmospheric effects). This avoids physically inconsistent combinations and keeps performance predictable. Star trails can be enabled via simulated longer exposure or camera motion.
- Camera model: thin-lens with exposure proxy. Stars can bloom and trail based on exposure/shutter simulation. Depth of field is stylistic only.

5.2 Color and Spectral Considerations
- Stars: color via blackbody approximation T ∈ [3000K, 10000K] mapped through approximate CIE → sRGB; include desaturation for realism.
- Nebula emission: blend Hα (656nm, red), OIII (500.7nm, teal), SII (672nm, deep red) using a perceptual mapping (Hubble palette optional), with artistic weights.
- Tonemapping: ACES or filmic curve with blue-noise dithering; maintain linear → sRGB conversions correctly.

5.3 Participating Media (Nebula)
- Radiative transfer (simplified): I_out = I_in·exp(−σ_t·d) + ∫_0^d σ_s·L_i·p(θ)·exp(−σ_t·t) dt
  - Single scattering only; HG phase function p(θ) with anisotropy g ∈ [−0.3, 0.7].
  - Emissive term for line emission; directional light probes for star/galactic field approximations.

5.4 Gravitational Lensing (Black Hole)
- Weak field lensing: deflection α ≈ 4GM/(c²b) for large impact parameter b.
- Near-horizon depiction: precomputed radial deflection lookups or analytic screen-space mapping to hint at photon sphere (~1.5 r_s) and Einstein ring.
- Accretion disk cues: Doppler boosting approximated by D^3 and gravitational redshift by g = √(1 − r_s/r), applied as color/intensity bias; frame dragging (Kerr) suggested via asymmetric lensing parameter (art control, not exact GR).

6. Functional Requirements
6.1 Star Field
- Distribution
  - Base: procedural, anisotropic density field aligned with a galactic band; Poisson sampling modulated by density.
  - Layers: parallax strata to create depth.
  - Optional: overlay a small catalog of bright stars (e.g., ~1–2k from Hipparcos/Gaia, downsampled at build time).
- Magnitudes and Colors
  - Apparent magnitudes drawn from a plausible power-law; apply extinction near dust bands.
  - Temperature sampling informed by a coarse HR distribution; map to sRGB via blackbody approximation.
- Rendering
  - Batched point sprites with PSF-inspired falloff and controllable bloom; temporal twinkle minimal (space vantage); optional subtle scintillation for style.
- Transients (optional)
  - Star trails: simulated long exposure when “shutter” control increases.
  - Rare satellite-like glints can be spawned as brief specular flashes (enabled only when performance headroom allows).

6.2 Galaxies
- Default: a Milky Way–style band (galactic plane anisotropy), oriented roughly horizontal with an initial tilt θ0 ≈ 10–20°. The band rotates very slowly over time (roll) at ω ≈ 0.2–1.0 deg/min (default 0.6 deg/min), clamped or paused on low-power devices.
- Impostor sprites with:
  - Sersic profile brightness (n≈1 disk + n≈4 bulge mix), logarithmic spiral patterning, dust lanes via multiplicative absorption masks.
  - Color gradient: yellow bulge → blue arms.
- Scale, orientation, and depth layered sparsely to avoid clutter; optional low parallax.

6.3 Dust Clouds and Volumetric Nebula
- Density field generation: 3D fBm (Perlin/Worley) composed with curl noise to induce coherent flow; optional 2D fluid advection projected into 3D for motion.
- Rendering: ray marching in a half-resolution 3D volume with temporal reprojection and bilateral upsampling; 24–64 steps typical, adaptive termination by transmittance.
- Lighting: ambient galactic field + star probes; single scattering with HG; emissive bands mixed by palette.
- Particle layer (optional): a layer of particles advected by the same flow field to provide micro-structure and glints; contributes to perceived volume via screen-space density accumulation.

6.4 Lens → Glass Mode
- Thin-lens refraction with chromatic dispersion (Cauchy) and Fresnel reflectance.
- Stars+Galaxy sampling: the lens samples a combined background render target RT_bgSG = combine(RT_stars, RT_galaxy) at increased MIP bias/oversample. The nebula volume is not sampled for refraction.
- In-lens occlusion: within the lens mask, the overlay replaces nebula contributions with the RT_bgSG sample (i.e., nebula is hidden inside the lens).
- Edge highlight (Fresnel term) and chromatic aberration radius scaled by user parameter.

6.5 Lens → Black Hole Mode
- Mode toggle morphs glass into BH.
- Effects
  - Star and galaxy lensing: screen-space remap using radial deflection (weak field far from center; stronger near photon sphere). Preserve radiance but distort positions; allow shear and multiple-image hints near the Einstein ring.
  - Nebula not lensed: the volume is not refracted by the BH mapping. Instead it is accreted: density advection toward center with tangential swirl; opacity increases near the disk; fade within the event horizon radius r_s.
  - Photon ring: bright ring at ~1.5 r_s using precomputed intensity profile.
  - Accretion disk shading: redshift and Doppler hue/brightness bias with spin control.

6.6 Controls (minimal)
- Preset: Glass or Black Hole.
- Quality: Auto (default), Low, Medium, High.
- Exposure: EV proxy for bloom/trails.
- Lens (Glass): radius, zoom; dispersion strength (single slider).
- Galaxy: prominence/contrast (single slider).
- Nebula: density and anisotropy g (single slider each).
- Black hole: mass and spin (single sliders).
- Accessibility: Reduce motion toggle.

6.7 Layer depth and parallax
- Z-index order (near → far): Nebula volume → Milky Way band → Stars (near stratum) → Stars (far stratum).
- Default parallax factors p ∈ [0,1]: Nebula p=1.0; Milky Way band p=0.6; Stars near p=0.4; Stars far p=0.2. Auto quality may scale these (e.g., ×0.8 on Low) to reduce perceived motion on small screens.
- Pointer/camera parallax: offsets layers proportionally to p with easing to avoid motion sickness; clamp offsets on mobile.
- Lens sampling respects parallax: Glass/BH sample the background (stars+galaxy) at parallax-adjusted UVs; nebula parallax is applied only in the volume pass.
- Quality modes may smooth parallax deltas to reduce jitter at low frame rates.

7. Non‑Functional Requirements
- Performance targets (desktop mid-tier GPU):
  - Star+galaxy pass ≤ 2 ms
  - Volumetric pass ≤ 4–7 ms (half-res, reprojection)
  - Lens/BH pass ≤ 2–3 ms
  - Composite/tonemap ≤ 1 ms
  - Total ≤ ~12 ms (≈80 FPS headroom; target 60 FPS with variability)
- Progressive quality: dynamic resolution scaling (0.5–1.0), adaptive ray steps, clamped device pixel ratio.
- Cross-platform: WebGPU preferred; fallback to WebGL2; graceful mobile degradation (reduced steps, fewer stars/galaxies, lower resolution).
- Accessibility: reduce motion; colorblind-aware palettes with adjustable band weights; high-contrast option.
- Mobile responsiveness:
  - Target ≥30 FPS with Auto quality; prefer stable frame time over resolution.
  - Clamp device pixel ratio to 1.0–1.25; dynamic resolution floor to 0.5× under load.
  - Volumetric: half-res by default; adaptive steps 16–32; temporal reprojection; interleaved sampling.
  - Lens: reduce dispersion and disable high-cost chromatic aberration on Low; fallback to single-sample refraction; limit vignette/bloom.
  - Stars/Galaxy: cap instance counts; bias higher MIP LODs under load; reduce per-frame transient spawns.
  - Input: lower parallax amplitude and add extra easing on mobile to reduce motion sickness.
  - Power awareness: pause heavy passes when tab hidden; if battery saver/power-save detected, back off to Low automatically.

8. Technical Approach
8.1 Tech Stack
- Rendering: WebGPU (WGSL) first; WebGL2 + Three.js fallback.
- App shell: Vue 3 + Vite (existing tooling is fine), or vanilla if embedding elsewhere.
- Shaders: modular shader chunks; blue-noise textures for TAA/dither; 3D noise textures baked at init.

8.2 Pipeline (passes)
1) Stars → RT_stars (opaque)
2) Galaxy (band + impostors) → RT_galaxy (opaque)
3) Volumetric Nebula → RT_nebula (RGBA, premultiplied alpha)
4) Background combine → RT_bgSG: combine RT_stars and RT_galaxy
5) Composite → RT_scene: apply RT_nebula transmittance/emission over RT_bgSG
6) Lens/BH → Screen:
- Glass: sample RT_bgSG (stars+galaxy zoom/refraction); nebula is occluded within the lens footprint (not refracted)
   - Black hole: lens RT_bgSG via deflection map; then apply nebula accretion overlay (no nebula lensing)
7) Post → Screen: tonemap (ACES), optional dither, exposure

8.3 Data Structures
- Stars: SSBO/texture buffer; struct {pos, mag, temp, flags} where pos encodes parallax layer.
- Galaxies: sprite atlas indices + per-instance params (sersic mix, angle, scale).
- Nebula: 3D density volume (half-res), 3D flow field (curl noise) or 2D sim + extrusion; temporal history buffer for reprojection.
- Lens/BH: precomputed radial deflection LUT indexed by normalized radius and mass parameter; photon ring profile texture.

8.4 Algorithms
- Star generation: stratified sampling over a galactic density function (band aligned to a configurable axis); magnitudes follow approximate power-law; temperatures sample an HR-like distribution.
- Color mapping: blackbody to sRGB via polynomial approximation; clamp saturation.
- Volumetric: front-to-back ray marching with early termination; single scattering with HG; emissive color from band weights.
- Flow: curl noise field advects density each frame; optional semi-Lagrangian stable fluids in 2D projected to 3D shell for richer motion at modest cost.
- Lensing: screen-space radial mapping using α(r) LUT; apply asymmetry term for pseudo-Kerr spin; photon ring from emissive rim; accretion disk shading uses Doppler/redshift multipliers.

8.5 Color Management
- Linear workspace; ACES tonemap; correct sRGB conversions; blue-noise dithering to mitigate banding.

8.6 Performance Strategies
- Dynamic resolution scaling; DPR clamp (e.g., 1.0–1.5).
- Temporal reprojection for volume; checkerboard or interleaved sampling patterns.
- Half/quarter-res volume with bilateral upsampling guided by depth/normal proxies (scene lacks depth buffers; use density gradients).
- GPU timers (EXT_disjoint_timer_query / WebGPU timestamp queries) for live budgeting.
- Quality Auto heuristics: adjust star count, volume steps, and resolution scale based on measured frametime; aim for ≈12 ms desktop and 28–33 ms mobile.
- Device-class detection: in WebGPU, use adapter limits and vendor strings to infer tier; fall back to conservative defaults if unknown.
- Effect toggles by quality: disable chromatic aberration and reduce bloom on Low; lower dispersion and lens sample count; narrow photon ring radius to reduce overdraw.

9. Content and Assets
- Optional sprite atlas for galaxies (procedurally generated at build time or small baked textures <512KB).
- Blue-noise textures for TAA/dither.
- No large catalogs required; optional bright-star subset JSON (<200KB) for Earth-vantage education mode.

10. Telemetry, QA, and Validation
- Perf HUD: frametime, pass timings, resolution scale, step count.
- Visual checks: screenshot golden tests per preset; ensure no severe banding/posterization.
- Parameter limits: guardrails for performance (cap stars, step counts, density).
- Cross-device matrix: at least 3 GPUs and 2 browsers.

11. Risks and Mitigations
- Volumetric cost: mitigate with half-res, reprojection, adaptive steps, density culling, and dynamic resolution.
- GR lensing complexity: start with radial LUTs; defer exact Kerr; keep aesthetic controls for ring/disc.
- Color banding on low DPR: enforce dithering; prefer ACES tonemap and 10-bit where available.
- Mobile thermal throttling: aggressive quality scale-down; optional static preset.

12. Milestones and Deliverables
M0 — PRD approval (this doc)
M1 — Star Field Prototype
- Procedural stars with magnitude/color, parallax; basic exposure + tonemapping
M2 — Galaxy Band and Impostors (Separate RT)
- Render a dominant galaxy band and sparse impostors to RT_galaxy; galactic plane anisotropy; integrate with stars for composite and lens sampling
M3 — Volumetric Nebula (Half‑Res)
- Density/flow generation; single scattering; ACES tonemap; perf pass
M4 — Lens (Glass)
- Refraction/dispersion/Fresnel; UI integration
M5 — Black Hole Mode
- Radial lensing LUT; photon ring; accretion cues; nebula inflow
M6 — Transients and Polish
- Star trails; bloom/band-dither; accessibility toggles

Deliverables per milestone
- Demo presets (JSON)
- Perf metrics captured on reference devices
- Short validation notes/screenshots

13. Open Questions
- Catalog: include a small bright-star JSON overlay by default, or keep purely procedural?
- WebGPU baseline: ship both WebGPU and WebGL2, or detect and prefer one with progressive enhancement?
- Accretion visual: include spectral bias (hotter inner disk) or keep an art-directable gradient?
- Interactivity: should lens drag warp field lines in the nebula (stylized) or remain physically decoupled?

14. Acceptance Criteria
- Visual realism: independent reviewers can recognize plausible star colors/magnitudes, galactic banding, and physically suggestive nebula scattering.
- Glass lens: zoom/refraction targets the combined stars + galaxy background, excluding nebula under the lens (nebula hidden within lens footprint).
- Black hole: clear gravitational lensing of background stars and the galaxy; discernible photon ring; convincing accretion disk asymmetry; nebula not lensed but visibly accreted.
- Performance: ≥60 FPS on a mid-tier laptop GPU at 1080p with default quality; ≥30 FPS on integrated GPUs with auto-scaling.
- Robustness: no crashes; responsive UI; reduce-motion honored.

15. Decisions and Defaults
- App shell: Vue 3 + Vite + TypeScript. Export a Web Component <abyss-veil> for embedding.
- Graphics policy: WebGPU-first; WebGL2 fallback.
  - WebGPU target: Chrome/Edge ≥113, Safari ≥17.4. Firefox currently falls back to WebGL2.
- Reference hardware baselines:
  - Mid-tier: NVIDIA RTX 3060 Laptop GPU (1080p), Apple M2 (base), Intel Iris Xe (11th-gen i5).
- Priority tradeoffs: Favor aesthetics when physics fidelity conflicts and performance is at risk; degrade heavy features first.

Controls — ranges and defaults
- Presets: Glass, Black Hole. Default preset: "Milky Way Window" (Glass).
- Quality: Auto (default), Low, Medium, High.
- Exposure EV: [-2, +3], step 0.1, default 0.
- Lens (Glass)
  - Radius: [96 px, 384 px], default 224 px.
  - Zoom: [1.0, 2.0], default 1.25.
  - Dispersion: [0.0, 1.0], default 0.35.
- Galaxy prominence: [0.0, 1.0], default 0.6.
- Nebula
  - Density: [0.0, 1.0], default 0.5.
  - Anisotropy g: [-0.3, 0.7], default 0.2.
- Black hole
  - Mass (normalized): [0.5, 3.0], default 1.0.
  - Spin (pseudo-Kerr): [0.0, 1.0], default 0.7.
- Accessibility: Reduce motion defaults to on when user prefers-reduced-motion.

Lens and black hole specifics
- Lensing LUT: 1D LUT, 2048 samples, normalized radius r/r_s ∈ [0, 4]; mass scales mapping; smooth falloff to weak-field analytic beyond 4 r_s.
- Photon ring: center at 1.5 r_s; Gaussian width default 0.06 r_s; art-directable range [0.02, 0.10] r_s.
- Lens radius ↔ r_s mapping: r_s = 0.33 × lensRadius_px × massNormalized; spin adds asymmetric deflection (stylized, non-physical).

Nebula volume, flow, and ray marching
- Volume resolution: half-resolution 3D texture targeting ~192³ by default (auto 160³–256³ by device tier).
- Steps: desktop 32 (adaptive 24–40), mobile 20 (adaptive 16–24).
- Early termination: stop when transmittance ≥ 0.98; blue-noise jitter + temporal reprojection; bilateral upsampling.
- Flow field: start with curl noise; optional 2D semi-Lagrangian projected to 3D after M3 (polish toggle).

Fallback (WebGL2) and quality policy
- WebGL2 fallback:
  - Disable chromatic dispersion; approximate Fresnel.
  - Volume at half-/quarter-res; cap steps ≤ 24; simpler bilateral upsampling.
  - Photon ring via lower-res mask; limit aberration/post effects.
  - Cap stars/galaxies (e.g., ~50k stars; sparse galaxy sprites).
- Quality Auto (rolling 1 s avg; 1 s hysteresis):
  - Targets: desktop ≤ 16.7 ms avg; mobile ≤ 33 ms avg.
  - Degrade order: resolution scale → volume steps → star count → galaxy detail (MIP bias) → disable trails → reduce lens samples/aberration.
  - Floors: resolution ≥ 0.6 (mobile ≥ 0.5); volume steps ≥ 12; star count ≥ 30% of max.
  - Re-enable in reverse order when ≥10% headroom for 2 s.

Parallax, motion, accessibility
- Default parallax as specified; eased smoothing.
- Reduce motion: parallax amplitude 40% of normal; nebula flow speed 50%; disable star trails; clamp mobile parallax to 8 px max.

Content and assets
- Bright-star catalog: optional Hipparcos subset (~1–2k brightest), JSON <150 KB, CC0/compatible; off by default; dev toggle only.
- Galaxy sprites: procedural atlas generated at build; total art assets <512 KB; allow small baked atlas fallback with permissive license.

Telemetry, QA, and CI
- Perf HUD: dev-only by default; prod gated by ?hud=1 (or localStorage 'hud=1').
- Golden tests: deterministic seeds; scenes—(1) Milky Way Window, (2) Orion’s Breath, (3) Event Horizon, (4) Glass→BH toggle, (5) Low-quality mobile profile. SSIM ≥ 0.98 pass.
- CI: GitHub Actions; Node 20 LTS; pnpm or npm; lint/format/test; visual tests under WebGL2; WebGPU tests optional/manual.

Mobile and device tiers
- DPR clamp: mobile 1.0–1.25; desktop 1.0–1.5.
- Tiering (WebGPU): use adapter.limits + vendor strings to bucket low/mid/high; log anonymized caps (no PII).

Acceptance and measurement
- Performance protocol: 60 s per scene at 1080p; default Glass → toggle to BH at t=30 s.
  - Mid-tier pass: avg FPS ≥ 60; 1% low ≥ 45.
  - Integrated pass: avg FPS ≥ 30; 1% low ≥ 24.
- Visual acceptance: reviewers recognize plausible star colors/magnitudes, galactic band, nebula single-scatter look; Glass excludes nebula within lens footprint; BH lenses background with clear photon ring and accretion asymmetry.

Presets (ship)
- Milky Way Window (default): high star density, faint OIII teal, g ≈ 0.1, galaxies sparse, Glass mode.
- Orion’s Breath: strong Hα red, moderate density, slow flow, Glass mode.
- Event Horizon: BH enabled, spin 0.7, photon ring width 0.06 r_s, reduced nebula near r_s.

Appendix A — Parameter Presets (examples)
- “Milky Way Window”: high star density, faint blue/teal OIII, low g (isotropic), galaxies sparse.
- “Orion’s Breath”: strong Hα red, moderate density, slow flow.
- “Event Horizon”: BH enabled, higher spin, bright photon ring, reduced nebula density near r_s.

Appendix B — Implementation Notes (non-binding)
- Prefer a pure spectral-to-RGB approximation for stars (polynomial fit) over LUTs to keep bundle small.
- Use a 32³–64³ 3D noise texture seeded at init; animate via domain warping and flow advection rather than regenerating per-frame.
- Lensing LUT can be a 1D texture over normalized radius r/r_s with mass as a scale factor; clamp far-field to weak lens approximation.
- Employ blue-noise masks for interleaved sampling in the volume pass to keep stability without visible patterns.
