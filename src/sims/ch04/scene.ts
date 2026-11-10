// Ch 4 scene: projectile = uniform motion in x + uniformly accelerated motion in y.
import { fmtTick, niceTicks } from '../../core/format';
import type { ParamSchema, Scene, Vec2 } from '../../core/types';
import type { Draw } from '../../draw/draw';
import { G, flightTime, maxHeight, range, stateAt, v0x, v0y, type Launch } from './physics';

type P = {
  theta: number;
  h: number;
  v0: number;
  g: string;
  strobe: string;
  vectors: boolean;
};

interface S {
  t: number;
  n: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
}

const RATE = 240;
const DEG = Math.PI / 180;
const TICK = '#6b6b6b';
const GUIDE = '#b5b5b5';

const launchOf = (p: P): Launch => ({ h: p.h, v0: p.v0, theta: p.theta * DEG, g: G[p.g] ?? G.earth });

// Everything below depends only on parameters; cache the last one.
let memoKey = '';
let memo: { l: Launch; T: number; R: number; H: number; vyEnd: number } | null = null;
function model(p: P) {
  const key = `${p.theta}|${p.h}|${p.v0}|${p.g}`;
  if (key !== memoKey || !memo) {
    const l = launchOf(p);
    const T = flightTime(l);
    memo = { l, T, R: range(l), H: maxHeight(l), vyEnd: v0y(l) - l.g * T };
    memoKey = key;
  }
  return memo;
}

/** Range including zero with an 8 % margin and a minimum span. */
function padded(lo0: number, hi0: number, minSpan: number): [number, number] {
  let lo = Math.min(lo0, 0);
  let hi = Math.max(hi0, 0);
  if (hi - lo < minSpan) hi = lo + minSpan;
  const m = 0.08 * (hi - lo);
  return [lo - m, hi + m];
}

const params: ParamSchema<P> = {
  theta: {
    kind: 'number',
    label: 'ch04.p.theta',
    desc: 'ch04.d.theta',
    group: 'main',
    live: false,
    control: 'select',
    choices: [0, 15, 30, 45, 60, 75],
    default: 45,
    unit: '°',
  },
  h: {
    kind: 'number',
    label: 'ch04.p.h',
    desc: 'ch04.d.h',
    group: 'main',
    live: false,
    control: 'select',
    choices: [0, 5, 10, 20, 40],
    default: 0,
    unit: 'm',
  },
  v0: {
    kind: 'number',
    label: 'ch04.p.v0',
    desc: 'ch04.d.v0',
    group: 'advanced',
    live: false,
    control: 'select',
    choices: [10, 15, 20, 25],
    default: 20,
    unit: 'm/s',
  },
  g: {
    kind: 'select',
    label: 'ch04.p.g',
    desc: 'ch04.d.g',
    group: 'advanced',
    live: false,
    default: 'earth',
    options: [
      { value: 'earth', label: 'ch04.g.earth' },
      { value: 'mars', label: 'ch04.g.mars' },
      { value: 'moon', label: 'ch04.g.moon' },
    ],
  },
  strobe: {
    kind: 'select',
    label: 'ch04.p.strobe',
    desc: 'ch04.d.strobe',
    group: 'advanced',
    live: true,
    default: '0.5',
    options: [
      { value: 'off', label: 'ch04.strobe.off' },
      { value: '0.25', label: 'ch04.strobe.025' },
      { value: '0.5', label: 'ch04.strobe.05' },
      { value: '1', label: 'ch04.strobe.1' },
    ],
  },
  vectors: { kind: 'toggle', label: 'ch04.p.vectors', desc: 'ch04.d.vectors', group: 'advanced', live: true, default: true },
};

function drawAxes(g: Draw, R: number, H: number, x0: number): void {
  g.line({ x: x0, y: 0 }, { x: R * 1.04, y: 0 }, { role: 'axis', width: 1.25 });
  g.line({ x: 0, y: 0 }, { x: 0, y: H * 1.06 }, { role: 'axis', width: 1.25 });
  for (const x of niceTicks(0, R, 6)) {
    if (x === 0) continue;
    g.line({ x, y: 0 }, { x, y: -g.px(5) }, { role: 'axis', width: 1 });
    g.text({ x, y: 0 }, fmtTick(x), { size: 11, color: TICK, align: 'center', dy: 17 });
  }
  for (const y of niceTicks(0, H, 5)) {
    if (y === 0) continue;
    g.line({ x: 0, y }, { x: -g.px(5), y }, { role: 'axis', width: 1 });
    g.text({ x: 0, y }, fmtTick(y), { size: 11, color: TICK, align: 'right', baseline: 'middle', dx: -8 });
  }
  g.text({ x: 0, y: 0 }, '0', { size: 11, color: TICK, align: 'right', dx: -6, dy: 15 });
  g.text({ x: R * 1.04, y: 0 }, '*x* (m)', { size: 12, color: TICK, align: 'right', dy: 34 });
  g.text({ x: 0, y: H * 1.06 }, '*y* (m)', { size: 12, color: TICK, align: 'center', dy: -10 });
}

export const projectile: Scene<P, S> = {
  id: 'projectile',
  title: 'ch04.scene',
  layout: 'side',
  params,
  time: { h: 1 / RATE, recordEvery: 2, frameStep: 0.1, tEnd: (p) => model(p as P).T },

  world: (p) => {
    const { R, H } = model(p);
    // θ = 0 at h = 0 lands at once (R = H = 0): keep a sensible, non-empty view.
    const span = Math.max(R, H, 5);
    const xMax = Math.max(R, 0.5 * span);
    const yMax = Math.max(H, 0.3 * span);
    return { x: [-0.14 * span, xMax + 0.08 * span], y: [-0.13 * span, yMax + 0.1 * span], aspect: 'contain', padPx: 20 };
  },

  init: (p) => ({ t: 0, n: 0, ...stateAt(model(p).l, 0) }),

  step: (s, _h, p) => {
    const { l, T } = model(p);
    s.n += 1;
    s.t = Math.min(s.n / RATE, T);
    Object.assign(s, stateAt(l, s.t));
  },

  record: (s) => ({ t: s.t, x: s.x, y: s.y, vx: s.vx, vy: s.vy }),
  snapshot: (s) => ({ ...s }),

  draw: (g, s, p) => {
    const { l, R, H } = model(p);
    const span = Math.max(R, H, 5);
    const x0 = -0.12 * span;
    if (l.h > 0) {
      g.polygon(
        [
          { x: x0, y: 0 },
          { x: 0, y: 0 },
          { x: 0, y: l.h },
          { x: x0, y: l.h },
        ],
        { fill: '#efefef' },
      );
    }
    drawAxes(g, Math.max(R, 0.5 * span), Math.max(H, 0.3 * span), x0);

    // Path travelled so far (exact curve).
    const path: Vec2[] = [];
    const N = 120;
    for (let i = 0; i <= N; i++) {
      const k = stateAt(l, (s.t * i) / N);
      path.push({ x: k.x, y: k.y });
    }
    g.polyline(path, { role: 'position', width: 1.5, alpha: 0.55 });

    // Strobe: equal time steps. Marks on the axes show equal x spacing and changing y spacing.
    if (p.strobe !== 'off') {
      const dt = Number(p.strobe);
      for (let k = 0; k * dt <= s.t + 1e-9; k++) {
        const q = stateAt(l, k * dt);
        g.circle({ x: q.x, y: q.y }, 3.5, { fill: '#ffffff', role: 'position', width: 1.25 });
        g.circle({ x: q.x, y: 0 }, 2.5, { fill: 'position', alpha: 0.6 });
        g.circle({ x: 0, y: q.y }, 2.5, { fill: 'position', alpha: 0.6 });
      }
    }

    const ball = { x: s.x, y: s.y };
    const sx = { x: s.x, y: 0 };
    const sy = { x: 0, y: s.y };
    g.line(ball, sx, { color: GUIDE, width: 1, dash: [3, 4] });
    g.line(ball, sy, { color: GUIDE, width: 1, dash: [3, 4] });
    g.circle(sx, 6.5, { fill: 'position', alpha: 0.4 });
    g.circle(sy, 6.5, { fill: 'position', alpha: 0.4 });

    if (p.vectors) {
      const k = (0.2 * span) / l.v0;
      // Component labels sit beside the arrow tips, clear of the axis tick labels.
      const lbl = { size: 13, role: 'velocity' as const };
      g.arrow(sx, { x: s.vx * k, y: 0 }, { role: 'velocity', width: 2 });
      g.text({ x: s.x + s.vx * k, y: 0 }, '*v*_{*x*}', { ...lbl, align: 'center', dy: -10 });
      g.arrow(sy, { x: 0, y: s.vy * k }, { role: 'velocity', width: 2 });
      if (Math.abs(s.vy * k) > g.px(4)) g.text({ x: 0, y: s.y + s.vy * k }, '*v*_{*y*}', { ...lbl, align: 'left', baseline: 'middle', dx: 9 });
      g.arrow(ball, { x: s.vx * k, y: s.vy * k }, { role: 'velocity', width: 2.5, label: '*v*' });
    }
    g.circle(ball, 8, { fill: 'position' });
  },

  plots: [
    { id: 'x', label: 'x\\,(\\mathrm{m})', traces: [{ channel: 'x', role: 'position' }], yRange: (p) => padded(0, model(p).R, 1) },
    {
      id: 'vx',
      label: 'v_x\\,(\\mathrm{m/s})',
      traces: [{ channel: 'vx', role: 'velocity' }],
      yRange: (p) => padded(0, v0x(model(p).l) * 1.2, 1),
    },
    { id: 'y', label: 'y\\,(\\mathrm{m})', traces: [{ channel: 'y', role: 'position' }], yRange: (p) => padded(0, model(p).H, 1) },
    {
      id: 'vy',
      label: 'v_y\\,(\\mathrm{m/s})',
      traces: [{ channel: 'vy', role: 'velocity' }],
      yRange: (p) => {
        const m = model(p);
        return padded(Math.min(m.vyEnd, v0y(m.l)), Math.max(m.vyEnd, v0y(m.l)), 1);
      },
    },
  ],

  readouts: [
    { label: 'v_x', unit: 'm/s', value: (s) => s.vx },
    { label: 'v_y', unit: 'm/s', value: (s) => s.vy },
    { label: 'v', unit: 'm/s', value: (s) => Math.hypot(s.vx, s.vy) },
  ],

  info: {
    goals: ['ch04.goal.split', 'ch04.goal.indep'],
    observe: ['ch04.obs.x', 'ch04.obs.y', 'ch04.obs.cliff', 'ch04.obs.range', 'ch04.obs.g'],
    equations: [
      'x = v_0\\cos\\theta\\,t, \\quad v_x = v_0\\cos\\theta',
      'y = h + v_0\\sin\\theta\\,t - \\tfrac{1}{2}g t^2, \\quad v_y = v_0\\sin\\theta - g t',
      'R = \\frac{v_0^2 \\sin 2\\theta}{g} \\quad (h = 0)',
    ],
    assumptions: ['ch04.assume'],
  },
};
