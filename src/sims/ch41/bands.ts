// Ch 41 scene: band formation. N identical wells; every single-well level splits into N
// levels, which fill the allowed bands of the infinite chain (Kronig-Penney) as N grows.
import type { ParamSchema, Scene } from '../../core/types';
import { ROLE_COLOR } from '../../draw/theme';
import { Frame, PX_WORLD, TICK, canvasBox, linePx, rectPx, split, textPx } from '../modern/frame';
import { A, U0, chainLevels, kpBands } from './physics';

type P = { N: number; b: number };

const NS = [1, 2, 3, 4, 6, 8, 12];
const Y: [number, number] = [0, 5.5];
const BAND_FILL = '#e3eef7';
const LEVEL = '#1a1a1a';
const HILITE = '#fbf6c4';

const params: ParamSchema<P> = {
  N: {
    kind: 'number',
    label: 'ch41.b.p.N',
    desc: 'ch41.b.d.N',
    group: 'main',
    live: true,
    control: 'stepper',
    min: 1,
    max: 12,
    step: 1,
    default: 8,
  },
  b: {
    kind: 'number',
    label: 'ch41.b.p.b',
    desc: 'ch41.b.d.b',
    group: 'main',
    live: true,
    control: 'slider',
    min: 0.1,
    max: 0.5,
    step: 0.02,
    default: 0.1,
    unit: 'nm',
  },
};

const levelCache = new Map<string, number[]>();
export function levels(N: number, b: number): number[] {
  const k = `${N}|${b}`;
  let v = levelCache.get(k);
  if (!v) {
    v = chainLevels(N, b);
    levelCache.set(k, v);
  }
  return v;
}

const bandCache = new Map<number, [number, number][]>();
export function bands(b: number): [number, number][] {
  let v = bandCache.get(b);
  if (!v) {
    v = kpBands(b);
    bandCache.set(b, v);
  }
  return v;
}

/** Gap between the first two bands of the infinite chain [eV]. */
export const gapOf = (b: number) => {
  const bs = bands(b);
  return bs.length > 1 ? bs[1][0] - bs[0][1] : NaN;
};

export const bandsScene: Scene<P, { t: number }> = {
  id: 'bands',
  title: 'ch41.b.scene',
  params,
  world: PX_WORLD,
  init: () => ({ t: 0 }),

  draw: (g, _s, p) => {
    const wide = g.vp.w > g.vp.h * 1.1;
    const outer = canvasBox(g);
    const [boxA, boxB] = split({ l: outer.l + 48, t: outer.t + 30, r: outer.r - 16, b: outer.b - 36 }, wide, wide ? 0.62 : 0.55, wide ? 70 : 60);
    const bs = bands(p.b);
    const Es = levels(p.N, p.b);

    // ---- chain: U(x) and its levels
    const span = p.N * A + (p.N - 1) * p.b;
    const half = Math.max(span / 2 + 0.6, 1.2);
    const f = new Frame(g, boxA, [-half, half], Y);
    f.clip(() => {
      for (const [e0, e1] of bs) f.polygon([[-half, e0], [half, e0], [half, e1], [-half, e1]], { fill: BAND_FILL, fillAlpha: 0.7 });
      const pts: [number, number][] = [];
      const left = -span / 2;
      pts.push([-half, U0]);
      for (let i = 0; i < p.N; i++) {
        const x0 = left + i * (A + p.b);
        pts.push([x0, U0], [x0, 0], [x0 + A, 0], [x0 + A, U0]);
      }
      pts.push([half, U0]);
      f.polygon([[-half, 0], ...pts, [half, 0]], { fill: ROLE_COLOR.energyU, fillAlpha: 0.1 });
      f.polyline(pts, { role: 'energyU', width: 2 });
      for (const E of Es) f.line(left, E, -left, E, { color: LEVEL, width: 1 });
    });
    f.axes({ xLabel: '*x* (nm)', yLabel: '*E* (eV)' });

    // ---- levels against the number of wells, ending in the bands of the infinite chain
    const Ns = NS.includes(p.N) ? NS : [...NS, p.N].sort((a, b) => a - b);
    const cols = [...Ns, Infinity];
    const fc = new Frame(g, boxB, [0, cols.length], Y);
    const cx = (i: number) => fc.X(i + 0.5);
    const half2 = Math.min(18, ((boxB.r - boxB.l) / cols.length) * 0.36);
    const iCur = Ns.indexOf(p.N);
    rectPx(g, { l: cx(iCur) - half2 - 5, r: cx(iCur) + half2 + 5, t: boxB.t, b: boxB.b }, { fill: HILITE });
    fc.clip(() => {
      for (const [e0, e1] of bs) fc.polygon([[0, e0], [cols.length, e0], [cols.length, e1], [0, e1]], { fill: BAND_FILL, fillAlpha: 0.7 });
    });
    Ns.forEach((N, i) => {
      for (const E of levels(N, p.b)) linePx(g, cx(i) - half2, fc.Y(E), cx(i) + half2, fc.Y(E), { color: LEVEL, width: 1 });
    });
    const iInf = cols.length - 1;
    for (const [e0, e1] of bs) {
      rectPx(g, { l: cx(iInf) - half2, r: cx(iInf) + half2, t: fc.Y(e1), b: fc.Y(e0) }, { fill: LEVEL, fillAlpha: 0.75 });
    }
    // Band gap between the first two bands.
    if (bs.length > 1) {
      const xg = cx(iInf) + half2 + 8;
      const y0 = fc.Y(bs[0][1]);
      const y1 = fc.Y(bs[1][0]);
      linePx(g, xg, y0, xg, y1, { color: TICK, width: 1.25 });
      linePx(g, xg - 4, y0, xg + 4, y0, { color: TICK, width: 1.25 });
      linePx(g, xg - 4, y1, xg + 4, y1, { color: TICK, width: 1.25 });
      textPx(g, xg - 4, (y0 + y1) / 2, '*E*_{g}', { size: 13, color: TICK, align: 'right', baseline: 'middle', dx: -2 });
    }
    linePx(g, boxB.l, boxB.b, boxB.r, boxB.b, { role: 'axis', width: 1 });
    linePx(g, boxB.l, boxB.t, boxB.l, boxB.b, { role: 'axis', width: 1 });
    cols.forEach((N, i) => textPx(g, cx(i), boxB.b + 15, Number.isFinite(N) ? String(N) : '∞', { size: 11, color: TICK, align: 'center' }));
    textPx(g, boxB.r, boxB.b - 6, '*N*', { size: 12, color: TICK, align: 'right' });
  },

  readouts: [
    { label: 'E_\\text{g}', unit: 'eV', value: (_s, p) => gapOf(p.b) },
    { label: 'W_1', unit: 'eV', value: (_s, p) => bands(p.b)[0][1] - bands(p.b)[0][0] },
  ],

  info: {
    goals: ['ch41.b.goal.split', 'ch41.b.goal.gap'],
    observe: ['ch41.b.obs.two', 'ch41.b.obs.N', 'ch41.b.obs.b', 'ch41.b.obs.upper'],
    equations: ['N \\text{ wells} \\;\\to\\; N \\text{ levels per band}', '\\cos qd = \\cos ka\\cosh\\kappa b + \\frac{\\kappa^2 - k^2}{2k\\kappa}\\sin ka\\sinh\\kappa b'],
    assumptions: ['ch41.b.assume.model', 'ch41.b.assume.kp'],
  },
};
