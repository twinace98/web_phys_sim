// Ch 9 scene: two carts collide on a frictionless track. Momentum is conserved in every
// collision; kinetic energy only in the elastic one. The explosion adds energy.
import { fmtTick, niceTicks } from '../../core/format';
import type { ParamSchema, Scene, Vec2 } from '../../core/types';
import type { Draw } from '../../draw/draw';
import { C1, C2, TICK, cmMark, halo, padded, trioLabel } from './common';
import { kinetic, motion1D, state1D, type Kind1D, type Motion1D, type Track } from './physics';

type P = { kind: string; m2: number; m1: number; v1: number; v2: number; e: number; E: number; arrows: boolean };

interface S {
  t: number;
  n: number;
  x1: number;
  x2: number;
  v1: number;
  v2: number;
}

const RATE = 240;
const T_C = 2; // collision time for the default layout [s]
const T_END = 5;
const T_SEP = 1; // spring release [s]
const GAP = 0.12; // compressed spring [m]
const ARROW = 0.16; // longest momentum arrow, as a fraction of the motion span

/** Square carts with area proportional to mass. */
const side = (m: number) => 0.4 * Math.sqrt(m);

function trackOf(p: P): Track {
  const kind = p.kind as Kind1D;
  const w1 = side(p.m1);
  const w2 = side(p.m2);
  if (kind === 'explode') {
    return { kind, m1: p.m1, m2: p.m2, v1: 0, v2: 0, e: p.e, E: p.E, w1, w2, x1: -w1 / 2 - GAP / 2, x2: w2 / 2 + GAP / 2, tSep: T_SEP };
  }
  // Placed so that the carts touch at x = 0 at t = T_C.
  return { kind, m1: p.m1, m2: p.m2, v1: p.v1, v2: p.v2, e: p.e, E: p.E, w1, w2, x1: -w1 / 2 - p.v1 * T_C, x2: w2 / 2 - p.v2 * T_C, tSep: T_SEP };
}

let memoKey = '';
let memo: { tr: Track; mo: Motion1D; span: [number, number]; kp: number } | null = null;
function model(p: P) {
  const key = `${p.kind}|${p.m1}|${p.m2}|${p.v1}|${p.v2}|${p.e}|${p.E}`;
  if (key !== memoKey || !memo) {
    const tr = trackOf(p);
    const mo = motion1D(tr);
    const xs: number[] = [];
    for (const t of [0, Math.min(mo.tc, T_END), T_END]) {
      const k = state1D(tr, mo, t);
      xs.push(k.x1 - tr.w1 / 2, k.x2 + tr.w2 / 2);
    }
    const ps = [...mo.before, ...mo.after].flatMap((v, i) => [Math.abs(v * (i % 2 ? tr.m2 : tr.m1))]);
    const pTot = Math.abs(tr.m1 * mo.before[0] + tr.m2 * mo.before[1]);
    // Room on both sides for the momentum arrows (longest arrow: ARROW of the motion span).
    const lo = Math.min(...xs);
    const hi = Math.max(...xs);
    const room = ARROW * (hi - lo) + 0.3;
    memo = { tr, mo, span: [lo - room, hi + room], kp: (ARROW * (hi - lo)) / Math.max(...ps, pTot, 0.5) };
    memoKey = key;
  }
  return memo;
}

function sample(p: P, t: number) {
  const { tr, mo } = model(p);
  const k = state1D(tr, mo, t);
  const M = tr.m1 + tr.m2;
  const p1 = tr.m1 * k.v1;
  const p2 = tr.m2 * k.v2;
  const K1 = kinetic(tr.m1, k.v1);
  const K2 = kinetic(tr.m2, k.v2);
  return { ...k, p1, p2, pt: p1 + p2, K1, K2, Kt: K1 + K2, xcm: (tr.m1 * k.x1 + tr.m2 * k.x2) / M };
}

/** Plot ranges from the values before and after the event. */
function ranges(p: P) {
  const { mo } = model(p);
  const a = sample(p, 0);
  const b = sample(p, Number.isFinite(mo.tc) ? Math.min(mo.tc + 1e-9, T_END) : 0);
  const c = sample(p, T_END);
  return {
    x: [a.x1, a.x2, c.x1, c.x2],
    p: [a.p1, a.p2, a.pt, b.p1, b.p2],
    K: [a.Kt, b.Kt, a.K1, a.K2, b.K1, b.K2],
  };
}

const params: ParamSchema<P> = {
  kind: {
    kind: 'select',
    label: 'ch09.p.kind',
    desc: 'ch09.d.kind',
    group: 'main',
    live: false,
    default: 'elastic',
    options: [
      { value: 'elastic', label: 'ch09.kind.elastic' },
      { value: 'inelastic', label: 'ch09.kind.inelastic' },
      { value: 'stick', label: 'ch09.kind.stick' },
      { value: 'explode', label: 'ch09.kind.explode' },
    ],
  },
  m2: { kind: 'number', label: 'ch09.p.m2', desc: 'ch09.d.m2', group: 'main', live: false, control: 'slider', min: 0.5, max: 4, step: 0.1, default: 1, unit: 'kg' },
  m1: { kind: 'number', label: 'ch09.p.m1', desc: 'ch09.d.m1', group: 'advanced', live: false, control: 'slider', min: 0.5, max: 4, step: 0.1, default: 1, unit: 'kg' },
  v1: {
    kind: 'number',
    label: 'ch09.p.v1',
    desc: 'ch09.d.v1',
    group: 'advanced',
    live: false,
    control: 'slider',
    min: 0.5,
    max: 3,
    step: 0.1,
    default: 2,
    unit: 'm/s',
    visibleIf: (p) => p.kind !== 'explode',
  },
  v2: {
    kind: 'number',
    label: 'ch09.p.v2',
    desc: 'ch09.d.v2',
    group: 'advanced',
    live: false,
    control: 'slider',
    min: -1.5,
    max: 0.4,
    step: 0.1,
    default: 0,
    unit: 'm/s',
    visibleIf: (p) => p.kind !== 'explode',
  },
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
  E: {
    kind: 'number',
    label: 'ch09.p.E',
    desc: 'ch09.d.E',
    group: 'advanced',
    live: false,
    control: 'slider',
    min: 0.5,
    max: 5,
    step: 0.1,
    default: 2,
    unit: 'J',
    visibleIf: (p) => p.kind === 'explode',
  },
  arrows: { kind: 'toggle', label: 'ch09.p.arrows', desc: 'ch09.d.arrows', group: 'advanced', live: true, default: true },
};

/** Compressed spring between the carts before the release. */
function spring(g: Draw, a: number, b: number, y: number): void {
  const pts: Vec2[] = [{ x: a, y }];
  const n = 8;
  const amp = g.px(5);
  for (let i = 1; i < n; i++) pts.push({ x: a + ((b - a) * i) / n, y: y + (i % 2 ? amp : -amp) });
  pts.push({ x: b, y });
  g.polyline(pts, { color: '#5c5c5c', width: 1.25 });
}

function cart(g: Draw, xc: number, w: number, fill: string, name: string): void {
  g.polygon(
    [
      { x: xc - w / 2, y: 0 },
      { x: xc + w / 2, y: 0 },
      { x: xc + w / 2, y: w },
      { x: xc - w / 2, y: w },
    ],
    { fill, fillAlpha: 0.9 },
  );
  g.text({ x: xc, y: w / 2 }, name, { size: 12, color: '#ffffff', align: 'center', baseline: 'middle', weight: 600 });
}

/** Momentum arrow with its label beyond the tip; nothing when p is (nearly) zero. */
function pArrow(g: Draw, from: Vec2, len: number, color: string, label: string, width: number): void {
  if (Math.abs(len) < g.px(3)) return;
  g.arrow(from, { x: len, y: 0 }, { color, width });
  g.text({ x: from.x + len, y: from.y }, label, { size: 13, color, align: len > 0 ? 'left' : 'right', baseline: 'middle', dx: len > 0 ? 6 : -6 });
}

export const track: Scene<P, S> = {
  id: 'track',
  title: 'ch09.t.scene',
  layout: 'stack',
  params,
  time: { h: 1 / RATE, recordEvery: 2, frameStep: 0.05, tEnd: T_END },

  world: (p) => {
    const { span, tr } = model(p);
    const top = Math.max(tr.w1, tr.w2);
    return { x: span, y: [-0.4, top + 0.75], aspect: 'contain', padPx: 12 };
  },

  init: (p) => ({ t: 0, n: 0, ...state1D(model(p).tr, model(p).mo, 0) }),

  step: (s, _h, p) => {
    s.n += 1;
    s.t = Math.min(s.n / RATE, T_END);
    Object.assign(s, state1D(model(p).tr, model(p).mo, s.t));
  },

  record: (s, p) => {
    const k = sample(p, s.t);
    return { t: s.t, x1: k.x1, x2: k.x2, xcm: k.xcm, p1: k.p1, p2: k.p2, pt: k.pt, K1: k.K1, K2: k.K2, Kt: k.Kt };
  },
  snapshot: (s) => ({ ...s }),

  draw: (g, s, p) => {
    const { tr, span, kp } = model(p);
    const [lo, hi] = span;
    g.line({ x: lo, y: 0 }, { x: hi, y: 0 }, { role: 'axis', width: 1.5 });
    for (const x of niceTicks(lo, hi, 10)) {
      g.line({ x, y: 0 }, { x, y: -g.px(5) }, { role: 'axis', width: 1 });
      g.text({ x, y: 0 }, fmtTick(x), { size: 11, color: TICK, align: 'center', dy: 17 });
    }

    const k = sample(p, s.t);
    if (tr.kind === 'explode' && s.t < tr.tSep) spring(g, k.x1 + tr.w1 / 2, k.x2 - tr.w2 / 2, Math.min(tr.w1, tr.w2) / 2);
    cart(g, k.x1, tr.w1, C1, '1');
    cart(g, k.x2, tr.w2, C2, '2');
    cmMark(g, { x: k.xcm, y: 0 });

    if (p.arrows) {
      // Three lanes above the carts: p1, p2 and their sum, all on the same scale.
      const y0 = Math.max(tr.w1, tr.w2) + g.px(16);
      const dy = g.px(20);
      pArrow(g, { x: k.x1, y: y0 }, k.p1 * kp, C1, '*p*_{1}', 2.25);
      pArrow(g, { x: k.x2, y: y0 + dy }, k.p2 * kp, C2, '*p*_{2}', 2.25);
      pArrow(g, { x: k.xcm, y: y0 + 2 * dy }, k.pt * kp, '#1a1a1a', '*p*_{tot}', 2.75);
    }
  },

  plots: [
    {
      id: 'x',
      label: trioLabel('x_1', 'x_2', 'x_\\mathrm{cm}', 'm'),
      traces: [
        { channel: 'x1', role: 'position' },
        { channel: 'x2', role: 'energyU' },
        { channel: 'xcm', role: 'fg' },
      ],
      yRange: (p) => padded(ranges(p).x, 1),
    },
    {
      id: 'p',
      label: trioLabel('p_1', 'p_2', 'p_\\mathrm{tot}', 'kg\\,m/s'),
      traces: [
        { channel: 'p1', role: 'position' },
        { channel: 'p2', role: 'energyU' },
        { channel: 'pt', role: 'fg' },
      ],
      yRange: (p) => padded(ranges(p).p, 1),
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
    const { mo, tr } = model(p);
    const ch = id === 'x' ? 'x1' : id === 'p' ? 'p1' : 'K1';
    halo(pd, (t) => sample(p, t)[ch], ui.t, [mo.tc, tr.tSep]);
  },

  readouts: [
    { label: 'p_\\mathrm{tot}', unit: 'kg·m/s', value: (s, p) => sample(p, s.t).pt },
    { label: 'K_\\mathrm{tot}', unit: 'J', value: (s, p) => sample(p, s.t).Kt },
    { label: 'v_\\mathrm{cm}', unit: 'm/s', value: (s, p) => sample(p, s.t).pt / (p.m1 + p.m2) },
  ],

  info: {
    goals: ['ch09.t.goal.p', 'ch09.t.goal.K'],
    observe: ['ch09.t.obs.ptot', 'ch09.t.obs.elastic', 'ch09.t.obs.stick', 'ch09.t.obs.explode', 'ch09.t.obs.cm'],
    equations: [
      'm_1 v_{1i} + m_2 v_{2i} = m_1 v_{1f} + m_2 v_{2f}',
      'e = \\frac{v_{2f} - v_{1f}}{v_{1i} - v_{2i}}',
      'v_\\mathrm{cm} = \\frac{m_1 v_1 + m_2 v_2}{m_1 + m_2} = \\frac{p_\\mathrm{tot}}{M}',
    ],
    assumptions: ['ch09.t.assume'],
  },
};
