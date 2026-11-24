// Ch 11 scene: conservation of angular momentum, two systems seen from above.
//  - puck: a puck on a string through a hole in a frictionless table. Pulling the string in raises
//    ω so that L = m r² ω stays fixed; the string sweeps equal areas in equal times, and the stage
//    writes each area, measured from the shaded sector, next to the interval Δt.
//  - chair: a person on a spinning chair pulls two dumbbells in. I = I0 + 2 m r² drops, so
//    ω = L / I rises while L stays fixed.
// Both share the plots I(t), ω(t), L(t) and K(t).
import { fmt } from '../../core/format';
import { num, sigCancel, slider, tn, tnCancel, u } from '../../core/tex';
import type { ParamSchema, Scene, Vec2 } from '../../core/types';
import type { Draw } from '../../draw/draw';
import {
  angMom,
  chairInertia,
  chairKinetic,
  chairL,
  chairOmega,
  endTime,
  kinetic,
  omega,
  radius,
  stepAngle,
  stepChair,
  tension,
  type Chair,
  type Mode,
  type Pull,
} from './physics';
import { boxesOverlap, segHitsBox, type Seg } from '../ch03/labels';
import { boxHitsPoly, boxInPoly, Recorder, textBox, type Box } from './place';
import { theme } from '../../draw/theme';

type P = { sys: string; mode: string; arms: string; rIn: number; wOut: number; m: number; areas: boolean; mDb: number; wArms: number };

interface S {
  t: number;
  n: number;
  phi: number;
}

const RATE = 240;
const H = 1 / RATE;

// puck on a string
const R_OUT = 1;
const SECTORS = 6;
const T_MIN_PX = 30; // shortest tension arrow [px]; the puck (9 px radius) covers its base
const SECTOR_FILL = ['#E69F00', '#56B4E9'];

// spinning chair
const I0 = 1.5; // person and chair [kg·m²]
const ARM_OUT = 0.8;
const ARM_IN = 0.2;
const BODY = '#9a9a9a';
const KV = 0.3; // world m per (m/s)

const isChair = (p: P) => p.sys === 'chair';

const pullOf = (p: P): Pull => ({ mode: p.mode as Mode, m: p.m, rOut: R_OUT, rIn: p.rIn, wOut: p.wOut, tRamp: 3, tHold: 2 });
const chairOf = (p: P): Chair => ({ mode: p.arms as Mode, m: p.mDb, rOut: ARM_OUT, rIn: ARM_IN, wOut: p.wArms, tRamp: 2, tHold: 1.5, I0 });

/** Sector intervals [s]: whole numbers of physics steps, so each sector starts on a step. */
const NICE_DT = [0.5, 0.4, 0.25, 0.2, 0.125, 0.1, 0.075, 0.05, 0.025];

let puckKey = '';
let puckMemo: { c: Pull; phis: Float64Array; dt: number; vMax: number; tMax: number; sectors: Map<number, { pts: Vec2[]; A: number }> } | null = null;
/** Puck: whole run integrated once per parameter set, φ at every physics step. */
function puckModel(p: P) {
  const key = `${p.mode}|${p.rIn}|${p.wOut}|${p.m}`;
  if (key !== puckKey || !puckMemo) {
    const c = pullOf(p);
    const N = Math.round(endTime(c) * RATE);
    const phis = new Float64Array(N + 1);
    let vMax = 0;
    let tMax = 0;
    for (let n = 0; n < N; n++) {
      phis[n + 1] = stepAngle(c, phis[n], n * H, H);
      const k = radius(c, n * H);
      vMax = Math.max(vMax, Math.hypot(k.v, k.r * omega(c, n * H)));
      tMax = Math.max(tMax, tension(c, n * H));
    }
    // Sector interval: a round value at which the fastest sweep covers at most 1 rad, so SECTORS of
    // them never overlap.
    const bound = 1 / (c.wOut * (c.rOut / c.rIn) ** 2);
    const dt = NICE_DT.find((d) => d <= bound + 1e-12) ?? NICE_DT[NICE_DT.length - 1];
    puckMemo = { c, phis, dt, vMax, tMax, sectors: new Map() };
    puckKey = key;
  }
  return puckMemo;
}

/** φ at any time: one RK4 step from the stored step before it. */
function puckPhi(p: P, t: number): number {
  const { c, phis } = puckModel(p);
  const n = Math.min(Math.floor(t / H + 1e-9), phis.length - 1);
  const h = t - n * H;
  return h > 1e-12 ? stepAngle(c, phis[n], n * H, h) : phis[n];
}

/** Sectors finished by step n (index k: from k Δt to (k + 1) Δt), at most the last six, newest last. */
export function sectorsDone(p: P, n: number): number[] {
  const per = Math.max(1, Math.round(puckModel(p).dt * RATE));
  const kNow = Math.floor(n / per);
  const out: number[] = [];
  for (let k = Math.max(0, kNow - SECTORS); k < kNow; k++) out.push(k);
  return out;
}

/** Shoelace area of a polygon [m²]. */
export function polygonArea(pts: Vec2[]): number {
  let a = 0;
  for (let i = 0; i < pts.length; i++) {
    const q = pts[i];
    const r = pts[(i + 1) % pts.length];
    a += q.x * r.y - r.x * q.y;
  }
  return Math.abs(a) / 2;
}

/**
 * Sector k: the hole, then the puck's positions from k Δt to (k + 1) Δt at chords of at most
 * 0.004 rad (RK4 between the stored steps). Its area is measured from this polygon, the one drawn.
 */
export function sector(p: P, k: number): { pts: Vec2[]; A: number } {
  const m = puckModel(p);
  const hit = m.sectors.get(k);
  if (hit) return hit;
  const t0 = k * m.dt;
  const t1 = (k + 1) * m.dt;
  const dphi = Math.abs(puckPhi(p, t1) - puckPhi(p, t0));
  const M = Math.min(400, Math.max(24, Math.ceil(dphi / 0.004)));
  const pts: Vec2[] = [{ x: 0, y: 0 }];
  for (let j = 0; j <= M; j++) {
    const t = t0 + ((t1 - t0) * j) / M;
    const r = radius(m.c, t).r;
    const f = puckPhi(p, t);
    pts.push({ x: r * Math.cos(f), y: r * Math.sin(f) });
  }
  const out = { pts, A: polygonArea(pts) };
  m.sectors.set(k, out);
  return out;
}

/** Sector interval Δt [s] of this parameter set. */
export const sectorDt = (p: P) => puckModel(p).dt;
/** Stage label of a swept area. */
export const areaLabel = (A: number) => `${fmt(A, 3)} m²`;

let chairKey = '';
let chairMemo: { c: Chair; phis: Float64Array } | null = null;
function chairModel(p: P) {
  const key = `${p.arms}|${p.mDb}|${p.wArms}`;
  if (key !== chairKey || !chairMemo) {
    const c = chairOf(p);
    const N = Math.round(endTime(c) * RATE);
    const phis = new Float64Array(N + 1);
    for (let n = 0; n < N; n++) phis[n + 1] = stepChair(c, phis[n], n * H, H);
    chairMemo = { c, phis };
    chairKey = key;
  }
  return chairMemo;
}

const phisOf = (p: P) => (isChair(p) ? chairModel(p).phis : puckModel(p).phis);
const phiAt = (p: P, n: number) => {
  const f = phisOf(p);
  return f[Math.min(n, f.length - 1)];
};
const puckPos = (p: P, n: number): Vec2 => {
  const r = radius(puckModel(p).c, n * H).r;
  const f = phiAt(p, n);
  return { x: r * Math.cos(f), y: r * Math.sin(f) };
};

/** I, ω, L, K and the radius at time t for either system. */
function sample(p: P, t: number) {
  if (isChair(p)) {
    const c = chairOf(p);
    const I = chairInertia(c, t);
    const w = chairOmega(c, t);
    return { r: radius(c, t).r, I, w, L: I * w, K: chairKinetic(c, t) };
  }
  const c = pullOf(p);
  const r = radius(c, t).r;
  const w = omega(c, t);
  const I = c.m * r * r;
  return { r, I, w, L: I * w, K: kinetic(c, t) };
}

/** I on the outer and inner circle, and the fixed L. */
function extremes(p: P): { Iout: number; Iin: number; L: number } {
  if (isChair(p)) {
    const Iout = I0 + 2 * p.mDb * ARM_OUT ** 2;
    return { Iout, Iin: I0 + 2 * p.mDb * ARM_IN ** 2, L: chairL(chairOf(p)) };
  }
  return { Iout: p.m * R_OUT ** 2, Iin: p.m * p.rIn ** 2, L: angMom(pullOf(p)) };
}

const puckOnly = (p: Record<string, unknown>) => p.sys !== 'chair';
const chairOnly = (p: Record<string, unknown>) => p.sys === 'chair';

const params: ParamSchema<P> = {
  sys: {
    kind: 'select',
    label: 'ch11.p.sys',
    desc: 'ch11.d.sys',
    group: 'main',
    live: false,
    default: 'puck',
    options: [
      { value: 'puck', label: 'ch11.sys.puck' },
      { value: 'chair', label: 'ch11.sys.chair' },
    ],
  },
  mode: {
    kind: 'select',
    label: 'ch11.p.mode',
    desc: 'ch11.d.mode',
    group: 'main',
    live: false,
    default: 'pull',
    options: [
      { value: 'pull', label: 'ch11.mode.pull' },
      { value: 'release', label: 'ch11.mode.release' },
      { value: 'both', label: 'ch11.mode.both' },
    ],
    visibleIf: puckOnly,
  },
  arms: {
    kind: 'select',
    label: 'ch11.c.p.mode',
    desc: 'ch11.c.d.mode',
    group: 'main',
    live: false,
    default: 'pull',
    options: [
      { value: 'pull', label: 'ch11.c.mode.pull' },
      { value: 'release', label: 'ch11.c.mode.release' },
      { value: 'both', label: 'ch11.c.mode.both' },
    ],
    visibleIf: chairOnly,
  },
  rIn: { kind: 'number', label: 'ch11.p.rIn', desc: 'ch11.d.rIn', group: 'advanced', live: false, control: 'slider', min: 0.3, max: 0.8, step: 0.05, default: 0.5, unit: 'm', visibleIf: puckOnly },
  wOut: { kind: 'number', label: 'ch11.p.wOut', desc: 'ch11.d.wOut', group: 'advanced', live: false, control: 'slider', min: 1, max: 3, step: 0.1, default: 2, unit: 'rad/s', visibleIf: puckOnly },
  m: { kind: 'number', label: 'ch11.p.m', desc: 'ch11.d.m', group: 'advanced', live: false, control: 'slider', min: 0.1, max: 0.5, step: 0.05, default: 0.2, unit: 'kg', visibleIf: puckOnly },
  // design.md §4.1: at most 2 main controls (system and motion); the area display goes to the drawer.
  areas: { kind: 'toggle', label: 'ch11.p.areas', desc: 'ch11.d.areas', group: 'advanced', live: true, default: true, visibleIf: puckOnly },
  mDb: { kind: 'number', label: 'ch11.c.p.m', desc: 'ch11.c.d.m', group: 'advanced', live: false, control: 'slider', min: 0.5, max: 4, step: 0.1, default: 2, unit: 'kg', visibleIf: chairOnly },
  wArms: { kind: 'number', label: 'ch11.c.p.wOut', desc: 'ch11.c.d.wOut', group: 'advanced', live: false, control: 'slider', min: 1, max: 2, step: 0.1, default: 1.5, unit: 'rad/s', visibleIf: chairOnly },
};

function ring(r: number): Vec2[] {
  const pts: Vec2[] = [];
  for (let i = 0; i <= 96; i++) pts.push({ x: r * Math.cos((i / 96) * 2 * Math.PI), y: r * Math.sin((i / 96) * 2 * Math.PI) });
  return pts;
}

function disc(g: Draw, c: Vec2, r: number, fill: string, alpha = 1): void {
  const pts: Vec2[] = [];
  for (let i = 0; i < 48; i++) pts.push({ x: c.x + r * Math.cos((i / 48) * 2 * Math.PI), y: c.y + r * Math.sin((i / 48) * 2 * Math.PI) });
  g.polygon(pts, { fill, fillAlpha: alpha });
}

/** Sectors swept in the last few equal time intervals, alternately tinted. */
function sectors(g: Draw, p: P, n: number): void {
  for (const k of sectorsDone(p, n)) g.polygon(sector(p, k).pts, { fill: SECTOR_FILL[k % 2], fillAlpha: 0.28 });
}

/** Top-left stage marker of the sector interval: the two sector tints, then Δt. */
function deltaT(rec: Recorder, p: P): void {
  const g = rec.g;
  const sq = (x: number, fill: string) => {
    const pts: Vec2[] = [
      [x, 9],
      [x + 9, 9],
      [x + 9, 18],
      [x, 18],
    ].map(([a, b]) => {
      const [wx, wy] = g.vp.toWorld(a * theme.scale, b * theme.scale);
      return { x: wx, y: wy };
    });
    g.polygon(pts, { fill, fillAlpha: 0.45 });
  };
  sq(10, SECTOR_FILL[0]);
  sq(21, SECTOR_FILL[1]);
  rec.screenText(36, 14, deltaTLabel(p), { size: 12, color: '#1a1a1a', align: 'left', baseline: 'middle' });
  rec.boxes.push({ x0: 10 * theme.scale, y0: 9 * theme.scale, x1: 30 * theme.scale, y1: 18 * theme.scale });
}

/** Stage marker of the sector interval. */
export const deltaTLabel = (p: P) => `Δ*t* = ${sectorDt(p)} s`;

export type AreaLabel = { k: number; text: string; box: Box; kind: 'inside' | 'outside' | 'leader'; leader?: Seg };

/**
 * Where to write the area of each shaded sector (measured from its polygon), newest first, every
 * spot clear of what `rec` holds (path, string, puck, arrows, labels) and of the other labels:
 *  1. inside the sector (centroid, then along its middle ray);
 *  2. just outside its arc, clear of every sector;
 *  3. further out, in a gap of the path or beyond it (radius rMax), with a thin leader line.
 * When all sectors take spot 1, all are labelled; otherwise the newest three (two with leaders).
 */
export function placeAreaLabels(rec: Recorder, p: P, n: number, rMax: number): AreaLabel[] {
  const ks = sectorsDone(p, n);
  const ctx = rec.ctx;
  const polys = new Map(ks.map((k) => [k, sector(p, k).pts.map((q) => rec.toPx(q))]));
  const bbs = new Map(
    [...polys].map(([k, q]) => {
      const xs = q.map((v) => v[0]);
      const ys = q.map((v) => v[1]);
      return [k, { x0: Math.min(...xs), y0: Math.min(...ys), x1: Math.max(...xs), y1: Math.max(...ys) }];
    }),
  );
  const pad = 2 * theme.scale;
  const gap = 4 * theme.scale;
  const [ox, oy] = rec.toPx({ x: 0, y: 0 });
  const rFree = rMax * rec.vp.scale + gap;
  type Cand = { box: Box; kind: AreaLabel['kind']; leader?: Seg };
  const tries = (k: number, outside: boolean) => {
    const poly = polys.get(k)!;
    const text = areaLabel(sector(p, k).A);
    const tb = textBox(ctx, text, 0, 0, { size: 12, align: 'center', baseline: 'middle' });
    const hw = (tb.x1 - tb.x0) / 2 + pad;
    const hh = (tb.y1 - tb.y0) / 2 + pad;
    const at = (x: number, y: number): Box => ({ x0: x - hw, y0: y - hh, x1: x + hw, y1: y + hh });
    // Centre of a box whose nearest side is d px beyond the point at distance r on the ray at angle a.
    const beyond = (r: number, a: number, d: number) => {
      const ux = Math.cos(a);
      const uy = Math.sin(a);
      const e = d + Math.abs(ux) * hw + Math.abs(uy) * hh;
      return at(ox + ux * (r + e), oy + uy * (r + e));
    };
    const arc = poly.slice(1);
    const cands: Cand[] = [];
    // Inside: centroid of the fan, then along the middle ray.
    let cx = 0;
    let cy = 0;
    let aa = 0;
    for (let i = 0; i + 1 < arc.length; i++) {
      const cr = (arc[i][0] - ox) * (arc[i + 1][1] - oy) - (arc[i + 1][0] - ox) * (arc[i][1] - oy);
      cx += (ox + arc[i][0] + arc[i + 1][0]) * cr;
      cy += (oy + arc[i][1] + arc[i + 1][1]) * cr;
      aa += 3 * cr;
    }
    if (Math.abs(aa) > 1e-9) cands.push({ box: at(cx / aa, cy / aa), kind: 'inside' });
    const [mx, my] = arc[Math.floor(arc.length / 2)];
    for (const f of [0.62, 0.5, 0.74, 0.4, 0.84]) cands.push({ box: at(ox + (mx - ox) * f, oy + (my - oy) * f), kind: 'inside' });
    if (outside) {
      // Just beyond the arc, on the rays through its middle and its quarter points.
      for (const j of [0.5, 0.3, 0.7]) {
        const [ax, ay] = arc[Math.round((arc.length - 1) * j)];
        cands.push({ box: beyond(Math.hypot(ax - ox, ay - oy), Math.atan2(ay - oy, ax - ox), gap), kind: 'outside' });
      }
      // Further out (in a gap of the path, or beyond it), joined to the middle of the sector by a
      // leader: nearest rings first.
      const am = Math.atan2(my - oy, mx - ox);
      const rArc = Math.max(...arc.map(([ax, ay]) => Math.hypot(ax - ox, ay - oy)));
      const rings: number[] = [];
      for (let rr = rArc + gap; rr < rFree; rr += 10 * theme.scale) rings.push(rr);
      rings.push(rFree, rFree + 22 * theme.scale, rFree + 44 * theme.scale);
      for (const rr of rings)
        for (const da of [0, 0.25, -0.25, 0.5, -0.5, 0.75, -0.75, 1, -1, 1.3, -1.3, 1.7, -1.7, 2.2, -2.2]) {
          const box = beyond(rr, am + da, gap);
          for (const fr of [0.7, 0.88, 0.5]) {
            const from: [number, number] = [ox + (mx - ox) * fr, oy + (my - oy) * fr];
            // Leader to the nearest point of the box.
            const lx = Math.min(Math.max(from[0], box.x0), box.x1);
            const ly = Math.min(Math.max(from[1], box.y0), box.y1);
            cands.push({ box, kind: 'leader', leader: [from[0], from[1], lx, ly] });
          }
        }
    }
    return { text, poly, cands };
  };
  const run = (outside: boolean, max: number) => {
    const out: AreaLabel[] = [];
    const free = (c: Cand) => {
      if (!rec.clear(c.box) || out.some((o) => boxesOverlap(o.box, c.box) || (o.leader && segHitsBox(o.leader, c.box)))) return false;
      if (!c.leader) return true;
      // The leader may cross the path, not a label, an arrow's label or the puck.
      const l = c.leader;
      return !rec.boxes.some((b) => segHitsBox(l, b)) && !out.some((o) => segHitsBox(l, o.box)) && !rec.discs.some((d) => segHitsBox(l, { x0: d.x - d.r, y0: d.y - d.r, x1: d.x + d.r, y1: d.y + d.r }));
    };
    let leaders = 0;
    for (const k of [...ks].reverse()) {
      const { text, poly, cands } = tries(k, outside);
      for (const c of cands) {
        if (c.kind === 'leader' && leaders >= 2) break;
        if (!free(c)) continue;
        if (c.kind === 'inside' ? !boxInPoly(c.box, poly) : ks.some((q) => boxesOverlap(bbs.get(q)!, c.box) && boxHitsPoly(c.box, polys.get(q)!))) continue;
        out.push({ k, text, box: c.box, kind: c.kind, leader: c.leader });
        if (c.kind === 'leader') leaders++;
        break;
      }
      if (out.length >= max) break;
    }
    return out;
  };
  const all = run(false, SECTORS);
  return all.length === ks.length ? all : run(true, 3);
}

function drawPuck(g: Draw, s: S, p: P): void {
  const { c, vMax, tMax } = puckModel(p);
  const rec = new Recorder(g);
  const O: Vec2 = { x: 0, y: 0 };
  // Outer and inner radii as faint guides.
  for (const rr of [c.rOut, c.rIn]) g.polyline(ring(rr), { color: '#e2e2e2', width: 1 });
  if (p.areas) sectors(g, p, s.n);

  // Path so far.
  const path: Vec2[] = [];
  const step = Math.max(1, Math.floor(s.n / 1200));
  for (let i = 0; i < s.n; i += step) path.push(puckPos(p, i));
  path.push(puckPos(p, s.n));
  rec.polyline(path, { role: 'position', width: 1.25, alpha: 0.35 });

  const k = radius(c, s.t);
  const w = omega(c, s.t);
  const u = { x: Math.cos(s.phi), y: Math.sin(s.phi) };
  const P0: Vec2 = { x: k.r * u.x, y: k.r * u.y };
  rec.line(O, P0, { color: '#5c5c5c', width: 1.5 });
  // String goes down through the hole.
  rec.circle(O, 6, { fill: '#1a1a1a' });

  const vx = k.v * u.x - k.r * w * u.y;
  const vy = k.v * u.y + k.r * w * u.x;
  const kv = 0.45 / vMax;
  rec.arrow(P0, { x: vx * kv, y: vy * kv }, { role: 'velocity', width: 2.5, label: '*v*' });
  // T ∝ 1/r³ changes up to 37-fold, so a proportional arrow would vanish at the outer radius:
  // proportional above a minimum length that stays visible beyond the puck.
  const T = tension(c, s.t);
  const kt = (0.6 * c.rIn) / tMax;
  const lenT = Math.max(T * kt, g.px(T_MIN_PX));
  rec.arrow(P0, { x: -u.x * lenT, y: -u.y * lenT }, { role: 'force', width: 2.5 });
  // T label beside the middle of the visible part (outside the puck), on the side away from v.
  const vis = (lenT + g.px(9)) / 2;
  const mid = { x: P0.x - u.x * vis, y: P0.y - u.y * vis };
  const off = { x: u.y, y: -u.x };
  rec.text({ x: mid.x + off.x * g.px(13), y: mid.y + off.y * g.px(13) }, '*T*', { size: 13, role: 'force', align: 'center', baseline: 'middle' });
  g.circle(P0, 9, { fill: 'position' });
  rec.discs.push({ x: rec.toPx(P0)[0], y: rec.toPx(P0)[1], r: 11 * theme.scale });

  if (!p.areas) return;
  deltaT(rec, p);
  const rMax = Math.max(...path.map((q) => Math.hypot(q.x, q.y)));
  for (const l of placeAreaLabels(rec, p, s.n, rMax)) {
    if (l.leader) {
      const [ax, ay, bx, by] = l.leader;
      const [wa, wb] = [g.vp.toWorld(ax, ay), g.vp.toWorld(bx, by)];
      g.line({ x: wa[0], y: wa[1] }, { x: wb[0], y: wb[1] }, { color: '#8c8c8c', width: 0.75 });
    }
    rec.screenText((l.box.x0 + l.box.x1) / 2 / theme.scale, (l.box.y0 + l.box.y1) / 2 / theme.scale, l.text, { size: 12, color: '#1a1a1a', align: 'center', baseline: 'middle' });
  }
}

function drawChair(g: Draw, s: S, p: P): void {
  const c = chairModel(p).c;
  const O: Vec2 = { x: 0, y: 0 };
  // Reach of the arms.
  g.polyline(ring(ARM_OUT), { color: '#e2e2e2', width: 1 });
  g.polyline(ring(ARM_IN), { color: '#e2e2e2', width: 1 });

  const r = radius(c, s.t).r;
  const u = { x: Math.cos(s.phi), y: Math.sin(s.phi) };
  const n = { x: -u.y, y: u.x };
  const at = (a: number, b: number): Vec2 => ({ x: u.x * a + n.x * b, y: u.y * a + n.y * b });

  // Shoulders along u, head in the middle, nose towards n (shows the turning).
  const sh = 0.14;
  disc(g, O, 0.3, '#ededed');
  g.polygon([at(-sh, -0.08), at(sh, -0.08), at(sh, 0.08), at(-sh, 0.08)], { fill: BODY, fillAlpha: 0.55 });
  disc(g, O, 0.12, BODY);
  g.polygon([at(-0.035, 0.11), at(0.035, 0.11), at(0, 0.17)], { fill: BODY });
  // Arms from the shoulders to the dumbbells (at ±r along u).
  const rb = 6 * Math.cbrt(p.mDb / 2);
  for (const sgn of [-1, 1]) {
    const hand = at(sgn * Math.max(r, sh), 0);
    g.line(at(sgn * sh, 0), hand, { color: BODY, width: 6 });
    const d = at(sgn * r, 0);
    g.line({ x: d.x - n.x * 0.07, y: d.y - n.y * 0.07 }, { x: d.x + n.x * 0.07, y: d.y + n.y * 0.07 }, { color: '#1a1a1a', width: 3 });
    g.circle({ x: d.x - n.x * 0.07, y: d.y - n.y * 0.07 }, rb, { fill: 'position' });
    g.circle({ x: d.x + n.x * 0.07, y: d.y + n.y * 0.07 }, rb, { fill: 'position' });
  }
  // Velocity of one dumbbell: tangential r ω plus radial ṙ.
  const w = chairOmega(c, s.t);
  const vr = radius(c, s.t).v;
  const d = at(r, 0);
  g.arrow(d, { x: (u.x * vr + n.x * r * w) * KV, y: (u.y * vr + n.y * r * w) * KV }, { role: 'velocity', width: 2.25, label: '*v*' });
}

const tEndOf = (p: P) => endTime(isChair(p) ? chairOf(p) : pullOf(p));

/**
 * Σ panel: I from the current radius, L = I ω (the same at every instant), K (L²/2I on a circle,
 * plus the radial term while the radius changes) and, for the puck, the areal velocity L / 2m.
 * m as its slider label, state values with 3 figures, results as the readouts (policy D, R1/R3).
 */
export function formulaLines(s: S, p: P): string[] {
  const k = sample(p, s.t);
  const L = extremes(p).L;
  const chair = isChair(p);
  const c = chair ? chairOf(p) : pullOf(p);
  const m = slider(chair ? params.mDb : params.m, c.m);
  const rs = tn(k.r);
  const kgm2 = 'kg\\,m^2';
  const lines = [
    chair ? `I = I_0 + 2mr^2 = ${num(I0)} + 2(${m})(${rs})^2 = ${tn(k.I)}${u(kgm2)}` : `I = mr^2 = (${m})(${rs})^2 = ${tn(k.I)}${u(kgm2)}`,
  ];
  lines.push(`L = I\\omega = (${tn(k.I)})(${tn(k.w)}) = ${tn(L)}${u(kgm2 + '/s')}`);
  const rd = radius(c, s.t).v;
  const K = tn(k.K);
  if (rd === 0) {
    lines.push(`K = \\frac{L^2}{2I} = \\frac{(${tn(L)})^2}{2(${tn(k.I)})} = ${K}${u('J')}`);
  } else {
    // The radial term: ½ m ṙ² for the puck, ½ (2m) ṙ² for the two dumbbells. R5b: through ω² a
    // 3-figure I and ω can miss K by more than 1 % (8.08 against 8.16); they then keep the figures
    // that reproduce it.
    const mr = chair ? c.m : 0.5 * c.m;
    const kk = sigCancel((r) => 0.5 * r(k.I) * r(k.w) ** 2 + mr * r(rd) ** 2, K);
    lines.push(
      `K = \\tfrac12 I\\omega^2 + ${chair ? 'm\\dot r^2' : '\\tfrac12 m\\dot r^2'}`,
      `= \\tfrac12(${tnCancel(k.I, kk)})(${tnCancel(k.w, kk)})^2 + ${chair ? `(${m})` : `\\tfrac12(${m})`}(${tnCancel(rd, kk)})^2 = ${K}${u('J')}`,
    );
  }
  if (!chair) lines.push(`\\frac{dA}{dt} = \\frac{L}{2m} = \\frac{${tn(L)}}{2(${m})} = ${tn(L / (2 * c.m))}${u('m^2/s')}`);
  return lines;
}

export const spinScene: Scene<P, S> = {
  id: 'spin',
  title: 'ch11.s.scene',
  params,
  time: { h: H, recordEvery: 2, frameStep: 0.05, tEnd: (p) => tEndOf(p as P) },
  world: (p) => {
    const e = isChair(p) ? 1.15 : R_OUT + 0.3;
    return { x: [-e, e], y: [-e, e], aspect: 'contain', padPx: 16 };
  },

  init: (p) => ({ t: 0, n: 0, phi: phiAt(p, 0) }),
  step: (s, _h, p) => {
    s.n = Math.min(s.n + 1, phisOf(p).length - 1);
    s.t = s.n * H;
    s.phi = phiAt(p, s.n);
  },

  record: (s, p) => {
    const k = sample(p, s.t);
    return { t: s.t, I: k.I, w: k.w, L: k.L, K: k.K };
  },
  snapshot: (s) => ({ ...s }),

  draw: (g, s, p) => (isChair(p) ? drawChair(g, s, p) : drawPuck(g, s, p)),

  plots: [
    { id: 'I', label: 'I\\,(\\mathrm{kg\\,m^2})', traces: [{ channel: 'I', role: 'position' }], yRange: (p) => [0, extremes(p).Iout * 1.15] },
    {
      id: 'w',
      label: '\\omega\\,(\\mathrm{rad/s})',
      traces: [{ channel: 'w', role: 'velocity' }],
      yRange: (p) => {
        const e = extremes(p);
        return [0, (e.L / e.Iin) * 1.12];
      },
    },
    { id: 'L', label: 'L\\,(\\mathrm{kg\\,m^2/s})', traces: [{ channel: 'L', role: 'fg' }], yRange: (p) => [0, extremes(p).L * 1.5] },
    {
      id: 'K',
      label: 'K\\,(\\mathrm{J})',
      traces: [{ channel: 'K', role: 'energyK' }],
      yRange: (p) => {
        const e = extremes(p);
        return [0, ((0.5 * e.L * e.L) / e.Iin) * 1.15];
      },
    },
  ],

  readouts: [
    { label: 'r', unit: 'm', value: (s, p) => sample(p, s.t).r },
    { label: 'I', unit: 'kg·m²', value: (s, p) => sample(p, s.t).I },
    { label: '\\omega', unit: 'rad/s', value: (s, p) => sample(p, s.t).w },
    // K changes as the radius does (QA 2026-11-24: an L readout never changed; its constancy is the
    // L plot and the Σ panel's L = Iω line).
    { label: 'K', unit: 'J', value: (s, p) => sample(p, s.t).K },
  ],

  formula: (s, p) => formulaLines(s, p),

  info: {
    goals: ['ch11.s.goal.L', 'ch11.s.goal.I', 'ch11.s.goal.K'],
    observe: ['ch11.s.obs.flat', 'ch11.s.obs.square', 'ch11.s.obs.ratio', 'ch11.s.obs.work', 'ch11.s.obs.area', 'ch11.s.obs.mass'],
    equations: [
      '\\tau_\\text{ext} = 0 \\;\\Rightarrow\\; L = I\\omega = \\text{const.}',
      '\\vec\\tau = \\vec r \\times \\vec T = 0, \\quad I = m r^2',
      'I = I_0 + 2 m r^2',
      'K = \\tfrac{1}{2} I \\omega^2 = \\frac{L^2}{2I} \\quad (\\dot r = 0)',
      '\\frac{dA}{dt} = \\tfrac{1}{2} r^2 \\omega = \\frac{L}{2m}',
    ],
    assumptions: ['ch11.s.assume', 'ch11.c.assume'],
  },
};
