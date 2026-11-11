// Ch 5 scene: third law. Two carts push each other apart: the forces are equal and opposite,
// the accelerations are inversely proportional to the masses.
import type { NumberParam, ParamSchema, Role, Scene } from '../../core/types';
import type { Draw, PlotDraw } from '../../draw/draw';
import { drawRich } from '../../draw/text';
import { color, theme } from '../../draw/theme';
import { drawTrack, padded } from './common';
import { cartsAt, type Carts } from './physics';

type P = { mA: number; mB: number; F: number };

interface S {
  t: number;
  n: number;
  xA: number;
  xB: number;
  vA: number;
  vB: number;
  aA: number;
  aB: number;
  FA: number;
  FB: number;
}

const RATE = 240;
const T_END = 3;
const TC = 1;
const CART_W = 46; // px
const CART_H = 26; // px
const SPRING = '#5c5c5c';

const cartsOf = (p: P): Carts => ({ mA: p.mA, mB: p.mB, F: p.F, tc: TC });

function stateAt(p: P, t: number): Omit<S, 't' | 'n'> {
  const k = cartsAt(cartsOf(p), t);
  return { xA: k.A.x, xB: k.B.x, vA: k.A.v, vB: k.B.v, aA: k.A.a, aB: k.B.a, FA: k.FA, FB: k.FB };
}

/** Half-width of the track: the farther cart's end position, at least 2 m. */
function half(p: P): number {
  const e = stateAt(p, T_END);
  return Math.max(-e.xA, e.xB, 2);
}

const massParam = (key: 'A' | 'B', def: number): NumberParam => ({
    kind: 'number',
    label: `ch05.t.p.m${key}`,
    desc: `ch05.t.d.m${key}`,
    group: 'main',
    live: false,
    control: 'slider',
    min: 0.5,
    max: 5,
    step: 0.1,
    default: def,
    unit: 'kg',
  });

const params: ParamSchema<P> = {
  mA: massParam('A', 1),
  mB: massParam('B', 2),
  F: {
    kind: 'number',
    label: 'ch05.t.p.F',
    desc: 'ch05.t.d.F',
    group: 'advanced',
    live: false,
    control: 'slider',
    min: 0.5,
    max: 5,
    step: 0.1,
    default: 2,
    unit: 'N',
  },
};

function cart(g: Draw, x0: number, x1: number, name: string): void {
  const h = g.px(CART_H);
  const y0 = g.px(6);
  g.polygon(
    [
      { x: x0, y: y0 },
      { x: x1, y: y0 },
      { x: x1, y: y0 + h },
      { x: x0, y: y0 + h },
    ],
    { fill: 'position', fillAlpha: 0.9 },
  );
  for (const x of [x0 + (x1 - x0) * 0.25, x0 + (x1 - x0) * 0.75]) g.circle({ x, y: g.px(4) }, 4, { fill: '#5c5c5c' });
  g.text({ x: (x0 + x1) / 2, y: y0 + h / 2 }, name, { size: 13, color: '#ffffff', align: 'center', baseline: 'middle', weight: 600 });
}

/** Zigzag spring between the facing sides while the carts touch it. */
function spring(g: Draw, a: number, b: number): void {
  const y = g.px(19);
  const amp = g.px(5);
  const pts = [{ x: a, y }];
  const n = 8;
  for (let i = 1; i < n; i++) pts.push({ x: a + ((b - a) * i) / n, y: y + (i % 2 ? amp : -amp) });
  pts.push({ x: b, y });
  g.polyline(pts, { color: SPRING, width: 1.25 });
}

/** Dashed analytic trace of cart B from 0 to the cursor, plus "A" / "B" tags. */
function drawB(pd: PlotDraw, p: P, tc: number, key: 'F' | 'a' | 'v', role: Role): void {
  const pts: [number, number][] = [];
  const N = 240;
  for (let i = 0; i <= N; i++) {
    const t = (tc * i) / N;
    const k = stateAt(p, t);
    pts.push([t, key === 'F' ? k.FB : key === 'a' ? k.aB : k.vB]);
  }
  pd.polyline(pts, { role, width: 2, dash: [6, 4] });

  // Tags beside the two curves, once the cursor has passed them: during contact, on the side
  // facing zero for F and a (the curves sit at the edges of the range), outside for v.
  const tTag = 0.5 * TC;
  if (tc < tTag) return;
  const k = stateAt(p, tTag);
  const yA = key === 'F' ? k.FA : key === 'a' ? k.aA : k.vA;
  const yB = key === 'F' ? k.FB : key === 'a' ? k.aB : k.vB;
  // A curve at the edge of the range gets its tag on the inner side; a small one, outside.
  const big = Math.max(Math.abs(yA), Math.abs(yB));
  const outA = key === 'v' || Math.abs(yA) < 0.5 * big ? 1 : -1;
  const outB = key === 'v' || Math.abs(yB) < 0.5 * big ? 1 : -1;
  const s = theme.scale;
  const c = color(role);
  const [xa, ya] = pd.toPx(tTag, yA);
  const [xb, yb] = pd.toPx(tTag, yB);
  drawRich(pd.ctx, 'A', xa, ya + outA * 11 * s, { size: 12, color: c, align: 'center', baseline: 'middle', weight: 600 });
  drawRich(pd.ctx, 'B', xb, yb - outB * 11 * s, { size: 12, color: c, align: 'center', baseline: 'middle', weight: 600 });
}

export const third: Scene<P, S> = {
  id: 'third',
  title: 'ch05.t.scene',
  layout: 'stack',
  params,
  time: { h: 1 / RATE, recordEvery: 1, frameStep: 0.1, tEnd: T_END },

  world: (p) => {
    const L = half(p) * 1.25;
    return { x: [-L, L], y: [-1, 1], aspect: 'fit-x', padPx: 28 };
  },

  init: (p) => ({ t: 0, n: 0, ...stateAt(p, 0) }),

  step: (s, _h, p) => {
    s.n += 1;
    s.t = Math.min(s.n / RATE, T_END);
    Object.assign(s, stateAt(p, s.t));
  },

  record: (s) => ({ t: s.t, FA: s.FA, aA: s.aA, vA: s.vA }),
  snapshot: (s) => ({ ...s }),

  draw: (g, s, p) => {
    const L = half(p) * 1.15;
    drawTrack(g, -L, L);
    const W = g.px(CART_W);
    // A sits left of its contact face xA, B right of xB; the spring hangs from A.
    if (s.t < TC) spring(g, s.xA, s.xB);
    cart(g, s.xA - W, s.xA, 'A');
    cart(g, s.xB, s.xB + W, 'B');

    const span = 2 * L;
    const fk = (0.1 * span) / 4; // world m per N
    const yF = g.px(19);
    if (s.FB !== 0) {
      g.arrow({ x: s.xA - W, y: yF }, { x: s.FA * fk, y: 0 }, { role: 'force', width: 2.5 });
      g.text({ x: s.xA - W + s.FA * fk, y: yF }, '*F*_{AB}', { size: 13, role: 'force', align: 'right', baseline: 'middle', dx: -12 });
      g.arrow({ x: s.xB + W, y: yF }, { x: s.FB * fk, y: 0 }, { role: 'force', width: 2.5 });
      g.text({ x: s.xB + W + s.FB * fk, y: yF }, '*F*_{BA}', { size: 13, role: 'force', align: 'left', baseline: 'middle', dx: 12 });
    }
    const vMax = Math.max((p.F / Math.min(p.mA, p.mB)) * TC, 0.1);
    const aMax = p.F / Math.min(p.mA, p.mB);
    const yv = g.px(CART_H + 26);
    const ya = g.px(CART_H + 48);
    for (const [x, v, a] of [
      [s.xA - W / 2, s.vA, s.aA],
      [s.xB + W / 2, s.vB, s.aB],
    ] as const) {
      if (Math.abs(v) > 1e-9) g.arrow({ x, y: yv }, { x: (v / vMax) * 0.12 * span, y: 0 }, { role: 'velocity', label: '*v*' });
      if (Math.abs(a) > 1e-9) g.arrow({ x, y: ya }, { x: (a / aMax) * 0.08 * span, y: 0 }, { role: 'acceleration', label: '*a*' });
    }
  },

  plots: [
    {
      id: 'F',
      label: 'F\\,(\\mathrm{N})',
      traces: [{ channel: 'FA', role: 'force' }],
      yRange: (p) => padded(-p.F, p.F, 1),
    },
    {
      id: 'a',
      label: 'a\\,(\\mathrm{m/s^2})',
      traces: [{ channel: 'aA', role: 'acceleration' }],
      yRange: (p) => padded(-p.F / p.mA, p.F / p.mB, 0.5),
    },
    {
      id: 'v',
      label: 'v\\,(\\mathrm{m/s})',
      traces: [{ channel: 'vA', role: 'velocity' }],
      yRange: (p) => padded((-p.F / p.mA) * TC, (p.F / p.mB) * TC, 0.5),
    },
  ],

  drawPlot: (id, pd, p, ui) => {
    const role: Role = id === 'F' ? 'force' : id === 'a' ? 'acceleration' : 'velocity';
    drawB(pd, p, ui.cursorT, id as 'F' | 'a' | 'v', role);
  },

  readouts: [
    { label: 'F_{AB}', unit: 'N', value: (s) => s.FA },
    { label: 'F_{BA}', unit: 'N', value: (s) => s.FB },
  ],

  info: {
    goals: ['ch05.t.goal.pair', 'ch05.t.goal.mass'],
    observe: ['ch05.t.obs.mirror', 'ch05.t.obs.ratio', 'ch05.t.obs.equal', 'ch05.t.obs.after'],
    equations: ['\\vec F_{AB} = -\\vec F_{BA}', 'm_A a_A = -m_B a_B \\;\\Rightarrow\\; \\frac{\\lvert a_A\\rvert}{\\lvert a_B\\rvert} = \\frac{m_B}{m_A}'],
    assumptions: ['ch05.t.assume'],
  },
};
