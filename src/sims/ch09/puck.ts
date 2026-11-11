// Ch 9 scene: two pucks collide on a frictionless table. The momentum vectors added tail to
// head always close on the same total, before and after the collision.
import { t as tr } from '../../core/i18n';
import type { ParamSchema, Scene, Vec2 } from '../../core/types';
import type { Draw } from '../../draw/draw';
import { C1, C2, cmMark, halo, padded, trioLabel } from './common';
import { kinetic2, motion2D, state2D, type Kind2D, type Motion2D, type Puck } from './physics';

type P = { kind: string; b: number; m2: number; v1: number; e: number };

interface S {
  t: number;
  n: number;
}

const RATE = 240;
const T_C = 2;
const T_END = 5;
const BLACK = '#1a1a1a';
const radius = (m: number) => 0.18 * Math.sqrt(m);
const M2_MIN = 0.5;
/** Largest impact parameter that still gives a clear (not grazing) hit: 0.95 (R1 + R2). */
export const bMax = (m2: number) => 0.95 * (radius(1) + radius(m2));
/** Slider maximum: bMax at the smallest m2 (0.29 m), so every b on the slider hits for every m2. */
const B_SLIDER = Math.floor(bMax(M2_MIN) * 100) / 100;
/** b actually used: clamped to bMax (only a hand-edited URL can exceed it). */
export const bOf = (p: P) => Math.min(Math.max(p.b, 0), bMax(p.m2));

let memoKey = '';
let memo: {
  mo: Motion2D;
  box: { x0: number; x1: number; y0: number; y1: number };
  /** Momentum diagram: origin and scale [world m per kg·m/s]. */
  dia: { o: Vec2; k: number; up: number };
} | null = null;

function model(p: P) {
  const key = `${p.kind}|${p.b}|${p.m2}|${p.v1}|${p.e}`;
  if (key !== memoKey || !memo) {
    const R1 = radius(1);
    const R2 = radius(p.m2);
    const s = R1 + R2;
    // Placed so that the pucks touch at t = T_C.
    const b = bOf(p);
    const dx = Math.sqrt(Math.max(0, s * s - b * b));
    const a: Puck = { m: 1, R: R1, x: [-dx - p.v1 * T_C, b], v: [p.v1, 0] };
    const c: Puck = { m: p.m2, R: R2, x: [0, 0], v: [0, 0] };
    const mo = motion2D(a, c, p.kind as Kind2D, p.e);
    const xs: number[] = [];
    const ys: number[] = [];
    for (const t of [0, Math.min(mo.tc, T_END), T_END]) {
      for (const q of state2D(mo, t)) {
        xs.push(q.x[0] - q.R, q.x[0] + q.R);
        ys.push(q.x[1] - q.R, q.x[1] + q.R);
      }
    }
    const box = { x0: Math.min(...xs), x1: Math.max(...xs), y0: Math.min(...ys), y1: Math.max(...ys) };
    // Diagram below the table: total momentum spans 40 % of the width.
    const pt = p.v1;
    const k = (0.4 * (box.x1 - box.x0)) / pt;
    const after = mo.at.map((q) => q.m * q.v[1]);
    const up = Math.max(0, ...after) * k;
    // Gap under the table scales with the width (hence the drawing scale): its title, 18 px
    // above the diagram, then stays clear of the lowest puck and its trail on a phone too.
    const gap = Math.max(0.45, 0.12 * (box.x1 - box.x0));
    const o = { x: box.x0 + 0.1 * (box.x1 - box.x0), y: box.y0 - gap - up };
    memo = { mo, box, dia: { o, k, up } };
    memoKey = key;
  }
  return memo;
}

function sample(p: P, t: number) {
  const [a, b] = state2D(model(p).mo, t);
  const K1 = kinetic2(a);
  const K2 = kinetic2(b);
  return {
    a,
    b,
    p1: [a.m * a.v[0], a.m * a.v[1]] as [number, number],
    p2: [b.m * b.v[0], b.m * b.v[1]] as [number, number],
    K1,
    K2,
    Kt: K1 + K2,
  };
}

function ranges(p: P) {
  const { mo } = model(p);
  const vals = { px: [] as number[], py: [] as number[], K: [] as number[] };
  for (const t of [0, Number.isFinite(mo.tc) ? Math.min(mo.tc + 1e-9, T_END) : 0]) {
    const k = sample(p, t);
    vals.px.push(k.p1[0], k.p2[0], k.p1[0] + k.p2[0]);
    vals.py.push(k.p1[1], k.p2[1]);
    vals.K.push(k.K1, k.K2, k.Kt);
  }
  return vals;
}

const params: ParamSchema<P> = {
  kind: {
    kind: 'select',
    label: 'ch09.p.kind',
    desc: 'ch09.d.kind2',
    group: 'main',
    live: false,
    default: 'elastic',
    options: [
      { value: 'elastic', label: 'ch09.kind.elastic' },
      { value: 'inelastic', label: 'ch09.kind.inelastic' },
      { value: 'stick', label: 'ch09.kind.stick' },
    ],
  },
  b: { kind: 'number', label: 'ch09.p.b', desc: 'ch09.d.b', group: 'main', live: false, control: 'slider', min: 0, max: B_SLIDER, step: 0.01, default: 0.2, unit: 'm' },
  m2: { kind: 'number', label: 'ch09.p.m2', desc: 'ch09.d.m2p', group: 'advanced', live: false, control: 'slider', min: M2_MIN, max: 2, step: 0.1, default: 1, unit: 'kg' },
  v1: { kind: 'number', label: 'ch09.p.v1', desc: 'ch09.d.v1p', group: 'advanced', live: false, control: 'slider', min: 0.5, max: 2, step: 0.1, default: 1.5, unit: 'm/s' },
  e: {
    kind: 'number',
    label: 'ch09.p.e',
    desc: 'ch09.d.e',
    group: 'advanced',
    live: false,
    control: 'slider',
    min: 0.05,
    max: 0.95,
    step: 0.05,
    default: 0.5,
    visibleIf: (p) => p.kind === 'inelastic',
  },
};

function puck(g: Draw, q: Puck, fill: string, name: string): void {
  const c = { x: q.x[0], y: q.x[1] };
  g.polygon(circlePts(c, q.R), { fill, fillAlpha: 0.9 });
  if (q.R > g.px(9)) g.text(c, name, { size: 12, color: '#ffffff', align: 'center', baseline: 'middle', weight: 600 });
}

function circlePts(c: Vec2, r: number): Vec2[] {
  const pts: Vec2[] = [];
  for (let i = 0; i < 48; i++) pts.push({ x: c.x + r * Math.cos((i / 48) * 2 * Math.PI), y: c.y + r * Math.sin((i / 48) * 2 * Math.PI) });
  return pts;
}

/** Text offset `d` px from `at` along unit vector n. */
function offText(g: Draw, at: Vec2, n: Vec2, d: number, s: string, color: string): void {
  const align = n.x > 0.35 ? 'left' : n.x < -0.35 ? 'right' : 'center';
  g.text({ x: at.x + n.x * g.px(d), y: at.y + n.y * g.px(d) }, s, { size: 13, color, align, baseline: 'middle' });
}

/** p1 + p2 = p_tot drawn tail to head. Labels for p1, p2 on one side of p_tot, its own on the other. */
function diagram(g: Draw, o: Vec2, k: number, p1: [number, number], p2: [number, number]): void {
  const A: Vec2 = { x: o.x + p1[0] * k, y: o.y + p1[1] * k };
  const S: Vec2 = { x: A.x + p2[0] * k, y: A.y + p2[1] * k };
  const sx = S.x - o.x;
  const sy = S.y - o.y;
  const L = Math.hypot(sx, sy);
  if (L < 1e-9) return;
  let n = { x: -sy / L, y: sx / L };
  if (n.y < 0) n = { x: -n.x, y: -n.y };
  const side = (A.x - o.x) * n.x + (A.y - o.y) * n.y < -1e-9 ? -1 : 1;
  const up = { x: n.x * side, y: n.y * side };
  const big = (v: [number, number]) => Math.hypot(v[0], v[1]) * k > g.px(4);
  g.arrow(o, { x: sx, y: sy }, { color: BLACK, width: 3 });
  if (big(p1)) g.arrow(o, { x: p1[0] * k, y: p1[1] * k }, { color: C1, width: 2.25 });
  if (big(p2)) g.arrow(A, { x: p2[0] * k, y: p2[1] * k }, { color: C2, width: 2.25 });
  offText(g, { x: (o.x + S.x) / 2, y: (o.y + S.y) / 2 }, { x: -up.x, y: -up.y }, 14, '*p*_{tot}', BLACK);
  // p1, p2 labels: beside the middle of each arrow, on the outside of the triangle.
  const c = { x: (o.x + A.x + S.x) / 3, y: (o.y + A.y + S.y) / 3 };
  const outside = (P0: Vec2, P1: Vec2, s: string, color: string) => {
    const m = { x: (P0.x + P1.x) / 2, y: (P0.y + P1.y) / 2 };
    const L = Math.hypot(P1.x - P0.x, P1.y - P0.y);
    let n = { x: -(P1.y - P0.y) / L, y: (P1.x - P0.x) / L };
    const d = (m.x - c.x) * n.x + (m.y - c.y) * n.y;
    if (Math.abs(d) > g.px(2) ? d < 0 : n.x * up.x + n.y * up.y < 0) n = { x: -n.x, y: -n.y };
    offText(g, m, n, 12, s, color);
  };
  if (big(p1)) outside(o, A, '*p*_{1}', C1);
  if (big(p2)) outside(A, S, '*p*_{2}', C2);
}

export const puckScene: Scene<P, S> = {
  id: 'puck',
  title: 'ch09.k.scene',
  layout: 'side',
  params,
  time: { h: 1 / RATE, recordEvery: 2, frameStep: 0.05, tEnd: T_END },

  world: (p) => {
    const { box, dia } = model(p);
    const w = box.x1 - box.x0;
    const bottom = dia.o.y - dia.up - 0.25;
    return { x: [box.x0 - 0.05 * w, box.x1 + 0.05 * w], y: [bottom, box.y1 + 0.2], aspect: 'contain', padPx: 16 };
  },

  init: () => ({ t: 0, n: 0 }),
  step: (s) => {
    s.n += 1;
    s.t = Math.min(s.n / RATE, T_END);
  },

  record: (s, p) => {
    const k = sample(p, s.t);
    return {
      t: s.t,
      p1x: k.p1[0],
      p2x: k.p2[0],
      ptx: k.p1[0] + k.p2[0],
      p1y: k.p1[1],
      p2y: k.p2[1],
      pty: k.p1[1] + k.p2[1],
      K1: k.K1,
      K2: k.K2,
      Kt: k.Kt,
    };
  },
  snapshot: (s) => ({ ...s }),

  draw: (g, s, p) => {
    const { mo, dia } = model(p);
    const k = sample(p, s.t);
    // Paths so far: straight segments joined at the collision.
    const path = (i: 0 | 1): Vec2[] => {
      const pts: Vec2[] = [];
      for (const t of [0, Math.min(mo.tc, s.t), s.t]) {
        const q = state2D(mo, t)[i];
        pts.push({ x: q.x[0], y: q.x[1] });
      }
      return pts;
    };
    g.polyline(path(0), { color: C1, width: 1.25, dash: [4, 4], alpha: 0.7 });
    g.polyline(path(1), { color: C2, width: 1.25, dash: [4, 4], alpha: 0.7 });
    const M = k.a.m + k.b.m;
    const cm = (q: [Puck, Puck]): Vec2 => ({ x: (q[0].m * q[0].x[0] + q[1].m * q[1].x[0]) / M, y: (q[0].m * q[0].x[1] + q[1].m * q[1].x[1]) / M });
    g.line(cm(state2D(mo, 0)), cm([k.a, k.b]), { color: BLACK, width: 1, dash: [2, 4], alpha: 0.6 });
    puck(g, k.a, C1, '1');
    puck(g, k.b, C2, '2');
    cmMark(g, cm([k.a, k.b]), 6);

    diagram(g, dia.o, dia.k, k.p1, k.p2);
    g.text({ x: dia.o.x, y: dia.o.y + dia.up }, tr('ch09.k.diagram'), { size: 12, color: '#6b6b6b', align: 'left', dy: -18 });
  },

  plots: [
    {
      id: 'px',
      label: trioLabel('p_{1x}', 'p_{2x}', 'p_{\\mathrm{tot},x}', 'kg\\,m/s'),
      traces: [
        { channel: 'p1x', role: 'position' },
        { channel: 'p2x', role: 'energyU' },
        { channel: 'ptx', role: 'fg' },
      ],
      yRange: (p) => padded(ranges(p).px, 1),
    },
    {
      id: 'py',
      label: trioLabel('p_{1y}', 'p_{2y}', 'p_{\\mathrm{tot},y}', 'kg\\,m/s'),
      traces: [
        { channel: 'p1y', role: 'position' },
        { channel: 'p2y', role: 'energyU' },
        { channel: 'pty', role: 'fg' },
      ],
      yRange: (p) => padded(ranges(p).py, 1),
    },
    {
      id: 'K',
      label: trioLabel('K_1', 'K_2', 'K_\\mathrm{tot}', 'J'),
      traces: [
        { channel: 'K1', role: 'position' },
        { channel: 'K2', role: 'energyU' },
        { channel: 'Kt', role: 'fg' },
      ],
      yRange: (p) => padded(ranges(p).K, 1),
    },
  ],

  drawPlot: (id, pd, p, ui) => {
    const f = (t: number) => {
      const k = sample(p, t);
      return id === 'px' ? k.p1[0] : id === 'py' ? k.p1[1] : k.K1;
    };
    halo(pd, f, ui.t, [model(p).mo.tc]);
  },

  readouts: [
    { label: 'p_{\\mathrm{tot},x}', unit: 'kg·m/s', value: (s, p) => sample(p, s.t).p1[0] + sample(p, s.t).p2[0] },
    { label: 'p_{\\mathrm{tot},y}', unit: 'kg·m/s', value: (s, p) => sample(p, s.t).p1[1] + sample(p, s.t).p2[1] },
    { label: 'K_\\mathrm{tot}', unit: 'J', value: (s, p) => sample(p, s.t).Kt },
  ],

  info: {
    goals: ['ch09.k.goal.vec', 'ch09.k.goal.comp'],
    observe: ['ch09.k.obs.diagram', 'ch09.k.obs.right', 'ch09.k.obs.headon', 'ch09.k.obs.stick'],
    equations: ['\\vec p_{1i} + \\vec p_{2i} = \\vec p_{1f} + \\vec p_{2f}', 'p_{\\mathrm{tot},x},\\ p_{\\mathrm{tot},y}\\ \\text{const.}'],
    assumptions: ['ch09.k.assume'],
  },
};
