import * as THREE from 'three/webgpu';
import { SimulationController } from './app/SimulationController';
import { RenderController } from './app/RenderController';
import { UIController } from './app/UIController';
import { buildQuery, parseURL, syncURL } from './app/URLState';
import { DEFAULT_SYSTEM_ID, getSystem, hasSystem } from './systems/registry';
import { buildPanel, type PanelHandle } from './ui/panel';
import { Hud } from './ui/hud';
import type {
  IntegratorId,
  NamedParamSet,
  RenderSettings,
  SimSettings,
  SystemDefinition,
  Tier,
} from './types';

const WEBGPU_TIER: Tier = {
  name: 'webgpu',
  maxParticles: 1048576,
  defaultParticles: 262144,
  trailT: 64,
  trailCount: 65536,
  bloomAllowed: true,
  dprCap: 2,
};

const WEBGL2_TIER: Tier = {
  name: 'webgl2',
  maxParticles: 131072,
  defaultParticles: 131072,
  trailT: 32,
  trailCount: 16384,
  bloomAllowed: false,
  dprCap: 2,
};

// Mobile bottleneck is fill rate (overdraw of additive-blended sprites), so
// the DPR cap and disabled bloom matter more than the particle count itself.
// Powerful tablets (M-series iPads) land here too; ?forceDesktop overrides.
const WEBGPU_MOBILE_TIER: Tier = {
  name: 'webgpu',
  maxParticles: 262144,
  defaultParticles: 65536,
  trailT: 32,
  trailCount: 16384,
  bloomAllowed: false,
  dprCap: 1.5,
};

const WEBGL2_MOBILE_TIER: Tier = {
  name: 'webgl2',
  maxParticles: 65536,
  defaultParticles: 65536,
  trailT: 32,
  trailCount: 8192,
  bloomAllowed: false,
  dprCap: 1.5,
};

/** Coarse primary pointer + real touch points ⇒ phone/tablet. */
function detectMobile(): boolean {
  const q = new URLSearchParams(location.search);
  if (q.has('forceMobile')) return true;
  if (q.has('forceDesktop')) return false;
  return window.matchMedia('(pointer: coarse)').matches && navigator.maxTouchPoints > 0;
}

export class App {
  readonly renderer: THREE.WebGPURenderer;
  readonly tier: Tier;
  sim: SimulationController;
  readonly render: RenderController;
  readonly hud: Hud;
  system: SystemDefinition;
  simSettings: SimSettings;
  renderSettings: RenderSettings;
  ui!: UIController;
  panel!: PanelHandle;

  private stepRequested = false;

  // ── Adaptive quality ──────────────────────────────────────────────────────
  private emaMs = 16.7;
  private lowMs = 0;
  private highMs = 0;
  private effScale = 1;
  private recoverAfterMs = 4000;
  private lastUpAt = 0;

  // ── GPU timestamp queries ─────────────────────────────────────────────────
  private tsFrame = 0;
  private tsZeroes = 0;
  private tsBroken = false;

  constructor(
    renderer: THREE.WebGPURenderer,
    tier: Tier,
    system: SystemDefinition,
    simSettings: SimSettings,
    renderSettings: RenderSettings,
  ) {
    this.renderer = renderer;
    this.tier = tier;
    this.system = system;
    this.simSettings = simSettings;
    this.renderSettings = renderSettings;

    this.sim = new SimulationController(renderer, system, simSettings.particleCount);
    this.applySimSettingsToUniforms();

    this.render = new RenderController(
      renderer,
      document.getElementById('canvas-container')!,
      tier,
    );
    this.render.rebuildAll(this.sim, renderSettings);
    this.render.applyCameraPreset(system);

    this.hud = new Hud(document.getElementById('hud')!, tier.name);
    this.hud.setCount(this.sim.count);

    this.effScale = renderSettings.resolutionScale;
    this.render.setResolutionScale(this.effScale);
    this.hud.setScale(this.effScale);
  }

  private applySimSettingsToUniforms() {
    this.sim.dtU.value = this.simSettings.dt;
    this.sim.substepsU.value = this.simSettings.substeps;
    this.sim.timeScaleU.value = this.simSettings.timeScale;
    this.sim.setIntegrator(this.simSettings.integrator);
  }

  paramValues(): Record<string, number> {
    const out: Record<string, number> = {};
    for (const spec of this.system.parameters) {
      out[spec.key] = this.sim.paramUniforms[spec.key].value;
    }
    return out;
  }

  syncURL() {
    syncURL(
      buildQuery(this.system.id, this.paramValues(), this.simSettings, this.renderSettings),
    );
  }

  setSystem(id: string) {
    this.system = getSystem(id);
    this.sim.setSystem(this.system);
    this.simSettings.dt = this.system.defaults.dt;
    this.render.onSystemChanged(this.system);
    this.ui.onSystemChanged();
    this.panel.rebuildParams();
    this.panel.refresh();
    this.syncURL();
  }

  setParam(key: string, value: number) {
    this.sim.setParam(key, value);
    this.ui.syncPresetSelection();
    this.syncURL();
  }

  applyPreset(preset: NamedParamSet) {
    for (const [k, v] of Object.entries(preset.params)) this.sim.setParam(k, v);
    this.panel.refresh();
    this.ui.syncPresetSelection();
    this.syncURL();
    if (preset.description) this.ui.toast(preset.description);
  }

  randomizeParams() {
    for (const spec of this.system.parameters) {
      const [lo, hi] = spec.safe ?? [spec.min, spec.max];
      this.sim.setParam(spec.key, lo + Math.random() * (hi - lo));
    }
    this.panel.refresh();
    this.ui.syncPresetSelection();
    this.syncURL();
  }

  resetParams() {
    for (const spec of this.system.parameters) this.sim.setParam(spec.key, spec.default);
    this.panel.refresh();
    this.ui.syncPresetSelection();
    this.syncURL();
  }

  setIntegrator(id: IntegratorId) {
    this.simSettings.integrator = id;
    this.sim.setIntegrator(id);
    this.syncURL();
  }

  /** Explicit-apply particle count change: rebuilds sim buffers + render objects. */
  applyParticleCount(n: number) {
    const params = this.paramValues();
    this.simSettings.particleCount = n;
    this.sim = new SimulationController(this.renderer, this.system, n);
    for (const [k, v] of Object.entries(params)) this.sim.setParam(k, v);
    this.applySimSettingsToUniforms();
    this.sim.reset();
    this.render.rebuildAll(this.sim, this.renderSettings);
    this.hud.setCount(n);
    this.panel.refresh();
    this.syncURL();
  }

  applyRenderSettings() {
    const r = this.renderSettings;
    // Manual slider is a ceiling; auto quality may sit below it but never above.
    this.setEffScale(r.autoQuality ? Math.min(this.effScale, r.resolutionScale) : r.resolutionScale);
    this.render.apply(r);
    this.syncURL();
  }

  private setEffScale(s: number) {
    this.effScale = s;
    this.render.setResolutionScale(s);
    this.hud.setScale(s);
  }

  /**
   * Adaptive resolution: back off 15% after 2s below 50 fps (floor 0.5×),
   * creep back toward the user's slider after sustained >58 fps. If a
   * recovery immediately re-triggers a drop, the retry delay doubles.
   */
  private autoQualityTick(deltaSeconds: number) {
    const r = this.renderSettings;
    if (!r.autoQuality || this.simSettings.paused) return;
    this.emaMs += (deltaSeconds * 1000 - this.emaMs) * 0.05;
    const fps = 1000 / this.emaMs;
    if (fps < 50) {
      this.lowMs += deltaSeconds * 1000;
      this.highMs = 0;
    } else if (fps > 58) {
      this.highMs += deltaSeconds * 1000;
      this.lowMs = 0;
    } else {
      this.lowMs = this.highMs = 0;
    }

    if (this.lowMs > 2000 && this.effScale > 0.5) {
      if (performance.now() - this.lastUpAt < 10000) {
        this.recoverAfterMs = Math.min(this.recoverAfterMs * 2, 30000);
      }
      this.setEffScale(Math.max(0.5, this.effScale * 0.85));
      this.lowMs = 0;
      this.emaMs = 16.7; // re-measure at the new scale
    } else if (this.highMs > this.recoverAfterMs && this.effScale < r.resolutionScale) {
      this.setEffScale(Math.min(r.resolutionScale, this.effScale / 0.85));
      this.lastUpAt = performance.now();
      this.highMs = 0;
      this.emaMs = 16.7;
    }
  }

  /** Throttled GPU timestamp resolution → HUD compute/render split. */
  private resolveGpuTimings() {
    if (this.tsBroken) return;
    this.tsFrame++;
    if (this.tsFrame % 30 !== 0) return;
    Promise.all([
      this.renderer.resolveTimestampsAsync(THREE.TimestampQuery.COMPUTE),
      this.renderer.resolveTimestampsAsync(THREE.TimestampQuery.RENDER),
    ])
      .then(([c, r]) => {
        const cMs = typeof c === 'number' ? c : 0;
        const rMs = typeof r === 'number' ? r : 0;
        if (cMs > 0 || rMs > 0) {
          this.tsZeroes = 0;
          this.hud.setGpuTimings(
            this.renderer.info.compute.timestamp,
            this.renderer.info.render.timestamp,
          );
        } else if (++this.tsZeroes > 10) {
          // Queries unsupported (or, headless, silently failing) — stop asking.
          this.tsBroken = true;
        }
      })
      .catch(() => {
        this.tsBroken = true; // backend lacks (working) timestamp queries
      });
  }

  togglePause() {
    this.simSettings.paused = !this.simSettings.paused;
    this.panel.refresh();
  }

  stepOnce() {
    this.stepRequested = true;
  }

  reset() {
    this.sim.reset();
    this.render.resetTrails();
  }

  screenshot() {
    void this.render.screenshot();
  }

  copyLink() {
    const query = buildQuery(this.system.id, this.paramValues(), this.simSettings, {
      ...this.renderSettings,
    });
    const cam = this.render.camera;
    const target = this.render.controls.target;
    const full =
      `${location.origin}${location.pathname}?${query}` +
      `&cam=${[...cam.position.toArray(), ...target.toArray(), cam.fov]
        .map((v) => parseFloat(v.toPrecision(5)))
        .join(',')}`;
    navigator.clipboard
      .writeText(full)
      .then(() => this.ui.toast('Link copied'))
      .catch(() => this.ui.toast(full));
  }

  frame(deltaSeconds: number) {
    const stepping = !this.simSettings.paused || this.stepRequested;
    this.stepRequested = false;
    this.autoQualityTick(deltaSeconds);
    if (stepping) {
      this.sim.update(deltaSeconds);
      this.render.updateTrails();
    }
    this.render.renderFrame();
    this.resolveGpuTimings();
    this.hud.tick(deltaSeconds * 1000, this.sim.simTime, this.simSettings.paused);
  }
}

async function boot() {
  const forceWebGL = new URLSearchParams(location.search).has('forceWebGL');
  const hasWebGPU = 'gpu' in navigator && !forceWebGL;
  const mobile = detectMobile();
  const tier = hasWebGPU
    ? (mobile ? WEBGPU_MOBILE_TIER : WEBGPU_TIER)
    : (mobile ? WEBGL2_MOBILE_TIER : WEBGL2_TIER);

  // No MSAA: additive soft-falloff sprites gain nothing from it, and 4×
  // multisampling multiplies the cost of the heaviest (blending) pass.
  // Timestamp queries are WebGPU-only: GL timer queries can force pipeline
  // syncs that stall the whole frame on some GL stacks.
  const renderer = new THREE.WebGPURenderer({
    antialias: false,
    forceWebGL,
    trackTimestamp: hasWebGPU,
    powerPreference: 'high-performance',
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, tier.dprCap));
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  await renderer.init();

  const shared = parseURL();
  const system = getSystem(
    shared.systemId && hasSystem(shared.systemId) ? shared.systemId : DEFAULT_SYSTEM_ID,
  );

  const simSettings: SimSettings = {
    integrator: 'rk4',
    dt: system.defaults.dt,
    substeps: 4,
    timeScale: 1,
    paused: false,
    particleCount: tier.defaultParticles,
    ...shared.sim,
  };
  simSettings.particleCount = Math.min(simSettings.particleCount, tier.maxParticles);

  const renderSettings: RenderSettings = {
    mode: 'points',
    colormap: 'inferno',
    colorBy: 'speed',
    colorA: '#1a2b8f',
    colorB: '#ff9a3c',
    pointSize: 0.70,
    opacity: 0.13,
    trailLength: Math.min(19, tier.trailT),
    trailWidth: 0.4,
    bloom: false,
    bloomStrength: 0.8,
    paperMode: false,
    glyphs: false,
    resolutionScale: 1,
    autoQuality: true,
    trailDensity: 1,
    ...shared.render,
  };
  renderSettings.trailLength = Math.min(renderSettings.trailLength, tier.trailT);

  const app = new App(renderer, tier, system, simSettings, renderSettings);

  // Restore URL-shared parameter values and camera before first frame.
  if (shared.params) {
    for (const [k, v] of Object.entries(shared.params)) app.sim.setParam(k, v);
  }
  if (shared.camera) {
    app.render.camera.position.fromArray(shared.camera.position);
    app.render.controls.target.fromArray(shared.camera.target);
    app.render.camera.fov = shared.camera.fov;
    app.render.camera.updateProjectionMatrix();
    app.render.controls.update();
  }

  app.ui = new UIController(app);
  app.panel = buildPanel(app, document.getElementById('panel-container')!);

  if (import.meta.env.DEV) {
    (window as unknown as Record<string, unknown>).__app = app;
  }

  app.reset();

  let last = performance.now();
  renderer.setAnimationLoop(() => {
    const now = performance.now();
    const delta = Math.min((now - last) / 1000, 0.1); // clamp hidden-tab jumps
    last = now;
    app.frame(delta);
  });
}

boot().catch((err) => {
  console.error(err);
  const el = document.createElement('div');
  el.style.cssText = 'position:absolute;inset:0;display:grid;place-items:center;color:#f66;font:14px monospace;padding:2em;text-align:center;';
  el.textContent = `Failed to start: ${err instanceof Error ? err.message : String(err)}`;
  document.body.appendChild(el);
});
