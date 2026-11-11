// Scene contract shared by every simulation (docs/design.md §4).
import type { Rng } from './rng';
import type { Draw, PlotDraw } from '../draw/draw';

export type Vec2 = { x: number; y: number };

/** i18n key. */
export type Msg = string;

/** Semantic colour roles, identical across chapters (docs/design.md §3.1). */
export type Role =
  | 'position'
  | 'velocity'
  | 'acceleration'
  | 'force'
  | 'energyK'
  | 'energyU'
  | 'energyE'
  | 'positive'
  | 'negative'
  | 'surface'
  | 'field'
  | 'highlight'
  | 'fg'
  | 'muted'
  | 'axis';

// ---------------------------------------------------------------- parameters

export type ParamValue = number | string | boolean | number[];
export type Params = Record<string, ParamValue>;

interface ParamBase {
  label: Msg;
  /** One line on what the control changes: tooltip, settings drawer and info panel. */
  desc?: Msg;
  /** main → control bar (max 2 per scene), advanced → drawer, hidden → URL only. */
  group: 'main' | 'advanced' | 'hidden';
  /** false → changing it resets the scene. */
  live: boolean;
  visibleIf?: (p: Params) => boolean;
}

export interface SelectParam extends ParamBase {
  kind: 'select';
  default: string;
  options: { value: string; label: Msg }[];
}

export interface NumberParam extends ParamBase {
  kind: 'number';
  default: number;
  unit?: string;
  /**
   * select: discrete presets (`choices`). slider: continuous quantity (`min`, `max`, `step`).
   * stepper: integer-like count changed by ±step (`min`, `max`, `step`).
   */
  control: 'select' | 'slider' | 'stepper';
  choices?: number[];
  min?: number;
  max?: number;
  step?: number;
}

export interface ToggleParam extends ParamBase {
  kind: 'toggle';
  default: boolean;
}

export interface ArrayParam extends ParamBase {
  kind: 'array';
  default: number[];
  min: number;
  max: number;
}

export type ParamSpec = SelectParam | NumberParam | ToggleParam | ArrayParam;
export type ParamSchema<P extends Params> = { [K in keyof P]: ParamSpec };

// ---------------------------------------------------------------- time, world

export interface TimeSpec {
  /** Fixed physics step [sim s]. */
  h: number;
  /** Push a history sample every k physics steps. */
  recordEvery: number;
  /** Sim seconds advanced by the step button. */
  frameStep: number;
  /** Auto-pause at this sim time; may depend on parameters (e.g. a flight time). */
  tEnd?: number | ((p: Params) => number);
  /** Rolling plot window [sim s] when there is no tEnd. */
  window?: number;
  /** Sim seconds per wall second at 1x (default 1). */
  scale?: number;
  /** Display unit of sim time (default 's'), e.g. 'ps' or '10³ y'; may depend on parameters. '' hides the clock. */
  unit?: string | ((p: Params) => string);
}

/** Display unit of a scene's sim time. */
export function timeUnit(time: TimeSpec | undefined, p: Params): string {
  const u = time?.unit;
  return typeof u === 'function' ? u(p) : (u ?? 's');
}

export interface WorldSpec {
  x: [number, number];
  y: [number, number];
  /** contain: whole box visible; fit-x: x range fills the width, y centred. */
  aspect: 'contain' | 'fit-x';
  padPx?: number;
}

export interface UiState {
  /** Current simulation time. */
  t: number;
  /** Time shown by the shared cursor (equals t unless scrubbing). */
  cursorT: number;
  scrubbing: boolean;
  lecture: boolean;
}

export interface SceneCtx<P extends Params> {
  readonly params: P;
  set<K extends keyof P>(key: K, value: P[K]): void;
}

// ---------------------------------------------------------------- plots

export interface TangentOverlay {
  kind: 'tangent';
  channel: string;
  /** Channel holding the exact slope of `channel`. */
  slopeChannel: string;
  role: Role;
  unit: string;
  /** Plot/channel whose value equals the slope (gets a marker). */
  target?: { plot: string; channel: string };
}

export interface AreaOverlay {
  kind: 'area';
  channel: string;
  role: Role;
  unit: string;
  /** Rich-text symbol of the accumulated quantity, e.g. 'Δ*v*'. */
  symbol: string;
  /** Exact signed area over [t0, t1]; trapezoid rule on samples if absent. */
  area?: (p: Params, t0: number, t1: number) => number;
  /** Plot/channel whose change equals the area (gets a bar). */
  target?: { plot: string; channel: string };
}

export type Overlay = TangentOverlay | AreaOverlay;

export interface PlotSpec<P extends Params> {
  id: string;
  /** TeX label, e.g. 'x\\,(\\mathrm{m})'. */
  label: string;
  traces: { channel: string; role: Role }[];
  yRange: (p: P) => [number, number];
  overlays?: (p: P) => Overlay[];
}

export interface ReadoutSpec<S, P extends Params> {
  /** TeX symbol. */
  label: string;
  unit: string;
  value: (s: S, p: P) => number;
  sig?: number;
  /** Values below this print as 0 (default 1e-9); 0 keeps tiny values such as 10⁻³⁴ m. */
  zeroTol?: number;
}

export interface PlotHandle<P extends Params> {
  plot: string;
  count: (p: P) => number;
  /** Handle position in plot coordinates (t, y). */
  pos: (p: P, i: number) => [number, number];
  onDrag: (ctx: SceneCtx<P>, i: number, t: number, y: number) => void;
  when?: (p: P) => boolean;
}

export interface Handle<S, P extends Params> {
  pos: (s: S, p: P) => Vec2;
  radiusPx: number;
  onDrag: (ctx: SceneCtx<P>, s: S, w: Vec2) => void;
  when?: (p: P) => boolean;
}

export interface InfoSpec {
  goals: Msg[];
  observe: Msg[];
  /** TeX, display style. */
  equations?: string[];
  assumptions?: Msg[];
}

// ---------------------------------------------------------------- scene, page

export interface Scene<P extends Params = any, S extends { t: number } = any> {
  id: string;
  title: Msg;
  /** side: stage left, plots right. stack: stage strip on top, plots below. */
  layout?: 'side' | 'stack';
  params: ParamSchema<P>;
  world: (p: P) => WorldSpec;
  /** Absent → static scene: no clock, no play controls; reset restores default parameters. */
  time?: TimeSpec;
  init: (p: P, rng: Rng) => S;
  step?: (s: S, h: number, p: P) => void;
  /** Must contain 't' and every channel used by plots. Defaults to { t }. */
  record?: (s: S, p: P) => Record<string, number>;
  /** Enables scrubbing on the stage. */
  snapshot?: (s: S) => S;
  draw: (g: Draw, s: S, p: P, ui: UiState) => void;
  plots?: PlotSpec<P>[];
  readouts?: ReadoutSpec<S, P>[];
  handles?: Handle<S, P>[];
  plotHandles?: PlotHandle<P>[];
  drawPlot?: (plotId: string, pd: PlotDraw, p: P, ui: UiState) => void;
  /** TeX for an outlined, user-resizable panel at the top-left of the stage. */
  overlay?: (s: S, p: P) => string;
  info: InfoSpec;
}

export interface SimPage {
  chapter: number;
  scenes: Scene[];
  i18n: { ko: Record<string, string>; en: Record<string, string> };
}
