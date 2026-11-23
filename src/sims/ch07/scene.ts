// Ch 7 scene: work-kinetic energy theorem. The block on the track, the F(x) graph and the K(x)
// graph share one x axis. The signed area under F(x) from the start to the block (the work, as in
// the Ch 2 area overlay) always equals the change ΔK on the K(x) graph and in the bars.
import { fmtTick, niceTicks } from '../../core/format';
import { fmtScale, num, tn, tnScale, u } from '../../core/tex';
import { t as tr } from '../../core/i18n';
import type { ParamSchema, Scene, Vec2 } from '../../core/types';
import type { Draw } from '../../draw/draw';
import { FBD_MIN_PX, drawFbd, fbdParam, type FbdForce } from '../../draw/fbd';
import { measureRich } from '../../draw/text';
import { color, theme, withAlpha } from '../../draw/theme';
import { LabelLayout } from '../ch03/labels';
import { F_MAX, SEG, TRACK, force, kinetic, makeSetup, trajectory, work, type Preset, type Setup, type Trajectory } from './physics';

type P = { preset: string; bars: boolean; fbd: boolean; custom: number[] };

interface S {
  t: number;
  n: number;
  x: number;
  v: number;
}

const RATE = 240;
const T_MAX = 15;
const TICK = '#6b6b6b';
const GUIDE = '#c8c8c8';

// World layout: the track always spans u ∈ [0, TRACK]; bands stacked vertically.
const Y_TRACK = 6.1;
/** With the free-body diagram the track moves up by this much, so N and mg have room. */
const FBD_DY = 0.9;
const yTrack = (p: P) => (p.fbd ? Y_TRACK + FBD_DY : Y_TRACK);
const F_BAND: [number, number] = [3.4, 5.3];
const K_BAND: [number, number] = [0.45, 2.55];
const BAR_W = 0.55;
/** g for the weight and the normal force of the free-body diagram [m/s²]. */
export const G7 = 9.8;
/** Block half-width and height [px]. */
const BW = 13;
const BH = 22;
/** Longest free-body arrow [px] when the stage has room. */
const FBD_LEN = 56;

/** Narrow (portrait) screens put the bars under the graphs instead of beside them. */
const narrow = () => typeof window !== 'undefined' && window.matchMedia('(max-width: 767px)').matches;
function barBox(): { x: number; mid: number; half: number } {
  if (narrow()) return { x: TRACK / 2 - BAR_W - 0.15, mid: -2.3, half: 1.2 };
  return { x: TRACK + 1.6, mid: (F_BAND[1] + K_BAND[0]) / 2, half: (F_BAND[1] - K_BAND[0]) / 2 };
}

let memoKey = '';
/** Run scales (largest magnitude over the run) of the printed values: fixed decimals (policy D, R7a). */
type Scales = { x: number; v: number; K: number; W: number; F: number };
let memo: { su: Setup; tj: Trajectory; F: [number, number]; K: number; B: number; Fmax: number; sc: Scales } | null = null;
function model(p: P) {
  const key = `${p.preset}|${p.custom.join(',')}`;
  if (key !== memoKey || !memo) {
    const pr = (['const', 'spring', 'pw', 'custom'].includes(p.preset) ? p.preset : 'const') as Preset;
    const su = makeSetup(pr, p.custom);
    const tMax = su.prof.kind === 'spring' ? 2 * Math.PI * Math.sqrt(su.m / su.prof.k) : T_MAX;
    const tj = trajectory(su, RATE, tMax);
    // Graph ranges: F over the track, K and |W| over the run.
    let fLo = 0;
    let fHi = 0;
    for (let i = 0; i <= 200; i++) {
      const f = force(su.prof, su.lo + ((su.hi - su.lo) * i) / 200);
      fLo = Math.min(fLo, f);
      fHi = Math.max(fHi, f);
    }
    if (pr === 'custom') [fLo, fHi] = [-F_MAX, F_MAX];
    const span = Math.max(fHi - fLo, 1);
    let K = 0;
    let B = 0;
    const K0 = kinetic(su.m, su.v0);
    for (let i = 0; i < tj.n; i++) {
      const k = kinetic(su.m, tj.v[i]);
      K = Math.max(K, k);
      B = Math.max(B, Math.abs(k - K0));
    }
    // Largest |F| the block meets over the run (free-body scale).
    let Fmax = 0;
    let xMax = 0;
    let vMax = 0;
    for (let i = 0; i < tj.n; i++) {
      Fmax = Math.max(Fmax, Math.abs(force(su.prof, tj.x[i])));
      xMax = Math.max(xMax, Math.abs(tj.x[i]));
      vMax = Math.max(vMax, Math.abs(tj.v[i]));
    }
    const sc = { x: xMax, v: vMax, K, W: B, F: Fmax };
    memo = { su, tj, F: [fLo - 0.15 * span, fHi + 0.15 * span], K: Math.max(K, 1) * 1.15, B: Math.max(B, 1) * 1.1, Fmax, sc };
    memoKey = key;
  }
  return memo;
}

const U = (su: Setup, x: number) => ((x - su.lo) / (su.hi - su.lo)) * TRACK;
const yF = (m: ReturnType<typeof model>, F: number) => F_BAND[0] + ((F - m.F[0]) / (m.F[1] - m.F[0])) * (F_BAND[1] - F_BAND[0]);
const yK = (m: ReturnType<typeof model>, K: number) => K_BAND[0] + (K / m.K) * (K_BAND[1] - K_BAND[0]);
const yB = (m: ReturnType<typeof model>, E: number) => {
  const b = barBox();
  return b.mid + (E / m.B) * b.half * 0.92;
};

const params: ParamSchema<P> = {
  preset: {
    kind: 'select',
    label: 'ch07.p.preset',
    desc: 'ch07.d.preset',
    group: 'main',
    live: false,
    default: 'pw',
    options: [
      { value: 'const', label: 'ch07.preset.const' },
      { value: 'spring', label: 'ch07.preset.spring' },
      { value: 'pw', label: 'ch07.preset.pw' },
      { value: 'custom', label: 'ch07.preset.custom' },
    ],
  },
  fbd: fbdParam(),
  bars: { kind: 'toggle', label: 'ch07.p.bars', desc: 'ch07.d.bars', group: 'advanced', live: true, default: true },
  custom: { kind: 'array', label: 'ch07.p.custom', group: 'hidden', live: false, default: [1, 0.5, -1, -0.5], min: -F_MAX, max: F_MAX },
};

/**
 * Free-body diagram of the block: the force F(x) of the preset (F_s for the spring), N and mg. On the
 * frictionless horizontal track N and mg cancel and do no work; F is the net force, F = m a.
 */
export function workFbd(s: { x: number }, p: P): FbdForce[] {
  const { su } = model(p);
  const W = su.m * G7;
  return [
    { F: { x: force(su.prof, s.x), y: 0 }, label: su.prof.kind === 'spring' ? '*F*_{s}' : '*F*' },
    { F: { x: 0, y: W }, label: '*N*' },
    { F: { x: 0, y: -W }, label: '*m**g*', field: true },
  ];
}

/**
 * px per newton of the free-body diagram: one scale per run, from the run's largest force (the
 * weight). The weight gets FBD_LEN px, or less when the gap between the track and the F(x) graph
 * (or the stage top) leaves less room for the arrow and its label.
 */
function fbdPerPx(g: Draw, m: ReturnType<typeof model>, yt: number): number {
  const [, cy] = g.vp.toPx(0, yt);
  const [, fTop] = g.vp.toPx(0, F_BAND[1]);
  const c = cy - (BH / 2) * theme.scale;
  // Label beyond each tip: 11 px to its centre, about 8 px of text, 4 px margin. Below, the F (N)
  // axis title (about 16 px) sits on the F band top.
  const room = Math.min(fTop - 16 * theme.scale - c, c) / theme.scale - 23;
  const len = Math.max(Math.min(room, FBD_LEN), FBD_MIN_PX + 6);
  return len / Math.max(m.su.m * G7, m.Fmax);
}

let hatchCache: CanvasPattern | null = null;
function hatch(ctx: CanvasRenderingContext2D): CanvasPattern | null {
  if (!hatchCache) {
    const c = document.createElement('canvas');
    c.width = c.height = 8;
    const h = c.getContext('2d')!;
    h.strokeStyle = withAlpha(color('force'), 0.55);
    h.lineWidth = 1.2;
    h.beginPath();
    h.moveTo(-2, 10);
    h.lineTo(10, -2);
    h.moveTo(-2, 2);
    h.lineTo(2, -2);
    h.moveTo(6, 10);
    h.lineTo(10, 6);
    h.stroke();
    hatchCache = ctx.createPattern(c, 'repeat');
  }
  return hatchCache;
}

/** Signed area under F(x) between x0 and x: solid above the axis, hatched below (as in Ch 2). */
function shadeArea(g: Draw, m: ReturnType<typeof model>, x0: number, x1: number): void {
  const { su } = m;
  if (Math.abs(x1 - x0) < 1e-9) return;
  const lo = Math.min(x0, x1);
  const hi = Math.max(x0, x1);
  const pts: Vec2[] = [{ x: U(su, lo), y: yF(m, 0) }];
  const N = 160;
  for (let i = 0; i <= N; i++) {
    const x = lo + ((hi - lo) * i) / N;
    // Vertical steps at the segment edges of a piecewise force.
    if (su.prof.kind === 'pw') {
      for (const e of su.prof.xs) {
        const xp = lo + ((hi - lo) * (i - 1)) / N;
        if (i > 0 && e > xp && e <= x) {
          pts.push({ x: U(su, e), y: yF(m, force(su.prof, e - 1e-9)) }, { x: U(su, e), y: yF(m, force(su.prof, e)) });
        }
      }
    }
    pts.push({ x: U(su, x), y: yF(m, force(su.prof, Math.min(x, hi - 1e-9))) });
  }
  pts.push({ x: U(su, hi), y: yF(m, 0) });
  const { ctx, vp } = g;
  const path = new Path2D();
  pts.forEach((q, i) => {
    const [px, py] = vp.toPx(q.x, q.y);
    if (i === 0) path.moveTo(px, py);
    else path.lineTo(px, py);
  });
  path.closePath();
  const [, pz] = vp.toPx(0, yF(m, 0));
  ctx.save();
  ctx.save();
  ctx.beginPath();
  ctx.rect(0, 0, vp.w, pz);
  ctx.clip();
  ctx.fillStyle = withAlpha(color('force'), 0.22);
  ctx.fill(path);
  ctx.restore();
  ctx.beginPath();
  ctx.rect(0, pz, vp.w, vp.h - pz);
  ctx.clip();
  ctx.fillStyle = withAlpha(color('force'), 0.07);
  ctx.fill(path);
  const pat = hatch(ctx);
  if (pat) {
    ctx.fillStyle = pat;
    ctx.fill(path);
  }
  ctx.restore();
}

/** Left axis of a band with a few ticks and its TeX-free label. */
function bandAxis(g: Draw, lo: number, hi: number, y: (v: number) => number, label: string, top: number): void {
  g.line({ x: 0, y: y(lo) }, { x: 0, y: y(hi) }, { role: 'axis', width: 1 });
  for (const v of niceTicks(lo, hi, 3)) {
    g.line({ x: 0, y: y(v) }, { x: -g.px(4), y: y(v) }, { role: 'axis', width: 1 });
    g.text({ x: 0, y: y(v) }, fmtTick(v), { size: 11, color: TICK, align: 'right', baseline: 'middle', dx: -7 });
  }
  if (lo < 0 && hi > 0) g.line({ x: 0, y: y(0) }, { x: TRACK, y: y(0) }, { color: GUIDE, width: 1 });
  g.text({ x: 0, y: top }, label, { size: 13, color: '#1a1a1a', dx: 6, dy: -4 });
}

/**
 * Σ panel: F at the block, the work as the area under F(x) (segment by segment, or the spring's
 * closed form), K and ΔK, so that W_net = ΔK can be read off the two results. x, v, K, W and the
 * spring force print with fixed decimals from their run scale, as the readouts: back at the turning
 * point the spring's v and W read 0.00, not a time-grid residue such as 2.96×10⁻⁴ (policy D, R7a).
 * Segment forces and the start values as set (R1), segment lengths with 3 figures (R3).
 */
export function formulaLines(s: S, p: P): string[] {
  const { su, sc } = model(p);
  const m = su.m;
  const K = kinetic(m, s.v);
  const dK = K - kinetic(m, su.v0);
  const W = work(su.prof, su.x0, s.x);
  const F = force(su.prof, s.x);
  const x = tnScale(s.x, sc.x);
  const v = tnScale(s.v, sc.v);
  const Ft = su.prof.kind === 'spring' ? tnScale(F, sc.F) : num(F);
  const lines: string[] = [];
  if (su.prof.kind === 'spring') {
    const k = su.prof.k;
    lines.push(`F = -kx = -(${num(k)})(${x}) = ${Ft}${u('N')}`);
    lines.push(`W = \\int_{x_0}^{x} F\\,dx = -\\tfrac12 k(x^2 - x_0^2)`, `= -\\tfrac12(${num(k)})[(${x})^2 - (${num(su.x0)})^2] = ${tnScale(W, sc.W)}${u('J')}`);
  } else {
    const prof = su.prof;
    lines.push(`F(${x}${u('m')}) = ${Ft}${u('N')}`);
    // Signed area: F_i Δx_i over the segments between x_0 and x (x ≥ x_0 on these tracks).
    const lo = Math.min(su.x0, s.x);
    const hi = Math.max(su.x0, s.x);
    const n = prof.Fs.length;
    const terms: { F: number; dx: number }[] = [];
    for (let i = 0; i < n; i++) {
      const a = i === 0 ? -Infinity : prof.xs[i];
      const b = i === n - 1 ? Infinity : prof.xs[i + 1];
      const l = Math.max(lo, a);
      const r = Math.min(hi, b);
      if (r - l > 1e-9) terms.push({ F: prof.Fs[i], dx: r - l });
    }
    if (!terms.length) lines.push(`W = \\int_{x_0}^{x} F\\,dx = ${tnScale(0, sc.W)}${u('J')}`);
    else {
      const sum = terms.map((q) => `(${num(q.F)})(${Number.isInteger(q.dx) ? num(q.dx) : tn(q.dx)})`).join(' + ');
      lines.push(`W = \\int_{x_0}^{x} F\\,dx = \\sum_i F_i\\,\\Delta x_i`, `= ${sum} = ${tnScale(W, sc.W)}${u('J')}`);
    }
  }
  if (p.fbd) {
    // Free-body diagram: N and mg cancel, F is the net force (N and mg do no work on this track).
    const Wt = m * G7;
    lines.push(`\\Sigma F_x = F = ${Ft}${u('N')} = ma,\\quad \\Sigma F_y = N - mg = ${tn(Wt)} - ${tn(Wt)} = 0`);
  }
  lines.push(`K = \\tfrac12 mv^2 = \\tfrac12(${num(m)})(${v})^2 = ${tnScale(K, sc.K)}${u('J')}`);
  lines.push(`\\Delta K = \\tfrac12 m(v^2 - v_0^2)`, `= \\tfrac12(${num(m)})[(${v})^2 - ${num(su.v0)}^2] = ${tnScale(dK, sc.W)}${u('J')}`);
  return lines;
}

export const workEnergy: Scene<P, S> = {
  id: 'work',
  title: 'ch07.scene',
  params,
  time: { h: 1 / RATE, recordEvery: 1, frameStep: 0.05, tEnd: (p) => model(p as P).tj.tEnd },

  world: (p) => {
    const top = 7.0 + (p.fbd ? FBD_DY : 0);
    if (narrow()) return { x: [-0.9, TRACK + 0.5], y: [p.bars ? -3.7 : -0.5, top], aspect: 'contain', padPx: 10 };
    return { x: [-0.9, p.bars ? barBox().x + 2 * BAR_W + 1.2 : TRACK + 0.5], y: [-0.5, top], aspect: 'contain', padPx: 14 };
  },

  init: (p) => {
    const { su } = model(p);
    return { t: 0, n: 0, x: su.x0, v: su.v0 };
  },

  step: (s, _h, p) => {
    const { tj } = model(p);
    s.n = Math.min(s.n + 1, tj.n - 1);
    s.t = Math.min(s.n / RATE, tj.tEnd);
    s.x = tj.x[s.n];
    s.v = tj.v[s.n];
  },

  snapshot: (s) => ({ ...s }),

  draw: (g, s, p) => {
    const m = model(p);
    const { su, tj } = m;
    const K0 = kinetic(su.m, su.v0);
    const K = kinetic(su.m, s.v);
    const W = work(su.prof, su.x0, s.x);
    const ub = U(su, s.x);

    // Shared x axis: ticks under the K band, faint guide through all bands at the block.
    const ticks = niceTicks(su.lo, su.hi, 8);
    g.line({ x: 0, y: K_BAND[0] }, { x: TRACK, y: K_BAND[0] }, { role: 'axis', width: 1 });
    for (const x of ticks) {
      g.line({ x: U(su, x), y: K_BAND[0] }, { x: U(su, x), y: K_BAND[0] - g.px(4) }, { role: 'axis', width: 1 });
      g.text({ x: U(su, x), y: K_BAND[0] }, fmtTick(x), { size: 11, color: TICK, align: 'center', dy: 16 });
    }
    g.text({ x: TRACK, y: K_BAND[0] }, '*x* (m)', { size: 12, color: TICK, align: 'right', dy: 32 });
    const YT = yTrack(p);
    // With the free-body diagram the guide stops at the F band: mg hangs in the gap above it.
    g.line({ x: ub, y: K_BAND[0] }, { x: ub, y: p.fbd ? F_BAND[1] : YT }, { color: GUIDE, width: 1, dash: [3, 4] });

    // Track and block with its force and velocity arrows.
    g.line({ x: 0, y: YT }, { x: TRACK, y: YT }, { role: 'axis', width: 1.5 });
    for (const x of ticks) g.line({ x: U(su, x), y: YT }, { x: U(su, x), y: YT - g.px(4) }, { role: 'axis', width: 1 });
    const F = force(su.prof, s.x);
    const bw = g.px(BW);
    const bh = g.px(BH);
    g.polygon(
      [
        { x: ub - bw, y: YT },
        { x: ub + bw, y: YT },
        { x: ub + bw, y: YT + bh },
        { x: ub - bw, y: YT + bh },
      ],
      // Faded under the free-body diagram so its arrows read.
      p.fbd ? { fill: 'position', fillAlpha: 0.25, role: 'position', width: 1.25 } : { fill: 'position' },
    );
    // Free-body diagram from the block's centre; its labels are obstacles for the area label below.
    // The separate F and v arrows would cross it: hidden.
    const fbdBoxes: { x0: number; y0: number; x1: number; y1: number }[] = [];
    if (p.fbd) {
      const c = { x: ub, y: YT + bh / 2 };
      const perPx = fbdPerPx(g, m, YT);
      const forces = workFbd(s, p);
      drawFbd(g, c, forces, perPx);
      const [cx, cy] = g.vp.toPx(c.x, c.y);
      const sc0 = theme.scale;
      for (const f of forces) {
        const mag = Math.hypot(f.F.x, f.F.y);
        if (!(mag > 1e-9)) continue;
        const L = Math.max(mag * perPx, FBD_MIN_PX) * sc0;
        const w = measureRich(g.ctx, f.label, { size: 13 });
        if (f.F.y !== 0) {
          const ty = cy - Math.sign(f.F.y) * (L + 11 * sc0);
          fbdBoxes.push({ x0: cx - w / 2 - 3 * sc0, y0: Math.min(cy, ty - 9 * sc0), x1: cx + w / 2 + 3 * sc0, y1: Math.max(cy, ty + 9 * sc0) });
        } else {
          const tx = cx + Math.sign(f.F.x) * (L + 5 * sc0);
          fbdBoxes.push({ x0: Math.min(cx, tx - (f.F.x < 0 ? w : 0)) - 3 * sc0, y0: cy - 9 * sc0, x1: Math.max(cx, tx + (f.F.x > 0 ? w : 0)) + 3 * sc0, y1: cy + 9 * sc0 });
        }
      }
    } else {
      const kf = 0.35; // world units per N
      if (Math.abs(F) > 1e-9) g.arrow({ x: ub + Math.sign(F) * bw, y: YT + bh / 2 }, { x: F * kf, y: 0 }, { role: 'force', width: 2.5, label: '*F*' });
      if (Math.abs(s.v) > 1e-6) g.arrow({ x: ub, y: YT + bh + g.px(12) }, { x: (s.v / 3) * 0.7, y: 0 }, { role: 'velocity', label: '*v*' });
    }

    // F(x) graph with the shaded work.
    bandAxis(g, m.F[0], m.F[1], (v) => yF(m, v), '*F* (N)', F_BAND[1]);
    shadeArea(g, m, su.x0, s.x);
    const fPts: Vec2[] = [];
    const N = 400;
    for (let i = 0; i <= N; i++) {
      const x = su.lo + ((su.hi - su.lo) * i) / N;
      if (su.prof.kind === 'pw' && i > 0) {
        const xp = su.lo + ((su.hi - su.lo) * (i - 1)) / N;
        for (const e of su.prof.xs) if (e > xp && e <= x) fPts.push({ x: U(su, e), y: yF(m, force(su.prof, e - 1e-9)) }, { x: U(su, e), y: yF(m, force(su.prof, e)) });
      }
      fPts.push({ x: U(su, x), y: yF(m, force(su.prof, Math.min(x, su.hi - 1e-9))) });
    }
    g.polyline(fPts, { role: 'force', width: 2 });
    g.circle({ x: ub, y: yF(m, F) }, 4, { fill: 'force' });
    if (p.preset === 'custom') {
      // Drag pills at the middle of each segment (as in Ch 2).
      for (let i = 0; i < SEG; i++) {
        const [hx, hy] = g.vp.toPx(U(su, ((i + 0.5) * TRACK) / SEG), yF(m, p.custom[i]));
        g.ctx.save();
        g.ctx.beginPath();
        g.ctx.roundRect(hx - 13, hy - 4.5, 26, 9, 4.5);
        g.ctx.fillStyle = '#5c5c5c';
        g.ctx.fill();
        g.ctx.lineWidth = 1.5;
        g.ctx.strokeStyle = '#ffffff';
        g.ctx.stroke();
        g.ctx.restore();
      }
    }
    // Area label beside the guide line at the top of the F band, else at its bottom: the first
    // spot clear of the F(x) curve and the drag pills.
    const lay = new LabelLayout(g);
    lay.boxes.push(...fbdBoxes);
    lay.polyline(fPts);
    if (p.preset === 'custom') {
      for (let i = 0; i < SEG; i++) {
        const [hx, hy] = g.vp.toPx(U(su, ((i + 0.5) * TRACK) / SEG), yF(m, p.custom[i]));
        lay.boxes.push({ x0: hx - 15, y0: hy - 6, x1: hx + 15, y1: hy + 6 });
      }
    }
    // The F (N) axis title (drawn by bandAxis at the band top, 6 px right of the axis) is an obstacle too.
    {
      const [ax, ay] = g.vp.toPx(0, F_BAND[1]);
      const tw = measureRich(g.ctx, '*F* (N)', { size: 13 });
      const sc0 = theme.scale;
      lay.boxes.push({ x0: ax + 4 * sc0, y0: ay - 19 * sc0, x1: ax + 8 * sc0 + tw, y1: ay + 1 * sc0 });
    }
    const [gx, gTop] = g.vp.toPx(ub, F_BAND[1]);
    const [, gBot] = g.vp.toPx(ub, F_BAND[0]);
    const sc = theme.scale;
    const rightFirst = ub <= TRACK * 0.7;
    const sides: ('left' | 'right')[] = rightFirst ? ['left', 'right'] : ['right', 'left'];
    const cands: { x: number; y: number; align: 'left' | 'right' }[] = [];
    for (const y of [gTop - 4 * sc, gTop + 12 * sc, gTop + 26 * sc, gBot - 6 * sc, gBot - 20 * sc]) {
      for (const al of sides) cands.push({ x: gx + (al === 'left' ? 8 : -8) * sc, y, align: al });
    }
    lay.place(cands, `${tr('plot.area')} = ${fmtScale(W, m.sc.W)} J`, 'force', 12, 500);

    // K(x) graph: the path so far, K0 reference and the ΔK bar at the block.
    bandAxis(g, 0, m.K, (v) => yK(m, v), '*K* (J)', K_BAND[1]);
    const kPts: Vec2[] = [];
    const step = Math.max(1, Math.floor(s.n / 600));
    for (let i = 0; i <= s.n; i += step) kPts.push({ x: U(su, tj.x[i]), y: yK(m, kinetic(su.m, tj.v[i])) });
    kPts.push({ x: ub, y: yK(m, K) });
    g.line({ x: U(su, su.x0), y: yK(m, K0) }, { x: ub, y: yK(m, K0) }, { role: 'energyK', width: 1, dash: [3, 3] });
    g.polyline(kPts, { role: 'energyK', width: 2 });
    g.line({ x: ub, y: yK(m, K0) }, { x: ub, y: yK(m, K) }, { role: 'energyK', width: 3.5 });
    g.circle({ x: ub, y: yK(m, K) }, 4, { fill: 'energyK' });
    // ΔK label beside the bar, on the side clear of the K(x) path (the spring preset turns back).
    lay.polyline(kPts);
    const [kx, k0y] = g.vp.toPx(ub, yK(m, K0));
    const [, k1y] = g.vp.toPx(ub, yK(m, K));
    const kSides: ('left' | 'right')[] = ub < TRACK * 0.7 ? ['left', 'right'] : ['right', 'left'];
    const kc: { x: number; y: number; align: 'left' | 'right' }[] = [];
    for (const y of [(k0y + k1y) / 2, Math.min(k0y, k1y) - 10 * sc, Math.max(k0y, k1y) + 10 * sc]) {
      for (const al of kSides) kc.push({ x: kx + (al === 'left' ? 9 : -9) * sc, y, align: al });
    }
    lay.place(kc, `Δ*K* = ${fmtScale(K - K0, m.sc.W)} J`, 'energyK', 12, 500);

    // Bars: W_net and ΔK from a common zero.
    if (p.bars) {
      const bb = barBox();
      const BAR_X = bb.x;
      const y0 = yB(m, 0);
      g.line({ x: BAR_X - 0.35, y: y0 }, { x: BAR_X + 2 * BAR_W + 0.65, y: y0 }, { role: 'axis', width: 1 });
      const bar = (x: number, v: number, fill: 'force' | 'energyK', name: string) => {
        g.polygon(
          [
            { x, y: y0 },
            { x: x + BAR_W, y: y0 },
            { x: x + BAR_W, y: yB(m, v) },
            { x, y: yB(m, v) },
          ],
          { fill, fillAlpha: 0.85 },
        );
        const up = v >= 0;
        g.text({ x: x + BAR_W / 2, y: yB(m, v) }, fmtScale(v, m.sc.W), { size: 11, color: TICK, align: 'center', dy: up ? -6 : 14 });
        g.text({ x: x + BAR_W / 2, y: y0 }, name, { size: 13, color: '#1a1a1a', align: 'center', dy: up ? 18 : -8 });
      };
      bar(BAR_X, W, 'force', '*W*_{net}');
      bar(BAR_X + BAR_W + 0.3, K - K0, 'energyK', 'Δ*K*');
      g.text({ x: BAR_X - 0.35, y: y0 }, '(J)', { size: 12, color: TICK, align: 'right', baseline: 'middle', dx: -6 });
    }
  },

  handles: [0, 1, 2, 3].map((i) => ({
    when: (p: P) => p.preset === 'custom',
    pos: (_s: S, p: P) => {
      const m = model(p);
      const xm = ((i + 0.5) * TRACK) / SEG;
      return { x: U(m.su, xm), y: yF(m, p.custom[i]) };
    },
    radiusPx: 16,
    onDrag: (ctx, _s, w) => {
      const m = model(ctx.params);
      const span = F_BAND[1] - F_BAND[0];
      const F = m.F[0] + ((w.y - F_BAND[0]) / span) * (m.F[1] - m.F[0]);
      const v = Math.min(F_MAX, Math.max(-F_MAX, Math.round(F * 2) / 2));
      if (v === ctx.params.custom[i]) return;
      const next = [...ctx.params.custom];
      next[i] = v;
      ctx.set('custom', next);
    },
  })),

  readouts: [
    // Fixed decimals from the run scale, as in the Σ panel (policy D, R7a).
    { label: 'x', unit: 'm', value: (s) => s.x, scale: (p) => model(p).sc.x },
    { label: 'v', unit: 'm/s', value: (s) => s.v, scale: (p) => model(p).sc.v },
    { label: 'K', unit: 'J', value: (s, p) => kinetic(model(p).su.m, s.v), scale: (p) => model(p).sc.K },
  ],

  formula: (s, p) => formulaLines(s, p),

  info: {
    goals: ['ch07.goal.area', 'ch07.goal.theorem'],
    observe: ['ch07.obs.equal', 'ch07.obs.neg', 'ch07.obs.spring', 'ch07.obs.custom'],
    equations: ['W = \\int_{x_0}^{x} F(x)\\,dx', 'W_\\text{net} = \\Delta K = \\tfrac{1}{2}mv^2 - \\tfrac{1}{2}mv_0^2'],
    assumptions: ['ch07.assume'],
  },
};
