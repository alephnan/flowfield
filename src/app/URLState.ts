import type { RenderSettings, SimSettings } from '../types';

export interface SharedState {
  systemId?: string;
  params?: Record<string, number>;
  sim?: Partial<SimSettings>;
  render?: Partial<RenderSettings>;
  camera?: { position: number[]; target: number[]; fov: number };
}

const num = (v: string | null): number | undefined => {
  if (v === null) return undefined;
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : undefined;
};
const bool = (v: string | null): boolean | undefined => (v === null ? undefined : v === '1');
const f = (n: number) => parseFloat(n.toPrecision(6)).toString(); // compact floats

/** Parse the current location's query string into app state. */
export function parseURL(): SharedState {
  const q = new URLSearchParams(location.search);
  const state: SharedState = {};

  const sys = q.get('sys');
  if (sys) state.systemId = sys;

  const params: Record<string, number> = {};
  for (const [key, value] of q.entries()) {
    if (key.startsWith('p.')) {
      const n = num(value);
      if (n !== undefined) params[key.slice(2)] = n;
    }
  }
  if (Object.keys(params).length) state.params = params;

  const sim: Partial<SimSettings> = {};
  const integ = q.get('integ');
  if (integ === 'euler' || integ === 'rk4') sim.integrator = integ;
  const dt = num(q.get('dt'));
  if (dt !== undefined) sim.dt = dt;
  const ss = num(q.get('ss'));
  if (ss !== undefined) sim.substeps = Math.max(1, Math.round(ss));
  const tsc = num(q.get('tsc'));
  if (tsc !== undefined) sim.timeScale = tsc;
  const n = num(q.get('n'));
  if (n !== undefined) sim.particleCount = Math.round(n);
  if (Object.keys(sim).length) state.sim = sim;

  const render: Partial<RenderSettings> = {};
  const mode = q.get('mode');
  if (mode === 'points' || mode === 'trails' || mode === 'both') render.mode = mode;
  const cmap = q.get('cmap');
  if (cmap === 'viridis' || cmap === 'inferno' || cmap === 'turbo' || cmap === 'twocolor')
    render.colormap = cmap;
  const cby = q.get('cby');
  if (cby === 'speed' || cby === 'position' || cby === 'age') render.colorBy = cby;
  const ca = q.get('ca');
  if (ca && /^[0-9a-f]{6}$/i.test(ca)) render.colorA = `#${ca}`;
  const cb = q.get('cb');
  if (cb && /^[0-9a-f]{6}$/i.test(cb)) render.colorB = `#${cb}`;
  const ps = num(q.get('ps'));
  if (ps !== undefined) render.pointSize = ps;
  const op = num(q.get('op'));
  if (op !== undefined) render.opacity = op;
  const tl = num(q.get('tl'));
  if (tl !== undefined) render.trailLength = Math.round(tl);
  const tw = num(q.get('tw'));
  if (tw !== undefined) render.trailWidth = tw;
  const bl = bool(q.get('bloom'));
  if (bl !== undefined) render.bloom = bl;
  const bs = num(q.get('bs'));
  if (bs !== undefined) render.bloomStrength = bs;
  const gl = bool(q.get('glyphs'));
  if (gl !== undefined) render.glyphs = gl;
  const pp = bool(q.get('paper'));
  if (pp !== undefined) render.paperMode = pp;
  const rs = num(q.get('rs'));
  if (rs !== undefined) render.resolutionScale = Math.min(1, Math.max(0.5, rs));
  const aq = bool(q.get('aq'));
  if (aq !== undefined) render.autoQuality = aq;
  const td = num(q.get('td'));
  if (td !== undefined) render.trailDensity = Math.min(1, Math.max(0.25, td));
  if (Object.keys(render).length) state.render = render;

  const cam = q.get('cam');
  if (cam) {
    const parts = cam.split(',').map(parseFloat);
    if (parts.length === 7 && parts.every(Number.isFinite)) {
      state.camera = { position: parts.slice(0, 3), target: parts.slice(3, 6), fov: parts[6] };
    }
  }
  return state;
}

export function buildQuery(
  systemId: string,
  params: Record<string, number>,
  sim: SimSettings,
  render: RenderSettings,
  camera?: { position: number[]; target: number[]; fov: number },
): string {
  const q = new URLSearchParams();
  q.set('sys', systemId);
  for (const [k, v] of Object.entries(params)) q.set(`p.${k}`, f(v));
  q.set('integ', sim.integrator);
  q.set('dt', f(sim.dt));
  q.set('ss', String(sim.substeps));
  q.set('tsc', f(sim.timeScale));
  q.set('n', String(sim.particleCount));
  q.set('mode', render.mode);
  q.set('cmap', render.colormap);
  q.set('cby', render.colorBy);
  if (render.colormap === 'twocolor') {
    q.set('ca', render.colorA.replace('#', ''));
    q.set('cb', render.colorB.replace('#', ''));
  }
  q.set('ps', f(render.pointSize));
  q.set('op', f(render.opacity));
  q.set('tl', String(render.trailLength));
  q.set('tw', f(render.trailWidth));
  q.set('bloom', render.bloom ? '1' : '0');
  q.set('bs', f(render.bloomStrength));
  q.set('glyphs', render.glyphs ? '1' : '0');
  q.set('paper', render.paperMode ? '1' : '0');
  q.set('rs', f(render.resolutionScale));
  q.set('aq', render.autoQuality ? '1' : '0');
  q.set('td', f(render.trailDensity));
  if (camera) q.set('cam', [...camera.position, ...camera.target, camera.fov].map(f).join(','));
  return q.toString();
}

let debounceTimer: ReturnType<typeof setTimeout> | undefined;

/** Debounced history.replaceState — keeps the address bar shareable without camera spam. */
export function syncURL(query: string) {
  clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => {
    history.replaceState(null, '', `${location.pathname}?${query}`);
  }, 400);
}
