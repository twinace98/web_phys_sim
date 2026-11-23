// Σ formula panel helpers shared by Ch 2–6: how many digits the substituted inputs print with.
// Policy D (docs/design.md §3.3, R3): at most INPUT_SIG (3) figures; the result is printed from the
// unrounded value, like its readout, and may differ in the last digit from the printed inputs.
import { INPUT_SIG, tn } from '../../core/tex';

/** The number tn() prints, read back (×10ⁿ included). */
export function printed(v: number, sig = 3): number {
  return Number(tn(v, sig).replace(/\\times 10\^\{(-?\d+)\}/, 'e$1'));
}

/**
 * Whether x, the arithmetic done on the printed inputs, prints as `want`. A result that prints as
 * zero (0.00) accepts anything that rounds to it at those decimals: a leftover of 10⁻⁵ would
 * otherwise print in scientific notation.
 */
function same(x: number, want: string): boolean {
  if (tn(x) === want) return true;
  if (!/^0\.0*$/.test(want)) return false;
  return Math.abs(x) < 0.5 * 10 ** -(want.length - 2);
}

/**
 * Fewest significant figures (at least `min`, at most INPUT_SIG) for the inputs so that `f` applied
 * to the printed inputs prints the same result as `result` at 3 figures; INPUT_SIG when none does.
 */
export function sigToMatch(result: number, inputs: number[], f: (...xs: number[]) => number, min = 3, max = 7): number {
  const want = tn(result);
  const hi = Math.min(max, INPUT_SIG);
  for (let s = min; s < hi; s++) if (same(f(...inputs.map((v) => printed(v, s))), want)) return s;
  return hi;
}

/**
 * Like sigToMatch, but each input keeps only the digits it needs (at most INPUT_SIG).
 */
export function sigsToMatch(result: number, inputs: number[], f: (...xs: number[]) => number, min = 3, max = 7): number[] {
  const all = sigToMatch(result, inputs, f, min, max);
  const sig = inputs.map(() => all);
  const want = tn(result);
  const ok = () => same(f(...inputs.map((v, i) => printed(v, sig[i]))), want);
  if (all === min || !ok()) return sig;
  for (let i = 0; i < inputs.length; i++) {
    while (sig[i] > min) {
      sig[i]--;
      if (!ok()) {
        sig[i]++;
        break;
      }
    }
  }
  return sig;
}
