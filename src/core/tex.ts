// Numbers for the Σ formula panel (Scene.formula): the same significant figures as the readouts,
// written as TeX. Shared by every scene.
import { fmt } from './format';

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

/**
 * `sig` significant figures; ×10ⁿ becomes \times 10^{n}, the minus sign a TeX minus. NaN → "–".
 * Values below `zeroTol` print as 0 (rounding noise, as in the readouts); pass 0 for tiny physical
 * constants such as e = 1.60×10⁻¹⁹ C or ε₀.
 */
export function tn(v: number, sig = 3, zeroTol = 1e-9): string {
  const s = fmt(v, sig, zeroTol);
  if (s === '–') return '\\text{–}';
  return s.replace('−', '-').replace(/×10([⁻⁰¹²³⁴⁵⁶⁷⁸⁹]+)/, (_m, e: string) => `\\times 10^{${[...e].map((c) => DIGIT[c]).join('')}}`);
}

/** Roman unit after a thin space, e.g. u('m/s^2'). */
export const u = (unit: string) => `\\ \\mathrm{${unit}}`;

/** A substituted number in parentheses when negative: 3 \times (-2.00). */
export const paren = (t: string) => (t.startsWith('-') ? `(${t})` : t);

/** tn() in parentheses when negative. */
export const tp = (v: number, sig = 3, zeroTol = 1e-9) => paren(tn(v, sig, zeroTol));

/** A slider value as typed: integers bare, otherwise up to two decimals without trailing zeros. */
export const num = (v: number) => (Number.isInteger(v) ? v.toFixed(0) : String(Number(v.toFixed(2))));
