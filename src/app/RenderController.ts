import * as THREE from 'three/webgpu';
import {
  Fn,
  If,
  Loop,
  uniform,
  instancedArray,
  instanceIndex,
  vertexIndex,
  cameraPosition,
  varying,
  uv,
  uint,
  float,
  vec3,
  clamp,
  smoothstep,
  select,
  cross,
} from 'three/tsl';
import { pass } from 'three/tsl';
import { bloom } from 'three/addons/tsl/display/BloomNode.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { applyColormap } from '../tsl/colormaps';
import type { RenderSettings, SystemDefinition, Tier, TSLNode } from '../types';
import type { SimulationController } from './SimulationController';

const BG_DARK = 0x06060a;
const BG_PAPER = 0xf4f4f2;
const GLYPH_GRID = 13;

/** Owns scene, camera, materials, trails/glyph layers and post. */
export class RenderController {
  readonly renderer: THREE.WebGPURenderer;
  readonly scene = new THREE.Scene();
  readonly camera: THREE.PerspectiveCamera;
  readonly controls: OrbitControls;
  readonly tier: Tier;

  private sim!: SimulationController;
  private settings!: RenderSettings;

  // Uniforms (survive material rebuilds)
  private readonly pointSizeU = uniform(0.15);
  private readonly opacityU = uniform(1);
  private readonly speedScaleU = uniform(150);
  private readonly colorAU = uniform(new THREE.Color('#1a2b8f'));
  private readonly colorBU = uniform(new THREE.Color('#ff9a3c'));
  private readonly boundsCenterU = uniform(new THREE.Vector3());
  private readonly boundsRadiusU = uniform(1);
  private readonly boundsMinU = uniform(new THREE.Vector3());
  private readonly boundsMaxU = uniform(new THREE.Vector3());
  private readonly trailWidthU = uniform(0.05);
  private readonly trailHeadU = uniform(0);
  private readonly trailActiveU = uniform(32);
  private readonly glyphLenU = uniform(1);

  // Layers
  private points?: THREE.Sprite;
  private trailMesh?: THREE.Mesh;
  private glyphLines?: THREE.LineSegments;

  // Trails state
  private trailBuf?: TSLNode;
  private trailWrite?: TSLNode;
  private trailInit?: TSLNode;
  private trailGeometry?: THREE.InstancedBufferGeometry;
  private trailCount = 0;
  private trailStride = 1;
  private trailT = 64;
  private trailHead = 0;
  private trailDensityCur = 1;

  /** DPR cap the app renders at when resolutionScale is 1. */
  readonly baseRatio: number;

  private post?: THREE.PostProcessing;
  private bloomNode?: ReturnType<typeof bloom>;

  // Signatures of what is currently baked into materials
  private pointsSig = '';
  private trailsSig = '';
  private glyphsSig = '';

  constructor(renderer: THREE.WebGPURenderer, container: HTMLElement, tier: Tier) {
    this.renderer = renderer;
    this.tier = tier;
    this.trailT = tier.trailT;
    this.baseRatio = Math.min(window.devicePixelRatio, tier.dprCap);

    this.camera = new THREE.PerspectiveCamera(50, 1, 0.01, 5000);
    this.controls = new OrbitControls(this.camera, renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.08;

    this.scene.background = new THREE.Color(BG_DARK);

    container.appendChild(renderer.domElement);
    const resize = () => {
      const w = container.clientWidth || window.innerWidth;
      const h = container.clientHeight || window.innerHeight;
      renderer.setSize(w, h);
      this.camera.aspect = w / h;
      this.camera.updateProjectionMatrix();
    };
    resize();
    new ResizeObserver(resize).observe(container);
  }

  /** Full (re)build against a (possibly new) simulation instance. */
  rebuildAll(sim: SimulationController, settings: RenderSettings) {
    this.sim = sim;
    this.settings = settings;
    this.pointsSig = this.trailsSig = this.glyphsSig = '';
    this.disposeTrails();
    this.onSystemChanged(sim.system, false);
    this.apply(settings);
  }

  /** Per-system uniform + camera updates; glyphs rebake (derivative is baked in). */
  onSystemChanged(system: SystemDefinition, moveCamera = true) {
    const d = system.defaults;
    this.speedScaleU.value = d.speedScale;
    const min = new THREE.Vector3(...d.bounds.min);
    const max = new THREE.Vector3(...d.bounds.max);
    this.boundsMinU.value.copy(min);
    this.boundsMaxU.value.copy(max);
    this.boundsCenterU.value.copy(min.clone().add(max).multiplyScalar(0.5));
    this.boundsRadiusU.value = Math.max(max.clone().sub(min).length() * 0.5, 1e-3);
    this.pointSizeU.value = (this.settings?.pointSize ?? 1) * d.scale * 0.006;
    this.trailWidthU.value = (this.settings?.trailWidth ?? 1) * d.scale * 0.0035;
    this.glyphLenU.value = d.scale * 0.09;
    this.camera.near = d.scale * 0.01;
    this.camera.far = d.scale * 200;
    this.camera.updateProjectionMatrix();

    this.glyphsSig = ''; // force glyph rebake
    if (moveCamera) this.applyCameraPreset(system);
    if (this.settings) this.apply(this.settings);
    if (this.trailBuf) this.resetTrails();
  }

  applyCameraPreset(system: SystemDefinition) {
    const c = system.defaults.camera;
    this.camera.up.set(...(c.up ?? [0, 1, 0]));
    this.camera.position.set(...c.position);
    this.camera.fov = c.fov ?? 50;
    this.camera.updateProjectionMatrix();
    this.controls.target.set(...c.target);
    this.controls.update();
  }

  /** Apply render settings: cheap paths are uniform writes; baked changes rebuild. */
  apply(settings: RenderSettings) {
    this.settings = settings;
    const d = this.sim.system.defaults;

    this.opacityU.value = settings.opacity;
    this.pointSizeU.value = settings.pointSize * d.scale * 0.006;
    this.trailWidthU.value = settings.trailWidth * d.scale * 0.0035;
    this.trailActiveU.value = Math.min(settings.trailLength, this.trailT);
    this.colorAU.value.set(settings.colorA);
    this.colorBU.value.set(settings.colorB);
    this.scene.background = new THREE.Color(settings.paperMode ? BG_PAPER : BG_DARK);
    document.body.classList.toggle('paper-mode', settings.paperMode);

    const colorSig = `${settings.colormap}|${settings.colorBy}|${settings.paperMode}`;
    const wantPoints = settings.mode !== 'trails';
    const wantTrails = settings.mode !== 'points';

    if (wantPoints && this.pointsSig !== colorSig) this.buildPoints();
    if (this.points) this.points.visible = wantPoints;

    if (this.trailBuf && this.trailDensityCur !== settings.trailDensity) this.disposeTrails();
    if (wantTrails) {
      if (!this.trailBuf) this.buildTrailBuffers();
      if (this.trailsSig !== colorSig) this.buildTrailMesh();
    }
    if (this.trailMesh) this.trailMesh.visible = wantTrails;
    if (this.trailGeometry) {
      // Segment-major layout ⇒ truncating instances drops the oldest segment
      // of every trail, so the trail-length slider directly bounds vertex work.
      const activeSegs = Math.max(1, Math.min(settings.trailLength, this.trailT) - 1);
      this.trailGeometry.instanceCount = this.trailCount * activeSegs;
    }

    const glyphSig = `${this.sim.system.id}|${settings.colormap}|${settings.paperMode}`;
    if (settings.glyphs && this.glyphsSig !== glyphSig) this.buildGlyphs();
    if (this.glyphLines) this.glyphLines.visible = settings.glyphs;

    this.applyPost(settings);
  }

  private blendingFor() {
    return this.settings.paperMode ? THREE.NormalBlending : THREE.AdditiveBlending;
  }

  /** Scalar in [0,1] driving the colormap, per the "color by" selector. */
  private colorT(posNode: TSLNode, ageNode: TSLNode, speedNode: TSLNode): TSLNode {
    switch (this.settings.colorBy) {
      case 'position':
        return posNode.sub(this.boundsCenterU).length().div(this.boundsRadiusU);
      case 'age':
        return ageNode.div(this.sim.maxAgeU);
      case 'speed':
      default:
        return speedNode.div(this.speedScaleU);
    }
  }

  private colored(t: TSLNode): TSLNode {
    return applyColormap(this.settings.colormap, t, { a: this.colorAU, b: this.colorBU });
  }

  private buildPoints() {
    if (this.points) {
      this.scene.remove(this.points);
      this.points.material.dispose();
    }
    const sim = this.sim;
    const material = new THREE.SpriteNodeMaterial({
      transparent: true,
      depthWrite: false,
      blending: this.blendingFor(),
    });

    const posAttr = sim.positions.toAttribute();
    const age = sim.ages.toAttribute();
    const speed = sim.speeds.toAttribute();

    material.positionNode = posAttr;
    material.scaleNode = this.pointSizeU;
    material.colorNode = this.colored(this.colorT(posAttr, age, speed));

    const d = uv().sub(0.5).length().mul(2);
    const soft = float(1).sub(smoothstep(0.3, 1.0, d));
    const fadeIn = smoothstep(0.0, 0.4, age);
    const fadeOut = float(1).sub(smoothstep(float(sim.maxAgeU).mul(0.92), float(sim.maxAgeU), age));
    material.opacityNode = soft.mul(fadeIn).mul(fadeOut).mul(this.opacityU);

    const points = new THREE.Sprite(material);
    points.count = sim.count;
    points.frustumCulled = false;
    this.scene.add(points);
    this.points = points;
    this.pointsSig = `${this.settings.colormap}|${this.settings.colorBy}|${this.settings.paperMode}`;
  }

  // ── Trails ────────────────────────────────────────────────────────────────

  private buildTrailBuffers() {
    const sim = this.sim;
    const T = this.trailT;
    this.trailDensityCur = this.settings?.trailDensity ?? 1;
    this.trailCount = Math.max(
      1,
      Math.min(sim.count, Math.floor(this.tier.trailCount * this.trailDensityCur)),
    );
    this.trailStride = Math.max(1, Math.floor(sim.count / this.trailCount));
    this.trailBuf = instancedArray(this.trailCount * T, 'vec3');
    this.trailBuf.setPBO(true); // WebGL2: material reads of a TF-written buffer need the PBO path
    this.trailHead = 0;
    this.trailHeadU.value = 0;

    const stride = this.trailStride;
    const isWebGPU =
      (this.renderer.backend as { isWebGPUBackend?: boolean }).isWebGPUBackend === true;

    if (isWebGPU) {
      // One thread per TRAIL, scatter-writing its head slot — T× fewer threads
      // than the portable kernel below. On a respawn teleport the whole ring
      // is flooded so no streak connects to the new spawn point.
      this.trailWrite = Fn(() => {
        const pIdx = instanceIndex.mul(uint(stride));
        const pos = this.sim.positions.element(pIdx);
        const base = instanceIndex.mul(uint(T));
        const spawned = this.sim.spawnFrames.element(pIdx).equal(uint(this.sim.frameU));
        If(spawned, () => {
          Loop({ start: uint(0), end: uint(T) }, ({ i }) => {
            this.trailBuf.element(base.add(i)).assign(pos);
          });
        }).Else(() => {
          this.trailBuf.element(base.add(uint(this.trailHeadU))).assign(pos);
        });
      })().compute(this.trailCount);
    } else {
      // One thread per ring SLOT: the WebGL2 transform-feedback compute path
      // can only write a thread's own element, so scattered "write at head" is
      // not portable. Each slot overwrites itself when it is the head (or when
      // its particle respawned this frame, which resets the whole ring).
      this.trailWrite = Fn(() => {
        const trail = instanceIndex.div(uint(T));
        const slot = instanceIndex.mod(uint(T));
        const pIdx = trail.mul(uint(stride));
        const pos = this.sim.positions.element(pIdx);
        const isHead = slot.equal(uint(this.trailHeadU));
        const spawned = this.sim.spawnFrames.element(pIdx).equal(uint(this.sim.frameU));
        If(isHead.or(spawned), () => {
          this.trailBuf.element(instanceIndex).assign(pos);
        });
      })().compute(this.trailCount * T);
    }

    this.trailInit = Fn(() => {
      const trail = instanceIndex.div(uint(T));
      this.trailBuf.element(instanceIndex).assign(this.sim.positions.element(trail.mul(uint(stride))));
    })().compute(this.trailCount * T);

    this.renderer.compute(this.trailInit);
  }

  resetTrails() {
    if (this.trailInit) this.renderer.compute(this.trailInit);
  }

  private buildTrailMesh() {
    if (this.trailMesh) {
      this.scene.remove(this.trailMesh);
      this.trailMesh.geometry.dispose();
      (this.trailMesh.material as THREE.Material).dispose();
    }
    const sim = this.sim;
    const T = this.trailT;
    const stride = this.trailStride;

    const material = new THREE.MeshBasicNodeMaterial({
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      blending: this.blendingFor(),
    });

    // Per-vertex: which trail, which segment, which end (via uv.x), which side
    // (via uv.y). Layout is SEGMENT-major (j = idx / trailCount, 0 = newest)
    // so truncating instanceCount crops the oldest segments of every trail.
    const trail = instanceIndex.mod(uint(this.trailCount));
    const j = instanceIndex.div(uint(this.trailCount)); // segment index, 0 = newest
    const isB = uv().x.greaterThan(0.5);
    // Ring slots counted back from the head: B (newer end) = head − j,
    // A (older end) = head − j − 1; +T keeps the uint subtraction non-negative.
    const headSafe = uint(this.trailHeadU).add(uint(T));
    const slot = headSafe.sub(select(isB, j, j.add(uint(1)))).mod(uint(T));
    const slotOther = headSafe.sub(select(isB, j.add(uint(1)), j)).mod(uint(T));
    const base = trail.mul(uint(T));

    // Storage reads in render stages are automatically read-only bindings.
    const p = this.trailBuf.element(base.add(slot)).toVar();
    const pOther = this.trailBuf.element(base.add(slotOther)).toVar();
    const dirRaw: TSLNode = select(isB, p.sub(pOther), pOther.sub(p)).toVar();
    const dir: TSLNode = dirRaw.div(dirRaw.length().max(1e-6));
    const toCam: TSLNode = cameraPosition.sub(p);
    const sideRaw = cross(dir, toCam.div(toCam.length().max(1e-6))).toVar();
    const sideN = sideRaw.div(sideRaw.length().max(1e-6));
    const side = uv().y.sub(0.5).mul(2);
    material.positionNode = p.add(sideN.mul(side).mul(this.trailWidthU.mul(0.5)));

    // Alpha ramp toward the tail; segments older than the active length vanish.
    // (select() over floats — converting the uint result after select miscompiles on GLSL)
    const jF = float(j).toVar();
    const relAge = select(isB, jF, jF.add(1)); // 0 at head
    const ramp = clamp(float(1).sub(relAge.div(this.trailActiveU)), 0, 1);
    const pIdx = trail.mul(uint(stride));
    const age = sim.ages.element(pIdx);
    const fadeIn = smoothstep(0.0, 0.4, age);
    const fadeOut = float(1).sub(smoothstep(float(sim.maxAgeU).mul(0.92), float(sim.maxAgeU), age));
    material.opacityNode = varying(ramp.mul(ramp).mul(fadeIn).mul(fadeOut).mul(this.opacityU));

    const speed = sim.speeds.element(pIdx);
    const tColor = varying(this.colorT(p, age, speed));
    material.colorNode = this.colored(tColor);

    // Plain Mesh + InstancedBufferGeometry: instanceIndex still works, but no
    // InstancedMesh instanceMatrix gets allocated/bound (16 floats × millions
    // of instances), and instanceCount is adjustable per frame.
    const plane = new THREE.PlaneGeometry(1, 1);
    const geometry = new THREE.InstancedBufferGeometry();
    geometry.copy(plane as unknown as THREE.InstancedBufferGeometry);
    plane.dispose();
    geometry.instanceCount =
      this.trailCount * Math.max(1, Math.min(this.settings.trailLength, T) - 1);
    const mesh = new THREE.Mesh(geometry, material);
    mesh.frustumCulled = false;
    this.scene.add(mesh);
    this.trailMesh = mesh;
    this.trailGeometry = geometry;
    this.trailsSig = `${this.settings.colormap}|${this.settings.colorBy}|${this.settings.paperMode}`;
  }

  private disposeTrails() {
    if (this.trailMesh) {
      this.scene.remove(this.trailMesh);
      this.trailMesh.geometry.dispose();
      (this.trailMesh.material as THREE.Material).dispose();
      this.trailMesh = undefined;
      this.trailGeometry = undefined;
    }
    this.trailBuf = this.trailWrite = this.trailInit = undefined;
    this.trailsSig = '';
  }

  // ── Vector-field glyphs ──────────────────────────────────────────────────

  private buildGlyphs() {
    if (this.glyphLines) {
      this.scene.remove(this.glyphLines);
      this.glyphLines.geometry.dispose();
      (this.glyphLines.material as THREE.Material).dispose();
    }
    const sim = this.sim;
    const G = GLYPH_GRID;
    const gz = sim.system.dim === 2 ? 1 : G;
    const total = G * G * gz;

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(total * 2 * 3), 3));

    const material = new THREE.LineBasicNodeMaterial({
      transparent: true,
      depthWrite: false,
      blending: this.blendingFor(),
    });

    const idx = vertexIndex.div(uint(2));
    const end = vertexIndex.mod(uint(2));
    const ix = idx.mod(uint(G));
    const iy = idx.div(uint(G)).mod(uint(G));
    const iz = idx.div(uint(G * G));
    const denom = vec3(G - 1, G - 1, Math.max(gz - 1, 1));
    const cell = vec3(float(ix), float(iy), float(iz)).div(denom);
    const p0 = this.boundsMinU.add(cell.mul(this.boundsMaxU.sub(this.boundsMinU)));

    const fv = sim.derivative(p0, float(sim.timeU));
    const mag = fv.length();
    const dir = fv.div(mag.max(1e-9));
    const len = this.glyphLenU.mul(clamp(mag.div(this.speedScaleU), 0.15, 1));

    material.positionNode = select(end.equal(uint(1)), p0.add(dir.mul(len)), p0);
    material.colorNode = this.colored(varying(mag.div(this.speedScaleU)));
    material.opacityNode = varying(select(end.equal(uint(1)), float(0.15), float(0.75)));

    const lines = new THREE.LineSegments(geometry, material);
    lines.frustumCulled = false;
    this.scene.add(lines);
    this.glyphLines = lines;
    this.glyphsSig = `${sim.system.id}|${this.settings.colormap}|${this.settings.paperMode}`;
  }

  // ── Post ─────────────────────────────────────────────────────────────────

  private applyPost(settings: RenderSettings) {
    const wantBloom = settings.bloom && this.tier.bloomAllowed && !settings.paperMode;
    if (wantBloom && !this.post) {
      const scenePass = pass(this.scene, this.camera);
      this.bloomNode = bloom(scenePass, settings.bloomStrength, 0.35, 0.25);
      this.post = new THREE.PostProcessing(this.renderer);
      this.post.outputNode = scenePass.add(this.bloomNode);
    }
    if (this.bloomNode) {
      this.bloomNode.strength.value = settings.bloomStrength;
    }
    this.usePost = wantBloom;
  }

  private usePost = false;

  // ── Frame ────────────────────────────────────────────────────────────────

  /** Advance trail ring (call only on frames where the sim stepped). */
  updateTrails() {
    if (!this.trailBuf || !this.trailWrite) return;
    if (this.settings.mode === 'points') return;
    this.trailHead = (this.trailHead + 1) % this.trailT;
    this.trailHeadU.value = this.trailHead;
    this.renderer.compute(this.trailWrite);
  }

  /** Effective render-resolution multiplier (manual slider × adaptive quality). */
  setResolutionScale(scale: number) {
    const ratio = this.baseRatio * scale;
    if (this.renderer.getPixelRatio() !== ratio) this.renderer.setPixelRatio(ratio);
  }

  renderFrame() {
    this.controls.update();
    if (this.usePost && this.post) {
      this.post.render();
    } else {
      this.renderer.render(this.scene, this.camera);
    }
  }

  async screenshot() {
    const prevRatio = this.renderer.getPixelRatio();
    // 2× of the UNSCALED dpr — screenshots stay crisp even when adaptive
    // quality has lowered the live resolution. Clamped so the framebuffer's
    // long side stays under the common mobile texture-size limit of 4096.
    const el = this.renderer.domElement;
    this.renderer.setPixelRatio(
      Math.min(this.baseRatio * 2, 4096 / Math.max(el.clientWidth, el.clientHeight)),
    );
    this.renderFrame();
    const url = this.renderer.domElement.toDataURL('image/png');
    this.renderer.setPixelRatio(prevRatio);
    this.renderFrame();
    const a = document.createElement('a');
    a.href = url;
    a.download = `flowfield-${this.sim.system.id}-${Date.now()}.png`;
    a.click();
  }
}
