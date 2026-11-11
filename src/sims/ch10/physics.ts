// Ch 10: rotational inertia. Point masses on a light rod, and rigid bodies about a shifted axis.
// Closed forms only; inertiaBySum checks them by summing m r² over small pieces.

/** I = Σ m r² for point masses at distances r from the axis. */
export function pointInertia(masses: { m: number; r: number }[]): number {
  return masses.reduce((s, q) => s + q.m * q.r * q.r, 0);
}

/** Constant torque from rest: α = τ / I, ω = α t, θ = α t² / 2. */
export function spinUp(tau: number, I: number, t: number) {
  const alpha = tau / I;
  return { alpha, omega: alpha * t, theta: 0.5 * alpha * t * t };
}

export type Shape = 'ring' | 'disk' | 'rod';

/**
 * Rotational inertia about the centre of mass, axis perpendicular to the page.
 * Ring and disk of radius R; rod of length 2R (so all three span the same width).
 */
export function inertiaCm(shape: Shape, M: number, R: number): number {
  switch (shape) {
    case 'ring':
      return M * R * R;
    case 'disk':
      return 0.5 * M * R * R;
    case 'rod':
      return (M * (2 * R) ** 2) / 12;
  }
}

/** Parallel-axis theorem: I = I_cm + M d². */
export const parallelAxis = (Icm: number, M: number, d: number) => Icm + M * d * d;

/** Σ m r² over n × n small pieces, axis at (d, 0); independent check of the closed forms. */
export function inertiaBySum(shape: Shape, M: number, R: number, d: number, n = 400): number {
  let I = 0;
  const add = (m: number, x: number, y: number) => {
    I += m * ((x - d) ** 2 + y * y);
  };
  if (shape === 'ring') {
    for (let i = 0; i < n; i++) {
      const a = ((i + 0.5) / n) * 2 * Math.PI;
      add(M / n, R * Math.cos(a), R * Math.sin(a));
    }
  } else if (shape === 'rod') {
    for (let i = 0; i < n; i++) add(M / n, -R + ((i + 0.5) / n) * 2 * R, 0);
  } else {
    // Annuli of width R/n, each split into pieces; mass ∝ area.
    const sigma = M / (Math.PI * R * R);
    for (let i = 0; i < n; i++) {
      const r0 = (i / n) * R;
      const r1 = ((i + 1) / n) * R;
      const rc = (r0 + r1) / 2;
      const k = Math.max(8, Math.round((2 * Math.PI * rc * n) / R));
      const m = (sigma * Math.PI * (r1 * r1 - r0 * r0)) / k;
      for (let j = 0; j < k; j++) {
        const a = ((j + 0.5) / k) * 2 * Math.PI;
        // Second moment of an annulus piece about its own centre is O((R/n)²): use the
        // exact annulus radius² average (r0² + r1²)/2 instead of rc².
        const rr = Math.sqrt((r0 * r0 + r1 * r1) / 2);
        add(m, rr * Math.cos(a), rr * Math.sin(a));
      }
    }
  }
  return I;
}
