// Ch 11 scene: a person on a spinning chair pulls two dumbbells in. I = I0 + 2 m r² drops,
// so ω = L / I rises while L stays fixed. Seen from above.
import type { ParamSchema, Scene, Vec2 } from '../../core/types';
import type { Draw } from '../../draw/draw';
import { chairInertia, chairKinetic, chairL, chairOmega, endTime, radius, stepChair, type Chair, type Mode } from './physics';

type P = { mode: string; m: number; wOut: number };

interface S {
  t: number;
  n: number;
  phi: number;
}

const RATE = 240;
const H = 1 / RATE;
const I0 = 1.5; // person and chair [kg·m²]
const R_OUT = 0.8;
const R_IN = 0.2;
const BODY = '#9a9a9a';
const KV = 0.3; // world m per (m/s)

const chairOf = (p: P): Chair => ({ mode: p.mode as Mode, m: p.m, rOut: R_OUT, rIn: R_IN, wOut: p.wOut, tRamp: 2, tHold: 1.5, I0 });

let memoKey = '';
let memo: { c: Chair; phis: Float64Array } | null = null;
function model(p: P) {
  const key = `${p.mode}|${p.m}|${p.wOut}`;
  if (key !== memoKey || !memo) {
    const c = chairOf(p);
    const N = Math.round(endTime(c) * RATE);
    const phis = new Float64Array(N + 1);
    for (let n = 0; n < N; n++) phis[n + 1] = stepChair(c, phis[n], n * H, H);
    memo = { c, phis };
    memoKey = key;
  }
  return memo;
}

const params: ParamSchema<P> = {
  mode: {
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
  },
  m: { kind: 'number', label: 'ch11.c.p.m', desc: 'ch11.c.d.m', group: 'main', live: false, control: 'select', choices: [1, 2, 4], default: 2, unit: 'kg' },
  wOut: { kind: 'number', label: 'ch11.c.p.wOut', desc: 'ch11.c.d.wOut', group: 'advanced', live: false, control: 'select', choices: [1, 1.5, 2], default: 1.5, unit: 'rad/s' },
};

function disc(g: Draw, c: Vec2, r: number, fill: string, alpha = 1): void {
  const pts: Vec2[] = [];
  for (let i = 0; i < 48; i++) pts.push({ x: c.x + r * Math.cos((i / 48) * 2 * Math.PI), y: c.y + r * Math.sin((i / 48) * 2 * Math.PI) });
  g.polygon(pts, { fill, fillAlpha: alpha });
}

export const chairScene: Scene<P, S> = {
  id: 'chair',
  title: 'ch11.c.scene',
  params,
  time: { h: H, recordEvery: 2, frameStep: 0.05, tEnd: (p) => endTime(chairOf(p as P)) },
  world: () => ({ x: [-1.15, 1.15], y: [-1.15, 1.15], aspect: 'contain', padPx: 16 }),

  init: () => ({ t: 0, n: 0, phi: 0 }),
  step: (s, _h, p) => {
    const { phis } = model(p);
    s.n = Math.min(s.n + 1, phis.length - 1);
    s.t = s.n * H;
    s.phi = phis[s.n];
  },

  record: (s, p) => {
    const c = model(p).c;
    const I = chairInertia(c, s.t);
    const w = chairOmega(c, s.t);
    return { t: s.t, I, w, L: I * w, K: chairKinetic(c, s.t) };
  },
  snapshot: (s) => ({ ...s }),

  draw: (g, s, p) => {
    const c = model(p).c;
    const O: Vec2 = { x: 0, y: 0 };
    // Chair seat (fixed outline) and the reach of the arms.
    const ring = (r: number): Vec2[] => {
      const pts: Vec2[] = [];
      for (let i = 0; i <= 96; i++) pts.push({ x: r * Math.cos((i / 96) * 2 * Math.PI), y: r * Math.sin((i / 96) * 2 * Math.PI) });
      return pts;
    };
    g.polyline(ring(R_OUT), { color: '#e2e2e2', width: 1 });
    g.polyline(ring(R_IN), { color: '#e2e2e2', width: 1 });

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
    for (const sgn of [-1, 1]) {
      const hand = at(sgn * Math.max(r, sh), 0);
      g.line(at(sgn * sh, 0), hand, { color: BODY, width: 6 });
      const d = at(sgn * r, 0);
      g.line({ x: d.x - n.x * 0.07, y: d.y - n.y * 0.07 }, { x: d.x + n.x * 0.07, y: d.y + n.y * 0.07 }, { color: '#1a1a1a', width: 3 });
      g.circle({ x: d.x - n.x * 0.07, y: d.y - n.y * 0.07 }, 6 * Math.cbrt(p.m / 2), { fill: 'position' });
      g.circle({ x: d.x + n.x * 0.07, y: d.y + n.y * 0.07 }, 6 * Math.cbrt(p.m / 2), { fill: 'position' });
    }
    // Velocity of one dumbbell: tangential r ω plus radial ṙ.
    const w = chairOmega(c, s.t);
    const vr = radius(c, s.t).v;
    const d = at(r, 0);
    g.arrow(d, { x: (u.x * vr + n.x * r * w) * KV, y: (u.y * vr + n.y * r * w) * KV }, { role: 'velocity', width: 2.25, label: '*v*' });
  },

  plots: [
    { id: 'I', label: 'I\\,(\\mathrm{kg\\,m^2})', traces: [{ channel: 'I', role: 'position' }], yRange: (p) => [0, (I0 + 2 * p.m * R_OUT ** 2) * 1.15] },
    { id: 'w', label: '\\omega\\,(\\mathrm{rad/s})', traces: [{ channel: 'w', role: 'velocity' }], yRange: (p) => [0, (chairL(chairOf(p)) / (I0 + 2 * p.m * R_IN ** 2)) * 1.12] },
    { id: 'L', label: 'L\\,(\\mathrm{kg\\,m^2/s})', traces: [{ channel: 'L', role: 'fg' }], yRange: (p) => [0, chairL(chairOf(p)) * 1.5] },
    {
      id: 'K',
      label: 'K\\,(\\mathrm{J})',
      traces: [{ channel: 'K', role: 'energyK' }],
      yRange: (p) => {
        const L = chairL(chairOf(p));
        return [0, ((0.5 * L * L) / (I0 + 2 * p.m * R_IN ** 2)) * 1.15];
      },
    },
  ],

  readouts: [
    { label: 'I', unit: 'kg·m²', value: (s, p) => chairInertia(chairOf(p), s.t) },
    { label: '\\omega', unit: 'rad/s', value: (s, p) => chairOmega(chairOf(p), s.t) },
    { label: 'L', unit: 'kg·m²/s', value: (_s, p) => chairL(chairOf(p)) },
  ],

  info: {
    goals: ['ch11.c.goal.L', 'ch11.c.goal.I'],
    observe: ['ch11.c.obs.flat', 'ch11.c.obs.ratio', 'ch11.c.obs.K', 'ch11.c.obs.mass'],
    equations: ['L = I\\omega = (I_0 + 2mr^2)\\,\\omega = \\text{const.}', 'K = \\tfrac{1}{2} I \\omega^2 = \\frac{L^2}{2I}'],
    assumptions: ['ch11.c.assume'],
  },
};
