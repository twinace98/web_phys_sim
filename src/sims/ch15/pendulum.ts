// Ch 15 scene: the real (nonlinear) simple pendulum with live v, a_t and a_r arrows, and its period
// compared with the small-angle (SHM) model T₀ = 2π√(L/g). The model appears only as a faint curve
// in the θ(t) graph and as numbers in the readouts and the formula panel.
import type { ParamSchema, Scene, Vec2 } from '../../core/types';
import { num, paren, tn, u } from '../../core/tex';
import { ellipticK, exactPeriod, pendulumAccel, pendulumMax, pendulumStep, periodError, smallAnglePeriod, type Pendulum } from './physics';

type P = { theta0: number; L: number; vectors: boolean };
type S = { t: number; th: number; w: number };

const DEG = Math.PI / 180;
const G = 9.8;
const RATE = 1000;
const MODEL = '#8c8c8c';
/** Bob radius [px]. */
const BOB = 11;
/** Longest arrow over the swing [L]: v and the acceleration components are each scaled to it. */
export const ARROW_MAX = 0.45;
/** The a_t arrow runs beside v (same line), this many px further from the pivot. */
const AT_OFFSET = 20;

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
    default: 90,
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
  vectors: { kind: 'toggle', label: 'ch15.n.p.vectors', desc: 'ch15.n.d.vectors', group: 'advanced', live: true, default: true },
};

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

/** Significant figures for T and T₀ in the formula panel, so that their difference keeps 3 digits. */
export const sigFor = (err: number) => Math.min(8, Math.max(4, 3 + Math.ceil(-Math.log10(Math.max(err, 1e-8)))));

export const pendulum: Scene<P, S> = {
  id: 'pendulum',
  title: 'ch15.n.scene',
  layout: 'side',
  params,
  time: { h: 1 / RATE, recordEvery: 8, frameStep: 0.05, window: 8 },
  world: (p) => ({ x: [-1.2, 1.2], y: [-1.2, worldTop(p)], aspect: 'contain', padPx: 18 }),

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
      // Arrows shorter than the bob are hidden under it; labels only where they clear the bob.
      const { v, at, ar } = bobArrows(s, p);
      const show = (a: Vec2) => Math.hypot(a.x, a.y) > g.px(BOB + 3);
      const lbl = (a: Vec2, txt: string) => (Math.hypot(a.x, a.y) > g.px(BOB + 12) ? txt : undefined);
      const off = g.px(AT_OFFSET);
      const atFrom: Vec2 = { x: B.x + Math.sin(s.th) * off, y: B.y - Math.cos(s.th) * off };
      if (show(ar)) {
        // a_r runs along the string: its label sits beside the tip, on the side v is not heading to.
        g.arrow(B, ar, { role: 'acceleration', width: 2.25 });
        if (lbl(ar, 'x')) {
          const side = (s.w >= 0 ? -1 : 1) * g.px(12);
          const tip = { x: B.x + ar.x + Math.cos(s.th) * side, y: B.y + ar.y + Math.sin(s.th) * side };
          g.text(tip, '*a*_{r}', { role: 'acceleration', size: 13, align: 'center', baseline: 'middle' });
        }
      }
      if (show(at)) {
        g.line(B, atFrom, { role: 'acceleration', width: 1, alpha: 0.5, dash: [2, 3] });
        g.arrow(atFrom, at, { role: 'acceleration', width: 2.25, label: lbl(at, '*a*_{t}') });
      }
      if (show(v)) g.arrow(B, v, { role: 'velocity', width: 2.25, label: lbl(v, '*v*') });
    }
    g.circle(B, BOB, { fill: 'position' });
    g.circle(O, 3, { fill: '#5c5c5c' });
  },

  plots: [
    {
      id: 'th',
      label: '\\theta\\,(^\\circ)',
      traces: [{ channel: 'th', role: 'position' }],
      yRange: (p) => [-p.theta0 * 1.2, p.theta0 * 1.2],
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
    const sig = sigFor(err);
    const L = p.L.toFixed(1);
    const { at, ar } = pendulumAccel(pd, s.th, s.w);
    const v = p.L * s.w;
    const deg = s.th / DEG;
    const K = ellipticK(Math.sin(th0 / 2));
    return [
      `T_0 = 2\\pi\\sqrt{L/g} = 2\\pi\\sqrt{${L}/9.8} = ${tn(T0, sig)}${u('s')}`,
      `K\\!\\left(\\sin\\tfrac{\\theta_0}{2}\\right) = K(\\sin ${num(p.theta0 / 2)}^\\circ) = ${tn(K, 4)}`,
      `T = 4\\sqrt{L/g}\\,K = 4\\sqrt{${L}/9.8} \\times ${tn(K, 4)} = ${tn(T, sig)}${u('s')}`,
      `\\frac{T - T_0}{T_0} = \\frac{${tn(T, sig)} - ${tn(T0, sig)}}{${tn(T0, sig)}} = ${tn(100 * err)}\\ \\%`,
      `a_\\mathrm{t} = -g\\sin\\theta = -9.8\\sin(${tn(deg)}^\\circ) = ${tn(at)}${u('m/s^2')}`,
      `a_{\\mathrm{t},0} = -g\\theta = -9.8 \\times ${paren(tn(s.th))} = ${tn(-G * s.th)}${u('m/s^2')}`,
      `a_\\mathrm{r} = v^2/L = (${tn(v)})^2/${L} = ${tn(ar)}${u('m/s^2')}`,
    ];
  },

  info: {
    goals: ['ch15.n.goal.small', 'ch15.n.goal.large'],
    observe: ['ch15.n.obs.err', 'ch15.n.obs.arrows', 'ch15.n.obs.graph', 'ch15.n.obs.at', 'ch15.n.obs.L'],
    equations: [
      '\\ddot\\theta = -\\frac{g}{L}\\sin\\theta \\approx -\\frac{g}{L}\\theta',
      'T_0 = 2\\pi\\sqrt{L/g}, \\quad T = 4\\sqrt{L/g}\\,K\\!\\left(\\sin\\tfrac{\\theta_0}{2}\\right)',
      'K(k) = \\int_0^{\\pi/2} \\frac{d\\phi}{\\sqrt{1 - k^2\\sin^2\\phi}}',
      'a_\\mathrm{t} = -g\\sin\\theta, \\quad a_\\mathrm{r} = \\frac{v^2}{L}',
    ],
    assumptions: ['ch15.n.assume', 'ch15.n.assume.err', 'ch15.n.assume.arrows'],
  },
};
