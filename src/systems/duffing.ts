import { vec3, float, cos } from 'three/tsl';
import type { SystemDefinition } from '../types';

export const duffing: SystemDefinition = {
  id: 'duffing',
  name: 'Duffing (forced)',
  dim: 2,
  parameters: [
    { key: 'delta', label: 'δ', default: 0.2, min: 0, max: 1, step: 0.005, safe: [0.1, 0.5] },
    { key: 'alpha', label: 'α', default: -1, min: -2, max: 2, step: 0.01, safe: [-1.5, 1] },
    { key: 'beta', label: 'β', default: 1, min: 0.1, max: 3, step: 0.01, safe: [0.5, 2] },
    { key: 'gamma', label: 'γ', default: 0.3, min: 0, max: 1, step: 0.005, safe: [0.1, 0.65] },
    { key: 'omega', label: 'ω', default: 1, min: 0.2, max: 3, step: 0.01, safe: [0.5, 2] },
  ],
  // Non-autonomous: the drive term γ cos(ωt) uses the integrator-threaded time.
  derivative: (p, { delta, alpha, beta, gamma, omega }, time) => {
    const dx = p.y;
    const dy = gamma
      .mul(cos(omega.mul(time)))
      .sub(delta.mul(p.y))
      .sub(alpha.mul(p.x))
      .sub(beta.mul(p.x).mul(p.x).mul(p.x));
    return vec3(dx, dy, float(0));
  },
  defaults: {
    dt: 0.03,
    maxAge: 25,
    spawn: { type: 'box', center: [0, 0, 0], size: [3.6, 2.4, 0] },
    camera: { position: [0, 0, 6], target: [0, 0, 0], up: [0, 1, 0] },
    scale: 2.2,
    speedScale: 2.5,
    escapeRadius: 40,
    bounds: { min: [-2, -1.5, 0], max: [2, 1.5, 0] },
  },
  presets: [
    {
      name: 'Double-well chaos',
      params: { delta: 0.2, alpha: -1, beta: 1, gamma: 0.3, omega: 1 },
      description: 'Holmes’ classic: chaotic hopping between the two potential wells.',
    },
    {
      name: 'Period-1 (γ=0.2)',
      params: { delta: 0.3, alpha: -1, beta: 1, gamma: 0.2, omega: 1 },
    },
    {
      name: 'Large orbit (γ=0.65)',
      params: { delta: 0.2, alpha: -1, beta: 1, gamma: 0.65, omega: 1 },
      description: 'Strong forcing sweeps both wells in one large periodic orbit.',
    },
  ],
  equations: ['\\dot{x} = y', '\\dot{y} = \\gamma\\cos(\\omega t) - \\delta y - \\alpha x - \\beta x^3'],
  notes:
    'The periodically forced Duffing oscillator — the launch catalog’s non-autonomous system ' +
    '(the vector field itself oscillates in time, so the phase portrait "breathes" at the drive ' +
    'period). With α<0, β>0 it is a particle in a double-well potential; forcing makes it hop ' +
    'chaotically between wells. Because the field is time-dependent, particle streaks here are a ' +
    'stroboscopic cloud rather than a fixed attractor — watch the whole distribution pulse with ω.',
  references: ['P. Holmes, "A nonlinear oscillator with a strange attractor", Phil. Trans. R. Soc. A 292 (1979)'],
};
