// Ch 5 scene: first law. A puck slides off with an initial velocity. Friction (the only horizontal
// force) slows it down and stops it; with no friction, or with a push that cancels the friction,
// the net force is zero and the velocity stays constant.
import { paren, tn, u } from '../../core/tex';
import type { ParamSchema, Scene } from '../../core/types';
import { fbdParam, fbdScale, type FbdForce } from '../../draw/fbd';
import { sigsToMatch } from '../ch02/sigma';
import { tnFit } from '../ch07/sigfit';
import { drawPuckFbd, drawTrack, padded, weightPair } from './common';

type P = { v0: number; mu: number; push: boolean; strobe: boolean; fbd: boolean };

interface S {
  t: number;
  n: number;
  x: number;
  v: number;
  /** Kinetic friction on the puck (≤ 0, opposite to v) [N]. */
  f: number;
  /** Applied push (≥ 0) [N]. */
  F: number;
  /** Friction coefficient in effect at this state (μ is live: the Σ panel reads it here, not from the slider). */
  mu: number;
  /**
   * Start of the current constant-force segment: the time t₁ and speed v₁ at which the net force
   * last changed (a live μ or push change, or the stop). t₁ = 0, v₁ = v₀ until then.
   */
  t1: number;
  v1: number;
  /** Net force of the current segment [N]. */
  seg: number;
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
  fbd: fbdParam(),
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

/**
 * Free-body diagram of the puck: kinetic friction and the push (while it slides), N and mg. The
 * vertical pair cancels; the horizontal sum is f + F = m a.
 */
export function firstFbd(s: { f: number; F: number }): FbdForce[] {
  return [
    { F: { x: s.f, y: 0 }, label: '*f*_{k}' },
    { F: { x: s.F, y: 0 }, label: '*F*' },
    ...weightPair(FIRST_M),
  ];
}

/** One exact step of length h: constant deceleration until the puck stops, then at rest. */
export function firstStep(x: number, v: number, mu: number, push: boolean, h: number): { x: number; v: number } {
  const { f, F } = firstForces(v, mu, push);
  const a = (f + F) / FIRST_M;
  if (v <= 0) return { x, v: 0 };
  if (a < 0 && v + a * h <= 0) return { x: x + (v * v) / (-2 * a), v: 0 };
  return { x: x + v * h + 0.5 * a * h * h, v: v + a * h };
}

/**
 * Printed inputs and result for v = f(inputs) in the Σ panel: inputs with at most 3 figures
 * (sigsToMatch), the result as the v readout prints it (policy D, R3). On a tie such as
 * 2.02 − 2.94 × 0.0833… = 1.775 (μ = 0.3) the result follows the unrounded speed, like the readout.
 */
export function fitSpeed(v: number, xs: number[], f: (...x: number[]) => number): { xs: string[]; v: string } {
  const sig = sigsToMatch(v, xs, f);
  return { xs: xs.map((x, i) => tnFit(x, sig[i])), v: tn(v) };
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

  init: (p) => {
    const k = firstForces(p.v0, p.mu, p.push);
    return { t: 0, n: 0, x: 0, v: p.v0, ...k, mu: p.mu, t1: 0, v1: p.v0, seg: k.f + k.F, marks: [0] };
  },

  step: (s, _h, p) => {
    // A new net force from here on (μ or push changed mid-run, or the puck stopped): a new segment
    // of constant acceleration starts at this time and speed.
    const k = firstForces(s.v, p.mu, p.push);
    if (k.f + k.F !== s.seg) Object.assign(s, { t1: s.t, v1: s.v, seg: k.f + k.F });
    s.mu = p.mu;
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
    drawTrack(g, lo, hi, 0, undefined, p.fbd ? s.x : undefined);

    // Equal time steps: evenly spaced marks mean constant velocity. Filled under the arrows (hides
    // the track line), outlined again over them so the friction arrow does not hide the marks.
    const marks = (fill: boolean) => {
      if (p.strobe) for (const x of s.marks) g.circle({ x, y: 0 }, 4, { fill: fill ? '#ffffff' : undefined, role: 'position', width: 1.25 });
    };
    marks(true);

    if (p.fbd) {
      // Every force from the puck's centre on one scale: the weight is the largest force of any run.
      // The separate f, F and v arrows would cross N and mg: hidden.
      drawPuckFbd(g, s.x, firstFbd(s), fbdScale(FIRST_M * FIRST_G));
      marks(false);
      return;
    }

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

  // Σ panel: friction and the net force on the sliding puck; zero net force keeps v constant (first
  // law), friction alone slows it at a = F_net/m. At rest there is no friction at all. μ and push are
  // live, so every value comes from the state (the one on the stage, also when scrubbing back), and
  // the speed is written from the start (t₁, v₁) of the current constant-force segment.
  formula: (s, p) => {
    const Fnet = s.f + s.F;
    // Free-body diagram: the vertical pair cancels (no vertical motion).
    const W = FIRST_M * FIRST_G;
    const vert = p.fbd ? [`\\Sigma F_y = N - mg = ${tn(W)} - ${tn(W)} = 0`] : [];
    if (s.v <= 0) return [`f = ${tn(-s.f)}${u('N')}`, `F_\\text{net} = 0 \\;\\Rightarrow\\; v = ${tn(s.v)}${u('m/s')}`, ...vert];
    const lines = [
      `f_k = \\mu_k m g = ${s.mu.toFixed(2)} \\times ${FIRST_M} \\times ${FIRST_G} = ${tn(-s.f)}${u('N')}`,
      s.F > 0 ? `F_\\text{net} = F - f_k = ${tn(s.F)} - ${tn(-s.f)} = ${tn(Fnet)}${u('N')}` : `F_\\text{net} = -f_k = ${tn(Fnet)}${u('N')}`,
    ];
    lines.push(...vert);
    const fromStart = s.t1 === 0;
    if (Fnet === 0) {
      lines.push(`F_\\text{net} = 0 \\;\\Rightarrow\\; v = ${fromStart ? 'v_0' : 'v_1'} = ${tn(s.v)}${u('m/s')}`);
      return lines;
    }
    const a = Fnet / FIRST_M;
    lines.push(`a = \\frac{F_\\text{net}}{m} = \\frac{${tn(Fnet)}}{${FIRST_M}} = ${tn(a)}${u('m/s^2')}`);
    if (fromStart) {
      const k = fitSpeed(s.v, [a, s.t], (aa, t) => p.v0 + aa * t);
      lines.push(`v = v_0 + at = ${p.v0.toFixed(1)} + ${paren(k.xs[0])} \\times ${k.xs[1]} = ${k.v}${u('m/s')}`);
    } else {
      const k = fitSpeed(s.v, [s.v1, a, s.t, s.t1], (v1, aa, t, t1) => v1 + aa * (t - t1));
      // Two lines, as the work lines of Ch 8: one line would shrink below the panel's reading size.
      lines.push(`v = v_1 + a(t - t_1)`, `= ${k.xs[0]} + ${paren(k.xs[1])} \\times (${k.xs[2]} - ${k.xs[3]}) = ${k.v}${u('m/s')}`);
    }
    return lines;
  },

  info: {
    goals: ['ch05.l1.goal'],
    observe: ['ch05.l1.obs.free', 'ch05.l1.obs.mu', 'ch05.l1.obs.push', 'ch05.l1.obs.live'],
    equations: ['\\vec F_\\text{net} = 0 \\;\\Leftrightarrow\\; \\vec v = \\text{const}', 'f_k = \\mu_k m g'],
    assumptions: ['ch05.l1.assume', 'ch05.l1.assume.sym'],
  },
};
