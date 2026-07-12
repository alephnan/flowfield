import { Fn, uint, uvec3, vec3, float, cos, sin, sqrt, log } from 'three/tsl';
import type { TSLNode } from '../types';

/**
 * pcg3d hash (Jarzynski & Olano, "Hash Functions for GPU Rendering").
 * uvec3 -> uvec3, well-distributed; entirely on-GPU, no CPU randomness upload.
 */
export const pcg3d = /* @__PURE__ */ Fn(([seed]: TSLNode[]) => {
  const v: TSLNode = uvec3(seed).toVar();
  v.assign(v.mul(uint(1664525)).add(uint(1013904223)));
  v.x.addAssign(v.y.mul(v.z));
  v.y.addAssign(v.z.mul(v.x));
  v.z.addAssign(v.x.mul(v.y));
  v.bitXorAssign(v.shiftRight(uvec3(16, 16, 16)));
  v.x.addAssign(v.y.mul(v.z));
  v.y.addAssign(v.z.mul(v.x));
  v.z.addAssign(v.x.mul(v.y));
  return v;
});

const INV_U32 = 2.3283064365386963e-10; // 1 / 2^32

/** uvec3 seed -> vec3 uniform in [0, 1). */
export const rand3 = /* @__PURE__ */ Fn(([seed]: TSLNode[]) => {
  const h = pcg3d(seed);
  return vec3(float(h.x), float(h.y), float(h.z)).mul(INV_U32);
});

/**
 * uvec3 seed -> vec3 of independent standard normals (Box–Muller).
 * Consumes two hashes internally.
 */
export const randGaussian3 = /* @__PURE__ */ Fn(([seed]: TSLNode[]) => {
  const u = rand3(seed).toVar();
  const v = rand3(uvec3(seed).add(uvec3(uint(0x9e3779b9), uint(0x85ebca6b), uint(0xc2b2ae35)))).toVar();
  const TWO_PI = Math.PI * 2;
  // Guard u away from 0 so log() stays finite.
  const r1 = sqrt(log(u.x.max(1e-7)).mul(-2));
  const r2 = sqrt(log(u.y.max(1e-7)).mul(-2));
  return vec3(
    r1.mul(cos(v.x.mul(TWO_PI))),
    r1.mul(sin(v.x.mul(TWO_PI))),
    r2.mul(cos(v.y.mul(TWO_PI))),
  );
});
