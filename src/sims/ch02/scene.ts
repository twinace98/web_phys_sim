// Ch 2 scene: x(t), v(t), a(t) linked by slope (derivative) and area (integral).
import { fmtTick, niceTicks } from '../../core/format';
import type { ParamSchema, Scene } from '../../core/types';
import { CUSTOM_A_MAX, CUSTOM_SEGS, T_END, areaUnderA, areaUnderV, makeProfile, ranges, stateAt, type Motion, type Profile, type Ranges } from './physics';

type P = {
  motion: string;
  mode: string;
  v0: number;
  custom: number[];
  vectors: boolean;
};

interface S {
  t: number;
  n: number;
  x: number;
  v: number;
  a: number;
}

const RATE = 240;

// Profile and ranges depend only on parameters; cache the last one.
let memoKey = '';
let memo: { pr: Profile; rg: Ranges } | null = null;
function model(p: P): { pr: Profile; rg: Ranges } {
  const key = `${p.motion}|${p.v0}|${p.custom.join(',')}`;
  if (key !== memoKey || !memo) {
    const pr = makeProfile(p.motion as Motion, p.custom, p.v0);
    memo = { pr, rg: ranges(pr) };
    memoKey = key;
  }
  return memo;
}

/** Range including zero, at least minSpan wide, with a margin. */
function padded([lo0, hi0]: [number, number], minSpan: number): [number, number] {
  let lo = Math.min(lo0, 0);
  let hi = Math.max(hi0, 0);
  if (hi - lo < minSpan) {
    const mid = (hi + lo) / 2;
    lo = Math.min(lo, mid - minSpan / 2);
    hi = Math.max(hi, mid + minSpan / 2);
  }
  const m = 0.12 * (hi - lo);
  return [lo - m, hi + m];
}

function track(p: P): [number, number] {
  const [lo, hi] = model(p).rg.x;
  const span = Math.max(hi - lo, 4);
  const mid = (lo + hi) / 2;
  return [Math.min(lo, mid - span / 2), Math.max(hi, mid + span / 2)];
}

const params: ParamSchema<P> = {
  motion: {
    kind: 'select',
    label: 'ch02.p.motion',
    desc: 'ch02.d.motion',
    group: 'main',
    live: false,
    default: 'startStop',
    options: [
      { value: 'uniform', label: 'ch02.m.uniform' },
      { value: 'accel', label: 'ch02.m.accel' },
      { value: 'startStop', label: 'ch02.m.startStop' },
      { value: 'reverse', label: 'ch02.m.reverse' },
      { value: 'custom', label: 'ch02.m.custom' },
    ],
  },
  mode: {
    kind: 'select',
    label: 'ch02.p.mode',
    desc: 'ch02.d.mode',
    group: 'main',
    live: true,
    default: 'slope',
    options: [
      { value: 'slope', label: 'ch02.mode.slope' },
      { value: 'area', label: 'ch02.mode.area' },
    ],
  },
  v0: {
    kind: 'number',
    label: 'ch02.p.v0',
    desc: 'ch02.d.v0',
    group: 'advanced',
    live: false,
    control: 'select',
    choices: [-2, -1, 0, 1, 2],
    default: 0,
    unit: 'm/s',
    visibleIf: (p) => p.motion === 'custom',
  },
  custom: {
    kind: 'array',
    label: 'ch02.p.custom',
    group: 'hidden',
    live: false,
    default: [1, 0, -1, -1, 0.5],
    min: -CUSTOM_A_MAX,
    max: CUSTOM_A_MAX,
  },
  vectors: { kind: 'toggle', label: 'ch02.p.vectors', desc: 'ch02.d.vectors', group: 'advanced', live: true, default: true },
};

export const kinematics: Scene<P, S> = {
  id: 'graphs',
  title: 'ch02.scene',
  layout: 'stack',
  params,
  time: { h: 1 / RATE, recordEvery: 1, frameStep: 0.1, tEnd: T_END },

  world: (p) => {
    const [lo, hi] = track(p);
    // Room for the longest arrow (0.13 of the track) when the object sits at either end.
    const pad = (p.vectors ? 0.16 : 0.06) * (hi - lo);
    return { x: [lo - pad, hi + pad], y: [-1, 1], aspect: 'fit-x', padPx: 28 };
  },

  init: (p) => ({ t: 0, n: 0, ...stateAt(model(p).pr, 0) }),

  step: (s, _h, p) => {
    s.n += 1;
    s.t = Math.min(s.n / RATE, T_END);
    Object.assign(s, stateAt(model(p).pr, s.t));
  },

  record: (s) => ({ t: s.t, x: s.x, v: s.v, a: s.a }),
  snapshot: (s) => ({ ...s }),

  draw: (g, s, p) => {
    const { rg } = model(p);
    const [lo, hi] = track(p);
    const tick = '#6b6b6b';
    g.line({ x: lo, y: 0 }, { x: hi, y: 0 }, { role: 'axis', width: 1.25 });
    for (const x of niceTicks(lo, hi, 8)) {
      g.line({ x, y: 0 }, { x, y: -g.px(5) }, { role: 'axis', width: 1 });
      g.text({ x, y: 0 }, fmtTick(x), { size: 11, color: tick, align: 'center', dy: 18 });
    }
    g.text({ x: hi, y: 0 }, '*x* (m)', { size: 12, color: tick, align: 'right', dy: 36 });

    if (p.vectors) {
      const span = hi - lo;
      const vMax = Math.max(Math.abs(rg.v[0]), Math.abs(rg.v[1]), 0.5);
      const aMax = Math.max(Math.abs(rg.a[0]), Math.abs(rg.a[1]), 0.25);
      g.arrow({ x: s.x, y: g.px(24) }, { x: (s.v / vMax) * 0.13 * span, y: 0 }, { role: 'velocity', label: '*v*' });
      g.arrow({ x: s.x, y: g.px(46) }, { x: (s.a / aMax) * 0.1 * span, y: 0 }, { role: 'acceleration', label: '*a*' });
    }
    g.circle({ x: s.x, y: 0 }, 9, { fill: 'position' });
  },

  plots: [
    {
      id: 'x',
      label: 'x\\,(\\mathrm{m})',
      traces: [{ channel: 'x', role: 'position' }],
      yRange: (p) => padded(model(p).rg.x, 2),
      overlays: (p) =>
        p.mode === 'slope' ? [{ kind: 'tangent', channel: 'x', slopeChannel: 'v', role: 'velocity', unit: 'm/s', target: { plot: 'v', channel: 'v' } }] : [],
    },
    {
      id: 'v',
      label: 'v\\,(\\mathrm{m/s})',
      traces: [{ channel: 'v', role: 'velocity' }],
      yRange: (p) => padded(model(p).rg.v, 1),
      overlays: (p) =>
        p.mode === 'slope'
          ? [{ kind: 'tangent', channel: 'v', slopeChannel: 'a', role: 'acceleration', unit: 'm/s²', target: { plot: 'a', channel: 'a' } }]
          : [
              {
                kind: 'area',
                channel: 'v',
                role: 'velocity',
                unit: 'm',
                symbol: 'Δ*x*',
                area: (pp, t0, t1) => areaUnderV(model(pp as P).pr, t0, t1),
                target: { plot: 'x', channel: 'x' },
              },
            ],
    },
    {
      id: 'a',
      label: 'a\\,(\\mathrm{m/s^2})',
      traces: [{ channel: 'a', role: 'acceleration' }],
      yRange: (p) => (p.motion === 'custom' ? [-CUSTOM_A_MAX - 0.5, CUSTOM_A_MAX + 0.5] : padded(model(p).rg.a, 1)),
      overlays: (p) =>
        p.mode === 'area'
          ? [
              {
                kind: 'area',
                channel: 'a',
                role: 'acceleration',
                unit: 'm/s',
                symbol: 'Δ*v*',
                area: (pp, t0, t1) => areaUnderA(model(pp as P).pr, t0, t1),
                target: { plot: 'v', channel: 'v' },
              },
            ]
          : [],
    },
  ],

  drawPlot: (id, pd, p) => {
    if (id !== 'a' || p.motion !== 'custom') return;
    const pts: [number, number][] = [];
    for (const s of model(p).pr.segs) pts.push([s.t0, s.a], [s.t1, s.a]);
    pd.polyline(pts, { role: 'acceleration', width: 1.5, dash: [4, 4], alpha: 0.5 });
  },

  plotHandles: [
    {
      plot: 'a',
      when: (p) => p.motion === 'custom',
      count: () => CUSTOM_SEGS,
      pos: (p, i) => [((i + 0.5) * T_END) / CUSTOM_SEGS, p.custom[i]],
      onDrag: (ctx, i, _t, y) => {
        const a = Math.min(CUSTOM_A_MAX, Math.max(-CUSTOM_A_MAX, Math.round(y * 2) / 2));
        if (a === ctx.params.custom[i]) return;
        const next = [...ctx.params.custom];
        next[i] = a;
        ctx.set('custom', next);
      },
    },
  ],

  readouts: [
    { label: 'x', unit: 'm', value: (s) => s.x },
    { label: 'v', unit: 'm/s', value: (s) => s.v },
    { label: 'a', unit: 'm/s²', value: (s) => s.a },
  ],

  info: {
    goals: ['ch02.goal.slope', 'ch02.goal.area'],
    observe: ['ch02.obs.slope', 'ch02.obs.area', 'ch02.obs.turn', 'ch02.obs.custom'],
    equations: ['v = \\frac{dx}{dt}, \\quad a = \\frac{dv}{dt}', '\\Delta v = \\int_0^t a\\,dt, \\quad \\Delta x = \\int_0^t v\\,dt'],
    assumptions: ['ch02.assume'],
  },
};
