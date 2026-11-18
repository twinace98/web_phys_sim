// Test helper: read the numbers a Σ formula line prints and check that the arithmetic on the printed
// inputs rounds to the printed result (to its last digit).

/** A number as tn()/texNum() print it: 1.23, -0.0500, 1.23\times 10^{-5}. */
export const NUM = String.raw`-?\d+(?:\.\d+)?(?:\\times 10\^\{-?\d+\})?`;

/** The value of a printed number. */
export const val = (t: string): number => Number(t.replace(/\\times 10\^\{(-?\d+)\}/, 'e$1'));

/** One unit in the last printed digit. */
export function ulp(t: string): number {
  const m = t.match(/^-?\d+(?:\.(\d+))?(?:\\times 10\^\{(-?\d+)\})?$/);
  if (!m) throw new Error(`not a printed number: ${t}`);
  return 10 ** ((m[2] ? Number(m[2]) : 0) - (m[1]?.length ?? 0));
}

/** v rounds to the printed result t (within half a unit in its last digit). */
export const agrees = (v: number, t: string): boolean => Math.abs(v - val(t)) <= 0.5 * ulp(t) * (1 + 1e-9) + 1e-15;

/** The groups of `re` matched in `line` (throws with the line when it does not match). */
export function grab(line: string, re: RegExp): string[] {
  const m = line.match(re);
  if (!m) throw new Error(`no match for ${re} in ${line}`);
  return m.slice(1);
}
