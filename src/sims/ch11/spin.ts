// Ch 11 scene: conservation of angular momentum, two systems seen from above.
//  - puck: a puck on a string through a hole in a frictionless table. Pulling the string in raises
//    ω so that L = m r² ω stays fixed; the string sweeps equal areas in equal times.
//  - chair: a person on a spinning chair pulls two dumbbells in. I = I0 + 2 m r² drops, so
//    ω = L / I rises while L stays fixed.
// Both share the plots I(t), ω(t), L(t) and K(t).
import { num, tn, u } from '../../core/tex';
import type { ParamSchema, Scene, Vec2 } from '../../core/types';
import type { Draw } from '../../draw/draw';
import {
  angMom,
  chairInertia,
  chairKinetic,
  chairL,
  chairOmega,
  endTime,
  kinetic,
  omega,
  radius,
  stepAngle,
  stepChair,
  tension,
  type Chair,
  type Mode,
  type Pull,
} from './physics';
import { sigFit } from '../ch07/sigfit';

type P = { sys: string; mode: string; arms: string; rIn: number; wOut: number; m: number; areas: boolean; mDb: number; wArms: number };

interface S {
  t: number;
  n: number;
  phi: number;
}

const RATE = 240;
const H = 1 / RATE;

// puck on a string
const R_OUT = 1;
const SECTORS = 6;
const T_MIN_PX = 30; // shortest tension arrow [px]; the puck (9 px radius) covers its base
const SECTOR_FILL = ['#E69F00', '#56B4E9'];

// spinning chair
const I0 = 1.5; // person and chair [kg·m²]
const ARM_OUT = 0.8;
const ARM_IN = 0.2;
const BODY = '#9a9a9a';
const KV = 0.3; // world m per (m/s)

const isChair = (p: P) => p.sys === 'chair';

const pullOf = (p: P): Pull => ({ mode: p.mode as Mode, m: p.m, rOut: R_OUT, rIn: p.rIn, wOut: p.wOut, tRamp: 3, tHold: 2 });
const chairOf = (p: P): Chair => ({ mode: p.arms as Mode, m: p.mDb, rOut: ARM_OUT, rIn: ARM_IN, wOut: p.wArms, tRamp: 2, tHold: 1.5, I0 });

let puckKey = '';
let puckMemo: { c: Pull; phis: Float64Array; dt: number; vMax: number; tMax: number } | null = null;
/** Puck: whole run integrated once per parameter set, φ at every physics step. */
function puckModel(p: P) {
  const key = `${p.mode}|${p.rIn}|${p.wOut}|${p.m}`;
  if (key !== puckKey || !puckMemo) {
    const c = pullOf(p);
    const N = Math.round(endTime(c) * RATE);
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
    puckMemo = { c, phis, dt, vMax, tMax };
    puckKey = key;
  }
  return puckMemo;
}

let chairKey = '';
let chairMemo: { c: Chair; phis: Float64Array } | null = null;
function chairModel(p: P) {
  const key = `${p.arms}|${p.mDb}|${p.wArms}`;
  if (key !== chairKey || !chairMemo) {
    const c = chairOf(p);
    const N = Math.round(endTime(c) * RATE);
    const phis = new Float64Array(N + 1);
    for (let n = 0; n < N; n++) phis[n + 1] = stepChair(c, phis[n], n * H, H);
    chairMemo = { c, phis };
    chairKey = key;
  }
  return chairMemo;
}

const phisOf = (p: P) => (isChair(p) ? chairModel(p).phis : puckModel(p).phis);
const phiAt = (p: P, n: number) => {
  const f = phisOf(p);
  return f[Math.min(n, f.length - 1)];
};
const puckPos = (p: P, n: number): Vec2 => {
  const r = radius(puckModel(p).c, n * H).r;
  const f = phiAt(p, n);
  return { x: r * Math.cos(f), y: r * Math.sin(f) };
};

/** I, ω, L, K and the radius at time t for either system. */
function sample(p: P, t: number) {
  if (isChair(p)) {
    const c = chairOf(p);
    const I = chairInertia(c, t);
    const w = chairOmega(c, t);
    return { r: radius(c, t).r, I, w, L: I * w, K: chairKinetic(c, t) };
  }
  const c = pullOf(p);
  const r = radius(c, t).r;
  const w = omega(c, t);
  const I = c.m * r * r;
  return { r, I, w, L: I * w, K: kinetic(c, t) };
}

/** I on the outer and inner circle, and the fixed L. */
function extremes(p: P): { Iout: number; Iin: number; L: number } {
  if (isChair(p)) {
    const Iout = I0 + 2 * p.mDb * ARM_OUT ** 2;
    return { Iout, Iin: I0 + 2 * p.mDb * ARM_IN ** 2, L: chairL(chairOf(p)) };
  }
  return { Iout: p.m * R_OUT ** 2, Iin: p.m * p.rIn ** 2, L: angMom(pullOf(p)) };
}

const puckOnly = (p: Record<string, unknown>) => p.sys !== 'chair';
const chairOnly = (p: Record<string, unknown>) => p.sys === 'chair';

const params: ParamSchema<P> = {
  sys: {
    kind: 'select',
    label: 'ch11.p.sys',
    desc: 'ch11.d.sys',
    group: 'main',
    live: false,
    default: 'puck',
    options: [
      { value: 'puck', label: 'ch11.sys.puck' },
      { value: 'chair', label: 'ch11.sys.chair' },
    ],
  },
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
    visibleIf: puckOnly,
  },
  arms: {
    kind: 'select',
    label: 'ch11.c.p.mode',
    desc: 'ch11.c.d.mode',
    group: 'main',
    live: false,
    default: 'pull',
    options: [
      { value: 'pull', label: 'ch11.c.mode.pull' },
      { value: 'release', label: 'ch11.c.mode.release' },
      { value: 'both', label: 'ch11.c.mode.both' },
    ],
    visibleIf: chairOnly,
  },
  rIn: { kind: 'number', label: 'ch11.p.rIn', desc: 'ch11.d.rIn', group: 'advanced', live: false, control: 'slider', min: 0.3, max: 0.8, step: 0.05, default: 0.5, unit: 'm', visibleIf: puckOnly },
  wOut: { kind: 'number', label: 'ch11.p.wOut', desc: 'ch11.d.wOut', group: 'advanced', live: false, control: 'slider', min: 1, max: 3, step: 0.1, default: 2, unit: 'rad/s', visibleIf: puckOnly },
  m: { kind: 'number', label: 'ch11.p.m', desc: 'ch11.d.m', group: 'advanced', live: false, control: 'slider', min: 0.1, max: 0.5, step: 0.05, default: 0.2, unit: 'kg', visibleIf: puckOnly },
  areas: { kind: 'toggle', label: 'ch11.p.areas', desc: 'ch11.d.areas', group: 'advanced', live: true, default: true, visibleIf: puckOnly },
  mDb: { kind: 'number', label: 'ch11.c.p.m', desc: 'ch11.c.d.m', group: 'advanced', live: false, control: 'slider', min: 0.5, max: 4, step: 0.1, default: 2, unit: 'kg', visibleIf: chairOnly },
  wArms: { kind: 'number', label: 'ch11.c.p.wOut', desc: 'ch11.c.d.wOut', group: 'advanced', live: false, control: 'slider', min: 1, max: 2, step: 0.1, default: 1.5, unit: 'rad/s', visibleIf: chairOnly },
};

function ring(r: number): Vec2[] {
  const pts: Vec2[] = [];
  for (let i = 0; i <= 96; i++) pts.push({ x: r * Math.cos((i / 96) * 2 * Math.PI), y: r * Math.sin((i / 96) * 2 * Math.PI) });
  return pts;
}

function disc(g: Draw, c: Vec2, r: number, fill: string, alpha = 1): void {
  const pts: Vec2[] = [];
  for (let i = 0; i < 48; i++) pts.push({ x: c.x + r * Math.cos((i / 48) * 2 * Math.PI), y: c.y + r * Math.sin((i / 48) * 2 * Math.PI) });
  g.polygon(pts, { fill, fillAlpha: alpha });
}

/** Sectors swept in the last few equal time intervals, alternately tinted. */
function sectors(g: Draw, p: P, n: number): void {
  const { dt } = puckModel(p);
  const per = Math.max(1, Math.round(dt * RATE));
  const kNow = Math.floor(n / per);
  for (let k = Math.max(0, kNow - SECTORS); k < kNow; k++) {
    const pts: Vec2[] = [{ x: 0, y: 0 }];
    const step = Math.max(1, Math.round(per / 24));
    for (let i = k * per; i <= (k + 1) * per; i += step) pts.push(puckPos(p, i));
    pts.push(puckPos(p, (k + 1) * per));
    g.polygon(pts, { fill: SECTOR_FILL[k % 2], fillAlpha: 0.28 });
  }
}

function drawPuck(g: Draw, s: S, p: P): void {
  const { c, vMax, tMax } = puckModel(p);
  const O: Vec2 = { x: 0, y: 0 };
  // Outer and inner radii as faint guides.
  for (const rr of [c.rOut, c.rIn]) g.polyline(ring(rr), { color: '#e2e2e2', width: 1 });
  if (p.areas) sectors(g, p, s.n);

  // Path so far.
  const path: Vec2[] = [];
  const step = Math.max(1, Math.floor(s.n / 1200));
  for (let i = 0; i < s.n; i += step) path.push(puckPos(p, i));
  path.push(puckPos(p, s.n));
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
}

function drawChair(g: Draw, s: S, p: P): void {
  const c = chairModel(p).c;
  const O: Vec2 = { x: 0, y: 0 };
  // Reach of the arms.
  g.polyline(ring(ARM_OUT), { color: '#e2e2e2', width: 1 });
  g.polyline(ring(ARM_IN), { color: '#e2e2e2', width: 1 });

  const r = radius(c, s.t).r;
  const u = { x: Math.cos(s.phi), y: Math.sin(s.phi) };
  const n = { x: -u.y, y: u.x };
  const at = (a: number, b: number): Vec2 => ({ x: u.x * a + n.x * b, y: u.y * a + n.y * b });

  // Shoulders along u, head in the middle, nose towards n (shows the turning).
  const sh = 0.14;
  disc(g, O, 0.3, '#ededed');
  g.polygon([at(-sh, -0.08), at(sh, -0.08), at(sh, 0.08), at(-sh, 0.08)], { fill: BODY, fillAlpha: 0.55 });
  disc(g, O, 0.12, BODY);
  g.polygon([at(-0.035, 0.11), at(0.035, 0.11), at(0, 0.17)], { fill: BODY });
  // Arms from the shoulders to the dumbbells (at ±r along u).
  const rb = 6 * Math.cbrt(p.mDb / 2);
  for (const sgn of [-1, 1]) {
    const hand = at(sgn * Math.max(r, sh), 0);
    g.line(at(sgn * sh, 0), hand, { color: BODY, width: 6 });
    const d = at(sgn * r, 0);
    g.line({ x: d.x - n.x * 0.07, y: d.y - n.y * 0.07 }, { x: d.x + n.x * 0.07, y: d.y + n.y * 0.07 }, { color: '#1a1a1a', width: 3 });
    g.circle({ x: d.x - n.x * 0.07, y: d.y - n.y * 0.07 }, rb, { fill: 'position' });
    g.circle({ x: d.x + n.x * 0.07, y: d.y + n.y * 0.07 }, rb, { fill: 'position' });
  }
  // Velocity of one dumbbell: tangential r ω plus radial ṙ.
  const w = chairOmega(c, s.t);
  const vr = radius(c, s.t).v;
  const d = at(r, 0);
  g.arrow(d, { x: (u.x * vr + n.x * r * w) * KV, y: (u.y * vr + n.y * r * w) * KV }, { role: 'velocity', width: 2.25, label: '*v*' });
}

const tEndOf = (p: P) => endTime(isChair(p) ? chairOf(p) : pullOf(p));

/**
 * Σ panel: I from the current radius, L = I ω (the same at every instant), K (L²/2I on a circle,
 * plus the radial term while the radius changes) and, for the puck, the areal velocity L / 2m.
 */
export function formulaLines(s: S, p: P): string[] {
  const k = sample(p, s.t);
  const L = extremes(p).L;
  const chair = isChair(p);
  const c = chair ? chairOf(p) : pullOf(p);
  const m = num(c.m);
  const I = chair ? (r: number) => I0 + 2 * c.m * r * r : (r: number) => c.m * r * r;
  const rs = tn(k.r, sigFit([k.r], I, k.I));
  const kgm2 = 'kg\\,m^2';
  const lines = [
    chair ? `I = I_0 + 2mr^2 = ${num(I0)} + 2(${m})(${rs})^2 = ${tn(k.I)}${u(kgm2)}` : `I = mr^2 = (${m})(${rs})^2 = ${tn(k.I)}${u(kgm2)}`,
  ];
  const sl = sigFit([k.I, k.w], (a, b) => a * b, L);
  lines.push(`L = I\\omega = (${tn(k.I, sl)})(${tn(k.w, sl)}) = ${tn(L)}${u(kgm2 + '/s')}`);
  const rd = radius(c, s.t).v;
  if (rd === 0) {
    lines.push(`K = \\frac{L^2}{2I} = \\frac{(${tn(L)})^2}{2(${tn(k.I, sigFit([k.I], (q) => (L * L) / (2 * q), k.K))})} = ${tn(k.K)}${u('J')}`);
  } else {
    // The radial term: ½ m ṙ² for the puck, ½ (2m) ṙ² for the two dumbbells.
    const mr = chair ? 2 * c.m : c.m;
    const sk = sigFit([k.I, k.w, rd], (a, b, d) => 0.5 * a * b * b + 0.5 * mr * d * d, k.K);
    lines.push(
      `K = \\tfrac12 I\\omega^2 + ${chair ? 'm\\dot r^2' : '\\tfrac12 m\\dot r^2'}`,
      `= \\tfrac12(${tn(k.I, sk)})(${tn(k.w, sk)})^2 + ${chair ? `(${m})` : `\\tfrac12(${m})`}(${tn(rd, sk)})^2 = ${tn(k.K)}${u('J')}`,
    );
  }
  if (!chair) {
    const dA = L / (2 * c.m);
    lines.push(`\\frac{dA}{dt} = \\frac{L}{2m} = \\frac{${tn(L, sigFit([L], (q) => q / (2 * c.m), dA))}}{2(${m})} = ${tn(dA)}${u('m^2/s')}`);
  }
  return lines;
}

export const spinScene: Scene<P, S> = {
  id: 'spin',
  title: 'ch11.s.scene',
  params,
  time: { h: H, recordEvery: 2, frameStep: 0.05, tEnd: (p) => tEndOf(p as P) },
  world: (p) => {
    const e = isChair(p) ? 1.15 : R_OUT + 0.3;
    return { x: [-e, e], y: [-e, e], aspect: 'contain', padPx: 16 };
  },

  init: (p) => ({ t: 0, n: 0, phi: phiAt(p, 0) }),
  step: (s, _h, p) => {
    s.n = Math.min(s.n + 1, phisOf(p).length - 1);
    s.t = s.n * H;
    s.phi = phiAt(p, s.n);
  },

  record: (s, p) => {
    const k = sample(p, s.t);
    return { t: s.t, I: k.I, w: k.w, L: k.L, K: k.K };
  },
  snapshot: (s) => ({ ...s }),

  draw: (g, s, p) => (isChair(p) ? drawChair(g, s, p) : drawPuck(g, s, p)),

  plots: [
    { id: 'I', label: 'I\\,(\\mathrm{kg\\,m^2})', traces: [{ channel: 'I', role: 'position' }], yRange: (p) => [0, extremes(p).Iout * 1.15] },
    {
      id: 'w',
      label: '\\omega\\,(\\mathrm{rad/s})',
      traces: [{ channel: 'w', role: 'velocity' }],
      yRange: (p) => {
        const e = extremes(p);
        return [0, (e.L / e.Iin) * 1.12];
      },
    },
    { id: 'L', label: 'L\\,(\\mathrm{kg\\,m^2/s})', traces: [{ channel: 'L', role: 'fg' }], yRange: (p) => [0, extremes(p).L * 1.5] },
    {
      id: 'K',
      label: 'K\\,(\\mathrm{J})',
      traces: [{ channel: 'K', role: 'energyK' }],
      yRange: (p) => {
        const e = extremes(p);
        return [0, ((0.5 * e.L * e.L) / e.Iin) * 1.15];
      },
    },
  ],

  readouts: [
    { label: 'r', unit: 'm', value: (s, p) => sample(p, s.t).r },
    { label: 'I', unit: 'kg·m²', value: (s, p) => sample(p, s.t).I },
    { label: '\\omega', unit: 'rad/s', value: (s, p) => sample(p, s.t).w },
    { label: 'L', unit: 'kg·m²/s', value: (_s, p) => extremes(p).L },
  ],

  formula: (s, p) => formulaLines(s, p),

  info: {
    goals: ['ch11.s.goal.L', 'ch11.s.goal.I', 'ch11.s.goal.K'],
    observe: ['ch11.s.obs.flat', 'ch11.s.obs.square', 'ch11.s.obs.ratio', 'ch11.s.obs.work', 'ch11.s.obs.area', 'ch11.s.obs.mass'],
    equations: [
      '\\tau_\\text{ext} = 0 \\;\\Rightarrow\\; L = I\\omega = \\text{const.}',
      '\\vec\\tau = \\vec r \\times \\vec T = 0, \\quad I = m r^2',
      'I = I_0 + 2 m r^2',
      'K = \\tfrac{1}{2} I \\omega^2 = \\frac{L^2}{2I} \\quad (\\dot r = 0)',
      '\\frac{dA}{dt} = \\tfrac{1}{2} r^2 \\omega = \\frac{L}{2m}',
    ],
    assumptions: ['ch11.s.assume', 'ch11.c.assume'],
  },
};
