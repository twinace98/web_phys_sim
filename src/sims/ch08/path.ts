// Ch 8 scene: path independence. A particle is carried from A to B along different paths; the
// cumulative work of gravity or a spring ends at the same value on every path (zero around a
// closed path), while the work of kinetic friction grows with the path length.
import { fmtTick, niceTicks } from '../../core/format';
import type { ParamSchema, Scene, Vec2 } from '../../core/types';
import type { Draw } from '../../draw/draw';
import { A, ANCHOR, B, along, forceAt, pathPoints, pathWork, pieceWork, type ForceKind, type PathKind, type PathWork, type V2 } from './physics';

type P = { path: string; force: string; closed: boolean; via: number[] };

interface S {
  t: number;
  n: number;
}

const RATE = 240;
const SPEED = 1.5; // m/s along the path
const KINDS: PathKind[] = ['straight', 'arc', 'zigzag', 'custom'];
const KF = 0.08; // world m per N
const TICK = '#6b6b6b';
const OTHER = '#cfcfcf';
const LIM = 2.8;

const narrow = () => typeof window !== 'undefined' && window.matchMedia('(max-width: 767px)').matches;

/** Graph box in world coordinates: right of the plane, or under it on narrow screens. */
const box = () => (narrow() ? { x0: -2.6, x1: 3.0, y0: -6.6, y1: -3.4 } : { x0: 4.4, x1: 9.8, y0: -1.7, y1: 2.6 });

const kindOf = (p: P) => (KINDS.includes(p.path as PathKind) ? p.path : 'straight') as PathKind;
const forceOf = (p: P) => (['gravity', 'spring', 'friction'].includes(p.force) ? p.force : 'gravity') as ForceKind;
const via = (p: P): V2 => [p.via[0], p.via[1]];

let memoKey = '';
let memo: { all: Record<PathKind, PathWork>; Lmax: number; W: [number, number] } | null = null;
function model(p: P) {
  const key = `${p.force}|${p.closed}|${p.via.join(',')}`;
  if (key !== memoKey || !memo) {
    const f = forceOf(p);
    const all = {} as Record<PathKind, PathWork>;
    let Lmax = 0;
    let lo = 0;
    let hi = 0;
    for (const k of KINDS) {
      all[k] = pathWork(f, pathPoints(k, via(p), p.closed));
      Lmax = Math.max(Lmax, all[k].L);
      // Extremes along the path, sampled finely (the spring's work is not monotonic).
      for (let i = 0; i <= 400; i++) {
        const w = along(all[k], f, (all[k].L * i) / 400).W;
        lo = Math.min(lo, w);
        hi = Math.max(hi, w);
      }
    }
    const pad = 0.1 * Math.max(hi - lo, 1);
    memo = { all, Lmax, W: [lo - pad, hi + pad] };
    memoKey = key;
  }
  return memo;
}

const current = (p: P) => model(p).all[kindOf(p)];
const tEnd = (p: P) => current(p).L / SPEED;

const params: ParamSchema<P> = {
  path: {
    kind: 'select',
    label: 'ch08.p.p.path',
    desc: 'ch08.p.d.path',
    group: 'main',
    live: false,
    default: 'arc',
    options: [
      { value: 'straight', label: 'ch08.p.path.straight' },
      { value: 'arc', label: 'ch08.p.path.arc' },
      { value: 'zigzag', label: 'ch08.p.path.zigzag' },
      { value: 'custom', label: 'ch08.p.path.custom' },
    ],
  },
  force: {
    kind: 'select',
    label: 'ch08.p.p.force',
    desc: 'ch08.p.d.force',
    group: 'main',
    live: false,
    default: 'gravity',
    options: [
      { value: 'gravity', label: 'ch08.p.force.gravity' },
      { value: 'spring', label: 'ch08.p.force.spring' },
      { value: 'friction', label: 'ch08.p.force.friction' },
    ],
  },
  closed: { kind: 'toggle', label: 'ch08.p.p.closed', desc: 'ch08.p.d.closed', group: 'advanced', live: false, default: false },
  via: { kind: 'array', label: 'ch08.p.p.via', group: 'hidden', live: false, default: [1, -1.2], min: -LIM, max: LIM },
};

const P2 = (v: V2): Vec2 => ({ x: v[0], y: v[1] });

function drawGraph(g: Draw, p: P, s: number): void {
  const m = model(p);
  const f = forceOf(p);
  const b = box();
  const X = (q: number) => b.x0 + (q / m.Lmax) * (b.x1 - b.x0);
  const Y = (w: number) => b.y0 + ((w - m.W[0]) / (m.W[1] - m.W[0])) * (b.y1 - b.y0);
  // Axes.
  g.line({ x: b.x0, y: b.y0 }, { x: b.x0, y: b.y1 }, { role: 'axis', width: 1 });
  g.line({ x: b.x0, y: b.y0 }, { x: b.x1, y: b.y0 }, { role: 'axis', width: 1 });
  for (const w of niceTicks(m.W[0], m.W[1], 4)) {
    g.line({ x: b.x0, y: Y(w) }, { x: b.x0 - g.px(4), y: Y(w) }, { role: 'axis', width: 1 });
    g.text({ x: b.x0, y: Y(w) }, fmtTick(w), { size: 11, color: TICK, align: 'right', baseline: 'middle', dx: -7 });
  }
  for (const q of niceTicks(0, m.Lmax, 5)) {
    g.line({ x: X(q), y: b.y0 }, { x: X(q), y: b.y0 - g.px(4) }, { role: 'axis', width: 1 });
    g.text({ x: X(q), y: b.y0 }, fmtTick(q), { size: 11, color: TICK, align: 'center', dy: 16 });
  }
  if (m.W[0] < 0 && m.W[1] > 0) g.line({ x: b.x0, y: Y(0) }, { x: b.x1, y: Y(0) }, { color: '#e2e2e2', width: 1 });
  g.text({ x: b.x1, y: b.y0 }, '*s* (m)', { size: 12, color: TICK, align: 'right', dy: 32 });
  g.text({ x: b.x0, y: b.y1 }, '*W* (J)', { size: 13, color: '#1a1a1a', dx: 6, dy: -6 });

  // Every path, faint, with its end value; the chosen one bold up to the particle.
  const curve = (pw: PathWork, upTo: number): Vec2[] => {
    const N = 200;
    return Array.from({ length: N + 1 }, (_, i) => {
      const q = (upTo * i) / N;
      return { x: X(q), y: Y(along(pw, f, q).W) };
    });
  };
  for (const k of KINDS) {
    if (k === 'custom' && kindOf(p) !== 'custom') continue;
    const pw = m.all[k];
    g.polyline(curve(pw, pw.L), { color: k === kindOf(p) ? '#e6c3d8' : OTHER, width: 1.5 });
    g.circle({ x: X(pw.L), y: Y(pw.W[pw.W.length - 1]) }, 3, { fill: k === kindOf(p) ? '#e6c3d8' : '#b5b5b5' });
  }
  const pw = current(p);
  g.polyline(curve(pw, s), { role: 'force', width: 2.5 });
  g.circle({ x: X(s), y: Y(along(pw, f, s).W) }, 4.5, { fill: 'force' });

  // Conservative force, open path: every path ends at W_AB.
  if (f !== 'friction' && !p.closed) {
    const wab = pieceWork(f, A, B);
    g.line({ x: b.x0, y: Y(wab) }, { x: b.x1, y: Y(wab) }, { color: '#9a9a9a', width: 1, dash: [4, 4] });
  }
}

function spring(g: Draw, a: Vec2, b: Vec2): void {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const L = Math.hypot(dx, dy);
  if (L < 1e-6) return;
  const n = { x: -dy / L, y: dx / L };
  const pts: Vec2[] = [a];
  const k = 12;
  for (let i = 1; i < k; i++) {
    const s = i % 2 ? 1 : -1;
    pts.push({ x: a.x + (dx * i) / k + n.x * g.px(5) * s, y: a.y + (dy * i) / k + n.y * g.px(5) * s });
  }
  pts.push(b);
  g.polyline(pts, { color: '#7a7a7a', width: 1.25 });
}

export const pathScene: Scene<P, S> = {
  id: 'path',
  title: 'ch08.p.scene',
  params,
  time: { h: 1 / RATE, recordEvery: 4, frameStep: 0.1, tEnd: (p) => tEnd(p as P) },

  world: () => (narrow() ? { x: [-3.4, 3.2], y: [-7.3, 3.2], aspect: 'contain', padPx: 10 } : { x: [-3.2, 10.3], y: [-2.4, 3.2], aspect: 'contain', padPx: 14 }),

  init: () => ({ t: 0, n: 0 }),
  step: (s, _h, p) => {
    s.n += 1;
    s.t = Math.min(s.n / RATE, tEnd(p));
  },
  snapshot: (s) => ({ ...s }),

  draw: (g, st, p) => {
    const m = model(p);
    const f = forceOf(p);
    const k = kindOf(p);
    const pw = m.all[k];
    const s = Math.min(st.t * SPEED, pw.L);
    const here = along(pw, f, s);

    // Other paths faint; the chosen path dashed orange, solid where already travelled.
    for (const q of KINDS) {
      if (q === k || (q === 'custom' && k !== 'custom')) continue;
      g.polyline(m.all[q].pts.map(P2), { color: OTHER, width: 1.25 });
    }
    g.polyline(pw.pts.map(P2), { role: 'surface', width: 1.75, dash: [6, 5] });
    const done: Vec2[] = [];
    for (let i = 0; i < pw.pts.length && pw.s[i] < s; i++) done.push(P2(pw.pts[i]));
    done.push(P2(here.p));
    g.polyline(done, { role: 'surface', width: 2.5 });

    for (const [pt, name, dx] of [
      [A, 'A', -12],
      [B, 'B', 12],
    ] as const) {
      g.circle(P2(pt), 4.5, { fill: 'fg' });
      g.text(P2(pt), name, { size: 15, color: '#1a1a1a', align: dx < 0 ? 'right' : 'left', baseline: 'middle', dx, dy: -10 });
    }
    if (k === 'custom') g.circle(P2(via(p)), 14, { fill: 'surface', alpha: 0.15 });

    const F = forceAt(f, here.p, here.dir);
    const pos = P2(here.p);
    if (f === 'spring') {
      g.polygon(
        [
          { x: ANCHOR[0] - 0.08, y: ANCHOR[1] - 0.08 },
          { x: ANCHOR[0] + 0.08, y: ANCHOR[1] - 0.08 },
          { x: ANCHOR[0] + 0.08, y: ANCHOR[1] + 0.08 },
          { x: ANCHOR[0] - 0.08, y: ANCHOR[1] + 0.08 },
        ],
        { fill: '#5c5c5c' },
      );
      spring(g, P2(ANCHOR), pos);
    }
    const label = f === 'gravity' ? '*m**g*' : f === 'spring' ? '*F*' : '*f*_{k}';
    g.arrow(pos, { x: F[0] * KF, y: F[1] * KF }, { role: 'force', width: 2.5, label });
    g.circle(pos, 8, { fill: 'position' });

    drawGraph(g, p, s);
  },

  handles: [
    {
      when: (p) => p.path === 'custom',
      pos: (_s, p) => P2(via(p)),
      radiusPx: 16,
      onDrag: (ctx, _s, w) => {
        const x = Math.round(Math.min(LIM, Math.max(-LIM, w.x)) * 10) / 10;
        const y = Math.round(Math.min(LIM, Math.max(-LIM, w.y)) * 10) / 10;
        if (x !== ctx.params.via[0] || y !== ctx.params.via[1]) ctx.set('via', [x, y]);
      },
    },
  ],

  readouts: [
    { label: 's', unit: 'm', value: (st, p) => Math.min(st.t * SPEED, current(p).L) },
    { label: 'W', unit: 'J', value: (st, p) => along(current(p), forceOf(p), st.t * SPEED).W },
  ],

  info: {
    goals: ['ch08.p.goal.cons', 'ch08.p.goal.fric'],
    observe: ['ch08.p.obs.same', 'ch08.p.obs.closed', 'ch08.p.obs.fric', 'ch08.p.obs.custom'],
    equations: ['W = \\int_A^B \\vec F\\cdot d\\vec r', '\\oint \\vec F_\\text{cons}\\cdot d\\vec r = 0, \\quad W_f = -\\mu_k m g\\, s'],
    assumptions: ['ch08.p.assume'],
  },
};

