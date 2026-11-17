// Ch 11: a puck on a frictionless table, tied to a string through a hole. The string pulls
// along the radius, so its torque about the hole is zero and L = m r² ω stays constant while
// the string is pulled in or let out. r(t) is prescribed; the angle follows from
// dφ/dt = L / (m r²), integrated with RK4.

export type Mode = 'pull' | 'release' | 'both';

export interface Pull {
  mode: Mode;
  m: number;
  /** Outer and inner radius [m]. */
  rOut: number;
  rIn: number;
  /** Angular velocity at the outer radius [rad/s]; fixes L = m rOut² ω. */
  wOut: number;
  /** Duration of one pull or release [s]. */
  tRamp: number;
  /** Time held on a circle before the first ramp [s]. */
  tHold: number;
}

interface Ramp {
  t0: number;
  r0: number;
  r1: number;
}

function ramps(c: Pull): Ramp[] {
  const a = c.tHold;
  switch (c.mode) {
    case 'pull':
      return [{ t0: a, r0: c.rOut, r1: c.rIn }];
    case 'release':
      return [{ t0: a, r0: c.rIn, r1: c.rOut }];
    case 'both':
      return [
        { t0: a, r0: c.rOut, r1: c.rIn },
        { t0: a + c.tRamp + 1, r0: c.rIn, r1: c.rOut },
      ];
  }
}

export function endTime(c: Pull): number {
  const rs = ramps(c);
  return rs[rs.length - 1].t0 + c.tRamp + c.tHold;
}

export const angMom = (c: Pull) => c.m * c.rOut * c.rOut * c.wOut;

/** r, dr/dt, d²r/dt² at time t. Each ramp is a half cosine: smooth start and stop. */
export function radius(c: Pull, t: number): { r: number; v: number; a: number } {
  const rs = ramps(c);
  let r = rs[0].r0;
  for (const q of rs) {
    if (t < q.t0) break;
    const s = (t - q.t0) / c.tRamp;
    if (s >= 1) {
      r = q.r1;
      continue;
    }
    const d = q.r1 - q.r0;
    const k = Math.PI / c.tRamp;
    return { r: q.r0 + (d * (1 - Math.cos(Math.PI * s))) / 2, v: (d * k * Math.sin(Math.PI * s)) / 2, a: (d * k * k * Math.cos(Math.PI * s)) / 2 };
  }
  return { r, v: 0, a: 0 };
}

export const omega = (c: Pull, t: number) => angMom(c) / (c.m * radius(c, t).r ** 2);

/** One RK4 step of dφ/dt = ω(t). */
export function stepAngle(c: Pull, phi: number, t: number, h: number): number {
  const k1 = omega(c, t);
  const k2 = omega(c, t + h / 2);
  const k4 = omega(c, t + h);
  return phi + (h / 6) * (k1 + 4 * k2 + k4);
}

/** Kinetic energy ½ m (ṙ² + r² ω²). */
export function kinetic(c: Pull, t: number): number {
  const k = radius(c, t);
  const w = omega(c, t);
  return 0.5 * c.m * (k.v * k.v + k.r * k.r * w * w);
}

/** String tension needed for the prescribed r(t): T = m (r ω² − r̈). Must stay positive. */
export function tension(c: Pull, t: number): number {
  const k = radius(c, t);
  const w = omega(c, t);
  return c.m * (k.r * w * w - k.a);
}

/** Rate at which the string sweeps area: dA/dt = r² ω / 2 = L / (2m). */
export const arealVelocity = (c: Pull) => angMom(c) / (2 * c.m);

// ------------------------------------------------------------------ spinning chair

/**
 * A person on a frictionless spinning chair holds two dumbbells (mass m each) at distance r(t)
 * from the axis; body and chair have rotational inertia I0. No external torque about the axis,
 * so L = I ω stays fixed while I = I0 + 2 m r² changes. r(t) uses the same smooth ramps.
 */
export interface Chair extends Pull {
  I0: number;
}

export const chairInertia = (c: Chair, t: number) => c.I0 + 2 * c.m * radius(c, t).r ** 2;
export const chairL = (c: Chair) => (c.I0 + 2 * c.m * c.rOut * c.rOut) * c.wOut;
export const chairOmega = (c: Chair, t: number) => chairL(c) / chairInertia(c, t);

/** K = ½ I ω² + ½ (2m) ṙ² (rotation plus the dumbbells' radial motion). */
export function chairKinetic(c: Chair, t: number): number {
  const w = chairOmega(c, t);
  const v = radius(c, t).v;
  return 0.5 * chairInertia(c, t) * w * w + c.m * v * v;
}

export function stepChair(c: Chair, phi: number, t: number, h: number): number {
  return phi + (h / 6) * (chairOmega(c, t) + 4 * chairOmega(c, t + h / 2) + chairOmega(c, t + h));
}

// ------------------------------------------------------------------ rolling down an incline

/** Round bodies roll without slipping; the block slides on a frictionless track as a reference. */
export type Body = 'hoop' | 'disk' | 'sphere' | 'block';
export const BODIES: Body[] = ['hoop', 'disk', 'sphere', 'block'];

/** β = I_cm / (M R²). The block does not turn (no friction, no torque), so its β is 0. */
export const BETA: Record<Body, number> = { hoop: 1, disk: 1 / 2, sphere: 2 / 5, block: 0 };

export const G = 9.8;

/**
 * Acceleration of the centre and static friction per unit mass, from Newton's second law along the
 * incline and the torque about the centre, closed by the rolling condition a = α R:
 *   a + f/M = g sin θ,   β a − f/M = 0.
 * Solved as a 2×2 linear system (Cramer), so the closed form a = g sin θ / (1 + β) is a check, not an input.
 */
export function rollAccel(beta: number, theta: number, g = G): { a: number; f: number } {
  const [a11, a12, b1] = [1, 1, g * Math.sin(theta)];
  const [a21, a22, b2] = [beta, -1, 0];
  const det = a11 * a22 - a12 * a21;
  return { a: (b1 * a22 - a12 * b2) / det, f: (a11 * b2 - b1 * a21) / det };
}

export interface Incline {
  /** Incline angle [rad]. */
  theta: number;
  /** Length of the run along the incline [m]. */
  len: number;
  /** Radius of the round bodies [m]. */
  R: number;
  /** Mass of every body [kg]. */
  M: number;
}

/** Time to cover the run from rest. */
export const finishTime = (r: Incline, b: Body) => Math.sqrt((2 * r.len) / rollAccel(BETA[b], r.theta).a);

/**
 * State of one body at time t, released from rest at t = 0. It stops at the finish line, so
 * everything after its finish time is the value at the line.
 * s: distance of the contact point along the incline; v: centre speed; w: angular speed (v / R);
 * phi: turn angle, positive anticlockwise (rolling down to the right turns clockwise).
 */
export function rollState(r: Incline, b: Body, t: number) {
  const { a } = rollAccel(BETA[b], r.theta);
  const tt = Math.min(Math.max(t, 0), finishTime(r, b));
  const s = 0.5 * a * tt * tt;
  const v = a * tt;
  const w = b === 'block' ? 0 : v / r.R;
  const Kt = 0.5 * r.M * v * v;
  const Kr = 0.5 * BETA[b] * r.M * r.R * r.R * w * w;
  return { s, v, w, phi: b === 'block' ? 0 : -s / r.R, a, Kt, Kr, drop: r.M * G * s * Math.sin(r.theta), done: t >= finishTime(r, b) };
}

/** Velocity of a point of a rigid body: v_cm + ω ẑ × r (ω positive anticlockwise). */
export function pointVelocity(vcm: { x: number; y: number }, wz: number, rel: { x: number; y: number }) {
  return { x: vcm.x - wz * rel.y, y: vcm.y + wz * rel.x };
}
