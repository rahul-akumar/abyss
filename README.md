```

                  ______
                ,'"       "-._                              
              ,'              "-._ _._
              ;              __,-'/   |
            ;|           ,-' _,'"'._,.
            |:            _,'      |\ `.
            : \       _,-'         | \  `.
              \ \   ,-'             |  \   \
              \ '.         .-.     |       \
                \  \         "      |        :
                `. `.              |        |
                  `. "-._          |        ;
                  / |`._ `-._      L       /
                  /  | \ `._   "-.___    _,'
                /   |  \_.-"-.___   """"
                \   :            /"""
                  `._\_       __.'_
            __,--''_ ' "--'''' \_  `-._
      __,--'     .' /_  |   __. `-._   `-._
      <            `.  `-.-''  __,-'     _,-'
      `.            `.   _,-'"      _,-'
        `.            ''"lka    _,-'
          `.                _,-'
            `.          _,-'
              `.   __,'"
                `'"
    ___    __                                  _ __
   /   |  / /_  __  ____________   _   _____  (_) /
  / /| | / __ \/ / / / ___/ ___/  | | / / _ \/ / / 
 / ___ |/ /_/ / /_/ (__  |__  )   | |/ /  __/ / /  
/_/  |_/_.___/\__, /____/____/    |___/\___/_/_/   
             /____/                                
```

# Abyss Veil

Abyss Veil is a small, purpose-built rendering engine with custom shaders for real-time, browser-based cosmic visuals. It is WebGPU-first with a WebGL2 fallback. It's more than a shader demo—it includes reusable rendering infrastructure—but it is not a general-purpose 3D engine.

## Overview
- Purpose: deliver high-quality generative/space visuals in the browser with a clean, minimal core you can extend.
- Tech: WebGPU (preferred) with graceful WebGL2 fallback under Vite.
- Surface: a custom web component (`<abyss-veil>`) that drives the render loop.

## Scope
What this is:
- A tiny rendering engine scaffold: device/adapter acquisition, swapchain/context setup, pipeline and bind group management, frame loop, resize and DPR handling, and timing.
- Pass orchestration: a simple, frame-graph-style sequence (clear → render/compute passes → post-processing).
- Custom shaders: full-screen triangle, noise/fields, bloom/tonemap and related post-FX.

What this is not:
- A full general-purpose 3D engine (no scene graph, material system, model loading, nor PBR pipeline).
- A "just shaders" sketch without reusable infrastructure.

## Features
- WebGPU-first, WebGL2 fallback
- Deterministic frame loop with time uniforms
- Pipeline and bind group setup
- Resize-aware rendering (HiDPI/retina)
- Clean pass boundaries (easy to add new passes)
- Configurable post-processing pipeline

## Architecture at a glance
- Core: device/adapter selection, context/swapchain, command encoding, submission
- Renderer: pass orchestration, per-frame uniforms
- Passes: clear pass, main render pass (full-screen), post-FX passes
- Shaders: WGSL/GLSL depending on backend; shared constants and uniforms
- Integration: `<abyss-veil>` custom element mounting and lifecycle

## Status & Roadmap
Current status
- Minimal stub in place (clear-only).

Next milestones (high-level)
- M1: First drawable pass — full-screen triangle, time/resolution uniforms, base fragment shader
- M2: Pass graph — multi-pass structure, ping-pong targets, tone mapping
- M3: Cosmic fields — noise/FBM fields, basic bloom
- M4: Controls/interaction — parameters, inputs, pause/resume
- M5: Performance polish — feature checks, formats, fallback improvements
- M6: Packaging/polish — docs, examples, presets

## Getting started

- With npm
```
npm install
npm run dev
```

- With pnpm
```
pnpm install
pnpm dev
```

Open the dev server URL (usually http://localhost:5173). You should see a full-screen animated background driven by WebGPU (or WebGL2 fallback) inside the `<abyss-veil>` element.

## Build
```
npm run build
npm run preview
```

## Compatibility
- WebGPU support requires Chrome/Edge ≥113 or Safari ≥17.4. Firefox will use WebGL2 fallback for now.
- If WebGPU is unavailable, the app should run with a WebGL2 fallback (with a subset of effects).
