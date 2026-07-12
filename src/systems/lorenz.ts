import { vec3 } from 'three/tsl';
import type { SystemDefinition } from '../types';

export const lorenz: SystemDefinition = {
  id: 'lorenz',
  name: 'Lorenz',
  dim: 3,
  parameters: [
    { key: 'sigma', label: 'σ', default: 10, min: 0, max: 30, step: 0.1, safe: [5, 20] },
    { key: 'rho', label: 'ρ', default: 28, min: 0, max: 60, step: 0.1, safe: [5, 45] },
    { key: 'beta', label: 'β', default: 8 / 3, min: 0.1, max: 10, step: 0.01, safe: [1, 5] },
  ],
  derivative: (p, { sigma, rho, beta }) => {
    const dx = sigma.mul(p.y.sub(p.x));
    const dy = p.x.mul(rho.sub(p.z)).sub(p.y);
    const dz = p.x.mul(p.y).sub(beta.mul(p.z));
    return vec3(dx, dy, dz);
  },
  defaults: {
    dt: 0.01,
    maxAge: 12,
    spawn: { type: 'gaussian', center: [1, 1, 1], sigma: 3 },
    camera: { position: [38, -55, 43], target: [0, 0, 27], up: [0, 0, 1] },
    scale: 30,
    speedScale: 150,
    escapeRadius: 250,
    bounds: { min: [-25, -25, 0], max: [25, 25, 52] },
  },
  presets: [
    { name: 'Classic chaos (ρ=28)', params: { sigma: 10, rho: 28, beta: 8 / 3 } },
    {
      name: 'Stable spirals (ρ=15)',
      params: { sigma: 10, rho: 15, beta: 8 / 3 },
      description: 'Two symmetric spiral sinks — trajectories settle onto the fixed points C±.',
    },
    {
      name: 'Transient chaos (ρ=21)',
      params: { sigma: 10, rho: 21, beta: 8 / 3 },
      description: 'Chaotic wandering that eventually collapses onto a spiral sink.',
    },
    {
      name: 'Just past onset (ρ=24.8)',
      params: { sigma: 10, rho: 24.8, beta: 8 / 3 },
      description: 'Barely above the chaos onset ρ≈24.74 — attractor coexists with the sinks.',
    },
  ],
  equations: [
    '\\dot{x} = \\sigma (y - x)',
    '\\dot{y} = x(\\rho - z) - y',
    '\\dot{z} = xy - \\beta z',
  ],
  notes:
    'The canonical strange attractor (Lorenz 1963, a truncated model of Rayleigh–Bénard convection). ' +
    'Pitchfork bifurcation at ρ=1 (origin destabilizes into C±); subcritical Hopf at ρ≈24.74 where the ' +
    'spiral sinks lose stability and the strange attractor is the only attractor. Sweep ρ from 5 → 28 to ' +
    'watch sink → two spiral sinks → chaos. Largest Lyapunov exponent ≈ 0.906 at classic parameters.',
  references: [
    'E. N. Lorenz, "Deterministic Nonperiodic Flow", J. Atmos. Sci. 20 (1963)',
    'C. Sparrow, "The Lorenz Equations: Bifurcations, Chaos, and Strange Attractors" (1982)',
  ],
};
