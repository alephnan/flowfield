# Flowfield — a gallery for living mathematics

A browser-based visualizer for continuous dynamical systems. Up to ~1,000,000 particles are advected through a vector field (a strange attractor) and integrated **entirely on the GPU**, so you can drag a parameter slider and watch a system slide from a stable fixed point through a limit cycle into chaos in real time, with no frame hitching.

It ships with nine classic attractors (Lorenz, Rössler, Aizawa, Thomas, Halvorsen, Chen, Dadras, Van der Pol, and the forced Duffing oscillator). Each system renders as a live point cloud, optional motion trails, and an optional vector-field glyph lattice, with per-system equations (rendered via KaTeX) and presets that demonstrate qualitative regime changes across bifurcation values.

## How it works

- **GPU-only simulation.** Integration (Euler / RK4), particle aging, respawn, and speed-based color mapping all run in TSL compute and material node graphs. The CPU never reads particle state back — it only writes uniforms and dispatches compute passes. Simulation and rendering share GPU storage buffers.
- **Uniform-driven parameters.** Anything a slider adjusts is a GPU `uniform()` whose value is mutated on the CPU — no shader recompilation on tweak. Only changing the system, integrator, particle count, colormap, or render mode triggers a pipeline rebuild.
- **Shareable state.** The full app state (system, parameters, simulation/render settings, and camera) is serialized to the URL query string, so any view can be shared or bookmarked as a link.
- **Graceful fallback.** Runs on WebGPU where available and transparently falls back to WebGL2 (with lower particle/trail caps and no bloom) when `navigator.gpu` is missing. Append `?forceWebGL` to the URL to force the fallback path.

## Tech stack

- Vanilla TypeScript (no UI framework), strict mode
- Three.js `WebGPURenderer` programmed via TSL (Three Shading Language) node system
- Reusable native TypeScript controls, KaTeX for equations
- Locally bundled Newsreader, IBM Plex Sans, and IBM Plex Mono fonts; licenses in `public/fonts/`
- Vite for bundling and dev serving

## Prerequisites

- Node.js 20.19+ or 22.12+ and npm (required by the installed Vite version)
- A browser with WebGPU for the full experience (recent Chrome/Edge). Any WebGL2 browser works on the fallback path.

## Getting started (development)

```bash
npm install
npm run dev
```

Vite prints a local URL (served with `--host`, so it is also reachable from other devices on your network). Open it in a WebGPU-capable browser.

> Note: on WSL2 under `/mnt/c`, file watching uses polling (configured in `vite.config.ts`), so saved edits are picked up on a roughly 400 ms interval.

## Available scripts

| Command | What it does |
|---|---|
| `npm run dev` | Start the Vite dev server (`vite --host`). |
| `npm run build` | Typecheck then produce a static build (`tsc --noEmit && vite build`). The typecheck gates the build. |
| `npm run typecheck` | Run strict TypeScript checks without emitting files. |
| `npm test` | Run focused Node regression tests for shared URLs, camera framing, and export recovery. |
| `npm run preview` | Serve the built `dist/` locally (`vite preview --host`). |

## Building for production

```bash
npm run build
```

This typechecks and emits a fully static site into `dist/`. There is no server-side component — the output is plain HTML, JS, and assets.

To verify the production build locally before deploying:

```bash
npm run preview
```

## Exploring the gallery

Use **Shape** for presets, exact parameter values, and variations with one-step undo. **Appearance** contains drawing modes, palettes, Dark/Paper canvas treatments, and collapsible Camera and Quality settings. **Mathematics** connects the equations and parameter descriptions, with vector fields and advanced numerical controls.

Playback, restart, speed, and Fit view remain beside the artwork. Share, PNG export (up to 2×, capped at 4096 pixels per edge), and Focus view are in the header or the phone's Menu. Below 1100px, Controls opens a sheet with independent scrolling. Automatic views refit to available space; shared and manually adjusted cameras keep their composition until Fit view is selected.

Rotate by dragging, zoom with the wheel or a pinch, and click/tap the canvas to seed particles. The **How to explore** dialog lists keyboard equivalents. Shortcuts avoid editable controls, and reduced-motion preferences start playback paused. Arrow keys rotate a focused canvas; `+`/`−` zoom it. `Space` toggles playback, `.` steps while paused, `I` opens mathematics, `F` enters Focus view, and `Esc` closes it or the controls.

The interface stores its open tab and panel visibility separately from simulation settings. Existing URL keys remain compatible. New links preserve exact parameter precision and include the camera.

## Deployment

The app is a static bundle, so it can be hosted on any static host or CDN. `vite.config.ts` sets `base: './'` (relative asset paths), so the build works from a subdirectory without extra configuration.

### GitHub Pages

The live app is published at [alephnan.github.io/flowfield](https://alephnan.github.io/flowfield/).

Every successful push to `main` builds the app and deploys `dist/` through GitHub Actions. Pull requests run the build validation only, so they cannot publish the site.

Because `base` is already relative, the site works whether it is served from `user.github.io/` or `user.github.io/repo-name/`.

### Netlify / Vercel / Cloudflare Pages

Use these build settings:

- Build command: `npm run build`
- Output/publish directory: `dist`
- Install command: `npm ci` (or `npm install`)

### Any static host

Run `npm run build` and copy the contents of `dist/` to your web root (S3 + CloudFront, nginx, an object store, etc.). No environment variables or runtime services are required.

## Adding a new attractor

Each system is a single declarative `SystemDefinition`. To add one:

1. Create a file in `src/systems/` that exports a definition with a pure-TSL `derivative(p, params, time)`, parameter specs and defaults (timestep, spawn region, camera, scale), optional presets, and KaTeX equations.
2. Add one import and one array entry in `src/systems/registry.ts`.

Nothing in the engine is special-cased per system.

## Project layout

```
src/
  main.ts                     boot path and top-level App orchestrator
  app/
    SimulationController.ts    particle buffers + fused GPU integrate kernel
    RenderController.ts        scene, camera, node materials, optional bloom
    UIController.ts            responsive shell, playback, sharing, feedback
    URLState.ts                app state <-> query string serialization
    framing.ts                 responsive authored-camera framing
    capture.ts                 exception-safe export resolution changes
  ui/
    controls.ts                accessible native control primitives
    panel.ts                   Shape / Appearance / Mathematics inspector
    palettes.ts                static palette previews and color labels
    hud.ts                     quiet playback status and on-demand diagnostics
  systems/
    registry.ts                the list of systems
    lorenz.ts, rossler.ts, ... one SystemDefinition per attractor
  tsl/
    integrators.ts             euler / rk4 factories
    prng.ts                    on-GPU pcg3d hashing
    spawn.ts                   spawn-region sampling
    colormaps.ts               in-shader polynomial colormaps
  types.ts                     SystemDefinition interface and TSL type aliases
```
