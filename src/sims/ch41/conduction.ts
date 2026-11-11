// Ch 41 scene: conduction in E(k). An electric field shifts the occupied states in k; scattering
// stops the shift at −eEτ/ħ. A partly filled band then carries a net current, a full band none.
import { t } from '../../core/i18n';
import type { ParamSchema, Scene } from '../../core/types';
import { Frame, PX_WORLD, TICK, canvasBox, textPx } from '../modern/frame';
import { ELECTRON } from './common';
import { bandE, current, kGrid, occupied, shiftStep, wrap, type Filling } from './physics';

type P = { fill: string; field: number };
interface S {
  t: number;
  n: number;
  /** Rigid shift of the occupied states, in units of 1/a. */
  d: number;
}

const H = 0.05; // fs
/** Drive F = eEa/ħ [1/fs] at field strength 1; the steady shift is −Fτ. */
export const DRIVE = 0.04;
const EMPTY = '#b5b5b5';

const params: ParamSchema<P> = {
  fill: {
    kind: 'select',
    label: 'ch41.c.p.fill',
    desc: 'ch41.c.d.fill',
    group: 'main',
    live: false,
    default: 'half',
    options: [
      { value: 'half', label: 'ch41.fill.half' },
      { value: 'nearly', label: 'ch41.fill.nearly' },
      { value: 'full', label: 'ch41.fill.full' },
    ],
  },
  field: {
    kind: 'number',
    label: 'ch41.c.p.field',
    desc: 'ch41.c.d.field',
    group: 'main',
    live: true,
    control: 'slider',
    min: 0,
    max: 1,
    step: 0.05,
    default: 1,
  },
};

const occCache = new Map<string, number[]>();
const occ = (f: string) => {
  let v = occCache.get(f);
  if (!v) {
    v = occupied(f as Filling);
    occCache.set(f, v);
  }
  return v;
};

const PI_LABELS: [number, string][] = [
  [-Math.PI, '−π/*a*'],
  [-Math.PI / 2, '−π/2*a*'],
  [0, '0'],
  [Math.PI / 2, 'π/2*a*'],
  [Math.PI, 'π/*a*'],
];

export const conduction: Scene<P, S> = {
  id: 'conduction',
  title: 'ch41.c.scene',
  layout: 'side',
  params,
  world: PX_WORLD,
  time: { h: H, recordEvery: 4, frameStep: 1, window: 60, scale: 10, unit: 'fs' },
  init: () => ({ t: 0, n: 0, d: 0 }),
  step: (s, h, p) => {
    s.n += 1;
    s.t = s.n * H;
    s.d = shiftStep(s.d, DRIVE * p.field, h);
  },
  record: (s, p) => ({ t: s.t, J: current(occ(p.fill), s.d) }),
  snapshot: (s) => ({ ...s }),

  draw: (g, s, p) => {
    const o = canvasBox(g);
    const box = { l: o.l + 52, t: o.t + 46, r: o.r - 20, b: o.b - 40 };
    const f = new Frame(g, box, [-Math.PI * 1.14, Math.PI * 1.14], [-2.5, 2.5]);
    // Zone boundaries.
    for (const k of [-Math.PI, Math.PI]) f.line(k, -2.5, k, 2.5, { color: '#c8c8c8', width: 1, dash: [3, 4] });
    const pts: [number, number][] = [];
    for (let i = 0; i <= 200; i++) {
      const k = -Math.PI + (2 * Math.PI * i) / 200;
      pts.push([k, bandE(k)]);
    }
    f.polyline(pts, { color: '#5c5c5c', width: 1.5 });
    const ks = kGrid();
    const set = new Set(occ(p.fill));
    // Empty states stay on the grid; occupied ones move rigidly by d.
    ks.forEach((k, j) => {
      if (set.has(j) && Math.abs(s.d) < 1e-9) return;
      g.circle(f.P(k, bandE(k)), 4, { fill: '#ffffff', color: EMPTY, width: 1.25 });
    });
    for (const j of set) {
      const k = wrap(ks[j] + s.d);
      g.circle(f.P(k, bandE(k)), 5, { fill: ELECTRON });
    }
    f.axes({
      yLabel: '*E* (eV)',
      xTicks: PI_LABELS.map(([k]) => k),
      xFmt: (v) => PI_LABELS.find(([k]) => Math.abs(k - v) < 1e-9)?.[1] ?? '',
      xAtZero: false,
    });
    textPx(g, box.r, box.b - 6, '*k*', { size: 12, color: TICK, align: 'right' });
    // Field direction (electrons are pushed the other way).
    const F = p.field;
    if (F > 0) {
      const cx = (box.l + box.r) / 2;
      const len = 20 + 50 * F;
      g.arrow(f.P(f.xAt(cx - len / 2), f.yAt(o.t + 22)), { x: g.px(len), y: 0 }, { role: 'field', width: 2.5 });
      textPx(g, cx + len / 2 + 10, o.t + 22, t('ch41.c.p.field'), { size: 13, color: '#8c8c8c', baseline: 'middle' });
    }
  },

  plots: [
    {
      id: 'J',
      label: 'J\\;(\\text{arb.})',
      traces: [{ channel: 'J', role: 'position' }],
      yRange: () => [-0.05, 0.2],
    },
  ],

  readouts: [
    { label: '\\Delta k', unit: '1/a', value: (s) => s.d, sig: 2 },
    { label: 'J', unit: '', value: (s, p) => current(occ(p.fill), s.d), sig: 2 },
  ],

  info: {
    goals: ['ch41.c.goal.shift', 'ch41.c.goal.full'],
    observe: ['ch41.c.obs.half', 'ch41.c.obs.full', 'ch41.c.obs.nearly', 'ch41.c.obs.off', 'ch41.c.obs.v'],
    equations: ['\\hbar\\frac{dk}{dt} = -eE - \\frac{\\hbar\\,\\Delta k}{\\tau}', 'v = \\frac{1}{\\hbar}\\frac{dE}{dk}, \\quad J = -e\\sum_\\text{occ} v'],
    assumptions: ['ch41.c.assume.band', 'ch41.c.assume.shift', 'ch41.c.assume.spin'],
  },
};

