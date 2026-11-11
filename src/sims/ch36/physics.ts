// Ch 36: single-slit diffraction. Lengths in μm, angles in radians. DOM-free.

/** First minimum: a sin θ = λ. NaN if λ ≥ a (no minimum). */
export const firstMin = (lambda: number, a: number) => (lambda < a ? Math.asin(lambda / a) : NaN);

/** Phase difference between the two edges of the slit: φ = 2π a sin θ / λ. */
export const edgePhase = (a: number, lambda: number, theta: number) => (2 * Math.PI * a * Math.sin(theta)) / lambda;

/** Far-field single-slit intensity relative to the centre: (sin α / α)², α = φ/2. */
export function singleSlit(a: number, lambda: number, theta: number): number {
  const al = edgePhase(a, lambda, theta) / 2;
  return Math.abs(al) < 1e-12 ? 1 : (Math.sin(al) / al) ** 2;
}

/**
 * N equal sources across the slit (spacing a/N); neighbours differ in phase by
 * δ = φ/N. Relative intensity |Σ e^{i k δ}|² / N².
 */
export function sourcesIntensity(N: number, phi: number): number {
  const d = phi / N;
  const s = Math.sin(d / 2);
  if (Math.abs(s) < 1e-12) return 1;
  return (Math.sin((N * d) / 2) / (N * s)) ** 2;
}

/** Head-to-tail phasor chain: N arrows of length len, each turned by δ = φ/N from the last. Returns N + 1 points. */
export function phasorChain(N: number, phi: number, len: number): [number, number][] {
  const d = phi / N;
  const pts: [number, number][] = [[0, 0]];
  let x = 0;
  let y = 0;
  for (let k = 0; k < N; k++) {
    x += len * Math.cos(k * d);
    y += len * Math.sin(k * d);
    pts.push([x, y]);
  }
  return pts;
}
