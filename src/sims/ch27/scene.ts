// Ch 27 scene: RC circuit. The switch charges the capacitor through R from the battery,
// or discharges it through R. Plots mark t = τ after the latest switch (63 %, 37 %).
import type { ParamSchema, Scene, Vec2 } from '../../core/types';
import type { Draw, PlotDraw } from '../../draw/draw';
import { drawRich } from '../../draw/text';
import { theme } from '../../draw/theme';
import { ONE_TAU, chargeAt, finalCharge, tau, type RC } from './physics';

type P = { sw: string; R: number; C: number };

interface S {
  t: number;
  n: number;
  /** Charge [C]. */
  q: number;
  /** Switch position the state was last advanced with. */
  mode: string;
  /** R|C the state was last advanced with: a change starts a new segment, like a switch. */
  rc: string;
  /** Time of the latest switch and the charge then. */
  ts: number;
  q0: number;
}

const RATE = 120;
const EMF = 12;
const WIRE = '#3a3a3a';
const MARK = '#7a7a7a';

const rcOf = (p: P): RC => ({ R: p.R * 1e3, C: p.C * 1e-6, emf: EMF });
/** Loop rule: i = (q_final − q) / τ, valid at any instant whatever the history. */
const currentOf = (c: RC, s: S) => {
  const i = (finalCharge(c, s.mode === 'charge') - s.q) / tau(c);
  return Math.abs(i) < 1e-7 * (c.emf / c.R) ? 0 : i; // rounding noise once settled
};

const params: ParamSchema<P> = {
  sw: {
    kind: 'select',
    label: 'ch27.p.sw',
    desc: 'ch27.d.sw',
    group: 'main',
    live: true,
    default: 'charge',
    options: [
      { value: 'charge', label: 'ch27.sw.charge' },
      { value: 'discharge', label: 'ch27.sw.discharge' },
    ],
  },
  R: {
    kind: 'number',
    label: 'ch27.p.R',
    desc: 'ch27.d.R',
    group: 'main',
    live: true,
    control: 'slider',
    min: 0.5,
    max: 4,
    step: 0.1,
    default: 2,
    unit: 'kΩ',
  },
  C: {
    kind: 'number',
    label: 'ch27.p.C',
    desc: 'ch27.d.C',
    group: 'advanced',
    live: true,
    control: 'slider',
    min: 100,
    max: 1000,
    step: 10,
    default: 1000,
    unit: 'μF',
  },
};

// ------------------------------------------------------------------ circuit drawing

// Node positions (world units).
const BAT_X = 1;
const TOP = 5;
const BOT = 1;
const A: Vec2 = { x: 3.4, y: TOP + 0.55 }; // throw to the battery (charge)
const B: Vec2 = { x: 3.4, y: TOP - 0.9 }; // throw to the bottom wire (discharge)
const PIV: Vec2 = { x: 4.6, y: TOP }; // switch pivot
const R0 = 5.6;
const R1 = 7.6;
const CAP_X = 9.2;
const CAP_T = 3.25;
const CAP_B = 2.75;

const path = (pts: Vec2[]) => {
  const len: number[] = [0];
  for (let i = 1; i < pts.length; i++) len.push(len[i - 1] + Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y));
  return { pts, len, total: len[len.length - 1] };
};

/** Open current paths from the − plate around to the + plate (direction of charging current). */
const CHARGE_PATH = path([
  { x: CAP_X, y: CAP_B },
  { x: CAP_X, y: BOT },
  { x: BAT_X, y: BOT },
  { x: BAT_X, y: A.y },
  A,
  PIV,
  { x: CAP_X, y: TOP },
  { x: CAP_X, y: CAP_T },
]);
const DISCHARGE_PATH = path([{ x: CAP_X, y: CAP_B }, { x: CAP_X, y: BOT }, { x: B.x, y: BOT }, B, PIV, { x: CAP_X, y: TOP }, { x: CAP_X, y: CAP_T }]);

function pointAt(pa: ReturnType<typeof path>, d: number): Vec2 {
  let i = 1;
  while (i < pa.len.length - 1 && pa.len[i] < d) i++;
  const f = (d - pa.len[i - 1]) / (pa.len[i] - pa.len[i - 1] || 1);
  const a = pa.pts[i - 1];
  const b = pa.pts[i];
  return { x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f };
}

function resistor(g: Draw): void {
  const pts: Vec2[] = [{ x: R0, y: TOP }];
  const n = 6;
  for (let i = 0; i < n; i++) pts.push({ x: R0 + ((i + 0.5) * (R1 - R0)) / n, y: TOP + (i % 2 === 0 ? 0.28 : -0.28) });
  pts.push({ x: R1, y: TOP });
  g.polyline(pts, { color: WIRE, width: 1.75 });
}

function circuit(g: Draw, charging: boolean): void {
  const w = { color: WIRE, width: 1.75 };
  const bm = (TOP + BOT) / 2;
  const h = 0.12;
  g.polyline([{ x: BAT_X, y: bm + h }, { x: BAT_X, y: A.y }, A], w);
  g.polyline([{ x: BAT_X, y: bm - h }, { x: BAT_X, y: BOT }, { x: CAP_X, y: BOT }, { x: CAP_X, y: CAP_B }], w);
  g.line({ x: BAT_X - 0.45, y: bm + h }, { x: BAT_X + 0.45, y: bm + h }, { color: WIRE, width: 2 });
  g.line({ x: BAT_X - 0.22, y: bm - h }, { x: BAT_X + 0.22, y: bm - h }, { color: WIRE, width: 4 });
  g.line(B, { x: B.x, y: BOT }, w);
  g.circle({ x: B.x, y: BOT }, 3, { fill: WIRE });
  g.line(PIV, { x: R0, y: TOP }, w);
  resistor(g);
  g.polyline([{ x: R1, y: TOP }, { x: CAP_X, y: TOP }, { x: CAP_X, y: CAP_T }], w);
  g.line({ x: CAP_X - 0.6, y: CAP_T }, { x: CAP_X + 0.6, y: CAP_T }, { color: WIRE, width: 3 });
  g.line({ x: CAP_X - 0.6, y: CAP_B }, { x: CAP_X + 0.6, y: CAP_B }, { color: WIRE, width: 3 });
  // Switch: blade from the pivot to the active throw.
  g.line(PIV, charging ? A : B, { color: WIRE, width: 2.5 });
  g.circle(PIV, 3, { fill: WIRE });
  for (const c of [A, B]) g.circle(c, 3, { fill: '#ffffff', color: WIRE, width: 1.5 });

  const lbl = { size: 15, color: WIRE, baseline: 'middle' as const };
  g.text({ x: BAT_X - 0.45, y: bm }, '*ℰ*', { ...lbl, align: 'right', dx: -8 });
  g.text({ x: (R0 + R1) / 2, y: TOP }, '*R*', { ...lbl, align: 'center', dy: -20 });
  g.text({ x: CAP_X, y: (CAP_T + CAP_B) / 2 }, '*C*', { ...lbl, align: 'left', dx: 26 });
}

// ------------------------------------------------------------------ plots: τ markers

// Latest switch event of the state being drawn (set by draw, read by drawPlot).
let shown: { ts: number; q0: number; mode: string } = { ts: 0, q0: 0, mode: 'charge' };

function mark(pd: PlotDraw, t: number, y: number, txt: string, below: boolean): void {
  const [x, py] = pd.toPx(t, y);
  drawRich(pd.ctx, txt, x + 6 * theme.scale, py + (below ? 14 : -7) * theme.scale, { size: 11, color: MARK, align: 'left' });
}

function tauMarkers(id: string, pd: PlotDraw, p: P): void {
  const c = rcOf(p);
  const T = tau(c);
  const charging = shown.mode === 'charge';
  const qf = finalCharge(c, charging);
  if (Math.abs(qf - shown.q0) < 1e-3 * c.C * c.emf) return;
  const t0 = shown.ts;
  const t1 = t0 + T;
  const dash = { color: MARK, width: 1, dash: [4, 4] };
  const k = id === 'q' ? 1e3 : 1 / c.C; // C → mC, or q → V_C
  if (id === 'vc' || id === 'q') {
    const y0 = shown.q0 * k;
    const yf = qf * k;
    const y1 = (shown.q0 + ONE_TAU * (qf - shown.q0)) * k;
    // Tangent at the switch reaches the final value at t = τ.
    pd.polyline([[t0, y0], [t1, yf]], dash);
    pd.polyline([[t0, yf], [t1 + 3 * T, yf]], { ...dash, dash: [2, 3] });
    pd.polyline([[t1, y0], [t1, y1]], dash);
    pd.dot(t1, y1, { color: MARK, r: 3.5 });
    // Charging covers 63 % of the way; discharging leaves 37 % of the starting charge.
    mark(pd, t1, y1, charging ? '63 %' : '37 %', yf > y0);
    if (id === 'vc') {
      const [x, py] = pd.toPx(t1, y0);
      drawRich(pd.ctx, '*τ*', x + 4 * theme.scale, py + (yf > y0 ? -5 : 14) * theme.scale, { size: 12, color: MARK, align: 'left' });
    }
  } else if (id === 'i') {
    const i0 = ((qf - shown.q0) / T) * 1e3;
    const i1 = i0 * Math.exp(-1);
    pd.polyline([[t1, 0], [t1, i1]], dash);
    pd.dot(t1, i1, { color: MARK, r: 3.5 });
    mark(pd, t1, i1, '37 %', i1 < 0);
  }
}

// ------------------------------------------------------------------ scene

const span = (lo: number, hi: number): [number, number] => {
  const m = 0.1 * (hi - lo);
  return [lo - m, hi + m];
};

export const rcCircuit: Scene<P, S> = {
  id: 'rc',
  title: 'ch27.scene',
  params,
  time: { h: 1 / RATE, recordEvery: 2, frameStep: 0.1, window: 20 },
  world: () => ({ x: [-0.4, 10.6], y: [0.2, 6.3], aspect: 'contain', padPx: 20 }),

  init: (p) => ({ t: 0, n: 0, q: 0, mode: p.sw, rc: `${p.R}|${p.C}`, ts: 0, q0: 0 }),

  step: (s, _h, p) => {
    const rc = `${p.R}|${p.C}`;
    if (p.sw !== s.mode || rc !== s.rc) {
      s.mode = p.sw;
      s.rc = rc;
      s.ts = s.t;
      s.q0 = s.q;
    }
    s.n += 1;
    s.t = s.n / RATE;
    s.q = chargeAt(rcOf(p), s.mode === 'charge', s.q0, s.t - s.ts);
  },

  record: (s, p) => {
    const c = rcOf(p);
    const i = currentOf(c, s);
    return { t: s.t, vc: s.q / c.C, i: i * 1e3, q: s.q * 1e3 };
  },
  snapshot: (s) => ({ ...s }),

  draw: (g, s, p) => {
    shown = { ts: s.ts, q0: s.q0, mode: s.mode };
    const c = rcOf(p);
    const charging = p.sw === 'charge';
    circuit(g, charging);

    // Moving dots: conventional current. Their displacement along the loop follows q.
    const pa = charging ? CHARGE_PATH : DISCHARGE_PATH;
    const qmax = c.C * c.emf;
    const shift = (s.q / qmax) * 6;
    const gapD = 0.45;
    for (let d = (((shift % gapD) + gapD) % gapD) + 0.05; d < pa.total - 0.05; d += gapD) {
      const pt = pointAt(pa, d);
      g.circle(pt, 2.6, { fill: 'positive', alpha: 0.75 });
    }

    // Plate charges.
    const n = Math.round((Math.min(6, Math.floor(1.1 / g.px(13))) * s.q) / qmax);
    for (let k = 0; k < n; k++) {
      const x = CAP_X - 0.55 + ((k + 0.5) * 1.1) / n;
      for (const [y, sign] of [
        [CAP_T + g.px(9), 1],
        [CAP_B - g.px(9), -1],
      ] as const) {
        g.circle({ x, y }, 5.5, { fill: sign > 0 ? 'positive' : 'negative' });
        g.text({ x, y }, sign > 0 ? '+' : '−', { size: 11, color: '#ffffff', align: 'center', baseline: 'middle', weight: 700, dy: 0.5 });
      }
    }
  },

  plots: [
    {
      id: 'vc',
      label: 'V_C\\,(\\mathrm{V})',
      traces: [{ channel: 'vc', role: 'position' }],
      yRange: () => span(0, EMF),
    },
    {
      id: 'i',
      label: 'i\\,(\\mathrm{mA})',
      traces: [{ channel: 'i', role: 'velocity' }],
      yRange: (p) => span(-EMF / p.R, EMF / p.R),
    },
    {
      id: 'q',
      label: 'q\\,(\\mathrm{mC})',
      traces: [{ channel: 'q', role: 'position' }],
      yRange: (p) => span(0, (EMF * p.C) / 1e3),
    },
  ],

  drawPlot: (id, pd, p) => tauMarkers(id, pd, p),

  readouts: [
    { label: '\\tau', unit: 's', value: (_s, p) => tau(rcOf(p)) },
    { label: 'V_C', unit: 'V', value: (s, p) => s.q / rcOf(p).C },
    { label: 'i', unit: 'mA', value: (s, p) => currentOf(rcOf(p), s) * 1e3 },
  ],

  info: {
    goals: ['ch27.goal.exp', 'ch27.goal.tau'],
    observe: ['ch27.obs.tau', 'ch27.obs.tangent', 'ch27.obs.i', 'ch27.obs.switch', 'ch27.obs.RC'],
    equations: [
      'q = C\\mathcal{E}\\left(1 - e^{-t/\\tau}\\right), \\quad i = \\frac{\\mathcal{E}}{R} e^{-t/\\tau}',
      'q = q_0 e^{-t/\\tau}, \\quad i = -\\frac{q_0}{\\tau} e^{-t/\\tau}',
      '\\tau = RC',
    ],
    assumptions: ['ch27.assume'],
  },
};
