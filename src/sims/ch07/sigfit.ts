// Significant figures for the inputs of a sum, difference, product or ratio shown in the Σ formula
// panel, so that the arithmetic on the printed inputs reproduces the printed result. Shared by the
// Ch 7 to Ch 15 scenes.
import { tn } from '../../core/tex';

/** The number a tn() string shows. */
const shown = (t: string) => Number(t.replace('\\times 10^{', 'e').replace('}', ''));

/**
 * Smallest sig (min..8) at which f, applied to the inputs xs as tn(x, sig) prints them, prints the
 * same as tn(result, rsig).
 */
export function sigFit(xs: number[], f: (...v: number[]) => number, result: number, rsig = 3, min = 3): number {
  const want = tn(result, rsig);
  // A zero result ("0.00") is reproduced by anything that prints as zero at its decimals.
  const zero = shown(want) === 0 ? 0.5 * 10 ** -(want.split('.')[1]?.length ?? 0) : 0;
  let loose = 0;
  for (let k = min; k <= 8; k++) {
    const v = f(...xs.map((x) => shown(tn(x, k))));
    if (zero) {
      if (Math.abs(v) < zero) return k;
      continue;
    }
    // Both sides of v round the same way, so a reader working by hand gets the same digits (2.965 is
    // ambiguous; floating point may print it 2.96).
    const d = 1e-7 * Math.max(Math.abs(v), 1e-12);
    if (tn(v - d, rsig) === want && tn(v + d, rsig) === want) return k;
    if (!loose && tn(v, rsig) === want) loose = k;
  }
  // Only a tie (0.71 / 4 = 0.1775) is left: the fewest digits that print right.
  return loose || min;
}

/** tn(x, sig), but with fewer figures (down to 3) when they already show x exactly: 0.4418, not 0.44180. */
export function tnFit(x: number, sig: number): string {
  for (let k = 3; k < sig; k++) if (Math.abs(shown(tn(x, k)) - x) <= 1e-12 * Math.abs(x)) return tn(x, k);
  return tn(x, sig);
}
