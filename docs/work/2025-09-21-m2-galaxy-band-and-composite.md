# M2: Galaxy band pass and background composite (PRD-aligned)

Date: 2025-09-21T20:23:26Z
Author: Agent Mode

Summary
- Implemented M2 core: a dedicated galaxy band pass rendered to an offscreen target (RT_galaxy) and a background composite that combines RT_stars + RT_galaxy to the screen. Stars remain isotropic; the tilted band is isolated in the galaxy pass, per PRD pipeline.

Why this solution
- Aligns with PRD pipeline: Stars → RT_stars, Galaxy → RT_galaxy, Combine → Screen.
- Keeps canvas/UI axis-aligned; only the galaxy band is tilted (by rotating coordinates inside the galaxy pass).
- Sets up future integration for lens sampling against RT_bgSG and later nebula compositing.

Files added
- WebGPU
  - src/renderer/galaxy/webgpuGalaxyPass.ts: full-screen triangle shader producing a tilted Gaussian-like band with a yellow↔blue gradient; ACES tonemap; clears black.
  - src/renderer/composite/webgpuCompositePass.ts: full-screen triangle that samples RT_stars and RT_galaxy and writes to the swapchain; clears to base background color.
- WebGL2
  - src/renderer/galaxy/webgl2GalaxyPass.ts: full-screen quad drawing a tilted Gaussian band with ACES tonemap; clears black via engine before draw.
  - src/renderer/composite/webgl2CompositePass.ts: full-screen quad sampling stars+galaxy textures and writing to default framebuffer; clears to base background color via engine before draw.

Files modified
- src/renderer/stars/webgpuStarPass.ts
  - Render pass clear changed to black (0,0,0,1) for offscreen usage.
- src/renderer/stars/webgl2StarPass.ts
  - Clear color changed to black for offscreen FBO usage.
- src/renderer/webgpu.ts
  - Added creation of offscreen textures (rtStars, rtGalaxy) with RENDER_ATTACHMENT | TEXTURE_BINDING.
  - Integrated WebGPUGalaxyPass and WebGPUCompositePass.
  - Loop now: stars → rtStars, galaxy → rtGalaxy, composite → swapchain.
  - Resize now recreates RTs and updates composite inputs and pass viewports.
- src/renderer/webgl2.ts
  - Added FBOs+textures for stars and galaxy; created WebGL2GalaxyPass and WebGL2CompositePass.
  - Loop now: bind fboStars, render stars; bind fboGalaxy, render galaxy; unbind, clear background, composite to screen.
  - Resize rebuilds offscreen targets.

Key code snippets
- WebGPU composite draw
```ts path=D:\Github\abyss\src\renderer\webgpu.ts start=99
  private loop = () => {
    if (this.device && this.ctx && this.stars && this.galaxy && this.composite && this.rtStars && this.rtGalaxy) {
      const swapTex = this.ctx.getCurrentTexture();
      const swapView = swapTex.createView();
      const encoder = this.device.createCommandEncoder();

      // Stars to RT
      this.stars.render(encoder, this.rtStars.createView());
      // Galaxy to RT
      this.galaxy.render(encoder, this.rtGalaxy.createView());
      // Composite to screen
      this.composite.render(encoder, swapView);

      this.device.queue.submit([encoder.finish()]);
    }
    this.rafId = requestAnimationFrame(this.loop);
  };
```

- WebGL2 composite draw
```ts path=D:\Github\abyss\src\renderer\webgl2.ts start=76
  private loop = () => {
    const gl = this.gl;
    if (gl && this.stars && this.galaxy && this.composite && this.fboStars && this.fboGalaxy && this.texStars && this.texGalaxy) {
      // Stars to FBO
      gl.bindFramebuffer(gl.FRAMEBUFFER, this.fboStars);
      gl.viewport(0, 0, this.canvas.width, this.canvas.height);
      gl.clearColor(0,0,0,1);
      gl.clear(gl.COLOR_BUFFER_BIT);
      this.stars.render();

      // Galaxy to FBO
      gl.bindFramebuffer(gl.FRAMEBUFFER, this.fboGalaxy);
      gl.viewport(0, 0, this.canvas.width, this.canvas.height);
      gl.clearColor(0,0,0,1);
      gl.clear(gl.COLOR_BUFFER_BIT);
      this.galaxy.render();

      // Composite to screen
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.viewport(0, 0, this.canvas.width, this.canvas.height);
      gl.clearColor(0.02, 0.03, 0.06, 1);
      gl.clear(gl.COLOR_BUFFER_BIT);
      this.composite.render(this.texStars, this.texGalaxy);
    }
    this.rafId = requestAnimationFrame(this.loop);
  };
```

Verification
- npm run dev
- Expect: isotropic star field and a distinct tilted band rendered as a separate layer; overall background matches previous tint; no canvas tilt.
- Resize the window; stars/galaxy recompute RTs correctly.
- Test in WebGPU and WebGL2; both paths produce similar results.

Notes and next steps
- The galaxy band is a placeholder (Gaussian along a rotated axis with a simple yellow↔blue gradient). In M2 polish, we’ll add impostor sprites and Sersic/log-spiral shaping per PRD.
- Tonemapping currently occurs inside each pass; composite is additive with clamp. In a later milestone, move tonemapping to the final composite for more physically consistent blending.
