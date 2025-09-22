# Guard applied: curl flow disabled to diagnose black screen

Date: 2025-09-22T05:06:29Z
Author: Agent Mode

Action
- Set flowAmp to 0.0 (disabling curl domain warp) in both nebula shaders to confirm if curl caused the black screen.

Files/lines
- WebGPU: D:\Github\abyss\src\renderer\nebula\webgpuNebulaPass.ts
  - line ~133: `let flowAmp = 0.0; // guard`
- WebGL2: D:\Github\abyss\src\renderer\nebula\webgl2NebulaPass.ts
  - line ~64: `float flowAmp = 0.0; // guard`

Next
- Reload dev server page. If visuals return, the curl implementation likely pushed alpha toward 1 everywhere (or otherwise broke the sampling), causing the premultiplied over to blank stars+galaxy. If still black, we’ll check shader compile/link errors and bindings.
