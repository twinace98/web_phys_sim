// Ch 5 scene: second law. A puck on a frictionless surface is pushed from rest by a constant
// force: a = F/m, so v grows linearly with slope F/m.
import { tn, u } from '../../core/tex';
import type { ParamSchema, Scene } from '../../core/types';
import { sigToMatch } from '../ch02/sigma';
import { drawTrack, padded } from './common';
import { netForce, pushState, type Push } from './physics';

type P = { m: number; F: number; strobe: boolean };

interface S {
  t: number;
  n: number;
  x: number;
  v: number;
  a: number;
  F: number;
}

const RATE = 240;
const T_END = 4;
const STROBE_DT = 0.5;

const M_MIN = 1;
const M_MAX = 5;
const F_MIN = 0.5;
const F_MAX = 5;

const pushOf = (p: P): Push => ({ F: p.F, m: p.m, tOff: Infinity });

/**
 * Fixed scales for the track, arrows and plots: the largest acceleration on the sliders
 * (F_MAX on M_MIN). They change with neither F nor m, so a = F/m shows directly on screen.
 */
const A_MAX = F_MAX / M_MIN;
const V_MAX = A_MAX * T_END;
const TRACK: [number, number] = [0, 0.5 * A_MAX * T_END * T_END];

const params: ParamSchema<P> = {
  F: {
    kind: 'number',
    label: 'ch05.n.p.F',
    desc: 'ch05.n.d.F',
    group: 'main',
    live: false,
    control: 'slider',
    min: F_MIN,
    max: F_MAX,
    step: 0.1,
    default: 4,
    unit: 'N',
  },
  m: {
    kind: 'number',
    label: 'ch05.n.p.m',
    desc: 'ch05.n.d.m',
    group: 'main',
    live: false,
    control: 'slider',
    min: M_MIN,
    max: M_MAX,
    step: 0.1,
    default: 2,
    unit: 'kg',
  },
  strobe: { kind: 'toggle', label: 'ch05.n.p.strobe', desc: 'ch05.n.d.strobe', group: 'advanced', live: true, default: true },
};

function stateAt(p: P, t: number): Omit<S, 'n' | 't'> {
  const pu = pushOf(p);
  return { ...pushState(pu, t), F: netForce(pu, t) };
}

export const newton: Scene<P, S> = {
  id: 'newton',
  title: 'ch05.n.scene',
  layout: 'stack',
  params,
  time: { h: 1 / RATE, recordEvery: 1, frameStep: 0.1, tEnd: T_END },

  world: () => {
    const [lo, hi] = TRACK;
    const pad = 0.16 * (hi - lo);
    return { x: [lo - pad, hi + pad], y: [-1, 1], aspect: 'fit-x', padPx: 28 };
  },

  init: (p) => ({ t: 0, n: 0, ...stateAt(p, 0) }),

  step: (s, _h, p) => {
    s.n += 1;
    s.t = Math.min(s.n / RATE, T_END);
    Object.assign(s, stateAt(p, s.t));
  },

  record: (s) => ({ t: s.t, x: s.x, v: s.v, a: s.a, F: s.F }),
  snapshot: (s) => ({ ...s }),

  draw: (g, s, p) => {
    const [lo, hi] = TRACK;
    const span = hi - lo;
    drawTrack(g, lo, hi);

    // Equal time steps: the spacing grows by the same amount a·Δt² each step.
    if (p.strobe) {
      for (let k = 0; k * STROBE_DT <= s.t + 1e-9; k++) {
        const q = stateAt(p, k * STROBE_DT);
        // Open dots, unlike the axis ticks below the track.
        g.circle({ x: q.x, y: 0 }, 4, { fill: '#ffffff', role: 'position', width: 1.25 });
      }
    }

    const vMax = V_MAX;
    const aMax = A_MAX;
    const r = g.px(10);
    if (s.F > 0) {
      // F lies along the track: its label goes just above the tip. Scaled by the largest force.
      const fx = Math.max((s.F / F_MAX) * 0.15 * span, g.px(18));
      g.arrow({ x: s.x + r, y: 0 }, { x: fx, y: 0 }, { role: 'force', width: 2.5 });
      g.text({ x: s.x + r + fx, y: 0 }, '*F*', { size: 13, role: 'force', align: 'left', dx: 4, dy: -6 });
    }
    // Proportional to v and a on the fixed scale, but never shorter than an arrow head can show.
    const minLen = g.px(14);
    if (s.v > 0) g.arrow({ x: s.x, y: g.px(26) }, { x: Math.max((s.v / vMax) * 0.12 * span, minLen), y: 0 }, { role: 'velocity', label: '*v*' });
    if (s.a > 0) g.arrow({ x: s.x, y: g.px(48) }, { x: Math.max((s.a / aMax) * 0.08 * span, minLen), y: 0 }, { role: 'acceleration', label: '*a*' });
    g.circle({ x: s.x, y: 0 }, 10, { fill: 'position' });
  },

  plots: [
    {
      id: 'F',
      label: 'F_\\text{net}\\,(\\mathrm{N})',
      traces: [{ channel: 'F', role: 'force' }],
      yRange: () => padded(0, F_MAX, 1),
    },
    {
      id: 'a',
      label: 'a\\,(\\mathrm{m/s^2})',
      traces: [{ channel: 'a', role: 'acceleration' }],
      yRange: () => padded(0, A_MAX, 0.5),
    },
    {
      id: 'v',
      label: 'v\\,(\\mathrm{m/s})',
      traces: [{ channel: 'v', role: 'velocity' }],
      yRange: () => padded(0, V_MAX, 1),
      overlays: () => [{ kind: 'tangent', channel: 'v', slopeChannel: 'a', role: 'acceleration', unit: 'm/s²', target: { plot: 'a', channel: 'a' } }],
    },
  ],

  readouts: [
    { label: 'F_\\text{net}', unit: 'N', value: (s) => s.F },
    { label: 'a', unit: 'm/s²', value: (s) => s.a },
    { label: 'v', unit: 'm/s', value: (s) => s.v },
  ],

  // Σ panel: a = F_net/m, then v and x of uniform acceleration from rest at the current t.
  formula: (s, p) => {
    const sig = Math.max(
      sigToMatch(s.v, [s.a, s.t], (a, t) => a * t),
      sigToMatch(s.x, [s.a, s.t], (a, t) => 0.5 * a * t * t),
    );
    const a = tn(s.a, sig);
    const T = tn(s.t, sig);
    return [
      `a = \\frac{F_\\text{net}}{m} = \\frac{${p.F.toFixed(1)}}{${p.m.toFixed(1)}} = ${tn(s.a)}${u('m/s^2')}`,
      `v = at = ${a} \\times ${T} = ${tn(s.v)}${u('m/s')}`,
      `x = \\tfrac{1}{2}at^2 = \\tfrac{1}{2} \\times ${a} \\times ${T}^2 = ${tn(s.x)}${u('m')}`,
    ];
  },

  info: {
    goals: ['ch05.n.goal.second'],
    observe: ['ch05.n.obs.slope', 'ch05.n.obs.force', 'ch05.n.obs.mass', 'ch05.n.obs.strobe'],
    equations: ['\\vec F_\\text{net} = m\\vec a', 'a = F_\\text{net}/m'],
    assumptions: ['ch05.n.assume'],
  },
};
