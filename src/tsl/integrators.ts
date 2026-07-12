import type { TSLFloat, TSLNode, TSLVec3 } from '../types';

/** Vector field with explicit time dependence: f(state, t). */
export type DerivFn = (state: TSLVec3, t: TSLFloat) => TSLVec3;

/**
 * One integrator step. Mutates `state` (a vec3 .toVar()) in place and must
 * leave `t` untouched — the caller advances t by h after each step.
 */
export type IntegratorStep = (f: DerivFn, state: TSLNode, t: TSLNode, h: TSLFloat) => void;

export const eulerStep: IntegratorStep = (f, state, t, h) => {
  state.addAssign(f(state, t).mul(h));
};

export const rk4Step: IntegratorStep = (f, state, t, h) => {
  const halfH = h.mul(0.5);
  const k1 = f(state, t).toVar();
  const k2 = f(state.add(k1.mul(halfH)), t.add(halfH)).toVar();
  const k3 = f(state.add(k2.mul(halfH)), t.add(halfH)).toVar();
  const k4 = f(state.add(k3.mul(h)), t.add(h)).toVar();
  state.addAssign(k1.add(k2.mul(2)).add(k3.mul(2)).add(k4).mul(h.div(6)));
};

export const integrators: Record<'euler' | 'rk4', IntegratorStep> = {
  euler: eulerStep,
  rk4: rk4Step,
};
