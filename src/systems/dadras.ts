import { vec3 } from 'three/tsl';
import type { SystemDefinition } from '../types';

export const dadras: SystemDefinition = {
  id: 'dadras',
  name: 'Dadras',
  dim: 3,
  parameters: [
    { key: 'p', label: 'p', default: 3, min: 1, max: 5, step: 0.01, safe: [2, 4] },
    { key: 'q', label: 'q', default: 2.7, min: 1, max: 5, step: 0.01, safe: [2, 3.5] },
    { key: 'r', label: 'r', default: 1.7, min: 0.5, max: 3, step: 0.01, safe: [1.2, 2.2] },
    { key: 's', label: 's', default: 2, min: 1, max: 3, step: 0.01, safe: [1.5, 2.5] },
    { key: 'e', label: 'e', default: 9, min: 5, max: 12, step: 0.05, safe: [7, 10] },
  ],
  derivative: (pt, { p, q, r, s, e }) => {
    const dx = pt.y.sub(p.mul(pt.x)).add(q.mul(pt.y).mul(pt.z));
    const dy = r.mul(pt.y).sub(pt.x.mul(pt.z)).add(pt.z);
    const dz = s.mul(pt.x).mul(pt.y).sub(e.mul(pt.z));
    return vec3(dx, dy, dz);
  },
  defaults: {
    dt: 0.015,
    maxAge: 15,
    spawn: { type: 'gaussian', center: [1, 1, 1], sigma: 3 },
    camera: { position: [0, -28, 16], target: [0, 0, 0], up: [0, 0, 1] },
    scale: 13,
    speedScale: 60,
    escapeRadius: 150,
    bounds: { min: [-15, -10, -7], max: [15, 10, 7] },
  },
  presets: [
    { name: 'Classic four-scroll', params: { p: 3, q: 2.7, r: 1.7, s: 2, e: 9 } },
    {
      name: 'Two-scroll (r=1.3)',
      params: { p: 3, q: 2.7, r: 1.3, s: 2, e: 9 },
      description: 'Reducing r merges the outer wings into a two-scroll attractor.',
    },
    { name: 'Loose weave (p=2.2)', params: { p: 2.2, q: 2.7, r: 1.7, s: 2, e: 9 } },
  ],
  equations: [
    '\\dot{x} = y - p x + q y z',
    '\\dot{y} = r y - x z + z',
    '\\dot{z} = s x y - e z',
  ],
  notes:
    'Dadras & Momeni (2009) — a five-parameter flow notable for genuine multi-scroll behavior: ' +
    'at the classic parameters trajectories thread four distinct scrolls linked in a chain. ' +
    'Parameter r controls how many scrolls survive.',
  references: ['S. Dadras & H. R. Momeni, Phys. Lett. A 373 (2009)'],
};
