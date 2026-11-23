// Numbers for the Σ formula panel (Scene.formula): the same significant figures as the readouts,
// written as TeX. Shared by every scene. The precision policy helpers (slider, CONST, tnInt, tnMeas,
// tnCmp, tnScale) live in precision.ts and are re-exported here.
import { fmt } from './format';
import { texOf } from './precision';

export * from './precision';

/**
 * `sig` significant figures; ×10ⁿ becomes \times 10^{n}, the minus sign a TeX minus. NaN → "–".
 * Values below `zeroTol` print as 0 (rounding noise, as in the readouts); pass 0 for tiny physical
 * constants such as e = 1.60×10⁻¹⁹ C or ε₀.
 */
export function tn(v: number, sig = 3, zeroTol = 1e-9): string {
  return texOf(fmt(v, sig, zeroTol));
}

/** Roman unit after a thin space, e.g. u('m/s^2'). */
export const u = (unit: string) => `\\ \\mathrm{${unit}}`;

/** A substituted number in parentheses when negative: 3 \times (-2.00). */
export const paren = (t: string) => (t.startsWith('-') ? `(${t})` : t);

/** tn() in parentheses when negative. */
export const tp = (v: number, sig = 3, zeroTol = 1e-9) => paren(tn(v, sig, zeroTol));

/** A slider value as typed: integers bare, otherwise up to two decimals without trailing zeros. */
export const num = (v: number) => (Number.isInteger(v) ? v.toFixed(0) : String(Number(v.toFixed(2))));
