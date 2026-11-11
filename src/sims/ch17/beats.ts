// Ch 17 scene: beats. Two waves of nearby frequency (y₁ blue, y₂ orange) and their sum (black)
// with its envelope. The strip above shows the two amplitudes as arrows in a frame turning at
// the mean frequency: they drift apart at f₂ − f₁, so the sum swells and fades.
import type { ParamSchema, Scene, Vec2 } from '../../core/types';
import { soundTick } from './audio';
import { beatEnvelope, beatFrequency, wave } from './physics';

type P = { f1: number; df: number; sound: boolean };
type S = { t: number; y1: number; y2: number };

const A = 1;
const RATE = 4440; // ≥ 10 samples per period of the highest tone (444 Hz)
const ENV = '#8c8c8c';

const f2Of = (p: P) => p.f1 + p.df;

const params: ParamSchema<P> = {
  f1: {
    kind: 'number',
    label: 'ch17.b.p.f1',
    desc: 'ch17.b.d.f1',
    group: 'main',
    live: false,
    control: 'slider',
    min: 20,
    max: 440,
    step: 1,
    default: 20,
    unit: 'Hz',
  },
  df: {
    kind: 'number',
    label: 'ch17.b.p.df',
    desc: 'ch17.b.d.df',
    group: 'main',
    live: false,
    control: 'slider',
    min: 1,
    max: 4,
    step: 0.1,
    default: 2,
    unit: 'Hz',
  },
  sound: { kind: 'toggle', label: 'ch17.b.p.sound', desc: 'ch17.b.d.sound', group: 'advanced', live: true, default: false },
};

const sample = (p: P, t: number): S => ({ t, y1: wave(A, p.f1, t), y2: wave(A, f2Of(p), t) });

export const beats: Scene<P, S> = {
  id: 'beats',
  title: 'ch17.b.scene',
  layout: 'stack',
  params,
  // Two beat periods, shown at 1/4 speed.
  time: { h: 1 / RATE, recordEvery: 1, frameStep: 0.01, scale: 0.25, tEnd: (p) => 2 / (p as P).df },
  world: () => ({ x: [-6, 6], y: [-2.35, 2.35], aspect: 'contain', padPx: 10 }),

  init: (p) => sample(p, 0),
  step: (s, h, p) => {
    Object.assign(s, sample(p, s.t + h));
  },
  record: (s) => ({ t: s.t, y1: s.y1, y2: s.y2, y: s.y1 + s.y2 }),
  snapshot: (s) => ({ ...s }),

  draw: (g, s, p) => {
    soundTick(p.sound, p.f1, f2Of(p));
    // Arrows of length A turning at ∓π(f₂ − f₁) relative to the mean frequency; their sum stays vertical.
    const ph = Math.PI * p.df * s.t;
    const O: Vec2 = { x: 0, y: 0 };
    const a1: Vec2 = { x: A * Math.sin(ph), y: A * Math.cos(ph) };
    const a2: Vec2 = { x: -A * Math.sin(ph), y: A * Math.cos(ph) };
    const ring: Vec2[] = [];
    for (let i = 0; i <= 96; i++) ring.push({ x: 2 * A * Math.cos((i / 96) * 2 * Math.PI), y: 2 * A * Math.sin((i / 96) * 2 * Math.PI) });
    g.polyline(ring, { color: '#d8d8d8', width: 1, dash: [3, 4] });
    g.line({ x: 0, y: -2 * A }, { x: 0, y: 2 * A }, { color: '#e6e6e6', width: 1 });
    const sum: Vec2 = { x: a1.x + a2.x, y: a1.y + a2.y };
    g.arrow(O, a1, { role: 'position', width: 2.25, label: '*y*_{1}' });
    g.arrow(a1, a2, { role: 'energyU', width: 2.25, label: '*y*_{2}' });
    g.arrow(O, sum, { role: 'fg', width: 2.5 });
    g.circle(O, 3, { fill: '#5c5c5c' });
  },

  plots: [
    { id: 'y1', label: 'y_1', traces: [{ channel: 'y1', role: 'position' }], yRange: () => [-1.3 * A, 1.3 * A] },
    { id: 'y2', label: 'y_2', traces: [{ channel: 'y2', role: 'energyU' }], yRange: () => [-1.3 * A, 1.3 * A] },
    { id: 'y', label: 'y = y_1 + y_2', traces: [{ channel: 'y', role: 'fg' }], yRange: () => [-2.5 * A, 2.5 * A] },
  ],

  drawPlot: (id, pd, p, ui) => {
    if (id !== 'y') return;
    const n = 400;
    for (const sg of [-1, 1]) {
      const pts: [number, number][] = [];
      for (let i = 0; i <= n; i++) {
        const t = (ui.t * i) / n;
        pts.push([t, sg * beatEnvelope(A, p.f1, f2Of(p), t)]);
      }
      pd.polyline(pts, { color: ENV, width: 1.5, dash: [5, 4] });
    }
  },

  readouts: [
    { label: 'f_2', unit: 'Hz', value: (_s, p) => f2Of(p) },
    { label: 'f_\\text{beat}', unit: 'Hz', value: (_s, p) => beatFrequency(p.f1, f2Of(p)) },
    { label: 'T_\\text{beat}', unit: 's', value: (_s, p) => 1 / beatFrequency(p.f1, f2Of(p)) },
  ],

  info: {
    goals: ['ch17.b.goal.sum', 'ch17.b.goal.fbeat'],
    observe: ['ch17.b.obs.phase', 'ch17.b.obs.env', 'ch17.b.obs.df', 'ch17.b.obs.arrows', 'ch17.b.obs.sound'],
    equations: [
      'y = 2A\\cos\\!\\big(2\\pi \\tfrac{f_2 - f_1}{2} t\\big)\\cos\\!\\big(2\\pi \\tfrac{f_1 + f_2}{2} t\\big)',
      'f_\\text{beat} = \\lvert f_1 - f_2 \\rvert',
    ],
    assumptions: ['ch17.b.assume.amp', 'ch17.b.assume.slow', 'ch17.b.assume.arrows'],
  },
};
