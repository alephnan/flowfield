import { vec3 } from 'three/tsl';
import type { SystemDefinition } from '../types';

export const rossler: SystemDefinition = {
  id: 'rossler',
  name: 'Rössler',
  dim: 3,
  parameters: [
    { key: 'a', label: 'a', default: 0.2, min: 0, max: 0.5, step: 0.005, safe: [0.1, 0.35] },
    { key: 'b', label: 'b', default: 0.2, min: 0, max: 2, step: 0.01, safe: [0.1, 1] },
    { key: 'c', label: 'c', default: 5.7, min: 1, max: 14, step: 0.05, safe: [2, 9] },
  ],
  derivative: (p, { a, b, c }) => {
    const dx = p.y.negate().sub(p.z);
    const dy = p.x.add(a.mul(p.y));
    const dz = b.add(p.z.mul(p.x.sub(c)));
    return vec3(dx, dy, dz);
  },
  defaults: {
    dt: 0.04,
    maxAge: 20,
    spawn: { type: 'gaussian', center: [0.5, -3, 0.2], sigma: 2 },
    camera: { position: [18, -32, 28], target: [0, 0, 8], up: [0, 0, 1] },
    scale: 14,
    speedScale: 18,
    escapeRadius: 150,
    bounds: { min: [-12, -13, 0], max: [13, 10, 24] },
  },
  presets: [
    { name: 'Classic chaos (c=5.7)', params: { a: 0.2, b: 0.2, c: 5.7 } },
    {
      name: 'Period-1 (c=2.5)',
      params: { a: 0.2, b: 0.2, c: 2.5 },
      description: 'Single limit cycle before the period-doubling cascade.',
    },
    { name: 'Period-2 (c=3.5)', params: { a: 0.2, b: 0.2, c: 3.5 } },
    { name: 'Period-4 (c=4.0)', params: { a: 0.2, b: 0.2, c: 4.0 } },
    {
      name: 'Funnel chaos (c=9)',
      params: { a: 0.2, b: 0.2, c: 9 },
      description: 'The "funnel" regime — folds pile up instead of a clean single band.',
    },
  ],
  equations: ['\\dot{x} = -y - z', '\\dot{y} = x + a y', '\\dot{z} = b + z(x - c)'],
  notes:
    'Rössler (1976) built this as a minimal chaotic flow: a single quadratic nonlinearity. ' +
    'Sweeping c reveals a textbook period-doubling cascade into chaos (period-1 near c≈2.5, ' +
    'period-2 at ≈3.5, period-4 at ≈4.2, chaos by c≈5). Most of the motion is a slow outward ' +
    'spiral in the x–y plane with sudden excursions in z.',
  references: ['O. E. Rössler, "An Equation for Continuous Chaos", Phys. Lett. A 57 (1976)'],
};
