import * as THREE from 'three';
import { systems } from '../systems/registry';
import { button, element, icon, setButtonContent } from '../ui/controls';
import { colorLabels, paletteGradient } from '../ui/palettes';
import type { App } from '../main';

/** Gallery shell and transient interface state; simulation state lives in App. */
export class UIController {
  private root = document.getElementById('app')!;
  private systemSelect = element('select');
  private desktop = matchMedia('(min-width: 1100px)');
  private inspectorOpen = this.desktop.matches;
  private focusView = false;
  private focusReturn?: HTMLElement;
  private playButtons: HTMLButtonElement[] = [];
  private exportButtons: HTMLButtonElement[] = [];
  private stepButton!: HTMLButtonElement;
  private speed = element('input');
  private speedValue = element('output', 'mono');
  private controlsButton!: HTMLButtonElement;
  private mobileControlsButton!: HTMLButtonElement;
  private menu = element('details', 'action-menu');
  private exporting = false;
  private toastTimer?: ReturnType<typeof setTimeout>;
  private cameraSyncTimer?: ReturnType<typeof setTimeout>;
  private legendLabel = element('span', 'legend-label');
  private legendGradient = element('span', 'legend-gradient');

  constructor(private app: App) {
    this.buildHeader();
    this.buildTransport();
    this.buildLegend();
    this.bindDialogs();
    this.bindSeeding();
    this.bindKeyboard();
    this.desktop.addEventListener('change', event => {
      const focused = document.activeElement;
      this.inspectorOpen = event.matches;
      this.applyLayout();
      if (!event.matches && focused instanceof HTMLElement && document.getElementById('panel-container')!.contains(focused)) this.controlsTrigger().focus();
    });
    matchMedia('(prefers-reduced-motion: reduce)').addEventListener('change', event => {
      if (event.matches) {
        if (!app.simSettings.paused) app.togglePause();
        app.render.controls.autoRotate = false;
        app.panel.refresh();
      }
    });
    app.render.controls.addEventListener('end', () => app.syncURL());
    app.render.controls.addEventListener('change', () => {
      // Include the final damped camera position, without writing history every frame.
      clearTimeout(this.cameraSyncTimer);
      this.cameraSyncTimer = setTimeout(() => app.syncURL(), 160);
    });
    this.onSystemChanged();
    this.applyLayout();
  }

  private buildHeader() {
    const bar = document.getElementById('system-bar')!;
    const label = element('label', 'system-label', 'Explore');
    this.systemSelect.id = 'system-select';
    label.htmlFor = this.systemSelect.id;
    this.systemSelect.setAttribute('aria-label', 'System');
    for (const sys of systems) {
      const option = element('option', '', sys.name);
      option.value = sys.id;
      this.systemSelect.appendChild(option);
    }
    this.systemSelect.addEventListener('change', () => this.app.setSystem(this.systemSelect.value));
    bar.append(label, this.systemSelect);
    const actions = document.getElementById('header-actions')!;
    const makeActions = (className: string) => {
      const group = element('div', className);
      group.appendChild(button('Share', () => { this.menu.open = false; void this.app.copyLink(); }, 'share', 'subtle'));
      const exportButton = button('Export PNG', () => { void this.exportPNG(); }, 'download');
      exportButton.title = 'Export the artwork as a PNG, up to 2× resolution';
      this.exportButtons.push(exportButton);
      group.appendChild(exportButton);
      const focus = button('Focus view', () => this.setFocusView(true), 'focus', 'subtle');
      focus.setAttribute('aria-label', 'Focus view');
      focus.title = 'Focus view';
      group.appendChild(focus);
      return group;
    };
    actions.appendChild(makeActions('desktop-actions'));
    const summary = element('summary', 'button', 'Menu');
    summary.setAttribute('aria-label', 'More artwork actions');
    this.menu.append(summary, makeActions('menu-actions'));
    actions.appendChild(this.menu);
    this.controlsButton = button('Controls', () => this.setInspector(!this.inspectorOpen, true), 'sliders', 'controls-toggle');
    this.controlsButton.setAttribute('aria-controls', 'panel-container');
    actions.appendChild(this.controlsButton);
    document.getElementById('close-inspector')!.addEventListener('click', () => this.setInspector(false, true));
    document.addEventListener('pointerdown', event => {
      if (event.target instanceof Node && !this.menu.contains(event.target)) this.menu.open = false;
    });
  }

  private buildTransport() {
    const playback = document.getElementById('playback-controls')!;
    const play = button('Pause', () => this.app.togglePause(), 'pause', 'play-button');
    this.playButtons.push(play);
    const restart = button('Restart particles', () => { this.app.reset(); this.toast('Particles restarted.'); }, 'restart', 'icon-button');
    restart.setAttribute('aria-label', 'Restart particles');
    restart.title = 'Restart particles';
    this.stepButton = button('Step', () => this.app.stepOnce(), 'step', 'step-button');
    this.stepButton.setAttribute('aria-label', 'Step one frame');
    this.stepButton.title = 'Advance one frame';
    const speedLabel = element('label', 'speed-control');
    this.speed.type = 'range';
    this.speed.min = '0';
    this.speed.max = '4';
    this.speed.step = '0.01';
    this.speed.id = 'playback-speed';
    this.speed.setAttribute('aria-label', 'Playback speed');
    this.speed.addEventListener('input', () => this.app.setSimulationSetting('timeScale', Number(this.speed.value)));
    speedLabel.htmlFor = this.speed.id;
    this.speedValue.setAttribute('for', this.speed.id);
    speedLabel.append(element('span', 'speed-label', 'Speed'), this.speed, this.speedValue);
    playback.append(play, this.stepButton, restart, speedLabel);
    const fit = button('Fit view', () => this.app.fitView(), 'fit', 'fit-button subtle');
    fit.setAttribute('aria-label', 'Fit view');
    fit.title = 'Fit view';
    const viewControls = document.getElementById('view-controls')!;
    this.mobileControlsButton = button('Controls', () => this.setInspector(!this.inspectorOpen, true), 'sliders', 'mobile-controls-toggle');
    this.mobileControlsButton.setAttribute('aria-controls', 'panel-container');
    viewControls.append(fit, this.mobileControlsButton);
    const focusControls = document.getElementById('focus-controls')!;
    const focusPlay = button('Pause', () => this.app.togglePause(), 'pause');
    this.playButtons.push(focusPlay);
    focusControls.append(focusPlay, button('Exit focus', () => this.setFocusView(false), 'exit'));
    const canvas = this.app.renderer.domElement;
    canvas.tabIndex = 0;
    canvas.setAttribute('role', 'img');
    canvas.setAttribute('aria-describedby', 'artwork-description');
  }

  private buildLegend() {
    const legend = document.getElementById('color-legend')!;
    legend.append(this.legendLabel, element('span', 'legend-endpoint', 'Low'), this.legendGradient, element('span', 'legend-endpoint', 'High'));
    this.legendGradient.setAttribute('aria-hidden', 'true');
  }

  private applyLayout() {
    this.root.dataset.inspector = this.inspectorOpen ? 'open' : 'closed';
    this.root.classList.toggle('focus-view', this.focusView);
    this.controlsButton.setAttribute('aria-expanded', String(this.inspectorOpen && !this.focusView));
    this.mobileControlsButton.setAttribute('aria-expanded', String(this.inspectorOpen && !this.focusView));
    const panel = document.getElementById('panel-container')!;
    panel.inert = !this.inspectorOpen || this.focusView;
    document.getElementById('focus-controls')!.hidden = !this.focusView;
  }

  private setInspector(open: boolean, moveFocus = false) {
    this.inspectorOpen = open;
    this.applyLayout();
    if (moveFocus) {
      if (open) this.app.panel.focusTab();
      else this.controlsTrigger().focus();
    }
  }

  private controlsTrigger(): HTMLButtonElement {
    return matchMedia('(max-width: 599px)').matches ? this.mobileControlsButton : this.controlsButton;
  }

  private setFocusView(active: boolean) {
    if (active) {
      this.focusReturn = document.activeElement instanceof HTMLElement ? document.activeElement : undefined;
      this.menu.open = false;
    }
    this.focusView = active;
    this.applyLayout();
    if (active) this.playButtons[1].focus();
    else if (this.focusReturn?.checkVisibility()) this.focusReturn.focus();
    else this.app.renderer.domElement.focus();
  }

  onSystemChanged() {
    const sys = this.app.system;
    this.systemSelect.value = sys.id;
    document.getElementById('artwork-title')!.textContent = sys.name;
    document.getElementById('system-index')!.textContent = `STUDY ${String(systems.indexOf(sys) + 1).padStart(2, '0')} / ${String(systems.length).padStart(2, '0')} · ${sys.dim}D DYNAMICAL SYSTEM`;
    document.getElementById('artwork-description')!.textContent = sys.introduction ?? 'Follow a simple rule into an unexpected world.';
    this.app.renderer.domElement.setAttribute('aria-label', `${sys.name} interactive particle artwork. Arrow keys rotate; plus and minus zoom.`);
    this.refresh();
  }

  refresh() {
    const paused = this.app.simSettings.paused;
    for (const play of this.playButtons) {
      const label = paused ? 'Play' : 'Pause';
      if (play.textContent !== label) setButtonContent(play, label, paused ? 'play' : 'pause');
      play.setAttribute('aria-label', paused ? 'Play simulation' : 'Pause simulation');
    }
    this.stepButton.hidden = !paused;
    this.speed.value = String(this.app.simSettings.timeScale);
    this.speedValue.value = `${Number(this.app.simSettings.timeScale.toFixed(2))}×`;
    this.speed.setAttribute('aria-valuetext', `${this.app.simSettings.timeScale} times normal speed`);
    this.legendLabel.textContent = colorLabels[this.app.renderSettings.colorBy];
    this.legendGradient.style.background = paletteGradient(this.app.renderSettings);
  }

  toast(message: string, error = false) {
    const toast = document.getElementById('toast')!;
    clearTimeout(this.toastTimer);
    toast.replaceChildren(element('span', '', message));
    toast.classList.toggle('is-error', error);
    if (error) {
      toast.appendChild(button('Retry export', () => { toast.hidden = true; void this.exportPNG(); }, 'download'));
      toast.appendChild(button('Dismiss', () => { toast.hidden = true; this.app.renderer.domElement.focus(); }, undefined, 'subtle'));
    }
    toast.hidden = false;
    if (!error) this.toastTimer = setTimeout(() => { toast.hidden = true; }, 3500);
  }

  private async exportPNG() {
    if (this.exporting) return;
    this.exporting = true;
    for (const item of this.exportButtons) {
      item.disabled = true;
      item.setAttribute('aria-busy', 'true');
      setButtonContent(item, 'Exporting…', 'download');
    }
    try {
      // Give the busy indicator a paint before the high-resolution frame.
      await new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
      await this.app.screenshot();
      this.menu.open = false;
      this.toast('Your PNG is ready.');
    } catch (error) {
      console.error('PNG export failed', error);
      this.toast('The PNG could not be exported. Please try again.', true);
    } finally {
      this.exporting = false;
      for (const item of this.exportButtons) {
        item.disabled = false;
        item.removeAttribute('aria-busy');
        setButtonContent(item, 'Export PNG', 'download');
      }
    }
  }

  showShareLink(link: string) {
    const dialog = document.getElementById('share-dialog') as HTMLDialogElement;
    const input = document.getElementById('share-url') as HTMLTextAreaElement;
    input.value = link;
    if (!dialog.open) dialog.showModal();
    input.focus();
    input.select();
  }

  private bindDialogs() {
    document.getElementById('help-button')!.addEventListener('click', () => {
      (document.getElementById('help-dialog') as HTMLDialogElement).showModal();
    });
    for (const dialog of document.querySelectorAll('dialog')) {
      dialog.querySelector('.dialog-close')!.replaceChildren(icon('exit'));
      dialog.querySelector('.dialog-close')!.addEventListener('click', () => dialog.close());
    }
    document.getElementById('share-dialog')!.addEventListener('close', () => {
      if (matchMedia('(max-width: 599px)').matches) this.menu.querySelector('summary')!.focus();
    });
    document.getElementById('select-share-link')!.addEventListener('click', () => {
      const input = document.getElementById('share-url') as HTMLTextAreaElement;
      input.focus();
      input.select();
    });
  }

  private bindSeeding() {
    const canvas = this.app.renderer.domElement;
    let down: { x: number; y: number; time: number; id: number } | undefined;
    const pointers = new Set<number>();
    canvas.addEventListener('pointerdown', event => {
      pointers.add(event.pointerId);
      down = pointers.size === 1 && event.button === 0
        ? { x: event.clientX, y: event.clientY, time: performance.now(), id: event.pointerId } : undefined;
    });
    canvas.addEventListener('pointercancel', event => { pointers.delete(event.pointerId); down = undefined; });
    canvas.addEventListener('lostpointercapture', event => { pointers.delete(event.pointerId); down = undefined; });
    canvas.addEventListener('pointerup', event => {
      pointers.delete(event.pointerId);
      const start = down;
      down = undefined;
      if (!start || start.id !== event.pointerId || pointers.size > 0) return;
      if (performance.now() - start.time >= 350 || (event.clientX - start.x) ** 2 + (event.clientY - start.y) ** 2 >= 36) return;
      const { camera, controls } = this.app.render;
      const rect = canvas.getBoundingClientRect();
      const ndc = new THREE.Vector2(((event.clientX - rect.left) / rect.width) * 2 - 1, -((event.clientY - rect.top) / rect.height) * 2 + 1);
      const ray = new THREE.Raycaster();
      ray.setFromCamera(ndc, camera);
      const plane = new THREE.Plane().setFromNormalAndCoplanarPoint(camera.getWorldDirection(new THREE.Vector3()), controls.target);
      const hit = ray.ray.intersectPlane(plane, new THREE.Vector3());
      if (!hit) return;
      const sim = this.app.sim;
      sim.requestBurst(hit, Math.min(4096, Math.max(1024, sim.count * 0.005)) / sim.count, this.app.system.defaults.scale * 0.03);
    });
  }

  private bindKeyboard() {
    window.addEventListener('keydown', event => {
      if (document.querySelector('dialog[open]')) return;
      if (event.key === 'Escape') {
        if (this.menu.open) { this.menu.open = false; this.menu.querySelector('summary')!.focus(); }
        else if (this.focusView) this.setFocusView(false);
        else if (this.inspectorOpen) this.setInspector(false, true);
        return;
      }
      if (event.target instanceof HTMLElement && event.target.closest('input, select, textarea, button, summary, a, [contenteditable="true"]')) return;
      if (event.ctrlKey || event.metaKey || event.altKey || event.repeat) return;
      if (event.code === 'Space') { event.preventDefault(); this.app.togglePause(); }
      else if (event.key === '.') this.app.stepOnce();
      else if (event.key.toLowerCase() === 'i') {
        if (this.focusView) this.setFocusView(false);
        this.setInspector(true);
        this.app.panel.selectTab('mathematics', true);
      } else if (event.key.toLowerCase() === 'f') this.setFocusView(!this.focusView);
      else if (event.target === this.app.renderer.domElement && ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', '+', '=', '-'].includes(event.key)) {
        event.preventDefault();
        this.app.render.adjustView(event.key);
        this.app.syncURL();
      }
    });
  }
}
