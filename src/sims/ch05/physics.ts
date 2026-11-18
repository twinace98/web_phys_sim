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

// ------------------------------------------------------------------ third law: two carts and a bumper

/**
 * Cart A carries a massless spring bumper (natural length L0, stiffness k) on its right face xA;
 * cart B's left face is xB. While the gap g = xB − xA is shorter than L0 the spring is compressed by
 * c = L0 − g and pushes on both: on B by +k·c (from A), on A by −k·c (from B). The two forces come
 * from the same compression, so they are equal and opposite at every instant for any masses.
 */
export interface Bumper {
  mA: number;
  mB: number;
  /** Spring constant [N/m]. */
  k: number;
  /** Natural length of the bumper [m]. */
  L0: number;
  /** 'collide': A at v0 hits B at rest; 'release': both at rest, spring compressed by c0. */
  mode: 'collide' | 'release';
  /** Initial velocity of A [m/s] (collide). */
  v0: number;
  /** Time at which the bumper touches B [s] (collide). */
  t1: number;
  /** Initial compression [m] (release). */
  c0: number;
}

export const bumperOmega = (b: Bumper) => Math.sqrt((b.k * (b.mA + b.mB)) / (b.mA * b.mB));

/** Time from contact to separation [s]. */
export const contactTime = (b: Bumper) => (b.mode === 'collide' ? Math.PI : Math.PI / 2) / bumperOmega(b);

/** Contact start, contact end [s]. */
export function contactWindow(b: Bumper): [number, number] {
  const t0 = b.mode === 'collide' ? b.t1 : 0;
  return [t0, t0 + contactTime(b)];
}

/** Largest spring force during the contact [N]. */
export function peakForce(b: Bumper): number {
  const mu = (b.mA * b.mB) / (b.mA + b.mB);
  return b.mode === 'collide' ? b.v0 * Math.sqrt(b.k * mu) : b.k * b.c0;
}

export interface BumperState {
  /** Faces: A's right face (bumper root) and B's left face [m]. */
  A: Kin;
  B: Kin;
  /** Spring compression [m]. */
  c: number;
  /** Force on A by B and on B by A [N]. */
  FA: number;
  FB: number;
}

/**
 * Exact motion. The centre of mass moves uniformly; the gap obeys c'' = −ω² c with ω² = k/μ
 * while the spring is compressed. Collide: B's face at 0 at t = 0, contact at t1.
 * Release: centre of mass at 0, released at t = 0.
 */
export function bumperAt(b: Bumper, t: number): BumperState {
  const M = b.mA + b.mB;
  const w = bumperOmega(b);
  const [t0, t2] = contactWindow(b);
  // Centre of mass (of the two faces) and its velocity.
  const V = b.mode === 'collide' ? (b.mA * b.v0) / M : 0;
  const g0 = b.mode === 'collide' ? b.L0 + b.v0 * b.t1 : b.L0 - b.c0;
  const X0 = b.mode === 'collide' ? (b.mA * -g0) / M : 0;
  // Gap g, its rate gd and compression c.
  let g: number;
  let gd: number;
  let c = 0;
  if (b.mode === 'collide') {
    if (t < t0) {
      g = g0 - b.v0 * t;
      gd = -b.v0;
    } else if (t < t2) {
      const s = t - t0;
      c = (b.v0 / w) * Math.sin(w * s);
      g = b.L0 - c;
      gd = -b.v0 * Math.cos(w * s);
    } else {
      g = b.L0 + b.v0 * (t - t2);
      gd = b.v0;
    }
  } else if (t < t2) {
    c = b.c0 * Math.cos(w * t);
    g = b.L0 - c;
    gd = b.c0 * w * Math.sin(w * t);
  } else {
    g = b.L0 + b.c0 * w * (t - t2);
    gd = b.c0 * w;
  }
  const F = b.k * c;
  // Relative acceleration g'' = F/μ, shared as −F/mA and +F/mB.
  const X = X0 + V * t;
  return {
    A: { x: X - (b.mB / M) * g, v: V - (b.mB / M) * gd, a: -F / b.mA || 0 },
    B: { x: X + (b.mA / M) * g, v: V + (b.mA / M) * gd, a: F / b.mB },
    c,
    // `|| 0`: no −0 once the carts have separated.
    FA: -F || 0,
    FB: F,
  };
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
