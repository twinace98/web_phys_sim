// Dot and cross products of two vectors in the xy plane. DOM-free.

export type V2 = [number, number];

export const mag = (v: V2) => Math.hypot(v[0], v[1]);

/** Component form a_x b_x + a_y b_y. */
export const dot = (a: V2, b: V2) => a[0] * b[0] + a[1] * b[1];

/** z component of a × b in component form, a_x b_y − a_y b_x (positive: out of the page). */
export const crossZ = (a: V2, b: V2) => a[0] * b[1] - a[1] * b[0];

/**
 * Signed angle from a to b in (−π, π]: positive counter-clockwise. Its magnitude is the
 * (smaller) angle φ between the vectors; 0 when either vector is zero.
 */
export function signedAngle(a: V2, b: V2): number {
  if (mag(a) === 0 || mag(b) === 0) return 0;
  return Math.atan2(crossZ(a, b), dot(a, b));
}

/** Angle between the vectors, [0, π]. */
export const angleBetween = (a: V2, b: V2) => Math.abs(signedAngle(a, b));

/** Magnitude form ab cos φ. */
export const dotPolar = (a: V2, b: V2) => mag(a) * mag(b) * Math.cos(angleBetween(a, b));

/** Magnitude form ab sin φ with the signed angle φ from a to b. */
export const crossPolar = (a: V2, b: V2) => mag(a) * mag(b) * Math.sin(signedAngle(a, b));

/**
 * Projection of v on the line of u: the foot of the perpendicular from v's tip, (u·v / u²) u.
 * Its signed length along û is v cos φ (negative when φ > 90°).
 */
export function project(v: V2, u: V2): V2 {
  const u2 = dot(u, u);
  if (u2 === 0) return [0, 0];
  const k = dot(u, v) / u2;
  return [k * u[0], k * u[1]];
}

/** Round to 2 decimals so URLs and readouts stay clean (no −0). */
const r2 = (v: number) => Math.round(v * 100) / 100 || 0;

/**
 * Pointer position → stored vector: optionally snapped to a `step` grid, length at most `lim`.
 * A snapped point outside the circle is replaced by the grid point toward the origin.
 */
export function placeTip(w: V2, snap: boolean, lim: number, step = 0.5): V2 {
  const m = mag(w);
  let p: V2 = m > lim ? [(w[0] * lim) / m, (w[1] * lim) / m] : w;
  if (snap) {
    const s: V2 = [Math.round(p[0] / step) * step, Math.round(p[1] / step) * step];
    p = mag(s) <= lim ? s : [Math.trunc(p[0] / step) * step, Math.trunc(p[1] / step) * step];
  } else if (m > lim) {
    p = [Math.trunc(p[0] * 100) / 100, Math.trunc(p[1] * 100) / 100];
  }
  return [r2(p[0]), r2(p[1])];
}

/**
 * b turned so that the signed angle from a to it is phi (radians); its length is kept. Components
 * rounded to 3 decimals, so the shown length (3 significant figures) does not flicker while turning.
 */
export function rotateTo(a: V2, b: V2, phi: number): V2 {
  const th = mag(a) === 0 ? 0 : Math.atan2(a[1], a[0]);
  const m = mag(b);
  const r3 = (v: number) => Math.round(v * 1000) / 1000 || 0;
  return [r3(m * Math.cos(th + phi)), r3(m * Math.sin(th + phi))];
}
