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

/** Signed length of v along u: v cos φ (negative when v points backwards); 0 when u = 0. */
export function along(v: V2, u: V2): number {
  const m = mag(u);
  return m === 0 ? 0 : dot(u, v) / m;
}

/**
 * Signed height of v off the line of u: v sin φ with φ measured from u to v, positive on u's
 * counter-clockwise side; 0 when u = 0. Then u × v = u (v sin φ) k̂.
 */
export function across(v: V2, u: V2): number {
  const m = mag(u);
  return m === 0 ? 0 : crossZ(u, v) / m;
}

/** Part of v perpendicular to u, v − (projection on u): a vector of length |v sin φ|. */
export function reject(v: V2, u: V2): V2 {
  const p = project(v, u);
  return [v[0] - p[0], v[1] - p[1]];
}

/**
 * The parallelogram (u, v) sheared into a rectangle: the triangle O, F, v (F = foot of the
 * perpendicular from v's tip on the line of u) is cut off and moved along u to u, F + u, u + v.
 * Corners F, F + u, u + v, v: base |u| on the line of u, height |v sin φ| (F → v), the top edge shared
 * with the parallelogram, so the same (signed) area u × v.
 */
export function shearRect(u: V2, v: V2): [V2, V2, V2, V2] {
  const f = project(v, u);
  return [f, [f[0] + u[0], f[1] + u[1]], [u[0] + v[0], u[1] + v[1]], v];
}

/** Signed area of a polygon (shoelace), positive counter-clockwise. */
export function signedArea(pts: V2[]): number {
  let s = 0;
  for (let i = 0; i < pts.length; i++) {
    const [x0, y0] = pts[i];
    const [x1, y1] = pts[(i + 1) % pts.length];
    s += x0 * y1 - x1 * y0;
  }
  return s / 2;
}
