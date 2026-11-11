// Ch 35 scene: a plane wave passes two slits; the 2D wave behind them interferes and the
// screen records the time-averaged intensity, building up bright and dark fringes.
import type { ParamSchema, Scene } from '../../core/types';
import { fmt } from '../../core/format';
import { ROLE_COLOR } from '../../draw/theme';
import { boxText } from '../inset/inset';
import type { Aperture } from '../wave2d/field';
import { wavelengthRGB } from '../wave2d/field';
import {
  H_FS,
  STRIP,
  Y0,
  Y1,
  clampY,
  dimLine,
  drawBarrier,
  drawMarker,
  drawScreen,
  fieldFor,
  initSlit,
  relIntensity,
  slitEnd,
  stepSlit,
  worldOf,
  type SlitState,
} from '../wave2d/slits';
import { drawWave } from '../wave2d/view';
import { brightAt, pathDiff } from './physics';

type P = { d: number; lambda: number; D: number; a: number; yp: number };

const apsOf = (p: P): Aperture[] => [
  { yc: p.d / 2, w: p.a },
  { yc: -p.d / 2, w: p.a },
];
const field = (p: P) => fieldFor(p.lambda, apsOf(p), p.D);

/**
 * First bright fringe above the centre (ΔL = λ exactly, the maximum the wave field shows):
 * the Δy mark and readout. λD/d is its small-angle limit and differs by up to 13 % at the
 * slider extremes (λ = 700 nm, d = 1.5 μm).
 */
export const firstBright = (p: P) => brightAt(1, p.lambda / 1000, p.d, p.D);

const params: ParamSchema<P> = {
  d: {
    kind: 'number',
    label: 'ch35.p.d',
    desc: 'ch35.d.d',
    group: 'main',
    live: false,
    control: 'slider',
    min: 1.5,
    max: 5,
    step: 0.1,
    default: 3,
    unit: 'μm',
  },
  lambda: {
    kind: 'number',
    label: 'ch35.p.lambda',
    desc: 'ch35.d.lambda',
    group: 'main',
    live: false,
    control: 'slider',
    min: 400,
    max: 700,
    step: 10,
    default: 500,
    unit: 'nm',
  },
  D: {
    kind: 'number',
    label: 'ch35.p.D',
    desc: 'ch35.d.D',
    group: 'advanced',
    live: false,
    control: 'slider',
    min: 12,
    max: 25,
    step: 1,
    default: 20,
    unit: 'μm',
  },
  a: {
    kind: 'number',
    label: 'ch35.p.a',
    desc: 'ch35.d.a',
    group: 'advanced',
    live: false,
    control: 'slider',
    min: 0,
    max: 1.5,
    step: 0.1,
    default: 0,
    unit: 'μm',
  },
  // Screen point for the path-difference construction; default: first bright fringe.
  yp: {
    kind: 'number',
    label: 'ch35.p.yp',
    desc: 'ch35.d.yp',
    group: 'hidden',
    live: true,
    control: 'slider',
    min: -11.5,
    max: 11.5,
    default: Math.round(brightAt(1, 0.5, 3, 20) * 20) / 20,
  },
};

export const doubleSlit: Scene<P, SlitState> = {
  id: 'double',
  title: 'ch35.scene',
  params,
  time: { h: H_FS, recordEvery: 20, frameStep: 1, scale: 10, unit: 'fs', tEnd: (p) => slitEnd(field(p as P), (p as P).D) },
  world: (p) => worldOf(p.D),
  init: () => initSlit(),
  step: (s, h, p) => stepSlit(s, h, field(p)),

  draw: (g, s, p) => {
    const f = field(p);
    const rgb = wavelengthRGB(p.lambda);
    const aps = apsOf(p);
    drawWave(g, f, s.t, rgb);
    drawBarrier(g, aps);
    const I = relIntensity(s, f);
    const inset = drawScreen(g, p.D, f, I, rgb);

    // Fringe spacing beside the graph: from the central maximum to the first bright fringe
    // (omitted when that fringe lies beyond the screen).
    const dy = firstBright(p);
    if (dy < Y1) {
      const bx = inset.r.x1 + 0.9;
      for (const y of [0, dy]) g.line({ x: inset.r.x0, y }, { x: bx, y }, { color: '#b5b5b5', width: 1, dash: [3, 4] });
      dimLine(g, { x: bx, y: 0 }, { x: bx, y: dy }, 'Δ*y*', 20, 0);
    }

    dimLine(g, { x: -1.1, y: -p.d / 2 }, { x: -1.1, y: p.d / 2 }, '*d*', -16, 0);
    dimLine(g, { x: 0, y: Y0 - 1.2 }, { x: p.D, y: Y0 - 1.2 }, '*D*', 0, 0);

    // Paths from both slits to the marked screen point.
    const P0 = { x: p.D, y: p.yp };
    g.line({ x: 0, y: p.d / 2 }, P0, { color: ROLE_COLOR.position, width: 1.75 });
    g.line({ x: 0, y: -p.d / 2 }, P0, { color: ROLE_COLOR.energyU, width: 1.75 });
    drawMarker(g, p.D, p.yp);
    const n = pathDiff(p.d, p.D, p.yp) / (p.lambda / 1000);
    boxText(g, P0, `Δ*L* = ${fmt(n, 3)} *λ*`, { size: 13, align: 'right', dx: -14, dy: p.yp > 9 ? 16 : -16 });
  },

  handles: [
    {
      pos: (_s, p) => ({ x: p.D + STRIP / 2, y: p.yp }),
      radiusPx: 14,
      onDrag: (ctx, _s, w) => {
        const y = clampY(w.y);
        if (y !== ctx.params.yp) ctx.set('yp', y);
      },
    },
  ],

  readouts: [
    { label: '\\Delta y', unit: 'μm', value: (_s, p) => firstBright(p) },
    { label: '\\Delta L/\\lambda', unit: '', value: (_s, p) => pathDiff(p.d, p.D, p.yp) / (p.lambda / 1000) },
  ],

  info: {
    goals: ['ch35.goal.path', 'ch35.goal.spacing'],
    observe: ['ch35.obs.build', 'ch35.obs.marker', 'ch35.obs.nodal', 'ch35.obs.lambda', 'ch35.obs.d', 'ch35.obs.width'],
    equations: [
      '\\Delta L = d\\sin\\theta',
      'd\\sin\\theta = m\\lambda \\;\\; (I_\\text{max}), \\quad d\\sin\\theta = (m + \\tfrac12)\\lambda \\;\\; (I = 0)',
      '\\Delta y \\approx \\frac{\\lambda D}{d} \\quad (\\Delta y \\ll D)',
    ],
    assumptions: ['ch35.assume.model', 'ch35.assume.scale', 'ch35.assume.colour'],
  },
};
