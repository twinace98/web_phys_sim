// Ch 27 scene: RC circuit. The switch charges the capacitor through R from the battery,
// or discharges it through R. Plots mark t = τ after the latest switch (63 %, 37 %).
import { CONST, slider, tn, u } from '../../core/tex';
import type { NumberParam, ParamSchema, Scene, Vec2 } from '../../core/types';
import type { Draw, PlotDraw } from '../../draw/draw';
import { drawRich } from '../../draw/text';
import { theme } from '../../draw/theme';
import { ONE_TAU, chargeAt, currentAt, finalCharge, tau, type RC } from './physics';

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
/** The state still follows the segment of these parameters (no switch or R, C change since). */
const inSegment = (s: S, p: { sw: string; R: number; C: number }) => s.mode === p.sw && s.rc === `${p.R}|${p.C}`;

/**
 * Current with the switch position `sw`: within the segment the exponential of the segment,
 * i = (q_final − q0)/τ · e^{−(t − t_s)/τ}, which keeps its digits as i → 0 (policy D, R5, R7b);
 * after a switch or an R, C change not yet stepped (paused) the loop rule i = (q_final − q)/τ,
 * valid at any instant, so the change shows at once.
 */
const currentOf = (c: RC, s: S, sw: string, p?: P) => {
  const qf = finalCharge(c, sw === 'charge');
  if (sw === s.mode && (!p || inSegment(s, p))) return currentAt(c, sw === 'charge', s.q0, s.t - s.ts);
  return (qf - s.q) / tau(c);
};

/** Charge at the start of a run: a run that starts in discharge mode starts full, q = Cε. */
export const startCharge = (p: P) => (p.sw === 'discharge' ? finalCharge(rcOf(p), true) : 0);

/**
 * Before the first step there is nothing to continue from: a change of the switch, R or C
 * prepares the start again (a switch during a run continues from the charge at that instant).
 */
function prepare(s: S, p: P): void {
  if (s.n !== 0) return;
  const rc = `${p.R}|${p.C}`;
  if (s.mode === p.sw && s.rc === rc) return;
  s.mode = p.sw;
  s.rc = rc;
  s.ts = s.t;
  s.q = s.q0 = startCharge(p);
}

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

/** Zigzag of the resistor from (R0, TOP) to (R1, TOP): drawn, and followed by the current dots. */
const ZIGZAG: Vec2[] = [
  { x: R0, y: TOP },
  ...Array.from({ length: 6 }, (_, i) => ({ x: R0 + ((i + 0.5) * (R1 - R0)) / 6, y: TOP + (i % 2 === 0 ? 0.28 : -0.28) })),
  { x: R1, y: TOP },
];

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
  ...ZIGZAG,
  { x: CAP_X, y: TOP },
  { x: CAP_X, y: CAP_T },
]);
const DISCHARGE_PATH = path([{ x: CAP_X, y: CAP_B }, { x: CAP_X, y: BOT }, { x: B.x, y: BOT }, B, PIV, ...ZIGZAG, { x: CAP_X, y: TOP }, { x: CAP_X, y: CAP_T }]);

function pointAt(pa: ReturnType<typeof path>, d: number): Vec2 {
  let i = 1;
  while (i < pa.len.length - 1 && pa.len[i] < d) i++;
  const f = (d - pa.len[i - 1]) / (pa.len[i] - pa.len[i - 1] || 1);
  const a = pa.pts[i - 1];
  const b = pa.pts[i];
  return { x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f };
}

function resistor(g: Draw): void {
  g.polyline(ZIGZAG, { color: WIRE, width: 1.75 });
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

function tauMarkers(id: string, pd: PlotDraw, p: P, now: number): void {
  const c = rcOf(p);
  const T = tau(c);
  const charging = shown.mode === 'charge';
  const qf = finalCharge(c, charging);
  if (Math.abs(qf - shown.q0) < 1e-3 * c.C * c.emf) return;
  const t0 = shown.ts;
  const t1 = t0 + T;
  // The rolling window the plots show (as the shell sets it): once it has scrolled past t = τ the
  // dot and the labels would sit left of the y axis. Lines clip themselves; the dot and the text
  // are clipped to the plot's time span here, and left out once t = τ has scrolled out of view.
  const win = plotWindow(p);
  const [L] = pd.toPx(Math.max(0, now - win), 0);
  const [R] = pd.toPx(Math.max(win, now), 0);
  const [x1] = pd.toPx(t1, 0);
  const inView = x1 >= L && x1 <= R;
  pd.ctx.save();
  pd.ctx.beginPath();
  pd.ctx.rect(L, -1e4, R - L, 2e4);
  pd.ctx.clip();
  markers(id, pd, c, T, charging, qf, t0, t1, inView);
  pd.ctx.restore();
}

function markers(id: string, pd: PlotDraw, c: RC, T: number, charging: boolean, qf: number, t0: number, t1: number, inView: boolean): void {
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
    if (!inView) return;
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
    if (!inView) return;
    pd.dot(t1, i1, { color: MARK, r: 3.5 });
    mark(pd, t1, i1, '37 %', i1 < 0);
  }
}

// ------------------------------------------------------------------ scene

/** Rolling plot window [s]: 10τ, kept between 0.5 s and 20 s. */
export const plotWindow = (p: P) => Math.min(20, Math.max(0.5, 10 * tau(rcOf(p))));
/** Sim seconds per wall second: 1 for τ ≥ 0.5 s, 2τ per s below (5τ then takes 2.5 s). */
export const timeScaleOf = (p: P) => Math.min(1, Math.max(0.1, 2 * tau(rcOf(p))));

const span = (lo: number, hi: number): [number, number] => {
  const m = 0.1 * (hi - lo);
  return [lo - m, hi + m];
};

/**
 * Extremes of the recorded channels since the last reset. Changing C keeps q (charge cannot
 * jump), so V_C = q/C and i can leave the ranges of the new setting: the plots widen to keep
 * the whole run in view.
 */
type Env = Record<'vc' | 'i' | 'q', [number, number]>;
let env: Env = { vc: [0, 0], i: [0, 0], q: [0, 0] };
function grow(rec: { vc: number; i: number; q: number }): void {
  for (const k of ['vc', 'i', 'q'] as const) {
    if (!Number.isFinite(rec[k])) continue;
    env[k][0] = Math.min(env[k][0], rec[k]);
    env[k][1] = Math.max(env[k][1], rec[k]);
  }
}

/**
 * One elementary charge [C]: below it the exponential has nothing physical left to describe (policy
 * D, R7). A plate charge |q| < e is an exact 0: q, V_C = q/C and q₀ print "0". The current is a
 * physical small value (R7b) and prints in powers of ten while the charge still to flow,
 * |q_final − q| = |i|τ, is at least e; below that it prints as a bound, |i| < e/τ rounded up to a
 * power of ten ("< 10⁻¹⁴" mA at τ = 0.05 s), never as 0.
 */
const E_CH = CONST.e.value;
/** Charge [C] as printed: an exact 0 below one elementary charge. */
const qPrint = (q: number) => (Math.abs(q) < E_CH ? 0 : q);
/** Power of ten [mA] that bounds a settled current: 10^n ≥ e/τ. */
export const iBoundExp = (T: number) => Math.ceil(Math.log10((E_CH / T) * 1e3) - 1e-9);
/** The current [mA] has settled: less than one elementary charge still to flow. */
const settled = (iMA: number, T: number) => Math.abs(iMA * 1e-3) * T < E_CH;
const SUP: Record<string, string> = { '-': '⁻', '0': '⁰', '1': '¹', '2': '²', '3': '³', '4': '⁴', '5': '⁵', '6': '⁶', '7': '⁷', '8': '⁸', '9': '⁹' };
/**
 * A settled current as text: "< 10⁻¹⁴" (charging), "> −10⁻¹⁴" (discharging, i ≤ 0; an i that has
 * run below the smallest double is an exact 0 and takes the sign of its switch position).
 */
export const iBoundText = (iMA: number, T: number, sw: string) => {
  const n = String(iBoundExp(T)).replace(/./g, (d) => SUP[d]);
  return iMA < 0 || (iMA === 0 && sw === 'discharge') ? `> −10${n}` : `< 10${n}`;
};
const iBoundTex = (iMA: number, T: number, sw: string) => `${iMA < 0 || (iMA === 0 && sw === 'discharge') ? '> -' : '< '}10^{${iBoundExp(T)}}`;
/** V_C [V] readout text: an exact 0 below one elementary charge on the plate. */
const fmtVC = (v: number, _s: S, p: P) => (qPrint(v * rcOf(p).C) === 0 ? '0' : undefined);
/** i [mA] readout text: the bound once settled (never 0). */
const fmtI = (v: number, _s: S, p: P) => (settled(v, tau(rcOf(p))) ? iBoundText(v, tau(rcOf(p)), p.sw) : undefined);
const tz = (v: number) => (v === 0 ? '0' : tn(v, 3, 0));

/** Readouts: V_C [V] and i [mA] (loop rule with the switch of the parameters). */
export const readVC = (s: S, p: P) => {
  prepare(s, p);
  return s.q / rcOf(p).C;
};
export const readI = (s: S, p: P) => {
  prepare(s, p);
  return currentOf(rcOf(p), s, p.sw, p) * 1e3;
};

/**
 * Σ panel: τ = RC, q(t) of the current segment (since the latest switch at t_s), V_C = q/C and i.
 * Policy D: R and C as their sliders, state values with 3 figures. While charging, i is written as
 * the exponential of the segment (R5): ℰ − V_C would cancel to a few digits of 12 V once settled.
 */
export function formulaLines(s0: S, p: P): string[] {
  // After a switch or an R, C change while paused the state still holds the old segment: the new
  // one starts now (t_s = t, q₀ = q), so τ is never applied to the old segment's elapsed time.
  const s = inSegment(s0, p) ? s0 : { ...s0, mode: p.sw, rc: `${p.R}|${p.C}`, ts: s0.t, q0: s0.q };
  const vc = readVC(s0, p);
  const i = readI(s0, p);
  const c = rcOf(p);
  const T = tau(c);
  const CE = finalCharge(c, true) * 1e3;
  const dt = s.t - s.ts;
  // Elapsed time and τ in the exponent as the readouts show them (t is live).
  const ex = `e^{-${dt === 0 ? '0' : tn(dt)}/${tn(T)}}`;
  const tt = s.ts > 0 ? '(t - t_s)' : 't';
  const sl = (k: 'R' | 'C') => slider(params[k] as NumberParam, p[k]);
  const lines = [`\\tau = RC = (${sl('R')}\\ \\mathrm{k\\Omega})(${sl('C')}\\ \\mathrm{\\mu F}) = ${tn(T)}${u('s')}`];
  // Charges [mC] as printed: below one elementary charge an exact 0.
  const tq = (q: number) => tz(qPrint(q) * 1e3);
  const fromZero = Math.abs(s.q0) < E_CH;
  // Long lines are split after the symbolic form: the substituted numbers continue on "= …".
  if (s.mode === 'charge' && fromZero) {
    lines.push(`q = C\\mathcal{E}(1 - e^{-${tt}/\\tau})`, `= (${tn(CE)}\\ \\mathrm{mC})(1 - ${ex}) = ${tq(s.q)}${u('mC')}`);
  } else if (s.mode === 'charge') {
    lines.push(`q = C\\mathcal{E} + (q_0 - C\\mathcal{E})\\,e^{-${tt}/\\tau}`, `= ${tn(CE)} + (${tq(s.q0)} - ${tn(CE)})\\,${ex} = ${tq(s.q)}${u('mC')}`);
  } else {
    lines.push(`q = q_0\\,e^{-${tt}/\\tau}`, `= ${tq(s.q0)}\\,${ex} = ${tq(s.q)}${u('mC')}`);
  }
  const vcZero = qPrint(vc * c.C) === 0;
  const vt = vcZero ? '0' : tz(vc);
  const qC = qPrint(s0.q);
  lines.push(`V_C = \\frac{q}{C}`, `= \\frac{${Math.abs(qC) < 1e-6 ? tz(qC) : `${tz(qC * 1e3)}\\times 10^{-3}`}}{${sl('C')}\\times 10^{-6}}\\ \\mathrm{V} = ${vt}${u('V')}`);
  const R = `${sl('R')}\\ \\mathrm{k\\Omega}`;
  // The result: "= i" while charge is still to flow, else the bound "< 10⁻ⁿ" (never 0, R7b).
  const res = `${settled(i, T) ? ` ${iBoundTex(i, T, p.sw)}` : ` = ${tz(i)}`}${u('mA')}`;
  if (p.sw === 'charge' && inSegment(s0, p)) {
    if (fromZero) lines.push(`i = \\frac{\\mathcal{E}}{R}\\,e^{-${tt}/\\tau}`, `= \\frac{${EMF}\\ \\mathrm{V}}{${R}}\\,${ex}${res}`);
    else lines.push(`i = \\frac{C\\mathcal{E} - q_0}{\\tau}\\,e^{-${tt}/\\tau}`, `= \\frac{${tn(CE - s.q0 * 1e3, 3, 0)}\\ \\mathrm{mC}}{${tn(T)}\\ \\mathrm{s}}\\,${ex}${res}`);
  } else if (p.sw === 'charge') {
    // Switched to charging while paused: the loop rule at this instant.
    lines.push(`i = \\frac{\\mathcal{E} - V_C}{R} = \\frac{${EMF} - ${vt}}{${R}}${res}`);
  } else if (!vcZero) {
    lines.push(`i = -\\frac{V_C}{R} = -\\frac{${vt}\\ \\mathrm{V}}{${R}}${res}`);
  } else {
    // Discharged to below one elementary charge: V_C prints 0, the current is the bound.
    lines.push(`i = -\\frac{q_0}{\\tau}\\,e^{-${tt}/\\tau}`, `= -\\frac{${tq(s.q0)}\\ \\mathrm{mC}}{${tn(T)}\\ \\mathrm{s}}\\,${ex}${res}`);
  }
  return lines;
}

export const rcCircuit: Scene<P, S> = {
  id: 'rc',
  title: 'ch27.scene',
  params,
  time: {
    h: 1 / RATE,
    recordEvery: 1,
    frameStep: 0.1,
    // Ten time constants in view (2 s at τ = 0.2 s, 20 s at the default 2 s), and a short τ runs
    // slower than real time so the charging can be watched (0.1× at τ = 0.05 s).
    window: (p) => plotWindow(p as P),
    scale: (p) => timeScaleOf(p as P),
  },
  world: () => ({ x: [-0.4, 10.6], y: [0.2, 6.3], aspect: 'contain', padPx: 20 }),

  init: (p) => {
    env = { vc: [0, 0], i: [0, 0], q: [0, 0] };
    const q = startCharge(p);
    return { t: 0, n: 0, q, mode: p.sw, rc: `${p.R}|${p.C}`, ts: 0, q0: q };
  },

  step: (s, _h, p) => {
    prepare(s, p);
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
    const i = currentOf(c, s, s.mode);
    const rec = { t: s.t, vc: s.q / c.C, i: i * 1e3, q: s.q * 1e3 };
    grow(rec);
    return rec;
  },
  snapshot: (s) => ({ ...s }),

  draw: (g, s, p) => {
    prepare(s, p);
    // Paused after a switch or an R, C change: the markers belong to the segment that starts now.
    shown = inSegment(s, p) ? { ts: s.ts, q0: s.q0, mode: s.mode } : { ts: s.t, q0: s.q, mode: p.sw };
    const c = rcOf(p);
    const charging = p.sw === 'charge';
    circuit(g, charging);

    // Moving dots: conventional current. Their displacement along the loop follows q.
    const pa = charging ? CHARGE_PATH : DISCHARGE_PATH;
    const qmax = c.C * c.emf;
    const shift = (s.q / qmax) * 6;
    const gapD = 0.45;
    const bm = (TOP + BOT) / 2;
    for (let d = (((shift % gapD) + gapD) % gapD) + 0.05; d < pa.total - 0.05; d += gapD) {
      const pt = pointAt(pa, d);
      // No dots across the battery symbol (between and just beyond its plates).
      if (Math.abs(pt.x - BAT_X) < 1e-6 && Math.abs(pt.y - bm) < 0.3) continue;
      g.circle(pt, 2.6, { fill: 'positive', alpha: 0.75 });
    }

    // Plate charges: a full row stands for the larger of Cε and the largest charge of the run, so a
    // C lowered mid-run (q kept, V_C = q/C above ε) never overfills the plate, and the row shrinks
    // as the extra charge flows back.
    const full = Math.max(qmax, env.q[1] * 1e-3);
    const n = Math.max(0, Math.min(6, Math.round((Math.min(6, Math.floor(1.1 / g.px(13))) * s.q) / full)));
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
      yRange: () => span(Math.min(0, env.vc[0]), Math.max(EMF, env.vc[1])),
    },
    {
      id: 'i',
      label: 'i\\,(\\mathrm{mA})',
      traces: [{ channel: 'i', role: 'velocity' }],
      yRange: (p) => {
        const m = Math.max(EMF / p.R, -env.i[0], env.i[1]);
        return span(-m, m);
      },
    },
    {
      id: 'q',
      label: 'q\\,(\\mathrm{mC})',
      traces: [{ channel: 'q', role: 'position' }],
      yRange: (p) => span(Math.min(0, env.q[0]), Math.max((EMF * p.C) / 1e3, env.q[1])),
    },
  ],

  drawPlot: (id, pd, p, ui) => tauMarkers(id, pd, p, ui.t),

  readouts: [
    { label: '\\tau', unit: 's', value: (_s, p) => tau(rcOf(p)) },
    { label: 'V_C', unit: 'V', value: (s, p) => readVC(s, p), zeroTol: 0, format: fmtVC },
    { label: 'i', unit: 'mA', value: (s, p) => readI(s, p), zeroTol: 0, format: fmtI },
  ],

  formula: (s, p) => formulaLines(s, p),

  info: {
    goals: ['ch27.goal.exp', 'ch27.goal.tau'],
    observe: ['ch27.obs.tau', 'ch27.obs.tangent', 'ch27.obs.i', 'ch27.obs.switch', 'ch27.obs.RC'],
    equations: [
      'q = C\\mathcal{E}\\left(1 - e^{-t/\\tau}\\right), \\quad i = \\frac{\\mathcal{E}}{R} e^{-t/\\tau}',
      'q = q_0 e^{-t/\\tau}, \\quad i = -\\frac{q_0}{\\tau} e^{-t/\\tau}',
      '\\tau = RC',
    ],
    assumptions: ['ch27.assume', 'ch27.assume.sym', 'ch27.assume.floor', 'ch27.assume.plate'],
  },
};
