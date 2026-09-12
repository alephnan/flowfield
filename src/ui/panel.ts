import katex from 'katex';
import 'katex/dist/katex.min.css';
import type { App } from '../main';
import type { ColorById, IntegratorId, RenderMode } from '../types';
import { button, disclosure, element, numberControl, segments, selectControl, toggleControl, type Binding } from './controls';
import { colorLabels, paletteGradient, palettes } from './palettes';

export type InspectorTab = 'shape' | 'appearance' | 'mathematics';
export interface PanelHandle {
  rebuildParams(): void;
  refresh(): void;
  selectTab(id: InspectorTab, focus?: boolean): void;
  focusTab(): void;
}

export function buildPanel(app: App, container: HTMLElement): PanelHandle {
  const tabsRoot = container.querySelector<HTMLElement>('#inspector-tabs')!;
  const content = container.querySelector<HTMLElement>('#inspector-content')!;
  tabsRoot.setAttribute('role', 'tablist');
  tabsRoot.setAttribute('aria-label', 'Explore the system');
  const tabNames: Array<{ id: InspectorTab; name: string }> = [
    { id: 'shape', name: 'Shape' },
    { id: 'appearance', name: 'Appearance' },
    { id: 'mathematics', name: 'Mathematics' },
  ];
  const views = {} as Record<InspectorTab, HTMLElement>;
  const tabButtons = {} as Record<InspectorTab, HTMLButtonElement>;
  let activeTab: InspectorTab = 'shape';
  const selectTab = (id: InspectorTab, focus = false) => {
    const changed = activeTab !== id;
    activeTab = id;
    for (const tab of tabNames) {
      views[tab.id].hidden = tab.id !== id;
      tabButtons[tab.id].setAttribute('aria-selected', String(tab.id === id));
      tabButtons[tab.id].tabIndex = tab.id === id ? 0 : -1;
    }
    if (changed) content.scrollTop = 0;
    if (focus) tabButtons[id].focus();
  };
  for (const { id, name } of tabNames) {
    const tab = button(name, () => selectTab(id));
    tab.id = `tab-${id}`;
    tab.setAttribute('role', 'tab');
    tab.setAttribute('aria-controls', `view-${id}`);
    tab.addEventListener('keydown', event => {
      const i = tabNames.findIndex(t => t.id === id);
      let next = i;
      if (event.key === 'ArrowRight') next = (i + 1) % tabNames.length;
      else if (event.key === 'ArrowLeft') next = (i + tabNames.length - 1) % tabNames.length;
      else if (event.key === 'Home') next = 0;
      else if (event.key === 'End') next = tabNames.length - 1;
      else return;
      event.preventDefault();
      selectTab(tabNames[next].id, true);
    });
    const view = element('section', 'inspector-view');
    view.id = `view-${id}`;
    view.setAttribute('role', 'tabpanel');
    view.setAttribute('aria-labelledby', tab.id);
    views[id] = view;
    tabButtons[id] = tab;
    tabsRoot.appendChild(tab);
    content.appendChild(view);
  }

  const bindings: Binding[] = [];
  let paramBindings: Binding[] = [];
  const add = (parent: HTMLElement, binding: Binding) => {
    parent.appendChild(binding.element);
    bindings.push(binding);
    return binding.element;
  };
  const section = (parent: HTMLElement, title: string) => {
    const root = element('div', 'control-section');
    root.appendChild(element('h3', 'section-title', title));
    parent.appendChild(root);
    return root;
  };

  const presetArea = element('div', 'preset-area');
  const presetDescription = element('p', 'preset-description');
  const parameters = section(views.shape, 'The parameters');
  views.shape.prepend(presetArea, presetDescription);
  const paramList = element('div', 'parameter-list');
  parameters.appendChild(paramList);
  const variation = button('Explore variation', () => app.randomizeParams(), 'spark', 'primary full-width');
  const undo = button('Undo variation', () => { app.undoVariation(); variation.focus(); }, 'undo', 'subtle');
  const reset = button('Reset parameters', () => app.resetParams(), undefined, 'subtle');
  const paramActions = element('div', 'parameter-actions');
  paramActions.append(variation, undo, reset);
  views.shape.appendChild(paramActions);
  let presetSelect: HTMLSelectElement;

  const r = app.renderSettings;
  const rendering = section(views.appearance, 'Draw with');
  add(rendering, segments<RenderMode>('Drawing mode', [
    { value: 'points', label: 'Points' }, { value: 'trails', label: 'Trails' }, { value: 'both', label: 'Both' },
  ], () => r.mode, value => app.setRenderSetting('mode', value)));
  const paletteSection = section(views.appearance, 'The palette');
  const paletteGrid = element('div', 'palette-grid');
  paletteGrid.setAttribute('role', 'group');
  paletteGrid.setAttribute('aria-label', 'Color palette');
  const swatches = palettes.map(palette => {
    const item = button(palette.name, () => app.setRenderSetting('colormap', palette.id), undefined, 'palette-button');
    const swatch = element('span', 'palette-swatch');
    swatch.setAttribute('aria-hidden', 'true');
    item.prepend(swatch);
    paletteGrid.appendChild(item);
    return { item, swatch, id: palette.id };
  });
  paletteSection.appendChild(paletteGrid);
  const colorPickers = element('div', 'color-pickers');
  for (const [key, label] of [['colorA', 'Start color'], ['colorB', 'End color']] as const) {
    const root = element('label', 'color-picker');
    const input = element('input');
    input.type = 'color';
    input.setAttribute('aria-label', label);
    const valueLabel = element('span', 'mono');
    root.append(element('span', 'field-label', label), input, valueLabel);
    input.addEventListener('input', () => app.setRenderSetting(key, input.value));
    add(colorPickers, { element: root, refresh: () => { input.value = r[key]; valueLabel.textContent = r[key]; } });
  }
  paletteSection.appendChild(colorPickers);
  add(paletteSection, selectControl<ColorById>('Color represents', Object.entries(colorLabels).map(([value, label]) => ({ value: value as ColorById, label })), () => r.colorBy, value => app.setRenderSetting('colorBy', value)));

  const surface = section(views.appearance, 'The canvas');
  add(surface, segments('Canvas background', [{ value: 'dark', label: 'Dark' }, { value: 'paper', label: 'Paper' }], () => r.paperMode ? 'paper' : 'dark', value => app.setRenderSetting('paperMode', value === 'paper')));
  add(surface, numberControl({ label: 'Opacity', min: 0.02, max: 1, step: 0.01, read: () => r.opacity, write: value => app.setRenderSetting('opacity', value) }));
  const paperHint = element('p', 'control-help', 'Paper uses translucent ink. Increase opacity for a stronger impression.');
  surface.appendChild(paperHint);
  const pointControl = add(surface, numberControl({ label: 'Point size', min: 0.1, max: 4, step: 0.05, read: () => r.pointSize, write: value => app.setRenderSetting('pointSize', value) }));
  const trailControls = element('div', 'control-stack');
  add(trailControls, numberControl({ label: 'Trail length', min: 2, max: app.tier.trailT, step: 1, read: () => r.trailLength, write: value => app.setRenderSetting('trailLength', Math.round(value)) }));
  add(trailControls, numberControl({ label: 'Trail width', min: 0.2, max: 4, step: 0.05, read: () => r.trailWidth, write: value => app.setRenderSetting('trailWidth', value) }));
  surface.appendChild(trailControls);
  const bloomControl = add(surface, toggleControl('Bloom', () => r.bloom, value => app.setRenderSetting('bloom', value), () => !app.tier.bloomAllowed || r.paperMode));
  const bloomHint = element('p', 'control-help');
  bloomHint.id = 'bloom-availability';
  bloomControl.querySelector('input')!.setAttribute('aria-describedby', bloomHint.id);
  surface.appendChild(bloomHint);
  const bloomStrength = add(surface, numberControl({ label: 'Bloom strength', min: 0, max: 3, step: 0.05, read: () => r.bloomStrength, write: value => app.setRenderSetting('bloomStrength', value) }));

  const camera = disclosure('Camera');
  add(camera.content, toggleControl('Slow auto-orbit', () => app.render.controls.autoRotate, value => {
    app.render.controls.autoRotate = value;
    app.render.controls.autoRotateSpeed = 0.6;
    if (value) app.render.preserveView();
  }));
  add(camera.content, numberControl({ label: 'Field of view', min: 20, max: 90, step: 1, read: () => app.render.camera.fov, write: value => {
    app.render.preserveView();
    app.render.camera.fov = value;
    app.render.camera.updateProjectionMatrix();
    app.syncURL();
  } }));
  camera.content.appendChild(button('Fit view', () => app.fitView(), 'fit', 'full-width'));
  views.appearance.appendChild(camera.element);

  const quality = disclosure('Quality');
  add(quality.content, toggleControl('Automatic quality', () => r.autoQuality, value => app.setRenderSetting('autoQuality', value)));
  add(quality.content, numberControl({ label: 'Resolution ceiling', min: 0.5, max: 1, step: 0.05, read: () => r.resolutionScale, write: value => app.setRenderSetting('resolutionScale', value) }));
  let stagedCount = String(app.simSettings.particleCount);
  let currentCount = app.simSettings.particleCount;
  const choices = [...new Set([65536, 131072, 262144, 524288, 1048576, currentCount])]
    .filter(n => n <= app.tier.maxParticles).sort((a, b) => a - b);
  const applyCount = button('Apply particle count', () => app.applyParticleCount(Number(stagedCount)), undefined, 'full-width');
  add(quality.content, selectControl('Particles', choices.map(n => ({ value: String(n), label: n.toLocaleString('en-US') })), () => stagedCount, value => {
    stagedCount = value;
    applyCount.disabled = Number(stagedCount) === app.simSettings.particleCount;
  }));
  quality.content.appendChild(applyCount);
  add(quality.content, selectControl('Trail density', [{ value: '1', label: 'Full' }, { value: '0.5', label: 'Half' }, { value: '0.25', label: 'Quarter' }], () => String(r.trailDensity), value => app.setRenderSetting('trailDensity', Number(value))));
  const performance = disclosure('Performance details');
  const diagnostics = element('div', 'performance-readout');
  app.hud.bindDetails(diagnostics, () => !container.inert && activeTab === 'appearance' && quality.element.open && performance.element.open);
  performance.content.appendChild(diagnostics);
  quality.content.appendChild(performance.element);
  views.appearance.appendChild(quality.element);

  const mathematics = element('div', 'mathematics-content');
  views.mathematics.appendChild(mathematics);
  add(views.mathematics, toggleControl('Show vector field', () => r.glyphs, value => app.setRenderSetting('glyphs', value)));
  const numerical = disclosure('Numerical settings');
  add(numerical.content, selectControl<IntegratorId>('Integration method', [{ value: 'rk4', label: 'Runge–Kutta 4' }, { value: 'euler', label: 'Euler' }], () => app.simSettings.integrator, value => app.setIntegrator(value)));
  numerical.content.appendChild(element('p', 'control-help', 'RK4 follows the field more accurately. Euler is useful for exploring numerical error.'));
  add(numerical.content, numberControl({ label: 'Timestep', min: 0.0005, max: 0.2, step: 0.0005, read: () => app.simSettings.dt, write: value => app.setSimulationSetting('dt', value) }));
  add(numerical.content, numberControl({ label: 'Substeps', min: 1, max: 16, step: 1, read: () => app.simSettings.substeps, write: value => app.setSimulationSetting('substeps', Math.round(value)) }));
  views.mathematics.appendChild(numerical.element);

  const rebuildParams = () => {
    const sys = app.system;
    const preset = selectControl('Starting point', [
      { value: '-1', label: 'Custom' },
      ...(sys.presets ?? []).map((p, i) => ({ value: String(i), label: p.name })),
    ], () => String(app.presetIndex()), value => {
      const selected = sys.presets?.[Number(value)];
      if (selected) app.applyPreset(selected);
      else refresh();
    });
    presetArea.replaceChildren(preset.element);
    presetSelect = preset.element.querySelector('select')!;
    presetSelect.options[0].disabled = true;
    paramList.replaceChildren();
    paramBindings = sys.parameters.map(spec => {
      const binding = numberControl({ label: spec.label, min: spec.min, max: spec.max, step: spec.step ?? 0.01, symbol: true,
        read: () => app.sim.paramUniforms[spec.key].value, write: value => app.setParam(spec.key, value), description: spec.description,
      });
      paramList.appendChild(binding.element);
      return binding;
    });
    mathematics.replaceChildren();
    mathematics.appendChild(element('p', 'eyebrow', 'THE RULES BEHIND THE FORM'));
    mathematics.appendChild(element('h3', 'math-title', sys.name));
    const equations = element('div', 'equations');
    equations.tabIndex = 0;
    equations.setAttribute('role', 'region');
    equations.setAttribute('aria-label', `${sys.name} equations; scroll horizontally if needed`);
    for (const eq of sys.equations ?? []) {
      const line = element('div', 'equation');
      katex.render(eq, line, { displayMode: true, throwOnError: false, output: 'htmlAndMathml' });
      equations.appendChild(line);
    }
    mathematics.appendChild(equations);
    if (sys.notes) mathematics.appendChild(element('p', 'system-notes', sys.notes));
    const explanations = element('dl', 'parameter-explanations');
    for (const spec of sys.parameters) {
      if (!spec.description) continue;
      const row = element('div');
      row.append(element('dt', 'mono', spec.label), element('dd', '', spec.description));
      explanations.appendChild(row);
    }
    mathematics.appendChild(explanations);
    if (sys.references?.length) {
      const references = disclosure('References');
      for (const reference of sys.references) references.content.appendChild(element('p', 'reference', reference));
      mathematics.appendChild(references.element);
    }
  };

  const refresh = () => {
    if (currentCount !== app.simSettings.particleCount) {
      currentCount = app.simSettings.particleCount;
      stagedCount = String(currentCount);
    }
    for (const binding of [...bindings, ...paramBindings]) binding.refresh();
    const preset = app.presetIndex();
    presetSelect.value = String(preset);
    presetDescription.textContent = preset < 0
      ? 'Your own combination. Keep exploring, or return to a starting point.'
      : app.system.presets?.[preset].description ?? 'A starting point for discovery. Adjust the parameters to see what unfolds.';
    undo.hidden = !app.canUndoVariation;
    applyCount.disabled = Number(stagedCount) === currentCount;
    for (const { item, swatch, id } of swatches) {
      item.setAttribute('aria-pressed', String(id === r.colormap));
      swatch.style.background = paletteGradient(r, id);
    }
    colorPickers.hidden = r.colormap !== 'twocolor';
    pointControl.hidden = r.mode === 'trails';
    trailControls.hidden = r.mode === 'points';
    paperHint.hidden = !r.paperMode;
    bloomStrength.hidden = !r.bloom || !app.tier.bloomAllowed || r.paperMode;
    bloomHint.hidden = app.tier.bloomAllowed && !r.paperMode;
    bloomHint.textContent = !app.tier.bloomAllowed ? 'Bloom is unavailable at this device’s rendering tier.' : 'Bloom is available on a dark canvas.';
  };

  rebuildParams();
  refresh();
  selectTab('shape');
  return { rebuildParams: () => { rebuildParams(); refresh(); }, refresh, selectTab, focusTab: () => tabButtons[activeTab].focus() };
}
