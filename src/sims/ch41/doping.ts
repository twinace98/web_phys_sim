// Ch 41 scene: doped silicon. Donor or acceptor levels near the band edges, the Fermi level from
// charge neutrality, and the carrier densities against temperature (freeze-out, extrinsic,
// intrinsic).
import type { ParamSchema, Scene } from '../../core/types';
import { ROLE_COLOR } from '../../draw/theme';
import { Frame, PX_WORLD, TICK, canvasBox, linePx, pow10, split, textPx } from '../modern/frame';
import { ELECTRON, HOLE, bandBox, edgeSlots, electron, hole } from './common';
import { EA, ED, SI, carriers, ni, type Carriers } from './physics';

type P = { type: string; T: number; conc: number };

const Y: [number, number] = [-0.55, SI.Eg + 0.55];
const SITES = 8;
const T_MIN = 30;
const T_MAX = 800;
const NI_COLOR = '#8c8c8c';

const params: ParamSchema<P> = {
  type: {
    kind: 'select',
    label: 'ch41.d.p.type',
    desc: 'ch41.d.d.type',
    group: 'main',
    live: true,
    default: 'n',
    options: [
      { value: 'i', label: 'ch41.type.i' },
      { value: 'n', label: 'ch41.type.n' },
      { value: 'p', label: 'ch41.type.p' },
    ],
  },
  T: {
    kind: 'number',
    label: 'ch41.p.T',
    desc: 'ch41.d.T',
    group: 'main',
    live: true,
    control: 'slider',
    min: 50,
    max: 800,
    step: 10,
    default: 300,
    unit: 'K',
  },
  conc: {
    kind: 'number',
    label: 'ch41.d.p.conc',
    desc: 'ch41.d.d.conc',
    group: 'advanced',
    live: true,
    control: 'slider',
    log: true,
    sig: 2,
    min: 1e15,
    max: 1e17,
    default: 1e16,
    unit: 'cm⁻³',
    visibleIf: (p) => p.type !== 'i',
  },
};

const concOf = (p: P) => p.conc;
const dopants = (p: P): [number, number] => [p.type === 'n' ? concOf(p) : 0, p.type === 'p' ? concOf(p) : 0];
export const carriersOf = (p: P, T = p.T): Carriers => carriers(T, ...dopants(p));

const curveCache = new Map<string, { T: number; n: number; p: number; ni: number }[]>();
function curves(p: P) {
  const key = `${p.type}|${p.conc}`;
  let c = curveCache.get(key);
  if (!c) {
    c = [];
    for (let T = T_MIN; T <= T_MAX; T += 5) {
      const q = carriersOf(p, T);
      c.push({ T, n: q.n, p: q.p, ni: ni(SI, T) });
    }
    if (curveCache.size > 30) curveCache.clear();
    curveCache.set(key, c);
  }
  return c;
}

/** Charged dopant: a ring with its sign. */
function ion(g: Parameters<Scene['draw']>[0], f: Frame, x: number, E: number, sign: '+' | '−'): void {
  const c = sign === '+' ? ROLE_COLOR.positive : ROLE_COLOR.negative;
  g.circle(f.P(x, E), 6, { fill: '#ffffff', color: c, width: 1.5 });
  g.text(f.P(x, E), sign, { size: 11, color: c, align: 'center', baseline: 'middle' });
}

export const doping: Scene<P, { t: number }> = {
  id: 'doping',
  title: 'ch41.d.scene',
  params,
  world: PX_WORLD,
  init: () => ({ t: 0 }),

  draw: (g, _s, p) => {
    const q = carriersOf(p);
    const wide = g.vp.w > g.vp.h * 1.1;
    const o = canvasBox(g);
    const [boxA, boxB] = split({ l: o.l + 52, t: o.t + 30, r: o.r - 30, b: o.b - 36 }, wide, wide ? 0.42 : 0.5, wide ? 90 : 56);
    const ref = concOf(p);
    const [Nd, Na] = dopants(p);

    // ---- band diagram (energies from E_v)
    const f = new Frame(g, boxA, [0, 1], Y);
    const x0 = 0.06;
    const x1 = 0.94;
    const Ec = SI.Eg;
    f.clip(() => {
      bandBox(f, x0, x1, Y[0] - 1, 0);
      bandBox(f, x0, x1, Ec, Y[1] + 1);
    });
    const show = (v: number) => Math.min(16, Math.round((SITES * v) / ref));
    const nShow = show(q.n);
    const pShow = show(q.p);
    f.clip(() => {
      for (const [x, E] of edgeSlots(f, nShow, x0, x1, Ec, true)) electron(g, f, x, E);
      for (const [x, E] of edgeSlots(f, pShow, x0, x1, 0, false)) hole(g, f, x, E);
    });
    const siteX = (i: number) => x0 + ((i + 0.5) / SITES) * (x1 - x0);
    if (Nd > 0) {
      const Edl = Ec - ED;
      f.line(x0, Edl, x1, Edl, { color: ELECTRON, width: 1, dash: [4, 3] });
      const k = Math.round((SITES * q.Dp) / Nd);
      for (let i = 0; i < SITES; i++) {
        if (i < k) ion(g, f, siteX(i), Edl, '+');
        else electron(g, f, siteX(i), Edl);
      }
    }
    if (Na > 0) {
      const Eal = EA;
      f.line(x0, Eal, x1, Eal, { color: HOLE, width: 1, dash: [4, 3] });
      const k = Math.round((SITES * q.Am) / Na);
      for (let i = 0; i < SITES; i++) {
        if (i < k) ion(g, f, siteX(i), Eal, '−');
        else g.circle(f.P(siteX(i), Eal), 3, { fill: '#9a9a9a' });
      }
    }
    // Fermi level.
    const yF = f.Y(q.mu);
    linePx(g, boxA.l, yF, boxA.r, yF, { color: '#1a1a1a', width: 1.25, dash: [6, 4] });
    textPx(g, boxA.r + 4, yF, '*E*_{F}', { size: 13, color: TICK, baseline: 'middle' });
    textPx(g, boxA.l - 6, f.Y(Ec), '*E*_{c}', { size: 13, color: TICK, align: 'right', baseline: 'middle' });
    textPx(g, boxA.l - 6, f.Y(0), '*E*_{v}', { size: 13, color: TICK, align: 'right', baseline: 'middle' });

    // ---- n, p against T (log scale)
    const fr = new Frame(g, boxB, [0, T_MAX], [1e2, 1e20], { y: true });
    const c = curves(p);
    fr.clip(() => {
      const pick = (k: 'n' | 'p' | 'ni') => c.map((r) => [r.T, Math.max(r[k], 1)] as [number, number]);
      fr.polyline(pick('ni'), { color: NI_COLOR, width: 1.5, dash: [2, 3] });
      fr.polyline(pick('p'), { color: HOLE, width: 2, dash: [6, 4] });
      fr.polyline(pick('n'), { color: ELECTRON, width: 2 });
      fr.line(p.T, 1e2, p.T, 1e20, { color: '#9a9a9a', width: 1 });
      if (q.n > 1e2) g.circle(fr.P(p.T, q.n), 4.5, { fill: ELECTRON });
      if (q.p > 1e2) g.circle(fr.P(p.T, q.p), 4.5, { fill: HOLE });
    });
    fr.axes({
      xLabel: '*T* (K)',
      yLabel: '(cm^{−3})',
      yTicks: [1e5, 1e10, 1e15, 1e20],
      yFmt: (v) => pow10(Math.round(Math.log10(v))),
    });
    // Legend, bottom left inside the plot (cold and dilute: no curve there).
    const lx = boxB.l + 14;
    const items: [string, string, number[] | undefined][] = [
      ['*n*', ELECTRON, undefined],
      ['*p*', HOLE, [6, 4]],
      ['*n*_{i}', NI_COLOR, [2, 3]],
    ];
    items.forEach(([s, col, dash], i) => {
      const y = boxB.b - 62 + i * 17;
      linePx(g, lx, y, lx + 24, y, { color: col, width: 2, dash });
      textPx(g, lx + 30, y, s, { size: 13, color: col, baseline: 'middle' });
    });
  },

  readouts: [
    { label: 'n', unit: 'cm⁻³', value: (_s, p) => carriersOf(p).n, zeroTol: 0 },
    { label: 'p', unit: 'cm⁻³', value: (_s, p) => carriersOf(p).p, zeroTol: 0 },
  ],

  info: {
    goals: ['ch41.d.goal.dope', 'ch41.d.goal.T'],
    observe: ['ch41.d.obs.n', 'ch41.d.obs.p', 'ch41.d.obs.freeze', 'ch41.d.obs.intr', 'ch41.d.obs.law'],
    equations: ['n\\,p = n_i^2', 'n + N_A^- = p + N_D^+'],
    assumptions: ['ch41.d.assume.si', 'ch41.d.assume.dots', 'ch41.d.assume.stat'],
  },
};
