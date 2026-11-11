// Ch 39 scenes: bound states of 1D wells drawn as an energy diagram (U(x), levels, ψ or |ψ|²),
// and the time evolution of a two-state superposition.
import { fmt } from '../../core/format';
import type { ParamSchema, Scene } from '../../core/types';
import type { Draw } from '../../draw/draw';
import { ROLE_COLOR } from '../../draw/theme';
import { Frame, PX_WORLD, linePx, textPx, type Box } from '../modern/frame';
import { allowed, wellModel, type WellKind, type WellModel, type WellParams } from './physics';

type Common = { pot: string; L: number; U0: number; hw: number; Ub: number; b: number };
type PW = Common & { show: string };
type PS = Common & { pair: string };

/** ħ in eV·fs. */
export const HBAR_EVFS = 0.6582119569;

const PSI = ROLE_COLOR.position;
const LEVEL = '#1a1a1a';
const FORBID = '#9a9a9a';

/** live: the static wells scene follows changes at once; the superposition scene restarts. */
const common = (live: boolean): ParamSchema<Common> => ({
  pot: {
    kind: 'select',
    label: 'ch39.p.pot',
    desc: 'ch39.d.pot',
    group: 'main',
    live,
    default: 'infinite',
    options: [
      { value: 'infinite', label: 'ch39.pot.infinite' },
      { value: 'finite', label: 'ch39.pot.finite' },
      { value: 'harmonic', label: 'ch39.pot.harmonic' },
      { value: 'double', label: 'ch39.pot.double' },
    ],
  },
  L: {
    kind: 'number',
    label: 'ch39.p.L',
    desc: 'ch39.d.L',
    group: 'advanced',
    live,
    control: 'slider',
    min: 0.5,
    max: 1.5,
    step: 0.05,
    default: 1,
    unit: 'nm',
    visibleIf: (p) => p.pot !== 'harmonic',
  },
  U0: {
    kind: 'number',
    label: 'ch39.p.U0',
    desc: 'ch39.d.U0',
    group: 'advanced',
    live,
    control: 'slider',
    min: 0.5,
    max: 4.5,
    step: 0.1,
    default: 2,
    unit: 'eV',
    visibleIf: (p) => p.pot === 'finite',
  },
  hw: {
    kind: 'number',
    label: 'ch39.p.hw',
    desc: 'ch39.d.hw',
    group: 'advanced',
    live,
    control: 'slider',
    min: 0.1,
    max: 0.5,
    step: 0.01,
    default: 0.2,
    unit: 'eV',
    visibleIf: (p) => p.pot === 'harmonic',
  },
  Ub: {
    kind: 'number',
    label: 'ch39.p.Ub',
    desc: 'ch39.d.Ub',
    group: 'advanced',
    live,
    control: 'slider',
    min: 0.5,
    max: 4.5,
    step: 0.1,
    default: 2,
    unit: 'eV',
    visibleIf: (p) => p.pot === 'double',
  },
  b: {
    kind: 'number',
    label: 'ch39.p.b',
    desc: 'ch39.d.b',
    group: 'advanced',
    live,
    control: 'slider',
    min: 0.05,
    max: 0.5,
    step: 0.01,
    default: 0.2,
    unit: 'nm',
    visibleIf: (p) => p.pot === 'double',
  },
});

const toWell = (p: Common): WellParams => ({ kind: p.pot as WellKind, L: p.L, U0: p.U0, hw: p.hw, Ub: p.Ub, b: p.b });

// Solving takes a few ms: cache by parameters.
const cache = new Map<string, WellModel>();
export function model(p: Common): WellModel {
  const w = toWell(p);
  const key = `${w.kind}|${w.L}|${w.U0}|${w.hw}|${w.Ub}|${w.b}`;
  let m = cache.get(key);
  if (!m) {
    m = wellModel(w);
    if (cache.size > 40) cache.clear();
    cache.set(key, m);
  }
  return m;
}

/** Plot box for the energy diagram: room on the right for level labels. */
function diagramBox(g: Draw, labels: boolean): Box {
  const w = g.vp.w;
  const narrow = w < 640;
  return { l: 50, t: 30, r: w - (labels ? (narrow ? 70 : 118) : 20), b: g.vp.h - 34 };
}

/** U(x) with the region under it shaded; hard walls run to the top of the axis. */
function drawPotential(f: Frame, m: WellModel): void {
  const [x0, x1] = f.xr;
  const top = f.yr[1];
  const pts: [number, number][] = [];
  const N = 1200;
  for (let i = 0; i <= N; i++) {
    const x = x0 + ((x1 - x0) * i) / N;
    const inBox = x >= m.pot.x0 && x <= m.pot.x1;
    pts.push([x, inBox ? Math.min(m.pot.U(x), top) : top]);
  }
  f.clip(() => {
    f.polygon([[x0, f.yr[0]], ...pts, [x1, f.yr[0]]], { fill: ROLE_COLOR.energyU, fillAlpha: 0.1 });
    f.polyline(pts, { role: 'energyU', width: 2.25 });
    for (const xw of m.walls) f.line(xw, f.yr[0], xw, top, { role: 'energyU', width: 3 });
  });
}

/** Level line: solid where E ≥ U (classically allowed), dotted where E < U. */
function drawLevel(f: Frame, m: WellModel, E: number, st: { color?: string; width?: number; alpha?: number } = {}): void {
  const lo = Math.max(f.xr[0], m.pot.x0);
  const hi = Math.min(f.xr[1], m.pot.x1);
  f.line(lo, E, hi, E, { color: FORBID, width: 1, dash: [2, 3], alpha: st.alpha ?? 1 });
  for (const [a, b] of allowed(m.pot, E, lo, hi)) f.line(a, E, b, E, { color: st.color ?? LEVEL, width: st.width ?? 1.25, alpha: st.alpha ?? 1 });
}

/**
 * Labels to the right of the frame, one per level. A label that would overlap the one below
 * is pushed up and joined to its level by a short leader.
 */
function levelLabels(f: Frame, items: { E: number; text: string; color?: string }[]): void {
  const g = f.g;
  let prev = Infinity;
  for (const it of items) {
    const y0 = f.Y(it.E);
    const y = Math.min(y0, prev - 14);
    prev = y;
    const x = f.box.r + 6;
    if (Math.abs(y - y0) > 1) linePx(g, f.box.r, y0, x + 2, y, { color: FORBID, width: 1 });
    textPx(g, x + 4, y, it.text, { size: 12, color: it.color ?? LEVEL, baseline: 'middle' });
  }
}

/** Vertical size of the wavefunction drawings [eV]: below the typical level spacing. */
function amplitude(Es: number[], span: number): number {
  if (Es.length < 2) return 0.09 * span;
  const gaps = Es.slice(1).map((E, i) => E - Es[i]);
  const med = [...gaps].sort((a, b) => a - b)[Math.floor(gaps.length / 2)];
  const typical = Math.min(...gaps.filter((d) => d >= 0.3 * med));
  return Math.min(0.42 * typical, 0.09 * span);
}

const label = (n: number, E: number, narrow: boolean) => (narrow ? `${fmt(E, 3)} eV` : `*E*_{${n}} = ${fmt(E, 3)} eV`);

// ------------------------------------------------------------------ wells

const wellParams: ParamSchema<PW> = {
  ...common(true),
  show: {
    kind: 'select',
    label: 'ch39.p.show',
    desc: 'ch39.d.show',
    group: 'main',
    live: true,
    default: 'psi',
    options: [
      { value: 'psi', label: 'ch39.show.psi' },
      { value: 'prob', label: 'ch39.show.prob' },
    ],
  },
};

export const wells: Scene<PW, { t: number }> = {
  id: 'wells',
  title: 'ch39.scene.wells',
  params: wellParams,
  world: PX_WORLD,
  init: () => ({ t: 0 }),

  draw: (g, _s, p) => {
    const m = model(p);
    const narrow = g.vp.w < 640;
    const f = new Frame(g, diagramBox(g, true), m.xr, m.yr);
    drawPotential(f, m);
    const { st } = m;
    const span = m.yr[1] - m.yr[0];
    const A = amplitude(st.E, span);
    const prob = p.show === 'prob';
    // Upper member of a close pair (double well): dashed, so both partners stay readable.
    const gaps = st.E.slice(1).map((E, i) => E - st.E[i]);
    const med = [...gaps].sort((a, b) => a - b)[Math.floor(gaps.length / 2)] ?? 0;
    const partner = (k: number) => k > 0 && gaps[k - 1] < 0.3 * med;
    // ψ in units of its own maximum, so every state is drawn the same height.
    f.clip(() => {
      st.E.forEach((E, k) => {
        drawLevel(f, m, E);
        const psi = st.psi[k];
        let mx = 0;
        for (const v of psi) mx = Math.max(mx, Math.abs(v));
        const pts: [number, number][] = [];
        const stride = Math.max(1, Math.floor(psi.length / 700));
        for (let i = 0; i < psi.length; i += stride) {
          const x = st.x[i];
          if (x < f.xr[0] || x > f.xr[1]) continue;
          const u = psi[i] / mx;
          pts.push([x, E + (prob ? 1.6 * A * u * u : A * u)]);
        }
        if (prob) {
          f.polygon([[pts[0][0], E], ...pts, [pts[pts.length - 1][0], E]], { fill: PSI, fillAlpha: 0.22 });
          f.polyline(pts, { color: PSI, width: 1.5, dash: partner(k) ? [5, 4] : undefined });
        } else {
          f.polyline(pts, { color: PSI, width: 1.75, dash: partner(k) ? [5, 4] : undefined });
        }
      });
    });
    f.axes({ xLabel: '*x* (nm)', yLabel: '*E* (eV)' });
    levelLabels(
      f,
      st.E.map((E, k) => ({ E, text: label(k + m.n0, E, narrow) })),
    );
  },

  info: {
    goals: ['ch39.w.goal.quant', 'ch39.w.goal.shape'],
    observe: ['ch39.w.obs.inf', 'ch39.w.obs.fin', 'ch39.w.obs.harm', 'ch39.w.obs.double', 'ch39.w.obs.nodes'],
    equations: [
      'E_n = \\frac{h^2}{8mL^2}\\,n^2 \\quad (\\text{infinite well})',
      'E_n = \\left(n + \\tfrac{1}{2}\\right)\\hbar\\omega \\quad (\\text{harmonic})',
      '-\\frac{\\hbar^2}{2m}\\frac{d^2\\psi}{dx^2} + U(x)\\,\\psi = E\\,\\psi',
    ],
    assumptions: ['ch39.assume.electron', 'ch39.assume.fd', 'ch39.assume.amp'],
  },
};

// ------------------------------------------------------------------ superposition

const supParams: ParamSchema<PS> = {
  ...common(false),
  pair: {
    kind: 'select',
    label: 'ch39.p.pair',
    desc: 'ch39.d.pair',
    group: 'main',
    live: false,
    default: '12',
    options: [
      { value: '12', label: 'ch39.pair.12' },
      { value: '13', label: 'ch39.pair.13' },
      { value: '23', label: 'ch39.pair.23' },
    ],
  },
};

interface Sup {
  a: number;
  b: number;
  /** ΔE/ħ [1/fs]; 0 when only one state exists. */
  w: number;
  /** ⟨x⟩ = xm + xc cos(ωt). */
  xm: number;
  xc: number;
}

/** The two states to superpose (falls back to lower states when the well holds fewer). */
export function supStates(m: WellModel, pair: string): Sup {
  const n = m.st.E.length;
  let a = Number(pair[0]) - 1;
  let b = Number(pair[1]) - 1;
  if (b >= n) {
    b = n - 1;
    a = Math.min(a, b - 1);
  }
  if (a < 0) a = 0;
  const { st } = m;
  const pa = st.psi[a];
  const pb = st.psi[b];
  let xa = 0;
  let xb = 0;
  let xab = 0;
  for (let i = 0; i < st.x.length; i++) {
    xa += st.x[i] * pa[i] * pa[i];
    xb += st.x[i] * pb[i] * pb[i];
    xab += st.x[i] * pa[i] * pb[i];
  }
  const single = a === b;
  return { a, b, w: single ? 0 : (st.E[b] - st.E[a]) / HBAR_EVFS, xm: single ? xa * st.dx : 0.5 * (xa + xb) * st.dx, xc: single ? 0 : xab * st.dx };
}

const supOf = (p: PS) => supStates(model(p), p.pair);

export const superposition: Scene<PS, { t: number; n: number }> = {
  id: 'superposition',
  title: 'ch39.scene.sup',
  layout: 'side',
  params: supParams,
  world: PX_WORLD,
  time: { h: 0.005, recordEvery: 4, frameStep: 0.1, window: 40, scale: 2, unit: 'fs' },
  init: () => ({ t: 0, n: 0 }),
  step: (s) => {
    s.n += 1;
    s.t = s.n * 0.005;
  },
  record: (s, p) => {
    const q = supOf(p);
    return { t: s.t, xm: q.xm + q.xc * Math.cos(q.w * s.t) };
  },
  snapshot: (s) => ({ ...s }),

  draw: (g, s, p) => {
    const m = model(p);
    const q = supStates(m, p.pair);
    const { st } = m;
    const narrow = g.vp.w < 640;
    const f = new Frame(g, diagramBox(g, true), m.xr, m.yr);
    drawPotential(f, m);
    const span = m.yr[1] - m.yr[0];
    const Ea = st.E[q.a];
    const Eb = st.E[q.b];
    const Em = q.a === q.b ? Ea : 0.5 * (Ea + Eb);
    const c = Math.cos(q.w * s.t);
    const pa = st.psi[q.a];
    const pb = st.psi[q.b];
    const single = q.a === q.b;
    // |Ψ|² = ½(ψa² + ψb² + 2ψaψb cos ωt); scaled by its largest value over a period.
    const dens = (i: number, cc: number) => (single ? pa[i] ** 2 : 0.5 * (pa[i] ** 2 + pb[i] ** 2 + 2 * pa[i] * pb[i] * cc));
    let mx = 0;
    for (let i = 0; i < st.x.length; i++) mx = Math.max(mx, dens(i, 1), dens(i, -1));
    const H = 0.24 * span;
    f.clip(() => {
      st.E.forEach((E, k) => {
        const on = k === q.a || k === q.b;
        drawLevel(f, m, E, on ? {} : { alpha: 0.35, width: 1 });
      });
      const pts: [number, number][] = [];
      const stride = Math.max(1, Math.floor(st.x.length / 700));
      for (let i = 0; i < st.x.length; i += stride) {
        const x = st.x[i];
        if (x < f.xr[0] || x > f.xr[1]) continue;
        pts.push([x, Em + (H * dens(i, c)) / mx]);
      }
      f.line(f.xr[0], Em, f.xr[1], Em, { color: PSI, width: 1, dash: [4, 4], alpha: 0.6 });
      f.polygon([[pts[0][0], Em], ...pts, [pts[pts.length - 1][0], Em]], { fill: PSI, fillAlpha: 0.22 });
      f.polyline(pts, { color: PSI, width: 1.75 });
      const xm = q.xm + q.xc * c;
      g.circle(f.P(xm, Em), 6, { fill: 'position' });
    });
    f.axes({ xLabel: '*x* (nm)', yLabel: '*E* (eV)' });
    const items = st.E.map((E, k) => ({ E, k })).filter(({ k }) => k === q.a || k === q.b);
    levelLabels(
      f,
      items.map(({ E, k }) => ({ E, text: label(k + m.n0, E, narrow) })),
    );
  },

  plots: [
    {
      id: 'xm',
      label: '\\langle x\\rangle\\,(\\mathrm{nm})',
      traces: [{ channel: 'xm', role: 'position' }],
      yRange: (p) => {
        const m = model(p);
        const q = supStates(m, p.pair);
        const r = Math.max(Math.abs(q.xc) * 1.25, 0.1);
        return [q.xm - r, q.xm + r];
      },
    },
  ],

  readouts: [
    { label: 'T', unit: 'fs', value: (_s, p) => (supOf(p).w > 0 ? (2 * Math.PI) / supOf(p).w : NaN) },
    { label: '\\langle x\\rangle', unit: 'nm', value: (s, p) => supOf(p).xm + supOf(p).xc * Math.cos(supOf(p).w * s.t) },
  ],

  info: {
    goals: ['ch39.s.goal.osc', 'ch39.s.goal.period'],
    observe: ['ch39.s.obs.slosh', 'ch39.s.obs.parity', 'ch39.s.obs.tunnel', 'ch39.s.obs.stationary'],
    equations: [
      '\\Psi(x,t) = \\tfrac{1}{\\sqrt2}\\left(\\psi_a e^{-iE_at/\\hbar} + \\psi_b e^{-iE_bt/\\hbar}\\right)',
      '|\\Psi|^2 = \\tfrac12\\left(\\psi_a^2 + \\psi_b^2 + 2\\psi_a\\psi_b\\cos\\frac{(E_b - E_a)t}{\\hbar}\\right)',
      'T = \\frac{h}{E_b - E_a}',
    ],
    assumptions: ['ch39.assume.electron', 'ch39.assume.fd', 'ch39.assume.supamp'],
  },
};
