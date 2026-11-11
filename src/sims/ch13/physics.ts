// Ch 13: a probe in the gravity of the Earth. Newtonian two-body problem with the Earth fixed,
// integrated with Yoshida's 4th-order symplectic scheme so energy and angular momentum stay
// constant to display precision over many orbits. SI units throughout. DOM-free.

export const GM = 3.986e14; // m³/s², Earth
export const R_EARTH = 6.371e6; // m

export type V2 = [number, number];

export interface Body {
  x: V2;
  v: V2;
}

const W1 = 1 / (2 - Math.cbrt(2));
const W0 = -Math.cbrt(2) * W1;
const C = [W1 / 2, (W0 + W1) / 2, (W0 + W1) / 2, W1 / 2];
const D = [W1, W0, W1];

export function accel(x: V2, gm = GM): V2 {
  const r2 = x[0] * x[0] + x[1] * x[1];
  const k = -gm / (r2 * Math.sqrt(r2));
  return [k * x[0], k * x[1]];
}

/** One Yoshida (4th-order, symplectic, time-reversible) step of size dt, in place. */
export function yoshida(b: Body, dt: number, gm = GM): void {
  for (let i = 0; i < 4; i++) {
    b.x[0] += C[i] * dt * b.v[0];
    b.x[1] += C[i] * dt * b.v[1];
    if (i < 3) {
      const a = accel(b.x, gm);
      b.v[0] += D[i] * dt * a[0];
      b.v[1] += D[i] * dt * a[1];
    }
  }
}

export const radius = (b: Body) => Math.hypot(b.x[0], b.x[1]);
export const speed = (b: Body) => Math.hypot(b.v[0], b.v[1]);
/** Specific energy E/m = v²/2 − GM/r. */
export const energy = (b: Body, gm = GM) => 0.5 * (b.v[0] ** 2 + b.v[1] ** 2) - gm / radius(b);
/** Specific angular momentum L/m = x vy − y vx. */
export const angMom = (b: Body) => b.x[0] * b.v[1] - b.x[1] * b.v[0];
export const escapeSpeed = (r: number, gm = GM) => Math.sqrt((2 * gm) / r);
export const circularSpeed = (r: number, gm = GM) => Math.sqrt(gm / r);

export type OrbitKind = 'ellipse' | 'parabola' | 'hyperbola';

/** Sign of E decides: E < 0 bound (ellipse, circle included), E = 0 parabola, E > 0 hyperbola. */
export function classify(b: Body, gm = GM, tol = 1e-9): OrbitKind {
  const e = energy(b, gm) / (gm / radius(b));
  return e < -tol ? 'ellipse' : e > tol ? 'hyperbola' : 'parabola';
}

/** Orbital elements from the state: semi-major axis (Infinity for a parabola), eccentricity, periapsis. */
export function elements(b: Body, gm = GM) {
  const E = energy(b, gm);
  const h = angMom(b);
  const e = Math.sqrt(Math.max(0, 1 + (2 * E * h * h) / (gm * gm)));
  const a = E === 0 ? Infinity : -gm / (2 * E);
  const rp = (h * h) / (gm * (1 + e));
  return { a, e, rp, period: E < 0 ? 2 * Math.PI * Math.sqrt(a ** 3 / gm) : Infinity };
}
