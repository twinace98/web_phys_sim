// Printed precision (policy D, docs/design.md §3.3): which string a number gets on the stage, in the
// readouts and in the Σ panel. Each source of a number has one formatter here, so the same quantity
// prints the same everywhere:
//   R1 slider/stepper value → its control label (slider), constant → one table (CONST)
//   R2 integers and counts → tnInt
//   R3 state and derived values → tn (3 figures, tex.ts); results equal their readout string
//   R4 measured / statistical values → tnMeas (to the scatter, optional ±)
//   R6 inequalities → tnCmp (fewest figures ≥ 3 that keep the inequality visible)
//   R7a time-varying values → tnScale / ReadoutSpec.scale (fixed decimals from the run scale,
//       residues below 10⁻⁶ of it print as an exact 0)
// Unicode functions (fmt…) feed readouts and canvas text; tn… are the same strings as TeX.
import { fmt, fmtTick } from './format';
import type { ParamSpec, ReadoutSpec, Params } from './types';

const DIGIT: Record<string, string> = {
  '⁻': '-',
  '⁰': '0',
  '¹': '1',
  '²': '2',
  '³': '3',
  '⁴': '4',
  '⁵': '5',
  '⁶': '6',
  '⁷': '7',
  '⁸': '8',
  '⁹': '9',
};
const SUP: Record<string, string> = Object.fromEntries(Object.entries(DIGIT).map(([k, v]) => [v, k]));

/** A number as fmt() prints it ("−1.23×10⁻⁵", "–") written as TeX ("-1.23\times 10^{-5}"). */
export function texOf(s: string): string {
  if (s === '–') return '\\text{–}';
  return s.replace(/−/g, '-').replace(/×10([⁻⁰¹²³⁴⁵⁶⁷⁸⁹]+)/, (_m, e: string) => `\\times 10^{${[...e].map((c) => DIGIT[c]).join('')}}`);
}

// ---------------------------------------------------------------- R1 sliders and constants

/** Value with as many decimals as the control's step has (5 → "5", 0.5 → "0.5", 0.25 → "0.25"). */
export function fmtStep(v: number, step: number): string {
  const d = Math.min(4, Math.max(0, -Math.floor(Math.log10(step) + 1e-9)));
  const frac = step * 10 ** d;
  const dec = Math.abs(frac - Math.round(frac)) > 1e-9 ? d + 1 : d;
  return v.toFixed(dec).replace('-', '−');
}

/**
 * The text the control shows for a number parameter, without its unit: a slider or stepper to the
 * decimals of its step, a log slider to `sig` figures, a preset list as its tick label.
 */
export function sliderText(spec: ParamSpec, v: number): string {
  if (spec.kind !== 'number') return fmtTick(v);
  if (spec.control === 'select') return fmtTick(v);
  if (spec.control === 'slider' && spec.log) return fmt(v, spec.sig ?? 2);
  return fmtStep(v, spec.step ?? (spec.control === 'stepper' ? 1 : 0.01));
}

/** R1: a slider, stepper or preset value in a Σ line, exactly as its control label shows it (TeX). */
export const slider = (spec: ParamSpec, v: number): string => texOf(sliderText(spec, v));

export interface Const {
  /** Value used for printing and for the arithmetic shown with it (SI unless `unit` says otherwise). */
  value: number;
  /** TeX of the value as Halliday quotes it. */
  tex: string;
  /** TeX unit (for u()). */
  unit: string;
}

const c = (value: number, tex: string, unit: string): Const => ({ value, tex, unit });

/**
 * R1: the constants as the Σ panel prints them, one table for every chapter (Halliday's quoted
 * values, Fundamentals of Physics, inside front cover and the chapters that use them). Physics code
 * may keep a more precise value (CODATA) for the model; the Σ line prints this string.
 */
export const CONST = {
  /** Free-fall acceleration near Earth's surface. */
  g: c(9.8, '9.8', 'm/s^2'),
  /** Coulomb constant 1/(4πε₀). */
  k: c(8.99e9, '8.99\\times 10^{9}', 'N\\,m^2/C^2'),
  /** Elementary charge. */
  e: c(1.6e-19, '1.60\\times 10^{-19}', 'C'),
  /** Permittivity constant. */
  eps0: c(8.85e-12, '8.85\\times 10^{-12}', 'C^2/(N\\,m^2)'),
  /** Permeability constant 4π×10⁻⁷ (exact in the old SI; printed as such). */
  mu0: c(4e-7 * Math.PI, '4\\pi \\times 10^{-7}', 'T\\,m/A'),
  /** μ₀ as a decimal, for lines that multiply it out. */
  mu0dec: c(1.26e-6, '1.26\\times 10^{-6}', 'T\\,m/A'),
  /** Planck constant. */
  h: c(6.63e-34, '6.63\\times 10^{-34}', 'J\\,s'),
  /** Planck constant in eV s. */
  hEV: c(4.14e-15, '4.14\\times 10^{-15}', 'eV\\,s'),
  /** Electron mass. */
  me: c(9.11e-31, '9.11\\times 10^{-31}', 'kg'),
  /** Proton mass. */
  mp: c(1.67e-27, '1.67\\times 10^{-27}', 'kg'),
  /** Gravitational constant. */
  G: c(6.67e-11, '6.67\\times 10^{-11}', 'N\\,m^2/kg^2'),
  /** Boltzmann constant. */
  kB: c(1.38e-23, '1.38\\times 10^{-23}', 'J/K'),
  /** Boltzmann constant in eV/K. */
  kBeV: c(8.62e-5, '8.62\\times 10^{-5}', 'eV/K'),
  /** Molar gas constant. */
  R: c(8.31, '8.31', 'J/(mol\\,K)'),
  /** Avogadro number. */
  NA: c(6.02e23, '6.02\\times 10^{23}', 'mol^{-1}'),
  /** Speed of light. */
  c: c(3.0e8, '3.00\\times 10^{8}', 'm/s'),
  /** hc for photon energies and wavelengths. */
  hc: c(1240, '1240', 'eV\\,nm'),
  /** Hydrogen ground-state binding energy, E_n = −(13.60 eV)/n². */
  Ry: c(13.6, '13.60', 'eV'),
  /** Electron rest energy mₑc² = 0.511 MeV, in keV. */
  mec2: c(511, '511', 'keV'),
  /** GM of the Earth as printed (the orbit physics keeps 3.986×10¹⁴). */
  GME: c(3.99e14, '3.99\\times 10^{14}', 'm^3/s^2'),
} as const satisfies Record<string, Const>;

// ---------------------------------------------------------------- R3 state and derived inputs

/**
 * R3: most significant figures a substituted state or derived input prints with. The digit-fitting
 * helpers of the chapters (sigToMatch, sigFit, fitSig, sumSig, diffSig) never return more.
 */
export const INPUT_SIG = 3;

// ---------------------------------------------------------------- R2 integers

/** R2: an integer or count as an integer (Ω = 6, ln 1 = 0); a non-integer is rounded. */
export function fmtInt(n: number): string {
  if (!Number.isFinite(n)) return '–';
  const r = Math.round(n);
  return r === 0 ? '0' : String(r).replace('-', '−');
}
export const tnInt = (n: number): string => texOf(fmtInt(n));

// ---------------------------------------------------------------- R4 measured values

/** Decimal exponent of the leading digit of σ rounded to one figure (0.083 → −2, 6.4 → 0, 96 → 2). */
function leadExp(sigma: number): number {
  const e = Math.floor(Math.log10(sigma));
  return Number((sigma / 10 ** e).toFixed(0)) >= 10 ? e + 1 : e;
}

/** v rounded at 10^e, as text (e < 0 → decimals, e > 0 → trailing zeros). */
function atExp(v: number, e: number): string {
  if (e >= 0) {
    const r = Math.round(v / 10 ** e) * 10 ** e;
    return r === 0 ? '0' : r.toFixed(0);
  }
  const s = v.toFixed(-e);
  return /^-0\.?0*$/.test(s) ? s.slice(1) : s;
}

/**
 * R4: a measured or statistical value to its scatter σ: rounded at σ's leading digit (σ to one
 * figure), with "± σ" when `pm`. 94.13 ± 6.2 → "94 ± 6"; 1.073 ± 0.083 → "1.07 ± 0.08". Beyond
 * 10⁵ or below 10⁻³ the pair shares one power of ten: "(2.4 ± 0.3)×10⁻⁵". No σ (0 or not finite)
 * falls back to 2 figures.
 */
export function fmtMeas(v: number, sigma: number, opt: { pm?: boolean } = {}): string {
  if (!Number.isFinite(v)) return '–';
  const s = Math.abs(sigma);
  if (!(s > 0) || !Number.isFinite(s)) return fmt(v, 2);
  const e = leadExp(s);
  const big = Math.max(Math.abs(v), s);
  const ev = Math.floor(Math.log10(big));
  if (big >= 1e5 || big < 1e-3) {
    // Shared power of ten from the larger of the two; the mantissa keeps σ's leading digit.
    const k = 10 ** ev;
    const m = atExp(v / k, e - ev).replace('-', '−');
    const sig = atExp(s / k, e - ev);
    return opt.pm ? `(${m} ± ${sig})×10${String(ev).replace(/[-0-9]/g, (d) => SUP[d])}` : `${m}×10${String(ev).replace(/[-0-9]/g, (d) => SUP[d])}`;
  }
  const m = atExp(v, e).replace('-', '−');
  return opt.pm ? `${m} ± ${atExp(s, e)}` : m;
}
export const tnMeas = (v: number, sigma: number, opt: { pm?: boolean } = {}): string => texOf(fmtMeas(v, sigma, opt)).replace('±', '\\pm');

// ---------------------------------------------------------------- R6 inequalities

/**
 * R6: v with the fewest significant figures (at least 3, at most 8) whose printed value still lies
 * on the same side of `bound` as v: sin θ₂ = 1.0018 against 1 prints "1.002", 0.86 prints "0.860".
 */
export function fmtCmp(v: number, bound: number): string {
  if (!Number.isFinite(v)) return '–';
  const side = Math.sign(v - bound);
  for (let s = 3; s <= 8; s++) {
    const t = fmt(v, s, 0);
    const back = Number(t.replace('−', '-').replace(/×10([⁻⁰¹²³⁴⁵⁶⁷⁸⁹]+)/, (_m, x: string) => `e${[...x].map((d) => DIGIT[d]).join('')}`));
    if (Math.sign(back - bound) === side) return t;
  }
  return fmt(v, 8, 0);
}
export const tnCmp = (v: number, bound: number): string => texOf(fmtCmp(v, bound));

// ---------------------------------------------------------------- R7a run scale

/** Below this fraction of the run scale a value is a numerical residue and prints as an exact 0. */
export const RESIDUE = 1e-6;

/**
 * R7a: a value that changes during a run, with fixed decimals set by the run scale (the largest
 * magnitude it reaches): 3 figures at the scale, so v up to 2 m/s always prints two decimals and
 * 2.96×10⁻⁴ m/s reads "0.00". |v| below 10⁻⁶ of the scale is a residue and prints "0". Scales of
 * 10⁵ and more or below 10⁻³ keep one power of ten: "1.23×10⁻⁵", "0.00×10⁻⁵".
 */
export function fmtScale(v: number, scale: number): string {
  if (!Number.isFinite(v)) return '–';
  const S = Math.abs(scale);
  if (!(S > 0) || !Number.isFinite(S)) return fmt(v, 3);
  if (Math.abs(v) < RESIDUE * S) return '0';
  const e = Math.floor(Math.log10(S) + 1e-12);
  if (S >= 1e5 || S < 1e-3) {
    const m = (v / 10 ** e).toFixed(2);
    return `${/^-0\.00$/.test(m) ? '0.00' : m.replace('-', '−')}×10${String(e).replace(/[-0-9]/g, (d) => SUP[d])}`;
  }
  const d = Math.max(0, 2 - e);
  const s = v.toFixed(d);
  return (/^-0\.?0*$/.test(s) ? s.slice(1) : s).replace('-', '−');
}
export const tnScale = (v: number, scale: number): string => texOf(fmtScale(v, scale));

// ---------------------------------------------------------------- readouts

/**
 * The text of a readout value (shell and tests): its own `format`, else the run-scale format when
 * it has a `scale` (R7a), else `sig` figures. A Σ result for the same symbol prints this string.
 */
export function readoutText<S, P extends Params>(spec: ReadoutSpec<S, P>, v: number, p: P, s?: S): string {
  const custom = spec.format?.(v, s as S, p);
  if (custom !== undefined) return custom;
  if (spec.scale !== undefined) return fmtScale(v, typeof spec.scale === 'function' ? spec.scale(p) : spec.scale);
  return fmt(v, spec.sig ?? 3, spec.zeroTol);
}

/** A readout's unit after its value: a space before units, none before the degree sign (R8). */
export const unitAfter = (unit: string): string => (!unit ? '' : unit === '°' ? '°' : ` ${unit}`);
