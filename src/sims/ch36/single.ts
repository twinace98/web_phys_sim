// Ch 36 scene: a plane wave passes one slit of width a. Huygens sources across the slit
// interfere behind it; the screen records the time-averaged intensity.
import { fmt } from '../../core/format';
import type { ParamSchema, Scene, Vec2 } from '../../core/types';
import { ROLE_COLOR } from '../../draw/theme';
import { boxText } from '../inset/inset';
import { wavelengthRGB, type Aperture } from '../wave2d/field';
import {
  H_FS,
  STRIP,
  Y0,
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
import { firstMin } from './physics';

type P = { a: number; lambda: number; D: number; yp: number };

/** Huygens sources drawn in the slit (the field itself uses a finer division). */
export const N_SHOW = 10;
const DEG = 180 / Math.PI;

const apsOf = (p: P): Aperture[] => [{ yc: 0, w: p.a }];
const field = (p: P) => fieldFor(p.lambda, apsOf(p), p.D);

/** Heights of the drawn sources, top first. */
export const shownSources = (a: number) => Array.from({ length: N_SHOW }, (_, i) => a / 2 - ((i + 0.5) * a) / N_SHOW);

const params: ParamSchema<P> = {
  a: {
    kind: 'number',
    label: 'ch36.p.a',
    desc: 'ch36.d.a',
    group: 'main',
    live: false,
    control: 'slider',
    min: 0.5,
    max: 6,
    step: 0.1,
    default: 2,
    unit: 'μm',
  },
  lambda: {
    kind: 'number',
    label: 'ch36.p.lambda',
    desc: 'ch36.d.lambda',
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
    label: 'ch36.p.D',
    desc: 'ch36.d.D',
    group: 'advanced',
    live: false,
    control: 'slider',
    min: 15,
    max: 30,
    step: 1,
    default: 25,
    unit: 'μm',
  },
  // Screen point for the source-pair construction; default: first minimum.
  yp: {
    kind: 'number',
    label: 'ch36.p.yp',
    desc: 'ch36.d.yp',
    group: 'hidden',
    live: true,
    control: 'slider',
    min: -11.5,
    max: 11.5,
    default: Math.round(25 * Math.tan(firstMin(0.5, 2)) * 20) / 20,
  },
};

/** Path difference of the pair (top source, source half a slit below it) to the screen point, in λ. */
export function pairDiff(p: P): number {
  const ys = shownSources(p.a);
  const r = (y: number) => Math.hypot(p.D, p.yp - y);
  return (r(ys[N_SHOW / 2]) - r(ys[0])) / (p.lambda / 1000);
}

export const singleSlit: Scene<P, SlitState> = {
  id: 'single',
  title: 'ch36.s.scene',
  params,
  time: { h: H_FS, recordEvery: 20, frameStep: 1, scale: 10, unit: 'fs', tEnd: (p) => slitEnd(field(p as P), (p as P).D) },
  world: (p) => worldOf(p.D),
  init: () => initSlit(),
  step: (s, h, p) => stepSlit(s, h, field(p)),

  draw: (g, s, p) => {
    const f = field(p);
    const rgb = wavelengthRGB(p.lambda);
    drawWave(g, f, s.t, rgb);
    drawBarrier(g, apsOf(p));
    const inset = drawScreen(g, p.D, f, relIntensity(s, f), rgb);

    // First minima a sin θ = λ, as screen heights.
    const th = firstMin(p.lambda / 1000, p.a);
    const y1 = p.D * Math.tan(th);
    const bx = inset.r.x1 + 0.9;
    if (Number.isFinite(y1) && y1 < 11.5) {
      for (const y of [-y1, 0, y1]) g.line({ x: inset.r.x0, y }, { x: y === 0 ? bx : inset.r.x1, y }, { color: '#b5b5b5', width: 1, dash: [3, 4] });
      dimLine(g, { x: bx, y: 0 }, { x: bx, y: y1 }, '*y*_{1}', 20, 0);
    }

    dimLine(g, { x: -1.1, y: -p.a / 2 }, { x: -1.1, y: p.a / 2 }, '*a*', -16, 0);
    dimLine(g, { x: 0, y: Y0 - 1.2 }, { x: p.D, y: Y0 - 1.2 }, '*D*', 0, 0);

    // Huygens sources: upper half blue, lower half orange; the pair (top, half a slit below) to the point.
    const ys = shownSources(p.a);
    const P0: Vec2 = { x: p.D, y: p.yp };
    g.line({ x: 0, y: ys[0] }, P0, { color: ROLE_COLOR.position, width: 1.5 });
    g.line({ x: 0, y: ys[N_SHOW / 2] }, P0, { color: ROLE_COLOR.energyU, width: 1.5 });
    const r = Math.max(2, Math.min(4, g.vp.scale * (p.a / N_SHOW) * 0.35));
    ys.forEach((y, i) => {
      const pair = i === 0 || i === N_SHOW / 2;
      g.circle({ x: 0.1, y }, pair ? r + 1.5 : r, { fill: i < N_SHOW / 2 ? 'position' : 'energyU', color: '#ffffff', width: 1 });
    });
    drawMarker(g, p.D, p.yp);
    boxText(g, P0, `Δ*L* = ${fmt(pairDiff(p), 2)} *λ*`, { size: 13, align: 'right', dx: -14, dy: p.yp > 9 ? 16 : -16 });
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
    { label: '\\theta_1', unit: '°', value: (_s, p) => firstMin(p.lambda / 1000, p.a) * DEG },
    { label: '\\Delta L/\\lambda', unit: '', value: (_s, p) => pairDiff(p), sig: 2 },
  ],

  info: {
    goals: ['ch36.s.goal.cause', 'ch36.s.goal.min'],
    observe: ['ch36.s.obs.build', 'ch36.s.obs.pair', 'ch36.s.obs.narrow', 'ch36.s.obs.wide', 'ch36.s.obs.lambda'],
    equations: ['a\\sin\\theta = m\\lambda \\;\\; (I = 0,\\; m = \\pm1, \\pm2, \\dots)', '\\Delta L = \\tfrac{a}{2}\\sin\\theta = \\tfrac{\\lambda}{2} \\;\\Rightarrow\\; a\\sin\\theta = \\lambda'],
    assumptions: ['ch36.s.assume.model', 'ch36.s.assume.scale', 'ch36.s.assume.sources'],
  },
};
