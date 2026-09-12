import { element } from './controls';

/** Quiet playback status; detailed diagnostics update only while disclosed. */
export class Hud {
  private emaMs = 16.7;
  private lastShown = 0;
  private count = 0;
  private computeMs = 0;
  private renderMs = 0;
  private hasGpuTimings = false;
  private effScale = 1;
  private details?: HTMLElement;
  private detailsVisible = () => false;
  private status = element('span', 'live-label');
  private time = element('span', 'sim-time mono');

  constructor(private el: HTMLElement, private backend: string) {
    el.append(element('span', 'status-dot'), this.status, this.time);
  }

  bindDetails(el: HTMLElement, visible: () => boolean) { this.details = el; this.detailsVisible = visible; }
  setCount(n: number) { this.count = n; }
  setScale(scale: number) { this.effScale = scale; }
  setGpuTimings(computeMs: number, renderMs: number) {
    this.computeMs = computeMs;
    this.renderMs = renderMs;
    this.hasGpuTimings = true;
  }

  tick(deltaMs: number, simTime: number, paused: boolean) {
    this.emaMs += (deltaMs - this.emaMs) * 0.05;
    const now = performance.now();
    if (now - this.lastShown < 250) return;
    this.lastShown = now;
    const status = paused ? 'Paused' : 'Live';
    if (this.status.textContent !== status) this.status.textContent = status;
    this.el.classList.toggle('is-paused', paused);
    const time = `t ${simTime.toFixed(1)}`;
    if (this.time.textContent !== time) this.time.textContent = time;
    if (!this.details || !this.detailsVisible()) return;
    const gpu = this.hasGpuTimings ? `\nCompute ${this.computeMs.toFixed(2)} ms\nDraw ${this.renderMs.toFixed(2)} ms` : '';
    this.details.textContent = `${(1000 / this.emaMs).toFixed(0)} fps · ${this.emaMs.toFixed(1)} ms\n${this.count.toLocaleString('en-US')} particles\n${this.backend.toUpperCase()} · resolution ${this.effScale.toFixed(2)}×${gpu}`;
  }
}
