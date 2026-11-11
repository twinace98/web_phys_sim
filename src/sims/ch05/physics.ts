// Ch 5: Newton's laws and inertial frames. Exact (piecewise-constant forces), DOM-free.

export interface Kin {
  x: number;
  v: number;
  a: number;
}

/** Motion from rest at x = 0 under acceleration a0 for 0 ≤ t < tOff, then a = 0. */
export function pushedAt(a0: number, tOff: number, t: number): Kin {
  if (t < tOff) return { x: 0.5 * a0 * t * t, v: a0 * t, a: a0 };
  const v = a0 * tOff;
  return { x: 0.5 * a0 * tOff * tOff + v * (t - tOff), v, a: 0 };
}

// ------------------------------------------------------------------ first and second law

export interface Push {
  /** Applied force [N]. */
  F: number;
  /** Mass [kg]. */
  m: number;
  /** The force acts for 0 ≤ t < tOff [s] (Infinity: always). */
  tOff: number;
}

export const netForce = (p: Push, t: number) => (t < p.tOff ? p.F : 0);
export const pushState = (p: Push, t: number): Kin => pushedAt(p.F / p.m, p.tOff, t);

// ------------------------------------------------------------------ third law: two carts

export interface Carts {
  mA: number;
  mB: number;
  /** Size of the contact force each cart exerts on the other [N]. */
  F: number;
  /** Contact time [s]. */
  tc: number;
}

/**
 * A (left) and B (right) push each other apart from rest. F_AB (on A by B) = −F, F_BA (on B by A) = +F:
 * equal and opposite, so a_A = −F/m_A and a_B = F/m_B.
 */
export function cartsAt(c: Carts, t: number) {
  const on = t < c.tc;
  const A = pushedAt(-c.F / c.mA, c.tc, t);
  const B = pushedAt(c.F / c.mB, c.tc, t);
  return { FA: on ? -c.F : 0, FB: on ? c.F : 0, A, B };
}

// ------------------------------------------------------------------ inertial frames: ball in a train

export interface Train {
  /** Train speed at t = 0 relative to the ground [m/s]. */
  v0: number;
  /** Train acceleration relative to the ground [m/s²] (0: uniform motion). */
  A: number;
  /** Ball position in the train at t = 0 [m]. */
  b0: number;
}

/** Train (its centre) relative to the ground. */
export const trainAt = (tr: Train, t: number): Kin => ({ x: tr.v0 * t + 0.5 * tr.A * t * t, v: tr.v0 + tr.A * t, a: tr.A });

/** No horizontal force on the ball (frictionless table): in the ground frame it keeps the train's initial velocity. */
export const ballGround = (tr: Train, t: number): Kin => ({ x: tr.b0 + tr.v0 * t, v: tr.v0, a: 0 });

/** The ball seen from the train: x' = x − x_train. */
export function ballInTrain(tr: Train, t: number): Kin {
  const b = ballGround(tr, t);
  const c = trainAt(tr, t);
  return { x: b.x - c.x, v: b.v - c.v, a: b.a - c.a };
}
