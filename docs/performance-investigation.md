# Flowfield performance investigation

Date: October 27, 2026. Scope: investigate performance and alternatives while retaining the current design and visual quality.

## Recommendation

Keep the TypeScript interface and GPU simulation. Optimize GPU data layout, rendering work, and resource ownership before considering a language rewrite.

The investigation produced two useful prototypes: a WebGPU trail layout that reduced measured drawing time by approximately **25–30%**, and explicit resource cleanup that prevented repeated settings changes from accumulating GPU allocations. Their tested images were **identical in every RGBA pixel** to the baseline. These were isolated experiments during the investigation. The subsequent implementation is described below; its scope is resource cleanup and the WebGPU trail layout.

A Rust or C++ implementation remains possible, but the expensive mathematical integration already executes on the GPU. Moving that work to CPU WebAssembly would address a small fraction of the measured frame cost while introducing transfers back to the GPU.

## Original investigation: repository and validation

The checkout's working tree was clean and main was three commits behind the remote. A fast-forward update moved it from b224c7f to **4b496ae04ab2f5fbfda8f4a9bcc7ec70b699174b**, matching origin/main and the independently queried remote main.

The latest changes include the RGH portfolio design and the required Node version. Validation used Node **24.22.1**, Three.js **0.185.1**, and the locked dependencies:

- All eight existing regression tests passed.
- The production build and strict TypeScript checks passed.
- Application files under src/, the package manifests, and the lockfile were unchanged by this investigation.
- Added files consist of this report, recorded measurements, and standalone profiling scripts; the ignore list also excludes Python bytecode caches.

## Measurements

Tests ran in Chrome for Testing **156.0.8078.47**, headless on Windows, using the real **Intel UHD / gen-12lp GPU**. The machine also has an NVIDIA GeForce RTX 4060 Laptop GPU. The browser warned that the application's high-performance adapter preference is currently ignored on Windows; these measurements do not establish which adapter the user's usual browser selects.

Viewport: 1440 × 900 CSS pixels, DPR 2, physical artwork canvas 2140 × 1232. All primary tests used resolution scale 1, adaptive quality off, existing palettes/materials, and default RK4 with four substeps. Each case used a fresh page, 120 warmup frames, and 240 measured frames. GPU values below are averages of eight asynchronous timestamp samples, not CPU stopwatch durations around GPU submissions.

| Configuration | Average FPS | Frame p95 | GPU compute | GPU drawing |
|---|---:|---:|---:|---:|
| Default Aizawa points, 262,144 particles | 60.0 | 18.3 ms | 1.03 ms | 5.33 ms |
| Default trails, length 19 | 60.0 | 18.4 ms | 0.70 ms | 13.73 ms |
| Points and trails together | 59.3 | 21.2 ms | 0.60 ms | 15.02 ms |
| Thomas points | 60.0 | 19.3 ms | 0.81 ms | 4.92 ms |
| 1,048,576 Aizawa particles | 60.0 | 18.6 ms | 1.93 ms | 7.91 ms |
| Trails, length 64 | 21.5 | 51.6 ms | 0.88 ms | 44.48 ms |
| Explicit WebGL points, existing lower tier | 60.0 | 17.7 ms | unavailable | unavailable |
| Explicit WebGL trails, existing lower tier | 36.4 | 42.6 ms | unavailable | unavailable |

CPU frame submission averaged approximately 1–2 ms on the WebGPU cases. Compute includes trail updates when enabled. FPS can remain refresh-limited even when GPU time improves. WebGL uses different existing particle/trail limits, so its rows are not equivalent-workload comparisons with WebGPU.

The default scene did not reproduce sustained low FPS at this viewport. The measurements nevertheless identify substantial rendering cost, progressive allocation growth, and a fallback defect. Larger viewports, other adapters, long sessions, and other browser/device combinations remain relevant to the reported intermittent default slowdown.

These are short exploratory measurements of the Vite development build. They are not a production FPS guarantee, a thermal/battery endurance test, or a cross-device benchmark. WebGL frame times varied materially between runs. Recorded statistics and GPU samples are in [the evidence file](performance/2026-10-27.json).

### Separating pixels from geometry

Two diagnostic runs temporarily used half the resolution in the isolated browser. They are **not proposed optimizations** under the quality constraint.

Default point drawing fell from 5.33 to 2.81 ms. Long-trail drawing fell from 44.48 to 36.17 ms despite processing one quarter as many output pixels. This supports a mixture of pixel cost for points and substantial geometry/storage-access cost for trails. It does not prove the exact distribution of vertex ALU, memory bandwidth, rasterization, and blending.

## Findings and experiments

### 1. Trail storage is poorly matched to draw order

[RenderController](../src/app/RenderController.ts) stores history at particle × historyLength + slot, but draws segments in segment-major order: neighboring instances belong to neighboring trails at the same historical slot.

On WebGPU, vec3 storage is padded to 16 bytes. With history length 64, neighboring trail instances consequently fetch positions roughly 1024 bytes apart. The 65,536 × 64 history buffer occupies **64 MiB**. Length 19 draws **1,179,648 ribbon segments / 2,359,296 triangles**; length 64 draws **4,128,768 segments / 8,257,536 triangles**, before any point layer.

The prototype changes only indexing to slot × trailCount + particle. Neighboring trails then read adjacent history entries, and ordinary head updates write adjacent entries. Particle values, numerical integration, ring length, segment count, segment-major draw order, ribbon geometry, alpha, colors, and resolution remain unchanged.

| WebGPU case | Original GPU drawing | Prototype GPU drawing | Reduction |
|---|---:|---:|---:|
| Length 19, original-first run | 14.14 ms | 10.36 ms | 26.7% |
| Length 19, reverse-order run | 13.90 ms | 10.38 ms | 25.3% |
| Length 64, original-first run | 47.13 ms | 33.21 ms | 29.5% |
| Length 64, reverse-order run | 44.11 ms | 31.61 ms | 28.3% |

Long-trail playback improved from **20.5 to 28.4 FPS** in the first pair and **21.9 to 29.8 FPS** in the reverse-order pair. It still did not reach 60 FPS at full quality.

All four WebGPU image comparisons matched exactly after 180 fixed simulation steps. A WebGL comparison also matched pixels, but its frame time worsened from 16.75 to 19.32 ms in that pair, with significant variation relative to the earlier WebGL baseline. **Recommend the new layout for a WebGPU implementation first; retain the existing WebGL layout pending further testing.**

The prototype remains written in TSL. This is a measured low-level memory-access improvement without a Rust/C++ rewrite.

### 2. Repeated settings changes retain allocations

[App.applyParticleCount](../src/main.ts) replaces the simulation without disposing its previous resources. [SimulationController.buildKernels](../src/app/SimulationController.ts) replaces compute nodes without disposal. RenderController.disposeTrails disposes the visible mesh/material but only drops references to history storage and compute nodes.

| Repeated interaction | Initial tracked memory | After six changes and JS garbage collection | With cleanup prototype |
|---|---:|---:|---:|
| Alternate 131,072 / 262,144 particles | 37.2 MiB | 68.8 MiB | 37.2 MiB |
| Alternate trail density 0.5 / 1 | 101.2 MiB | 389.2 MiB | 101.2 MiB |

Six system switches also increased retained uniform buffers from 6 to 18; the cleanup prototype kept them at 6. These are Three.js tracked GPU allocations, not total process memory or independently measured physical VRAM residency.

Disposing compute nodes released their pipelines/bindings. Calling the standalone storage attributes' dispose method alone did **not** release the tracked allocations in the installed version. The successful experiment explicitly released them through the renderer's internal attribute manager. Production work should encapsulate and validate that version-specific ownership boundary, or use an upstream-supported solution. Do not copy the experimental private-API call into general application code without review.

The three cleanup comparisons matched every RGBA pixel after 120 fixed steps. Cleanup is a reliability/memory improvement; it does not by itself eliminate the steady-state trail rendering cost. That initial cleanup experiment was validated on WebGPU only. The production implementation described below also validates WebGL.

Three.js requires explicit disposal for relevant GPU resources; garbage collection alone is not a substitute. See its [resource disposal guidance](https://threejs.org/manual/pages/how-to-dispose-of-objects.html) and [ComputeNode API](https://threejs.org/docs/pages/ComputeNode.html).

### 3. Capability selection precedes actual backend initialization

[The boot path](../src/main.ts) selects its tier using navigator.gpu before awaiting renderer.init(). Three.js can fall back internally to WebGL while the app retains the WebGPU tier and label.

This happened in the installed older Chromium 129 test browser: actual backend WebGLBackend, selected tier webgpu, and 262,144 default particles. The intended explicit WebGL tier uses 131,072 particles and a smaller trail history/count. The old-browser run was used to observe fallback behavior, not to establish current WebGPU performance.

Derive capability reporting and allocation decisions from the initialized backend. Preserve requested quality or explain actual capability limits; reducing density or resolution must not be counted as a quality-preserving speedup. A modern browser and explicit compatibility mode also need separate regression coverage.

### 4. Paused rendering and point shading deserve targeted work

App.frame renders every animation frame even when playback is paused. The paused baseline continued near 60 draws per second and consumed measurable GPU time. Rendering only when something changes can save work while preserving a static image, provided camera damping, orbit/zoom, resize, parameter changes, single-step, and PNG capture still invalidate the frame.

The default point material evaluates polynomial colormaps and age fades in its material graph. A candidate experiment is to move particle-constant work into the vertex stage while retaining the circular edge mask per pixel. Unlike the trail layout, this candidate has not been benchmarked or visually validated here; extra vertex work may outweigh savings for small sprites.

## Alternatives

| Approach | Fit for this repository | Cost and visual-quality considerations |
|---|---|---|
| Optimize existing TypeScript + Three/TSL + WebGPU | **Recommended first.** The trail-layout experiment already demonstrates a gain. | Small, reviewable changes can preserve the existing UI and renderer semantics. Fix lifecycle ownership separately from steady-state FPS. |
| Targeted hand-written WGSL / direct WebGPU | Appropriate if further profiling identifies inefficient generated shaders or buffer handling. | Keep the existing UI and port only expensive passes. CPU submission is already small here, so bypassing Three alone has limited demonstrated headroom. Preserve tone mapping, blending, camera, ribbon expansion, and export. |
| Worker + OffscreenCanvas | Useful for UI responsiveness or shader/command preparation that blocks interaction. | Moving work off the UI thread does not reduce GPU draw cost. Input, camera, resize, and capture need a message boundary. |
| Rust → WebAssembly, with or without wgpu | Useful for substantial CPU workloads or sharing an engine with a native application. | Browser wgpu still targets WebGPU/WebGL. Replacing the CPU control layer does not inherently reduce the same shader workload. CPU integration would add uploads to the existing GPU rendering path. |
| C++ → WebAssembly / Emscripten | Most attractive when reusing an existing C++ engine or numerical library. | This repository has no such engine to reuse. Emscripten can access WebGPU, but rendering still depends on browser/GPU capabilities. Multithreaded builds also require the appropriate cross-origin isolation headers. |
| Native Rust/wgpu or C++ graphics application | A separate desktop direction if installation/distribution changes are acceptable. | Offers different platform/device control and avoids browser-specific restrictions, but the GPU must still draw the same geometry. Preserving the gallery UI and cross-platform behavior requires additional work. |

These assessments are inferences from the measured cost split and current platform capabilities, not benchmarks of Rust/C++ ports. No Rust or C++ version was built in this investigation.

Primary references: [Rust wgpu backends](https://docs.rs/wgpu/latest/wgpu/), [WebAssembly performance patterns](https://web.dev/articles/webassembly-performance-patterns-for-web-apps), [Emscripten WebGPU support](https://emscripten.org/docs/porting/multimedia_and_graphics/WebGPU-support.html), [Emscripten threading requirements](https://emscripten.org/docs/porting/pthreads.html), and [OffscreenCanvas](https://developer.mozilla.org/en-US/docs/Web/API/OffscreenCanvas).

## Implementation sequence and acceptance criteria

1. **Resource ownership and backend reporting.** Define who releases simulation buffers, history buffers, compute nodes, and replaced render objects. Confirm stable allocation counts through repeated count, density, integrator, and system changes on both backends. Use the initialized backend for diagnostics and capability decisions.
2. **WebGPU trail layout.** Integrate slot-major history behind the WebGPU path, retaining the existing fallback until it has independent evidence. Preserve draw order, including Paper mode.
3. **Default-point and idle rendering experiments.** Measure particle-constant shading, invisible-work rejection, and paused/hidden-view redraw suppression individually. Avoid changing timestep or particle aging to obtain better benchmark numbers.
4. **Targeted WGSL only if necessary.** Consider precomputing repeated per-segment ribbon math or conservative culling. Added buffers/passes may cost more than they save, and compaction must preserve normal-blending order in Paper mode.
5. **Consider Rust/C++ after evidence of a CPU bottleneck or a native-delivery requirement.** Neither is presently the strongest first investment.

For every rendering change, retain particle count, trail density/length, physical resolution, RK4/substeps, float precision, palettes, opacity, widths, bloom, and camera. Do not use fewer particles, Euler integration, half precision, shorter trails, or automatic resolution reduction to satisfy the performance target.

Before shipping, extend the prototype's exact-image checks across all nine systems, supported palettes and coloring modes, Dark/Paper, points/trails/both, bloom, click seeding, respawn transitions, camera movement, and export. Test the WebGL path and at least one other GPU family. Compare numerical results at fixed steps and record frame p50/p95, GPU draw/compute times, and allocation plateaus. The current exact-image evidence covers only the documented Aizawa cases and does not establish complete visual parity across every setting.

As an immediate device-specific check, confirm which GPU the user's normal browser uses. On this machine an RTX 4060 is available but the test browser used Intel. Windows exposes per-app graphics preferences under Settings → System → Display → Graphics; selecting High performance and restarting the intended browser is a quality-preserving option to evaluate, not a measured speedup from this investigation. See [Microsoft's graphics-preference instructions](https://support.microsoft.com/en-us/windows/hardware/display-graphics/optimizations-for-windowed-games-in-windows-11). No system graphics settings were changed.

## Reproducing the original investigation

Use the repository's required Node version and install its locked dependencies. Start the Vite dev server on localhost. The scripts use the existing development-only window.__app hook; they do not work against the production preview, which intentionally omits it.

Python 3.10+ and the Python Playwright package are required. Image comparison additionally uses Pillow. Supply an installed current Chromium-family browser, or a Chrome for Testing executable. Run from the repository root:

    python scripts/profile_browser.py --browser "C:/path/to/chrome.exe" --case default-points --case default-trails --case long-trails
    python scripts/profile_lifetime.py --browser "C:/path/to/chrome.exe"
    python scripts/profile_lifetime.py --browser "C:/path/to/chrome.exe" --cleanup
    python scripts/profile_trail_layout.py --browser "C:/path/to/chrome.exe"
    python scripts/profile_trail_layout.py --browser "C:/path/to/chrome.exe" --reverse --webgpu-only --output artifacts/performance/repeat

The legacy layout/cleanup prototype commands above are for the original commit, before the implementation below. Use the new verification commands for the updated source. All generated variants, screenshots, and local test runtimes live under the ignored artifacts/performance directory. The layout script serves a temporary controller variant to its own browser requests; it does not replace the application's source. The cleanup script applies a runtime patch only when explicitly invoked with --cleanup. The layout script verifies expected source replacements and fails if the source has changed.

The [recorded evidence](performance/2026-10-27.json) includes timings, allocation snapshots, actual backend/adapter details, and RGBA hashes. The supporting scripts are [baseline profiling](../scripts/profile_browser.py), [allocation profiling](../scripts/profile_lifetime.py), and [trail-layout comparison](../scripts/profile_trail_layout.py). A favicon 404 appeared in some fresh-browser runs; no prototype graphics-validation or page errors were observed.


## Implemented fixes and verification

This change implements resource cleanup and the WebGPU trail layout against commit **4b496ae04ab2f5fbfda8f4a9bcc7ec70b699174b**. Remote main was rechecked and still matched that base. No dependency, visual-default, UI, or numerical-integration change was needed.

Simulation replacement now retires all consumers, including hidden point/trail/glyph layers, then disposes the previous simulation before creating and compiling its replacement. Integrator and system changes dispose replaced compute nodes. History changes release the history buffer and both compute nodes as well as their mesh, material, and owned geometry.

[gpuResources.ts](../src/app/gpuResources.ts) isolates the compatibility work for Three.js 0.185.1. WebGL cleanup also releases the second transform-feedback buffer, the storage texture, and cached vertex-array/transform-feedback objects. Write-only WebGL outputs can bypass the shared attribute manager and are explicitly retired. Sprite geometry is shared by Three and is deliberately preserved. This boundary needs both-backend regression checks when upgrading Three.

WebGPU history uses slot × trailCount + trail for initialization, regular head writes, respawn flooding, and both segment endpoint reads. WebGL keeps its existing history indexing. Particle count, trail count/length, triangle count, draw order, numerical precision, palettes, blending, opacity, and physical resolution are preserved.

### Resource lifetime and production checks

The stress test repeats five cycles of particle-count, trail-density, integrator, system, palette, Paper/Dark, layer visibility, and glyph changes. It also rebuilds while layers are hidden. Old storage records, WebGL buffer handles, and texture handles are checked directly.

| Final equivalent scene | Initial tracked memory | After five cycles | Live native buffers |
|---|---:|---:|---:|
| WebGPU, 65,536 particles, both layers + glyphs | 100,675,052 bytes | 100,675,126 bytes | 28 → 28 |
| WebGL, 65,536 particles, both layers + glyphs | 40,905,215 bytes | 40,905,063 bytes | 28 → 28 |

Small total differences come from compiled shader text sizes. Storage, geometry, texture, and uniform-buffer counts remain stable. WebGL has seven live textures throughout; vertex-array and transform-feedback counts plateau after the first complete cycle. These figures are tracked allocations and explicit native object lifetimes, not physical VRAM residency.

The 12 Node regression tests, strict TypeScript checks, and production build pass using Node 24.22.1. An isolated production-browser check, without the development app hook, exercised playback, all three drawing modes, particle counts, trail density, system switches, camera rotation/zoom, restart, and PNG export on both actual backends. Both exports were valid **4096 × 2358** PNGs.

### Final visual and timing results

**28 before/after canvas comparisons match every RGBA pixel**, 14 per backend, after 120 fixed simulation steps. Coverage includes all nine systems, default points and trails, long trails with forced respawns/burst/reset, a non-power-of-two particle count, glyphs, four palettes, all three coloring modes, Dark/Paper, and WebGPU bloom. WebGL retains its existing bloom restriction. The saved baseline was checked against Git; every module is isolated from current source and the harness asserts which implementation it loaded.

The installed Three WebGL backend has an existing point-VAO quirk: its cached vertex-array object can retain one of the alternating transform-feedback buffers, so repeated resets alternate between two images. A separate three-reset probe against the original and updated source produced the **same sequence of RGBA hashes**. The lifetime check therefore accepts either exact reset phase, with no pixel tolerance. WebGPU's rebuilt image matches a fresh instance directly. This follow-up preserves the original WebGL behavior rather than adding a separate renderer workaround.

Final paired timings used the same Intel GPU, viewport, full resolution, 120 warmup frames, and 240 measured frames as the original investigation. Each GPU drawing average uses eight timestamp samples.

| WebGPU case and run order | Original GPU drawing | Implemented GPU drawing | Reduction |
|---|---:|---:|---:|
| Length 19, original first | 13.71 ms | 10.55 ms | 23.1% |
| Length 19, current first | 13.64 ms | 10.02 ms | 26.5% |
| Length 64, original first | 46.20 ms | 33.53 ms | 27.4% |
| Length 64, current first | 45.75 ms | 33.64 ms | 26.5% |

Long-trail playback improved from **20.8–20.9 to 28.1–28.4 FPS**. Default trails stayed refresh-limited near 60 FPS while using less GPU drawing time. This is a measured **23–27% reduction in trail drawing time**, not a general 23–27% increase in every simulation's FPS.

WebGL's short pair varied from 18.15 ms/frame original to 26.08 ms current. A longer reverse-order pair (180 warmup / 480 measured frames) gave 18.90 ms original and 19.73 ms current, with p95 29.90 and 25.10 ms respectively. No WebGL speedup is claimed; these variable samples do not establish a precise performance difference. Its history layout and quality are preserved, and its functional, image, and resource-lifetime checks pass.

The [implementation evidence](performance/2026-10-27-implementation.json) contains source hashes, all visual cases, native allocation counters, reset-phase hashes, production checks, and both timing orders. Tests cover one hardware family; broader browser/device validation remains appropriate before a release.

### Reproducing the implementation checks

Install Python Playwright and Pillow, use the required Node version, and start Vite on localhost. Preserve the original commit's complete src directory at artifacts/performance/baseline/src; keep it separate from current src. The baseline comparison routes every source module to that snapshot and asserts that the old and new implementations are distinct before measuring or comparing.

    python scripts/verify_rendering.py --browser "C:/path/to/chrome.exe" --baseline-main artifacts/performance/baseline/src/main.ts --output artifacts/performance/verification
    python scripts/profile_browser.py --browser "C:/path/to/chrome.exe" --compare-main artifacts/performance/baseline/src/main.ts --case default-trails --case long-trails --output artifacts/performance/comparison
    python scripts/profile_browser.py --browser "C:/path/to/chrome.exe" --compare-main artifacts/performance/baseline/src/main.ts --reverse --case default-trails --case long-trails --output artifacts/performance/comparison-reverse

Omit --baseline-main to run current-source visual smoke checks and the lifetime regression without a snapshot. Use --lifetime-only, --visual-only, or --backend webgpu / --backend webgl for focused checks. Existing browser warnings about adapter preference, unavailable WebGL timestamps, the Three PostProcessing rename, and the favicon are recorded separately from graphics/page failures. Profiling exits with a failure status if a case fails or an unknown case is selected, while retaining error details in its results file.
