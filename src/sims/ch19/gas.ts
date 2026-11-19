// Ch 19 scene: pressure as the sum of molecular impulses. A hard-disk gas; every bounce on the
// right wall delivers 2 m v_x. The accumulated impulse grows at the mean force, so its time
// average per wall length converges to the ideal-gas pressure NkT/A.
import { t as tr } from '../../core/i18n';
import { num, tn, u } from '../../core/tex';
import type { ParamSchema, Scene, Vec2 } from '../../core/types';
import { drawRich } from '../../draw/text';
import { ROLE_COLOR, theme } from '../../draw/theme';
import { chart, inPanel, split, stageRect, TICK, type Rect } from '../ch18/panels';
import { J_PER_V, WIN, idealForce, idealPressure, impulseTop, initGas, pCum, pWin, pressureTop, sigmaV, speedPdf, stepGas, type Gas } from './physics';

type P = { N: number; T: number; L: number; init: string; arrows: boolean };

interface S {
  t: number;
  gas: Gas;
}

const T_END = 200;
/** Bins of the speed histogram: fewer for few molecules, so a bin is not mostly empty. */
export const binsOf = (N: number) => Math.max(10, Math.min(24, Math.round(2 * Math.sqrt(N))));
const FORCE = ROLE_COLOR.force;
const DISK = '#5c5c5c';
const WALL = '#5c5c5c';
/** Width reserved for the 2mv_x label right of the box panel [px]: 6 px gap + about 32 px text. */
export const LABEL_PX = 40;

const vMax = (T: number) => 4.2 * sigmaV(T);

/** Molecules per speed bin right now (no time averaging), from the gas on the stage. */
export function speedCounts(g: Gas, T: number): number[] {
  const n = binsOf(g.N);
  const bw = vMax(T) / n;
  const c = new Array(n).fill(0);
  for (let i = 0; i < g.N; i++) {
    const k = Math.floor(Math.hypot(g.vx[i], g.vy[i]) / bw);
    if (k < n) c[k] += 1;
  }
  return c;
}

/** Count axis top for N molecules: the Maxwell–Boltzmann peak count plus room for its scatter. */
export function countTop(N: number, T: number): number {
  const peak = N * speedPdf(sigmaV(T), T) * (vMax(T) / binsOf(N));
  return Math.ceil(Math.max(1.35 * peak, peak + 3 * Math.sqrt(peak), 3));
}

const params: ParamSchema<P> = {
  N: {
    kind: 'number',
    label: 'ch19.p.N',
    desc: 'ch19.d.N',
    group: 'main',
    live: false,
    control: 'slider',
    min: 20,
    max: 1000,
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
    min: 100,
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
    min: 15,
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
  // The 2mv_x label beyond the longest impulse arrow gets its own strip at the panel's right
  // edge, so on a narrow stage it stays clear of the histogram's axis.
  const panel = { ...r, w: Math.max(1, r.w - LABEL_PX) };
  inPanel(g, panel, { x: [-0.04 * L, 1.2 * L], y: [-0.04 * L, 1.04 * L], aspect: 'contain', padPx: 8 }, (d) => {
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
    const rPx = Math.max(1.8, (gas.sigma / 2) / d.px(1));
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
  const counts = speedCounts(s.gas, p.T);
  const bw = vm / counts.length;
  const top = countTop(p.N, p.T);
  const step = [1, 2, 5, 10, 20, 50, 100, 200].find((d) => top / d <= 4) ?? 500;
  const yTickList = Array.from({ length: Math.floor(top / step) + 1 }, (_, i) => i * step);
  chart(g, r, [0, vm], [0, top], { l: 30, r: 14, t: 18, b: 36 }, (c) => {
    c.axes({ xLabel: '*v* (km/s)', yLabel: tr('ch19.hist.y'), yTickList });
    c.clip(() => {
      counts.forEach((n, k) => {
        if (n <= 0) return;
        c.d.polygon([c.P(k * bw, 0), c.P((k + 1) * bw, 0), c.P((k + 1) * bw, Math.min(n, top)), c.P(k * bw, Math.min(n, top))], {
          fill: ROLE_COLOR.velocity,
          fillAlpha: 0.35,
          color: '#ffffff',
          width: 1,
        });
      });
      // Expected count per bin, N f(v) Δv.
      const pts: Vec2[] = [];
      for (let i = 0; i <= 120; i++) {
        const v = (vm * i) / 120;
        pts.push(c.P(v, p.N * speedPdf(v, p.T) * bw));
      }
      c.d.polyline(pts, { color: '#1a1a1a', width: 1.75, dash: [5, 4] });
    });
    // A bar taller than the axis (all molecules at one speed at the start) is cut: its count on top.
    counts.forEach((n, k) => {
      if (n > top) c.d.text(c.P((k + 0.5) * bw, top), String(n), { size: 12, color: ROLE_COLOR.velocity, align: 'center', baseline: 'top', dy: 3, weight: 600 });
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
    const s: S = { t: 0, gas: initGas(p.N, p.L, p.T, p.init === 'mb' ? 'mb' : 'equal', rng) };
    return s;
  },
  step: (s, h) => {
    stepGas(s.gas, h);
    s.t = s.gas.t;
    const hits = s.gas.hits;
    let drop = 0;
    while (drop < hits.length && hits[drop].t < s.t - WIN - 2) drop++;
    if (drop) hits.splice(0, drop);
  },
  record: (s) => ({ t: s.t, J: s.gas.J, pw: pWin(s.gas), pc: pCum(s.gas) }),

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
      yRange: (p) => [0, impulseTop(p.N, p.L, p.T, T_END)],
    },
    {
      id: 'pw',
      label: '\\bar p_{\\,10\\,\\mathrm{ps}}\\,(\\mathrm{mN/m})',
      traces: [{ channel: 'pw', role: 'force' }],
      yRange: (p) => [0, pressureTop(p.N, p.L, p.T)],
    },
    {
      id: 'pc',
      label: 'J/(L\\,t)\\,(\\mathrm{mN/m})',
      traces: [{ channel: 'pc', role: 'fg' }],
      yRange: (p) => [0, pressureTop(p.N, p.L, p.T)],
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
    { label: 'J/(L\\,t)', unit: 'mN/m', value: (s) => pCum(s.gas) },
    { label: 'NkT/A', unit: 'mN/m', value: (_s, p) => idealPressure(p.N, p.L, p.T) },
  ],

  formula: (s, p) => formulaLines(s, p),

  info: {
    goals: ['ch19.goal.sum', 'ch19.goal.ideal'],
    observe: ['ch19.obs.J', 'ch19.obs.fluct', 'ch19.obs.N', 'ch19.obs.T', 'ch19.obs.hist'],
    equations: ['\\Delta p_x = 2mv_x', 'p = \\frac{F}{L} = \\frac{1}{L\\,t}\\sum 2mv_x', 'pA = NkT \\quad (\\text{2D})', 'f(v) = \\frac{mv}{kT}\\,e^{-mv^2/2kT}'],
    assumptions: ['ch19.assume.2d', 'ch19.assume.disk', 'ch19.assume.dense', 'ch19.assume.relax', 'ch19.assume.win'],
  },
};

/**
 * Σ panel: the measured pressure J/(L t) (t counted from 10 ps, as pCum does), the ideal-gas
 * NkT/A with SI values, their ratio, and the rms speed √(2kT/m) of the 2D gas.
 */
export function formulaLines(s: S, p: P): string[] {
  const g = s.gas;
  const pc = pCum(g);
  const p0 = idealPressure(p.N, p.L, p.T);
  // k and m (physics.ts KB, MASS) written out: tn prints values below 10⁻⁹ as 0.
  const kB = '1.381\\times 10^{-23}';
  const m = '6.646\\times 10^{-27}';
  return [
    `\\frac{J}{L\\,t} = \\frac{${tn(g.J, 4)}}{${num(p.L)} \\times ${tn(Math.max(g.t, WIN), 4)}} = ${tn(pc)}${u('mN/m')}`,
    `\\frac{NkT}{A} = \\frac{${num(p.N)} \\times ${kB} \\times ${num(p.T)}}{(${num(p.L)}\\times 10^{-9})^2} = ${tn(p0)}${u('mN/m')}`,
    `\\frac{J/(L\\,t)}{NkT/A} = \\frac{${tn(pc, 4)}}{${tn(p0, 4)}} = ${tn(pc / p0)}`,
    `\\sqrt{\\frac{2kT}{m}} = \\sqrt{\\frac{2 \\times ${kB} \\times ${num(p.T)}}{${m}}} = ${tn(Math.SQRT2 * sigmaV(p.T))}${u('km/s')}`,
  ];
}
