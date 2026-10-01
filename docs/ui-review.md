# Flowfield interface — implementation review

## Portfolio alignment — September 30, 2026

The interface now matches the [RGH Projects page](https://alephnan.github.io/projects/). It uses the portfolio's navy surfaces, teal accent, square borders, corner markers, Helvetica/Arial body stack, Arial Black headings, and locally bundled JetBrains Mono. Mathematical symbols and KaTeX keep their mathematical typography. Scientific palettes, canvas materials, simulation defaults, and URL keys are unchanged.

The header uses RGH / FLOWFIELD, links to the portfolio homepage and Projects, and moves actions plus Back to Projects into Menu below 1200px. Phones keep the compact Flowfield wordmark. All interactive and feedback states use the same semantic colors, including startup, dialogs, invalid inputs, selected controls, and export errors. Primary buttons have a clipped corner with an inset keyboard focus indicator.

Responsive verification uncovered two layout defects and corrected them: paused playback could clip Fit view in the smallest landscape workspace, and the open-sheet media rules could override Focus view. Short landscape now uses 44px Step/Fit icon buttons and 12px transport padding. Final Focus rules explicitly take precedence over the sheet layout. Share-dialog focus return now follows actual Menu visibility, covering tablets as well as phones. A keyboard skip link focuses the simulation canvas.

### Current validation

| Area | Evidence |
|---|---|
| Build and regressions | `npm test`: all eight existing tests pass. `npm run build`: strict TypeScript and production bundling pass. `git diff --check`: passes. |
| Visual comparison | Compared the portfolio and Flowfield on desktop and phone. Reviewed Shape, Appearance, Mathematics, Help, Share, loading, startup error, and export-error styling. |
| Responsive layout | Inspected 1440×900, 1280×720, 1024×768, 768×1024, 390×844, 320×640, 640×360, and 600×360. Measured the 1200/1199 and 1100/1099 breakpoints. Document/header widths match the viewport; one simulation canvas remains present. |
| Small-screen controls | At 390×844 the open sheet is 464px high and leaves a 164px canvas. At 600×360 the paused playback and Fit control fit inside the 280px workspace. Interactive phone controls have at least 44px targets; the skip link was brought to the same minimum. |
| Systems and mathematics | Switched through all nine systems; each retained a single canvas and rendered equations without KaTeX errors. All 30 named preset entries remain available. This pass smoke-tested Classic; the earlier full preset run below is historical. |
| Parameter precision and sharing | `0.9123456789` survived variation/undo and a shared-URL reload. Keyboard camera rotation wrote the camera into the shared URL. Existing regression tests cover exact camera/settings serialization and legacy URL compatibility. |
| Appearance and tiers | Dark/Paper switches preserve the artwork modes. The compiled production bundle runs with `forceWebGL&forceMobile`, exposes the 65,536-particle limit, and explains unavailable bloom. |
| Keyboard and Focus | Skip link targets the canvas; I opens mathematics; arrow-key tabs update selection and focus; outlines remain visible. Help closes with Escape and returns focus. Focus view fills the full 1024×768 canvas with the sheet hidden, then restores the workspace. |
| Share fallback | A local fixture forces clipboard rejection. The complete URL is selected; closing the dialog at 1024px returns focus to Menu. |
| Reduced motion | A controlled media-query fixture starts paused with Step available. The existing CSS reduced-motion rule still suppresses transitions and animations; native OS preference changes were not exercised. |
| Export | Forced first-capture failure displays Retry/Dismiss and restores the 974×484 canvas. Retry succeeds. A separate capture fixture exposes the actual PNG returned by the app: 2140×1232, saved and visually inspected; live rendering returns to 1070×616. The in-app download event timed out, so the PNG was retrieved through this fixture rather than the browser download manager. |
| Startup | Controlled loading and renderer-initialization failure fixtures show the themed status, Retry, compatibility option, and technical details. |

Against the inspector surface `#0F1C2E`, calculated contrast is **15.14:1** for heading text, **9.92:1** for body text, **5.13:1** for muted text, **7.11:1** for teal, and **4.19:1** for input borders. These are token checks, not a complete accessibility certification.

No simulation loop, GPU buffer, renderer behavior, palette definition, or capability limit changed. Decorative corner marks are static CSS; the interface adds no recurring rendering work. Physical touch devices, full screen-reader coverage, OS-level reduced-motion changes, and a new sustained GPU benchmark were not tested.

Screenshots, the inspected `export.png`, and controlled HTML fixtures are local ignored evidence in `artifacts/portfolio-review/`. They are excluded from the build. This review was completed against a local preview before publication.

## Previous gallery redesign — historical review

The remaining report records the earlier gallery implementation, including its previous typography, colors, and performance measurements. It is retained as historical evidence and does not describe the current visual identity.

The production Tweakpane interface has been replaced by a responsive gallery shell and native TypeScript controls. The attractor remains the main visual element. All nine systems, all 30 named presets, and the existing rendering and sharing features remain available.

## Review stages

1. **Structure:** 64px header, 320px desktop inspector, dedicated artwork area, persistent transport, Share, Export PNG, and Focus view. Portrait layouts use a separately scrolling controls sheet capped at 55% of viewport height. Very short landscape windows use a side inspector to keep the artwork and transport usable.
2. **Exploration:** Shape, Appearance, and Mathematics tabs; exact number entry beside sliders; persistent preset descriptions; Custom detection; safe variation with one-step undo; palette previews and conditional controls; equations, supported parameter explanations, references, and numerical settings.
3. **Finish:** locally bundled fonts and licenses, semantic colors, keyboard focus and tab navigation, 44px touch controls, reduced-motion behavior, readable feedback, and export/startup recovery.

The simulation equations, GPU particle processing, identifiers, and capability limits are unchanged. Changing systems now also updates the timestep uniform, keeping the displayed timestep and simulation in agreement. Shared links retain full numerical precision. Camera framing uses each system's authored composition, accounts for portrait space, and preserves shared or deliberately adjusted views. Fit view clears remaining orbit inertia.

## Validation

| Area | Coverage and result |
|---|---|
| Catalog | All nine systems and all 30 presets exercised at the desktop WebGPU particle count. Values, preset selection, parameter resets, system captions, and equations synchronized correctly. The complete run passed after an earlier browser automation stall. |
| Mathematics | All equation blocks rendered without KaTeX errors. Euler/RK4, timestep, substeps, and vector-field controls exercised. |
| Precision | An exact entry of `0.9123456789` survived variation and undo. New URLs round-trip `8 / 3` exactly; legacy query keys remain supported. |
| Appearance | Points, Trails, Both, all four palettes, all three color mappings, Dark/Paper, opacity, trail controls, bloom, and conditional visibility exercised. |
| Camera and playback | Mouse rotation, keyboard rotation, FOV, auto-orbit, Fit view, pause/play, stepping, Focus entry/exit, and focus return exercised. Shared camera restoration across a desktop-to-phone resize differed by less than `5 × 10⁻¹⁶` in the checked coordinates. |
| Quality | Staged particle count application, resolution ceiling, automatic quality, trail density, and detailed status checked. Opening controls does not create a second canvas or simulation. |
| Rendering tiers | Desktop WebGPU, mobile WebGPU, desktop WebGL2, and mobile WebGL2 exercised. WebGL2 checked across all nine systems. Mobile WebGL2 exposes the 65,536-particle cap; unavailable bloom has an explanation. |
| Responsive layout | 390×844, 768×1024, 1280×720, 1440×900, and 844×390 checked. A 640×360 reflow check also passed. Default Aizawa fits its canvas; the document does not overflow horizontally. |
| Touch targets | The phone sheet measured 464px in an 844px viewport, with a 164px artwork area above its transport. Buttons and editable controls use 44px touch targets; switches and color inputs have larger clickable labels. |
| Keyboard | Visible focus, arrow-key tab selection, number-field shortcut isolation, stepping, and Focus exit verified. The phone Share fallback returns focus to Menu when closed. |
| Reduced motion | A controlled preference fixture starts paused with Step available. Animation and transition suppression are defined in the reduced-motion stylesheet rule. |
| Clipboard failure | A test-only page forces clipboard rejection. The fallback opens with the full link selected, supports Select link, and closes correctly. |
| Export failure | A test-only page forces the first PNG capture to throw. The canvas returns to its original 910×436 resolution, the export controls recover, and Retry export succeeds. Error feedback persists until retried or dismissed. |
| Export output | A real PNG was saved and visually inspected at 2140×1232; the live canvas returned to 802×462. Export retains the existing up-to-2× and 4096px-per-edge limits. |
| Startup failure | A test-only page forces renderer initialization to fail. Retry and compatibility options appear; retry successfully returns to a single-canvas gallery. |
| Build | `npm test` passes all eight focused regression tests. `npm run build` passes strict TypeScript checks and creates the production bundle. The built site was also opened locally. |

Ordinary primary, secondary, and accent text against the inspector surface has calculated contrast ratios of **14.90:1**, **7.58:1**, and **8.79:1**, respectively. This is a token-level contrast check, not a complete WCAG certification.

## Performance and limits

The before/after comparison uses the default Aizawa system with 262,144 particles, RK4, Inferno, points, opacity 0.13, and a dark canvas. An additional comparison expands the new shell so its actual artwork buffer is 1280×720, matching the original full-window canvas. Browser automation, shader compilation, and timestamp noise affect individual readings; the results are observational checks rather than a hardware benchmark.

At the matched 1280×720 canvas size, both interfaces reached **60 fps** after settling. Observed GPU timings were 1.18ms compute / 3.67ms draw before and 1.31ms compute / 4.52ms draw after. These single samples are too noisy to establish a small performance difference; the frame-rate target was sustained in this check.

The UI introduces no additional simulation and performs no particle readback. Palette previews are static gradients. There are no recurring UI layout reads in the frame loop. Status updates are throttled to four times per second, and full diagnostic text updates only while its disclosure is open. Camera URL updates wait for motion to settle.

Testing used the Codex Chromium browser and viewport/tier overrides. Physical touch devices, a full screen-reader audit, browser text-only enlargement, and sustained thermal performance still need device testing. The 640×360 check covers constrained reflow but does not replace a browser text-zoom audit.

## Visual evidence

Matching screenshots and controlled failure fixtures are saved locally under `artifacts/ui-review/` and excluded from the application bundle and Git changes. The comparison page pairs the published interface with the local implementation. Captures show the same default scene and viewport, but particle positions vary with simulation time.

- Desktop pair: `before-desktop.jpg`, `after-desktop.jpg` — 1280×720.
- Phone pair: `before-phone.jpg`, `after-phone.jpg` — 390×844, mobile tier.
- Additional views: desktop overview, tablet, open control sheets, Mathematics, WebGL compatibility, and recovery feedback.

This report records local validation completed before deployment.
