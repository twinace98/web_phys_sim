// Ch 15 scene: simple pendulum at large amplitude against its small-angle (SHM) model.
// Both are released together from θ₀; the real one falls behind as θ₀ grows.
import type { ParamSchema, Scene, Vec2 } from '../../core/types';
import { exactPeriod, pendulumStep, smallAnglePeriod, type Pendulum } from './physics';

type P = { theta0: number; L: number };
type S = { t: number; th: number; w: number };

const DEG = Math.PI / 180;
const G = 9.8;
const RATE = 1000;
const GHOST = '#8c8c8c';

const pend = (p: P): Pendulum => ({ L: p.L, g: G });
/** Small-angle model θ₀ cos ω₀t. */
const model = (p: P, t: number) => p.theta0 * DEG * Math.cos(Math.sqrt(G / p.L) * t);

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
};

export const pendulum: Scene<P, S> = {
  id: 'pendulum',
  title: 'ch15.n.scene',
  layout: 'side',
  params,
  time: { h: 1 / RATE, recordEvery: 8, frameStep: 0.05, window: 8 },
  world: () => ({ x: [-1.15, 1.15], y: [-1.15, 1.0], aspect: 'contain', padPx: 18 }),

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

    const ghost = model(p, s.t);
    const G0: Vec2 = { x: Math.sin(ghost), y: -Math.cos(ghost) };
    g.line(O, G0, { color: GHOST, width: 1.25, dash: [5, 4] });
    g.circle(G0, 11, { color: GHOST, width: 1.5, fill: '#ffffff' });

    const B: Vec2 = { x: Math.sin(s.th), y: -Math.cos(s.th) };
    g.line(O, B, { color: '#1a1a1a', width: 1.5 });
    g.circle(B, 11, { fill: 'position' });
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
    pd.polyline(pts, { color: GHOST, width: 1.5, dash: [5, 4] });
  },

  readouts: [
    { label: 'T', unit: 's', value: (_s, p) => exactPeriod(pend(p), p.theta0 * DEG) },
    { label: 'T_0', unit: 's', value: (_s, p) => smallAnglePeriod(pend(p)) },
    { label: 'T/T_0', unit: '', value: (_s, p) => exactPeriod(pend(p), p.theta0 * DEG) / smallAnglePeriod(pend(p)) },
  ],

  info: {
    goals: ['ch15.n.goal.small', 'ch15.n.goal.large'],
    observe: ['ch15.n.obs.ghost', 'ch15.n.obs.10', 'ch15.n.obs.L'],
    equations: ['\\ddot\\theta = -\\frac{g}{L}\\sin\\theta \\approx -\\frac{g}{L}\\theta', 'T_0 = 2\\pi\\sqrt{L/g}'],
    assumptions: ['ch15.n.assume'],
  },
};
