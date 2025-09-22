# Controls: nebula-density and nebula-g

Date: 2025-09-22T04:56:19Z
Author: Agent Mode

Summary
- Added minimal, PRD-aligned controls as element attributes:
  - nebula-density (0..1, default 0.5)
  - nebula-g (anisotropy, default 0.2)
- Threaded through the Engine to both backends and applied in the nebula passes.

Exact changes
- Element: D:\Github\abyss\src\elements\abyss-veil.ts
  - observedAttributes now includes 'nebula-density', 'nebula-g'.
  - connectedCallback parses attributes and calls engine.setNebulaParams(density, g).
  - attributeChangedCallback updates params live on change.

- API: D:\Github\abyss\src\renderer\index.ts
  - IRenderer: added setNebulaParams(density: number, g: number).
  - Engine: forwards setNebulaParams to backend.

- WebGPU: D:\Github\abyss\src\renderer\webgpu.ts
  - Added setNebulaParams implementation; stores defaults and applies to WebGPUNebulaPass when available.

- WebGL2: D:\Github\abyss\src\renderer\webgl2.ts
  - Added setNebulaParams implementation; forwards to WebGL2NebulaPass.

Verification
- In index.html, specify or tweak attributes:
  <abyss-veil class="stage" preset="glass" quality="auto" nebula-density="0.6" nebula-g="0.1"></abyss-veil>
- Live updates: modifying attributes at runtime should change the nebula look without hitches.
