import { vec3 } from 'three/tsl';
import type { SystemDefinition } from '../types';

export const chen: SystemDefinition = {
  id: 'chen',
  name: 'Chen',
  dim: 3,
  parameters: [
    { key: 'a', label: 'a', default: 35, min: 20, max: 50, step: 0.1, safe: [30, 42] },
    { key: 'b', label: 'b', default: 3, min: 1, max: 8, step: 0.05, safe: [2, 5] },
    { key: 'c', label: 'c', default: 28, min: 15, max: 34, step: 0.1, safe: [20, 30] },
  ],
  derivative: (p, { a, b, c }) => {
    const dx = a.mul(p.y.sub(p.x));
    const dy = c.sub(a).mul(p.x).sub(p.x.mul(p.z)).add(c.mul(p.y));
    const dz = p.x.mul(p.y).sub(b.mul(p.z));
    return vec3(dx, dy, dz);
  },
  defaults: {
    dt: 0.004,
    maxAge: 10,
    spawn: { type: 'gaussian', center: [-3, 2, 20], sigma: 4 },
    camera: { position: [34, -50, 42], target: [0, 0, 22], up: [0, 0, 1] },
    scale: 28,
    speedScale: 400,
    escapeRadius: 300,
    bounds: { min: [-28, -28, 0], max: [28, 28, 46] },
  },
  presets: [
    { name: 'Classic (a=35, c=28)', params: { a: 35, b: 3, c: 28 } },
    {
      name: 'Sparser scrolls (c=24)',
      params: { a: 35, b: 3, c: 24 },
      description: 'Lower c thins the attractor and slows the scroll switching.',
    },
    { name: 'Wide (a=40, c=31)', params: { a: 40, b: 3, c: 31 } },
  ],
  equations: [
    '\\dot{x} = a (y - x)',
    '\\dot{y} = (c - a)x - xz + c y',
    '\\dot{z} = xy - b z',
  ],
  notes:
    'Chen & Ueta (1999) found this while studying chaotification of the Lorenz system; it is the ' +
    '"dual" of Lorenz in Vaněček–Čelikovský classification (the sign of the linear coupling term ' +
    'a₁₂·a₂₁ flips). Visibly faster and more tightly wound than Lorenz, with the two scrolls more ' +
    'interlinked. Chaotic roughly for c ∈ [20, 28.4] at a=35, b=3.',
  references: ['G. Chen & T. Ueta, "Yet Another Chaotic Attractor", Int. J. Bifurcation Chaos 9 (1999)'],
};
