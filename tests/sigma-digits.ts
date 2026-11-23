// Test helper: read the numbers a Σ formula line prints and check the arithmetic on the printed inputs
// against the printed result. Policy D (docs/design.md §3.3, R3): inputs print with 3 figures and the
// result from the unrounded value, so recomputing may differ in the last digit; the check allows 1 %.

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

/** Relative tolerance of a recomputation from the printed inputs (R3: last-digit differences). */
export const REL = 0.01;

/**
 * v, the arithmetic on the printed inputs, agrees with the printed result t: within 1 % of it, or
 * within one unit in its last digit (results such as 0.00 or 0.0207).
 */
export const agrees = (v: number, t: string): boolean => Math.abs(v - val(t)) <= Math.max(REL * Math.abs(val(t)), ulp(t)) * (1 + 1e-9) + 1e-15;

/**
 * f on the printed inputs agrees with the printed result t up to R3's tolerance plus the rounding the
 * printed inputs carry (each ±½ unit in its last digit, worst corner; the indices in `exact`, such as
 * slider values, carry none). For lines whose point is a difference (R5), where 3-figure inputs lose
 * most of the result's digits until phase 2 rewrites them.
 */
export function agreesWithin(f: (...x: number[]) => number, inputs: string[], t: string, exact: number[] = []): boolean {
  const x = inputs.map(val);
  const h = inputs.map((s, i) => (exact.includes(i) ? 0 : 0.5 * ulp(s)));
  const v = f(...x);
  let slack = 0;
  for (let m = 0; m < 1 << x.length; m++) slack = Math.max(slack, Math.abs(f(...x.map((xi, i) => xi + ((m >> i) & 1 ? h[i] : -h[i]))) - v));
  return Math.abs(v - val(t)) <= Math.max(REL * Math.abs(val(t)), ulp(t)) * (1 + 1e-9) + slack * (1 + 1e-9) + 1e-15;
}

/** The groups of `re` matched in `line` (throws with the line when it does not match). */
export function grab(line: string, re: RegExp): string[] {
  const m = line.match(re);
  if (!m) throw new Error(`no match for ${re} in ${line}`);
  return m.slice(1);
}
