/** Minimal bottom-left HUD: fps, frame time, GPU split, particle count, sim time, backend. */
export class Hud {
  private el: HTMLElement;
  private emaMs = 16.7;
  private lastShown = 0;
  private backend: string;
  private count = 0;
  private computeMs = 0;
  private renderMs = 0;
  private hasGpuTimings = false;
  private effScale = 1;

  constructor(el: HTMLElement, backend: string) {
    this.el = el;
    this.backend = backend;
  }

  setCount(n: number) {
    this.count = n;
  }

  /** GPU timestamp-query results (ms), when the backend supports them. */
  setGpuTimings(computeMs: number, renderMs: number) {
    this.computeMs = computeMs;
    this.renderMs = renderMs;
    this.hasGpuTimings = true;
  }

  /** Effective resolution scale currently rendered at (≤ the user's slider). */
  setScale(eff: number) {
    this.effScale = eff;
  }

  tick(deltaMs: number, simTime: number, paused: boolean) {
    this.emaMs += (deltaMs - this.emaMs) * 0.05;
    const now = performance.now();
    if (now - this.lastShown < 250) return; // don't thrash the DOM
    this.lastShown = now;
    const fps = 1000 / this.emaMs;
    const n =
      this.count >= 1048576
        ? `${(this.count / 1048576).toFixed(0)}M`
        : `${(this.count / 1024).toFixed(0)}k`;
    const gpu = this.hasGpuTimings
      ? `\ngpu: sim ${this.computeMs.toFixed(2)} ms · draw ${this.renderMs.toFixed(2)} ms`
      : '';
    const res = this.effScale < 0.999 ? ` · res ${this.effScale.toFixed(2)}×` : '';
    this.el.textContent =
      `${fps.toFixed(0).padStart(3)} fps  ${this.emaMs.toFixed(1)} ms${gpu}\n` +
      `${n} particles · ${this.backend}${res}\n` +
      `t = ${simTime.toFixed(1)}${paused ? '  ⏸' : ''}`;
  }
}
