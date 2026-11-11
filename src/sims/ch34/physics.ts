// Ch 34: thin lenses and spherical mirrors in the paraxial approximation. DOM-free.
// Sign convention (Halliday): p > 0 object distance; i > 0 real image, i < 0 virtual image;
// f > 0 converging lens / concave mirror, f < 0 diverging lens / convex mirror; f = ∞ plane mirror.

/** Image distance from 1/p + 1/i = 1/f (Infinity when p = f). */
export function imageDistance(p: number, f: number): number {
  if (!Number.isFinite(f)) return -p;
  const inv = 1 / f - 1 / p;
  return Math.abs(inv) < 1e-12 ? Infinity : 1 / inv;
}

/** Lateral magnification m = −i/p. */
export const magnification = (p: number, i: number) => (Number.isFinite(i) ? -i / p : NaN);

/**
 * Thin element as a ray-transfer step: a ray reaching the element at height y with slope s
 * leaves with slope s − y/f (lens). For a mirror the same holds in the unfolded picture,
 * then the outgoing ray is reflected (x reversed).
 */
export const outSlope = (s: number, y: number, f: number) => (Number.isFinite(f) ? s - y / f : s);

export interface Ray {
  /** Height where the ray meets the element. */
  y: number;
  /** Slope before the element (dy/dx, travelling in +x). */
  sIn: number;
  /** Slope after, in the unfolded picture. */
  sOut: number;
}

/**
 * The three principal rays from the object tip (−p, h): parallel to the axis, through the
 * centre (vertex), and through (or toward) the first focal point. The third is omitted when
 * the object sits at the focal point (that ray would be vertical).
 */
export function principalRays(p: number, h: number, f: number): Ray[] {
  const rays: Ray[] = [];
  rays.push({ y: h, sIn: 0, sOut: outSlope(0, h, f) });
  rays.push({ y: 0, sIn: -h / p, sOut: -h / p });
  if (Number.isFinite(f) && Math.abs(p - f) > 1e-6) {
    // Line from (−p, h) through the focal point on the incoming side, x = −f.
    const s = -h / (p - f);
    const y = h + s * p;
    rays.push({ y, sIn: s, sOut: outSlope(s, y, f) });
  }
  return rays;
}
