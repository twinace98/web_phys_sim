// Ch 39 scenes: bound states of 1D wells drawn as an energy diagram (U(x), levels, ψ or |ψ|²),
// and the time evolution of a two-state superposition.
import { fmt } from '../../core/format';
import { INPUT_SIG, num, tn, u } from '../../core/tex';
import type { ParamSchema, ParamSpec, Scene } from '../../core/types';
import type { Draw } from '../../draw/draw';
import { ROLE_COLOR } from '../../draw/theme';
import { HB2M } from '../modern/eigen';
import { Frame, PX_WORLD, TICK, linePx, textPx, type Box } from '../modern/frame';
import { allowed, finiteWellCount, wellModel, z0Of, type WellKind, type WellModel, type WellParams } from './physics';

type Common = { pot: string; L: number; U0: number; hw: number; Ub: number; b: number };
type PW = Common & { show: string };
type PS = Common & { pair: string; pairH: string };

/** ħ in eV·fs. */
export const HBAR_EVFS = 0.6582119569;

const PSI = ROLE_COLOR.position;
const LEVEL = '#1a1a1a';
const FORBID = '#9a9a9a';

/**
 * live: the static wells scene follows changes at once; the superposition scene restarts.
 * The superposition scene narrows the width and depth ranges (Lmin, U0min) so that every
 * potential always holds at least three bound states and every pair can be formed.
 */
const common = (live: boolean, Lmin = 0.5, U0min = 0.5): ParamSchema<Common> => ({
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
    min: Lmin,
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
    min: U0min,
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

/**
 * Levels closer than this fraction of the energy axis form one cluster: the tunnelling pairs of
 * the double well (split by 10⁻⁴ of the axis for a high, wide barrier). Their curves share a
 * baseline; the upper partner is drawn dashed.
 */
export const CLUSTER_FRAC = 0.03;
/** Smallest drawn wavefunction height [px]: a pair split by 0.3 px no longer flattens every curve. */
export const MIN_AMP_PX = 10;

/** Position of each level inside its cluster (0 = lowest member). */
export function clusterRank(Es: number[], span: number): number[] {
  const r = Es.map(() => 0);
  for (let k = 1; k < Es.length; k++) if (Es[k] - Es[k - 1] < CLUSTER_FRAC * span) r[k] = r[k - 1] + 1;
  return r;
}

/**
 * Vertical size of the wavefunction drawings [eV]: below the spacing between level clusters, so a
 * near-degenerate pair does not set the scale, and never under MIN_AMP_PX (`pxPerEV` of the frame).
 * The curves stay inside the frame with 10 % of the room to spare: `below` = room between a dipping
 * curve's level and the bottom of the axis (the odd partner of the ground pair dips by A), `above` =
 * top of the axis − highest level, both per unit of A (|ψ|² rises by 1.6 A).
 */
export function amplitude(Es: number[], span: number, pxPerEV: number, below = Infinity, above = Infinity): number {
  const between = Es.slice(1)
    .map((E, i) => E - Es[i])
    .filter((d) => d >= CLUSTER_FRAC * span);
  const A = between.length ? Math.min(0.42 * Math.min(...between), 0.09 * span) : 0.09 * span;
  return Math.max(Math.min(A, 0.9 * below, 0.9 * above), MIN_AMP_PX / pxPerEV);
}

/**
 * Level value with enough figures to stay below `top` (a finite well's U0): a level bound by
 * 0.4 meV prints 3.3996, not 3.40, which would read as E = U0.
 */
export function levelText(E: number, top = Infinity): string {
  let sig = 3;
  while (sig < 6 && Number(fmt(E, sig).replace('−', '-')) >= top) sig++;
  return fmt(E, sig);
}

const label = (n: number, E: number, narrow: boolean, top = Infinity) => (narrow ? `${levelText(E, top)} eV` : `*E*_{${n}} = ${levelText(E, top)} eV`);

// ------------------------------------------------------------------ formula panel

/** h²/8m for the electron [eV nm²] = π² ħ²/2m. */
const H2_8M = HB2M * Math.PI ** 2;

/** Significant figures for two inputs of a difference: the fewest (≥ 3) that reproduce the printed result, at most INPUT_SIG. */
export function diffSig(a: number, b: number): number {
  const r = (v: number, s: number) => Number(v.toPrecision(s));
  for (let s = 3; s < INPUT_SIG; s++) if (tn(r(a, s) - r(b, s)) === tn(a - b)) return s;
  return INPUT_SIG;
}

const levelDiff = (E: number[], hi: number, lo: number, n0: number) => {
  const s = diffSig(E[hi], E[lo]);
  return `E_${hi + n0} - E_${lo + n0} = ${tn(E[hi], s)} - ${tn(E[lo], s)} = ${tn(E[hi] - E[lo])}${u('eV')}`;
};

/** Wells: the levels of the solver (as labelled on the diagram) against the textbook relations. */
export function wellLines(p: Common): string[] {
  const m = model(p);
  const E = m.st.E;
  const e1 = `\\frac{h^2}{8mL^2} = \\frac{${tn(H2_8M, 4)}\\ \\mathrm{eV\\,nm^2}}{(${num(p.L)}\\ \\mathrm{nm})^2}`;
  if (p.pot === 'infinite') {
    const lines = [`E_1 = ${e1} = ${tn(E[0])}${u('eV')}`];
    for (let n = 2; n <= Math.min(3, E.length); n++) lines.push(`E_${n} = ${n}^2 E_1 = ${n * n} \\times ${tn(E[0], 4)} = ${tn(E[n - 1])}${u('eV')}`);
    return lines;
  }
  if (p.pot === 'finite') {
    // Leaking into the walls lowers E₁ below the infinite-well value; δ is the decay length there.
    const inf = tn(H2_8M / p.L ** 2);
    return [
      `${e1} = ${inf}${u('eV')}`,
      `E_1 = ${tn(E[0])}${u('eV')} < ${inf}${u('eV')}`,
      `\\delta = \\frac{\\hbar}{\\sqrt{2m(U_0 - E_1)}}`,
      `= \\sqrt{\\frac{${tn(HB2M, 4)}\\ \\mathrm{eV\\,nm^2}}{(${num(p.U0)} - ${tn(E[0], 4)})\\ \\mathrm{eV}}} = ${tn(Math.sqrt(HB2M / (p.U0 - E[0])))}${u('nm')}`,
      // Bound-state count from z0 = (L/2)√(2mU0)/ħ; the diagram shows exactly this many levels.
      `z_0 = \\frac{L}{2}\\frac{\\sqrt{2mU_0}}{\\hbar} = \\frac{${num(p.L)}}{2}\\sqrt{\\frac{${num(p.U0)}}{${tn(HB2M, 4)}}} = ${tn(z0Of(p.L, p.U0), 4)}`,
      `N = \\left\\lceil \\frac{2 z_0}{\\pi} \\right\\rceil = \\lceil ${tn((2 * z0Of(p.L, p.U0)) / Math.PI, 4)} \\rceil = ${finiteWellCount(p.L, p.U0)}`,
    ];
  }
  if (p.pot === 'harmonic') {
    const hw = num(p.hw);
    return [
      `E_0 = \\tfrac12\\hbar\\omega = \\tfrac12 \\times ${hw}\\ \\mathrm{eV} = ${tn(E[0])}${u('eV')}`,
      `E_1 = \\tfrac32\\hbar\\omega = \\tfrac32 \\times ${hw}\\ \\mathrm{eV} = ${tn(E[1])}${u('eV')}`,
      `${levelDiff(E, 1, 0, 0)} = \\hbar\\omega`,
    ];
  }
  // Double well: each level of a single well splits into a close pair.
  const lines: string[] = [];
  for (let k = 0; k + 1 < E.length && k < 4; k += 2) lines.push(levelDiff(E, k + 1, k, 1));
  return lines;
}

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
    const prob = p.show === 'prob';
    const Emax = st.E[st.E.length - 1] ?? 0;
    // Room under the ψ curves that dip below their level, per unit of A (|ψ|² never dips).
    let below = Infinity;
    if (!prob) {
      st.psi.forEach((psi, k) => {
        let mx = 0;
        let mn = 0;
        for (const v of psi) {
          mx = Math.max(mx, Math.abs(v));
          mn = Math.min(mn, v);
        }
        if (mn < 0) below = Math.min(below, (st.E[k] - m.yr[0]) / (-mn / mx));
      });
    }
    const A = amplitude(st.E, span, (f.box.b - f.box.t) / span, below, (m.yr[1] - Emax) / (prob ? 1.6 : 1));
    // Upper member of a close pair (double well): dashed, so both partners stay readable.
    const rank = clusterRank(st.E, span);
    const partner = (k: number) => rank[k] % 2 === 1;
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
    // x label in the bottom margin, under the tick numbers: inside the frame the odd partner of the
    // ground pair (double well) dips across it.
    f.axes({ yLabel: '*E* (eV)' });
    textPx(g, f.box.r, f.box.b + 30, '*x* (nm)', { size: 12, color: TICK, align: 'right' });
    levelLabels(
      f,
      st.E.map((E, k) => ({ E, text: label(k + m.n0, E, narrow, p.pot === 'finite' ? p.U0 : Infinity) })),
    );
  },

  formula: (_s, p) => wellLines(p),

  info: {
    goals: ['ch39.w.goal.quant', 'ch39.w.goal.shape'],
    observe: ['ch39.w.obs.inf', 'ch39.w.obs.fin', 'ch39.w.obs.harm', 'ch39.w.obs.double', 'ch39.w.obs.nodes'],
    equations: [
      'E_n = \\frac{h^2}{8mL^2}\\,n^2, \\quad n = 1, 2, 3, \\dots',
      'E_n = \\left(n + \\tfrac{1}{2}\\right)\\hbar\\omega, \\quad n = 0, 1, 2, \\dots',
      '-\\frac{\\hbar^2}{2m}\\frac{d^2\\psi}{dx^2} + U(x)\\,\\psi = E\\,\\psi',
    ],
    assumptions: ['ch39.assume.electron', 'ch39.assume.fd', 'ch39.assume.amp'],
  },
};

// ------------------------------------------------------------------ superposition

/** Superposition ranges: narrowest well and shallowest finite well that still hold three states. */
export const SUP_L_MIN = 1;
export const SUP_U0_MIN = 1.8;

/**
 * Pair of states, named by their quantum numbers: n = 1, 2, 3 for the wells, n = 0, 1, 2 for
 * the oscillator (so the names match the level labels E_n).
 */
const pairParam = (harmonic: boolean): ParamSpec => ({
  kind: 'select',
  label: 'ch39.p.pair',
  desc: 'ch39.d.pair',
  group: 'main',
  live: false,
  default: harmonic ? '01' : '12',
  options: (harmonic ? ['01', '02', '12'] : ['12', '13', '23']).map((v) => ({ value: v, label: `ch39.pair.${v}` })),
  visibleIf: (p) => (p.pot === 'harmonic') === harmonic,
});

const supParams: ParamSchema<PS> = {
  ...common(false, SUP_L_MIN, SUP_U0_MIN),
  pair: pairParam(false),
  pairH: pairParam(true),
};

/** The pair in effect: the oscillator has its own selector (0 + 1, ...). */
export const pairOf = (p: PS) => (p.pot === 'harmonic' ? p.pairH : p.pair);

interface Sup {
  a: number;
  b: number;
  /** ΔE/ħ [1/fs]; 0 when only one state exists. */
  w: number;
  /** ⟨x⟩ = xm + xc cos(ωt). */
  xm: number;
  xc: number;
}

/**
 * The two states to superpose; `pair` holds their quantum numbers (first level = m.n0). The
 * superposition ranges guarantee three bound states, so both always exist; an index past the
 * last state (not reachable from the controls) is clamped rather than read out of range.
 */
export function supStates(m: WellModel, pair: string): Sup {
  const last = m.st.E.length - 1;
  const a = Math.min(Number(pair[0]) - m.n0, last);
  const b = Math.min(Number(pair[1]) - m.n0, last);
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

// Memo: record() calls this every few steps, and long periods mean many steps per frame.
let supKey = '';
let supMemo: Sup | null = null;
const supOf = (p: PS): Sup => {
  const key = `${p.pot}|${p.L}|${p.U0}|${p.hw}|${p.Ub}|${p.b}|${pairOf(p)}`;
  if (key !== supKey || !supMemo) {
    supMemo = supStates(model(p), pairOf(p));
    supKey = key;
  }
  return supMemo;
};

/** Oscillation period T = h/ΔE [fs] of the chosen pair (NaN for a single state). */
export const supPeriod = (p: PS): number => {
  const w = supOf(p).w;
  return w > 0 ? (2 * Math.PI) / w : NaN;
};
/** ΔE = E_b − E_a [eV] of the chosen pair. */
export const supGap = (p: PS): number => {
  const m = model(p);
  const q = supOf(p);
  return m.st.E[q.b] - m.st.E[q.a];
};
/**
 * The period spans 1.4 fs (infinite well, 1 + 3) to about 13 000 fs (double well, high and wide
 * barrier): the ⟨x⟩ plot shows SUP_PERIODS periods and one period takes SUP_WALL wall seconds at 1×.
 */
export const SUP_PERIODS = 3;
export const SUP_WALL = 2;
/** Runner step [fs] (TimeSpec.h). */
const H_SUP = 0.005;
/** Steps per period: the record density stays the same for every period. */
const STEPS_PER_T = 280;
const periodOr = (p: PS, fallback: number) => (Number.isFinite(supPeriod(p)) ? supPeriod(p) : fallback);
/**
 * Time advanced per runner step [fs]: H_SUP, or T/280 for longer periods. With a fixed step a
 * 13 000 fs period would need 2.6 million steps, and the history (10 000 samples, oldest thinned
 * first) would keep only the last ~350 fs of the 3-period window; the ⟨x⟩ plot looked flat.
 */
export const supDt = (p: PS) => Math.max(H_SUP, periodOr(p, 0) / STEPS_PER_T);

/** Superposition: ΔE of the pair, the period h/ΔE and ⟨x⟩(t) = x̄ + A cos(2πt/T) (the readouts' calls). */
export function supLines(time: number, p: PS): string[] {
  const m = model(p);
  const q = supOf(p);
  const pair = pairOf(p);
  const Ea = m.st.E[q.a];
  const Eb = m.st.E[q.b];
  const dE = supGap(p);
  const s = diffSig(Eb, Ea);
  const lines = [`\\Delta E = E_${pair[1]} - E_${pair[0]} = ${tn(Eb, s)} - ${tn(Ea, s)} = ${tn(dE)}${u('eV')}`];
  const T = supPeriod(p);
  if (!Number.isFinite(T)) return lines;
  // t/T to as many decimals as the shown ⟨x⟩ arithmetic needs (near a zero crossing it is steep).
  const xmT = tn(q.xm);
  const aT = tn(Math.abs(q.xc));
  const target = tn(q.xm + q.xc * Math.cos(q.w * time));
  const val = (s: string) => Number(s.replace('\\times 10^{', 'e').replace('}', ''));
  let dec = 3;
  while (dec < 6 && tn(val(xmT) + Math.sign(q.xc) * val(aT) * Math.cos(2 * Math.PI * Number((time / T).toFixed(dec)))) !== target) dec++;
  const ph = (time / T).toFixed(dec);
  const sigT = Math.max(4, dec + 2);
  const xm = q.xm + q.xc * Math.cos(q.w * time);
  lines.push(`T = \\frac{h}{\\Delta E} = \\frac{${tn(2 * Math.PI * HBAR_EVFS, 4)}\\ \\mathrm{eV\\,fs}}{${tn(dE, 4)}\\ \\mathrm{eV}} = ${tn(T)}${u('fs')}`);
  lines.push(`\\frac{t}{T} = \\frac{${tn(time, sigT)}\\ \\mathrm{fs}}{${tn(T, sigT)}\\ \\mathrm{fs}} = ${ph}`);
  // Pairs of the same parity: ⟨x⟩ stays at x̄.
  if (Math.abs(q.xc) < 1e-9) lines.push(`A = 0 \\;\\Rightarrow\\; \\langle x\\rangle = \\bar x = ${tn(xm)}${u('nm')}`);
  // Split over two lines: one line would shrink to about 0.63 × in the docked panel.
  else lines.push(`\\langle x\\rangle = \\bar x + A\\cos(2\\pi t/T)`, `= ${xmT} ${q.xc < 0 ? '-' : '+'} ${aT}\\cos(2\\pi \\times ${ph}) = ${tn(xm)}${u('nm')}`);
  return lines;
}

export const superposition: Scene<PS, { t: number; n: number }> = {
  id: 'superposition',
  title: 'ch39.scene.sup',
  layout: 'side',
  params: supParams,
  world: PX_WORLD,
  time: {
    h: H_SUP,
    recordEvery: 4,
    frameStep: 0.1,
    window: (p) => SUP_PERIODS * periodOr(p as PS, 40 / SUP_PERIODS),
    // Runner steps per wall second = scale/h; each step is supDt fs, so T/SUP_WALL fs per wall second.
    scale: (p) => (periodOr(p as PS, 2 * SUP_WALL) / SUP_WALL) * (H_SUP / supDt(p as PS)),
    unit: 'fs',
  },
  init: () => ({ t: 0, n: 0 }),
  step: (s, _h, p) => {
    s.n += 1;
    s.t = s.n * supDt(p);
  },
  record: (s, p) => {
    const q = supOf(p);
    return { t: s.t, xm: q.xm + q.xc * Math.cos(q.w * s.t) };
  },
  snapshot: (s) => ({ ...s }),

  draw: (g, s, p, ui) => {
    const m = model(p);
    const q = supStates(m, pairOf(p));
    // Analytic in t: drawn at the frame's own time, so |Ψ|² sloshes smoothly between steps. The
    // runner's lead over s.t counts in steps of h; one step here is supDt.
    const tt = s.t + ((ui?.tFrame ?? s.t) - s.t) * (supDt(p) / H_SUP);
    const { st } = m;
    const narrow = g.vp.w < 640;
    const f = new Frame(g, diagramBox(g, true), m.xr, m.yr);
    drawPotential(f, m);
    const span = m.yr[1] - m.yr[0];
    const Ea = st.E[q.a];
    const Eb = st.E[q.b];
    const Em = q.a === q.b ? Ea : 0.5 * (Ea + Eb);
    const c = Math.cos(q.w * tt);
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
      items.map(({ E, k }) => ({ E, text: label(k + m.n0, E, narrow, p.pot === 'finite' ? p.U0 : Infinity) })),
    );
  },

  plots: [
    {
      id: 'xm',
      label: '\\langle x\\rangle\\,(\\mathrm{nm})',
      traces: [{ channel: 'xm', role: 'position' }],
      yRange: (p) => {
        const m = model(p);
        const q = supStates(m, pairOf(p));
        const r = Math.max(Math.abs(q.xc) * 1.25, 0.1);
        return [q.xm - r, q.xm + r];
      },
    },
  ],

  readouts: [
    // ΔE: in the double well E₁ and E₂ round to the same printed value (0.148 eV both by default).
    { label: '\\Delta E', unit: 'eV', value: (_s, p) => supGap(p) },
    { label: 'T', unit: 'fs', value: (_s, p) => supPeriod(p) },
    { label: '\\langle x\\rangle', unit: 'nm', value: (s, p) => supOf(p).xm + supOf(p).xc * Math.cos(supOf(p).w * s.t) },
  ],

  formula: (s, p) => supLines(s.t, p),

  info: {
    goals: ['ch39.s.goal.osc', 'ch39.s.goal.period'],
    observe: ['ch39.s.obs.slosh', 'ch39.s.obs.parity', 'ch39.s.obs.tunnel'],
    equations: [
      '\\Psi(x,t) = \\tfrac{1}{\\sqrt2}\\left(\\psi_a e^{-iE_at/\\hbar} + \\psi_b e^{-iE_bt/\\hbar}\\right)',
      '|\\Psi|^2 = \\tfrac12\\left(\\psi_a^2 + \\psi_b^2 + 2\\psi_a\\psi_b\\cos\\frac{(E_b - E_a)t}{\\hbar}\\right)',
      'T = \\frac{h}{E_b - E_a}',
    ],
    assumptions: ['ch39.s.assume.terms', 'ch39.s.assume.mean', 'ch39.s.assume.time', 'ch39.assume.electron', 'ch39.assume.fd', 'ch39.assume.supamp', 'ch39.s.assume.range'],
  },
};
