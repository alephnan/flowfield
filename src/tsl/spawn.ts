import { vec3, uvec3, uint, mix, normalize, pow } from 'three/tsl';
import { rand3, randGaussian3 } from './prng';
import type { SpawnRegion, TSLNode, TSLVec3 } from '../types';

/**
 * Emits TSL code sampling a position inside `region`. Region geometry is baked
 * into the shader (regions are static per system; system switches recompile anyway).
 * `seed` is a uvec3 node; distinct consumers must pass distinct seeds.
 */
export function sampleSpawn(region: SpawnRegion, seed: TSLNode): TSLVec3 {
  const center = vec3(...region.center);
  switch (region.type) {
    case 'box': {
      const r = rand3(seed);
      return center.add(r.sub(0.5).mul(vec3(...region.size)));
    }
    case 'shell': {
      const dir = normalize(randGaussian3(seed));
      const r = rand3(uvec3(seed).add(uvec3(uint(0x1b873593), uint(0xcc9e2d51), uint(0xe6546b64))));
      // cbrt for uniform density between the two radii
      const radius = mix(region.rInner, region.rOuter, pow(r.x, 1 / 3));
      return center.add(dir.mul(radius));
    }
    case 'gaussian':
      return center.add(randGaussian3(seed).mul(region.sigma));
  }
}
