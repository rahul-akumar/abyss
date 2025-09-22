# Star field isotropic: remove band anisotropy from star generation

Date: 2025-09-21T20:34:14Z
Author: Agent Mode

Summary
- Stars looked tilted because the star generator still included a galactic band (bandTiltDeg and bandWeight). With the new galaxy pass also adding its own tilted band, the two overlapped.
- Fix: Make the star field isotropic by setting bandTiltDeg=0 and bandWeight=0.0 in the star generation calls.

Exact changes (before → after)

1) D:\Github\abyss\src\renderer\stars\webgpuStarPass.ts (line 49)
Before:
```ts path=D:\Github\abyss\src\renderer\stars\webgpuStarPass.ts start=49
const data = generateStars({ count: starCount, seed: 1337, bandTiltDeg: 0, bandSigma: 0.25, bandWeight: 0.7 });
```
After:
```ts path=null start=null
const data = generateStars({ count: starCount, seed: 1337, bandTiltDeg: 0, bandSigma: 0.25, bandWeight: 0.0 });
```

2) D:\Github\abyss\src\renderer\webgl2.ts (line 43)
Before:
```ts path=D:\Github\abyss\src\renderer\webgl2.ts start=43
const starData = generateStars({ count: 20000, seed: 1337, bandTiltDeg: 12, bandSigma: 0.25, bandWeight: 0.7 });
```
After:
```ts path=D:\Github\abyss\src\renderer\webgl2.ts start=43
const starData = generateStars({ count: 20000, seed: 1337, bandTiltDeg: 0, bandSigma: 0.25, bandWeight: 0.0 });
```

Why this solution
- Keeps canvas/UI axis-aligned.
- Preserves the galaxy band tilt exclusively in the dedicated galaxy pass (RT_galaxy), matching the PRD pipeline.
- Prevents the star layer from visually reintroducing an extra band.

Verification
- npm run dev
- Expect: isotropic star field (uniform stars) and a distinct tilted galaxy band.
- Test in a WebGPU browser and in WebGL2 (Firefox). Both paths should show no star tilt.
