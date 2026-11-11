// Ch 40 scenes: one Stern-Gerlach device (classical prediction vs quantum result), devices in
// sequence, and the cos²(θ/2) statistics of a measurement at an angle.
import type { Rng } from '../../core/rng';
import type { ParamSchema, Scene } from '../../core/types';
import type { Draw } from '../../draw/draw';
import { Frame, PX_WORLD, TICK, W, canvasBox, rectPx, split, textPx } from '../modern/frame';
import { DOWN_COLOR, UP_COLOR, chainEnd, chainGeometry, drawChain, initChain, stepChain, type ChainState } from './chain';
import { DEG, chainProbs, classicalMuZ, probUp, type Device } from './physics';

const H = 1 / 120;

// ------------------------------------------------------------------ single device

type P1 = { model: string; N: number };

interface S1 {
  t: number;
  n: number;
  rng: Rng;
  emitted: number;
  flying: { te: number; u: number }[];
  /** Screen hits: horizontal position and deflection, in units of the full splitting. */
  hits: { x: number; z: number }[];
}

const FLIGHT1 = 1.2;
const X_MAG0 = 0.3;
const X_MAG1 = 0.6;
const X_SCREEN = 0.95;
/** Deflection inside the magnet grows as (x − x0)², then continues straight: screen at 0.4 u. */
function yAt(x: number, u: number): number {
  if (x <= X_MAG0) return 0;
  if (x <= X_MAG1) return 0.12 * u * ((x - X_MAG0) / (X_MAG1 - X_MAG0)) ** 2;
  return 0.12 * u + 0.8 * u * (x - X_MAG1);
}

const rate1 = (p: P1) => p.N / 8;

const singleParams: ParamSchema<P1> = {
  model: {
    kind: 'select',
    label: 'ch40.s.p.model',
    desc: 'ch40.s.d.model',
    group: 'main',
    live: false,
    default: 'quantum',
    options: [
      { value: 'classical', label: 'ch40.model.classical' },
      { value: 'quantum', label: 'ch40.model.quantum' },
    ],
  },
  N: {
    kind: 'number',
    label: 'ch40.p.N',
    desc: 'ch40.d.N',
    group: 'main',
    live: false,
    control: 'select',
    choices: [200, 1000, 5000],
    default: 1000,
  },
};

/** Draws one atom's deflection u ∈ [−1, 1]: ±1 (quantum) or uniform (classical). */
export function deflection(model: string, rng: Rng): number {
  return model === 'classical' ? classicalMuZ(rng) : rng.next() < 0.5 ? 1 : -1;
}

const GREY = '#c8c8c8';
const POLE = '#d9d9d9';

export const single: Scene<P1, S1> = {
  id: 'single',
  title: 'ch40.s.scene',
  params: singleParams,
  world: PX_WORLD,
  time: { h: H, recordEvery: 6, frameStep: 0.1, tEnd: (p) => ((p as P1).N - 1) / rate1(p as P1) + FLIGHT1 + 0.05 },
  init: (_p, rng) => ({ t: 0, n: 0, rng, emitted: 0, flying: [], hits: [] }),
  step: (s, _h, p) => {
    s.n += 1;
    s.t = s.n * H;
    const r = rate1(p);
    while (s.emitted < p.N && s.emitted / r <= s.t) {
      s.flying.push({ te: s.emitted / r, u: deflection(p.model, s.rng) });
      s.emitted++;
    }
    const still: S1['flying'] = [];
    for (const a of s.flying) {
      if (s.t - a.te >= FLIGHT1) {
        // Beam ribbon: wide sideways, thin in z.
        s.hits.push({ x: 1.6 * s.rng.next() - 0.8, z: a.u + 0.06 * s.rng.normal() });
      } else still.push(a);
    }
    s.flying = still;
  },

  draw: (g, s, p) => {
    const o = canvasBox(g);
    const wide = g.vp.w > g.vp.h * 1.1;
    const [bA, bB] = split({ l: o.l + 30, t: o.t + 40, r: o.r - 44, b: o.b - 30 }, wide, wide ? 0.66 : 0.55, 40);
    const f = new Frame(g, bA, [0, 1], [-1, 1]);
    // Oven, collimator, magnet poles, screen.
    f.polygon(
      [
        [0, -0.12],
        [0.06, -0.12],
        [0.06, 0.12],
        [0, 0.12],
      ],
      { fill: POLE, color: '#8c8c8c', width: 1 },
    );
    f.line(0.17, 0.03, 0.17, 0.22, { color: '#5c5c5c', width: 4 });
    f.line(0.17, -0.03, 0.17, -0.22, { color: '#5c5c5c', width: 4 });
    for (const [y0, y1, name] of [
      [0.2, 0.55, 'N'],
      [-0.55, -0.2, 'S'],
    ] as [number, number, string][]) {
      f.polygon(
        [
          [X_MAG0, y0],
          [X_MAG1, y0],
          [X_MAG1, y1],
          [X_MAG0, y1],
        ],
        { fill: POLE, color: '#8c8c8c', width: 1 },
      );
      f.text((X_MAG0 + X_MAG1) / 2, (y0 + y1) / 2, name, { size: 15, color: '#5c5c5c', align: 'center', baseline: 'middle' });
    }
    f.line(X_SCREEN, -0.62, X_SCREEN, 0.62, { color: '#5c5c5c', width: 3 });
    // Predicted paths: a fan (classical) or two beams (quantum).
    const path = (u: number): [number, number][] => {
      const pts: [number, number][] = [];
      for (let i = 0; i <= 40; i++) {
        const x = 0.06 + ((X_SCREEN - 0.06) * i) / 40;
        pts.push([x, yAt(x, u)]);
      }
      return pts;
    };
    if (p.model === 'classical') f.polygon([...path(1), ...path(-1).reverse()], { fill: '#9a9a9a', fillAlpha: 0.15 });
    else for (const u of [1, -1]) f.polyline(path(u), { color: GREY, width: 2 });
    f.line(0.06, 0, X_MAG0, 0, { color: GREY, width: 2 });
    for (const a of s.flying) {
      const x = 0.06 + ((s.t - a.te) / FLIGHT1) * (X_SCREEN - 0.06);
      if (x >= 0.06) g.circle(f.P(x, yAt(x, a.u)), 2.5, { fill: '#1a1a1a' });
    }
    // The screen seen face on.
    const sc = new Frame(g, bB, [-1, 1], [-1.3, 1.3]);
    rectPx(g, bB, { fill: '#f6f6f6', color: '#c8c8c8', width: 1 });
    let nUp = 0;
    for (const h of s.hits) {
      if (h.z >= 0) nUp++;
      g.circle(sc.P(h.x, h.z), 1.6, { fill: h.z >= 0 ? UP_COLOR : DOWN_COLOR, alpha: 0.7 });
    }
    // Counts above and below the middle of the screen.
    textPx(g, bB.r + 6, sc.Y(1), String(nUp), { size: 13, color: UP_COLOR, baseline: 'middle' });
    textPx(g, bB.r + 6, sc.Y(-1), String(s.hits.length - nUp), { size: 13, color: DOWN_COLOR, baseline: 'middle' });
    // z direction on both views.
    const ax = bB.l - 12;
    g.arrow(W(g, ax, sc.Y(-0.4)), { x: 0, y: g.px(sc.Y(-0.4) - sc.Y(0.4)) }, { color: TICK, width: 1.5 });
    textPx(g, ax, sc.Y(0.4) - 10, '*z*', { size: 13, color: TICK, align: 'center' });
  },

  readouts: [
    { label: 'N', unit: '', value: (s) => s.hits.length, sig: 1 },
    { label: 'N_{\\uparrow}/N', unit: '', value: (s) => (s.hits.length ? s.hits.filter((h) => h.z >= 0).length / s.hits.length : NaN), sig: 2 },
  ],

  info: {
    goals: ['ch40.s.goal.quant', 'ch40.s.goal.classical'],
    observe: ['ch40.s.obs.band', 'ch40.s.obs.two', 'ch40.s.obs.random'],
    equations: ['F_z = \\mu_z \\frac{\\partial B}{\\partial z}', '\\mu_z = -g_s \\frac{e}{2m} S_z, \\quad S_z = \\pm\\tfrac12\\hbar'],
    assumptions: ['ch40.s.assume.atom', 'ch40.s.assume.view'],
  },
};

// ------------------------------------------------------------------ sequential devices

type P2 = { setup: string; pass: string; N: number };

export function devicesOf(setup: string, pass: string): Device[] {
  const z = 0;
  const x = 90 * DEG;
  switch (setup) {
    case 'zz':
      return [
        { theta: z, pass: '+' },
        { theta: z, pass: 'both' },
      ];
    case 'zx':
      return [
        { theta: z, pass: '+' },
        { theta: x, pass: 'both' },
      ];
    default:
      return [
        { theta: z, pass: '+' },
        { theta: x, pass: pass === '-' ? '-' : '+' },
        { theta: z, pass: 'both' },
      ];
  }
}

const seqParams: ParamSchema<P2> = {
  setup: {
    kind: 'select',
    label: 'ch40.q.p.setup',
    desc: 'ch40.q.d.setup',
    group: 'main',
    live: false,
    default: 'zxz',
    options: [
      { value: 'zz', label: 'ch40.setup.zz' },
      { value: 'zx', label: 'ch40.setup.zx' },
      { value: 'zxz', label: 'ch40.setup.zxz' },
    ],
  },
  pass: {
    kind: 'select',
    label: 'ch40.q.p.pass',
    desc: 'ch40.q.d.pass',
    group: 'main',
    live: false,
    default: '+',
    options: [
      { value: '+', label: 'ch40.pass.up' },
      { value: '-', label: 'ch40.pass.down' },
    ],
    visibleIf: (p) => p.setup === 'zxz',
  },
  N: {
    kind: 'number',
    label: 'ch40.p.N',
    desc: 'ch40.d.N',
    group: 'advanced',
    live: false,
    control: 'select',
    choices: [100, 400, 1000],
    default: 400,
  },
};

const rateOf = (N: number) => N / 10;
/** Predicted + fraction at the last device, among atoms that reach it. */
const predicted = (d: Device[]) => {
  const [a, b] = chainProbs(d);
  return a / (a + b);
};
const lastCounts = (s: ChainState) => s.counts[s.counts.length - 1];
const fracUp = (s: ChainState) => {
  const c = lastCounts(s);
  return c[0] + c[1] ? c[0] / (c[0] + c[1]) : NaN;
};

function chainScene<P extends { N: number }>(devs: (p: P) => Device[]) {
  const geoCache = new Map<string, ReturnType<typeof chainGeometry>>();
  const geo = (p: P) => {
    const d = devs(p);
    const key = d.map((x) => `${x.theta}${x.pass}`).join('|');
    let v = geoCache.get(key);
    if (!v) {
      v = chainGeometry(d);
      geoCache.set(key, v);
    }
    return v;
  };
  return {
    time: { h: H, recordEvery: 6, frameStep: 0.1, tEnd: (p: P) => chainEnd(p.N, rateOf(p.N)) },
    init: (p: P, rng: Rng) => initChain(devs(p), rng),
    step: (s: ChainState, _h: number, p: P) => {
      s.n += 1;
      stepChain(s, s.n * H, devs(p), geo(p), rateOf(p.N), p.N);
    },
    draw: (g: Draw, s: ChainState, p: P, box: { l: number; t: number; r: number; b: number }) => drawChain(g, box, devs(p), geo(p), s, chainProbs(devs(p))),
  };
}

const seq = chainScene<P2>((p) => devicesOf(p.setup, p.pass));

export const sequential: Scene<P2, ChainState> = {
  id: 'sequential',
  title: 'ch40.q.scene',
  params: seqParams,
  world: PX_WORLD,
  time: { ...seq.time, tEnd: (p) => seq.time.tEnd(p as P2) },
  init: seq.init,
  step: seq.step,
  draw: (g, s, p) => {
    const o = canvasBox(g);
    seq.draw(g, s, p, { l: o.l + 30, t: o.t + 50, r: o.r - 80, b: o.b - 30 });
  },
  readouts: [
    { label: 'N_+/(N_+ + N_-)', unit: '', value: (s) => fracUp(s), sig: 2 },
    { label: 'P_+', unit: '', value: (_s, p) => predicted(devicesOf(p.setup, p.pass)), sig: 2 },
  ],
  info: {
    goals: ['ch40.q.goal.repeat', 'ch40.q.goal.erase'],
    observe: ['ch40.q.obs.zz', 'ch40.q.obs.zx', 'ch40.q.obs.zxz', 'ch40.q.obs.pass'],
    equations: ['P(+z \\mid +z) = 1, \\quad P(\\pm x \\mid +z) = \\tfrac12', 'P(\\pm z \\mid +x) = \\tfrac12'],
    assumptions: ['ch40.q.assume.ideal', 'ch40.s.assume.view'],
  },
};

// ------------------------------------------------------------------ angle statistics

type P3 = { theta: number; N: number };

const angleParams: ParamSchema<P3> = {
  theta: {
    kind: 'number',
    label: 'ch40.a.p.theta',
    desc: 'ch40.a.d.theta',
    group: 'main',
    live: false,
    control: 'slider',
    min: 0,
    max: 180,
    step: 5,
    default: 60,
    unit: '°',
  },
  N: {
    kind: 'number',
    label: 'ch40.p.N',
    desc: 'ch40.d.N',
    group: 'main',
    live: false,
    control: 'select',
    choices: [100, 400, 1000, 4000],
    default: 400,
  },
};

export const angleDevices = (theta: number): Device[] => [
  { theta: 0, pass: '+' },
  { theta: theta * DEG, pass: 'both' },
];

const ang = chainScene<P3>((p) => angleDevices(p.theta));

export const angle: Scene<P3, ChainState> = {
  id: 'angle',
  title: 'ch40.a.scene',
  layout: 'side',
  params: angleParams,
  world: PX_WORLD,
  time: { ...ang.time, tEnd: (p) => ang.time.tEnd(p as P3) },
  init: ang.init,
  step: ang.step,
  record: (s) => ({ t: s.t, frac: fracUp(s) }),
  draw: (g, s, p) => {
    const o = canvasBox(g);
    const [bA, bB] = split({ l: o.l + 30, t: o.t + 50, r: o.r - 80, b: o.b - 40 }, false, 0.58, 50);
    ang.draw(g, s, p, bA);
    // Probability against the angle: prediction cos²(θ/2), measured fraction with its error bar.
    const f = new Frame(g, { ...bB, l: bB.l + 20, r: Math.min(bB.r, bB.l + 20 + 1.8 * (bB.b - bB.t)) }, [0, 180], [0, 1]);
    const pts: [number, number][] = [];
    for (let a = 0; a <= 180; a += 2) pts.push([a, probUp(a * DEG, 0)]);
    f.polyline(pts, { color: '#1a1a1a', width: 1.5 });
    f.axes({ xLabel: '*θ*', yLabel: '*P*_{+}', xTicks: [0, 45, 90, 135, 180], yTicks: [0, 0.5, 1], xFmt: (v) => `${v}°` });
    g.circle(f.P(p.theta, probUp(p.theta * DEG, 0)), 5, { fill: '#ffffff', color: '#1a1a1a', width: 1.5 });
    const c = lastCounts(s);
    const n = c[0] + c[1];
    if (n > 0) {
      const fr = c[0] / n;
      const err = Math.sqrt((fr * (1 - fr)) / n);
      f.line(p.theta, Math.max(0, fr - err), p.theta, Math.min(1, fr + err), { color: UP_COLOR, width: 2 });
      g.circle(f.P(p.theta, fr), 4, { fill: UP_COLOR });
    }
  },
  plots: [
    {
      id: 'frac',
      label: 'N_+/(N_+ + N_-)',
      traces: [{ channel: 'frac', role: 'position' }],
      yRange: () => [0, 1],
    },
  ],
  drawPlot: (id, pd, p) => {
    if (id !== 'frac') return;
    const P = probUp(p.theta * DEG, 0);
    pd.polyline(
      [
        [-1, P],
        [1e4, P],
      ],
      { color: '#1a1a1a', width: 1.5, dash: [6, 4] },
    );
  },
  readouts: [
    { label: 'N_+/(N_+ + N_-)', unit: '', value: (s) => fracUp(s), sig: 2 },
    { label: '\\cos^2(\\theta/2)', unit: '', value: (_s, p) => probUp(p.theta * DEG, 0), sig: 2 },
  ],
  info: {
    goals: ['ch40.a.goal.prob', 'ch40.a.goal.random'],
    observe: ['ch40.a.obs.0', 'ch40.a.obs.90', 'ch40.a.obs.180', 'ch40.a.obs.N'],
    equations: ['P(+\\theta \\mid +z) = \\cos^2\\frac{\\theta}{2}', '\\sigma_P = \\sqrt{\\frac{P(1-P)}{N}}'],
    assumptions: ['ch40.q.assume.ideal', 'ch40.a.assume.plane'],
  },
};

