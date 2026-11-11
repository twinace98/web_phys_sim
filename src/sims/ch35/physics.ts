// Ch 35: double-slit interference. Lengths in μm. DOM-free.

/** Fringe spacing on the screen in the small-angle limit: Δy = λD/d. */
export const fringeSpacing = (lambda: number, D: number, d: number) => (lambda * D) / d;

/** Path difference ΔL = r_lower − r_upper from slits at ±d/2 (x = 0) to the screen point (D, y). */
export function pathDiff(d: number, D: number, y: number): number {
  return Math.hypot(D, y + d / 2) - Math.hypot(D, y - d / 2);
}

/** Screen height where ΔL = mλ exactly (bisection on the monotonic ΔL(y)). */
export function brightAt(m: number, lambda: number, d: number, D: number): number {
  const target = m * lambda;
  if (Math.abs(target) >= d) return NaN;
  let hi = 1e3 * (D + d);
  let lo = -hi;
  for (let i = 0; i < 200; i++) {
    const mid = (lo + hi) / 2;
    if (pathDiff(d, D, mid) < target) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}

/** Far-field relative intensity: cos²(π d sinθ / λ) × single-slit envelope of width a. */
export function doubleSlitFar(sinTheta: number, lambda: number, d: number, a = 0): number {
  const beta = (Math.PI * a * sinTheta) / lambda;
  const env = Math.abs(beta) < 1e-12 ? 1 : (Math.sin(beta) / beta) ** 2;
  return Math.cos((Math.PI * d * sinTheta) / lambda) ** 2 * env;
}
