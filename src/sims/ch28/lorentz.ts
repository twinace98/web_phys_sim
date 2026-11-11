// Ch 28 scene: charged particles in a uniform field into the page. F = q v × B is always
// perpendicular to v: speed constant, circular path, period independent of the speed.
import type { NumberParam, ParamSchema, Scene, Vec2 } from '../../core/types';
import { fieldGrid, particle } from './common';
import { PARTICLES, gyrate, lorentz, period, radius, type Kin, type Particle } from './physics';

type P = { particle: string; Be: number; Bi: number; compare: boolean; v: number };

interface S {
  t: number;
  n: number;
  ps: Kin[];
  trails: number[][];
}

const RATE = 120;
const M = 1e6; // speed unit [m/s]

const ptOf = (p: P): Particle => PARTICLES[p.particle] ?? PARTICLES.proton;
const isElectron = (p: P) => p.particle === 'electron';
/** Field unit for the species: mT for the electron, T for ions. */
const unitB = (p: P) => (isElectron(p) ? 1e-3 : 1);
const Bof = (p: P) => (isElectron(p) ? p.Be : p.Bi) * unitB(p);
const speeds = (p: P) => (p.compare ? [1, 2, 3] : [p.v]).map((v) => v * M);
/** Largest radius the controls allow (v = 3, B = 0.5): fixes the view per species. */
const rMax = (p: P) => radius(ptOf(p), 3 * M, 0.5 * unitB(p));
/**
 * Half-width of the view [cm], fixed per species by rMax at the weakest field: the drawn radius
 * falls exactly as 1/B, so doubling B visibly halves every circle.
 */
export const viewR = (p: P) => rMax(p) * 100;
/** ns of sim time per wall second: one turn in 3 s at B = 1 unit. */
const nsPerSec = (p: P) => (period(ptOf(p), unitB(p)) * 1e9) / 3;

/** Field magnitude; two copies with different units, one shown per species. */
const bParam = (unit: string, electron: boolean): NumberParam => ({
  kind: 'number',
  label: 'ch28.p.B',
  desc: 'ch28.d.B',
  group: 'main',
  live: true,
  control: 'slider',
  min: 0.5,
  max: 2,
  step: 0.05,
  default: 1,
  unit,
  visibleIf: (p) => (p.particle === 'electron') === electron,
});

const params: ParamSchema<P> = {
  particle: {
    kind: 'select',
    label: 'ch28.p.particle',
    desc: 'ch28.d.particle',
    group: 'main',
    live: false,
    default: 'proton',
    options: [
      { value: 'proton', label: 'ch28.pt.proton' },
      { value: 'electron', label: 'ch28.pt.electron' },
      { value: 'alpha', label: 'ch28.pt.alpha' },
    ],
  },
  Be: bParam('mT', true),
  Bi: bParam('T', false),
  compare: { kind: 'toggle', label: 'ch28.p.compare', desc: 'ch28.d.compare', group: 'advanced', live: false, default: true },
  v: {
    kind: 'number',
    label: 'ch28.p.v',
    desc: 'ch28.d.v',
    group: 'advanced',
    live: false,
    control: 'slider',
    min: 1,
    max: 3,
    step: 0.1,
    default: 3,
    unit: '×10⁶ m/s',
    visibleIf: (p) => !p.compare,
  },
};

const cm = (k: Kin): Vec2 => ({ x: k.x * 100, y: k.y * 100 });

export const lorentzScene: Scene<P, S> = {
  id: 'lorentz',
  title: 'ch28.scene.lorentz',
  params,
  time: { h: 1 / RATE, recordEvery: 4, frameStep: 0.05, unit: 'ns' },

  world: (p) => {
    const R = viewR(p);
    const pos = ptOf(p).q > 0;
    return { x: [-1.15 * R, 1.15 * R], y: pos ? [-0.3 * R, 2.12 * R] : [-2.12 * R, 0.3 * R], aspect: 'contain', padPx: 16 };
  },

  init: (p) => ({
    t: 0,
    n: 0,
    ps: speeds(p).map((v) => ({ x: 0, y: 0, vx: v, vy: 0 })),
    trails: speeds(p).map(() => [0, 0]),
  }),

  step: (s, h, p) => {
    const dtNs = h * nsPerSec(p);
    const pt = ptOf(p);
    const Bz = -Bof(p);
    s.n += 1;
    s.t += dtNs;
    s.ps.forEach((k, i) => {
      gyrate(k, pt, Bz, dtNs * 1e-9);
      if (s.n % 2 === 0) {
        const tr = s.trails[i];
        tr.push(k.x, k.y);
        // Keep a little more than one full turn at the current field, so the circle always closes.
        const keep = Math.ceil((1.08 * period(pt, Bof(p)) * 1e9) / (2 * dtNs)) + 2;
        if (tr.length > 2 * keep) tr.splice(0, tr.length - 2 * keep);
      }
    });
  },

  draw: (g, s, p) => {
    const R = viewR(p);
    const pt = ptOf(p);
    const pos = pt.q > 0;
    // The field fills the whole visible stage.
    const [wx0, wy1] = g.vp.toWorld(0, 0);
    const [wx1, wy0] = g.vp.toWorld(g.vp.w, g.vp.h);
    fieldGrid(g, wx0, wx1, wy0, wy1, 64);

    // Source at the launch point.
    g.polygon(
      [
        { x: -0.11 * R, y: -g.px(5) },
        { x: -g.px(9), y: -g.px(5) },
        { x: -g.px(9), y: g.px(5) },
        { x: -0.11 * R, y: g.px(5) },
      ],
      { fill: '#8a8a8a' },
    );

    s.trails.forEach((tr) => {
      const pts: Vec2[] = [];
      for (let i = 0; i < tr.length; i += 2) pts.push({ x: tr[i] * 100, y: tr[i + 1] * 100 });
      g.polyline(pts, { role: 'position', width: 1.5, alpha: 0.55 });
    });

    const B = Bof(p);
    const kV = (0.28 * R) / (3 * M);
    const Fref = Math.abs(pt.q) * 3 * M * unitB(p);
    const kF = (0.28 * R) / Fref;
    const last = s.ps.length - 1;
    const arrows = s.ps.map((k) => {
      const c = cm(k);
      const [fx0, fy0] = lorentz(k, pt, -B);
      // F ∝ vB while r ∝ v/B: at high B the arrow would reach past the centre. Cap it at 0.7 r
      // (the cap scales with v too, so the three speeds keep their ratio).
      const rCm = radius(pt, Math.hypot(k.vx, k.vy), B) * 100;
      const f = Math.min(1, (0.7 * rCm) / Math.max(1e-30, Math.hypot(fx0, fy0) * kF));
      return { c, v: { x: k.vx * kV, y: k.vy * kV }, F: { x: fx0 * f * kF, y: fy0 * f * kF } };
    });
    arrows.forEach((a, i) => {
      g.arrow(a.c, a.v, { role: 'velocity', width: 2.25, label: i === last ? '*v*' : undefined });
      g.arrow(a.c, a.F, { role: 'force', width: 2.25 });
    });
    // F label beside the fastest particle's F arrow: of the spots at either side of its middle and
    // beyond its tip, the one farthest from every particle and arrow.
    const m = arrows[last];
    const fl = Math.hypot(m.F.x, m.F.y) || 1;
    const u = { x: m.F.x / fl, y: m.F.y / fl };
    const mid = { x: m.c.x + m.F.x / 2, y: m.c.y + m.F.y / 2 };
    const off = g.px(13);
    const cands: Vec2[] = [
      { x: mid.x - u.y * off, y: mid.y + u.x * off },
      { x: mid.x + u.y * off, y: mid.y - u.x * off },
      { x: m.c.x + m.F.x + u.x * off, y: m.c.y + m.F.y + u.y * off },
    ];
    const marks: Vec2[] = [];
    for (const a of arrows)
      for (let j = 0; j <= 6; j++) {
        marks.push({ x: a.c.x + (a.v.x * j) / 6, y: a.c.y + (a.v.y * j) / 6 });
        if (a !== m) marks.push({ x: a.c.x + (a.F.x * j) / 6, y: a.c.y + (a.F.y * j) / 6 });
      }
    const clear = (q: Vec2) => Math.min(...marks.map((k) => Math.hypot(k.x - q.x, k.y - q.y)));
    const at = cands.reduce((b, q) => (clear(q) > clear(b) + g.px(1) ? q : b));
    g.text(at, '*F*', { size: 13, role: 'force', align: 'center', baseline: 'middle' });
    for (const a of arrows) particle(g, a.c, pos, 7);
  },

  readouts: [
    { label: 'r', unit: 'cm', value: (s, p) => radius(ptOf(p), Math.hypot(s.ps[s.ps.length - 1].vx, s.ps[s.ps.length - 1].vy), Bof(p)) * 100 },
    { label: 'T', unit: 'ns', value: (_s, p) => period(ptOf(p), Bof(p)) * 1e9 },
  ],

  info: {
    goals: ['ch28.l.goal.perp', 'ch28.l.goal.T'],
    observe: ['ch28.l.obs.perp', 'ch28.l.obs.r', 'ch28.l.obs.T', 'ch28.l.obs.sign', 'ch28.l.obs.B'],
    equations: ['\\vec F = q\\vec v \\times \\vec B', 'r = \\frac{mv}{\\lvert q\\rvert B}, \\quad T = \\frac{2\\pi m}{\\lvert q\\rvert B}'],
    assumptions: ['ch28.l.assume'],
  },
};
