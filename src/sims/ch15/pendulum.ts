// Ch 15 scene: the real (nonlinear) simple pendulum with live v, a_t and a_r arrows, and its period
// compared with the small-angle (SHM) model T₀ = 2π√(L/g). The model appears only as a faint curve
// in the θ(t) graph and as numbers in the readouts and the formula panel. Free-body diagram: string
// tension F_T (along the string) and weight mg on a 1 kg bob; the motion does not depend on the mass.
import { fmt, fmtTick } from '../../core/format';
import { t } from '../../core/i18n';
import type { ParamSchema, Scene, Vec2 } from '../../core/types';
import { CONST, num, paren, slider, tn, tnScale, u } from '../../core/tex';
import type { Draw } from '../../draw/draw';
import { drawRich, measureRich } from '../../draw/text';
import { color, theme } from '../../draw/theme';
import { Inset, TICK, type Rect } from '../inset/inset';
import { FBD_MIN_PX, FBD_ZERO, drawFbd, fbdParam, fbdScale, type FbdForce } from '../../draw/fbd';
import { ellipticK, exactPeriod, pendulumAccel, pendulumMax, pendulumStep, periodError, smallAnglePeriod, type Pendulum } from './physics';

type P = { theta0: number; L: number; vectors: boolean; fbd: boolean };
type S = { t: number; th: number; w: number };

const DEG = Math.PI / 180;
const G = 9.8;
const RATE = 1000;
const MODEL = '#8c8c8c';

/**
 * Error inset below the swing [L]: (T − T₀)/T₀ against θ₀ on a log scale, the current release
 * marked, so the small-angle model visibly improves as the angle shrinks.
 */
export const ERR_RECT: Rect = { x0: -0.78, y0: -2.3, x1: 1.12, y1: -1.62 };
/** Bottom of the world: room for the inset's tick labels and axis title. */
const ERR_BOTTOM = -2.62;
/** Error axis: log10 of the percentage, 0.01 % to 300 %. */
export const ERR_LOG: [number, number] = [-2, Math.log10(300)];

/** Percentage error of the small-angle period at release angle θ₀ [deg]. */
export const errPct = (p: P, deg: number) => 100 * periodError(pend(p), deg * DEG);

function drawErrInset(g: Draw, p: P): void {
  const ins = new Inset(g, ERR_RECT, [0, 180], ERR_LOG);
  ins.frame({
    xTicks: [0, 45, 90, 135, 180],
    yTicks: [-2, 0, 2],
    yFmt: (v) => fmtTick(10 ** v),
    xLabel: '*θ*_{0} (°)',
  });
  // y title in the bottom row, left (the x title is right): nothing above the chart, where the
  // bob and its labels swing on a squeezed phone stage. ΔT = T − T₀ (ⓘ).
  g.text(ins.P(0, ERR_LOG[0]), 'Δ*T*/*T*_{0} (%)', { size: 12, color: TICK, align: 'left', dx: -30, dy: 30 });
  // 1 % guide: below it the small-angle model is good to 1 %.
  ins.curve([[0, 0], [180, 0]], { color: '#d8d8d8', width: 1, dash: [3, 4] });
  const pts: [number, number][] = [];
  for (let d = 2; d <= 178; d += 1) pts.push([d, Math.log10(errPct(p, d))]);
  ins.clip(() => ins.curve(pts, { color: MODEL, width: 1.75 }));
  const e = errPct(p, p.theta0);
  ins.dot(p.theta0, Math.log10(e), '#1a1a1a', 5);
  const at = ins.P(p.theta0, Math.log10(e));
  // Value beside the dot, on the side with room.
  const right = p.theta0 < 120;
  g.text(at, `${fmt(e, 3)} %`, { size: 12, color: '#1a1a1a', align: right ? 'left' : 'right', baseline: 'middle', dx: right ? 8 : -8, dy: 8 });
}
/** Bob radius [px]. */
const BOB = 11;
/** Longest arrow over the swing [L]: v and the acceleration components are each scaled to it. */
export const ARROW_MAX = 0.45;
/** The a_t arrow runs beside v (same line), this many px further from the pivot. */
const AT_OFFSET = 20;
/** Bob mass for the free-body diagram [kg]; the motion does not depend on it. */
export const BOB_M = 1;
/** Longest force arrow [px]: F_T at the bottom; long enough that mg (down to F_T/5 at 170°) clears the bob. */
const FBD_PX = 100;
/** With the diagram on, v gives way where it runs within this angle of mg. */
const V_CLEAR = 30 * DEG;

const pend = (p: P): Pendulum => ({ L: p.L, g: G });
/** Small-angle model θ₀ cos ω₀t [rad]. */
export const model = (p: P, t: number) => p.theta0 * DEG * Math.cos(Math.sqrt(G / p.L) * t);

const params: ParamSchema<P> = {
  theta0: {
    kind: 'number',
    label: 'ch15.n.p.theta0',
    desc: 'ch15.n.d.theta0',
    group: 'main',
    live: false,
    control: 'slider',
    min: 5,
    max: 170,
    step: 1,
    default: 30,
    unit: '°',
  },
  L: {
    kind: 'number',
    label: 'ch15.n.p.L',
    desc: 'ch15.n.d.L',
    group: 'main',
    live: false,
    control: 'slider',
    min: 0.2,
    max: 2,
    step: 0.1,
    default: 1,
    unit: 'm',
  },
  fbd: fbdParam(),
  vectors: { kind: 'toggle', label: 'ch15.n.p.vectors', desc: 'ch15.n.d.vectors', group: 'advanced', live: true, default: true },
};

/** String tension [N]: radial Newton's law F_T − mg cos θ = m v²/L (negative: a rod pushing, beyond 90°). */
export const tension = (s: { th: number; w: number }, p: P) => BOB_M * (G * Math.cos(s.th) + p.L * s.w * s.w);

/** Forces on the bob [N] (x right, y up): F_T towards the pivot and the weight. Sum = m(a_t + a_r). */
export function fbdForces(s: { th: number; w: number }, p: P): FbdForce[] {
  const T = tension(s, p);
  return [
    { F: { x: -T * Math.sin(s.th), y: T * Math.cos(s.th) }, label: '*F*_{T}' },
    { F: { x: 0, y: -BOB_M * G }, label: '*m**g*', field: true },
  ];
}

/**
 * Px per newton for the run: F_T is largest at the bottom, mg(3 − 2 cos θ₀), and gets up to FBD_PX;
 * shorter where the stage has no room for mg and its label below the lowest point.
 */
export const fbdPerN = (g: Draw, p: P) => {
  const max = BOB_M * G * (3 - 2 * Math.cos(p.theta0 * DEG));
  // Room below the bob at the bottom: down to the top of the error chart (its top tick label),
  // less the mg label.
  const room = (-1 - ERR_RECT.y1) / g.px(1) - 10 - 20;
  return fbdScale(max, Math.min(FBD_PX, Math.max(24, (room * max) / (BOB_M * G))));
};

/**
 * Free-body diagram from the bob. F_T runs along the string, so its label sits beside its tip (13 px
 * across the string, on the side away from mg's lean) rather than on the string. mg keeps its label
 * beyond the tip, except where it too runs along the string (bob high above the pivot): then it
 * goes beside the tip on the other side.
 */
function drawForces(g: Draw, B: Vec2, s: { th: number; w: number }, p: P): void {
  const [T, W] = fbdForces(s, p);
  const perN = fbdPerN(g, p);
  const et = { x: Math.cos(s.th), y: Math.sin(s.th) };
  // mg (straight down) runs along the string towards the pivot when the bob is within 25° of the top.
  const mgOnString = -Math.cos(s.th) > Math.cos(25 * DEG);
  drawFbd(g, B, [{ ...T, label: '' }, mgOnString ? { ...W, label: '' } : W], perN);
  // mg leans to −sin θ along e_t: F_T's label goes the other way.
  const side = Math.sin(s.th) >= 0 ? 1 : -1;
  const beside = (f: FbdForce, k: number) => {
    const mag = Math.hypot(f.F.x, f.F.y);
    if (!(mag > FBD_ZERO)) return;
    const len = g.px(Math.max(mag * perN, FBD_MIN_PX));
    const off = g.px(13) * k;
    g.text({ x: B.x + (f.F.x / mag) * len + off * et.x, y: B.y + (f.F.y / mag) * len + off * et.y }, f.label, { size: 13, role: f.role ?? 'force', align: 'center', baseline: 'middle' });
  };
  beside(T, side);
  if (mgOnString) beside(W, -side);
}

/** v is clear of mg unless it heads the same way as mg's tangential part, within V_CLEAR of mg. */
export function velocityClear(s: { th: number; w: number }): boolean {
  // v = L ω e_t, mg ∝ (−sin θ) e_t − cos θ e_r: cos of the angle between them is −sign(ω) sin θ.
  if (s.w === 0) return true;
  return -Math.sign(s.w) * Math.sin(s.th) < Math.cos(V_CLEAR);
}

/**
 * Arrows on the bob, in drawing units of L: velocity (tangent), tangential acceleration −g sin θ
 * (same line, sign gives the side) and radial acceleration v²/L (towards the pivot). v and the two
 * acceleration components each reach ARROW_MAX at their largest value over the swing.
 */
export function bobArrows(s: { th: number; w: number }, p: P): { v: Vec2; at: Vec2; ar: Vec2 } {
  const pd = pend(p);
  const max = pendulumMax(pd, p.theta0 * DEG);
  const kv = max.v > 0 ? ARROW_MAX / max.v : 0;
  const ka = max.a > 0 ? ARROW_MAX / max.a : 0;
  const et = { x: Math.cos(s.th), y: Math.sin(s.th) }; // direction of increasing θ
  const er = { x: -Math.sin(s.th), y: Math.cos(s.th) }; // towards the pivot
  const v = p.L * s.w;
  const { at, ar } = pendulumAccel(pd, s.th, s.w);
  return {
    v: { x: et.x * v * kv, y: et.y * v * kv },
    at: { x: et.x * at * ka, y: et.y * at * ka },
    ar: { x: er.x * ar * ka, y: er.y * ar * ka },
  };
}

/**
 * Top of the drawing [L]: the pivot, or the highest point the bob and its arrows reach over the swing
 * (with room for a label). Releases up to 90° stay below the pivot, so the stage is not wasted on them.
 */
export function worldTop(p: P): number {
  const th0 = p.theta0 * DEG;
  let top = 0;
  for (let i = 0; i <= 90; i++) {
    const th = (th0 * i) / 90;
    const w = Math.sqrt(Math.max(0, ((2 * G) / p.L) * (Math.cos(th) - Math.cos(th0))));
    for (const sw of [w, -w]) {
      const a = bobArrows({ th, w: sw }, p);
      const y = -Math.cos(th);
      top = Math.max(top, y + 0.06, y + a.v.y, y + a.ar.y, y + a.at.y + 0.08);
    }
  }
  return top + 0.12;
}

export const pendulum: Scene<P, S> = {
  id: 'pendulum',
  title: 'ch15.n.scene',
  layout: 'side',
  params,
  time: { h: 1 / RATE, recordEvery: 8, frameStep: 0.05, window: 8 },
  world: (p) => ({ x: [-1.2, 1.2], y: [ERR_BOTTOM, worldTop(p)], aspect: 'contain', padPx: 18 }),

  init: (p) => ({ t: 0, th: p.theta0 * DEG, w: 0 }),
  step: (s, h, p) => {
    pendulumStep(pend(p), s, h);
    s.t += h;
  },
  record: (s) => ({ t: s.t, th: s.th / DEG }),
  snapshot: (s) => ({ ...s }),

  draw: (g, s, p) => {
    // Drawn in units of L, so every length looks the same.
    const O: Vec2 = { x: 0, y: 0 };
    g.line({ x: -0.08, y: 0 }, { x: 0.08, y: 0 }, { color: '#5c5c5c', width: 3 });
    g.line(O, { x: 0, y: -1.08 }, { color: '#d8d8d8', width: 1, dash: [3, 4] });
    const arc: Vec2[] = [];
    const a0 = p.theta0 * DEG;
    for (let i = 0; i <= 80; i++) {
      const a = -a0 + (2 * a0 * i) / 80;
      arc.push({ x: Math.sin(a), y: -Math.cos(a) });
    }
    g.polyline(arc, { color: '#e2e2e2', width: 1 });

    const B: Vec2 = { x: Math.sin(s.th), y: -Math.cos(s.th) };
    g.line(O, B, { color: '#1a1a1a', width: 1.5 });

    if (p.vectors) {
      // With the free-body diagram on, F_T covers a_r (both along the string) and mg crosses a_t:
      // the acceleration parts give way (ΣF = ma in the Σ panel), v stays unless it runs along mg.
      const fbd = p.fbd;
      // Arrows shorter than the bob are hidden under it; labels only where they clear the bob.
      const { v, at, ar } = bobArrows(s, p);
      const show = (a: Vec2) => Math.hypot(a.x, a.y) > g.px(BOB + 3);
      const lbl = (a: Vec2, txt: string) => (Math.hypot(a.x, a.y) > g.px(BOB + 12) ? txt : undefined);
      const off = g.px(AT_OFFSET);
      const atFrom: Vec2 = { x: B.x + Math.sin(s.th) * off, y: B.y - Math.cos(s.th) * off };
      if (!fbd && show(ar)) {
        // a_r runs along the string: its label sits beside the tip, on the side v is not heading to.
        g.arrow(B, ar, { role: 'acceleration', width: 2.25 });
        if (lbl(ar, 'x')) {
          const side = (s.w >= 0 ? -1 : 1) * g.px(12);
          const tip = { x: B.x + ar.x + Math.cos(s.th) * side, y: B.y + ar.y + Math.sin(s.th) * side };
          g.text(tip, '*a*_{r}', { role: 'acceleration', size: 13, align: 'center', baseline: 'middle' });
        }
      }
      if (!fbd && show(at)) {
        g.line(B, atFrom, { role: 'acceleration', width: 1, alpha: 0.5, dash: [2, 3] });
        g.arrow(atFrom, at, { role: 'acceleration', width: 2.25, label: lbl(at, '*a*_{t}') });
      }
      if (show(v) && (!fbd || velocityClear(s))) g.arrow(B, v, { role: 'velocity', width: 2.25, label: lbl(v, '*v*') });
    }
    // Faded under the free-body diagram, so the arrows from its centre read.
    g.circle(B, BOB, { fill: 'position', alpha: p.fbd ? 0.25 : 1 });
    if (p.fbd) drawForces(g, B, s, p);
    g.circle(O, 3, { fill: '#5c5c5c' });
    drawErrInset(g, p);
  },

  plots: [
    {
      id: 'th',
      label: '\\theta\\,(^\\circ)',
      traces: [{ channel: 'th', role: 'position' }],
      // Headroom above θ₀ for the legend.
      yRange: (p) => [-p.theta0 * 1.2, p.theta0 * 1.6],
    },
  ],

  // Faint reference: the small-angle model θ₀ cos ω₀t (graph only, never on the stage).
  drawPlot: (id, pd, p, ui) => {
    if (id !== 'th') return;
    const pts: [number, number][] = [];
    const t1 = ui.t;
    const t0 = Math.max(0, t1 - 8);
    const n = 400;
    for (let i = 0; i <= n; i++) {
      const t = t0 + ((t1 - t0) * i) / n;
      pts.push([t, model(p, t) / DEG]);
    }
    pd.polyline(pts, { color: MODEL, width: 1.25, dash: [5, 4], alpha: 0.8 });
    // Legend, one row at the top left: the real (blue, solid) and the model (grey, dashed) curve.
    const sc = theme.scale;
    const [x0, y0] = pd.toPx(t0 === 0 ? 0 : t0, p.theta0 * 1.6);
    const ctx = pd.ctx;
    let x = x0 + 10 * sc;
    const y = y0 + 12 * sc;
    for (const [key, col, dash, w] of [
      ['ch15.n.leg.real', color('position'), [] as number[], 2],
      ['ch15.n.leg.model', MODEL, [5, 4], 1.5],
    ] as const) {
      ctx.save();
      ctx.strokeStyle = col;
      ctx.lineWidth = w * sc;
      ctx.setLineDash(dash.map((d) => d * sc));
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + 22 * sc, y);
      ctx.stroke();
      ctx.restore();
      const label = t(key);
      drawRich(ctx, label, x + 28 * sc, y, { size: 12, color: col === MODEL ? '#5c5c5c' : col, baseline: 'middle' });
      x += 28 * sc + measureRich(ctx, label, { size: 12 }) + 18 * sc;
    }
  },

  readouts: [
    { label: 'T', unit: 's', value: (_s, p) => exactPeriod(pend(p), p.theta0 * DEG) },
    { label: 'T_0', unit: 's', value: (_s, p) => smallAnglePeriod(pend(p)) },
    { label: '(T - T_0)/T_0', unit: '%', value: (_s, p) => 100 * periodError(pend(p), p.theta0 * DEG) },
  ],

  formula: (s, p) => {
    const pd = pend(p);
    const th0 = p.theta0 * DEG;
    const T0 = smallAnglePeriod(pd);
    const T = exactPeriod(pd, th0);
    const err = periodError(pd, th0);
    // Policy D: L as its slider label, g as 9.8 (R1); T₀, K and T to 3 figures, T₀ and T as their
    // readouts (R3). The error is the small difference of two periods: written as 2K/π − 1, computed
    // without the cancellation (R5), the readout string.
    const L = slider(params.L, p.L);
    const g = CONST.g.tex;
    const { at, ar } = pendulumAccel(pd, s.th, s.w);
    const v = p.L * s.w;
    const deg = s.th / DEG;
    const K = ellipticK(Math.sin(th0 / 2));
    // Values that change during the swing: fixed decimals from their largest value in the run (R7a),
    // so the turning point prints v = 0 and the sums below keep one decimal place.
    // θ to 3 figures (R3). Beyond 90° sin θ is small near the top and 3 figures of θ would lose it:
    // the angle from the top, 180° − |θ|, is computed directly (R5): sin(180° − 4.62°).
    const sinArg = (d: number) =>
      Math.abs(d) <= 90 ? `${tn(d)}^\\circ` : d > 0 ? `180^\\circ - ${tn(180 - d)}^\\circ` : `-180^\\circ + ${tn(180 + d)}^\\circ`;
    const vMax = Math.sqrt(2 * G * p.L * (1 - Math.cos(th0)));
    const fMax = BOB_M * G * (3 - 2 * Math.cos(th0));
    const lines = [
      `T_0 = 2\\pi\\sqrt{L/g} = 2\\pi\\sqrt{${L}/${g}} = ${tn(T0)}${u('s')}`,
      `K\\!\\left(\\sin\\tfrac{\\theta_0}{2}\\right) = K(\\sin ${num(p.theta0 / 2)}^\\circ) = ${tn(K)}`,
      `T = 4\\sqrt{L/g}\\,K = 4\\sqrt{${L}/${g}} \\times ${tn(K)} = ${tn(T)}${u('s')}`,
      `\\frac{T - T_0}{T_0} = \\frac{2K}{\\pi} - 1 = ${tn(100 * err)}\\ \\%`,
      `a_\\mathrm{t} = -g\\sin\\theta = -${g}\\sin(${sinArg(deg)}) = ${tnScale(at, G * Math.sin(Math.min(th0, Math.PI / 2)))}${u('m/s^2')}`,
      `a_{\\mathrm{t},0} = -g\\theta = -${g} \\times ${paren(tnScale(s.th, th0))} = ${tnScale(-G * s.th, G * th0)}${u('m/s^2')}`,
      `a_\\mathrm{r} = v^2/L = (${tnScale(v, vMax)})^2/${L} = ${tnScale(ar, (vMax * vMax) / p.L)}${u('m/s^2')}`,
    ];
    if (p.fbd) {
      // Radial part of ΣF = ma from the drawn forces; the tangential part, −mg sin θ = m a_t, is above.
      // Forces with the decimals of the largest one, F_T at the bottom (R7a).
      const T = tension(s, p);
      const Wr = BOB_M * G * Math.cos(s.th);
      lines.push(`\\Sigma F_\\mathrm{r} = F_T - mg\\cos\\theta = ${tnScale(T, fMax)} - ${paren(tnScale(Wr, fMax))} = ${tnScale(BOB_M * ar, fMax)}${u('N')} = ma_\\mathrm{r}`);
    }
    return lines;
  },

  info: {
    goals: ['ch15.n.goal.small', 'ch15.n.goal.large'],
    observe: ['ch15.n.obs.err', 'ch15.n.obs.inset', 'ch15.n.obs.arrows', 'ch15.n.obs.graph', 'ch15.n.obs.at', 'ch15.n.obs.L'],
    equations: [
      '\\ddot\\theta = -\\frac{g}{L}\\sin\\theta \\approx -\\frac{g}{L}\\theta',
      'T_0 = 2\\pi\\sqrt{L/g}, \\quad T = 4\\sqrt{L/g}\\,K\\!\\left(\\sin\\tfrac{\\theta_0}{2}\\right)',
      'K(k) = \\int_0^{\\pi/2} \\frac{d\\phi}{\\sqrt{1 - k^2\\sin^2\\phi}}',
      'a_\\mathrm{t} = -g\\sin\\theta, \\quad a_\\mathrm{r} = \\frac{v^2}{L}',
    ],
    assumptions: ['ch15.n.assume', 'ch15.n.assume.err', 'ch15.n.assume.arrows'],
  },
};
