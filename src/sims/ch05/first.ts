// Ch 5 scene: first law. A puck slides off with an initial velocity. Friction (the only horizontal
// force) slows it down and stops it; with no friction, or with a push that cancels the friction,
// the net force is zero and the velocity stays constant.
import { tn, tp, u } from '../../core/tex';
import type { ParamSchema, Scene } from '../../core/types';
import { sigToMatch } from '../ch02/sigma';
import { drawTrack, padded } from './common';

type P = { v0: number; mu: number; push: boolean; strobe: boolean };

interface S {
  t: number;
  n: number;
  x: number;
  v: number;
  /** Kinetic friction on the puck (≤ 0, opposite to v) [N]. */
  f: number;
  /** Applied push (≥ 0) [N]. */
  F: number;
  /** Strobe marks: puck position every STROBE_DT. */
  marks: number[];
}

const RATE = 240;
const T_END = 6;
const STROBE_DT = 0.5;
const STROBE_N = Math.round(STROBE_DT * RATE);

export const FIRST_M = 1;
export const FIRST_G = 9.8;
const MU_MAX = 0.3;
const V0_MIN = 1;
const V0_MAX = 5;
/** Largest friction force: scales the force arrows and the F_net plot. */
const F_REF = MU_MAX * FIRST_M * FIRST_G;

/** Track: as far as the puck gets with no friction, so friction visibly shortens the slide. */
const track = (p: P): [number, number] => [0, Math.max(p.v0 * T_END, 4)];

const params: ParamSchema<P> = {
  mu: {
    kind: 'number',
    label: 'ch05.l1.p.mu',
    desc: 'ch05.l1.d.mu',
    group: 'main',
    live: true,
    control: 'slider',
    min: 0,
    max: MU_MAX,
    step: 0.01,
    default: 0,
  },
  push: { kind: 'toggle', label: 'ch05.l1.p.push', desc: 'ch05.l1.d.push', group: 'main', live: true, default: false },
  v0: {
    kind: 'number',
    label: 'ch05.l1.p.v0',
    desc: 'ch05.l1.d.v0',
    group: 'advanced',
    live: false,
    control: 'slider',
    min: V0_MIN,
    max: V0_MAX,
    step: 0.1,
    default: 3,
    unit: 'm/s',
  },
  strobe: { kind: 'toggle', label: 'ch05.n.p.strobe', desc: 'ch05.n.d.strobe', group: 'advanced', live: true, default: true },
};

/** Forces on the puck while it slides (none at rest: nothing pushes it, so static friction is zero). */
export function firstForces(v: number, mu: number, push: boolean): { f: number; F: number } {
  if (v <= 0) return { f: 0, F: 0 };
  const fk = mu * FIRST_M * FIRST_G;
  return { f: -fk, F: push ? fk : 0 };
}

/** One exact step of length h: constant deceleration until the puck stops, then at rest. */
export function firstStep(x: number, v: number, mu: number, push: boolean, h: number): { x: number; v: number } {
  const { f, F } = firstForces(v, mu, push);
  const a = (f + F) / FIRST_M;
  if (v <= 0) return { x, v: 0 };
  if (a < 0 && v + a * h <= 0) return { x: x + (v * v) / (-2 * a), v: 0 };
  return { x: x + v * h + 0.5 * a * h * h, v: v + a * h };
}

export const first: Scene<P, S> = {
  id: 'first',
  title: 'ch05.l1.scene',
  layout: 'stack',
  params,
  time: { h: 1 / RATE, recordEvery: 1, frameStep: 0.1, tEnd: T_END },

  world: (p) => {
    const [lo, hi] = track(p);
    const pad = 0.16 * (hi - lo);
    return { x: [lo - pad, hi + pad], y: [-1, 1], aspect: 'fit-x', padPx: 28 };
  },

  init: (p) => ({ t: 0, n: 0, x: 0, v: p.v0, ...firstForces(p.v0, p.mu, p.push), marks: [0] }),

  step: (s, _h, p) => {
    s.n += 1;
    s.t = Math.min(s.n / RATE, T_END);
    Object.assign(s, firstStep(s.x, s.v, p.mu, p.push, 1 / RATE));
    Object.assign(s, firstForces(s.v, p.mu, p.push));
    if (s.n % STROBE_N === 0) s.marks.push(s.x);
  },

  record: (s) => ({ t: s.t, x: s.x, v: s.v, Fnet: s.f + s.F }),
  snapshot: (s) => ({ ...s, marks: s.marks.slice() }),

  draw: (g, s, p) => {
    const [lo, hi] = track(p);
    const span = hi - lo;
    drawTrack(g, lo, hi);

    // Equal time steps: evenly spaced marks mean constant velocity. Filled under the arrows (hides
    // the track line), outlined again over them so the friction arrow does not hide the marks.
    const marks = (fill: boolean) => {
      if (p.strobe) for (const x of s.marks) g.circle({ x, y: 0 }, 4, { fill: fill ? '#ffffff' : undefined, role: 'position', width: 1.25 });
    };
    marks(true);

    const r = g.px(10);
    const len = (F: number) => Math.max((Math.abs(F) / F_REF) * 0.1 * span, g.px(18));
    if (s.f < 0) {
      // Friction on the puck, backwards along the track.
      const fx = len(s.f);
      g.arrow({ x: s.x - r, y: 0 }, { x: -fx, y: 0 }, { role: 'force', width: 2.5 });
      g.text({ x: s.x - r - fx, y: 0 }, '*f*', { size: 13, role: 'force', align: 'right', dx: -4, dy: -6 });
    }
    if (s.F > 0) {
      const fx = len(s.F);
      g.arrow({ x: s.x + r, y: 0 }, { x: fx, y: 0 }, { role: 'force', width: 2.5 });
      g.text({ x: s.x + r + fx, y: 0 }, '*F*', { size: 13, role: 'force', align: 'left', dx: 4, dy: -6 });
    }
    marks(false);
    if (s.v > 0) g.arrow({ x: s.x, y: g.px(26) }, { x: Math.max((s.v / p.v0) * 0.12 * span, g.px(14)), y: 0 }, { role: 'velocity', label: '*v*' });
    g.circle({ x: s.x, y: 0 }, 10, { fill: 'position' });
  },

  plots: [
    {
      id: 'Fnet',
      label: 'F_\\text{net}\\,(\\mathrm{N})',
      traces: [{ channel: 'Fnet', role: 'force' }],
      yRange: () => padded(-F_REF, 0, 1),
    },
    {
      id: 'v',
      label: 'v\\,(\\mathrm{m/s})',
      traces: [{ channel: 'v', role: 'velocity' }],
      yRange: (p) => padded(0, p.v0, 1),
    },
  ],

  readouts: [
    { label: 'f', unit: 'N', value: (s) => -s.f },
    { label: 'F_\\text{net}', unit: 'N', value: (s) => s.f + s.F },
    { label: 'v', unit: 'm/s', value: (s) => s.v },
  ],

  // Σ panel: friction and the net force on the sliding puck; zero net force keeps v = v_0 (first
  // law), friction alone slows it at a = F_net/m. At rest there is no friction at all.
  formula: (s, p) => {
    const Fnet = s.f + s.F;
    if (s.v <= 0) return [`f = ${tn(-s.f)}${u('N')}`, `F_\\text{net} = 0 \\;\\Rightarrow\\; v = ${tn(s.v)}${u('m/s')}`];
    const lines = [
      `f_k = \\mu_k m g = ${p.mu.toFixed(2)} \\times ${FIRST_M} \\times ${FIRST_G} = ${tn(-s.f)}${u('N')}`,
      p.push ? `F_\\text{net} = F - f_k = ${tn(s.F)} - ${tn(-s.f)} = ${tn(Fnet)}${u('N')}` : `F_\\text{net} = -f_k = ${tn(Fnet)}${u('N')}`,
    ];
    if (Fnet === 0) {
      lines.push(`F_\\text{net} = 0 \\;\\Rightarrow\\; v = v_0 = ${tn(s.v)}${u('m/s')}`);
      return lines;
    }
    const a = Fnet / FIRST_M;
    const sig = sigToMatch(s.v, [a, s.t], (aa, t) => p.v0 + aa * t);
    lines.push(`a = \\frac{F_\\text{net}}{m} = \\frac{${tn(Fnet)}}{${FIRST_M}} = ${tn(a)}${u('m/s^2')}`);
    lines.push(`v = v_0 + at = ${p.v0.toFixed(1)} + ${tp(a, sig)} \\times ${tn(s.t, sig)} = ${tn(s.v)}${u('m/s')}`);
    return lines;
  },

  info: {
    goals: ['ch05.l1.goal'],
    observe: ['ch05.l1.obs.free', 'ch05.l1.obs.mu', 'ch05.l1.obs.push', 'ch05.l1.obs.live'],
    equations: ['\\vec F_\\text{net} = 0 \\;\\Leftrightarrow\\; \\vec v = \\text{const}', 'f_k = \\mu_k m g'],
    assumptions: ['ch05.l1.assume'],
  },
};
