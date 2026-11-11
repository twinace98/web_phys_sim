// Ch 32 scene: a lattice of atomic moments in an external field B. Paramagnet: independent
// moments, B against thermal agitation. Ferromagnet: neighbours tend to align, domains,
// hysteresis, remanence, Curie temperature. Diamagnet: small induced moments opposite to B.
import type { ParamSchema, Scene } from '../../core/types';
import type { Draw } from '../../draw/draw';
import type { Rng } from '../../core/rng';
import { color, theme } from '../../draw/theme';
import { Inset } from '../inset/inset';
import { TC, magnetization, randomLattice, sweep, wolff, type Lattice } from './physics';

type P = { mat: string; T: number; field: string };

interface S {
  t: number;
  L: Lattice;
  rng: Rng;
  B: number;
  M: number;
  /** Recent (B, M) pairs, flat. */
  trail: number[];
}

const NX = 36;
const NY = 24;
const CELL = 0.5;
const W = NX * CELL;
const H = NY * CELL;
/** Field amplitude in units of the neighbour coupling, sweep period in lattice sweeps. */
const B0 = 3.5;
const PERIOD = 300;
const TRAIL = 2 * PERIOD;
/** Diamagnetic response, exaggerated so it can be seen: M/M_s = −CHI B/B0. */
export const CHI = 0.3;
/**
 * Ferromagnet at or above T_C: lattice updates (Metropolis sweep + Wolff cluster) per field
 * step, so M follows B in near-equilibrium and the dynamic loop of a finite sweep rate closes.
 */
export const RELAX = 20;
const UP = color('position');
const DOWN = color('velocity');

const narrow = () => typeof window !== 'undefined' && window.matchMedia('(max-width: 767px)').matches;
/** M-B graph right of the lattice, or under it on narrow screens. */
const plotRect = () => (narrow() ? { x0: 2.8, y0: -10.6, x1: 17.2, y1: -1.9 } : { x0: 22.5, y0: 1.5, x1: 31, y1: 10.5 });

const params: ParamSchema<P> = {
  mat: {
    kind: 'select',
    label: 'ch32.m.p.mat',
    desc: 'ch32.m.d.mat',
    group: 'main',
    live: false,
    default: 'ferro',
    options: [
      { value: 'para', label: 'ch32.m.mat.para' },
      { value: 'ferro', label: 'ch32.m.mat.ferro' },
      { value: 'dia', label: 'ch32.m.mat.dia' },
    ],
  },
  T: {
    kind: 'number',
    label: 'ch32.m.p.T',
    desc: 'ch32.m.d.T',
    group: 'main',
    live: true,
    control: 'slider',
    min: 0.2,
    max: 2,
    step: 0.05,
    default: 0.5,
    visibleIf: (p) => p.mat !== 'dia',
  },
  field: {
    kind: 'select',
    label: 'ch32.m.p.field',
    desc: 'ch32.m.d.field',
    group: 'advanced',
    live: true,
    default: 'sweep',
    options: [
      { value: 'sweep', label: 'ch32.m.field.sweep' },
      { value: 'on', label: 'ch32.m.field.on' },
      { value: 'off', label: 'ch32.m.field.off' },
    ],
  },
};

/** External field at sweep count t, in units of the coupling J. */
export function fieldAt(mode: string, t: number): number {
  if (mode === 'on') return B0 / 2;
  if (mode === 'off') return 0;
  return B0 * Math.sin((2 * Math.PI * t) / PERIOD);
}

function stepMagnet(s: S, h: number, p: P): void {
  const t0 = s.t;
  s.t += h;
  s.B = fieldAt(p.field, s.t);
  if (p.mat === 'dia') s.M = (-CHI * s.B) / B0;
  else {
    const T = Math.max(0.05, p.T * TC);
    const rnd = () => s.rng.next();
    if (p.mat === 'ferro' && p.T >= 0.999) {
      for (let k = 1; k <= RELAX; k++) {
        const b = fieldAt(p.field, t0 + (k / RELAX) * h);
        sweep(s.L, 1, b, T, rnd);
        wolff(s.L, 1, b, T, rnd);
      }
    } else sweep(s.L, p.mat === 'ferro' ? 1 : 0, s.B, T, rnd);
    s.M = magnetization(s.L);
  }
  s.trail.push(s.B, s.M);
  if (s.trail.length > 2 * TRAIL) s.trail.splice(0, s.trail.length - 2 * TRAIL);
}

/** Moment of site i along B, as drawn (arrow length ∝ it): ±1 for a lattice moment, M/M_s for the diamagnet. */
export const momentAt = (s: S, p: P, i: number): number => (p.mat === 'dia' ? s.M : s.L.s[i]);

/** All moments as short arrows, batched into one path per direction. */
function drawMoments(g: Draw, s: S, p: P): void {
  const ctx = g.ctx;
  const k = g.vp.scale * CELL;
  const head = Math.min(5 * theme.scale, k * 0.28);
  const paths = { up: new Path2D(), down: new Path2D() };
  const dots = new Path2D();
  for (let j = 0; j < NY; j++) {
    for (let i = 0; i < NX; i++) {
      const [cx, cy] = g.vp.toPx((i + 0.5) * CELL, (j + 0.5) * CELL);
      const m = momentAt(s, p, j * NX + i);
      const half = 0.36 * k * Math.abs(m);
      if (half < 0.6) {
        dots.moveTo(cx + 1.5, cy);
        dots.arc(cx, cy, 1.5, 0, 2 * Math.PI);
        continue;
      }
      const dir = m > 0 ? -1 : 1; // canvas y points down
      const path = m > 0 ? paths.up : paths.down;
      const tip = cy + dir * half;
      const hd = Math.min(head, 2 * half);
      // A short arrow keeps a readable head width: a small wedge pointing along the moment.
      const hw = 0.55 * Math.max(hd, Math.min(head, 4 * theme.scale));
      if (hd < 2 * half) {
        path.moveTo(cx, cy - dir * half);
        path.lineTo(cx, tip - dir * hd * 0.5);
      }
      path.moveTo(cx, tip);
      path.lineTo(cx - hw, tip - dir * hd);
      path.lineTo(cx + hw, tip - dir * hd);
      path.closePath();
    }
  }
  ctx.save();
  ctx.lineWidth = 1.6 * theme.scale;
  ctx.lineJoin = 'round';
  for (const [key, col] of [
    ['up', UP],
    ['down', DOWN],
  ] as const) {
    ctx.strokeStyle = col;
    ctx.fillStyle = col;
    ctx.stroke(paths[key]);
    ctx.fill(paths[key]);
  }
  ctx.fillStyle = '#b5b5b5';
  ctx.fill(dots);
  ctx.restore();
}

export const magnet: Scene<P, S> = {
  id: 'materials',
  title: 'ch32.m.scene',
  params,
  time: { h: 1, recordEvery: 10, frameStep: 10, scale: 40, unit: '' },
  world: () =>
    narrow() ? { x: [-2.6, W + 0.6], y: [-11.9, H + 0.6], aspect: 'contain', padPx: 12 } : { x: [-2.6, 31.6], y: [-0.6, H + 0.6], aspect: 'contain', padPx: 14 },
  init: (_p, rng) => ({ t: 0, L: randomLattice(NX, NY, () => rng.next()), rng, B: 0, M: 0, trail: [0, 0] }),
  step: stepMagnet,

  draw: (g, s, p) => {
    g.polygon(
      [
        { x: 0, y: 0 },
        { x: W, y: 0 },
        { x: W, y: H },
        { x: 0, y: H },
      ],
      { fill: '#fafafa', color: '#d0d0d0', width: 1 },
    );
    drawMoments(g, s, p);

    // External field beside the lattice, length ∝ B.
    const bl = (s.B / B0) * (H / 2 - 0.6);
    g.line({ x: -1.4, y: 0.4 }, { x: -1.4, y: H - 0.4 }, { color: '#e2e2e2', width: 1 });
    if (Math.abs(bl) > g.px(4)) g.arrow({ x: -1.4, y: H / 2 - bl }, { x: 0, y: 2 * bl }, { role: 'field', width: 3.5 });
    g.text({ x: -1.4, y: H / 2 }, '*B*', { size: 15, role: 'field', align: 'right', baseline: 'middle', dx: -10 });

    // M against B: the hysteresis loop of the ferromagnet.
    const ins = new Inset(g, plotRect(), [-B0 * 1.1, B0 * 1.1], [-1.15, 1.15]);
    ins.frame({ cross: true, yTicks: [-1, 1], yFmt: (v) => (v > 0 ? '*M*_{s}' : '−*M*_{s}'), xLabel: '*B*', yLabel: '*M*' });
    const pts: [number, number][] = [];
    for (let i = 0; i < s.trail.length; i += 2) pts.push([s.trail[i], s.trail[i + 1]]);
    ins.curve(pts, { role: 'fg', width: 1.75 });
    ins.dot(s.B, s.M, '#1a1a1a', 5);
  },

  readouts: [
    { label: 'M/M_\\text{s}', unit: '', value: (s) => s.M, sig: 2 },
    { label: 'B/B_\\text{max}', unit: '', value: (s) => s.B / B0, sig: 2 },
  ],

  info: {
    goals: ['ch32.m.goal.compete', 'ch32.m.goal.ferro'],
    observe: ['ch32.m.obs.domains', 'ch32.m.obs.loop', 'ch32.m.obs.para', 'ch32.m.obs.curie', 'ch32.m.obs.dia'],
    equations: ['M = \\frac{\\mu_\\text{total}}{V}', 'M = C\\,\\frac{B_\\text{ext}}{T}'],
    assumptions: ['ch32.m.assume.model', 'ch32.m.assume.units', 'ch32.m.assume.relax', 'ch32.m.assume.dia'],
  },
};
