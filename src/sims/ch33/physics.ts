// Ch 33: polarizers, refraction and total internal reflection. Angles in radians. DOM-free.

// ------------------------------------------------------------------ polarization

/**
 * Intensity after a chain of ideal linear polarizers (transmission axes in radians) for
 * unpolarized light of intensity I0: the first halves it, each next one multiplies by
 * cos² of the angle to the previous axis (Malus). Returns the intensity after each.
 */
export function polarizerChain(I0: number, axes: number[]): number[] {
  const out: number[] = [];
  let I = I0;
  axes.forEach((a, k) => {
    I = k === 0 ? I / 2 : I * Math.cos(a - axes[k - 1]) ** 2;
    out.push(I);
  });
  return out;
}

/** Malus's law I = I₀ cos²θ. */
export const malus = (I: number, theta: number) => I * Math.cos(theta) ** 2;

// ------------------------------------------------------------------ refraction

/** Refraction angle from n₁ sin θ₁ = n₂ sin θ₂; NaN beyond the critical angle. */
export function snell(n1: number, n2: number, th1: number): number {
  const s = (n1 / n2) * Math.sin(th1);
  return Math.abs(s) > 1 ? NaN : Math.asin(s);
}

/** Critical angle for going from n₁ into n₂ < n₁; NaN if n₁ ≤ n₂. */
export const criticalAngle = (n1: number, n2: number) => (n1 > n2 ? Math.asin(n2 / n1) : NaN);

/** Fresnel reflectance for unpolarized light (mean of s and p); 1 under total internal reflection. */
export function reflectance(n1: number, n2: number, th1: number): number {
  const th2 = snell(n1, n2, th1);
  if (Number.isNaN(th2)) return 1;
  const c1 = Math.cos(th1);
  const c2 = Math.cos(th2);
  const rs = (n1 * c1 - n2 * c2) / (n1 * c1 + n2 * c2);
  const rp = (n1 * c2 - n2 * c1) / (n1 * c2 + n2 * c1);
  return (rs * rs + rp * rp) / 2;
}

export const MEDIA: Record<string, number> = { air: 1.0, water: 1.33, glass: 1.5, diamond: 2.42 };

// ------------------------------------------------------------------ optical fibre

export interface Fibre {
  /** Core and cladding indices, outside medium n0 (air). */
  n1: number;
  n2: number;
  n0: number;
}

/** Angle of the ray inside the core to the fibre axis, for entry angle α in air. */
export const coreAngle = (f: Fibre, alpha: number) => Math.asin((f.n0 / f.n1) * Math.sin(alpha));

/** Angle of incidence on the core wall (from the wall normal). */
export const wallIncidence = (f: Fibre, alpha: number) => Math.PI / 2 - coreAngle(f, alpha);

/** Largest entry angle that is still guided: sin α_max = √(n₁² − n₂²) / n₀ (90° if ≥ 1). */
export function acceptance(f: Fibre): number {
  const na = Math.sqrt(Math.max(0, f.n1 * f.n1 - f.n2 * f.n2)) / f.n0;
  return na >= 1 ? Math.PI / 2 : Math.asin(na);
}
