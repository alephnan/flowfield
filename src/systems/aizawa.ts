import { vec3 } from 'three/tsl';
import type { SystemDefinition } from '../types';

export const aizawa: SystemDefinition = {
  id: 'aizawa',
  name: 'Aizawa',
  dim: 3,
  parameters: [
    { key: 'a', label: 'a', default: 0.95, min: 0.5, max: 1.2, step: 0.005, safe: [0.7, 1.1] },
    { key: 'b', label: 'b', default: 0.7, min: 0.4, max: 1, step: 0.005, safe: [0.5, 0.9] },
    { key: 'c', label: 'c', default: 0.6, min: 0.3, max: 1, step: 0.005, safe: [0.4, 0.8] },
    { key: 'd', label: 'd', default: 3.5, min: 1.5, max: 4.5, step: 0.01, safe: [2.5, 4] },
    { key: 'e', label: 'e', default: 0.25, min: 0, max: 0.5, step: 0.005, safe: [0.1, 0.35] },
    { key: 'f', label: 'f', default: 0.1, min: 0, max: 0.3, step: 0.005, safe: [0, 0.2] },
  ],
  derivative: (p, { a, b, c, d, e, f }) => {
    const x2 = p.x.mul(p.x);
    const y2 = p.y.mul(p.y);
    const z2 = p.z.mul(p.z);
    const dx = p.z.sub(b).mul(p.x).sub(d.mul(p.y));
    const dy = d.mul(p.x).add(p.z.sub(b).mul(p.y));
    const dz = c
      .add(a.mul(p.z))
      .sub(z2.mul(p.z).div(3))
      .sub(x2.add(y2).mul(e.mul(p.z).add(1)))
      .add(f.mul(p.z).mul(x2).mul(p.x));
    return vec3(dx, dy, dz);
  },
  defaults: {
    dt: 0.02,
    maxAge: 20,
    spawn: { type: 'gaussian', center: [0.1, 0, 0], sigma: 0.4 },
    camera: { position: [2.6, -3.4, 1.6], target: [0, 0, 0.55], up: [0, 0, 1] },
    scale: 1.6,
    speedScale: 4.5,
    escapeRadius: 20,
    bounds: { min: [-1.6, -1.6, -0.6], max: [1.6, 1.6, 1.8] },
  },
  presets: [
    {
      name: 'Classic',
      params: { a: 0.95, b: 0.7, c: 0.6, d: 3.5, e: 0.25, f: 0.1 },
    },
    {
      name: 'Tight torus (e=0)',
      params: { a: 0.95, b: 0.7, c: 0.6, d: 3.5, e: 0, f: 0 },
      description: 'Dropping the higher-order terms leaves a cleaner torus-like shell.',
    },
  ],
  equations: [
    '\\dot{x} = (z - b)\\,x - d\\,y',
    '\\dot{y} = d\\,x + (z - b)\\,y',
    '\\dot{z} = c + a z - \\tfrac{z^3}{3} - (x^2 + y^2)(1 + e z) + f z x^3',
  ],
  notes:
    'A rotationally-driven flow whose attractor wraps a sphere-like shell around a central ' +
    'column — one of the most visually distinctive strange attractors. The d term spins ' +
    'trajectories about the z axis while the cubic z dynamics squeeze them vertically.',
  references: ['Y. Aizawa, Prog. Theor. Phys. (1982); popularized in Sprott, "Elegant Chaos" (2010)'],
};
