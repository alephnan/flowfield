import * as THREE from 'three';
import katex from 'katex';
import 'katex/dist/katex.min.css';
import { systems } from '../systems/registry';
import type { App } from '../main';

/** System bar, info panel, click-to-seed and keyboard shortcuts. */
export class UIController {
  private app: App;
  private systemSelect!: HTMLSelectElement;
  private presetSelect!: HTMLSelectElement;
  private infoPanel: HTMLElement;
  private toastEl: HTMLElement;
  private toastTimer: ReturnType<typeof setTimeout> | undefined;

  constructor(app: App) {
    this.app = app;
    this.infoPanel = document.getElementById('info-panel')!;
    this.toastEl = document.getElementById('toast')!;
    this.buildSystemBar();
    this.buildPanelToggle();
    this.bindSeeding();
    this.bindKeyboard();
  }

  /** Gear button that opens the control panel as a bottom sheet; CSS hides it on desktop. */
  private buildPanelToggle() {
    const btn = document.createElement('button');
    btn.id = 'panel-toggle';
    btn.textContent = '⚙';
    btn.title = 'Controls';
    btn.setAttribute('aria-label', 'Toggle control panel');
    btn.addEventListener('click', () => {
      document.body.classList.toggle('panel-open');
    });
    document.getElementById('app')!.appendChild(btn);
  }

  private buildSystemBar() {
    const bar = document.getElementById('system-bar')!;

    this.systemSelect = document.createElement('select');
    this.systemSelect.title = 'System';
    for (const sys of systems) {
      const opt = document.createElement('option');
      opt.value = sys.id;
      opt.textContent = sys.name;
      this.systemSelect.appendChild(opt);
    }
    this.systemSelect.addEventListener('change', () => {
      this.app.setSystem(this.systemSelect.value);
    });
    bar.appendChild(this.systemSelect);

    this.presetSelect = document.createElement('select');
    this.presetSelect.title = 'Preset';
    this.presetSelect.addEventListener('change', () => {
      const idx = parseInt(this.presetSelect.value, 10);
      const preset = this.app.system.presets?.[idx];
      if (preset) this.app.applyPreset(preset);
    });
    bar.appendChild(this.presetSelect);

    const infoBtn = document.createElement('button');
    infoBtn.textContent = 'ⓘ info';
    infoBtn.addEventListener('click', () => {
      this.infoPanel.classList.toggle('hidden');
    });
    bar.appendChild(infoBtn);

    this.onSystemChanged();
  }

  /** Refresh preset dropdown + info panel after a system switch. */
  onSystemChanged() {
    const sys = this.app.system;
    this.systemSelect.value = sys.id;

    this.presetSelect.innerHTML = '';
    const placeholder = document.createElement('option');
    placeholder.value = '-1';
    placeholder.textContent = 'presets…';
    placeholder.disabled = false;
    this.presetSelect.appendChild(placeholder);
    (sys.presets ?? []).forEach((p, i) => {
      const opt = document.createElement('option');
      opt.value = String(i);
      opt.textContent = p.name;
      this.presetSelect.appendChild(opt);
    });
    this.syncPresetSelection();
    this.presetSelect.style.display = sys.presets?.length ? '' : 'none';

    this.renderInfo();
  }

  /** Select the preset matching the current param values, or the placeholder if none does. */
  syncPresetSelection() {
    const values = this.app.paramValues();
    const idx = (this.app.system.presets ?? []).findIndex((p) =>
      Object.entries(p.params).every(([k, v]) => Math.abs(values[k] - v) < 1e-9),
    );
    this.presetSelect.value = String(idx);
  }

  private renderInfo() {
    const sys = this.app.system;
    const eqHtml = (sys.equations ?? [])
      .map((eq) => {
        try {
          return katex.renderToString(eq, { displayMode: true, throwOnError: false });
        } catch {
          return `<code>${eq}</code>`;
        }
      })
      .join('');
    const refs = (sys.references ?? []).map((r) => `<div>· ${r}</div>`).join('');
    // Close button is mobile-only (CSS): the wrapped system bar can end up
    // underneath the panel there, hiding the ⓘ toggle.
    this.infoPanel.innerHTML =
      `<button class="info-close" aria-label="Close info panel">×</button>` +
      `<h2>${sys.name}</h2>` +
      (eqHtml ? `<div class="equations">${eqHtml}</div>` : '') +
      (sys.notes ? `<p>${sys.notes}</p>` : '') +
      (refs ? `<div class="refs">${refs}</div>` : '');
    this.infoPanel
      .querySelector('.info-close')!
      .addEventListener('click', () => this.infoPanel.classList.add('hidden'));
  }

  toast(msg: string) {
    this.toastEl.textContent = msg;
    this.toastEl.classList.remove('hidden');
    clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => this.toastEl.classList.add('hidden'), 1800);
  }

  /** Quick-click (not a drag) raycasts to a plane through the orbit target and seeds a burst. */
  private bindSeeding() {
    const canvas = this.app.render.renderer.domElement;
    let downPos: [number, number] | null = null;
    let downTime = 0;

    canvas.addEventListener('pointerdown', (e) => {
      downPos = [e.clientX, e.clientY];
      downTime = performance.now();
    });
    canvas.addEventListener('pointerup', (e) => {
      if (!downPos) return;
      const dx = e.clientX - downPos[0];
      const dy = e.clientY - downPos[1];
      const quick = performance.now() - downTime < 350 && dx * dx + dy * dy < 36;
      downPos = null;
      if (!quick) return;

      const { camera, controls } = this.app.render;
      const rect = canvas.getBoundingClientRect();
      const ndc = new THREE.Vector2(
        ((e.clientX - rect.left) / rect.width) * 2 - 1,
        -((e.clientY - rect.top) / rect.height) * 2 + 1,
      );
      const raycaster = new THREE.Raycaster();
      raycaster.setFromCamera(ndc, camera);
      const normal = camera.getWorldDirection(new THREE.Vector3());
      const plane = new THREE.Plane().setFromNormalAndCoplanarPoint(
        normal,
        controls.target.clone(),
      );
      const hit = raycaster.ray.intersectPlane(plane, new THREE.Vector3());
      if (!hit) return;

      const sim = this.app.sim;
      const fraction = Math.min(4096, Math.max(1024, sim.count * 0.005)) / sim.count;
      sim.requestBurst(hit, fraction, this.app.system.defaults.scale * 0.03);
    });
  }

  private bindKeyboard() {
    window.addEventListener('keydown', (e) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement) return;
      if (e.code === 'Space') {
        e.preventDefault();
        this.app.togglePause();
      } else if (e.key === '.') {
        this.app.stepOnce();
      } else if (e.key === 'i') {
        this.infoPanel.classList.toggle('hidden');
      }
    });
  }
}
