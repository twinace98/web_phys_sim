// Damped oscillation (Halliday 15-8): block on a spring with a vane in a liquid, released from rest.
// RK4 integration; the closed form gives the envelope, the undamped reference and the tests.
// Stage: oscillator (left) and a b axis with b_c and the regime (right). Plots: x(t), K, U, E.
// Free-body diagram of the block: spring force F_s = mg − kx (x from equilibrium), mg and F_d = −bv.
import { t as tr } from '../../../core/i18n';
import type { ParamSchema, Scene } from '../../../core/types';
import type { Draw } from '../../../draw/draw';
import { ROLE_COLOR } from '../../../draw/theme';
import { W, linePx, textPx } from '../../modern/frame';
import { fbdParam, type FbdForce } from '../../../draw/fbd';
import { DAMPED_G, drawColumns, drawMech, mechLayout } from './mech';
import {
  amplitudeConst,
  bCrit,
  betaOver,
  energy,
  energyApprox,
  envelope,
  freeAt,
  gamma,
  omega0,
  omegaPrime,
  regime,
  rk4,
  type Osc,
} from './physics';
import { sigFit } from '../../ch07/sigfit';
import { tn, tp, u } from './tex';

type P = { b: number; m: number; k: number; vectors: boolean; fbd: boolean };
type S = { t: number; x: number; v: number };

/** Initial displacement [m]; released from rest. */
export const X0 = 0.2;
export const H = 1 / 1000;
const T_END = 10;
const B_MAX = 20;
const ENV = '#8c8c8c';
const REF = '#b8b8b8';
const LABEL = '#6b6b6b';
const GREY_BAND = '#cfcfcf';

export const oscOf = (p: P): Osc => ({ m: p.m, k: p.k, b: p.b });

const params: ParamSchema<P> = {
  b: {
    kind: 'number',
    label: 'damped.p.b',
    desc: 'damped.d.b',
    group: 'main',
    live: false,
    control: 'slider',
    min: 0,
    max: B_MAX,
    step: 0.1,
    default: 1,
    unit: 'kg/s',
  },
  m: {
    kind: 'number',
    label: 'damped.p.m',
    desc: 'damped.d.m',
    group: 'main',
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
  vectors: { kind: 'toggle', label: 'damped.p.vectors', desc: 'damped.d.vectors', group: 'advanced', live: true, default: true },
};

/**
 * Forces on the block [N] (y up): the spring holds mg at equilibrium, so it pulls with mg − kx;
 * weight; damping −bv. Their sum is −kx − bv = ma.
 */
export function fbdForces(s: { x: number; v: number }, p: P): FbdForce[] {
  const W = p.m * DAMPED_G;
  return [
    { F: { x: 0, y: W - p.k * s.x }, label: '*F*_{s}' },
    { F: { x: 0, y: -W }, label: '*m**g*', field: true },
    { F: { x: 0, y: -p.b * s.v }, label: '*F*_{d}' },
  ];
}

const maxCache = new Map<string, number>();
/** Largest force of the run [N], for one arrow scale: mg + kx₀ (spring at the lowest point) or b|v|. */
export function fbdMaxForce(p: P): number {
  const key = `${p.b}|${p.m}|${p.k}`;
  let k = maxCache.get(key);
  if (k === undefined) {
    const o = oscOf(p);
    let fd = 0;
    for (let i = 0; i <= 2000; i++) fd = Math.max(fd, p.b * Math.abs(freeAt(o, X0, (T_END * i) / 2000).v));
    k = Math.max(p.m * DAMPED_G + p.k * X0, fd);
    if (maxCache.size > 200) maxCache.clear();
    maxCache.set(key, k);
  }
  return k;
}

const E0 = (p: P) => 0.5 * p.k * X0 * X0;
/** Light damping (b ≤ b_c/2): where E ≈ ½kx_m²e^{−bt/m} is shown. */
export const light = (p: P) => p.b <= bCrit(oscOf(p)) / 2;

/** b axis with b_c and the current b; the regime name above it. Box in px. */
function gauge(g: Draw, p: P, l: number, r: number, y: number): void {
  const o = oscOf(p);
  const X = (b: number) => l + ((r - l) * b) / B_MAX;
  const axis = { role: 'axis' as const, width: 1.25 };
  linePx(g, l, y, r, y, axis);
  for (let b = 0; b <= B_MAX; b += 5) {
    linePx(g, X(b), y, X(b), y + 4, { role: 'axis', width: 1 });
    textPx(g, X(b), y + 16, String(b), { size: 11, color: LABEL, align: 'center' });
  }
  textPx(g, r, y + 32, '*b* (kg/s)', { size: 12, color: LABEL, align: 'right' });
  // b_c: tick through the axis, label above.
  const xc = X(bCrit(o));
  linePx(g, xc, y - 9, xc, y + 9, { color: '#1a1a1a', width: 1.5 });
  textPx(g, xc, y - 18, '*b*_{c}', { size: 13, color: '#1a1a1a', align: 'center' });
  // Under- and overdamped sides of the axis: thin solid and dashed bands.
  linePx(g, l, y - 3, xc, y - 3, { color: GREY_BAND, width: 3 });
  linePx(g, xc, y - 3, r, y - 3, { color: GREY_BAND, width: 3, dash: [4, 3] });
  // Current b.
  g.circle(W(g, X(p.b), y), 6, { fill: 'position', color: '#ffffff', width: 1.5 });
  const name = tr(`damped.regime.${regime(o)}`);
  textPx(g, (l + r) / 2, y - 44, name, { size: 15, color: '#1a1a1a', align: 'center', weight: 600 });
}

export const freeScene: Scene<P, S> = {
  id: 'free',
  title: 'damped.f.scene',
  layout: 'side',
  params,
  time: { h: H, recordEvery: 8, frameStep: 0.05, tEnd: T_END },
  world: () => ({ x: [0, 1], y: [0, 1], aspect: 'contain', padPx: 0 }),

  init: () => ({ t: 0, x: X0, v: 0 }),
  step: (s, h, p) => {
    rk4(oscOf(p), s, h);
    s.t += h;
  },
  record: (s, p) => {
    const e = energy(oscOf(p), s.x, s.v);
    return { t: s.t, x: s.x, K: e.K, U: e.U, E: e.E };
  },
  snapshot: (s) => ({ ...s }),

  draw: (g, s, p) => {
    const o = oscOf(p);
    const w = g.vp.w;
    const h = g.vp.h;
    const pad = 14;
    const cx = Math.max(60, w * 0.27);
    const M = mechLayout(cx, pad, h - pad, X0 * 1.02);
    // Equilibrium line.
    linePx(g, cx - M.block, M.yEq, cx + M.block * 1.4, M.yEq, { color: '#c8c8c8', width: 1, dash: [4, 4] });
    const blk = drawMech(g, M, s.x, undefined, p.fbd);
    // Free-body diagram: F_s, mg, F_d side by side; v moves right of it, the F_d arrow gives way.
    const fbdRight = p.fbd ? drawColumns(g, M, blk.y, fbdForces(s, p), fbdMaxForce(p)) : 0;
    if (p.vectors) {
      // v and the damping force F_d = −bv: px per (m/s) so that v = x0 ω0 is 0.9 travel; F per kx0.
      const kv = (0.9 * M.travel) / (X0 * omega0(o));
      const kf = (0.45 * M.travel) / (p.k * X0);
      const lbl = (len: number, txt: string) => (Math.abs(len) > 18 ? txt : undefined);
      const vy = s.v * kv;
      const fy = -p.b * s.v * kf;
      const xv = Math.max(blk.right + 12, fbdRight + 12);
      if (Math.abs(vy) > 3) g.arrow(W(g, xv, blk.y), { x: 0, y: g.px(vy) }, { role: 'velocity', width: 2.25, label: lbl(vy, '*v*') });
      if (!p.fbd && Math.abs(fy) > 3) g.arrow(W(g, xv + 22, blk.y), { x: 0, y: g.px(fy) }, { role: 'force', width: 2.25, label: lbl(fy, '*F*_{d}') });
    }
    const gl = Math.max(cx + M.block + 70, w * 0.52);
    gauge(g, p, gl, w - 26, h * 0.5);
  },

  plots: [
    { id: 'x', label: 'x\\,(\\mathrm{m})', traces: [{ channel: 'x', role: 'position' }], yRange: () => [-X0 * 1.15, X0 * 1.15] },
    {
      id: 'E',
      label: `\\textcolor{${ROLE_COLOR.energyK}}{K},\\ \\textcolor{${ROLE_COLOR.energyU}}{U},\\ E\\,(\\mathrm{J})`,
      traces: [
        { channel: 'K', role: 'energyK' },
        { channel: 'U', role: 'energyU' },
        { channel: 'E', role: 'energyE' },
      ],
      yRange: (p) => [0, E0(p) * 1.12],
    },
  ],

  // Up to the current time: undamped reference (dotted), envelope ±x_m e^{−bt/2m} and ½kx_m²e^{−bt/m} (dashed).
  drawPlot: (id, pd, p, ui) => {
    const o = oscOf(p);
    const t1 = Math.min(ui.t, T_END);
    if (t1 <= 0) return;
    const n = Math.max(2, Math.ceil(t1 * 60));
    const curve = (f: (t: number) => number) => {
      const pts: [number, number][] = [];
      for (let i = 0; i <= n; i++) {
        const t = (t1 * i) / n;
        pts.push([t, f(t)]);
      }
      return pts;
    };
    const under = regime(o) === 'under';
    if (id === 'x') {
      if (p.b > 0) pd.polyline(curve((t) => X0 * Math.cos(omega0(o) * t)), { color: REF, width: 1.25, dash: [1.5, 3] });
      if (under) for (const sg of [-1, 1]) pd.polyline(curve((t) => sg * envelope(o, X0, t)), { color: ENV, width: 1.5, dash: [6, 4] });
    } else if (id === 'E' && light(p) && p.b > 0) {
      pd.polyline(curve((t) => energyApprox(o, X0, t)), { color: ENV, width: 1.5, dash: [6, 4] });
    }
  },

  readouts: [
    { label: "\\omega'", unit: 'rad/s', value: (_s, p) => omegaPrime(oscOf(p)) },
    { label: 'E', unit: 'J', value: (s, p) => energy(oscOf(p), s.x, s.v).E },
  ],

  formula: (s, p) => {
    const o = oscOf(p);
    const w0 = omega0(o);
    const g = gamma(o);
    const r = regime(o);
    const E = energy(o, s.x, s.v).E;
    const cmp = r === 'under' ? '<' : r === 'critical' ? '=' : '>';
    const lines = [
      `\\omega_0 = \\sqrt{k/m} = \\sqrt{${p.k}/${p.m.toFixed(1)}} = ${tn(w0)}${u('rad/s')}`,
      `b = ${p.b.toFixed(1)} ${cmp} b_c = 2\\sqrt{km} = ${tn(bCrit(o))}${u('kg/s')}`,
      `\\gamma = \\frac{b}{2m} = \\frac{${p.b.toFixed(1)}}{2 \\times ${p.m.toFixed(1)}} = ${tn(g)}${u('s^{-1}')}`,
    ];
    if (r === 'under') {
      const xm = amplitudeConst(o, X0);
      lines.push(
        `\\omega' = \\sqrt{\\omega_0^2 - \\gamma^2} = ${tn(omegaPrime(o))}${u('rad/s')}`,
        `x_m e^{-bt/2m} = ${tn(xm)}\\, e^{-${tn(g)} \\times ${tn(s.t, 3)}} = ${tn(envelope(o, X0, s.t))}${u('m')}`,
        light(p)
          ? `E = ${tn(E)}${u('J')} \\approx \\tfrac{1}{2}k x_m^2 e^{-bt/m} = ${tn(energyApprox(o, X0, s.t))}${u('J')}`
          : `E = K + U = ${tn(E)}${u('J')}`,
      );
    } else if (r === 'critical') {
      lines.push(
        `\\gamma = \\omega_0:\\ x = x_0(1 + \\gamma t)e^{-\\gamma t} = ${tn(s.x)}${u('m')}`,
        `E = K + U = ${tn(E)}${u('J')}`,
      );
    } else {
      lines.push(
        `\\gamma > \\omega_0:\\ \\beta = \\sqrt{\\gamma^2 - \\omega_0^2} = ${tn(betaOver(o))}${u('s^{-1}')}`,
        `x = x_0 e^{-\\gamma t}\\left(\\cosh\\beta t + \\tfrac{\\gamma}{\\beta}\\sinh\\beta t\\right) = ${tn(s.x)}${u('m')}`,
        `E = K + U = ${tn(E)}${u('J')}`,
      );
    }
    if (p.fbd) {
      // Net force from the drawn forces (y up): F_s − mg + F_d = −kx − bv = ma.
      const [Fs, , Fd] = fbdForces(s, p).map((f) => f.F.y);
      const mg = p.m * DAMPED_G;
      const net = Fs - mg + Fd;
      const sf = sigFit([Fs, mg, Fd], (a, b, c) => a - b + c, net);
      lines.push(`\\Sigma F = F_s - mg + F_d = ${tn(Fs, sf)} - ${tn(mg, sf)} + ${tp(Fd, sf)} = ${tn(net)}${u('N')} = ma`);
    }
    return lines;
  },

  info: {
    goals: ['damped.f.goal.env', 'damped.f.goal.regimes'],
    observe: ['damped.f.obs.default', 'damped.f.obs.energy', 'damped.f.obs.crit', 'damped.f.obs.over', 'damped.f.obs.m', 'damped.f.obs.ref'],
    equations: [
      'm\\frac{d^2x}{dt^2} + b\\frac{dx}{dt} + kx = 0',
      "x = x_m e^{-bt/2m}\\cos(\\omega' t + \\phi), \\quad \\omega' = \\sqrt{\\frac{k}{m} - \\frac{b^2}{4m^2}}",
      'b_c = 2\\sqrt{km}',
      'E(t) \\approx \\tfrac{1}{2}k x_m^2 e^{-bt/m}',
    ],
    assumptions: ['damped.f.assume.start', 'damped.f.assume.grav', 'damped.f.assume.arrows'],
  },
};
