// Ch 5 scene: first and second law. A puck on a frictionless surface is pushed by a constant
// force; a = F/m while it acts, and the velocity stays constant once it is removed.
import type { ParamSchema, Scene } from '../../core/types';
import { drawTrack, padded } from './common';
import { netForce, pushState, type Push } from './physics';

type P = { force: string; m: number; F: number; strobe: boolean };

interface S {
  t: number;
  n: number;
  x: number;
  v: number;
  a: number;
  F: number;
}

const RATE = 240;
const T_END = 6;
const T_OFF = 2;
const STROBE_DT = 0.5;

const M_MIN = 0.5;
const M_MAX = 5;
const F_MIN = 0.5;
const F_MAX = 5;

const pushOf = (p: P): Push => ({ F: p.F, m: p.m, tOff: p.force === 'off' ? T_OFF : Infinity });

/**
 * Scales for the track, arrows and plots: the largest acceleration this force can give (lightest
 * mass), so they do not change with m and a heavier puck visibly accelerates less.
 */
const aRef = (p: P) => p.F / M_MIN;
const vRef = (p: P) => aRef(p) * (p.force === 'off' ? T_OFF : T_END);

function track(p: P): [number, number] {
  const end = pushState({ ...pushOf(p), m: M_MIN }, T_END).x;
  return [0, Math.max(end, 4)];
}

const params: ParamSchema<P> = {
  force: {
    kind: 'select',
    label: 'ch05.n.p.force',
    desc: 'ch05.n.d.force',
    group: 'main',
    live: false,
    default: 'off',
    options: [
      { value: 'off', label: 'ch05.n.force.off' },
      { value: 'on', label: 'ch05.n.force.on' },
    ],
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
  F: {
    kind: 'number',
    label: 'ch05.n.p.F',
    desc: 'ch05.n.d.F',
    group: 'advanced',
    live: false,
    control: 'slider',
    min: F_MIN,
    max: F_MAX,
    step: 0.1,
    default: 2,
    unit: 'N',
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

  world: (p) => {
    const [lo, hi] = track(p);
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
    const [lo, hi] = track(p);
    const span = hi - lo;
    drawTrack(g, lo, hi);

    // Equal time steps: once the force is gone the marks are evenly spaced.
    if (p.strobe) {
      for (let k = 0; k * STROBE_DT <= s.t + 1e-9; k++) {
        const q = stateAt(p, k * STROBE_DT);
        // Open dots, unlike the axis ticks below the track.
        g.circle({ x: q.x, y: 0 }, 4, { fill: '#ffffff', role: 'position', width: 1.25 });
      }
    }

    const vMax = vRef(p);
    const aMax = aRef(p);
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
      yRange: (p) => padded(0, aRef(p), 0.5),
    },
    {
      id: 'v',
      label: 'v\\,(\\mathrm{m/s})',
      traces: [{ channel: 'v', role: 'velocity' }],
      yRange: (p) => padded(0, vRef(p), 1),
      overlays: () => [{ kind: 'tangent', channel: 'v', slopeChannel: 'a', role: 'acceleration', unit: 'm/s²', target: { plot: 'a', channel: 'a' } }],
    },
  ],

  readouts: [
    { label: 'F_\\text{net}', unit: 'N', value: (s) => s.F },
    { label: 'a', unit: 'm/s²', value: (s) => s.a },
    { label: 'v', unit: 'm/s', value: (s) => s.v },
  ],

  info: {
    goals: ['ch05.n.goal.first', 'ch05.n.goal.second'],
    observe: ['ch05.n.obs.off', 'ch05.n.obs.slope', 'ch05.n.obs.mass', 'ch05.n.obs.strobe'],
    equations: ['\\vec F_\\text{net} = m\\vec a', '\\vec F_\\text{net} = 0 \\;\\Rightarrow\\; \\vec v = \\text{const}'],
    assumptions: ['ch05.n.assume'],
  },
};
