import { Pane } from 'tweakpane';
import type { FolderApi } from 'tweakpane';
import type { App } from '../main';

const PARTICLE_CHOICES = [65536, 131072, 262144, 524288, 1048576];

export interface PanelHandle {
  /** Rebuild the parameter sliders (system switch) and refresh all bindings. */
  rebuildParams(): void;
  /** Refresh displayed values after programmatic state changes (presets, URL load). */
  refresh(): void;
}

export function buildPanel(app: App, container: HTMLElement): PanelHandle {
  const pane = new Pane({ container, title: 'flowfield' });

  // ── Parameters (rebuilt per system) ────────────────────────────────────
  let paramsFolder: FolderApi | null = null;
  const paramProxy: Record<string, number> = {};

  const rebuildParams = () => {
    paramsFolder?.dispose();
    paramsFolder = pane.addFolder({ title: 'Parameters', index: 0 });
    for (const k of Object.keys(paramProxy)) delete paramProxy[k];
    for (const spec of app.system.parameters) {
      paramProxy[spec.key] = app.sim.paramUniforms[spec.key].value;
      paramsFolder
        .addBinding(paramProxy, spec.key, {
          label: spec.label,
          min: spec.min,
          max: spec.max,
          step: spec.step,
        })
        .on('change', (ev) => app.setParam(spec.key, ev.value));
    }
    paramsFolder.addButton({ title: 'Randomize (safe ranges)' }).on('click', () => {
      app.randomizeParams();
    });
    paramsFolder.addButton({ title: 'Reset parameters' }).on('click', () => {
      app.resetParams();
    });
  };

  // ── Simulation ──────────────────────────────────────────────────────────
  const simFolder = pane.addFolder({ title: 'Simulation' });
  simFolder
    .addBinding(app.simSettings, 'integrator', {
      label: 'integrator',
      options: { 'RK4 (accurate)': 'rk4', 'Euler (shows error)': 'euler' },
    })
    .on('change', (ev) => app.setIntegrator(ev.value));
  simFolder
    .addBinding(app.simSettings, 'dt', { label: 'dt / frame', min: 0.0005, max: 0.2, step: 0.0005 })
    .on('change', (ev) => {
      app.sim.dtU.value = ev.value;
      app.syncURL();
    });
  simFolder
    .addBinding(app.simSettings, 'substeps', { label: 'substeps', min: 1, max: 16, step: 1 })
    .on('change', (ev) => {
      app.sim.substepsU.value = ev.value;
      app.syncURL();
    });
  simFolder
    .addBinding(app.simSettings, 'timeScale', { label: 'time scale', min: 0, max: 4, step: 0.01 })
    .on('change', (ev) => {
      app.sim.timeScaleU.value = ev.value;
      app.syncURL();
    });
  simFolder
    .addBinding(app.simSettings, 'paused', { label: 'paused' })
    .on('change', () => pane.refresh());
  simFolder.addButton({ title: 'Step one frame' }).on('click', () => app.stepOnce());
  simFolder.addButton({ title: 'Reset particles' }).on('click', () => app.reset());

  const countState = { staged: app.simSettings.particleCount };
  const countOptions: Record<string, number> = {};
  for (const n of PARTICLE_CHOICES) {
    if (n <= app.tier.maxParticles) {
      countOptions[n >= 1048576 ? `${n / 1048576}M` : `${n / 1024}k`] = n;
    }
  }
  simFolder.addBinding(countState, 'staged', { label: 'particles', options: countOptions });
  simFolder.addButton({ title: 'Apply particle count (rebuilds)' }).on('click', () => {
    if (countState.staged !== app.simSettings.particleCount) {
      app.applyParticleCount(countState.staged);
    }
  });

  // ── Rendering ───────────────────────────────────────────────────────────
  const r = app.renderSettings;
  const renderFolder = pane.addFolder({ title: 'Rendering' });
  const onRender = () => app.applyRenderSettings();
  renderFolder
    .addBinding(r, 'mode', {
      label: 'mode',
      options: { points: 'points', trails: 'trails', both: 'both' },
    })
    .on('change', onRender);
  renderFolder
    .addBinding(r, 'colormap', {
      label: 'colormap',
      options: { viridis: 'viridis', inferno: 'inferno', turbo: 'turbo', 'two-color': 'twocolor' },
    })
    .on('change', () => {
      onRender();
      syncColorSwatches();
    });
  renderFolder
    .addBinding(r, 'colorBy', {
      label: 'color by',
      options: { 'speed |f|': 'speed', position: 'position', age: 'age' },
    })
    .on('change', onRender);
  const colorABinding = renderFolder
    .addBinding(r, 'colorA', { label: 'color A', view: 'color' })
    .on('change', onRender);
  const colorBBinding = renderFolder
    .addBinding(r, 'colorB', { label: 'color B', view: 'color' })
    .on('change', onRender);
  // The A/B endpoints only feed the 'twocolor' colormap branch.
  const syncColorSwatches = () => {
    const off = r.colormap !== 'twocolor';
    colorABinding.disabled = off;
    colorBBinding.disabled = off;
  };
  syncColorSwatches();
  renderFolder
    .addBinding(r, 'pointSize', { label: 'point size', min: 0.1, max: 4, step: 0.05 })
    .on('change', onRender);
  renderFolder
    .addBinding(r, 'opacity', { label: 'opacity', min: 0.02, max: 1, step: 0.01 })
    .on('change', onRender);
  renderFolder
    .addBinding(r, 'trailLength', { label: 'trail length', min: 2, max: app.tier.trailT, step: 1 })
    .on('change', onRender);
  renderFolder
    .addBinding(r, 'trailWidth', { label: 'trail width', min: 0.2, max: 4, step: 0.05 })
    .on('change', onRender);
  if (app.tier.bloomAllowed) {
    renderFolder.addBinding(r, 'bloom', { label: 'bloom' }).on('change', onRender);
    renderFolder
      .addBinding(r, 'bloomStrength', { label: 'bloom strength', min: 0, max: 3, step: 0.05 })
      .on('change', onRender);
  }
  renderFolder.addBinding(r, 'glyphs', { label: 'field glyphs' }).on('change', onRender);
  renderFolder.addBinding(r, 'paperMode', { label: 'paper mode' }).on('change', onRender);
  renderFolder.addButton({ title: 'Screenshot (2× PNG)' }).on('click', () => app.screenshot());

  // ── Quality ─────────────────────────────────────────────────────────────
  const qualityFolder = pane.addFolder({ title: 'Quality' });
  qualityFolder.addBinding(r, 'autoQuality', { label: 'auto quality' }).on('change', onRender);
  qualityFolder
    .addBinding(r, 'resolutionScale', { label: 'resolution', min: 0.5, max: 1, step: 0.05 })
    .on('change', onRender);
  qualityFolder
    .addBinding(r, 'trailDensity', {
      label: 'trail density',
      options: { full: 1, half: 0.5, quarter: 0.25 },
    })
    .on('change', onRender);

  // ── Camera ──────────────────────────────────────────────────────────────
  const camFolder = pane.addFolder({ title: 'Camera', expanded: false });
  const camState = { autoOrbit: false, fov: 50 };
  camFolder.addBinding(camState, 'autoOrbit', { label: 'auto-orbit' }).on('change', (ev) => {
    app.render.controls.autoRotate = ev.value;
    app.render.controls.autoRotateSpeed = 0.6;
  });
  camFolder
    .addBinding(camState, 'fov', { label: 'fov', min: 20, max: 90, step: 1 })
    .on('change', (ev) => {
      app.render.camera.fov = ev.value;
      app.render.camera.updateProjectionMatrix();
    });
  camFolder.addButton({ title: 'Reset view' }).on('click', () => {
    app.render.applyCameraPreset(app.system);
    camState.fov = app.render.camera.fov;
    pane.refresh();
  });

  camFolder.addButton({ title: 'Copy shareable link' }).on('click', () => app.copyLink());

  rebuildParams();

  return {
    rebuildParams: () => {
      rebuildParams();
      pane.refresh();
    },
    refresh: () => {
      // Pull current uniform values back into the param proxy before refreshing.
      for (const spec of app.system.parameters) {
        paramProxy[spec.key] = app.sim.paramUniforms[spec.key].value;
      }
      countState.staged = app.simSettings.particleCount;
      syncColorSwatches();
      pane.refresh();
    },
  };
}
