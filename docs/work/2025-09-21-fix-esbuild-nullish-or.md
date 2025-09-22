# Fix: esbuild transform error when mixing ?? and || in resize()

Date: 2025-09-21T20:04:37Z
Author: Agent Mode

Summary
- The dev server failed to build with esbuild complaining about mixing nullish coalescing (??) and logical OR (||) without parentheses.
- Fix: Replace mixed expressions with pure nullish-coalescing chains to avoid operator-precedence pitfalls and satisfy esbuild.

Error
- Vite/esbuild:
  - D:/Github/abyss/src/renderer/webgpu.ts:53:71: ERROR: Cannot use "||" with "??" without parentheses
  - D:/Github/abyss/src/renderer/webgpu.ts:54:73: ERROR: Cannot use "||" with "??" without parentheses

Why this solution
- Using only ?? captures the intended semantics: treat undefined/null as missing while allowing falsy-but-valid values like 0.
- Avoids reliance on parentheses for mixed operators, keeping codebase consistent and less error-prone.
- No behavioral regressions vs the intended fallback (we still fall back to 1 when clientWidth/clientHeight/DPR are nullish).

Alternatives considered (and why not used)
- Add parentheses around the mixed expression, e.g. (width ?? this.canvas.clientWidth) || 1
  - Would satisfy esbuild, but still mixes semantics (|| treats 0 as falsy). The all-?? approach is clearer and safer.
- Change build target / esbuild options to allow mixing
  - Unnecessary and brittle. Better to improve the code than tweak tool constraints.

Exact changes

1) D:\Github\abyss\src\renderer\webgpu.ts
- Lines changed: 53–55.
- Before (lines 53–55):
```ts path=null start=null
const w = Math.max(1, Math.floor((width ?? this.canvas.clientWidth || 1)));
const h = Math.max(1, Math.floor((height ?? this.canvas.clientHeight || 1)));
const ratio = dpr ?? (globalThis.devicePixelRatio || 1);
```
- After:
```ts path=D:\Github\abyss\src\renderer\webgpu.ts start=52
  resize(width?: number, height?: number, dpr?: number) {
    const w = Math.max(1, Math.floor((width ?? this.canvas.clientWidth ?? 1)));
    const h = Math.max(1, Math.floor((height ?? this.canvas.clientHeight ?? 1)));
    const ratio = dpr ?? (globalThis.devicePixelRatio ?? 1);
    this.canvas.width = Math.floor(w * ratio);
    this.canvas.height = Math.floor(h * ratio);

    if (this.ctx && this.device && this.format) {
      this.ctx.configure({ device: this.device, format: this.format, alphaMode: 'premultiplied' });
    }
  }
```

2) D:\Github\abyss\src\renderer\webgl2.ts
- Lines changed: 38–40.
- Before (lines 38–40):
```ts path=null start=null
const w = Math.max(1, Math.floor((width ?? this.canvas.clientWidth || 1)));
const h = Math.max(1, Math.floor((height ?? this.canvas.clientHeight || 1)));
const ratio = dpr ?? (globalThis.devicePixelRatio || 1);
```
- After:
```ts path=D:\Github\abyss\src\renderer\webgl2.ts start=37
  resize(width?: number, height?: number, dpr?: number) {
    const w = Math.max(1, Math.floor((width ?? this.canvas.clientWidth ?? 1)));
    const h = Math.max(1, Math.floor((height ?? this.canvas.clientHeight ?? 1)));
    const ratio = dpr ?? (globalThis.devicePixelRatio ?? 1);
    this.canvas.width = Math.floor(w * ratio);
    this.canvas.height = Math.floor(h * ratio);

    if (this.gl) {
      this.gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    }
  }
```

Verification steps
- npm run dev
- Open the dev server URL in a WebGPU-capable browser (or WebGL2 fallback).
- Expect: Dev server builds without errors; full-screen animated background renders.
