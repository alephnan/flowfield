import { vec3 } from 'three/tsl';
import type { SystemDefinition } from '../types';

export const halvorsen: SystemDefinition = {
  id: 'halvorsen',
  name: 'Halvorsen',
  dim: 3,
  parameters: [
    { key: 'a', label: 'a', default: 1.89, min: 0.5, max: 3, step: 0.005, safe: [1.3, 2.3] },
  ],
  derivative: (p, { a }) => {
    const dx = a.negate().mul(p.x).sub(p.y.mul(4)).sub(p.z.mul(4)).sub(p.y.mul(p.y));
    const dy = a.negate().mul(p.y).sub(p.z.mul(4)).sub(p.x.mul(4)).sub(p.z.mul(p.z));
    const dz = a.negate().mul(p.z).sub(p.x.mul(4)).sub(p.y.mul(4)).sub(p.x.mul(p.x));
    return vec3(dx, dy, dz);
  },
  defaults: {
    dt: 0.008,
    maxAge: 12,
    spawn: { type: 'gaussian', center: [-2, -1, 0], sigma: 2 },
    camera: { position: [14, 14, 15], target: [-2.5, -2.5, -2.5], up: [0, 0, 1] },
    scale: 10,
    speedScale: 70,
    escapeRadius: 120,
    bounds: { min: [-13, -13, -13], max: [7, 7, 7] },
  },
  presets: [
    { name: 'Classic (a=1.89)', params: { a: 1.89 } },
    { name: 'Denser weave (a=1.4)', params: { a: 1.4 } },
    {
      name: 'Limit cycle (a=2.4)',
      params: { a: 2.4 },
      description: 'Stronger damping collapses the attractor to a periodic orbit.',
    },
  ],
  equations: [
    '\\dot{x} = -a x - 4y - 4z - y^2',
    '\\dot{y} = -a y - 4z - 4x - z^2',
    '\\dot{z} = -a z - 4x - 4y - x^2',
  ],
  notes:
    'Cyclically symmetric quadratic flow with a striking three-armed "propeller" identity. ' +
    'Like Thomas it is invariant under x→y→z→x, but the quadratic terms give it sharp folds ' +
    'and a strong visual rhythm. a acts as damping; larger values simplify the dynamics.',
  references: ['Sprott, "Chaos and Time-Series Analysis" (2003), attractor catalog'],
};
