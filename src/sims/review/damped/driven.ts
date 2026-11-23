// Forced oscillation and resonance (Halliday 15-9). The support is moved as d cos ω_d t by a
// Scotch yoke, which is the driving force F = kd cos ω_d t on the block. RK4 from rest; the drive
// angle is integrated so that ω_d can change while running.
// Stage: oscillator (left) and steady-state amplitude against ω_d/ω₀ for several b (right). Plot: x(t).
// Free-body diagram of the block: F_s = mg − kx, mg, F_d = −bv and the driving force F = k y_s, the
// part of the spring force that the moving support adds (m x'' + b x' + kx = F_m cos ω_d t).
import { fmtTick, niceTicks } from '../../../core/format';
import { t as tr } from '../../../core/i18n';
import type { ParamSchema, Scene } from '../../../core/types';
import type { Draw } from '../../../draw/draw';
import { Frame, W, textPx } from '../../modern/frame';
import { fbdParam, type FbdForce } from '../../../draw/fbd';
import { slider } from '../../../core/tex';
import { DAMPED_G, drawColumns, drawMech, mechLayout } from './mech';
import { drivenAmp, drivenLag, gamma, omega0, peakAmp, peakOmega, rk4, type Osc } from './physics';
import { tn, tp, u } from './tex';

type P = { ratio: number; b: number; m: number; k: number; fbd: boolean };
type S = { t: number; x: number; v: number; th: number };

/** Support amplitude [m]. */
export const D = 0.02;
export const H = 1 / 1000;
const R_MAX = 2.2;
/** Reference damping constants of the grey curves [kg/s]. */
export const B_REF = [0.5, 1, 2];
const LABEL = '#6b6b6b';
const REF = '#a8a8a8';

export const oscOf = (p: P): Osc => ({ m: p.m, k: p.k, b: p.b });
export const wdOf = (p: P) => p.ratio * omega0(oscOf(p));

/** Largest |x| the stage and the plot must hold: 1.6 × the resonance peak. */
export const xSpan = (p: P) => 1.6 * peakAmp(oscOf(p), D);
/** Displacement range drawn on the stage: at least 4d, so the drive disk stays small. */
const stageSpan = (p: P) => Math.max(xSpan(p), 4 * D);

const params: ParamSchema<P> = {
  ratio: {
    kind: 'number',
    label: 'damped.p.ratio',
    desc: 'damped.d.ratio',
    group: 'main',
    live: true,
    control: 'slider',
    min: 0.2,
    max: 2,
    step: 0.01,
    default: 1,
  },
  b: {
    kind: 'number',
    label: 'damped.p.b',
    desc: 'damped.d.bDrive',
    group: 'main',
    live: false,
    control: 'slider',
    min: 0.2,
    max: 4,
    step: 0.1,
    default: 1,
    unit: 'kg/s',
  },
  m: {
    kind: 'number',
    label: 'damped.p.m',
    desc: 'damped.d.m',
    group: 'advanced',
    live: false,
    control: 'slider',
    min: 0.2,
    max: 2,
    step: 0.1,
    default: 1,
    unit: 'kg',
  },
  k: {
    kind: 'number',
    label: 'damped.p.k',
    desc: 'damped.d.k',
    group: 'advanced',
    live: false,
    control: 'slider',
    min: 5,
    max: 40,
    step: 1,
    default: 16,
    unit: 'N/m',
  },
  fbd: fbdParam(),
};

/**
 * Forces on the block [N] (y up): the spring pulls with mg + k(y_s − x), split as Halliday writes the
 * equation of motion into F_s = mg − kx and the driving force F = k y_s = kd cos θ; weight; damping
 * −bv. Their sum is −kx − bv + F_m cos ω_d t = ma.
 */
export function fbdForces(s: { x: number; v: number; th: number }, p: P): FbdForce[] {
  const W = p.m * DAMPED_G;
  return [
    { F: { x: 0, y: W - p.k * s.x }, label: '*F*_{s}' },
    { F: { x: 0, y: -W }, label: '*m**g*', field: true },
    { F: { x: 0, y: -p.b * s.v }, label: '*F*_{d}' },
    { F: { x: 0, y: p.k * D * Math.cos(s.th) }, label: '*F*' },
  ];
}

/**
 * Largest force [N] for the arrow scale, fixed while ω_d is dragged: |x| stays below xSpan for every
 * ω_d (tested), so |F_s| ≤ mg + k xSpan and |F_d| ≤ b ω_d,max xSpan; F ≤ kd.
 */
export const fbdMaxForce = (p: P) => {
  const X = xSpan(p);
  return Math.max(p.m * DAMPED_G + p.k * X, p.b * R_MAX * omega0(oscOf(p)) * X, p.k * D);
};

/** Steady-state amplitude against ω_d/ω₀: grey curves for B_REF, the current b in blue, the current ω_d. */
function chart(g: Draw, s: S, p: P, l: number, t: number, r: number, b: number): void {
  const o = oscOf(p);
  const w0 = omega0(o);
  const amp = (bb: number, ratio: number) => drivenAmp({ ...o, b: bb }, { d: D, wd: ratio * w0 });
  const yMax = 1.12 * Math.max(peakAmp(o, D), peakAmp({ ...o, b: Math.min(...B_REF) }, D));
  const F = new Frame(g, { l, t, r, b }, [0, R_MAX], [0, yMax]);
  const ticks = niceTicks(0, yMax, 4);
  const cm = yMax < 0.5;
  F.axes({
    xTicks: [0, 0.5, 1, 1.5, 2],
    yTicks: ticks,
    yFmt: (v) => fmtTick(cm ? Math.round(v * 1e4) / 100 : v),
    yLabel: cm ? '*x*_{m} (cm)' : '*x*_{m} (m)',
  });
  const curve = (bb: number): [number, number][] => {
    const pts: [number, number][] = [];
    for (let i = 0; i <= 300; i++) {
      const q = (R_MAX * i) / 300;
      pts.push([q, amp(bb, q)]);
    }
    return pts;
  };
  F.clip(() => {
    B_REF.forEach((bb, i) => F.polyline(curve(bb), { color: REF, width: 1.25, dash: i === 0 ? undefined : i === 1 ? [6, 3] : [2, 3] }));
    F.polyline(curve(p.b), { role: 'position', width: 2.25 });
  });
  textPx(g, r, b + 30, '*ω*_{d}/*ω*_{0}', { size: 12, color: LABEL, align: 'right' });
  // Current ω_d: steady amplitude (dot) and the amplitude reached now (ring).
  const xm = amp(p.b, p.ratio);
  const wd = wdOf(p);
  const now = Math.min(Math.hypot(s.x, s.v / wd), yMax);
  // Reference labels beside their peaks (right, else left), clear of the ω_d line with its dot and
  // ring; none for the reference that coincides with the current b or has no peak.
  for (const bb of B_REF) {
    if (Math.abs(bb - p.b) < 1e-9) continue;
    const ob = { ...o, b: bb };
    if (!Number.isFinite(peakOmega(ob))) continue;
    const rp = peakOmega(ob) / w0;
    const ya = peakAmp(ob, D);
    if (ya > yMax) continue;
    const px = F.X(rp);
    const py = F.Y(ya);
    const clear = (x0: number, x1: number) => F.X(p.ratio) < x0 - 7 || F.X(p.ratio) > x1 + 7;
    if (clear(px + 6, px + 30)) textPx(g, px + 7, py, `${bb}`, { size: 11, color: LABEL, align: 'left', baseline: 'middle' });
    else if (clear(px - 30, px - 6)) textPx(g, px - 7, py, `${bb}`, { size: 11, color: LABEL, align: 'right', baseline: 'middle' });
  }
  F.line(p.ratio, 0, p.ratio, yMax, { color: '#1a1a1a', width: 1, alpha: 0.3 });
  g.circle(F.P(p.ratio, now), 6, { color: 'position', width: 1.75 });
  g.circle(F.P(p.ratio, xm), 4.5, { fill: 'position' });
}

export const drivenScene: Scene<P, S> = {
  id: 'driven',
  title: 'damped.d.scene',
  layout: 'side',
  params,
  time: { h: H, recordEvery: 8, frameStep: 0.05, window: 20 },
  world: () => ({ x: [0, 1], y: [0, 1], aspect: 'contain', padPx: 0 }),

  init: () => ({ t: 0, x: 0, v: 0, th: 0 }),
  step: (s, h, p) => {
    const wd = wdOf(p);
    const th = s.th;
    rk4(oscOf(p), s, h, (tau) => p.k * D * Math.cos(th + wd * tau));
    s.th = th + wd * h;
    s.t += h;
  },
  record: (s) => ({ t: s.t, x: s.x, ys: D * Math.cos(s.th) }),
  snapshot: (s) => ({ ...s }),

  draw: (g, s, p) => {
    const w = g.vp.w;
    const h = g.vp.h;
    const pad = 14;
    const cx = Math.max(52, w * 0.17);
    const span = stageSpan(p);
    const M = mechLayout(cx, pad, h - pad, span, D);
    const lin = (x0: number, x1: number, y: number) => g.line(W(g, x0, y), W(g, x1, y), { color: '#c8c8c8', width: 1, dash: [4, 4] });
    lin(cx - M.block, cx + M.block, M.yEq);
    const blk = drawMech(g, M, Math.max(-span, Math.min(span, s.x)), { d: D, theta: s.th }, p.fbd);
    if (p.fbd) drawColumns(g, M, blk.y, fbdForces(s, p), fbdMaxForce(p));
    const l = Math.max(cx + M.block + 64, w * 0.4);
    const top = Math.max(pad + 10, h * 0.12);
    chart(g, s, p, l, top, w - 18, Math.min(h - 40, top + Math.max(120, h * 0.68)));
  },

  plots: [
    {
      id: 'x',
      label: '\\textcolor{#9a9a9a}{y_s},\\ x\\,(\\mathrm{m})',
      traces: [
        { channel: 'ys', role: 'muted' },
        { channel: 'x', role: 'position' },
      ],
      yRange: (p) => [-xSpan(p), xSpan(p)],
    },
  ],

  // Steady-state amplitude ±x_m at the current ω_d (dashed).
  drawPlot: (id, pd, p, ui) => {
    if (id !== 'x' || ui.t <= 0) return;
    const xm = drivenAmp(oscOf(p), { d: D, wd: wdOf(p) });
    const t0 = Math.max(0, ui.t - 20);
    for (const sg of [-1, 1])
      pd.polyline(
        [
          [t0, sg * xm],
          [t0 + 20, sg * xm],
        ],
        { color: '#8c8c8c', width: 1.25, dash: [6, 4] },
      );
  },

  readouts: [
    { label: '\\omega_d', unit: 'rad/s', value: (_s, p) => wdOf(p) },
    { label: 'x_m', unit: 'm', value: (_s, p) => drivenAmp(oscOf(p), { d: D, wd: wdOf(p) }) },
  ],

  formula: (s, p) => {
    const o = oscOf(p);
    const w0 = omega0(o);
    const wd = wdOf(p);
    const Fm = p.k * D;
    const xm = drivenAmp(o, { d: D, wd });
    const lag = (drivenLag(o, { d: D, wd }) * 180) / Math.PI;
    const wr = peakOmega(o);
    const den = Math.hypot(p.k - p.m * wd * wd, p.b * wd);
    // Policy D: ratio, k, m as their slider labels (R1), derived values at 3 figures (R3), x_m as its
    // readout. k − mω_d² is computed directly (R5); at ω_d = ω_0 it is 0 (rounding noise only), so
    // φ = 90° is stated instead of a fraction.
    const bw = p.b * wd;
    const kw = p.k - p.m * wd * wd;
    const resonant = Math.abs(kw) < 1e-9 * p.k;
    const kS = slider(params.k, p.k);
    const lines = [
      `\\omega_d = ${slider(params.ratio, p.ratio)}\\,\\omega_0 = ${slider(params.ratio, p.ratio)}\\sqrt{${kS}/${slider(params.m, p.m)}} = ${tn(wd)}${u('rad/s')}`,
      `F_m = kd = ${kS} \\times ${D.toFixed(3)} = ${tn(Fm)}${u('N')}`,
      `x_m = \\frac{F_m}{\\sqrt{(k - m\\omega_d^2)^2 + (b\\omega_d)^2}} = \\frac{${tn(Fm)}}{${tn(den)}} = ${tn(xm)}${u('m')}`,
      resonant
        ? `\\omega_d = \\omega_0:\\ k - m\\omega_d^2 = 0,\\quad \\phi = 90^\\circ`
        : `\\tan\\phi = \\frac{b\\omega_d}{k - m\\omega_d^2} = \\frac{${tn(bw)}}{${tn(kw)}},\\quad \\phi = ${tn(lag, 3)}^\\circ`,
      Number.isFinite(wr)
        ? `\\omega_\\text{peak} = \\sqrt{\\omega_0^2 - 2\\gamma^2} = ${tn(wr)}${u('rad/s')} = ${tn(wr / w0)}\\,\\omega_0`
        : `\\gamma = ${tn(gamma(o))}${u('s^{-1}')} \\ge \\omega_0/\\sqrt{2}:\\ \\text{${tr('damped.nopeak')}}`,
    ];
    if (p.fbd) {
      // Net force from the drawn forces (y up): F_s − mg + F_d + F = ma.
      const [Fs, , Fd, Fdr] = fbdForces(s, p).map((f) => f.F.y);
      const mg = p.m * DAMPED_G;
      // ΣF is a small difference of F_s ≈ mg (R5): 3 figures from the unrounded forces, so the
      // printed 3-figure terms may miss it by more than the last digit.
      const net = Fs - mg + Fd + Fdr;
      lines.push(`\\Sigma F = F_s - mg + F_d + F = ${tn(Fs)} - ${tn(mg)} + ${tp(Fd)} + ${tp(Fdr)} = ${tn(net)}${u('N')} = ma`);
    }
    return lines;
  },

  info: {
    goals: ['damped.d.goal.res', 'damped.d.goal.b'],
    observe: ['damped.d.obs.build', 'damped.d.obs.sweep', 'damped.d.obs.b', 'damped.d.obs.phase', 'damped.d.obs.ring'],
    equations: [
      'm\\frac{d^2x}{dt^2} + b\\frac{dx}{dt} + kx = F_m\\cos\\omega_d t',
      'x = x_m\\cos(\\omega_d t - \\phi), \\quad x_m = \\frac{F_m}{\\sqrt{(k - m\\omega_d^2)^2 + (b\\omega_d)^2}}',
      '\\omega_d \\approx \\omega_0 = \\sqrt{k/m}: \\ x_m \\approx \\frac{F_m}{b\\,\\omega_0}',
    ],
    assumptions: ['damped.d.assume.drive', 'damped.d.assume.start'],
  },
};
