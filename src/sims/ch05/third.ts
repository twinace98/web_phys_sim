// Ch 5 scene: third law. Cart A carries a spring bumper. It either hits cart B (collide) or is
// released against it from rest (release). The force on each cart comes from the same spring
// compression, so F_AB = −F_BA at every instant, whatever the masses; only the accelerations
// differ. The free-body diagrams add N and mg on each cart: equal and opposite, but on the same
// body, so they are not a third-law pair.
import { tn, u } from '../../core/tex';
import type { NumberParam, ParamSchema, Role, Scene } from '../../core/types';
import { sigToMatch } from '../ch02/sigma';
import type { Draw, PlotDraw } from '../../draw/draw';
import { drawFbd } from '../../draw/fbd';
import { drawRich } from '../../draw/text';
import { color, theme } from '../../draw/theme';
import { padded } from './common';
import { bumperAt, contactWindow, peakForce, type Bumper } from './physics';

type P = { mode: string; mA: number; mB: number; v0: number; k: number; fbd: boolean };

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
/** Bumper natural length [m], contact time of the collision [s], release compression [m]. */
const L0 = 1;
const T1 = 0.6;
const C0 = 0.5;
/** Time shown after the carts separate [s]. */
const AFTER = 1.5;
export const THIRD_G = 9.8;
const CART_W = 46; // px
const CART_H = 26; // px
const SPRING = '#5c5c5c';
/** Longest arrow on the stage [px]. */
const F_LEN = 44;
const V_LEN = 60;
/** Longest arrow of the free-body diagrams [px]. */
const FBD_LEN = 58;

export const bumperOf = (p: P): Bumper => ({
  mA: p.mA,
  mB: p.mB,
  k: p.k,
  L0,
  mode: p.mode === 'release' ? 'release' : 'collide',
  v0: p.v0,
  t1: T1,
  c0: C0,
});

const tEnd = (p: P) => contactWindow(bumperOf(p))[1] + AFTER;

function stateAt(p: P, t: number): Omit<S, 't' | 'n'> {
  const k = bumperAt(bumperOf(p), t);
  return { xA: k.A.x, xB: k.B.x, vA: k.A.v, vB: k.B.v, aA: k.A.a, aB: k.B.a, FA: k.FA, FB: k.FB };
}

/** Faces at the start and the end: the stage spans both. */
function span(p: P): [number, number] {
  const s0 = stateAt(p, 0);
  const s1 = stateAt(p, tEnd(p));
  let lo = Math.min(s0.xA, s1.xA);
  let hi = Math.max(s0.xB, s1.xB, lo + L0);
  if (hi - lo < 4) {
    const mid = (lo + hi) / 2;
    lo = mid - 2;
    hi = mid + 2;
  }
  return [lo, hi];
}

/** Range of the velocities over the run (monotonic during the contact). */
function vRange(p: P): [number, number] {
  const s0 = stateAt(p, 0);
  const s1 = stateAt(p, tEnd(p));
  const vs = [s0.vA, s0.vB, s1.vA, s1.vB];
  return [Math.min(...vs), Math.max(...vs)];
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
  mode: {
    kind: 'select',
    label: 'ch05.t.p.mode',
    desc: 'ch05.t.d.mode',
    group: 'main',
    live: false,
    default: 'collide',
    options: [
      { value: 'collide', label: 'ch05.t.mode.collide' },
      { value: 'release', label: 'ch05.t.mode.release' },
    ],
  },
  mA: massParam('A', 3),
  mB: massParam('B', 1),
  fbd: { kind: 'toggle', label: 'fbd.p', desc: 'fbd.d', group: 'main', live: true, default: false },
  v0: {
    kind: 'number',
    label: 'ch05.t.p.v0',
    desc: 'ch05.t.d.v0',
    group: 'advanced',
    live: false,
    control: 'slider',
    min: 0.5,
    max: 3,
    step: 0.1,
    default: 2,
    unit: 'm/s',
    visibleIf: (p) => p.mode !== 'release',
  },
  k: {
    kind: 'number',
    label: 'ch05.t.p.k',
    desc: 'ch05.t.d.k',
    group: 'advanced',
    live: false,
    control: 'slider',
    min: 30,
    max: 150,
    step: 5,
    default: 50,
    unit: 'N/m',
  },
};

function cart(g: Draw, x0: number, x1: number, name: string, faded = false): void {
  const h = g.px(CART_H);
  const y0 = g.px(6);
  g.polygon(
    [
      { x: x0, y: y0 },
      { x: x1, y: y0 },
      { x: x1, y: y0 + h },
      { x: x0, y: y0 + h },
    ],
    { fill: 'position', fillAlpha: faded ? 0.25 : 0.9 },
  );
  for (const x of [x0 + (x1 - x0) * 0.25, x0 + (x1 - x0) * 0.75]) g.circle({ x, y: g.px(4) }, 4, { fill: '#5c5c5c' });
  g.text({ x: (x0 + x1) / 2, y: y0 + h / 2 }, name, { size: 13, color: faded ? color('position') : '#ffffff', align: 'center', baseline: 'middle', weight: 600 });
}

/** Bumper on A's right face: zigzag to its free end (natural length) or to B's face when compressed. */
function bumper(g: Draw, a: number, b: number): void {
  const y = g.px(19);
  const amp = g.px(5);
  const pts = [{ x: a, y }];
  const n = 8;
  for (let i = 1; i < n; i++) pts.push({ x: a + ((b - a) * i) / n, y: y + (i % 2 ? amp : -amp) });
  pts.push({ x: b, y });
  g.polyline(pts, { color: SPRING, width: 1.25 });
  // End plate.
  g.line({ x: b, y: y - g.px(9) }, { x: b, y: y + g.px(9) }, { color: SPRING, width: 2.5 });
}

/** Dashed analytic trace of cart B from 0 to the cursor, plus "A" / "B" tags. */
function drawB(pd: PlotDraw, p: P, tc: number, key: 'F' | 'a' | 'v', role: Role): void {
  const pts: [number, number][] = [];
  const N = 360;
  for (let i = 0; i <= N; i++) {
    const t = (tc * i) / N;
    const k = stateAt(p, t);
    pts.push([t, key === 'F' ? k.FB : key === 'a' ? k.aB : k.vB]);
  }
  pd.polyline(pts, { role, width: 2, dash: [6, 4] });

  // Tags beside the two curves at the middle of the contact (largest force), once the cursor has
  // passed it: on the side facing zero for F and a (the curves sit at the edges of the range),
  // outside for v. After the contact for v, where the two lines are farthest apart.
  const [t0, t2] = contactWindow(bumperOf(p));
  const tTag = key === 'v' ? Math.min(t2 + 0.5 * AFTER, tEnd(p)) : (t0 + t2) / 2;
  if (tc < tTag) return;
  const k = stateAt(p, tTag);
  const yA = key === 'F' ? k.FA : key === 'a' ? k.aA : k.vA;
  const yB = key === 'F' ? k.FB : key === 'a' ? k.aB : k.vB;
  const s = theme.scale;
  const c = color(role);
  const [xa, ya] = pd.toPx(tTag, yA);
  const [xb, yb] = pd.toPx(tTag, yB);
  // Screen y grows downwards: B above A for F and a (B's values are positive).
  const above = yB >= yA;
  const off = key === 'v' ? 11 : -11;
  drawRich(pd.ctx, 'A', xa, ya + (above ? -off : off) * s, { size: 12, color: c, align: 'center', baseline: 'middle', weight: 600 });
  drawRich(pd.ctx, 'B', xb, yb + (above ? off : -off) * s, { size: 12, color: c, align: 'center', baseline: 'middle', weight: 600 });
}

/** Free-body diagram of one cart from its centre: contact force, normal force and weight. */
function fbd(g: Draw, x: number, F: number, m: number, name: 'A' | 'B', perN: number): void {
  const W = m * THIRD_G;
  const other = name === 'A' ? 'B' : 'A';
  // The pair force in the force colour; N and mg muted: they balance on one cart and are not a pair.
  drawFbd(g, { x, y: g.px(19) }, [
    { F: { x: F, y: 0 }, label: `*F*_{${name}${other}}` },
    { F: { x: 0, y: W }, label: `*N*_{${name}}`, role: 'muted' },
    { F: { x: 0, y: -W }, label: `*m*_{${name}}*g*`, role: 'muted', field: true },
  ], perN / g.px(1));
}

export const third: Scene<P, S> = {
  id: 'third',
  title: 'ch05.t.scene',
  layout: 'stack',
  params,
  time: { h: 1 / RATE, recordEvery: 1, frameStep: 0.05, tEnd: (p) => tEnd(p as P) },

  world: (p) => {
    const [lo, hi] = span(p);
    const pad = 0.04 * (hi - lo);
    // Px padding: A's body lies left of its face, B's right of its face, plus their labels.
    return { x: [lo - pad, hi + pad], y: [-1, 1], aspect: 'fit-x', padPx: 28 + CART_W + 24 };
  },

  init: (p) => ({ t: 0, n: 0, ...stateAt(p, 0) }),

  step: (s, _h, p) => {
    s.n += 1;
    s.t = Math.min(s.n / RATE, tEnd(p));
    Object.assign(s, stateAt(p, s.t));
  },

  record: (s) => ({ t: s.t, FA: s.FA, aA: s.aA, vA: s.vA }),
  snapshot: (s) => ({ ...s }),

  draw: (g, s, p) => {
    const [lo, hi] = span(p);
    const W = g.px(CART_W);
    // Track only: positions on it do not matter here.
    g.line({ x: lo - W - g.px(20), y: 0 }, { x: hi + W + g.px(20), y: 0 }, { role: 'axis', width: 1.25 });

    bumper(g, s.xA, Math.min(s.xB, s.xA + L0));
    // Free-body diagrams are drawn over the carts: fade the bodies so the arrows read.
    cart(g, s.xA - W, s.xA, 'A', p.fbd);
    cart(g, s.xB, s.xB + W, 'B', p.fbd);

    const Fpk = peakForce(bumperOf(p));
    if (p.fbd) {
      // One scale for every force, so N and mg compare with the contact force.
      const perN = g.px(FBD_LEN) / Math.max(Fpk, p.mA * THIRD_G, p.mB * THIRD_G);
      fbd(g, s.xA - W / 2, s.FA, p.mA, 'A', perN);
      fbd(g, s.xB + W / 2, s.FB, p.mB, 'B', perN);
      return;
    }

    // Contact forces: each drawn on the cart it acts on, from its contact face, pointing away from
    // the other cart. Same length (equal magnitudes), scaled by the largest force of the run.
    const yF = g.px(CART_H + 14);
    if (Math.abs(s.FB) > 1e-9) {
      const f = Math.max((Math.abs(s.FB) / Fpk) * g.px(F_LEN), g.px(8));
      g.arrow({ x: s.xA, y: yF }, { x: -f, y: 0 }, { role: 'force', width: 2.5 });
      g.text({ x: s.xA - f, y: yF }, '*F*_{AB}', { size: 13, role: 'force', align: 'right', baseline: 'middle', dx: -6 });
      g.arrow({ x: s.xB, y: yF }, { x: f, y: 0 }, { role: 'force', width: 2.5 });
      g.text({ x: s.xB + f, y: yF }, '*F*_{BA}', { size: 13, role: 'force', align: 'left', baseline: 'middle', dx: 6 });
    }
    const [v0, v1] = vRange(p);
    const vMax = Math.max(Math.abs(v0), Math.abs(v1), 0.1);
    const yv = g.px(CART_H + 38);
    for (const [x, v] of [
      [s.xA - W / 2, s.vA],
      [s.xB + W / 2, s.vB],
    ] as const) {
      if (Math.abs(v) > 1e-6) g.arrow({ x, y: yv }, { x: (v / vMax) * g.px(V_LEN), y: 0 }, { role: 'velocity', label: '*v*' });
    }
  },

  plots: [
    {
      id: 'F',
      label: 'F\\,(\\mathrm{N})',
      traces: [{ channel: 'FA', role: 'force' }],
      yRange: (p) => {
        const f = peakForce(bumperOf(p));
        return padded(-f, f, 1);
      },
    },
    {
      id: 'a',
      label: 'a\\,(\\mathrm{m/s^2})',
      traces: [{ channel: 'aA', role: 'acceleration' }],
      yRange: (p) => {
        const f = peakForce(bumperOf(p));
        return padded(-f / p.mA, f / p.mB, 0.5);
      },
    },
    {
      id: 'v',
      label: 'v\\,(\\mathrm{m/s})',
      traces: [{ channel: 'vA', role: 'velocity' }],
      yRange: (p) => {
        const [a, b] = vRange(p);
        return padded(a, b, 0.5);
      },
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

  // Σ panel: both forces from the same compression c (equal and opposite), each cart's own
  // acceleration, and with the free-body diagrams the N = mg balance on each cart.
  formula: (s, p) => {
    const { c } = bumperAt(bumperOf(p), s.t);
    const sc = sigToMatch(s.FB, [c], (x) => p.k * x);
    const sA = sigToMatch(s.aA, [s.FA], (f) => f / p.mA);
    const sB = sigToMatch(s.aB, [s.FB], (f) => f / p.mB);
    const mA = p.mA.toFixed(1);
    const mB = p.mB.toFixed(1);
    const lines = [
      `F_{BA} = k\\,c = ${p.k} \\times ${tn(c, sc)} = ${tn(s.FB)}${u('N')}`,
      `F_{AB} = -F_{BA} = ${tn(s.FA)}${u('N')}`,
      `a_A = \\frac{F_{AB}}{m_A} = \\frac{${tn(s.FA, sA)}}{${mA}} = ${tn(s.aA)}${u('m/s^2')}`,
      `a_B = \\frac{F_{BA}}{m_B} = \\frac{${tn(s.FB, sB)}}{${mB}} = ${tn(s.aB)}${u('m/s^2')}`,
    ];
    if (p.fbd) {
      lines.push(`N_A = m_A g = ${mA} \\times ${THIRD_G} = ${tn(p.mA * THIRD_G)}${u('N')}`);
      lines.push(`N_B = m_B g = ${mB} \\times ${THIRD_G} = ${tn(p.mB * THIRD_G)}${u('N')}`);
    }
    return lines;
  },

  info: {
    goals: ['ch05.t.goal.pair', 'ch05.t.goal.fbd'],
    observe: ['ch05.t.obs.mirror', 'ch05.t.obs.heavy', 'ch05.t.obs.release', 'ch05.t.obs.fbd', 'ch05.t.obs.partner', 'ch05.t.obs.stiff'],
    equations: [
      '\\vec F_{AB} = -\\vec F_{BA}',
      'F_{BA} = k\\,c \\quad (c:\\ \\text{compression})',
      'm_A a_A = -m_B a_B \\;\\Rightarrow\\; \\frac{\\lvert a_A\\rvert}{\\lvert a_B\\rvert} = \\frac{m_B}{m_A}',
    ],
    assumptions: ['ch05.t.assume'],
  },
};
