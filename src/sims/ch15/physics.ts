// Ch 15: simple harmonic motion as the projection of uniform circular motion, with optional
// light damping; the simple pendulum at large amplitude. DOM-free.

export interface Oscillator {
  /** Amplitude at t = 0 [m]; released from rest at x = A. */
  A: number;
  /** Spring constant [N/m]. */
  k: number;
  /** Mass [kg]. */
  m: number;
  /** Damping ratio ζ = b / (2√(km)); 0 for SHM. */
  zeta: number;
}

export const omega0 = (o: Oscillator) => Math.sqrt(o.k / o.m);
/** Damped angular frequency ω_d = ω₀√(1 − ζ²). */
export const omegaD = (o: Oscillator) => omega0(o) * Math.sqrt(1 - o.zeta * o.zeta);
export const period = (o: Oscillator) => (2 * Math.PI) / omegaD(o);

export interface OscState {
  x: number;
  v: number;
  a: number;
  K: number;
  U: number;
  E: number;
  /** Reference point: x = its vertical coordinate, v / ω₀-like horizontal coordinate. */
  px: number;
  py: number;
  /** Velocity and acceleration of the reference point. */
  pvx: number;
  pvy: number;
  pax: number;
  pay: number;
}

/**
 * Exact solution for release from rest at x = A (underdamped):
 * x = A e^{−γt}[cos ω_d t + (γ/ω_d) sin ω_d t].
 * The reference point moves on the spiral (circle when ζ = 0) R(t) = A' e^{−γt}, angle ω_d t − δ,
 * drawn so that its vertical coordinate is x(t). Its vertical velocity and acceleration are v and a.
 */
export function oscAt(o: Oscillator, t: number): OscState {
  const w0 = omega0(o);
  const wd = omegaD(o);
  const g = o.zeta * w0;
  // x = R0 e^{−γt} cos(ω_d t − δ) with tan δ = γ/ω_d, R0 = A / cos δ
  const delta = Math.atan2(g, wd);
  const R = (o.A / Math.cos(delta)) * Math.exp(-g * t);
  const th = wd * t - delta;
  // Reference point P = R(−sin θ, cos θ): counter-clockwise from the top, vertical coordinate = x.
  const P = [-R * Math.sin(th), R * Math.cos(th)];
  // Q = P rotated by +90°: P' = −γP + ω_d Q, P'' = −2γP' − ω₀²P.
  const Q = [-R * Math.cos(th), -R * Math.sin(th)];
  const V = [-g * P[0] + wd * Q[0], -g * P[1] + wd * Q[1]];
  const Acc = [-2 * g * V[0] - w0 * w0 * P[0], -2 * g * V[1] - w0 * w0 * P[1]];
  const x = P[1];
  const v = V[1];
  const K = 0.5 * o.m * v * v;
  const U = 0.5 * o.k * x * x;
  return { x, v, a: Acc[1], K, U, E: K + U, px: P[0], py: P[1], pvx: V[0], pvy: V[1], pax: Acc[0], pay: Acc[1] };
}

// ------------------------------------------------------------------ simple pendulum

/** θ'' = −(g/L) sin θ. */
export interface Pendulum {
  L: number;
  g: number;
}

export const smallAnglePeriod = (p: Pendulum) => 2 * Math.PI * Math.sqrt(p.L / p.g);

/** Arithmetic-geometric mean. */
export function agm(a: number, b: number): number {
  for (let i = 0; i < 40 && Math.abs(a - b) > 1e-15 * a; i++) [a, b] = [(a + b) / 2, Math.sqrt(a * b)];
  return (a + b) / 2;
}

/** Exact period for amplitude θ₀: T = T₀ / AGM(1, cos(θ₀/2)). */
export const exactPeriod = (p: Pendulum, theta0: number) => smallAnglePeriod(p) / agm(1, Math.cos(theta0 / 2));

/** One RK4 step of (θ, ω). */
export function pendulumStep(p: Pendulum, s: { th: number; w: number }, h: number): void {
  const k = p.g / p.L;
  const f = (th: number, w: number): [number, number] => [w, -k * Math.sin(th)];
  const [a1, b1] = f(s.th, s.w);
  const [a2, b2] = f(s.th + (h / 2) * a1, s.w + (h / 2) * b1);
  const [a3, b3] = f(s.th + (h / 2) * a2, s.w + (h / 2) * b2);
  const [a4, b4] = f(s.th + h * a3, s.w + h * b3);
  s.th += (h / 6) * (a1 + 2 * a2 + 2 * a3 + a4);
  s.w += (h / 6) * (b1 + 2 * b2 + 2 * b3 + b4);
}
