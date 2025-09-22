# M4: Glass lens — scaffold and integration

Date: 2025-09-22T05:13:54Z
Author: Agent Mode

Summary
- Implemented a glass lens overlay pass that refracts and magnifies stars+galaxy while excluding the nebula inside the lens footprint. Includes Fresnel rim and mild chromatic dispersion. Controls are exposed via element attributes.

Files added
- WebGPU lens pass
  - src/renderer/lens/webgpuLensPass.ts — samples RT_stars and RT_galaxy; draws after composite with loadOp: 'load' so it overlays the final frame. Uniforms: resolution, center, radiusPx, zoom, dispersion.
- WebGL2 lens pass
  - src/renderer/lens/webgl2LensPass.ts — same logic with GLSL; draws after composite.

Engine integration
- WebGPU: src/renderer/webgpu.ts
  - Instantiate WebGPULensPass; set inputs (rtStars/rtGalaxy), viewport, and params; render after composite to the swapchain.
- WebGL2: src/renderer/webgl2.ts
  - Instantiate WebGL2LensPass; render after composite using texStars/texGalaxy.

Controls (element attributes)
- src/elements/abyss-veil.ts
  - lens-radius (px), lens-zoom (≥1.0), lens-dispersion (0..1)
  - Parsed on connect and on attribute change; forwarded via Engine.setLensParams.

API additions
- src/renderer/index.ts
  - IRenderer.setLensParams(radiusPx, zoom, dispersion); Engine forwards to backends.

Behavior details
- Inside lens circle: refract+zoom stars+galaxy (nebula ignored); outside: present composite stays.
- Refraction: baseUv += n * (k1*rn + k2*rn^2) where rn = r / radiusPx, tuned small.
- Zoom: UV remap toward center by 1/zoom.
- Dispersion: small per-channel offset along radial n.
- Fresnel rim: smoothstep(0.9, 1.0, rn) adding a subtle edge highlight.

Verification
- Use default attributes (implicit): radius≈200px, zoom≈1.25, dispersion≈0.35.
- Update attributes live to see lens respond: radius, zoom, dispersion.
- Confirm nebula is hidden inside lens footprint; stars+galaxy are refracted and magnified.

Notes / next
- Center is fixed at screen center for now; can add pointer drag later.
- For M5 (BH), we will swap this pass for a GR-inspired remap and add photon ring and accretion cues.
