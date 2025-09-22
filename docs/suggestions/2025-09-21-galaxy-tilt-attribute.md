# Suggestion: Expose galaxy band tilt as a component attribute

Date: 2025-09-21T20:39:28Z
Author: Agent Mode
Status: Proposed (not implemented)

Summary
- Add a tilt attribute to the <abyss-veil> web component so designers can control the galaxy band’s tilt angle without code changes. This only affects the galaxy band layer (RT_galaxy), not the star field.

Why
- Composition control: Different page layouts and hero crops benefit from varying tilt (e.g., 8–22 degrees). This enables quick tuning without code edits.
- PRD alignment: “Galaxy band … oriented roughly horizontal with an initial tilt θ0 ≈ 10–20°.” Exposing tilt makes this parameter easily adjustable per-embed/preset.
- Clean separation: Stars stay isotropic; tilt lives in the galaxy pass only, preventing the “tilted canvas” impression.

What will change (API and code)
- New component attribute: tilt (degrees, number)
  - Example usage: <abyss-veil tilt="12" />
  - Live-updatable: changing the attribute updates the galaxy pass in real time.
  - Default: 12 (per Decisions and Defaults).

- Programmatic control (optional, for future): Engine.setGalaxyTilt(deg: number)
  - Forwarded to backend-specific galaxy pass (WebGPU/WebGL2), which already exposes setTiltDeg.

Implementation plan (files/edits)
- src/elements/abyss-veil.ts
  - Add 'tilt' to observedAttributes.
  - Parse number in connectedCallback and attributeChangedCallback.
  - Call engine.setGalaxyTilt(tiltDeg).

- src/renderer/index.ts
  - Extend IRenderer with setGalaxyTilt(deg: number).
  - Implement Engine.setGalaxyTilt by delegating to backend.

- src/renderer/webgpu.ts and src/renderer/webgl2.ts
  - Implement setGalaxyTilt to call this.galaxy?.setTiltDeg(deg) and store the last value for start()/resize().
  - On start()/resize(), ensure the stored tilt is applied after creating the galaxy pass.

- No changes needed in galaxy passes
  - WebGPU: src/renderer/galaxy/webgpuGalaxyPass.ts already has setTiltDeg.
  - WebGL2: src/renderer/galaxy/webgl2GalaxyPass.ts already has setTiltDeg.

Example (hypothetical usage)
```ts path=null start=null
// HTML
<abyss-veil tilt="16" quality="auto"></abyss-veil>

// JS update
const el = document.querySelector('abyss-veil')!;
el.setAttribute('tilt', '18'); // live update
```

Acceptance/verification
- With stars isotropic (bandWeight = 0.0), varying tilt changes only the galaxy band angle.
- Verify both backends (WebGPU/WebGL2) respond to live tilt changes.
- Resize window: tilt is preserved and reapplied post-resize.

Potential issues and considerations
- Input validation: clamp to a sensible range (e.g., [-45, 45]) to avoid extreme angles that look odd.
- Units/sign: define positive angles as counter-clockwise (current shaders treat positive as CCW). Document this.
- Presets: if presets set tilt internally, attribute should override preset value unless a strict preset mode is active.
- SSR/No-DOM: Not applicable today; component is client-only.
- Performance: negligible (single uniform update).

Open questions
- Should tilt be part of presets JSON and saved with demo presets?
- Do we also want a width control (band sigma) exposed as an attribute (e.g., band-width)?

Rollback plan
- Revert observedAttributes and Engine methods; default tilt remains 12 degrees in the galaxy pass constructors.
