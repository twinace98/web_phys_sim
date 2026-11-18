// Static equilibrium (target Ch 12) and its limit: a ladder against a frictionless wall on a rough
// floor, with a climber drawn as a point mass M at distance d along the ladder. Before play (or with
// the sliders) it is the static problem: all forces at their points of application, the lever arms
// about the foot as dimension lines, and a gauge of the friction used, f / μs N. Play: M climbs at
// speed v; at d = d_c the friction needed reaches μs N and the ladder slips (one degree of freedom θ,
// kinetic friction μk N at the foot) until the top leaves the wall or the ladder lies flat.
import { fmt } from '../../../core/format';
import { tn, tp } from '../../../core/tex';
import type { ParamSchema, Scene, Vec2, WorldSpec } from '../../../core/types';
import type { Draw } from '../../../draw/draw';
import { theme } from '../../../draw/theme';
import { LabelLayout } from '../../ch03/labels';
import { sigFit } from '../../ch07/sigfit';
import {
  G,
  advanceRun,
  criticalAngle,
  criticalPosition,
  equilibrium,
  mechEnergy,
  runToEnd,
  slipForces,
  startRun,
  type LadderInput,
  type RunInput,
  type RunState,
} from './physics';

const DEG = Math.PI / 180;
/** Ladder length [m]. */
export const L = 5;
const TH_MIN = 20;
const TH_MAX = 85;
/** Run step [s]; the slip is integrated with RK4 substeps of H / 8. */
export const H = 1 / 120;
/** Longest force arrow [m]; shorter scale (1 m per 400 N) when everything fits. */
const ARROW_MAX = 2.2;
const K0 = 1 / 400;
/** Radius of the point mass M [m] (at least R_PX px). */
const R_M = 0.22;
const R_PX = 11;

const WEIGHT = '#CC79A7';
const NORMAL = '#9E4F80';
const FRICTION = '#CC79A7';
const LADDER = '#5c5c5c';
const DIM = '#5c5c5c';
const GHOST = '#9a9a9a';
const GROUND = '#f2f2f2';
const INK = '#1a1a1a';

type P = { theta: number; d: number; m: number; M: number; mu: number; kr: number; v: number; crit: boolean };
type S = RunState;

/** Static problem with the climber at d (default: the slider value). */
export const input = (p: P, d = p.d): LadderInput => ({ theta: p.theta * DEG, L, d, m: p.m, M: p.M, mu: p.mu });

export const runInput = (p: P): RunInput => ({ theta: p.theta * DEG, L, m: p.m, M: p.M, mu: p.mu, muk: p.kr * p.mu, d0: p.d, v: p.v });

const params: ParamSchema<P> = {
  theta: { kind: 'number', label: 'ladder.p.theta', desc: 'ladder.d.theta', group: 'main', live: false, control: 'slider', min: TH_MIN, max: TH_MAX, step: 1, default: 60, unit: '°' },
  d: { kind: 'number', label: 'ladder.p.d', desc: 'ladder.d.d', group: 'main', live: false, control: 'slider', min: 0, max: L, step: 0.05, default: 1, unit: 'm' },
  v: { kind: 'number', label: 'ladder.p.v', desc: 'ladder.d.v', group: 'advanced', live: false, control: 'slider', min: 0.1, max: 1, step: 0.05, default: 0.5, unit: 'm/s' },
  m: { kind: 'number', label: 'ladder.p.m', desc: 'ladder.d.m', group: 'advanced', live: false, control: 'slider', min: 1, max: 40, step: 1, default: 10, unit: 'kg' },
  M: { kind: 'number', label: 'ladder.p.M', desc: 'ladder.d.M', group: 'advanced', live: false, control: 'slider', min: 0, max: 150, step: 1, default: 70, unit: 'kg' },
  mu: { kind: 'number', label: 'ladder.p.mu', desc: 'ladder.d.mu', group: 'advanced', live: false, control: 'slider', min: 0, max: 1, step: 0.01, default: 0.4 },
  kr: { kind: 'number', label: 'ladder.p.kr', desc: 'ladder.d.kr', group: 'advanced', live: false, control: 'slider', min: 0, max: 0.95, step: 0.05, default: 0.8 },
  crit: { kind: 'toggle', label: 'ladder.p.crit', desc: 'ladder.d.crit', group: 'advanced', live: true, default: true },
};

const world = (): WorldSpec => ({ x: [-6.5, 1.0], y: [-1.35, 7.75], aspect: 'contain', padPx: 12 });

// ---------------------------------------------------------------- run bookkeeping

const endCache = new Map<string, number>();

/**
 * End of the run on the step grid [s]: the step in which the climb or the slip ends (cached); at
 * least 1 s, so a run with nothing to show (no climber, or M already at the top) keeps a normal clock.
 */
export function endTime(p: P): number {
  const q = runInput(p);
  const key = JSON.stringify(q);
  let t = endCache.get(key);
  if (t === undefined) {
    t = Math.max(1, runToEnd(q, H).t);
    if (endCache.size > 200) endCache.clear();
    endCache.set(key, t);
  }
  return t;
}

/** Onset time of the slip for a climb from d0 at v, from the closed form for d_c (null: no slip). */
export function onsetTime(p: P): number | null {
  const dc = criticalPosition({ theta: p.theta * DEG, L, m: p.m, M: p.M, mu: p.mu });
  if (dc <= p.d) return 0;
  if (p.M <= 0 || dc > L) return null;
  return (dc - p.d) / p.v;
}

interface Forces {
  N: number;
  Fw: number;
  /** Friction the floor actually exerts [N]. */
  f: number;
  /** Friction static equilibrium would need [N] (= f unless the static problem fails). */
  fNeed: number;
  /** f / μs N for the gauge (needed friction in the static view; may exceed 1). */
  ratio: number;
  /** Static problem fails (shown before the first step). */
  over: boolean;
  /** θ'' [rad/s²] (0 in the static view). */
  alpha: number;
}

/** Forces on the ladder in the state s: static equilibrium while climbing, Newton's laws while slipping. */
export function forcesAt(s: S, p: P): Forces {
  if (s.phase === 'climb' || s.tSlip === null) {
    const e = equilibrium(input(p, s.d));
    return { N: e.N, Fw: e.Fw, f: Math.min(e.f, e.fmax), fNeed: e.f, ratio: e.ratio, over: e.slips, alpha: 0 };
  }
  const muk = p.kr * p.mu;
  const sf = slipForces({ L, m: p.m, M: p.M, d: s.d }, muk, s.th, s.om);
  const Fw = Math.max(0, sf.Fw);
  const fmax = p.mu * sf.N;
  return { N: sf.N, Fw, f: sf.f, fNeed: sf.f, ratio: fmax > 0 ? sf.f / fmax : 0, over: false, alpha: sf.alpha };
}

// ---------------------------------------------------------------- drawing helpers

type Align = 'left' | 'right' | 'center';

const add = (a: Vec2, b: Vec2, k = 1): Vec2 => ({ x: a.x + b.x * k, y: a.y + b.y * k });

interface Geo {
  u: Vec2;
  n: Vec2;
  A: Vec2;
  T: Vec2;
  C: Vec2;
  Pp: Vec2;
}

/** Ladder at angle th [rad] with the top on the wall (x = 0), M at d. */
function geoAt(th: number, d: number): Geo {
  const c = Math.cos(th);
  const s = Math.sin(th);
  const A = { x: -L * c, y: 0 };
  const u = { x: c, y: s };
  return { u, n: { x: -s, y: c }, A, T: { x: 0, y: L * s }, C: add(A, u, L / 2), Pp: add(A, u, d) };
}

const geoOf = (s: S): Geo => geoAt(s.th, s.d);

/** Horizontal dimension line from x0 to x1 at height y, end ticks, label under it. */
function dimH(g: Draw, lay: LabelLayout, x0: number, x1: number, y: number, label: string): void {
  if (Math.abs(x1 - x0) < g.px(3)) return;
  const t = g.px(4);
  g.line({ x: x0, y }, { x: x1, y }, { color: DIM, width: 1 });
  g.line({ x: x0, y: y - t }, { x: x0, y: y + t }, { color: DIM, width: 1 });
  g.line({ x: x1, y: y - t }, { x: x1, y: y + t }, { color: DIM, width: 1 });
  lay.seg({ x: x0, y }, { x: x1, y });
  const [px, py] = lay.px({ x: (x0 + x1) / 2, y });
  lay.place([{ x: px, y: py + 11 * theme.scale, align: 'center' }], label, DIM, 12);
}

/** Vertical dimension line from y0 to y1 at x, label to its left. */
function dimV(g: Draw, lay: LabelLayout, x: number, y0: number, y1: number, label: string): void {
  const t = g.px(4);
  g.line({ x, y: y0 }, { x, y: y1 }, { color: DIM, width: 1 });
  g.line({ x: x - t, y: y0 }, { x: x + t, y: y0 }, { color: DIM, width: 1 });
  g.line({ x: x - t, y: y1 }, { x: x + t, y: y1 }, { color: DIM, width: 1 });
  lay.seg({ x, y: y0 }, { x, y: y1 });
  const [px, py] = lay.px({ x, y: (y0 + y1) / 2 });
  lay.place([{ x: px - 7 * theme.scale, y: py, align: 'right' }], label, DIM, 12);
}

/** Dimension line along the ladder from the foot to M (offset to the upper side), label d. */
function dimAlong(g: Draw, lay: LabelLayout, geo: Geo, d: number, off: number): void {
  if (d < g.px(14)) return;
  const { A, u, n } = geo;
  const p0 = add(A, n, off);
  const p1 = add(p0, u, d);
  const t = g.px(4);
  g.line(p0, p1, { color: DIM, width: 1 });
  g.line(add(p0, n, -t), add(p0, n, t), { color: DIM, width: 1 });
  g.line(add(p1, n, -t), add(p1, n, t), { color: DIM, width: 1 });
  lay.seg(p0, p1);
  // Label beside the line, on the side away from the ladder (screen y points down).
  const k = 9 * theme.scale;
  const cands = [0.5, 0.32, 0.68, 0.18, 0.82].map((f) => {
    const [qx, qy] = lay.px(add(p0, u, f * d));
    return { x: qx + n.x * k, y: qy - n.y * k, align: 'right' as Align };
  });
  lay.place(cands, '*d*', DIM, 13);
}

function drawLadder(g: Draw, A: Vec2, u: Vec2, n: Vec2, col: string, alpha = 1): void {
  const w = 0.09;
  for (const side of [1, -1]) g.line(add(A, n, side * w), add(add(A, u, L), n, side * w), { color: col, width: 2, alpha });
  for (let t = 0.35; t < L - 0.1; t += 0.4) g.line(add(add(A, u, t), n, w), add(add(A, u, t), n, -w), { color: col, width: 1.25, alpha });
}

/** The climber as a point mass: a circle centred on the ladder at d, labelled M. Returns its radius [m]. */
function drawMass(g: Draw, at: Vec2): number {
  const r = Math.max(R_M, g.px(R_PX));
  g.circle(at, r / g.px(1), { color: INK, width: 1.75, fill: '#ffffff' });
  g.text(at, '*M*', { size: 13, color: INK, align: 'center', baseline: 'middle' });
  return r;
}

/**
 * Gauge of the friction used, f / μs N; overflow past 100 % drawn hatched-dashed. `peak`: static
 * friction has reached μs N (the slip started), marked by a notch at 100 %.
 */
function drawGauge(g: Draw, lay: LabelLayout, ratio: number, peak: boolean): void {
  const x0 = -6.15;
  const w = 2.4;
  const y0 = 6.95;
  const h = 0.26;
  const box = (a: number, b: number): Vec2[] => [
    { x: x0 + a * w, y: y0 },
    { x: x0 + b * w, y: y0 },
    { x: x0 + b * w, y: y0 + h },
    { x: x0 + a * w, y: y0 + h },
  ];
  const r = Number.isFinite(ratio) ? ratio : Infinity;
  const fill = Math.min(1, r);
  if (fill > 0) g.polygon(box(0, fill), { fill: FRICTION, fillAlpha: 0.55 });
  g.polygon(box(0, 1), { color: DIM, width: 1.25 });
  if (r > 1 + 1e-9) {
    const over = Math.min(r, 1.3);
    g.polygon(box(1, over), { fill: FRICTION, fillAlpha: 0.18, color: FRICTION, width: 1.25, dash: [3, 3] });
  }
  for (const f of [0.25, 0.5, 0.75]) g.line({ x: x0 + f * w, y: y0 }, { x: x0 + f * w, y: y0 + g.px(4) }, { color: DIM, width: 1 });
  if (peak) {
    const xp = x0 + w;
    const yt = y0 + h + g.px(2);
    g.polygon(
      [
        { x: xp, y: yt },
        { x: xp - g.px(5), y: yt + g.px(8) },
        { x: xp + g.px(5), y: yt + g.px(8) },
      ],
      { fill: INK },
    );
    g.line({ x: xp, y: y0 }, { x: xp, y: y0 + h }, { color: INK, width: 2.5 });
  }
  g.text({ x: x0, y: y0 + h }, '*f* / *μ*_{s}*N*', { size: 13, color: DIM, align: 'left', baseline: 'bottom', dy: -5 });
  lay.seg({ x: x0, y: y0 + h / 2 }, { x: x0 + 1.3 * w, y: y0 + h / 2 });
  const txt = Number.isFinite(r) ? `${fmt(r * 100, 3)} %` : '∞';
  const xEnd = x0 + Math.max(1, Math.min(r, 1.3)) * w;
  const hot = r > 1 - 1e-9;
  g.text({ x: xEnd, y: y0 + h / 2 }, txt, { size: 13, color: hot ? FRICTION : INK, align: 'left', baseline: 'middle', dx: 8, weight: hot ? 600 : 400 });
}

const nf = (v: number, sig = 3) => fmt(v, sig).replace('−', '-');

export const ladderScene: Scene<P, S> = {
  id: 'ladder',
  title: 'ladder.scene.ladder',
  params,
  world,
  time: { h: H, recordEvery: 4, frameStep: 0.1, tEnd: (p) => endTime(p as P) },
  init: (p) => startRun(runInput(p)),
  step: (s, h, p) => advanceRun(s, h, runInput(p)),
  snapshot: (s) => ({ ...s }),

  draw: (g, s, p) => {
    const q = input(p, s.d);
    const F = forcesAt(s, p);
    const geo = geoOf(s);
    const { u, n, A, T, C, Pp } = geo;
    const e0 = equilibrium(input(p));
    const k = Math.min(K0, ARROW_MAX / Math.max(e0.N, e0.Fw, 1));
    const moving = s.phase !== 'climb' && s.tSlip !== null;

    // Ground and wall.
    g.polygon(
      [
        { x: -6.5, y: 0 },
        { x: 0, y: 0 },
        { x: 0, y: -1.35 },
        { x: -6.5, y: -1.35 },
      ],
      { fill: GROUND },
    );
    g.polygon(
      [
        { x: 0, y: -1.35 },
        { x: 0.45, y: -1.35 },
        { x: 0.45, y: 7.75 },
        { x: 0, y: 7.75 },
      ],
      { fill: GROUND },
    );
    g.line({ x: -6.5, y: 0 }, { x: 0, y: 0 }, { color: LADDER, width: 1.5 });
    g.line({ x: 0, y: 0 }, { x: 0, y: 7.75 }, { color: LADDER, width: 1.5 });

    // Lines of action and lever arms about the foot (labels placed with the others below).
    const lay = new LabelLayout(g);
    const seg = (p0: Vec2, p1: Vec2) => lay.seg(p0, p1);
    const yMg = -0.42;
    const yP = -0.88;
    const xW = A.x - 0.62;
    const ext = (p0: Vec2, p1: Vec2) => {
      g.line(p0, p1, { color: GHOST, width: 1, dash: [3, 3] });
      seg(p0, p1);
    };
    ext(C, { x: C.x, y: yMg - g.px(6) });
    ext(A, { x: A.x, y: yP - g.px(6) });
    if (p.M > 0) ext(Pp, { x: Pp.x, y: yP - g.px(6) });
    ext(T, { x: xW - g.px(6), y: T.y });
    dimH(g, lay, A.x, C.x, yMg, '(*L*/2) cos *θ*');
    if (p.M > 0) dimH(g, lay, A.x, Pp.x, yP, '*d* cos *θ*');
    dimV(g, lay, xW, 0, T.y, '*L* sin *θ*');
    seg({ x: -6.5, y: 0 }, { x: 0, y: 0 });
    seg({ x: 0, y: 0 }, { x: 0, y: 7.75 });

    // Where the foot stood before the slip.
    if (moving) {
      const x0 = -L * Math.cos(p.theta * DEG);
      g.line({ x: x0, y: 0 }, { x: x0, y: g.px(-9) }, { color: INK, width: 1.5 });
      seg({ x: x0, y: 0 }, { x: x0, y: g.px(-9) });
    }

    // Critical state: the ladder at θc for the current d.
    const thc = criticalAngle(q);
    let ghost: [Vec2, Vec2] | null = null;
    if (p.crit && thc > TH_MIN * DEG * 0.5 && thc < 89 * DEG && Math.abs(thc - s.th) > 0.5 * DEG) {
      ghost = [{ x: -L * Math.cos(thc), y: 0 }, { x: 0, y: L * Math.sin(thc) }];
      g.line(ghost[0], ghost[1], { color: GHOST, width: 1.25, dash: [7, 5] });
      seg(ghost[0], ghost[1]);
    }

    drawLadder(g, A, u, n, LADDER);
    for (const side of [1, -1]) seg(add(A, n, side * 0.09), add(T, n, side * 0.09));
    g.arc(A, 30, 0, s.th, { color: DIM, width: 1.25 });

    // Highest position the friction can hold at the starting angle.
    let dcAt: Vec2 | null = null;
    if (p.crit && p.M > 0) {
      const dc = criticalPosition({ theta: p.theta * DEG, L, m: p.m, M: p.M, mu: p.mu });
      if (dc >= 0 && dc <= L) {
        dcAt = add(A, u, dc);
        g.line(add(dcAt, n, 0.3), add(dcAt, n, -0.3), { color: INK, width: 2 });
        seg(add(dcAt, n, 0.3), add(dcAt, n, -0.3));
      }
    }

    // The climber: point mass M on the ladder at d, with its distance along the ladder.
    let rM = 0;
    if (p.M > 0) {
      dimAlong(g, lay, geo, s.d, 0.48);
      rM = drawMass(g, Pp);
      const rr = rM * 1.05;
      seg({ x: Pp.x - rr, y: Pp.y - rr }, { x: Pp.x + rr, y: Pp.y + rr });
      seg({ x: Pp.x - rr, y: Pp.y + rr }, { x: Pp.x + rr, y: Pp.y - rr });
    }

    // Forces on the ladder at their points of application.
    // Weights (forces at a distance) dashed, contact forces solid, as in every free-body diagram.
    const arrow = (from: Vec2, vec: Vec2, col: string, field = false) => {
      g.arrow(from, vec, { color: col, width: 2.5, dash: field ? [5, 3] : undefined });
      seg(from, add(from, vec));
    };
    const mgTip = add(C, { x: 0, y: -p.m * G * k });
    arrow(C, { x: 0, y: -p.m * G * k }, WEIGHT, true);
    // The weight of M acts on the ladder at d: that arrow ends on the circle.
    const MgTail = add(Pp, { x: 0, y: rM + p.M * G * k });
    if (p.M > 0) arrow(MgTail, { x: 0, y: -p.M * G * k }, WEIGHT, true);
    const Ntip = add(A, { x: 0, y: F.N * k });
    if (F.N * k > g.px(2)) arrow(A, { x: 0, y: F.N * k }, NORMAL);
    const Fwtip = add(T, { x: -F.Fw * k, y: 0 });
    if (F.Fw * k > g.px(2)) arrow(T, { x: -F.Fw * k, y: 0 }, NORMAL);
    if (F.f * k > g.px(2)) arrow(A, { x: F.f * k, y: 0 }, FRICTION);
    if (F.over) {
      // Friction needed beyond μs N: dashed, the part the floor cannot supply.
      const from = add(A, { x: F.f * k, y: 0 });
      g.line(from, add(A, { x: F.fNeed * k, y: 0 }), { color: FRICTION, width: 1.75, dash: [4, 4] });
      seg(from, add(A, { x: F.fNeed * k, y: 0 }));
    }
    const offWall = s.phase === 'done' && s.end === 'wall';
    if (offWall) g.circle(T, 5, { color: NORMAL, width: 1.75, fill: '#ffffff' });
    drawGauge(g, lay, F.ratio, moving);

    // Labels: each at the first candidate spot clear of the drawing and the labels before it.
    const at = (w: Vec2, offs: [number, number, Align][]) => {
      const [x, y] = lay.px(w);
      return offs.map(([dx, dy, align]) => ({ x: x + dx * theme.scale, y: y + dy * theme.scale, align }));
    };
    lay.place(at(Ntip, [[0, -12, 'center'], [-8, -4, 'right'], [8, -4, 'left']]), '*N*', NORMAL, 14);
    const fwOffs: [number, number, Align][] = [[-9, 0, 'right'], [0, -12, 'center'], [0, 13, 'center'], [-9, -12, 'right'], [-9, 12, 'right'], [24, -12, 'center'], [24, 13, 'center'], [-30, -12, 'right']];
    lay.place(at(Fwtip, fwOffs), offWall ? '*F*_{w} = 0' : '*F*_{w}', NORMAL, 14);
    const fMid = add(A, { x: Math.max(F.f * k, g.px(10)) / 2, y: 0 });
    lay.place(at(fMid, [[0, 13, 'center'], [0, -11, 'center'], [10, 13, 'center']]), '*f*', FRICTION, 14);
    lay.place(at(mgTip, [[7, -4, 'left'], [-7, -4, 'right'], [0, 12, 'center'], [7, 8, 'left'], [-7, 8, 'right'], [-16, 2, 'right'], [16, 2, 'left'], [0, 24, 'center']]), '*m**g*', WEIGHT, 14);
    if (p.M > 0) lay.place(at(MgTail, [[7, 4, 'left'], [0, -11, 'center'], [-7, 4, 'right'], [7, 16, 'left'], [-7, 16, 'right']]), '*M**g*', WEIGHT, 14);
    const mid = s.th / 2;
    lay.place(
      [42, 52, 64].flatMap((r) => at(A, [[r * Math.cos(mid), -r * Math.sin(mid), 'center']])),
      '*θ*',
      DIM,
      13,
    );
    if (ghost) {
      const [g0, g1] = ghost;
      const nc = { x: -(g1.y - g0.y), y: g1.x - g0.x };
      const nl = Math.hypot(nc.x, nc.y);
      const cands = [0.62, 0.75, 0.5, 0.86, 0.38].flatMap((f) => {
        const q0 = { x: g0.x + (g1.x - g0.x) * f, y: g0.y + (g1.y - g0.y) * f };
        return [1, -1].flatMap((side) => at(q0, [[(side * 12 * nc.x) / nl, (-side * 12 * nc.y) / nl, side > 0 ? 'right' : 'left']]));
      });
      lay.place(cands, '*θ*_{c}', GHOST, 13);
    }
    if (dcAt) {
      const e0 = add(dcAt, n, -0.3);
      const e1 = add(dcAt, n, 0.3);
      lay.place([...at(e0, [[6, 6, 'left'], [6, -2, 'left'], [0, 12, 'center']]), ...at(e1, [[-6, -6, 'right'], [0, -11, 'center']])], '*d*_{c}', INK, 13);
    }
  },

  handles: [
    {
      // M: dragged along the ladder (resets the run at the new start position).
      pos: (s) => geoOf(s).Pp,
      radiusPx: 20,
      when: (p) => p.M > 0,
      onDrag: (ctx, _s, w) => {
        const { A, u } = geoAt(ctx.params.theta * DEG, 0);
        const t = (w.x - A.x) * u.x + (w.y - A.y) * u.y;
        const d = Math.round(Math.min(L, Math.max(0, t)) / 0.05) * 0.05;
        const v = Number(d.toFixed(2));
        if (v !== ctx.params.d) ctx.set('d', v);
      },
    },
    {
      // The top: slides along the wall and sets the angle.
      pos: (s) => geoOf(s).T,
      radiusPx: 16,
      onDrag: (ctx, _s, w) => {
        const sin = Math.min(Math.sin(TH_MAX * DEG), Math.max(Math.sin(TH_MIN * DEG), w.y / L));
        const th = Math.round(Math.asin(sin) / DEG);
        if (th !== ctx.params.theta) ctx.set('theta', th);
      },
    },
  ],

  readouts: [
    { label: 'd', unit: 'm', value: (s) => s.d },
    { label: '\\theta', unit: '°', value: (s) => s.th / DEG },
    { label: 'F_w', unit: 'N', value: (s, p) => forcesAt(s, p).Fw },
    { label: 'f/\\mu_s N', unit: '%', value: (s, p) => forcesAt(s, p).ratio * 100 },
  ],

  formula: (s, p) => {
    const F = forcesAt(s, p);
    if (s.phase === 'climb' || s.tSlip === null) {
      const q = input(p, s.d);
      const e = equilibrium(q);
      const thc = criticalAngle(q);
      const dc = criticalPosition({ theta: p.theta * DEG, L, m: p.m, M: p.M, mu: p.mu });
      const ts = onsetTime(p);
      // Inputs of each line with enough figures that their arithmetic gives the printed result.
      const mg = p.m * G;
      const Mg = p.M * G;
      const sw = sigFit([mg, e.armMg, Mg, e.armPerson, e.armWall], (a, b, c, d, w) => (a * b + c * d) / w, e.Fw);
      const sn = sigFit([e.N], (n) => p.mu * n, e.fmax);
      const lines = [
        `\\sum\\tau_\\text{foot}:\\ F_w L\\sin\\theta = mg\\tfrac{L}{2}\\cos\\theta + Mg\\,d\\cos\\theta`,
        `F_w = \\frac{(${tn(mg, sw)})(${tn(e.armMg, sw)}) + (${tn(Mg, sw)})(${tn(e.armPerson, sw)})}{${tn(e.armWall, sw)}} = ${nf(e.Fw)}\\ \\text{N}`,
        `f = F_w = ${nf(e.f)}\\ \\text{N} ${e.slips ? '>' : '\\le'} \\mu_s N = (${nf(p.mu, 2)})(${tn(e.N, sn)}) = ${nf(e.fmax)}\\ \\text{N}`,
      ];
      // μs = 0: no friction holds any lean, so the fraction would have a zero denominator.
      const num = p.m / 2 + (p.M * s.d) / L;
      const den = p.mu * (p.m + p.M);
      const sc = sigFit([num, den], (a, b) => Math.atan2(a, b) / DEG, thc / DEG);
      const thcLine =
        p.mu > 0
          ? `\\tan\\theta_c = \\frac{m/2 + Md/L}{\\mu_s(m+M)} = \\frac{${tn(num, sc)}}{${tn(den, sc)}},\\ \\theta_c = ${nf(thc / DEG)}^\\circ`
          : `\\mu_s = 0:\\ \\mu_s N = 0 < F_w\\ (\\theta < 90^\\circ),\\ \\theta_c = 90^\\circ`;
      if (p.M > 0 && Number.isFinite(dc)) {
        const st = ts !== null && ts > 0 ? sigFit([dc, p.d], (a, b) => (a - b) / p.v, ts) : 3;
        lines.push(`d_c = \\frac{L}{M}\\left[\\mu_s(m+M)\\tan\\theta - \\frac{m}{2}\\right] = ${tn(dc, st)}\\ \\text{m}${dc > L ? ' > L' : ''}`);
        lines.push(ts !== null && ts > 0 ? `t_s = \\frac{d_c - d_0}{v} = \\frac{${tn(dc, st)} - ${tn(p.d, st)}}{${nf(p.v, 2)}} = ${nf(ts)}\\ \\text{s}` : thcLine);
      } else lines.push(thcLine);
      return lines;
    }
    const b = { L, m: p.m, M: p.M, d: s.d };
    const E = mechEnergy(b, s.th, s.om);
    // μk = (μk/μs) μs exactly as computed (0.32, 0.3145), N with the figures the product needs.
    const muk = Number((p.kr * p.mu).toFixed(4));
    const sk = sigFit([F.N], (n) => muk * n, F.f);
    const se = sigFit([s.E0, E], (a, c) => a - c, s.E0 - E, 3, 4);
    return [
      `f = \\mu_k N = (${muk})(${tn(F.N, sk)}\\ \\text{N}) = ${nf(F.f)}\\ \\text{N}`,
      `F_w = ${nf(F.Fw)}\\ \\text{N},\\ \\ddot\\theta = ${nf(F.alpha)}\\ \\text{rad/s}^2`,
      `\\theta = ${nf(s.th / DEG)}^\\circ,\\ \\dot\\theta = ${nf(s.om)}\\ \\text{rad/s},\\ t - t_s = ${nf((s.tStop ?? s.t) - s.tSlip, 3)}\\ \\text{s}`,
      `E_0 - E = ${tn(s.E0, se)} - ${tp(E, se)} = ${nf(s.E0 - E)}\\ \\text{J} = W_f = ${nf(s.W)}\\ \\text{J}`,
    ];
  },

  info: {
    goals: ['ladder.goal.cond', 'ladder.goal.pivot', 'ladder.goal.limit', 'ladder.goal.slip'],
    observe: ['ladder.obs.drag', 'ladder.obs.climb', 'ladder.obs.onset', 'ladder.obs.slip', 'ladder.obs.angle', 'ladder.obs.crit', 'ladder.obs.over', 'ladder.obs.arms'],
    equations: [
      '\\textstyle\\sum F_x = f - F_w = 0, \\quad \\sum F_y = N - (m+M)g = 0',
      '\\textstyle\\sum\\tau_\\text{foot} = F_w L\\sin\\theta - mg\\,\\tfrac{L}{2}\\cos\\theta - Mg\\,d\\cos\\theta = 0',
      'f \\le \\mu_s N \\iff \\tan\\theta \\ge \\frac{m/2 + Md/L}{\\mu_s(m+M)} = \\tan\\theta_c',
      'f \\le \\mu_s N \\iff d \\le d_c = \\frac{L}{M}\\left[\\mu_s(m+M)\\tan\\theta - \\frac{m}{2}\\right]',
      '(m+M)\\ddot x_\\text{cm} = f - F_w,\\quad (m+M)\\ddot y_\\text{cm} = N - (m+M)g',
      'I_\\text{cm}\\ddot\\theta = \\textstyle\\sum\\tau_\\text{cm},\\quad f = \\mu_k N',
    ],
    assumptions: ['ladder.asm.wall', 'ladder.asm.body', 'ladder.asm.climb', 'ladder.asm.kinetic', 'ladder.asm.wallleave', 'ladder.asm.scale'],
  },
};
