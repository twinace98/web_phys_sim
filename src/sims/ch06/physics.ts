// Ch 6: static and kinetic friction, and the net force in uniform circular motion. DOM-free.

export const G = 9.8;
const DEG = Math.PI / 180;

// ------------------------------------------------------------------ friction

export interface Material {
  mus: number;
  muk: number;
}

/** Typical textbook values (dry surfaces). */
export const MATERIALS: Record<string, Material> = {
  wood: { mus: 0.5, muk: 0.3 },
  steel: { mus: 0.74, muk: 0.57 },
  rubber: { mus: 1.0, muk: 0.8 },
  ice: { mus: 0.1, muk: 0.03 },
};

export interface FrictionState {
  /** Displacement along the surface (down the slope on the incline) [m]. */
  x: number;
  v: number;
  a: number;
  /** Size of the friction force [N]. */
  f: number;
  /** Normal force [N]. */
  N: number;
  /** Applied force (horizontal mode) [N]. */
  F: number;
  /** Incline angle [rad]. */
  theta: number;
  sliding: boolean;
}

/** Horizontal pull F = k t on a block of mass m. */
export interface Pull {
  m: number;
  k: number;
  mat: Material;
}

/** Time at which the pull reaches the maximum static friction μs N. */
export const slipTimePull = (p: Pull) => (p.mat.mus * p.m * G) / p.k;

/**
 * Static: f = F (as much as needed), at rest. Once F exceeds μs N the block slides and f drops to
 * μk N: a = (F − μk N)/m, integrated exactly from the slip time.
 */
export function pullAt(p: Pull, t: number): FrictionState {
  const N = p.m * G;
  const F = p.k * t;
  const ts = slipTimePull(p);
  if (t < ts) return { x: 0, v: 0, a: 0, f: F, N, F, theta: 0, sliding: false };
  const tau = t - ts;
  const d = (p.mat.mus - p.mat.muk) * N; // jump of the net force at the slip
  return {
    x: (d * tau * tau) / 2 / p.m + (p.k * tau ** 3) / 6 / p.m,
    v: (d * tau + (p.k * tau * tau) / 2) / p.m,
    a: (F - p.mat.muk * N) / p.m,
    f: p.mat.muk * N,
    N,
    F,
    theta: 0,
    sliding: true,
  };
}

/** Incline tilted at a constant rate w [rad/s] until the block slips, then held at that angle. */
export interface Tilt {
  m: number;
  w: number;
  mat: Material;
}

/** Critical angle: tan θc = μs. */
export const criticalAngle = (mat: Material) => Math.atan(mat.mus);
export const slipTimeTilt = (p: Tilt) => criticalAngle(p.mat) / p.w;
/** Acceleration down the slope once sliding at θc. */
export const slideAccel = (p: Tilt) => {
  const th = criticalAngle(p.mat);
  return G * (Math.sin(th) - p.mat.muk * Math.cos(th));
};

export function tiltAt(p: Tilt, t: number): FrictionState {
  const tc = slipTimeTilt(p);
  if (t < tc) {
    const th = p.w * t;
    const N = p.m * G * Math.cos(th);
    return { x: 0, v: 0, a: 0, f: p.m * G * Math.sin(th), N, F: 0, theta: th, sliding: false };
  }
  const th = criticalAngle(p.mat);
  const a = slideAccel(p);
  const tau = t - tc;
  const N = p.m * G * Math.cos(th);
  return { x: 0.5 * a * tau * tau, v: a * tau, a, f: p.mat.muk * N, N, F: 0, theta: th, sliding: true };
}

// ------------------------------------------------------------------ circular motion: the real forces

export type Preset = 'string' | 'flat' | 'banked' | 'cone';

export interface Setup {
  m: number;
  r: number;
  v: number;
  /** Bank angle (banked) or string angle from the vertical (cone) [rad]. */
  theta: number;
}

/** Each force as (inward radial, vertical up) components [N]. */
export interface Force {
  name: 'T' | 'N' | 'W' | 'f';
  r: number;
  z: number;
}

/** Conical pendulum string length [m]. */
export const L_CONE = 1;
/** Coefficient of static friction: dry asphalt, and ice (the "icy road" past the quarter lap). */
export const MU_DRY = 0.6;
export const MU_ICE = MATERIALS.ice.mus;

export const SETUPS: Record<Preset, Setup> = {
  // Ball on a frictionless table, string to a peg at the centre.
  string: { m: 0.5, r: 1, v: 3, theta: 0 },
  // Car on a flat curve, held by static friction.
  flat: { m: 1000, r: 20, v: 10, theta: 0 },
  // Car on a banked curve, by default at its design speed v² = g r tan θ (no friction needed).
  banked: { m: 1000, r: 20, v: Math.sqrt(G * 20 * Math.tan(20 * DEG)), theta: 20 * DEG },
  // Conical pendulum: string length 1 m at 30° from the vertical, v² = g r tan θ.
  cone: { m: 0.5, r: L_CONE * Math.sin(30 * DEG), v: Math.sqrt(G * L_CONE * Math.sin(30 * DEG) * Math.tan(30 * DEG)), theta: 30 * DEG },
};

/**
 * Conical pendulum angle from the vertical for speed v: tan θ = v²/(g r) with r = L sin θ, so
 * sin θ tan θ = v²/(g L), i.e. cos²θ + k cos θ − 1 = 0 with k = v²/(g L).
 */
export function coneAngle(v: number): number {
  const k = (v * v) / (G * L_CONE);
  return Math.acos((-k + Math.sqrt(k * k + 4)) / 2);
}

/**
 * The setup of a preset at speed v. Mass, radius and bank angle stay; the conical pendulum keeps
 * its string length, so its angle and radius follow from v.
 */
export function setupAt(pr: Preset, v: number): Setup {
  const s = SETUPS[pr];
  if (pr !== 'cone') return { ...s, v };
  const theta = coneAngle(v);
  return { m: s.m, r: L_CONE * Math.sin(theta), v, theta };
}

/** mv²/r: the net inward force uniform circular motion needs. */
export const required = (s: Setup) => (s.m * s.v * s.v) / s.r;

/** Banked curve: design speed √(g r tan θ), at which no friction is needed. */
export const designSpeed = (s: Setup) => Math.sqrt(G * s.r * Math.tan(s.theta));

/**
 * Banked curve: static friction along the road [N], positive down the slope (v above the design
 * speed), negative up the slope (below it). From N sin θ + f cos θ = mv²/r, N cos θ − f sin θ = mg.
 */
export const bankFriction = (s: Setup) => required(s) * Math.cos(s.theta) - s.m * G * Math.sin(s.theta);
/** Banked curve: normal force [N]. */
export const bankNormal = (s: Setup) => s.m * G * Math.cos(s.theta) + required(s) * Math.sin(s.theta);

/** Flat curve: the car skids on ice when the friction it needs exceeds μs,ice mg. */
export const skidsOnIce = (s: Setup) => required(s) > MU_ICE * s.m * G;
/** Flat curve: the speed above which a road with μs cannot hold the car, √(μs g r). */
export const skidSpeed = (s: Setup, mu: number) => Math.sqrt(mu * G * s.r);

/**
 * Real forces on the object. `released`: the string is cut (string, cone) or the car skids on ice
 * (flat). The banked curve needs friction only away from its design speed.
 */
export function forces(pr: Preset, released = false, s: Setup = SETUPS[pr]): Force[] {
  const W = s.m * G;
  const need = required(s);
  switch (pr) {
    case 'string':
      return [{ name: 'W', r: 0, z: -W }, { name: 'N', r: 0, z: W }, ...(released ? [] : [{ name: 'T' as const, r: need, z: 0 }])];
    case 'flat':
      return [{ name: 'W', r: 0, z: -W }, { name: 'N', r: 0, z: W }, ...(released ? [] : [{ name: 'f' as const, r: need, z: 0 }])];
    case 'banked': {
      const N = bankNormal(s);
      const f = bankFriction(s);
      // At the design speed f vanishes up to rounding: no friction arrow.
      const fr = Math.abs(f) > 1e-9 * W ? [{ name: 'f' as const, r: f * Math.cos(s.theta), z: -f * Math.sin(s.theta) }] : [];
      return [{ name: 'W', r: 0, z: -W }, { name: 'N', r: N * Math.sin(s.theta), z: N * Math.cos(s.theta) }, ...fr];
    }
    case 'cone': {
      const T = W / Math.cos(s.theta);
      return [{ name: 'W', r: 0, z: -W }, ...(released ? [] : [{ name: 'T' as const, r: T * Math.sin(s.theta), z: T * Math.cos(s.theta) }])];
    }
  }
}

export function netForce(pr: Preset, released = false, s: Setup = SETUPS[pr]): { r: number; z: number } {
  let r = 0;
  let z = 0;
  for (const f of forces(pr, released, s)) {
    r += f.r;
    z += f.z;
  }
  return { r, z };
}

/** Period of one lap. */
export const lapTime = (s: Setup) => (2 * Math.PI * s.r) / s.v;

/**
 * Top-view position and velocity: counter-clockwise from the bottom of the circle; after `tRel`
 * (if any) the object keeps the velocity it had and moves along the tangent.
 */
export function topViewAt(s: Setup, t: number, tRel = Infinity) {
  const w = s.v / s.r;
  const tc = Math.min(t, tRel);
  const ph = -Math.PI / 2 + w * tc;
  const x = s.r * Math.cos(ph);
  const y = s.r * Math.sin(ph);
  const vx = -s.v * Math.sin(ph);
  const vy = s.v * Math.cos(ph);
  const d = Math.max(0, t - tRel);
  return { x: x + vx * d, y: y + vy * d, vx, vy, onCircle: t < tRel };
}

/**
 * Speed [m/s] in the ground frame. Every preset keeps its speed v on the circle, and the released
 * string ball and the car on ice keep it along the tangent (no horizontal force). The cut conical
 * pendulum also falls freely, so it gains g(t − tRel) downward: |v| = √(v² + (g(t − tRel))²).
 */
export function speedAt(pr: Preset, t: number, tRel = Infinity, s: Setup = SETUPS[pr]): number {
  const v = s.v;
  if (pr !== 'cone' || t <= tRel) return v;
  return Math.hypot(v, G * (t - tRel));
}

// ------------------------------------------------------------------ the frame rotating with the object

/** Angular speed of the circular motion [rad/s]. */
export const omega = (s: Setup) => s.v / s.r;

/** Horizontal position [m] and velocity [m/s] in one frame. */
export interface Planar {
  x: number;
  y: number;
  vx: number;
  vy: number;
}

/**
 * The top view seen from the frame that rotates with the object at ω about the axis (a non-inertial
 * frame). The two frames coincide at t = 0: x′ = R(−ωt) x and v′ = R(−ωt)(v − ω ẑ × x).
 * On the circle the object rests at its start (0, −r); after the release it moves off along a path
 * that curves outward and backward.
 */
export function rotatingViewAt(s: Setup, t: number, tRel = Infinity): Planar & { onCircle: boolean } {
  const k = topViewAt(s, t, tRel);
  const w = omega(s);
  const c = Math.cos(w * t);
  const sn = Math.sin(w * t);
  // ω ẑ × x = (−ω y, ω x)
  const ux = k.vx + w * k.y;
  const uy = k.vy - w * k.x;
  return { x: c * k.x + sn * k.y, y: -sn * k.x + c * k.y, vx: c * ux + sn * uy, vy: -sn * ux + c * uy, onCircle: k.onCircle };
}

/**
 * Fictitious forces in the rotating frame [N]: centrifugal m ω² x′ (away from the axis) and
 * Coriolis −2m ω ẑ × v′ (perpendicular to v′, to its right for counter-clockwise rotation).
 */
export function fictitious(s: Setup, q: Planar): { cf: { x: number; y: number }; cor: { x: number; y: number } } {
  const w = omega(s);
  return {
    cf: { x: s.m * w * w * q.x, y: s.m * w * w * q.y },
    cor: { x: 2 * s.m * w * q.vy, y: -2 * s.m * w * q.vx },
  };
}
