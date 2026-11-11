// Ch 19 scene: pressure as the sum of molecular impulses. A hard-disk gas; every bounce on the
// right wall delivers 2 m v_x. The accumulated impulse grows at the mean force, so its time
// average per wall length converges to the ideal-gas pressure NkT/A.
import type { ParamSchema, Scene, Vec2 } from '../../core/types';
import { drawRich } from '../../draw/text';
import { ROLE_COLOR, theme } from '../../draw/theme';
import { chart, inPanel, split, stageRect, TICK, type Rect } from '../ch18/panels';
import { J_PER_V, SIGMA, idealForce, idealPressure, initGas, sigmaV, speedPdf, stepGas, type Gas } from './physics';

type P = { N: number; T: number; L: number; init: string; arrows: boolean };

interface S {
  t: number;
  gas: Gas;
  /** Time-averaged speed histogram (probability density per bin). */
  hist: number[];
  histT: number;
}

const T_END = 200;
/** Moving-average window for the force on the wall [ps]. */
const WIN = 10;
const BINS = 24;
const HIST_DT = 0.5;
const HIST_TAU = 10;
const FORCE = ROLE_COLOR.force;
const DISK = '#5c5c5c';
const WALL = '#5c5c5c';

const vMax = (T: number) => 4.2 * sigmaV(T);

function sampleHist(s: S, p: P, first: boolean): void {
  const g = s.gas;
  const vm = vMax(p.T);
  const bw = vm / BINS;
  const c = new Array(BINS).fill(0);
  for (let i = 0; i < g.N; i++) {
    const k = Math.floor(Math.hypot(g.vx[i], g.vy[i]) / bw);
    if (k < BINS) c[k] += 1 / (g.N * bw);
  }
  const a = first ? 1 : HIST_DT / HIST_TAU;
  for (let k = 0; k < BINS; k++) s.hist[k] = (1 - a) * s.hist[k] + a * c[k];
}

/** Mean pressure since t = 0: J / (L t). */
const pCum = (s: S) => (s.t > 1 ? s.gas.J / (s.gas.L * s.t) : 0);

/** Pressure from the impulses of the last WIN ps. */
function pWin(s: S): number {
  const w = Math.min(WIN, s.t);
  if (w < 1) return 0;
  let j = 0;
  for (const h of s.gas.hits) if (h.t > s.t - WIN) j += h.J;
  return j / (s.gas.L * w);
}

const params: ParamSchema<P> = {
  N: {
    kind: 'number',
    label: 'ch19.p.N',
    desc: 'ch19.d.N',
    group: 'main',
    live: false,
    control: 'slider',
    min: 10,
    max: 400,
    step: 10,
    default: 100,
  },
  T: {
    kind: 'number',
    label: 'ch19.p.T',
    desc: 'ch19.d.T',
    group: 'main',
    live: false,
    control: 'slider',
    min: 50,
    max: 1200,
    step: 10,
    default: 300,
    unit: 'K',
  },
  L: {
    kind: 'number',
    label: 'ch19.p.L',
    desc: 'ch19.d.L',
    group: 'advanced',
    live: false,
    control: 'slider',
    min: 10,
    max: 30,
    step: 1,
    default: 20,
    unit: 'nm',
  },
  init: {
    kind: 'select',
    label: 'ch19.p.init',
    desc: 'ch19.d.init',
    group: 'advanced',
    live: false,
    default: 'equal',
    options: [
      { value: 'equal', label: 'ch19.init.equal' },
      { value: 'mb', label: 'ch19.init.mb' },
    ],
  },
  arrows: { kind: 'toggle', label: 'ch19.p.arrows', desc: 'ch19.d.arrows', group: 'advanced', live: true, default: false },
};

function drawBox(g: Parameters<Scene['draw']>[0], r: Rect, s: S, p: P): void {
  const L = p.L;
  inPanel(g, r, { x: [-0.04 * L, 1.2 * L], y: [-0.04 * L, 1.04 * L], aspect: 'contain', padPx: 8 }, (d) => {
    const gas = s.gas;
    d.polyline(
      [
        { x: L, y: 0 },
        { x: 0, y: 0 },
        { x: 0, y: L },
        { x: L, y: L },
      ],
      { color: WALL, width: 2 },
    );
    d.line({ x: L, y: 0 }, { x: L, y: L }, { color: FORCE, width: 3 });
    const rPx = Math.max(1.8, (SIGMA / 2) / d.px(1));
    const k = (0.035 * L) / sigmaV(p.T);
    for (let i = 0; i < gas.N; i++) {
      const c: Vec2 = { x: gas.x[i], y: gas.y[i] };
      if (p.arrows) d.arrow(c, { x: gas.vx[i] * k, y: gas.vy[i] * k }, { role: 'velocity', width: 1, alpha: 0.8 });
      d.circle(c, rPx, { fill: DISK });
    }
    // Recent bounces on the right wall: impulse arrows that fade out.
    const fade = 1.5;
    const Jref = J_PER_V * 1.25 * sigmaV(p.T);
    let last: (typeof gas.hits)[number] | null = null;
    for (const h of gas.hits) {
      const age = s.t - h.t;
      if (age > fade || age < 0) continue;
      const len = 0.07 * L * (h.J / Jref);
      d.arrow({ x: L, y: h.y }, { x: len, y: 0 }, { color: FORCE, width: 2, alpha: 1 - age / fade });
      last = h;
    }
    if (last) {
      const len = 0.07 * L * (last.J / Jref);
      d.text({ x: L + len, y: last.y }, '2*mv*_{*x*}', { size: 12, color: FORCE, align: 'left', baseline: 'middle', dx: 6 });
    }
  });
}

function drawHist(g: Parameters<Scene['draw']>[0], r: Rect, s: S, p: P): void {
  const vm = vMax(p.T);
  const fmax = 1.25 * Math.max(speedPdf(sigmaV(p.T), p.T), ...s.hist.map((v) => Math.min(v, 2.2 * speedPdf(sigmaV(p.T), p.T))));
  chart(g, r, [0, vm], [0, fmax], { l: 16, r: 14, t: 18, b: 36 }, (c) => {
    c.axes({ xLabel: '*v* (km/s)', yTicks: 0 });
    const bw = vm / s.hist.length;
    c.clip(() => {
      s.hist.forEach((h, k) => {
        if (h <= 0) return;
        c.d.polygon([c.P(k * bw, 0), c.P((k + 1) * bw, 0), c.P((k + 1) * bw, h), c.P(k * bw, h)], {
          fill: ROLE_COLOR.velocity,
          fillAlpha: 0.35,
          color: '#ffffff',
          width: 1,
        });
      });
      const pts: Vec2[] = [];
      for (let i = 0; i <= 120; i++) {
        const v = (vm * i) / 120;
        pts.push(c.P(v, speedPdf(v, p.T)));
      }
      c.d.polyline(pts, { color: '#1a1a1a', width: 1.75, dash: [5, 4] });
    });
  });
}

export const gasScene: Scene<P, S> = {
  id: 'pressure',
  title: 'ch19.scene',
  params,
  time: { h: 0.01, recordEvery: 10, frameStep: 1, tEnd: T_END, scale: 10, unit: 'ps' },
  world: () => ({ x: [0, 1], y: [0, 1], aspect: 'contain' }),
  init: (p, rng) => {
    const s: S = { t: 0, gas: initGas(p.N, p.L, p.T, p.init === 'mb' ? 'mb' : 'equal', rng), hist: new Array(BINS).fill(0), histT: 0 };
    sampleHist(s, p, true);
    return s;
  },
  step: (s, h, p) => {
    stepGas(s.gas, h);
    s.t = s.gas.t;
    const hits = s.gas.hits;
    let drop = 0;
    while (drop < hits.length && hits[drop].t < s.t - WIN - 2) drop++;
    if (drop) hits.splice(0, drop);
    if (s.t - s.histT >= HIST_DT - 1e-9) {
      s.histT = s.t;
      sampleHist(s, p, false);
    }
  },
  record: (s) => ({ t: s.t, J: s.gas.J, pw: pWin(s), pc: pCum(s) }),

  draw: (g, s, p) => {
    const full = stageRect(g);
    const [box, hist] = full.w > 1.45 * full.h ? split(full, 'row', [1.15, 0.85], 8) : split(full, 'col', [1.7, 1], 4);
    drawBox(g, box, s, p);
    drawHist(g, hist, s, p);
  },

  plots: [
    {
      id: 'J',
      label: 'J\\,(\\mathrm{pN\\cdot ps})',
      traces: [{ channel: 'J', role: 'force' }],
      yRange: (p) => [0, 1.3 * idealForce(p.N, p.L, p.T) * T_END],
    },
    {
      id: 'pw',
      label: '\\bar p_{\\,10\\,\\mathrm{ps}}\\,(\\mathrm{mN/m})',
      traces: [{ channel: 'pw', role: 'force' }],
      yRange: (p) => [0, 2.4 * idealPressure(p.N, p.L, p.T)],
    },
    {
      id: 'pc',
      label: 'J/(L\\,t)\\,(\\mathrm{mN/m})',
      traces: [{ channel: 'pc', role: 'fg' }],
      yRange: (p) => [0, 2.4 * idealPressure(p.N, p.L, p.T)],
    },
  ],

  // Ideal-gas references, dashed: J = F t on the impulse plot, NkT/A on the pressure plots.
  drawPlot: (id, pd, p) => {
    const F = idealForce(p.N, p.L, p.T);
    const p0 = idealPressure(p.N, p.L, p.T);
    const st = { color: '#1a1a1a', width: 1.25, dash: [5, 4], alpha: 0.7 };
    if (id === 'J') pd.polyline([[0, 0], [T_END, F * T_END]], st);
    else {
      pd.polyline([[0, p0], [T_END, p0]], st);
      const [x, y] = pd.toPx(T_END, p0);
      drawRich(pd.ctx, '*NkT*/*A*', x - 4 * theme.scale, y - 6 * theme.scale, { size: 11, color: TICK, align: 'right' });
    }
  },

  readouts: [
    { label: 'J/(L\\,t)', unit: 'mN/m', value: (s) => pCum(s) },
    { label: 'NkT/A', unit: 'mN/m', value: (_s, p) => idealPressure(p.N, p.L, p.T) },
  ],

  info: {
    goals: ['ch19.goal.sum', 'ch19.goal.ideal'],
    observe: ['ch19.obs.J', 'ch19.obs.fluct', 'ch19.obs.N', 'ch19.obs.T', 'ch19.obs.hist'],
    equations: ['\\Delta p_x = 2mv_x', 'p = \\frac{F}{L} = \\frac{1}{L\\,t}\\sum 2mv_x', 'pA = NkT \\quad (\\text{2D})', 'f(v) = \\frac{mv}{kT}\\,e^{-mv^2/2kT}'],
    assumptions: ['ch19.assume.2d', 'ch19.assume.disk', 'ch19.assume.dense'],
  },
};
