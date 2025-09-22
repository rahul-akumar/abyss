# Fix: Impostor band tilt sign (mirror) vs. galaxy band

Date: 2025-09-22T04:31:02Z
Author: Agent Mode

Problem
- The impostor band appeared mirrored relative to the galaxy band tilt. The band shader rotates screen coords into band space with one sign, while the impostor vertex shader rotated band-space centers into screen space with the opposite mapping.

Root cause
- Inconsistent rotation direction between:
  - Galaxy band FS: rotates screen -> band with +tilt in our implementation
  - Impostor VS: rotated band -> screen also with +tilt (should use −tilt to match the band’s mapping)

Change
- Use inverse rotation (−tilt) for impostor center transform so the band tilt and impostor distribution share the same sign.

Files/lines
- WebGPU: D:\Github\abyss\src\renderer\galaxy\webgpuGalaxyPass.ts
  - Around vsImp center transform (~lines 183–185):
```wgsl path=D:\Github\abyss\src\renderer\galaxy\webgpuGalaxyPass.ts start=181
  let ct = cos(U.tilt); let st = sin(U.tilt);
  // Use inverse rotation (−tilt) to map band-frame center to screen so band and impostors share the same tilt sign
  let p = vec2<f32>(input.centerUV.x * ct + input.centerUV.y * st, -input.centerUV.x * st + input.centerUV.y * ct);
```
- WebGL2: D:\Github\abyss\src\renderer\galaxy\webgl2GalaxyPass.ts
  - Around vsImp center transform (~lines 111–113):
```glsl path=D:\Github\abyss\src\renderer\galaxy\webgl2GalaxyPass.ts start=109
      float ct = cos(uTilt); float st = sin(uTilt);
      // Inverse rotation (−tilt) so impostor band aligns with galaxy band tilt
      vec2 pc = vec2(aCenter.x * ct + aCenter.y * st, -aCenter.x * st + aCenter.y * ct);
```

Verification
- npm run dev
- Visual: impostor distribution follows the same tilt orientation as the galaxy band. The earlier “mirrored” look should be gone.

Notes
- The galaxy band FS currently uses +tilt for screen→band mapping, which was visually acceptable. Matching impostors by using −tilt for band→screen centers keeps both aligned. If we later change the band FS mapping sign, we must update this transform accordingly.
