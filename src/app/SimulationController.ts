import * as THREE from 'three/webgpu';
import {
  Fn,
  If,
  Loop,
  Break,
  uniform,
  instancedArray,
  instanceIndex,
  int,
  uint,
  uvec3,
  float,
  select,
  any as tslAny,
} from 'three/tsl';
import type { IntegratorId, ParamUniforms, SystemDefinition, TSLNode } from '../types';
import { integrators, type DerivFn } from '../tsl/integrators';
import { rand3, randGaussian3 } from '../tsl/prng';
import { sampleSpawn } from '../tsl/spawn';

/**
 * Owns the particle state buffers and the fused integrate/age/respawn compute
 * kernel. Everything a slider touches is a uniform; only system, integrator and
 * particle-count changes rebuild pipelines.
 */
export class SimulationController {
  readonly renderer: THREE.WebGPURenderer;
  system: SystemDefinition;
  count: number;
  integrator: IntegratorId = 'rk4';

  // Storage (recreated only on count change)
  positions!: TSLNode;
  ages!: TSLNode;
  speeds!: TSLNode;
  spawnFrames!: TSLNode; // frame index of last respawn — lets the trail pass reset rings

  // Uniforms — survive all rebuilds
  readonly dtU = uniform(0.01);
  readonly substepsU = uniform(4);
  readonly timeScaleU = uniform(1);
  readonly dtFrameU = uniform(0); // wall-clock seconds since last step
  readonly timeU = uniform(0); // sim time at frame start
  readonly frameU = uniform(0);
  readonly maxAgeU = uniform(12);
  readonly escapeRadiusU = uniform(250);
  // Click-to-seed burst (consumed for exactly one compute dispatch)
  readonly burstCenterU = uniform(new THREE.Vector3());
  readonly burstRadiusU = uniform(0.5);
  readonly burstFracU = uniform(0);

  paramUniforms: ParamUniforms = {};

  simTime = 0;
  frame = 0;

  private computeStep!: TSLNode;
  private computeInit!: TSLNode;

  constructor(renderer: THREE.WebGPURenderer, system: SystemDefinition, count: number) {
    this.renderer = renderer;
    this.system = system;
    this.count = count;
    this.buildBuffers();
    this.applySystemDefaults();
    this.buildParamUniforms();
    this.buildKernels();
  }

  /** The vector field with parameters and (for non-autonomous systems) time bound in. */
  get derivative(): DerivFn {
    return (state, t) => this.system.derivative(state, this.paramUniforms, t);
  }

  private buildBuffers() {
    this.positions = instancedArray(this.count, 'vec3');
    this.ages = instancedArray(this.count, 'float');
    this.speeds = instancedArray(this.count, 'float');
    this.spawnFrames = instancedArray(this.count, 'uint');
    // These buffers are read at arbitrary indices from render materials and
    // from the trail compute pass; on the WebGL2 fallback such gathers only
    // work through the PBO (texture-backed) path.
    this.positions.setPBO(true);
    this.ages.setPBO(true);
    this.speeds.setPBO(true);
    this.spawnFrames.setPBO(true);
  }

  private applySystemDefaults() {
    const d = this.system.defaults;
    this.dtU.value = d.dt;
    this.maxAgeU.value = d.maxAge;
    this.escapeRadiusU.value = d.escapeRadius;
  }

  private buildParamUniforms() {
    this.paramUniforms = {};
    for (const spec of this.system.parameters) {
      this.paramUniforms[spec.key] = uniform(spec.default);
    }
  }

  private buildKernels() {
    const f = this.derivative;
    const step = integrators[this.integrator];
    const spawnRegion = this.system.defaults.spawn;

    this.computeStep = Fn(() => {
      const pos = this.positions.element(instanceIndex);
      const age = this.ages.element(instanceIndex);

      const state = pos.toVar();
      const tLocal = float(this.timeU).toVar();
      const h = float(this.dtU).mul(this.timeScaleU).div(float(this.substepsU)).toVar();
      const escaped = float(0).toVar();

      Loop({ start: int(0), end: int(this.substepsU) }, () => {
        step(f, state, tLocal, h);
        tLocal.addAssign(h);
        // Divergence guard — bail before values overflow into NaN/Inf,
        // plus a NaN self-compare in case one slipped through.
        If(
          tslAny(state.abs().greaterThan(this.escapeRadiusU)).or(tslAny(state.notEqual(state))),
          () => {
            escaped.assign(1);
            Break();
          },
        );
      });

      // Mean speed over the step from displacement — spares a full derivative
      // eval. Must be sampled before respawn overwrites `state` (a respawn
      // teleport is not motion). NOTE: don't read `speeds` here — this kernel
      // TF-writes it on WebGL, and reading a buffer the same pass writes is a
      // feedback hazard there. (Consequence: speed reads 0 while timeScale=0.)
      const hTotal = float(this.dtU).mul(this.timeScaleU);
      const spd = state.sub(pos).length().div(hTotal.max(1e-9)).toVar();

      age.addAssign(this.dtFrameU);

      const rnd = rand3(uvec3(instanceIndex, uint(this.frameU), uint(0xb5297a4d)));
      const needsRespawn = age.greaterThanEqual(this.maxAgeU).or(escaped.greaterThan(0.5));
      const stolen = rnd.x.lessThan(this.burstFracU); // click-to-seed steals a random slice

      If(needsRespawn.or(stolen), () => {
        const seed = uvec3(instanceIndex, uint(this.frameU), uint(0x68e31da4));
        const spawned = sampleSpawn(spawnRegion, seed);
        const burstPos = this.burstCenterU.add(randGaussian3(seed).mul(this.burstRadiusU));
        state.assign(select(stolen, burstPos, spawned));
        // Mass-divergence deaths get re-staggered so they don't pulse forever.
        const staggered = rnd.y.mul(this.maxAgeU).mul(0.5);
        age.assign(select(escaped.greaterThan(0.5).and(stolen.not()), staggered, float(0)));
        this.spawnFrames.element(instanceIndex).assign(uint(this.frameU));
      });

      pos.assign(state);
      this.speeds.element(instanceIndex).assign(spd);
    })().compute(this.count);

    this.computeInit = Fn(() => {
      const seed = uvec3(instanceIndex, uint(0x12fa9), uint(1));
      this.positions.element(instanceIndex).assign(sampleSpawn(spawnRegion, seed));
      // Staggered initial ages so respawns never pulse.
      const r = rand3(uvec3(instanceIndex, uint(7), uint(99)));
      this.ages.element(instanceIndex).assign(r.x.mul(this.maxAgeU));
      this.speeds.element(instanceIndex).assign(float(0));
      this.spawnFrames.element(instanceIndex).assign(uint(0));
    })().compute(this.count);
  }

  setSystem(system: SystemDefinition) {
    this.system = system;
    this.applySystemDefaults();
    this.buildParamUniforms();
    this.buildKernels();
    this.reset();
  }

  setIntegrator(id: IntegratorId) {
    if (id === this.integrator) return;
    this.integrator = id;
    this.buildKernels();
  }

  setParam(key: string, value: number) {
    const u = this.paramUniforms[key];
    if (u) u.value = value;
  }

  /** Reseed every particle and restart sim time. */
  reset() {
    this.simTime = 0;
    this.timeU.value = 0;
    this.frame = 0;
    this.renderer.compute(this.computeInit);
  }

  requestBurst(center: THREE.Vector3, fraction: number, radius: number) {
    this.burstCenterU.value.copy(center);
    this.burstFracU.value = fraction;
    this.burstRadiusU.value = radius;
  }

  /** One frame: advances sim time by dt·timeScale (split into substeps on GPU). */
  update(deltaSeconds: number) {
    this.frame++;
    this.frameU.value = this.frame;
    this.dtFrameU.value = deltaSeconds;
    this.timeU.value = this.simTime;
    this.renderer.compute(this.computeStep);
    this.simTime += this.dtU.value * this.timeScaleU.value;
    this.burstFracU.value = 0; // burst is one-shot
  }
}
