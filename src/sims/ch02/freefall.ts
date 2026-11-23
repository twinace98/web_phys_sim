// Ch 2 scene: free fall. Vertical motion with constant acceleration −g, same slope/area plots.
import { fmtTick, niceTicks } from '../../core/format';
import { CONST, num, paren, slider, tn, tnScale, u } from '../../core/tex';
import type { ParamSchema, Scene } from '../../core/types';
import { drawFbd, fbdParam, type FbdForce } from '../../draw/fbd';
import { kinematicPlots } from './common';
import { G_EARTH, THROW_V0, fallProfile, ranges, stateAt, type Profile, type Ranges, type Throw } from './physics';

type P = {
  throw: string;
  mode: string;
  h: number;
  strobe: boolean;
  vectors: boolean;
  fbd: boolean;
};

interface S {
  t: number;
  n: number;
  y: number;
  v: number;
  a: number;
}

const RATE = 240;
const STROBE_DT = 0.1;
const TICK = '#6b6b6b';
/** Longest v arrow, as a fraction of the view height H. */
const V_LEN = 0.25;
/** a arrow at a = −g and the mg arrow of the free-body diagram, as a fraction of H. */
const A_LEN = 0.12;

/**
 * Free-body diagram of the ball: gravity only, at every instant of the flight (at the top too).
 * The model has no mass: forces are per `m` kilograms, so ΣF/m = a = −g for any m.
 */
export const freefallForces = (m = 1): FbdForce[] => [{ F: { x: 0, y: -m * G_EARTH }, label: '*m**g*', field: true }];

let memoKey = '';
let memo: { pr: Profile; rg: Ranges } | null = null;
function model(p: P): { pr: Profile; rg: Ranges } {
  const key = `${p.throw}|${p.h}`;
  if (key !== memoKey || !memo) {
    const pr = fallProfile(p.h, THROW_V0[p.throw as Throw] ?? 0);
    memo = { pr, rg: ranges(pr) };
    memoKey = key;
  }
  return memo;
}

/** Height of the top of the view: the highest point reached. */
const top = (p: P) => Math.max(model(p).rg.x[1], 1);

const params: ParamSchema<P> = {
  throw: {
    kind: 'select',
    label: 'ch02.ff.p.throw',
    desc: 'ch02.ff.d.throw',
    group: 'main',
    live: false,
    default: 'drop',
    options: [
      { value: 'drop', label: 'ch02.ff.throw.drop' },
      { value: 'up', label: 'ch02.ff.throw.up' },
      { value: 'down', label: 'ch02.ff.throw.down' },
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
  h: {
    kind: 'number',
    label: 'ch02.ff.p.h',
    desc: 'ch02.ff.d.h',
    group: 'advanced',
    live: false,
    control: 'slider',
    min: 5,
    max: 45,
    step: 1,
    default: 20,
    unit: 'm',
  },
  strobe: { kind: 'toggle', label: 'ch02.ff.p.strobe', desc: 'ch02.ff.d.strobe', group: 'advanced', live: true, default: true },
  vectors: { kind: 'toggle', label: 'ch02.p.vectors', desc: 'ch02.d.vectors', group: 'advanced', live: true, default: true },
  fbd: fbdParam(),
};

export const freefall: Scene<P, S> = {
  id: 'freefall',
  title: 'ch02.ff.scene',
  layout: 'side',
  params,
  time: { h: 1 / RATE, recordEvery: 1, frameStep: 0.05, tEnd: (p) => model(p as P).pr.tEnd },

  world: (p) => {
    const H = top(p);
    // On landing the v arrow (up to V_LEN·H) or the mg arrow (A_LEN·H) and its label hang below the ground.
    const bottom = Math.max(p.vectors ? V_LEN + 0.07 : 0.08, p.fbd ? A_LEN + 0.08 : 0);
    return { x: [-0.5 * H, 0.5 * H], y: [-bottom * H, 1.1 * H], aspect: 'contain', padPx: 24 };
  },

  init: (p) => {
    const k = stateAt(model(p).pr, 0);
    return { t: 0, n: 0, y: k.x, v: k.v, a: k.a };
  },

  step: (s, _h, p) => {
    const { pr } = model(p);
    s.n += 1;
    s.t = Math.min(s.n / RATE, pr.tEnd);
    const k = stateAt(pr, s.t);
    s.y = k.x;
    s.v = k.v;
    s.a = k.a;
  },

  record: (s) => ({ t: s.t, y: s.y, v: s.v, a: s.a }),
  snapshot: (s) => ({ ...s }),

  draw: (g, s, p) => {
    const { pr, rg } = model(p);
    const H = top(p);
    const rx = -0.2 * H; // ruler
    g.line({ x: -0.4 * H, y: 0 }, { x: 0.4 * H, y: 0 }, { role: 'axis', width: 2 });
    g.line({ x: rx, y: 0 }, { x: rx, y: H * 1.02 }, { role: 'axis', width: 1.25 });
    for (const y of niceTicks(0, H, 6)) {
      g.line({ x: rx, y }, { x: rx - g.px(5), y }, { role: 'axis', width: 1 });
      g.text({ x: rx, y }, fmtTick(y), { size: 11, color: TICK, align: 'right', baseline: 'middle', dx: -8 });
    }
    g.text({ x: rx, y: H * 1.02 }, '*y* (m)', { size: 12, color: TICK, align: 'center', dy: -10 });

    // Launch height.
    g.line({ x: rx, y: pr.x0 }, { x: g.px(-14), y: pr.x0 }, { color: '#c4c4c4', width: 1, dash: [3, 4] });

    if (p.strobe) {
      for (let k = 0; k * STROBE_DT <= s.t + 1e-9; k++) {
        const q = stateAt(pr, k * STROBE_DT);
        g.circle({ x: 0, y: q.x }, 4, { fill: '#ffffff', role: 'position', width: 1.25 });
        g.line({ x: rx, y: q.x }, { x: rx + g.px(6), y: q.x }, { role: 'position', width: 1.25 });
      }
    }

    if (p.vectors) {
      const vMax = Math.max(Math.abs(rg.v[0]), Math.abs(rg.v[1]), 1);
      g.arrow({ x: g.px(22), y: s.y }, { x: 0, y: (s.v / vMax) * V_LEN * H }, { role: 'velocity', width: 2, label: '*v*' });
      // The free-body diagram carries the same information as a (mg along −y): a hides behind it.
      if (!p.fbd) g.arrow({ x: g.px(44), y: s.y }, { x: 0, y: (s.a / G_EARTH) * A_LEN * H }, { role: 'acceleration', width: 2, label: '*a*' });
    }
    if (p.fbd) {
      // Faded ball, mg from its centre: A_LEN·H long, as the a arrow it replaces.
      g.circle({ x: 0, y: s.y }, 9, { fill: 'position', alpha: 0.25 });
      g.circle({ x: 0, y: s.y }, 9, { role: 'position', width: 1.25 });
      drawFbd(g, { x: 0, y: s.y }, freefallForces(), (A_LEN * H) / g.px(1) / G_EARTH);
    } else g.circle({ x: 0, y: s.y }, 9, { fill: 'position' });
  },

  plots: kinematicPlots<P>('y', model),

  readouts: [
    // Fixed decimals from the highest point, so the landing reads an exact 0 (policy D, R7a).
    { label: 'y', unit: 'm', value: (s) => s.y, scale: top },
    { label: 'v', unit: 'm/s', value: (s) => s.v },
    { label: 'a', unit: 'm/s²', value: (s) => s.a },
  ],

  // Constant acceleration −g: v and y at the current t, t with 3 figures (policy D, R3). y prints
  // with fixed decimals from the run's height, as its readout: at landing it is an exact 0 (R7a).
  formula: (s, p) => {
    const { pr } = model(p);
    const v0 = num(pr.v0);
    const T = tn(s.t);
    return [
      // Free-body diagram: mg is the only force, so ΣF = ma gives a = −g for any mass.
      ...(p.fbd ? [`\\Sigma F_y = -mg = ma \\;\\Rightarrow\\; a = -g`] : []),
      `a = -g = ${tn(s.a)}${u('m/s^2')}`,
      `v = v_0 - gt = ${v0} - ${CONST.g.tex} \\times ${T} = ${tn(s.v)}${u('m/s')}`,
      `y = h + v_0 t - \\tfrac{1}{2} g t^2`,
      `= ${slider(params.h, pr.x0)} + ${paren(v0)} \\times ${T} - ${num(CONST.g.value / 2)} \\times ${T}^2 = ${tnScale(s.y, top(p))}${u('m')}`,
    ];
  },

  info: {
    goals: ['ch02.ff.goal.const', 'ch02.ff.goal.up'],
    observe: ['ch02.ff.obs.graphs', 'ch02.ff.obs.top', 'ch02.ff.obs.strobe', 'ch02.ff.obs.area'],
    equations: ['y = h + v_0 t - \\tfrac{1}{2} g t^2', 'v = v_0 - g t, \\quad a = -g'],
    assumptions: ['ch02.ff.assume'],
  },
};
