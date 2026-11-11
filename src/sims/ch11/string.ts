// Ch 11 scene: a puck on a string through a hole in a frictionless table. Pulling the string in
// raises ω so that L = m r² ω stays fixed; the string sweeps equal areas in equal times.
import type { ParamSchema, Scene, Vec2 } from '../../core/types';
import type { Draw } from '../../draw/draw';
import { angMom, endTime, kinetic, omega, radius, stepAngle, tension, type Mode, type Pull } from './physics';

type P = { mode: string; rIn: number; wOut: number; m: number; areas: boolean };

interface S {
  t: number;
  n: number;
  phi: number;
}

const RATE = 240;
const H = 1 / RATE;
const R_OUT = 1;
const SECTORS = 6;
const T_MIN_PX = 30; // shortest tension arrow [px]; the puck (9 px radius) covers its base
const SECTOR_FILL = ['#E69F00', '#56B4E9'];

const pullOf = (p: P): Pull => ({ mode: p.mode as Mode, m: p.m, rOut: R_OUT, rIn: p.rIn, wOut: p.wOut, tRamp: 3, tHold: 2 });

let memoKey = '';
let memo: { c: Pull; T: number; phis: Float64Array; dt: number; vMax: number; tMax: number } | null = null;
/** Whole run integrated once per parameter set: φ at every physics step. */
function model(p: P) {
  const key = `${p.mode}|${p.rIn}|${p.wOut}|${p.m}`;
  if (key !== memoKey || !memo) {
    const c = pullOf(p);
    const T = endTime(c);
    const N = Math.round(T * RATE);
    const phis = new Float64Array(N + 1);
    let vMax = 0;
    let tMax = 0;
    for (let n = 0; n < N; n++) {
      phis[n + 1] = stepAngle(c, phis[n], n * H, H);
      const k = radius(c, n * H);
      vMax = Math.max(vMax, Math.hypot(k.v, k.r * omega(c, n * H)));
      tMax = Math.max(tMax, tension(c, n * H));
    }
    // Sector interval: the fastest sweep covers 1 rad, so SECTORS of them never overlap.
    const dt = Math.min(0.5, 1 / (c.wOut * (c.rOut / c.rIn) ** 2));
    memo = { c, T, phis, dt, vMax, tMax };
    memoKey = key;
  }
  return memo;
}

const phiAt = (p: P, n: number) => model(p).phis[Math.min(n, model(p).phis.length - 1)];
const posAt = (p: P, n: number): Vec2 => {
  const r = radius(model(p).c, n * H).r;
  const f = phiAt(p, n);
  return { x: r * Math.cos(f), y: r * Math.sin(f) };
};

const params: ParamSchema<P> = {
  mode: {
    kind: 'select',
    label: 'ch11.p.mode',
    desc: 'ch11.d.mode',
    group: 'main',
    live: false,
    default: 'pull',
    options: [
      { value: 'pull', label: 'ch11.mode.pull' },
      { value: 'release', label: 'ch11.mode.release' },
      { value: 'both', label: 'ch11.mode.both' },
    ],
  },
  rIn: { kind: 'number', label: 'ch11.p.rIn', desc: 'ch11.d.rIn', group: 'main', live: false, control: 'slider', min: 0.3, max: 0.8, step: 0.05, default: 0.5, unit: 'm' },
  wOut: { kind: 'number', label: 'ch11.p.wOut', desc: 'ch11.d.wOut', group: 'advanced', live: false, control: 'slider', min: 1, max: 3, step: 0.1, default: 2, unit: 'rad/s' },
  m: { kind: 'number', label: 'ch11.p.m', desc: 'ch11.d.m', group: 'advanced', live: false, control: 'slider', min: 0.1, max: 0.5, step: 0.05, default: 0.2, unit: 'kg' },
  areas: { kind: 'toggle', label: 'ch11.p.areas', desc: 'ch11.d.areas', group: 'advanced', live: true, default: true },
};

/** Sectors swept in the last few equal time intervals, alternately tinted. */
function sectors(g: Draw, p: P, n: number): void {
  const { dt } = model(p);
  const per = Math.max(1, Math.round(dt * RATE));
  const kNow = Math.floor(n / per);
  for (let k = Math.max(0, kNow - SECTORS); k < kNow; k++) {
    const pts: Vec2[] = [{ x: 0, y: 0 }];
    const step = Math.max(1, Math.round(per / 24));
    for (let i = k * per; i <= (k + 1) * per; i += step) pts.push(posAt(p, i));
    pts.push(posAt(p, (k + 1) * per));
    g.polygon(pts, { fill: SECTOR_FILL[k % 2], fillAlpha: 0.28 });
  }
}

export const stringScene: Scene<P, S> = {
  id: 'string',
  title: 'ch11.s.scene',
  params,
  time: { h: H, recordEvery: 2, frameStep: 0.05, tEnd: (p) => endTime(pullOf(p as P)) },
  world: () => ({ x: [-R_OUT - 0.3, R_OUT + 0.3], y: [-R_OUT - 0.3, R_OUT + 0.3], aspect: 'contain', padPx: 16 }),

  init: (p) => ({ t: 0, n: 0, phi: phiAt(p, 0) }),
  step: (s, _h, p) => {
    s.n += 1;
    s.t = s.n * H;
    s.phi = phiAt(p, s.n);
  },

  record: (s, p) => {
    const c = model(p).c;
    const w = omega(c, s.t);
    const r = radius(c, s.t).r;
    return { t: s.t, r, w, L: c.m * r * r * w, K: kinetic(c, s.t) };
  },
  snapshot: (s) => ({ ...s }),

  draw: (g, s, p) => {
    const { c, vMax, tMax } = model(p);
    const O: Vec2 = { x: 0, y: 0 };
    // Outer and inner radii as faint guides.
    for (const rr of [c.rOut, c.rIn]) {
      const ring: Vec2[] = [];
      for (let i = 0; i <= 96; i++) ring.push({ x: rr * Math.cos((i / 96) * 2 * Math.PI), y: rr * Math.sin((i / 96) * 2 * Math.PI) });
      g.polyline(ring, { color: '#e2e2e2', width: 1 });
    }
    if (p.areas) sectors(g, p, s.n);

    // Path so far.
    const path: Vec2[] = [];
    const step = Math.max(1, Math.floor(s.n / 1200));
    for (let i = 0; i < s.n; i += step) path.push(posAt(p, i));
    path.push(posAt(p, s.n));
    g.polyline(path, { role: 'position', width: 1.25, alpha: 0.35 });

    const k = radius(c, s.t);
    const w = omega(c, s.t);
    const u = { x: Math.cos(s.phi), y: Math.sin(s.phi) };
    const P0: Vec2 = { x: k.r * u.x, y: k.r * u.y };
    g.line(O, P0, { color: '#5c5c5c', width: 1.5 });
    // String goes down through the hole.
    g.circle(O, 6, { fill: '#1a1a1a' });

    const vx = k.v * u.x - k.r * w * u.y;
    const vy = k.v * u.y + k.r * w * u.x;
    const kv = 0.45 / vMax;
    g.arrow(P0, { x: vx * kv, y: vy * kv }, { role: 'velocity', width: 2.5, label: '*v*' });
    // T ∝ 1/r³ changes up to 37-fold, so a proportional arrow would vanish at the outer radius:
    // proportional above a minimum length that stays visible beyond the puck.
    const T = tension(c, s.t);
    const kt = (0.6 * c.rIn) / tMax;
    const lenT = Math.max(T * kt, g.px(T_MIN_PX));
    g.arrow(P0, { x: -u.x * lenT, y: -u.y * lenT }, { role: 'force', width: 2.5 });
    // T label beside the middle of the visible part (outside the puck), on the side away from v.
    const vis = (lenT + g.px(9)) / 2;
    const mid = { x: P0.x - u.x * vis, y: P0.y - u.y * vis };
    const off = { x: u.y, y: -u.x };
    g.text({ x: mid.x + off.x * g.px(13), y: mid.y + off.y * g.px(13) }, '*T*', { size: 13, role: 'force', align: 'center', baseline: 'middle' });
    g.circle(P0, 9, { fill: 'position' });
  },

  plots: [
    { id: 'r', label: 'r\\,(\\mathrm{m})', traces: [{ channel: 'r', role: 'position' }], yRange: () => [0, R_OUT * 1.15] },
    {
      id: 'w',
      label: '\\omega\\,(\\mathrm{rad/s})',
      traces: [{ channel: 'w', role: 'velocity' }],
      yRange: (p) => [0, (p.wOut / (p.rIn * p.rIn)) * 1.12],
    },
    {
      id: 'L',
      label: 'L\\,(\\mathrm{kg\\,m^2/s})',
      traces: [{ channel: 'L', role: 'fg' }],
      yRange: (p) => [0, angMom(pullOf(p)) * 1.5],
    },
    {
      id: 'K',
      label: 'K\\,(\\mathrm{J})',
      traces: [{ channel: 'K', role: 'energyK' }],
      yRange: (p) => {
        const c = pullOf(p);
        return [0, 0.5 * c.m * (angMom(c) / (c.m * c.rIn)) ** 2 * 1.15];
      },
    },
  ],

  readouts: [
    { label: 'r', unit: 'm', value: (s, p) => radius(pullOf(p), s.t).r },
    { label: '\\omega', unit: 'rad/s', value: (s, p) => omega(pullOf(p), s.t) },
    { label: 'L', unit: 'kg·m²/s', value: (_s, p) => angMom(pullOf(p)) },
  ],

  info: {
    goals: ['ch11.s.goal.L', 'ch11.s.goal.K'],
    observe: ['ch11.s.obs.flat', 'ch11.s.obs.square', 'ch11.s.obs.work', 'ch11.s.obs.area', 'ch11.s.obs.release'],
    equations: ['\\tau = \\vec r \\times \\vec T = 0 \\;\\Rightarrow\\; L = m r^2 \\omega = \\text{const.}', '\\frac{dA}{dt} = \\tfrac{1}{2} r^2 \\omega = \\frac{L}{2m}', 'K = \\tfrac{1}{2} m v^2 = \\frac{L^2}{2 m r^2} \\quad (\\dot r = 0)'],
    assumptions: ['ch11.s.assume'],
  },
};
