// Ch 28 scene: cyclotron. A proton starts at rest in the gap between two dees; the gap
// voltage alternates, and the field turns the proton back to the gap every half period.
// Only when the oscillator frequency equals the cyclotron frequency does every crossing accelerate.
import type { ParamSchema, Scene, Vec2 } from '../../core/types';
import { withAlpha, ROLE_COLOR } from '../../draw/theme';
import { fieldGrid, particle } from './common';
import { PARTICLES, cyclotronOmega, gapVoltage, runCyclotron, sampleRun, type Cyclotron, type Run } from './physics';

type P = { ratio: number; V0: number };

interface S {
  t: number;
  n: number;
}

const RATE = 120;
const R = 0.05; // dee radius [m]
const GAP = 0.006; // gap width [m]
const B = 1; // [T]
const KEV = 1e3 * 1.602176634e-19;
const DEE = '#f1f3f5';
const EDGE = '#9a9a9a';

const cfgOf = (p: P): Cyclotron => ({ pt: PARTICLES.proton, B, R, gap: GAP, V0: p.V0 * 1e3, ratio: p.ratio });
const TC = (2 * Math.PI) / cyclotronOmega(cfgOf({ ratio: 1, V0: 10 })); // [s]
const NS_PER_SEC = (TC * 1e9) / 1.2; // one turn in 1.2 s at 1×
const T_MAX = 12 * TC;

let memoKey = '';
let memo: Run | null = null;
function runOf(p: P): Run {
  const key = `${p.ratio}|${p.V0}`;
  if (key !== memoKey || !memo) {
    memo = runCyclotron(cfgOf(p), T_MAX, 1e-11, 10, 1.3 * R);
    memoKey = key;
  }
  return memo;
}
/** End of the run [ns]: the proton has left the view, or 12 cyclotron periods. */
const tEndNs = (p: P) => Math.min(T_MAX, runOf(p).tStop) * 1e9;

const params: ParamSchema<P> = {
  ratio: {
    kind: 'number',
    label: 'ch28.c.p.ratio',
    desc: 'ch28.c.d.ratio',
    group: 'main',
    live: false,
    control: 'select',
    choices: [0.9, 0.95, 1, 1.05, 1.1],
    default: 1,
  },
  V0: {
    kind: 'number',
    label: 'ch28.c.p.V0',
    desc: 'ch28.c.d.V0',
    group: 'main',
    live: false,
    control: 'select',
    choices: [5, 10, 20],
    default: 10,
    unit: 'kV',
  },
};

/** Outline of a dee (right: side = 1, left: side = −1), in cm. */
function dee(side: 1 | -1): Vec2[] {
  const a = Math.acos(GAP / 2 / R);
  const pts: Vec2[] = [];
  for (let i = 0; i <= 48; i++) {
    const th = -a + (2 * a * i) / 48;
    pts.push({ x: side * R * Math.cos(th) * 100, y: R * Math.sin(th) * 100 });
  }
  return pts;
}
const DEES = [dee(1), dee(-1)];

export const cyclotronScene: Scene<P, S> = {
  id: 'cyclotron',
  title: 'ch28.scene.cyclotron',
  params,
  layout: 'side',
  time: { h: 1 / RATE, recordEvery: 2, frameStep: 0.05, unit: 'ns', tEnd: (p) => tEndNs(p as P) },
  world: () => ({ x: [-6.6, 6.6], y: [-6.6, 6.6], aspect: 'contain', padPx: 12 }),

  init: () => ({ t: 0, n: 0 }),
  step: (s, h, p) => {
    s.n += 1;
    s.t = Math.min(s.n * h * NS_PER_SEC, tEndNs(p));
  },
  record: (s, p) => {
    const k = sampleRun(runOf(p), s.t * 1e-9);
    return { t: s.t, vg: gapVoltage(cfgOf(p), s.t * 1e-9) / 1e3, K: k.K / KEV };
  },
  snapshot: (s) => ({ ...s }),

  draw: (g, s, p) => {
    const run = runOf(p);
    const c = cfgOf(p);
    const tS = s.t * 1e-9;
    const Rc = R * 100;
    for (const d of DEES) g.polygon(d, { fill: DEE, color: EDGE, width: 1.25 });
    fieldGrid(g, -Rc, Rc, -Rc, Rc, 46, (q) => Math.hypot(q.x, q.y) < Rc - g.px(8) && Math.abs(q.x) > (GAP * 100) / 2 + g.px(8));

    // Dee polarity: the left dee is positive when V > 0, so E in the gap points along +x.
    const v = gapVoltage(c, tS) / c.V0;
    const a = Math.min(1, Math.abs(v) * 1.2);
    const gx = (GAP * 100) / 2;
    for (const y of [-0.6 * Rc, 0.6 * Rc]) {
      for (const side of [-1, 1] as const) {
        const positive = side * v < 0;
        g.text({ x: side * (gx + 0.7), y }, positive ? '+' : '−', {
          size: 18,
          weight: 700,
          align: 'center',
          baseline: 'middle',
          color: withAlpha(positive ? ROLE_COLOR.positive : ROLE_COLOR.negative, a),
        });
      }
      if (Math.abs(v) > 0.05) g.arrow({ x: -v * gx * 1.6, y: y + 0.9 }, { x: 2 * v * gx * 1.6, y: 0 }, { role: 'field', width: 1.75 });
    }
    g.text({ x: 0, y: 0.6 * Rc + 0.9 }, '*E*', { size: 13, role: 'field', align: 'center', dy: -12 });

    // Path so far (from the precomputed run) and the proton.
    const end = sampleRun(run, tS);
    const pts: Vec2[] = [];
    const stride = 3;
    for (let i = 0; i <= end.i; i += stride) pts.push({ x: run.x[i] * 100, y: run.y[i] * 100 });
    pts.push({ x: end.x * 100, y: end.y * 100 });
    g.polyline(pts, { role: 'position', width: 1.5, alpha: 0.7 });
    particle(g, { x: end.x * 100, y: end.y * 100 }, true, 6);
  },

  plots: [
    {
      id: 'vg',
      label: 'V_\\text{gap}\\,(\\mathrm{kV})',
      traces: [{ channel: 'vg', role: 'field' }],
      yRange: (p) => [-1.25 * p.V0, 1.25 * p.V0],
    },
    {
      id: 'K',
      label: 'K\\,(\\mathrm{keV})',
      traces: [{ channel: 'K', role: 'energyK' }],
      yRange: () => [-6, 135],
    },
  ],

  readouts: [
    { label: 'K', unit: 'keV', value: (s, p) => sampleRun(runOf(p), s.t * 1e-9).K / KEV },
    {
      label: 'r',
      unit: 'cm',
      value: (s, p) => {
        const k = sampleRun(runOf(p), s.t * 1e-9);
        return Math.hypot(k.x, k.y) * 100;
      },
    },
  ],

  info: {
    goals: ['ch28.c.goal.res', 'ch28.c.goal.K'],
    observe: ['ch28.c.obs.step', 'ch28.c.obs.spiral', 'ch28.c.obs.detune', 'ch28.c.obs.V0'],
    equations: ['f_c = \\frac{\\lvert q\\rvert B}{2\\pi m}', 'K_\\text{max} = \\frac{(qBR)^2}{2m}'],
    assumptions: ['ch28.c.assume'],
  },
};
