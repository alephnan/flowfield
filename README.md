# Flowfield — Strange Attractor Visualizer

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
- Tweakpane for the control panel, KaTeX for equations
- Vite for bundling and dev serving

## Prerequisites

- Node.js 18+ and npm
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
| `npm run typecheck` | Run `tsc --noEmit`. This is the only correctness check in the repo — there is no linter and no test suite. |
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

## Deployment

The app is a static bundle, so it can be hosted on any static host or CDN. `vite.config.ts` sets `base: './'` (relative asset paths), so the build works from a subdirectory without extra configuration.

### GitHub Pages

1. `npm run build`
2. Publish the contents of `dist/` to your Pages source (for example, push `dist/` to a `gh-pages` branch, or use a GitHub Actions workflow that runs `npm ci && npm run build` and uploads `dist/` as the Pages artifact).

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
    URLState.ts                app state <-> query string serialization
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
