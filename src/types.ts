// TSL node values are proxied objects with a very loose static type surface.
// We alias them here so system definitions read cleanly; the runtime contract
// is: TSLVec3 behaves like a vec3 node, TSLFloat like a float node.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type TSLNode = any;
export type TSLVec3 = TSLNode;
export type TSLFloat = TSLNode;

/** uniform() node for a scalar parameter; .value is the CPU-side number. */
export type ParamUniform = TSLNode & { value: number };
export type ParamUniforms = Record<string, ParamUniform>;

export interface ParamSpec {
  key: string; // "sigma" — used in uniforms map, URL state
  label: string; // "σ" — shown in the panel
  default: number;
  min: number;
  max: number;
  step?: number;
  /** Range used by "randomize" — defaults to [min, max]. Keeps randomize inside non-explosive territory. */
  safe?: [number, number];
}

export type SpawnRegion =
  | { type: 'box'; center: [number, number, number]; size: [number, number, number] }
  | { type: 'shell'; center: [number, number, number]; rInner: number; rOuter: number }
  | { type: 'gaussian'; center: [number, number, number]; sigma: number };

export interface CameraPreset {
  position: [number, number, number];
  target: [number, number, number];
  up?: [number, number, number];
  fov?: number;
}

export interface NamedParamSet {
  name: string;
  params: Record<string, number>;
  description?: string;
}

export interface SystemDefaults {
  dt: number; // sim-time advance per frame at timeScale 1
  maxAge: number; // particle lifetime, wall-clock seconds
  spawn: SpawnRegion;
  camera: CameraPreset;
  scale: number; // world-space normalization (render group scale)
  speedScale: number; // |f| that maps to colormap t=1
  escapeRadius: number; // divergence guard threshold (pre-scale units)
  trailLength?: number;
  /** Axis-aligned region the attractor lives in — drives the vector-field glyph lattice. */
  bounds: { min: [number, number, number]; max: [number, number, number] };
}

export interface SystemDefinition {
  id: string;
  name: string;
  dim: 2 | 3;
  parameters: ParamSpec[];
  /**
   * The vector field f(p, t). Must be pure TSL (no side effects).
   * `time` is only meaningful for non-autonomous systems; autonomous ones ignore it.
   * 2D systems must return vec3(dx, dy, 0).
   */
  derivative: (p: TSLVec3, params: ParamUniforms, time: TSLFloat) => TSLVec3;
  defaults: SystemDefaults;
  presets?: NamedParamSet[];
  /** KaTeX strings, one per equation line, for the info panel. */
  equations?: string[];
  /** Plain-text blurb: bifurcations, notable values, references. */
  notes?: string;
  references?: string[];
}

export type IntegratorId = 'euler' | 'rk4';
export type ColormapId = 'viridis' | 'inferno' | 'turbo' | 'twocolor';
export type ColorById = 'speed' | 'position' | 'age';
export type RenderMode = 'points' | 'trails' | 'both';

export interface RenderSettings {
  mode: RenderMode;
  colormap: ColormapId;
  colorBy: ColorById;
  colorA: string; // two-color lerp endpoints
  colorB: string;
  pointSize: number;
  opacity: number;
  trailLength: number; // active length ≤ allocated T
  trailWidth: number;
  bloom: boolean;
  bloomStrength: number;
  paperMode: boolean;
  glyphs: boolean;
  /** Manual render-resolution multiplier on top of the devicePixelRatio cap. */
  resolutionScale: number;
  /** Let the app lower the effective resolution below resolutionScale to hold 60 fps. */
  autoQuality: boolean;
  /** Fraction of the tier's trail budget actually allocated (1, 0.5, 0.25). */
  trailDensity: number;
}

export interface SimSettings {
  integrator: IntegratorId;
  dt: number;
  substeps: number;
  timeScale: number;
  paused: boolean;
  particleCount: number;
}

export interface Tier {
  name: 'webgpu' | 'webgl2';
  maxParticles: number;
  defaultParticles: number;
  trailT: number; // allocated ring-buffer length
  trailCount: number; // how many particles get trails
  bloomAllowed: boolean;
  dprCap: number; // devicePixelRatio ceiling
}
