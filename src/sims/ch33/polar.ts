// Ch 33 scene: unpolarized light through two (or three) polarizers. The E oscillation
// direction is drawn end-on between the elements; Malus's law in a graph below.
import { fmt } from '../../core/format';
import type { ParamSchema, Scene, Vec2 } from '../../core/types';
import type { Draw } from '../../draw/draw';
import { ROLE_COLOR } from '../../draw/theme';
import { Inset, TICK } from '../inset/inset';
import { polarizerChain } from './physics';

type P = { n: number; theta: number };

const DEG = Math.PI / 180;
const BY = 2.6; // beam height
const R = 1.4; // polarizer radius
const RE = 0.72; // end-on E indicator radius
const XS = 0.7; // source
const XD = 21.6; // detector
const PLOT = { x0: 4.5, y0: -7.6, x1: 19, y1: -2.2 };
const BEAM = ROLE_COLOR.highlight;

const params: ParamSchema<P> = {
  n: {
    kind: 'number',
    label: 'ch33.p.n',
    desc: 'ch33.d.n',
    group: 'main',
    live: true,
    control: 'slider',
    min: 2,
    max: 3,
    step: 1,
    default: 2,
  },
  theta: {
    kind: 'number',
    label: 'ch33.p.theta',
    desc: 'ch33.d.theta',
    group: 'main',
    live: true,
    control: 'slider',
    min: 0,
    max: 180,
    step: 1,
    default: 30,
    unit: '°',
  },
};

interface Layout {
  /** Polarizer x positions and axis angles (rad, from vertical). */
  xs: number[];
  axes: number[];
  /** Index of the polarizer turned by θ. */
  dial: number;
}

function layout(p: P): Layout {
  const th = p.theta * DEG;
  return p.n === 3 ? { xs: [5.5, 10.9, 16.3], axes: [0, th, 90 * DEG], dial: 1 } : { xs: [6.4, 14], axes: [0, th], dial: 1 };
}

/** Intensities on each beam segment (source first), relative to I0. */
export function segments(p: P): number[] {
  return [1, ...polarizerChain(1, layout(p).axes)];
}

/** Transmitted fraction after the first polarizer as a function of the dial angle. */
export function afterFirst(n: number, th: number): number {
  return n === 3 ? Math.cos(th) ** 2 * Math.cos(90 * DEG - th) ** 2 : Math.cos(th) ** 2;
}

const dir = (a: number): Vec2 => ({ x: Math.sin(a), y: Math.cos(a) });

function polarizer(g: Draw, x: number, a: number, label: string, knob: boolean): void {
  const pts: Vec2[] = [];
  for (let k = 0; k <= 48; k++) pts.push({ x: x + R * Math.cos((k / 48) * 2 * Math.PI), y: BY + R * Math.sin((k / 48) * 2 * Math.PI) });
  g.polygon(pts, { fill: '#f2f2f2', fillAlpha: 0.92, color: '#5c5c5c', width: 1.25 });
  const d = dir(a);
  const n = { x: -d.y, y: d.x };
  for (let o = -1.05; o <= 1.06; o += 0.35) {
    const h = Math.sqrt(R * R - o * o);
    g.line({ x: x + n.x * o - d.x * h, y: BY + n.y * o - d.y * h }, { x: x + n.x * o + d.x * h, y: BY + n.y * o + d.y * h }, { color: '#c4c4c4', width: 1 });
  }
  g.line({ x: x - d.x * R, y: BY - d.y * R }, { x: x + d.x * R, y: BY + d.y * R }, { color: '#1a1a1a', width: 2.5 });
  if (knob) g.circle({ x: x + d.x * R, y: BY + d.y * R }, 7, { fill: '#ffffff', color: '#1a1a1a', width: 2 });
  g.text({ x, y: BY - R }, label, { size: 14, align: 'center', dy: 20 });
}

/** End-on view of the E oscillation: one double arrow, or a star for unpolarized light. */
function eView(g: Draw, x: number, I: number, a: number | null): void {
  const c = { x, y: BY };
  const ring: Vec2[] = [];
  for (let k = 0; k <= 40; k++) ring.push({ x: x + RE * Math.cos((k / 40) * 2 * Math.PI), y: BY + RE * Math.sin((k / 40) * 2 * Math.PI) });
  g.polygon(ring, { fill: '#ffffff', color: '#9a9a9a', width: 1, dash: [2, 3] });
  const L = 0.78 * RE * Math.sqrt(I);
  const both = (b: number) => {
    const d = dir(b);
    if (L < g.px(3)) return;
    g.arrow(c, { x: d.x * L, y: d.y * L }, { role: 'fg', width: 2 });
    g.arrow(c, { x: -d.x * L, y: -d.y * L }, { role: 'fg', width: 2 });
  };
  if (a === null) for (const b of [0, 45, 90, 135]) both(b * DEG);
  else both(a);
  const txt = I > 0.9999 ? '*I*_{0}' : `${fmt(I, 3)} *I*_{0}`;
  g.text({ x, y: BY - RE }, txt, { size: 13, align: 'center', dy: 18 });
}

export const polar: Scene<P, { t: number }> = {
  id: 'polar',
  title: 'ch33.scene.polar',
  params,
  world: () => ({ x: [-0.4, 23], y: [-9, 4.8], aspect: 'contain', padPx: 14 }),
  init: () => ({ t: 0 }),

  draw: (g, _s, p) => {
    const L = layout(p);
    const I = segments(p);
    const stops = [XS, ...L.xs, XD];
    // Beam: opacity follows the intensity of each segment.
    for (let k = 0; k < stops.length - 1; k++) {
      if (I[k] < 1e-4) continue;
      g.polygon(
        [
          { x: stops[k], y: BY - 0.32 },
          { x: stops[k + 1], y: BY - 0.32 },
          { x: stops[k + 1], y: BY + 0.32 },
          { x: stops[k], y: BY + 0.32 },
        ],
        { fill: BEAM, fillAlpha: 0.15 + 0.85 * I[k] },
      );
    }
    g.circle({ x: XS, y: BY }, 16, { fill: BEAM, color: '#b0a000', width: 1.5 });
    g.polygon(
      [
        { x: XD, y: BY - 1.1 },
        { x: XD + 0.6, y: BY - 1.1 },
        { x: XD + 0.6, y: BY + 1.1 },
        { x: XD, y: BY + 1.1 },
      ],
      { fill: '#3a3a3a' },
    );
    const last = I[I.length - 1];
    if (last > 1e-4) {
      g.polygon(
        [
          { x: XD, y: BY - 0.32 },
          { x: XD + 0.6, y: BY - 0.32 },
          { x: XD + 0.6, y: BY + 0.32 },
          { x: XD, y: BY + 0.32 },
        ],
        { fill: BEAM, fillAlpha: Math.min(1, 0.2 + last * 1.6) },
      );
    }

    // E indicators in the middle of each gap, then the polarizers on top of the beam.
    for (let k = 0; k < stops.length - 1; k++) {
      eView(g, (stops[k] + stops[k + 1]) / 2, I[k], k === 0 ? null : L.axes[k - 1]);
    }
    L.xs.forEach((x, k) => polarizer(g, x, L.axes[k], `*P*_{${k + 1}}`, k === L.dial));
    // Dial angle between the first axis (vertical) and the turned one.
    const xd = L.xs[L.dial];
    const a = L.axes[L.dial];
    g.line({ x: xd, y: BY }, { x: xd, y: BY + R + 0.5 }, { color: TICK, width: 1, dash: [3, 3] });
    if (a > 0.5 * DEG) g.arc({ x: xd, y: BY }, 26, Math.PI / 2, Math.PI / 2 - a, { color: TICK, width: 1.25 });
    g.text({ x: xd, y: BY + R }, `*θ* = ${Math.round(p.theta)}°`, { size: 13, color: TICK, align: 'right', dx: -8, dy: -4 });

    // Malus's law: output relative to the light after P1.
    const ins = new Inset(g, PLOT, [0, 180], [0, 1.1]);
    ins.frame({ xTicks: [0, 45, 90, 135, 180], yTicks: [0, 0.5, 1], xLabel: '*θ* (°)', yLabel: '*I*/*I*_{1}' });
    const pts: [number, number][] = [];
    for (let k = 0; k <= 180; k++) pts.push([k, afterFirst(p.n, k * DEG)]);
    ins.curve(pts, { role: 'fg', width: 1.75 });
    ins.dot(p.theta, afterFirst(p.n, p.theta * DEG), '#1a1a1a', 5.5);
  },

  handles: [
    {
      pos: (_s, p) => {
        const L = layout(p);
        const d = dir(L.axes[L.dial]);
        return { x: L.xs[L.dial] + d.x * R, y: BY + d.y * R };
      },
      radiusPx: 14,
      onDrag: (ctx, _s, w) => {
        const L = layout(ctx.params);
        let a = Math.atan2(w.x - L.xs[L.dial], w.y - BY) / DEG;
        a = ((Math.round(a) % 180) + 180) % 180;
        if (a !== ctx.params.theta) ctx.set('theta', a);
      },
    },
  ],

  readouts: [
    { label: 'I/I_1', unit: '', value: (_s, p) => afterFirst(p.n, p.theta * DEG) },
    { label: 'I/I_0', unit: '', value: (_s, p) => segments(p).at(-1)! },
  ],

  info: {
    goals: ['ch33.p.goal.malus', 'ch33.p.goal.three'],
    observe: ['ch33.p.obs.half', 'ch33.p.obs.dial', 'ch33.p.obs.cross', 'ch33.p.obs.three'],
    equations: ['I_1 = \\tfrac12 I_0', 'I = I_1\\cos^2\\theta'],
    assumptions: ['ch33.p.assume.ideal'],
  },
};
