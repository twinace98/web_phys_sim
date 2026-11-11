// Ch 7 scene: work-kinetic energy theorem. The block on the track, the F(x) graph and the K(x)
// graph share one x axis. The signed area under F(x) from the start to the block (the work, as in
// the Ch 2 area overlay) always equals the change ΔK on the K(x) graph and in the bars.
import { fmt, fmtTick, niceTicks } from '../../core/format';
import { t as tr } from '../../core/i18n';
import type { ParamSchema, Scene, Vec2 } from '../../core/types';
import type { Draw } from '../../draw/draw';
import { color, theme, withAlpha } from '../../draw/theme';
import { LabelLayout } from '../ch03/labels';
import { F_MAX, SEG, TRACK, force, kinetic, makeSetup, trajectory, work, type Preset, type Setup, type Trajectory } from './physics';

type P = { preset: string; bars: boolean; custom: number[] };

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
const F_BAND: [number, number] = [3.4, 5.3];
const K_BAND: [number, number] = [0.45, 2.55];
const BAR_W = 0.55;

/** Narrow (portrait) screens put the bars under the graphs instead of beside them. */
const narrow = () => typeof window !== 'undefined' && window.matchMedia('(max-width: 767px)').matches;
function barBox(): { x: number; mid: number; half: number } {
  if (narrow()) return { x: TRACK / 2 - BAR_W - 0.15, mid: -2.3, half: 1.2 };
  return { x: TRACK + 1.6, mid: (F_BAND[1] + K_BAND[0]) / 2, half: (F_BAND[1] - K_BAND[0]) / 2 };
}

let memoKey = '';
let memo: { su: Setup; tj: Trajectory; F: [number, number]; K: number; B: number } | null = null;
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
    memo = { su, tj, F: [fLo - 0.15 * span, fHi + 0.15 * span], K: Math.max(K, 1) * 1.15, B: Math.max(B, 1) * 1.1 };
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
  bars: { kind: 'toggle', label: 'ch07.p.bars', desc: 'ch07.d.bars', group: 'advanced', live: true, default: true },
  custom: { kind: 'array', label: 'ch07.p.custom', group: 'hidden', live: false, default: [1, 0.5, -1, -0.5], min: -F_MAX, max: F_MAX },
};

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

export const workEnergy: Scene<P, S> = {
  id: 'work',
  title: 'ch07.scene',
  params,
  time: { h: 1 / RATE, recordEvery: 1, frameStep: 0.05, tEnd: (p) => model(p as P).tj.tEnd },

  world: (p) => {
    if (narrow()) return { x: [-0.9, TRACK + 0.5], y: [p.bars ? -3.7 : -0.5, 7.0], aspect: 'contain', padPx: 10 };
    return { x: [-0.9, p.bars ? barBox().x + 2 * BAR_W + 1.2 : TRACK + 0.5], y: [-0.5, 7.0], aspect: 'contain', padPx: 14 };
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
    g.line({ x: ub, y: K_BAND[0] }, { x: ub, y: Y_TRACK }, { color: GUIDE, width: 1, dash: [3, 4] });

    // Track and block with its force and velocity arrows.
    g.line({ x: 0, y: Y_TRACK }, { x: TRACK, y: Y_TRACK }, { role: 'axis', width: 1.5 });
    for (const x of ticks) g.line({ x: U(su, x), y: Y_TRACK }, { x: U(su, x), y: Y_TRACK - g.px(4) }, { role: 'axis', width: 1 });
    const F = force(su.prof, s.x);
    const bw = g.px(13);
    const bh = g.px(22);
    g.polygon(
      [
        { x: ub - bw, y: Y_TRACK },
        { x: ub + bw, y: Y_TRACK },
        { x: ub + bw, y: Y_TRACK + bh },
        { x: ub - bw, y: Y_TRACK + bh },
      ],
      { fill: 'position' },
    );
    const kf = 0.35; // world units per N
    if (Math.abs(F) > 1e-9) g.arrow({ x: ub + Math.sign(F) * bw, y: Y_TRACK + bh / 2 }, { x: F * kf, y: 0 }, { role: 'force', width: 2.5, label: '*F*' });
    if (Math.abs(s.v) > 1e-6) g.arrow({ x: ub, y: Y_TRACK + bh + g.px(12) }, { x: (s.v / 3) * 0.7, y: 0 }, { role: 'velocity', label: '*v*' });

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
    lay.polyline(fPts);
    if (p.preset === 'custom') {
      for (let i = 0; i < SEG; i++) {
        const [hx, hy] = g.vp.toPx(U(su, ((i + 0.5) * TRACK) / SEG), yF(m, p.custom[i]));
        lay.boxes.push({ x0: hx - 15, y0: hy - 6, x1: hx + 15, y1: hy + 6 });
      }
    }
    const [gx, gTop] = g.vp.toPx(ub, F_BAND[1]);
    const [, gBot] = g.vp.toPx(ub, F_BAND[0]);
    const sc = theme.scale;
    const rightFirst = ub <= TRACK * 0.7;
    const sides: ('left' | 'right')[] = rightFirst ? ['left', 'right'] : ['right', 'left'];
    const cands: { x: number; y: number; align: 'left' | 'right' }[] = [];
    for (const y of [gTop - 4 * sc, gTop + 12 * sc, gBot - 6 * sc]) {
      for (const al of sides) cands.push({ x: gx + (al === 'left' ? 8 : -8) * sc, y, align: al });
    }
    lay.place(cands, `${tr('plot.area')} = ${fmt(W)} J`, 'force', 12, 500);

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
    lay.place(kc, `Δ*K* = ${fmt(K - K0)} J`, 'energyK', 12, 500);

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
        g.text({ x: x + BAR_W / 2, y: yB(m, v) }, fmt(v), { size: 11, color: TICK, align: 'center', dy: up ? -6 : 14 });
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
    { label: 'x', unit: 'm', value: (s) => s.x },
    { label: 'v', unit: 'm/s', value: (s) => s.v },
    { label: 'K', unit: 'J', value: (s, p) => kinetic(model(p).su.m, s.v) },
  ],

  info: {
    goals: ['ch07.goal.area', 'ch07.goal.theorem'],
    observe: ['ch07.obs.equal', 'ch07.obs.neg', 'ch07.obs.spring', 'ch07.obs.custom'],
    equations: ['W = \\int_{x_0}^{x} F(x)\\,dx', 'W_\\text{net} = \\Delta K = \\tfrac{1}{2}mv^2 - \\tfrac{1}{2}mv_0^2'],
    assumptions: ['ch07.assume'],
  },
};
