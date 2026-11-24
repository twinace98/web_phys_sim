// Dot and cross products (target Ch 3): two vectors with draggable tips (a blue, b orange, as in
// Ch 3), the projection or the parallelogram, and beside the plane (under it on narrow screens) a
// plot of the product and of its factor (projection b cos φ or height b sin φ) against the angle φ,
// whose point can be dragged too. The dot tab adds a rectangle a × (b cos φ) whose area is a·b; the
// cross tab draws the rectangle a × (b sin φ) on the plane, sheared from the parallelogram.
import { fmt, fmtTick } from '../../../core/format';
import { ZERO, fmtCmp, readBack, reproduces, sigCancel, slider, tn, tnCancel, texOf } from '../../../core/tex';
import type { NumberParam, ParamSchema, Role, Scene, SceneCtx, SelectParam, Vec2, WorldSpec } from '../../../core/types';
import type { Draw } from '../../../draw/draw';
import { theme } from '../../../draw/theme';
import { type Box, LabelLayout } from '../../ch03/labels';
import { Inset, type Rect } from '../../inset/inset';
import { across, along, angleBetween, crossZ, dot, mag, placeTip, project, rotateTo, shearRect, signedAngle, type V2 } from './physics';

const DEG = Math.PI / 180;
const GREY = '#5c5c5c';
const DASH = '#9a9a9a';
const GRID_COLOR = '#ececec';
const PLOT_FG = '#1a1a1a';

const narrow = () => typeof window !== 'undefined' && window.matchMedia('(max-width: 767px)').matches;

/**
 * Plane of half-width `half` around the origin (axes to `axis`), plot beside it (desktop) or
 * under it (narrow), in world units of the plane.
 */
interface Layout {
  lim: number;
  axis: number;
  half: number;
  /** A panel for the product rectangle beside the plot (dot tab). */
  box: boolean;
}

const DOT: Layout = { lim: 5, axis: 5.6, half: 6.1, box: true };
/** Cross product: both vectors and their sum (the far corner of the parallelogram) stay in view. */
const CROSS: Layout = { lim: 4.5, axis: 9.6, half: 10.1, box: false };

/** Plot rectangle and, for the dot tab, the panel of the product rectangle (world units). */
export function panels(L: Layout): { plot: Rect; box: Rect | null } {
  const h = L.half;
  if (narrow()) {
    return L.box
      ? { plot: { x0: -0.74 * h, y0: -2.14 * h, x1: 0.24 * h, y1: -1.24 * h }, box: { x0: 0.4 * h, y0: -2.34 * h, x1: 0.98 * h, y1: -1.14 * h } }
      : { plot: { x0: -0.72 * h, y0: -2.05 * h, x1: 0.92 * h, y1: -1.3 * h }, box: null };
  }
  return L.box
    ? { plot: { x0: 1.33 * h, y0: -0.62 * h, x1: 2.33 * h, y1: 0.62 * h }, box: { x0: 2.5 * h, y0: -0.75 * h, x1: 3.1 * h, y1: 0.75 * h } }
    : { plot: { x0: 1.42 * h, y0: -0.62 * h, x1: 2.85 * h, y1: 0.62 * h }, box: null };
}

function world(L: Layout): WorldSpec {
  const h = L.half;
  return narrow() ? { x: [-h, h], y: [(L.box ? -2.44 : -2.38) * h, h], aspect: 'contain', padPx: 10 } : { x: [-h, (L.box ? 3.12 : 3.0) * h], y: [-h, h], aspect: 'contain', padPx: 12 };
}

const P = (v: V2, k = 1): Vec2 => ({ x: v[0] * k, y: v[1] * k });
const O: Vec2 = { x: 0, y: 0 };
/** The two vectors from their component sliders. */
type Comps = { ax: number; ay: number; bx: number; by: number };
const vecA = (p: Comps): V2 => [p.ax, p.ay];
const vecB = (p: Comps): V2 => [p.bx, p.by];

/** Unit grid and the x, y axes (Ch 3 style), inside the plane. */
function drawPlane(g: Draw, L: Layout): void {
  const n = Math.floor(L.axis);
  for (let k = -n; k <= n; k++) {
    g.line({ x: k, y: -L.axis }, { x: k, y: L.axis }, { color: GRID_COLOR, width: 1 });
    g.line({ x: -L.axis, y: k }, { x: L.axis, y: k }, { color: GRID_COLOR, width: 1 });
  }
  const step = L.axis > 7 ? 4 : 2;
  for (const [e, nrm, name] of [
    [{ x: 1, y: 0 }, { x: 0, y: 1 }, '*x*'],
    [{ x: 0, y: 1 }, { x: 1, y: 0 }, '*y*'],
  ] as const) {
    g.arrow({ x: -e.x * L.axis, y: -e.y * L.axis }, { x: 2 * e.x * L.axis, y: 2 * e.y * L.axis }, { role: 'axis', width: 1.25 });
    g.text({ x: e.x * (L.axis + g.px(14)), y: e.y * (L.axis + g.px(14)) }, name, { size: 15, color: GREY, align: 'center', baseline: 'middle' });
    for (let k = -n; k <= n; k++) {
      if (k === 0) continue;
      const b = { x: e.x * k, y: e.y * k };
      g.line({ x: b.x - nrm.x * g.px(3), y: b.y - nrm.y * g.px(3) }, { x: b.x + nrm.x * g.px(3), y: b.y + nrm.y * g.px(3) }, { role: 'axis', width: 1 });
      if (k % step === 0) g.text({ x: b.x - nrm.x * g.px(13), y: b.y - nrm.y * g.px(13) }, fmtTick(k), { size: 10, color: DASH, align: 'center', baseline: 'middle' });
    }
  }
}

/** Tick labels of the axes as obstacles for the label layout. */
function tickObstacles(lay: LabelLayout, g: Draw, L: Layout): void {
  const n = Math.floor(L.axis);
  const step = L.axis > 7 ? 4 : 2;
  for (let k = -n; k <= n; k++) {
    if (k === 0 || k % step !== 0) continue;
    for (const p of [
      { x: k, y: -g.px(13) },
      { x: -g.px(13), y: k },
    ]) {
      const [qx, qy] = lay.px(p);
      lay.boxes.push(lay.box(fmtTick(k), qx, qy, 'center', 10));
    }
  }
  lay.seg({ x: -L.axis, y: 0 }, { x: L.axis, y: 0 });
  lay.seg({ x: 0, y: -L.axis }, { x: 0, y: L.axis });
  // Axis names x, y beyond the arrowheads.
  for (const p of [
    { x: L.axis + g.px(14), y: 0 },
    { x: 0, y: L.axis + g.px(14) },
  ]) {
    const [qx, qy] = lay.px(p);
    lay.boxes.push(lay.box('*x*', qx, qy, 'center', 15));
  }
}

/** The full line through the origin along u, clipped to the axis square. */
function lineThrough(u: V2, L: Layout): [Vec2, Vec2] | null {
  const m = mag(u);
  if (m < 1e-9) return null;
  const ux = u[0] / m;
  const uy = u[1] / m;
  const t = Math.min(Math.abs(ux) > 1e-9 ? L.axis / Math.abs(ux) : Infinity, Math.abs(uy) > 1e-9 ? L.axis / Math.abs(uy) : Infinity);
  return [
    { x: -ux * t, y: -uy * t },
    { x: ux * t, y: uy * t },
  ];
}

/** Small right-angle mark at `at` between directions u and w (unit, world), `s` px. */
function rightAngle(g: Draw, at: Vec2, u: Vec2, w: Vec2, s = 8): void {
  const d = g.px(s);
  const p1 = { x: at.x + u.x * d, y: at.y + u.y * d };
  const p2 = { x: p1.x + w.x * d, y: p1.y + w.y * d };
  const p3 = { x: at.x + w.x * d, y: at.y + w.y * d };
  g.polyline([p1, p2, p3], { color: DASH, width: 1 });
}

const unit = (v: Vec2): Vec2 => {
  const m = Math.hypot(v.x, v.y);
  return m > 1e-12 ? { x: v.x / m, y: v.y / m } : { x: 0, y: 0 };
};

/** Faint disc marking a draggable tip; under the arrow so it never hides the head. */
const halo = (g: Draw, at: Vec2, role: Role) => g.circle(at, 14, { fill: role, alpha: 0.13 });

/** Arc of the angle from a to b (signed), arrowhead at b's end when `head`; φ label on the bisector. */
function angleArc(g: Draw, lay: LabelLayout, a: V2, phi: number, label: string, head: boolean): void {
  const th = Math.atan2(a[1], a[0]);
  const r = 30;
  g.arc(O, r, phi >= 0 ? th : th + phi, phi >= 0 ? th + phi : th, { color: GREY, width: 1.25 });
  if (head && Math.abs(phi) > 12 * DEG) {
    // Short arrow tangent to the arc, ending where the arc meets b.
    const e = th + phi;
    const tip = { x: Math.cos(e) * g.px(r), y: Math.sin(e) * g.px(r) };
    const s = Math.sign(phi);
    const tan = { x: -Math.sin(e) * s, y: Math.cos(e) * s };
    const back = g.px(7);
    g.arrow({ x: tip.x - tan.x * back, y: tip.y - tan.y * back }, { x: tan.x * back, y: tan.y * back }, { color: GREY, width: 1.25 });
  }
  // On the bisector when there is room; else just outside the wedge, beside a or beside b; else
  // farther out along the bisector.
  const mid = th + phi / 2;
  const sg = phi >= 0 ? 1 : -1;
  const near = Math.abs(phi) < 35 * DEG ? [58, 72] : [46, 58];
  const spots: [number, number][] = [
    ...near.map((d): [number, number] => [mid, d]),
    [th - sg * 22 * DEG, 46],
    [th + phi + sg * 22 * DEG, 46],
    [th - sg * 22 * DEG, 60],
    [th + phi + sg * 22 * DEG, 60],
    ...[90, 110, 130].map((d): [number, number] => [mid, d]),
    ...[52, 68, 86].flatMap((d): [number, number][] => [
      [mid + 30 * DEG, d],
      [mid - 30 * DEG, d],
    ]),
  ];
  const [ox, oy] = lay.px(O);
  placeIn(
    g,
    lay,
    canvasBox(g),
    spots.map(([ang, d]) => {
      const c = Math.cos(ang);
      return { x: ox + c * d * theme.scale, y: oy - Math.sin(ang) * d * theme.scale, align: c > 0.35 ? ('left' as const) : c < -0.35 ? ('right' as const) : ('center' as const) };
    }),
    [label],
    GREY,
    13,
    70,
  );
}

/**
 * Component sliders (settings drawer), the way to set the vectors without dragging: 0.01 steps, the
 * grid the tips land on when dragged (and the plot point when it turns b).
 */
const compParam = (key: keyof Comps, lim: number, def: number): NumberParam => ({
  kind: 'number',
  label: `products.p.${key}`,
  desc: `products.d.${key}`,
  group: 'advanced',
  live: true,
  control: 'slider',
  min: -lim,
  max: lim,
  step: 0.01,
  default: def,
});
const compParams = (lim: number): ParamSchema<Comps> => ({ ax: compParam('ax', lim, 4), ay: compParam('ay', lim, 1), bx: compParam('bx', lim, 1), by: compParam('by', lim, 3) });

const dragParam: SelectParam = {
  kind: 'select',
  label: 'products.p.drag',
  desc: 'products.d.drag',
  group: 'main',
  live: true,
  default: 'smooth',
  options: [
    { value: 'smooth', label: 'products.drag.smooth' },
    { value: 'snap', label: 'products.drag.snap' },
  ],
};

/**
 * φ [deg] as the stage arc, the readout and Σ print it (R8): 3 figures, more where 3 would hide on
 * which side of the zero of the line's trig function the angle lies (R6): 90° for cos φ in the dot
 * tab (90.003°, not 90.0°, next to a negative a·b), ±180° for sin φ in the cross tab.
 */
export const phiDotText = (deg: number): string => fmtCmp(deg, 90);
export const phiCrossText = (deg: number): string => fmtCmp(deg, deg < 0 ? -180 : 180);
/** Magnitude, 3 significant figures, in parentheses (products written as juxtaposition). */
const mg = (v: number) => `(${tn(v)})`;

/**
 * Σ line of the factor M trig φ (b cos φ in the dot tab, b sin φ in the cross tab) with its printed
 * result `fac`. Near a zero of the trig function (cos at 90°, sin at 0° and ±180°) the printed angle
 * needs enough figures for M trig φ to reproduce the result (R5b): the readout string when it does,
 * else up to CANCEL_SIG figures; where even those do not, the line takes the component route,
 * factor = product / base, which does not cancel. A result printed as 0 allows ZERO × M.
 */
export function factorLine(o: {
  lhs: string;
  M: number;
  phiDeg: number;
  phiText: string;
  trig: 'cos' | 'sin';
  fac: string;
  prodTex: string;
  prod: number;
  base: string;
  L: number;
}): string {
  const f = o.trig === 'cos' ? Math.cos : Math.sin;
  const m = readBack(tn(o.M));
  const zero = ZERO * o.M;
  const ok = (t: string) => reproduces(m * f(readBack(t) * DEG), o.fac, zero);
  let ang = texOf(o.phiText);
  if (!ok(ang)) {
    const t = tnCancel(o.phiDeg, sigCancel((r) => m * f(r(o.phiDeg) * DEG), o.fac, zero));
    if (ok(t)) ang = t;
    else if (o.L > 1e-9) return `${o.lhs} = \\frac{${o.prodTex}}{${o.base}} = \\frac{${tn(o.prod)}}{${tn(o.L)}} = ${o.fac}`;
  }
  const trig = o.trig === 'cos' ? `\\cos ${ang}^\\circ` : `\\sin(${ang}^\\circ)`;
  return `${o.lhs} = ${mg(o.M)}${trig} = ${o.fac}`;
}

/**
 * Translucent band of `widthPx` from p to q with square ends, so its drawn length is exactly |pq|
 * (the projection or the height, as on the plane).
 */
function band(g: Draw, p: Vec2, q: Vec2, widthPx: number, role: Role, alpha: number): void {
  const d = Math.hypot(q.x - p.x, q.y - p.y);
  if (d < 1e-12) return;
  const w = g.px(widthPx / 2);
  const n = { x: (-(q.y - p.y) / d) * w, y: ((q.x - p.x) / d) * w };
  g.polygon(
    [
      { x: p.x + n.x, y: p.y + n.y },
      { x: q.x + n.x, y: q.y + n.y },
      { x: q.x - n.x, y: q.y - n.y },
      { x: p.x - n.x, y: p.y - n.y },
    ],
    { fill: role, fillAlpha: alpha },
  );
}

/** Diagonal hatching of the axis-aligned world rectangle (a negative area). */
function hatch(g: Draw, x0: number, y0: number, x1: number, y1: number, stepPx = 6): void {
  const [l, r] = x0 < x1 ? [x0, x1] : [x1, x0];
  const [b, t] = y0 < y1 ? [y0, y1] : [y1, y0];
  const st = g.px(stepPx);
  // Lines y = x + c across the rectangle.
  for (let c = b - r + st / 2; c < t - l; c += st) {
    const xa = Math.max(l, b - c);
    const xb = Math.min(r, t - c);
    if (xb > xa) g.line({ x: xa, y: xa + c }, { x: xb, y: xb + c }, { color: GREY, width: 1, alpha: 0.6 });
  }
}

/** Canvas-px box of a world rectangle, `m` px inside. */
function pxBox(lay: LabelLayout, r: Rect, m = 0): Box {
  const [x0, y0] = lay.px({ x: r.x0, y: r.y1 });
  const [x1, y1] = lay.px({ x: r.x1, y: r.y0 });
  const d = m * theme.scale;
  return { x0: x0 + d, y0: y0 + d, x1: x1 - d, y1: y1 - d };
}

const inside = (b: Box, c: Box) => b.x0 >= c.x0 && b.x1 <= c.x1 && b.y0 >= c.y0 && b.y1 <= c.y1;

type Spot = { x: number; y: number; align: 'left' | 'right' | 'center' };

/** The whole canvas in canvas px. */
function canvasBox(g: Draw): Box {
  const c = g.ctx.canvas;
  return { x0: 0, y0: 0, x1: c.clientWidth || 1e6, y1: c.clientHeight || 1e6 };
}

/**
 * Label at the first spot (canvas px, baseline middle) that stays inside `clip` and clears every
 * obstacle, else at the clear spot nearest to the first one on a grid within `reach` px of it;
 * texts are tried in order (full, then short). If nothing is clear, the full text at
 * the least obstructed spot, crossing lines rather than other labels. Returns its box.
 */
function placeIn(g: Draw, lay: LabelLayout, clip: Box, spots: Spot[], texts: string[], col: Role | string, size = 12, reach = 90, back = false): Box {
  const k = theme.scale;
  const put = (s: Spot, text: string, b: Box): Box => {
    lay.boxes.push(b);
    if (back) {
      // White backing, so the label stays legible over hatching.
      const c = g.ctx;
      c.save();
      c.fillStyle = 'rgba(255,255,255,0.9)';
      c.fillRect(b.x0, b.y0, b.x1 - b.x0, b.y1 - b.y0);
      c.restore();
    }
    g.screenText(s.x / k, s.y / k, text, { size, color: col, align: s.align, baseline: 'middle' });
    return b;
  };
  // Grid around the first spot (centred boxes), nearest first.
  const { x: ax, y: ay } = spots[0];
  const grid: Spot[] = [];
  const R = reach * k;
  for (let dy = -R; dy <= R; dy += 5 * k) for (let dx = -R; dx <= R; dx += 6 * k) grid.push({ x: ax + dx, y: ay + dy, align: 'center' });
  grid.sort((p, q) => Math.hypot(p.x - ax, p.y - ay) - Math.hypot(q.x - ax, q.y - ay));
  let best: { s: Spot; b: Box; c: number } | null = null;
  for (const text of texts) {
    for (const s of spots) {
      const b = lay.box(text, s.x, s.y, s.align, size);
      const c = lay.cost(b) + (inside(b, clip) ? 0 : 1000);
      if (c === 0) return put(s, text, b);
      if (text === texts[0] && (!best || c < best.c)) best = { s, b, c };
    }
    for (const s of grid) {
      const b = lay.box(text, s.x, s.y, s.align, size);
      if (inside(b, clip) && lay.cost(b) === 0) return put(s, text, b);
    }
  }
  const { s, b } = best!;
  return put(s, texts[0], b);
}

/**
 * Spots beside the segment p→q (as LabelLayout.beside): at fractions `along` of its length, `d` px
 * out along the normal, the side of `prefer` (a world direction) first; then off either end.
 */
function besideSpots(lay: LabelLayout, p: Vec2, q: Vec2, prefer: Vec2, dists: number[], along: number[]): Spot[] {
  const [x0, y0] = lay.px(p);
  const [x1, y1] = lay.px(q);
  const len = Math.hypot(x1 - x0, y1 - y0);
  if (len < 1e-6) return [{ x: x0, y: y0, align: 'center' }];
  let nx = -(y1 - y0) / len;
  let ny = (x1 - x0) / len;
  if (nx * prefer.x - ny * prefer.y < 0) {
    nx = -nx;
    ny = -ny;
  }
  const ux = (x1 - x0) / len;
  const uy = (y1 - y0) / len;
  const k = theme.scale;
  const out: Spot[] = [];
  const add = (x: number, y: number, ox: number, oy: number, d: number) =>
    out.push({ x: x + ox * d * k, y: y + oy * d * k, align: ox > 0.35 ? 'left' : ox < -0.35 ? 'right' : 'center' });
  for (const d of dists) {
    for (const side of [1, -1]) for (const f of along) add(x0 + (x1 - x0) * f, y0 + (y1 - y0) * f, side * nx, side * ny, d);
    const D = Math.SQRT1_2;
    for (const side of [1, -1]) {
      add(x1, y1, D * (ux + side * nx), D * (uy + side * ny), d);
      add(x0, y0, D * (-ux + side * nx), D * (-uy + side * ny), d);
    }
  }
  return out;
}

/** World rectangle as an obstacle box (canvas px). */
function blockRect(lay: LabelLayout, r: Rect, m = 0): void {
  lay.boxes.push(pxBox(lay, r, -m));
}

/** Spots on rings of radii `rs` px around canvas (x, y): right, left, below, above, then diagonals. */
function ring(x: number, y: number, rs: number[]): Spot[] {
  const k = theme.scale;
  const dirs = [0, 180, -90, 90, -35, 145, 35, -145].map((d) => (d * Math.PI) / 180);
  const out: Spot[] = [];
  for (const r of rs)
    for (const t of dirs) {
      const c = Math.cos(t);
      out.push({ x: x + c * r * k, y: y - Math.sin(t) * r * k * (Math.abs(c) < 0.35 ? 0.8 : 1), align: c > 0.35 ? 'left' : c < -0.35 ? 'right' : 'center' });
    }
  return out;
}

/** Spots around a bar tip at canvas (x, y): beside it (preferred side first), then beyond the tip. */
function tipSpots(x: number, y: number, up: boolean, preferRight: boolean): Spot[] {
  const k = theme.scale;
  const out = up ? -1 : 1;
  const sides = preferRight ? [1, -1] : [-1, 1];
  const spots: Spot[] = [];
  for (const dy of [0, out * 12, -out * 12, out * 22, -out * 24, -out * 36])
    for (const sd of sides) spots.push({ x: x + sd * 10 * k, y: y + dy * k, align: sd > 0 ? 'left' : 'right' });
  for (const dy of [16, 28, 42]) for (const dx of [0, 30, -30]) spots.push({ x: x + dx * k, y: y + out * dy * k, align: 'center' });
  return spots;
}

/** What the plot shows: the product and its factor against φ, with the current values. */
interface PlotSpec {
  xt: number[];
  /** Product (black) and factor (projection or height, translucent band), φ in radians. */
  f: (phi: number) => number;
  fh: (phi: number) => number;
  /** Current φ [deg] and values. */
  phi: number;
  y: number;
  yh: number;
  role: Role;
  prod: string;
  fac: string;
}

/** Symmetric y range: a "nice" bound at or above v (at least 1). */
export function niceBound(v: number): number {
  const w = Math.max(v, 1) * 1.05;
  const p = 10 ** Math.floor(Math.log10(w));
  for (const m of [1, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10]) if (m * p >= w) return m * p;
  return 10 * p;
}

/** Plot y bound: both the product ab and the factor (at most b) fit. */
export const plotBound = (ab: number, fac: number) => niceBound(Math.max(ab, fac));

export interface PlotBars {
  /** Data → world bars of the current factor and product (from the zero line). */
  fac: [Vec2, Vec2];
  prod: [Vec2, Vec2];
}

/** The two bars at the current φ, in world units (exported for tests). */
export function plotBars(ins: Inset, sp: Pick<PlotSpec, 'phi' | 'y' | 'yh'>): PlotBars {
  return { fac: [ins.P(sp.phi, 0), ins.P(sp.phi, sp.yh)], prod: [ins.P(sp.phi, 0), ins.P(sp.phi, sp.y)] };
}

/**
 * Plot frame, the factor curve as a translucent band (as on the plane) and the product curve in
 * black on one numeric axis, so the product bar is a times the factor bar; the bars and values at
 * the current φ. `marks` are extra boxes the labels avoid (⊙, ⊗).
 */
function drawPlot(g: Draw, ins: Inset, sp: PlotSpec, marks: Box[] = []): void {
  const [y0, y1] = ins.yr;
  ins.frame({ xTicks: sp.xt, yTicks: [y0, 0, y1], xFmt: (v) => `${fmtTick(v)}°`, yFmt: (v) => fmtTick(v), xLabel: '*φ*' });
  g.line(ins.P(ins.xr[0], 0), ins.P(ins.xr[1], 0), { color: DASH, width: 1, dash: [3, 4] });
  for (const x of sp.xt) if (x !== ins.xr[0]) g.line(ins.P(x, y0), ins.P(x, y1), { color: GRID_COLOR, width: 1 });
  const N = 120;
  const pts: [number, number][] = [];
  const ptsH: [number, number][] = [];
  for (let i = 0; i <= N; i++) {
    const x = ins.xr[0] + ((ins.xr[1] - ins.xr[0]) * i) / N;
    pts.push([x, sp.f(x * DEG)]);
    ptsH.push([x, sp.fh(x * DEG)]);
  }
  ins.curve(ptsH, { role: sp.role, width: 6, alpha: 0.3 });
  ins.curve(pts, { color: PLOT_FG, width: 2 });
  const bars = plotBars(ins, sp);
  band(g, bars.fac[0], bars.fac[1], 9, sp.role, 0.55);
  g.line(bars.prod[0], bars.prod[1], { color: PLOT_FG, width: 2 });
  g.circle(bars.fac[1], 3.5, { fill: sp.role, color: '#ffffff', width: 1 });
  ins.dot(sp.phi, sp.y, PLOT_FG, 5.5);

  // Labels inside the plot, clear of the curves, bars, zero line and each other.
  const lay = new LabelLayout(g);
  lay.polyline(pts.map(([x, y]) => ins.P(x, y)));
  lay.polyline(ptsH.map(([x, y]) => ins.P(x, y)));
  lay.seg(ins.P(ins.xr[0], 0), ins.P(ins.xr[1], 0));
  lay.seg(bars.prod[0], bars.prod[1]);
  lay.seg(bars.fac[0], bars.fac[1]);
  lay.boxes.push(...marks);
  for (const [p, r] of [
    [bars.prod[1], 8],
    [bars.fac[1], 5],
  ] as const) {
    const [x, y] = lay.px(p);
    const d = r * theme.scale;
    lay.boxes.push({ x0: x - d, y0: y - d, x1: x + d, y1: y + d });
  }
  const clip = pxBox(lay, ins.r, 2);
  const right = (sp.phi - ins.xr[0]) / (ins.xr[1] - ins.xr[0]) < 0.5;
  const v = (x: number) => fmt(x, 3);
  const [px, py] = lay.px(bars.prod[1]);
  placeIn(g, lay, clip, tipSpots(px, py, sp.y >= 0, right), [`${sp.prod} = ${v(sp.y)}`, v(sp.y)], PLOT_FG);
  const [hx, hy] = lay.px(bars.fac[1]);
  placeIn(g, lay, clip, tipSpots(hx, hy, sp.yh >= 0, right), [`${sp.fac} = ${v(sp.yh)}`, v(sp.yh)], sp.role);
}

// ------------------------------------------------------------------ dot product

type PD = Comps & { proj: string; drag: string };

const dotParams: ParamSchema<PD> = {
  proj: {
    kind: 'select',
    label: 'products.p.proj',
    desc: 'products.d.proj',
    group: 'main',
    live: true,
    default: 'b',
    options: [
      { value: 'b', label: 'products.proj.b' },
      { value: 'a', label: 'products.proj.a' },
    ],
  },
  drag: dragParam,
  ...compParams(DOT.lim),
};

/**
 * The dot product split as (length of the base vector) × (projection of the other on it): with the
 * default "b onto a", base a and factor b cos φ; with "a onto b", base b and factor a cos φ.
 */
export function dotSplit(p: PD) {
  const a = vecA(p);
  const b = vecB(p);
  const onA = p.proj !== 'a';
  const base = onA ? a : b;
  const other = onA ? b : a;
  return {
    a,
    b,
    onA,
    base,
    other,
    L: mag(base),
    fac: along(other, base),
    d: dot(a, b),
    baseRole: (onA ? 'position' : 'energyU') as Role,
    role: (onA ? 'energyU' : 'position') as Role,
    baseName: onA ? '*a*' : '*b*',
    facName: onA ? '*b* cos *φ*' : '*a* cos *φ*',
  };
}

const dotInset = (g: Draw, p: PD) => {
  const { a, b, other } = dotSplit(p);
  return new Inset(g, panels(DOT).plot, [0, 180], [-plotBound(mag(a) * mag(b), mag(other)), plotBound(mag(a) * mag(b), mag(other))]);
};

/**
 * Product rectangle (world units): the base vector's length along the zero line from (x0, ym), the
 * factor upwards (downwards when negative), both at `k` world units per unit, so its signed area is
 * k² × (a·b).
 */
export function dotBox(g: Draw, p: PD): { x0: number; ym: number; x1: number; y1: number; k: number } | null {
  const r = panels(DOT).box!;
  const { L, fac } = dotSplit(p);
  if (L < 1e-9) return null;
  // Fixed scale for lengths up to lim (components typed into the URL may give longer vectors).
  const M = Math.max(DOT.lim, L, Math.abs(fac));
  const k = Math.min((r.x1 - r.x0) / M, ((r.y1 - r.y0) / 2 - g.px(24)) / M);
  const ym = (r.y0 + r.y1) / 2;
  return { x0: r.x0, ym, x1: r.x0 + L * k, y1: ym + fac * k, k };
}

/**
 * The "× a" picture: a rectangle whose width is the base vector's length (its colour) and whose
 * height is the projection (translucent band, as on the plane); area = a·b. Negative projection:
 * below the line, hatched.
 */
function drawDotBox(g: Draw, p: PD): void {
  const bx = dotBox(g, p);
  if (!bx) return;
  const sp = dotSplit(p);
  const { x0, ym, x1, y1 } = bx;
  const r = panels(DOT).box!;
  const pos = y1 >= ym;
  const corners = [
    { x: x0, y: ym },
    { x: x1, y: ym },
    { x: x1, y: y1 },
    { x: x0, y: y1 },
  ];
  if (Math.abs(y1 - ym) > 1e-12) {
    g.polygon(corners, { fill: 'fg', fillAlpha: pos ? 0.1 : 0.04 });
    if (!pos) hatch(g, x0, ym, x1, y1);
    g.polyline([corners[1], corners[2], corners[3]], { color: GREY, width: 1 });
  }
  band(g, { x: x0, y: ym }, { x: x0, y: y1 }, 9, sp.role, 0.55);
  g.line({ x: x0, y: ym }, { x: x1, y: ym }, { role: sp.baseRole, width: 3 });

  const lay = new LabelLayout(g);
  lay.seg(corners[0], corners[1]);
  lay.seg(corners[1], corners[2]);
  lay.seg(corners[2], corners[3]);
  lay.seg(corners[3], corners[0]);
  const clip = pxBox(lay, { x0: r.x0 - g.px(6), y0: r.y0, x1: r.x1 + g.px(10), y1: r.y1 });
  const k = theme.scale;
  const [ax, ay] = lay.px({ x: (x0 + x1) / 2, y: ym });
  const [bx0, by0] = lay.px({ x: x0, y: ym });
  const [, by1] = lay.px({ x: x0, y: y1 });
  const out = pos ? 1 : -1; // canvas direction away from the rectangle (down when it stands up)
  // Base name on the empty side of the line.
  placeIn(g, lay, clip, [{ x: ax, y: ay + out * 12 * k, align: 'center' }, { x: bx0, y: ay + out * 12 * k, align: 'left' }], [sp.baseName], sp.baseRole, 13);
  // Factor name beyond the band's end, or beside it.
  const bm = (by0 + by1) / 2;
  placeIn(
    g,
    lay,
    clip,
    [
      { x: bx0 - 2 * k, y: by1 - out * 11 * k, align: 'left' },
      { x: bx0 + 9 * k, y: bm, align: 'left' },
      { x: bx0 - 2 * k, y: by1 - out * 24 * k, align: 'left' },
      { x: bx0 + 8 * k, y: ay + out * 28 * k, align: 'left' },
    ],
    [sp.facName],
    sp.role,
    13,
  );
  // Area = product, inside when it fits, else beside the rectangle.
  const [cx, cy] = lay.px({ x: (x0 + x1) / 2, y: (ym + y1) / 2 });
  const [rx] = lay.px({ x: x1, y: ym });
  const txt = `*a*·*b* = ${fmt(sp.d, 3)}`;
  placeIn(
    g,
    lay,
    clip,
    [
      { x: cx + 3 * k, y: cy, align: 'center' },
      { x: rx + 6 * k, y: cy, align: 'left' },
      { x: cx, y: by1 - out * 26 * k, align: 'center' },
      { x: bx0, y: by1 - out * 26 * k, align: 'left' },
      { x: bx0, y: ay + out * 30 * k, align: 'left' },
      { x: bx0, y: by1 - out * 40 * k, align: 'left' },
    ],
    [txt],
    PLOT_FG,
    13,
    60,
    !pos,
  );
}

/** Set vector a or b (its two component sliders) to `next` where it changed. */
function setVec<Q extends Comps>(ctx: SceneCtx<Q>, which: 'a' | 'b', next: V2): void {
  const [kx, ky] = which === 'a' ? (['ax', 'ay'] as const) : (['bx', 'by'] as const);
  if (next[0] !== ctx.params[kx]) ctx.set(kx, next[0] as Q[typeof kx]);
  if (next[1] !== ctx.params[ky]) ctx.set(ky, next[1] as Q[typeof ky]);
}

function setTip<Q extends Comps & { drag: string }>(ctx: SceneCtx<Q>, which: 'a' | 'b', w: Vec2, lim: number): void {
  setVec(ctx, which, placeTip([w.x, w.y], ctx.params.drag === 'snap', lim));
}

export const dotScene: Scene<PD, { t: number }> = {
  id: 'dot',
  title: 'products.scene.dot',
  params: dotParams,
  world: () => world(DOT),
  init: () => ({ t: 0 }),

  draw: (g, _s, p) => {
    const sp = dotSplit(p);
    const { a, b, base, other, role } = sp;
    const la = mag(a);
    const lb = mag(b);
    const phi = signedAngle(a, b);
    drawPlane(g, DOT);
    const lay = new LabelLayout(g);
    tickObstacles(lay, g, DOT);
    const pan = panels(DOT);
    blockRect(lay, pan.plot, 20);
    blockRect(lay, pan.box!, 8);

    // Projection: the shadow of one vector on the (extended) line of the other.
    const line = lineThrough(base, DOT);
    if (line && mag(other) > 1e-9) {
      g.line(line[0], line[1], { color: DASH, width: 1, dash: [6, 5] });
      lay.seg(line[0], line[1]);
      const foot = P(project(other, base));
      const tipO = P(other);
      g.line(tipO, foot, { color: DASH, width: 1, dash: [4, 4] });
      lay.seg(tipO, foot);
      const fl = Math.hypot(foot.x, foot.y);
      const hl = Math.hypot(tipO.x - foot.x, tipO.y - foot.y);
      if (fl > g.px(10) && hl > g.px(10)) rightAngle(g, foot, unit({ x: -foot.x, y: -foot.y }), unit({ x: tipO.x - foot.x, y: tipO.y - foot.y }));
      if (fl > 1e-6) {
        band(g, O, foot, 8, role, 0.35);
        lay.seg(O, foot);
      }
    }
    halo(g, P(a), 'position');
    halo(g, P(b), 'energyU');
    g.arrow(O, P(a), { role: 'position', width: 2.5 });
    g.arrow(O, P(b), { role: 'energyU', width: 2.5 });
    lay.seg(O, P(a));
    lay.seg(O, P(b));

    if (la > 1e-9 && lb > 1e-9) angleArc(g, lay, a, phi, `*φ* = ${phiDotText(Math.abs(phi) / DEG)}°`, false);
    const D = [12, 20, 30, 42, 56];
    // Each vector's label on the side away from the other vector.
    const away = (v: V2, w: V2): Vec2 => {
      const n = { x: -v[1], y: v[0] };
      return crossZ(v, w) >= 0 ? { x: -n.x, y: -n.y } : n;
    };
    if (la > 1e-9) lay.beside(O, P(a), away(a, b), `*a* = ${fmt(la)}`, 'position', D);
    if (lb > 1e-9) lay.beside(O, P(b), away(b, a), `*b* = ${fmt(lb)}`, 'energyU', D);
    if (line && mag(other) > 1e-9) {
      const foot = P(project(other, base));
      if (Math.hypot(foot.x, foot.y) > g.px(14)) {
        // Shadow label (with its signed length) on the side of the line away from the projected vector's tip.
        const t = P(other);
        placeIn(g, lay, canvasBox(g), besideSpots(lay, O, foot, { x: foot.x - t.x, y: foot.y - t.y }, [12, 20, 30], [0.5, 0.3, 0.7, 0.9]), [`${sp.facName} = ${fmt(sp.fac)}`, fmt(sp.fac)], role, 14);
      }
    }

    const ins = dotInset(g, p);
    const L = sp.L;
    const m = mag(other);
    drawPlot(g, ins, {
      xt: [0, 90, 180],
      f: (x) => la * lb * Math.cos(x),
      fh: (x) => m * Math.cos(x),
      phi: Math.abs(phi) / DEG,
      y: sp.d,
      yh: L > 1e-9 ? sp.fac : 0,
      role,
      prod: '*a*·*b*',
      fac: sp.facName,
    });
    drawDotBox(g, p);
  },

  handles: [
    { pos: (_s, p) => P(vecA(p)), radiusPx: 18, onDrag: (ctx, _s, w) => setTip(ctx, 'a', w, DOT.lim) },
    { pos: (_s, p) => P(vecB(p)), radiusPx: 18, onDrag: (ctx, _s, w) => setTip(ctx, 'b', w, DOT.lim) },
    {
      // The plot point: dragging it along φ turns b about the origin (length kept, same side of a).
      pos: (_s, p) => {
        const { a, b, other } = dotSplit(p as PD);
        const r = panels(DOT).plot;
        const phi = angleBetween(a, b) / Math.PI;
        const yb = plotBound(mag(a) * mag(b), mag(other));
        return { x: r.x0 + phi * (r.x1 - r.x0), y: r.y0 + ((dot(a, b) + yb) / (2 * yb)) * (r.y1 - r.y0) };
      },
      radiusPx: 14,
      when: (p) => mag(vecA(p)) > 1e-9 && mag(vecB(p)) > 1e-9,
      onDrag: (ctx, _s, w) => {
        const a = vecA(ctx.params);
        const b = vecB(ctx.params);
        const r = panels(DOT).plot;
        const f = Math.min(1, Math.max(0, (w.x - r.x0) / (r.x1 - r.x0)));
        const side = crossZ(a, b) < 0 ? -1 : 1;
        const next = rotateTo(a, b, side * f * Math.PI);
        setVec(ctx, 'b', next);
      },
    },
  ],

  readouts: [
    { label: '\\varphi', unit: '°', value: (_s, p) => angleBetween(vecA(p), vecB(p)) / DEG, format: phiDotText },
    { label: '\\vec a\\cdot\\vec b', unit: '', value: (_s, p) => dot(vecA(p), vecB(p)), zeroTol: 1e-9 },
  ],

  formula: (_s, p) => {
    const { a, b, onA, d } = dotSplit(p);
    const la = mag(a);
    const lb = mag(b);
    const phi = angleBetween(a, b);
    // Components as their slider labels (R1), in parentheses (products written as juxtaposition).
    const c = (k: keyof Comps) => `(${slider(dotParams[k], p[k])})`;
    // Factor and base: b cos φ and a ("b onto a") or a cos φ and b ("a onto b").
    const [L, M, f, fl] = onA ? [la, lb, 'b\\cos\\varphi', 'a'] : [lb, la, 'a\\cos\\varphi', 'b'];
    const fac = M * Math.cos(phi);
    const phiDeg = phi / DEG;
    return [
      `\\vec a\\cdot\\vec b = ${fl}\\,(${f}) = a_x b_x + a_y b_y`,
      factorLine({ lhs: f, M, phiDeg, phiText: phiDotText(phiDeg), trig: 'cos', fac: tn(fac), prodTex: '\\vec a\\cdot\\vec b', prod: d, base: fl, L }),
      `${fl}\\,(${f}) = ${mg(L)}${mg(fac)} = ${tn(L * fac)}`,
      `a_x b_x + a_y b_y = ${c('ax')}${c('bx')} + ${c('ay')}${c('by')} = ${tn(d)}`,
    ];
  },

  info: {
    goals: ['products.dot.goal.proj', 'products.dot.goal.comp'],
    observe: ['products.dot.obs.drag', 'products.dot.obs.sign', 'products.dot.obs.perp', 'products.dot.obs.plot', 'products.dot.obs.box', 'products.dot.obs.panel'],
    equations: ['\\vec a\\cdot\\vec b = ab\\cos\\varphi = a\\,(b\\cos\\varphi) = b\\,(a\\cos\\varphi)', '\\vec a\\cdot\\vec b = a_x b_x + a_y b_y'],
    assumptions: ['products.dot.asm.plane'],
  },
};

// ------------------------------------------------------------------ cross product

type PC = Comps & { drag: string };

const crossParams: ParamSchema<PC> = {
  drag: dragParam,
  ...compParams(CROSS.lim),
};

const crossBound = (p: PC) => plotBound(mag(vecA(p)) * mag(vecB(p)), mag(vecB(p)));

const crossInset = (g: Draw, p: PC) => {
  const yb = crossBound(p);
  return new Inset(g, panels(CROSS).plot, [-180, 180], [-yb, yb]);
};

/** ⊙ (out of the page) or ⊗ (into it), `r` px. */
function zSymbol(g: Draw, at: Vec2, out: boolean, r = 11): void {
  g.circle(at, r, { fill: '#ffffff', color: PLOT_FG, width: 1.75 });
  if (out) g.circle(at, r * 0.28, { fill: PLOT_FG, color: PLOT_FG, width: 1 });
  else {
    const d = g.px(r * 0.68);
    g.line({ x: at.x - d, y: at.y - d }, { x: at.x + d, y: at.y + d }, { color: PLOT_FG, width: 1.75 });
    g.line({ x: at.x - d, y: at.y + d }, { x: at.x + d, y: at.y - d }, { color: PLOT_FG, width: 1.75 });
  }
}

export const crossScene: Scene<PC, { t: number }> = {
  id: 'cross',
  title: 'products.scene.cross',
  params: crossParams,
  world: () => world(CROSS),
  init: () => ({ t: 0 }),

  draw: (g, _s, p) => {
    const a = vecA(p);
    const b = vecB(p);
    const la = mag(a);
    const lb = mag(b);
    const phi = signedAngle(a, b);
    const cz = crossZ(a, b);
    const hs = across(b, a);
    const s: V2 = [a[0] + b[0], a[1] + b[1]];
    drawPlane(g, CROSS);
    const lay = new LabelLayout(g);
    tickObstacles(lay, g, CROSS);
    blockRect(lay, panels(CROSS).plot, 20);

    // Parallelogram: area |a × b|; dashed sides are the copies of a and b.
    g.polygon([O, P(a), P(s), P(b)], { fill: 'fg', fillAlpha: 0.08 });
    const line = lineThrough(a, CROSS);
    if (line && lb > 1e-9) {
      g.line(line[0], line[1], { color: DASH, width: 1, dash: [6, 5] });
      lay.seg(line[0], line[1]);
    }
    // Rectangle F, F + a, a + b, b: the triangle O, F, b cut off and moved by a, so the same base a
    // and height b sin φ (the band F → b) as the parallelogram: the same area a (b sin φ).
    const [rf, rfa, , rb] = shearRect(a, b).map((v) => P(v));
    const hl = Math.hypot(rb.x - rf.x, rb.y - rf.y);
    if (la > 1e-9 && hl > 1e-9) {
      g.polyline([rf, rfa, P(s)], { color: PLOT_FG, width: 1.25, dash: [2, 3] });
      lay.seg(rf, rfa);
      lay.seg(rfa, P(s));
    }
    g.line(P(a), P(s), { role: 'energyU', width: 1.25, dash: [5, 4] });
    g.line(P(b), P(s), { role: 'position', width: 1.25, dash: [5, 4] });
    lay.seg(P(a), P(s));
    lay.seg(P(b), P(s));

    // Height b sin φ: a translucent band perpendicular to a, from the foot F to b's tip (the dashed
    // perpendicular of the dot tab).
    if (la > 1e-9 && hl > 1e-6) {
      band(g, rf, rb, 8, 'energyU', 0.35);
      lay.seg(rf, rb);
      const fl = Math.hypot(rf.x, rf.y);
      if (hl > g.px(10)) rightAngle(g, rf, fl > g.px(10) ? unit({ x: -rf.x, y: -rf.y }) : unit({ x: -a[0], y: -a[1] }), unit({ x: rb.x - rf.x, y: rb.y - rf.y }));
    }

    halo(g, P(a), 'position');
    halo(g, P(b), 'energyU');
    g.arrow(O, P(a), { role: 'position', width: 2.5 });
    g.arrow(O, P(b), { role: 'energyU', width: 2.5 });
    lay.seg(O, P(a));
    lay.seg(O, P(b));

    // Direction of a × b (right-hand rule: curl from a to b) at the parallelogram's centre.
    const centre = P(s, 0.5);
    const big = Math.abs(cz) > 0.02 * Math.max(1e-9, la * lb) && Math.abs(cz) > 0.05;
    const [cx, cy] = lay.px(centre);
    if (big) {
      zSymbol(g, centre, cz > 0);
      const r = 13 * theme.scale;
      lay.boxes.push({ x0: cx - r, y0: cy - r, x1: cx + r, y1: cy + r });
    }

    if (la > 1e-9 && lb > 1e-9) angleArc(g, lay, a, phi, `*φ* = ${phiCrossText(phi / DEG)}°`, true);
    const D = [12, 20, 30, 42, 56];
    const away = (v: V2): Vec2 => {
      const m = P(v, 0.5);
      return { x: m.x - centre.x, y: m.y - centre.y };
    };
    if (la > 1e-9) lay.beside(O, P(a), away(a), `*a* = ${fmt(la)}`, 'position', D);
    if (lb > 1e-9) lay.beside(O, P(b), away(b), `*b* = ${fmt(lb)}`, 'energyU', D);
    if (la > 1e-9 && hl > g.px(14)) {
      // Height label (signed, as in the plot) beside the band, outside the rectangle (−a side) first.
      placeIn(g, lay, canvasBox(g), besideSpots(lay, rf, rb, { x: -a[0], y: -a[1] }, [12, 20, 30, 42, 56], [0.5, 0.3, 0.7, 0.15, 0.85]), [`*b* sin *φ* = ${fmt(hs)}`, fmt(hs)], 'energyU', 14);
    }
    if (la > 1e-9 && lb > 1e-9) {
      // Area of the parallelogram (= rectangle) beside the ⊙ / ⊗.
      const t = `|*a*×*b*| = ${fmt(Math.abs(cz))}`;
      placeIn(g, lay, canvasBox(g), ring(cx, cy, [17, 26, 36]), [t, fmt(Math.abs(cz))], PLOT_FG, 14, 60);
    }

    const ins = crossInset(g, p);
    // ⊙ inside the positive lobe (b counter-clockwise from a), ⊗ inside the negative one, at half
    // the height of the lower of the two curves, so clear of both.
    const ab = la * lb;
    const lo = Math.min(ab, lb);
    const marks: Box[] = [];
    if (lo > 0.3 * ins.yr[1]) {
      for (const [x, out] of [
        [-90, false],
        [90, true],
      ] as const) {
        const at = ins.P(x, (out ? 0.5 : -0.5) * lo);
        zSymbol(g, at, out, 7);
        const [mx, my] = g.vp.toPx(at.x, at.y);
        const r = 9 * theme.scale;
        marks.push({ x0: mx - r, y0: my - r, x1: mx + r, y1: my + r });
      }
    }
    drawPlot(
      g,
      ins,
      {
        xt: [-180, -90, 0, 90, 180],
        f: (x) => ab * Math.sin(x),
        fh: (x) => lb * Math.sin(x),
        phi: phi / DEG,
        y: cz,
        yh: la > 1e-9 ? hs : 0,
        role: 'energyU',
        prod: '(*a*×*b*)_{*z*}',
        fac: '*b* sin *φ*',
      },
      marks,
    );
  },

  handles: [
    { pos: (_s, p) => P(vecA(p)), radiusPx: 18, onDrag: (ctx, _s, w) => setTip(ctx, 'a', w, CROSS.lim) },
    { pos: (_s, p) => P(vecB(p)), radiusPx: 18, onDrag: (ctx, _s, w) => setTip(ctx, 'b', w, CROSS.lim) },
    {
      // The plot point: dragging it along φ turns b about the origin, length kept.
      pos: (_s, p) => {
        const a = vecA(p);
        const b = vecB(p);
        const r = panels(CROSS).plot;
        const yb = crossBound(p as PC);
        const f = (signedAngle(a, b) + Math.PI) / (2 * Math.PI);
        return { x: r.x0 + f * (r.x1 - r.x0), y: r.y0 + ((crossZ(a, b) + yb) / (2 * yb)) * (r.y1 - r.y0) };
      },
      radiusPx: 14,
      when: (p) => mag(vecA(p)) > 1e-9 && mag(vecB(p)) > 1e-9,
      onDrag: (ctx, _s, w) => {
        const a = vecA(ctx.params);
        const b = vecB(ctx.params);
        const r = panels(CROSS).plot;
        const f = Math.min(1, Math.max(0, (w.x - r.x0) / (r.x1 - r.x0)));
        const next = rotateTo(a, b, (2 * f - 1) * Math.PI);
        setVec(ctx, 'b', next);
      },
    },
  ],

  readouts: [
    { label: '\\varphi', unit: '°', value: (_s, p) => signedAngle(vecA(p), vecB(p)) / DEG, format: phiCrossText },
    { label: '(\\vec a\\times\\vec b)_z', unit: '', value: (_s, p) => crossZ(vecA(p), vecB(p)) },
  ],

  formula: (_s, p) => {
    const a = vecA(p);
    const b = vecB(p);
    const la = mag(a);
    const lb = mag(b);
    const phi = signedAngle(a, b);
    const cz = crossZ(a, b);
    const hs = lb * Math.sin(phi);
    // The zero vector only where (a × b)_z itself prints 0 (the readout's 10⁻⁹), never next to 0.00300.
    const dir = Math.abs(cz) < 1e-9 ? '\\vec 0' : `${tn(Math.abs(cz))}\\,${cz > 0 ? '\\hat k\\ (\\odot)' : '(-\\hat k)\\ (\\otimes)'}`;
    const c = (k: keyof Comps) => `(${slider(crossParams[k], p[k])})`;
    const phiDeg = phi / DEG;
    return [
      `(\\vec a\\times\\vec b)_z = a\\,(b\\sin\\varphi) = a_x b_y - a_y b_x`,
      factorLine({ lhs: 'b\\sin\\varphi', M: lb, phiDeg, phiText: phiCrossText(phiDeg), trig: 'sin', fac: tn(hs), prodTex: '(\\vec a\\times\\vec b)_z', prod: cz, base: 'a', L: la }),
      `a\\,(b\\sin\\varphi) = ${mg(la)}${mg(hs)} = ${tn(la * hs)}`,
      `a_x b_y - a_y b_x = ${c('ax')}${c('by')} - ${c('ay')}${c('bx')} = ${tn(cz)}`,
      `\\vec a\\times\\vec b = ${dir}`,
    ];
  },

  info: {
    goals: ['products.cross.goal.area', 'products.cross.goal.dir'],
    observe: ['products.cross.obs.drag', 'products.cross.obs.rect', 'products.cross.obs.rhr', 'products.cross.obs.par', 'products.cross.obs.anti', 'products.cross.obs.plot'],
    equations: ['(\\vec a\\times\\vec b)_z = ab\\sin\\varphi = a\\,(b\\sin\\varphi) = a_x b_y - a_y b_x', '\\lvert\\vec a\\times\\vec b\\rvert = ab\\,\\lvert\\sin\\varphi\\rvert', '\\vec b\\times\\vec a = -\\,\\vec a\\times\\vec b'],
    assumptions: ['products.cross.asm.sign'],
  },
};
