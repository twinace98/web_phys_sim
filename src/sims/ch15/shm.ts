// Ch 15 scene: SHM as the projection of uniform circular motion. Reference circle (left),
// mass on a spring (middle) and phase space (right) share one horizontal projection line.
import type { ParamSchema, Scene, Vec2 } from '../../core/types';
import type { Draw } from '../../draw/draw';
import { omega0, oscAt, period, type OscState, type Oscillator } from './physics';

type P = { A: number; k: number; m: number; damp: string; vectors: boolean };
type S = { t: number } & OscState;

const A_MAX = 0.3;
const CX = -0.62; // reference circle centre
const SX = 0; // spring column
const PX = 0.62; // phase-space origin
const PW = 0.27; // phase-space half-width for v = Aω₀
const CEIL = 0.6;
const BOX = 0.11;
const GREY = '#9a9a9a';
const LABEL = '#6b6b6b';
const GUIDE = '#c8c8c8';
const ZETA: Record<string, number> = { none: 0, light: 0.05 };

const oscOf = (p: P): Oscillator => ({ A: p.A, k: p.k, m: p.m, zeta: ZETA[p.damp] ?? 0 });

const params: ParamSchema<P> = {
  A: {
    kind: 'number',
    label: 'ch15.p.A',
    desc: 'ch15.d.A',
    group: 'main',
    live: false,
    control: 'select',
    choices: [0.1, 0.2, 0.3],
    default: 0.2,
    unit: 'm',
  },
  k: {
    kind: 'number',
    label: 'ch15.p.k',
    desc: 'ch15.d.k',
    group: 'main',
    live: false,
    control: 'select',
    choices: [10, 20, 40],
    default: 20,
    unit: 'N/m',
  },
  m: {
    kind: 'number',
    label: 'ch15.p.m',
    desc: 'ch15.d.m',
    group: 'advanced',
    live: false,
    control: 'select',
    choices: [0.5, 1, 2],
    default: 1,
    unit: 'kg',
  },
  damp: {
    kind: 'select',
    label: 'ch15.p.damp',
    desc: 'ch15.d.damp',
    group: 'advanced',
    live: false,
    default: 'none',
    options: [
      { value: 'none', label: 'ch15.damp.none' },
      { value: 'light', label: 'ch15.damp.light' },
    ],
  },
  vectors: { kind: 'toggle', label: 'ch15.p.vectors', desc: 'ch15.d.vectors', group: 'advanced', live: true, default: true },
};

function spring(g: Draw, x: number, y0: number, y1: number): void {
  const n = 12;
  const w = 0.045;
  const lead = 0.04;
  const pts: Vec2[] = [{ x, y: y0 }, { x, y: y0 - lead }];
  const span = y0 - y1 - 2 * lead;
  for (let i = 0; i < n; i++) pts.push({ x: x + (i % 2 ? -w : w), y: y0 - lead - (span * (i + 0.5)) / n });
  pts.push({ x, y: y1 + lead }, { x, y: y1 });
  g.polyline(pts, { color: '#5c5c5c', width: 1.5 });
}

export const shm: Scene<P, S> = {
  id: 'shm',
  title: 'ch15.scene',
  layout: 'side',
  params,
  time: { h: 1 / 480, recordEvery: 4, frameStep: 0.05, window: 6 },
  world: () => ({ x: [CX - A_MAX - 0.08, PX + PW + 0.14], y: [-A_MAX - 0.16, CEIL + 0.04], aspect: 'contain', padPx: 18 }),

  init: (p) => ({ t: 0, ...oscAt(oscOf(p), 0) }),
  step: (s, h, p) => {
    s.t += h;
    Object.assign(s, oscAt(oscOf(p), s.t));
  },
  record: (s) => ({ t: s.t, x: s.x, v: s.v, a: s.a, K: s.K, U: s.U, E: s.E }),
  snapshot: (s) => ({ ...s }),

  draw: (g, s, p) => {
    const o = oscOf(p);
    const w0 = omega0(o);
    const kv = 0.6 / w0; // world m per (m/s): v arrow on the circle has length 0.6 R, a arrow 0.5 R
    const ka = 0.5 / (w0 * w0);
    const kp = PW / (p.A * w0); // phase space: v = Aω₀ maps to PW

    // Equilibrium line through all three panels.
    g.line({ x: CX - A_MAX - 0.05, y: 0 }, { x: PX + PW + 0.06, y: 0 }, { color: GUIDE, width: 1, dash: [4, 4] });

    // Reference circle (spiral when damped: the circle of the current radius is drawn).
    const R = Math.hypot(s.px, s.py);
    const ring: Vec2[] = [];
    for (let i = 0; i <= 96; i++) ring.push({ x: CX + R * Math.cos((i / 96) * 2 * Math.PI), y: R * Math.sin((i / 96) * 2 * Math.PI) });
    g.polyline(ring, { color: GREY, width: 1.25 });
    g.circle({ x: CX, y: 0 }, 3, { fill: GREY });
    const P0: Vec2 = { x: CX + s.px, y: s.py };
    if (!p.vectors) g.line({ x: CX, y: 0 }, P0, { color: GUIDE, width: 1 });

    // Projection line: circle point → mass → phase point, all at height x.
    const ph: Vec2 = { x: PX + s.v * kp, y: s.x };
    g.line(P0, { x: Math.max(P0.x, ph.x), y: s.x }, { color: GUIDE, width: 1, dash: [3, 4] });

    // Ceiling, spring, mass.
    g.line({ x: SX - 0.12, y: CEIL }, { x: SX + 0.12, y: CEIL }, { color: '#5c5c5c', width: 2 });
    for (let i = 0; i < 6; i++) {
      const x = SX - 0.11 + i * 0.045;
      g.line({ x, y: CEIL }, { x: x + 0.03, y: CEIL + 0.03 }, { color: GREY, width: 1 });
    }
    spring(g, SX, CEIL, s.x + BOX / 2);
    g.polygon(
      [
        { x: SX - BOX / 2, y: s.x - BOX / 2 },
        { x: SX + BOX / 2, y: s.x - BOX / 2 },
        { x: SX + BOX / 2, y: s.x + BOX / 2 },
        { x: SX - BOX / 2, y: s.x + BOX / 2 },
      ],
      { fill: 'position', fillAlpha: 0.9 },
    );
    // Phase space: x up, v to the right; the path so far.
    g.line({ x: PX - PW - 0.04, y: 0 }, { x: PX + PW + 0.06, y: 0 }, { role: 'axis', width: 1 });
    g.line({ x: PX, y: -A_MAX - 0.06 }, { x: PX, y: A_MAX + 0.06 }, { role: 'axis', width: 1 });
    g.text({ x: PX + PW + 0.06, y: 0 }, '*v*', { size: 13, color: LABEL, align: 'left', baseline: 'middle', dx: 6 });
    g.text({ x: PX, y: A_MAX + 0.06 }, '*x*', { size: 13, color: LABEL, align: 'left', baseline: 'middle', dx: 7 });
    const path: Vec2[] = [];
    const T = period(o);
    const t0 = o.zeta > 0 ? 0 : Math.max(0, s.t - T);
    const N = 160;
    for (let i = 0; i <= N; i++) {
      const q = oscAt(o, t0 + ((s.t - t0) * i) / N);
      path.push({ x: PX + q.v * kp, y: q.x });
    }
    g.polyline(path, { role: 'position', width: 1.5, alpha: 0.6 });
    g.circle(ph, 5, { fill: 'position' });

    if (p.vectors) {
      // On the circle: full v (tangent) and a (towards the centre). On the mass: their vertical parts.
      g.arrow(P0, { x: s.pvx * kv, y: s.pvy * kv }, { role: 'velocity', width: 2.25, label: '*v*' });
      g.arrow(P0, { x: s.pax * ka, y: s.pay * ka }, { role: 'acceleration', width: 2.25, label: '*a*' });
      const side = SX + BOX / 2 + 0.05;
      if (Math.abs(s.v * kv) > g.px(3)) g.arrow({ x: side, y: s.x }, { x: 0, y: s.v * kv }, { role: 'velocity', width: 2.25, label: '*v*' });
      if (Math.abs(s.a * ka) > g.px(3)) g.arrow({ x: side + 0.07, y: s.x }, { x: 0, y: s.a * ka }, { role: 'acceleration', width: 2.25, label: '*a*' });
    }
    g.circle(P0, 7, { fill: 'position' });
  },

  plots: [
    { id: 'x', label: 'x\\,(\\mathrm{m})', traces: [{ channel: 'x', role: 'position' }], yRange: (p) => [-p.A * 1.2, p.A * 1.2] },
    {
      id: 'v',
      label: 'v\\,(\\mathrm{m/s})',
      traces: [{ channel: 'v', role: 'velocity' }],
      yRange: (p) => {
        const m = p.A * omega0(oscOf(p)) * 1.2;
        return [-m, m];
      },
    },
    {
      id: 'a',
      label: 'a\\,(\\mathrm{m/s^2})',
      traces: [{ channel: 'a', role: 'acceleration' }],
      yRange: (p) => {
        const m = p.A * omega0(oscOf(p)) ** 2 * 1.2;
        return [-m, m];
      },
    },
    {
      id: 'E',
      label: '\\textcolor{#56B4E9}{K},\\ \\textcolor{#E69F00}{U},\\ E\\,(\\mathrm{J})',
      traces: [
        { channel: 'K', role: 'energyK' },
        { channel: 'U', role: 'energyU' },
        { channel: 'E', role: 'energyE' },
      ],
      yRange: (p) => [0, 0.5 * p.k * p.A * p.A * 1.2],
    },
  ],

  readouts: [
    { label: '\\omega', unit: 'rad/s', value: (_s, p) => omega0(oscOf(p)) },
    { label: 'T', unit: 's', value: (_s, p) => period(oscOf(p)) },
    { label: 'E', unit: 'J', value: (s) => s.E },
  ],

  info: {
    goals: ['ch15.goal.proj', 'ch15.goal.props'],
    observe: ['ch15.obs.phase', 'ch15.obs.a', 'ch15.obs.iso', 'ch15.obs.km', 'ch15.obs.energy', 'ch15.obs.space', 'ch15.obs.damp'],
    equations: [
      'x = A\\cos\\omega t, \\quad v = -\\omega A \\sin\\omega t, \\quad a = -\\omega^2 x',
      '\\omega = \\sqrt{k/m}, \\quad T = 2\\pi\\sqrt{m/k}',
      'E = \\tfrac{1}{2}mv^2 + \\tfrac{1}{2}kx^2 = \\tfrac{1}{2}kA^2',
    ],
    assumptions: ['ch15.assume.spring', 'ch15.assume.scale'],
  },
};
