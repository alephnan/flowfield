import { vec3, sin } from 'three/tsl';
import type { SystemDefinition } from '../types';

export const thomas: SystemDefinition = {
  id: 'thomas',
  name: 'Thomas',
  dim: 3,
  parameters: [
    { key: 'b', label: 'b', default: 0.208186, min: 0, max: 1, step: 0.001, safe: [0.02, 0.4] },
  ],
  derivative: (p, { b }) => {
    const dx = sin(p.y).sub(b.mul(p.x));
    const dy = sin(p.z).sub(b.mul(p.y));
    const dz = sin(p.x).sub(b.mul(p.z));
    return vec3(dx, dy, dz);
  },
  defaults: {
    dt: 0.08,
    maxAge: 30,
    spawn: { type: 'box', center: [0, 0, 0], size: [8, 8, 8] },
    camera: { position: [8.5, 8.5, 8.5], target: [0, 0, 0], up: [0, 0, 1] },
    scale: 5,
    speedScale: 1.6,
    escapeRadius: 60,
    bounds: { min: [-5.5, -5.5, -5.5], max: [5.5, 5.5, 5.5] },
  },
  presets: [
    { name: 'Classic chaos (b=0.208186)', params: { b: 0.208186 } },
    {
      name: 'Labyrinth (b=0.01)',
      params: { b: 0.01 },
      description: 'Near-zero damping: trajectories wander a 3D lattice like a random walk.',
    },
    { name: 'Limit cycle (b=0.30)', params: { b: 0.3 } },
    {
      name: 'Fixed points (b=0.40)',
      params: { b: 0.4 },
      description: 'Above b≈0.329 the symmetric fixed points are stable — everything spirals in.',
    },
  ],
  equations: [
    '\\dot{x} = \\sin y - b x',
    '\\dot{y} = \\sin z - b y',
    '\\dot{z} = \\sin x - b z',
  ],
  notes:
    'Thomas’ cyclically symmetric attractor: invariant under x→y→z→x. The single parameter b ' +
    'acts as friction. Sweep it downward: stable fixed points (b>0.33), Hopf to a limit cycle ' +
    '(b≈0.329), period-doubling into chaos (b≈0.208), and as b→0 the celebrated "labyrinth chaos" ' +
    'where particles drift forever through a periodic lattice of unstable cells.',
  references: ['R. Thomas, Int. J. Bifurcation Chaos 9 (1999)'],
};
