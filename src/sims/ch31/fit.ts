// Formula-panel (Scene.formula) helpers shared by Ch 31-36: significant figures for the inputs
// of a line, so that the arithmetic shown reproduces the printed result, and tiny SI values.
import { fmt } from '../../core/format';
import { tn } from '../../core/tex';

/**
 * tn() without the zero tolerance: tiny SI constants (r = 5.29×10⁻¹¹ m, e = 1.60×10⁻¹⁹ C) print
 * as such instead of 0. Identical to tn() for |v| ≥ 10⁻⁹.
 */
export function tns(v: number, sig = 3): string {
  if (Math.abs(v) >= 1e-9 || !Number.isFinite(v)) return tn(v, sig);
  return fmt(v, sig, 0)
    .replace('−', '-')
    .replace(/×10([⁻⁰¹²³⁴⁵⁶⁷⁸⁹]+)/, (_m, e: string) => `\\times 10^{${[...e].map((c) => '⁻⁰¹²³⁴⁵⁶⁷⁸⁹'.indexOf(c) - 1).map((d) => (d < 0 ? '-' : String(d))).join('')}}`);
}

/** x as printed by tns(x, s), read back as a number. */
export type Round = (x: number) => number;

/** The value tns(x, s) prints (3162 at 3 figures stays 3162, 1.23×10⁻⁵ reads back as 1.23e-5). */
export const printed = (x: number, s: number) => Number(tns(x, s).replace(/\\times 10\^\{(-?\d+)\}/, 'e$1'));

/**
 * Fewest figures s in [lo, hi] for which show(printed at s) prints target; hi if none does.
 * show receives the rounding function, so several inputs can share one s.
 */
export function fitSig(show: (r: Round) => string, target: string, lo = 3, hi = 8): number {
  for (let s = lo; s < hi; s++) {
    if (show((x) => printed(x, s)) === target) return s;
  }
  return hi;
}
