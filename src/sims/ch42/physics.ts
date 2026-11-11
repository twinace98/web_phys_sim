// Ch 42: radioactive decay of N0 independent nuclei. DOM-free.
// Each nucleus decays at a random time with P(t_i > t) = e^{−λt} (memoryless): the same as an
// independent chance λ dt of decaying in every short interval dt.
import type { Rng } from '../../core/rng';

export interface Isotope {
  id: string;
  parent: string;
  daughter: string;
  /** Half-life in the display time unit. */
  half: number;
  /** Display time unit. */
  unit: string;
}

export const ISOTOPES: Isotope[] = [
  { id: 'c14', parent: '¹⁴C', daughter: '¹⁴N', half: 5.73, unit: '×10³ y' },
  { id: 'i131', parent: '¹³¹I', daughter: '¹³¹Xe', half: 8.02, unit: 'd' },
  { id: 'u238', parent: '²³⁸U', daughter: '²³⁴Th', half: 4.47, unit: '×10⁹ y' },
];

export const isotope = (id: string) => ISOTOPES.find((i) => i.id === id) ?? ISOTOPES[0];

/** Decay constant λ = ln 2 / T½. */
export const lambdaOf = (half: number) => Math.LN2 / half;

/** Expected number left: N0 e^{−λt}. */
export const expected = (N0: number, half: number, t: number) => N0 * Math.exp(-lambdaOf(half) * t);

/** One random decay time per nucleus (inverse-CDF sampling of the exponential distribution). */
export function decayTimes(N0: number, half: number, rng: Rng): Float64Array {
  const lam = lambdaOf(half);
  const out = new Float64Array(N0);
  for (let i = 0; i < N0; i++) out[i] = -Math.log(1 - rng.next()) / lam;
  return out;
}

/** Nuclei not yet decayed at time t, from ascending decay times (binary search). */
export function remaining(sorted: Float64Array, t: number): number {
  let lo = 0;
  let hi = sorted.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (sorted[mid] <= t) lo = mid + 1;
    else hi = mid;
  }
  return sorted.length - lo;
}
