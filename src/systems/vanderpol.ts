import { vec3, float } from 'three/tsl';
import type { SystemDefinition } from '../types';

export const vanderpol: SystemDefinition = {
  id: 'vanderpol',
  name: 'Van der Pol',
  dim: 2,
  parameters: [
    { key: 'mu', label: 'μ', default: 1.5, min: 0, max: 6, step: 0.01, safe: [0.1, 4] },
  ],
  derivative: (p, { mu }) => {
    const dx = p.y;
    const dy = mu.mul(float(1).sub(p.x.mul(p.x))).mul(p.y).sub(p.x);
    return vec3(dx, dy, float(0));
  },
  defaults: {
    dt: 0.03,
    maxAge: 15,
    spawn: { type: 'box', center: [0, 0, 0], size: [7, 9, 0] },
    camera: { position: [0, 0, 12], target: [0, 0, 0], up: [0, 1, 0] },
    scale: 4,
    speedScale: 8,
    escapeRadius: 60,
    bounds: { min: [-3.5, -4.5, 0], max: [3.5, 4.5, 0] },
  },
  presets: [
    {
      name: 'Near-harmonic (μ=0.1)',
      params: { mu: 0.1 },
      description: 'Almost a linear center: slow spiral onto a nearly circular cycle.',
    },
    { name: 'Classic (μ=1.5)', params: { mu: 1.5 } },
    {
      name: 'Relaxation (μ=4)',
      params: { mu: 4 },
      description: 'Slow–fast dynamics: long crawls punctuated by fast jumps.',
    },
  ],
  equations: ['\\dot{x} = y', '\\dot{y} = \\mu (1 - x^2)\\, y - x'],
  notes:
    'The prototype relaxation oscillator (Van der Pol, 1926, vacuum-tube circuits). Every initial ' +
    'condition except the origin converges to a unique globally attracting limit cycle — the ' +
    'textbook example for limit-cycle pedagogy. As μ→0 the cycle becomes circular (the system ' +
    'approaches a harmonic oscillator); as μ grows the cycle develops slow–fast relaxation jumps. ' +
    'Turn on the vector-field glyphs to read the flow around the unstable origin.',
  references: ['B. van der Pol, "On relaxation-oscillations", Phil. Mag. 2 (1926)'],
};
