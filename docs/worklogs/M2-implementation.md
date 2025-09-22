# M2: Tilted galaxy pass + composite integration

Date: 2025-09-22

Overview
Implemented a dedicated galaxy render pass (WebGPU + WebGL2) that renders an anisotropic, tilted band to an offscreen texture. The star field remains axis-aligned and isotropic. A composite pass blends star, galaxy, and nebula targets to the screen. Lens pass overlays refractive effects without rotating the canvas.

Key points
- Star field: Procedural and isotropic; no band tilt applied here
- Galaxy pass: Rotated band density with smooth gradient and color ramp
- Composite: Blends offscreen star, galaxy, and nebula textures
- Offscreen render targets recreated on resize
- Implemented in both backends (WebGPU + WebGL2)

Rationale
Separating tilt into the galaxy pass avoids unintended canvas rotation and preserves the PRD requirement of axis-aligned star field rendering. Offscreen pass architecture also makes it easier to adjust visual contributions independently and optimize performance per pass.

Implementation notes
- WebGPU
  - Created WebGPUGalaxyPass to render tilted band to RT
  - Created WebGPUCompositePass to blend star+galaxy(+nebula)
  - Passes wired in WebGPUEngine with RT lifecycle and resize handling
- WebGL2
  - Created WebGL2GalaxyPass and WebGL2CompositePass with analogous behavior
  - Offscreen FBOs for stars, galaxy, nebula; resized on canvas changes

Next steps
- Validate visual correctness across device/resolution/DPR changes
- Profile pass timings and bandwidth; consider half-res render for galaxy if needed
- Iterate on galaxy color ramp and band sigma for desired look

Files
- src/renderer/galaxy/webgpuGalaxyPass.ts
- src/renderer/galaxy/webgl2GalaxyPass.ts
- src/renderer/composite/webgpuCompositePass.ts
- src/renderer/composite/webgl2CompositePass.ts
- src/renderer/webgpu.ts
- src/renderer/webgl2.ts