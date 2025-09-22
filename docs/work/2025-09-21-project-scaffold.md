# Scaffold: Vue 3 + Vite + TypeScript with WebGPU-first renderer and WebGL2 fallback

Date: 2025-09-21T19:55:00Z
Author: Agent Mode

Summary
- Created a fresh project scaffold with a Web Component <abyss-veil> that renders full-screen and selects WebGPU (preferred) or WebGL2 (fallback). Minimal renderer currently clears the screen with an animated color.

Why this solution
- Vite + TS provides fast DX; Vue 3 chosen per PRD defaults and to enable future UI panels if needed.
- Web Component wrapper (<abyss-veil>) makes embedding trivial without forcing a framework mount.
- Two backends (WebGPU + WebGL2) align with performance/capability goals and fallback policy.

Alternatives considered (and why not used)
- create-vue scaffolder: heavier footprint than needed; manual structure is sufficient.
- Next.js/SSR: unnecessary for a visual renderer demo; SPA + static export is enough.
- Vanilla-only app shell: Vue gives us optional UI affordances with negligible overhead.

New files created (initial content)
- D:\Github\abyss\package.json (scripts, deps)
- D:\Github\abyss\tsconfig.json; tsconfig.node.json
- D:\Github\abyss\vite.config.ts
- D:\Github\abyss\index.html
- D:\Github\abyss\src\main.ts
- D:\Github\abyss\src\elements\abyss-veil.ts
- D:\Github\abyss\src\renderer\index.ts
- D:\Github\abyss\src\renderer\webgpu.ts
- D:\Github\abyss\src\renderer\webgl2.ts
- D:\Github\abyss\.gitignore
- D:\Github\abyss\README.md

Key snippets

index.html (full-viewport element)
```html path=D:\Github\abyss\index.html start=1
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Abyss Veil</title>
    <style>
      html, body, #app { height: 100%; margin: 0; background: #0b0f16; }
      .stage { position: fixed; inset: 0; }
    </style>
  </head>
  <body>
    <div id="app">
      <abyss-veil class="stage" preset="glass" quality="auto"></abyss-veil>
    </div>
    <script type="module" src="/src/main.ts"></script>
  </body>
</html>
```

Custom element registration
```ts path=D:\Github\abyss\src\elements\abyss-veil.ts start=1
import { Engine, Quality, Preset } from '../renderer';

export class AbyssVeilElement extends HTMLElement {
  #shadow: ShadowRoot;
  #canvas: HTMLCanvasElement;
  #engine: Engine | null = null;
  #resizeObs?: ResizeObserver;
  // ... see file for full implementation
}
```

Engine facade (backend selection)
```ts path=D:\Github\abyss\src\renderer\index.ts start=1
import { WebGPUEngine } from './webgpu';
import { WebGL2Engine } from './webgl2';

export class Engine { /* selects WebGPU if available; otherwise WebGL2 */ }
```

Build script tweak
- File: D:\Github\abyss\package.json
- Lines changed: 7–9
- Changed build script from vue-tsc -b && vite build to vue-tsc --noEmit -p tsconfig.json && vite build to perform type checking without emitting.
```json path=D:\Github\abyss\package.json start=6
  "scripts": {
    "dev": "vite",
    "build": "vue-tsc --noEmit -p tsconfig.json && vite build",
    "preview": "vite preview --open"
  },
```

Verification
- npm install && npm run dev
- Open localhost URL; expect animated color background.
