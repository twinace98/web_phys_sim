// Static equilibrium of a ladder (Halliday Ch 12): uniform ladder of mass m and length L against a
// frictionless wall, on a floor with static friction μs; a person of mass M stands a distance d
// from the foot, measured along the ladder. θ is the angle between ladder and floor. DOM-free.

export const G = 9.8;

export interface LadderInput {
  /** Angle with the floor [rad]. */
  theta: number;
  /** Ladder length [m]. */
  L: number;
  /** Person's distance from the foot along the ladder [m], 0..L. */
  d: number;
  /** Ladder mass [kg]. */
  m: number;
  /** Person's mass [kg]. */
  M: number;
  /** Coefficient of static friction at the floor. */
  mu: number;
}

export interface Equilibrium {
  /** Wall normal force [N] (horizontal, away from the wall). */
  Fw: number;
  /** Floor normal force [N]. */
  N: number;
  /** Floor friction needed for equilibrium [N] (horizontal, toward the wall); equals Fw. */
  f: number;
  /** Largest static friction μs N [N]. */
  fmax: number;
  /** f / fmax (Infinity when fmax = 0 and f > 0). */
  ratio: number;
  /** f > μs N: no static equilibrium, the foot slips away from the wall. */
  slips: boolean;
  /** Lever arms about the foot [m]: ladder weight, person's weight, wall force. */
  armMg: number;
  armPerson: number;
  armWall: number;
}

/**
 * Torques about the foot (counter-clockwise positive, wall on the right):
 * F_w L sinθ − mg (L/2) cosθ − Mg d cosθ = 0 → F_w = (m/2 + M d/L) g cotθ.
 * Forces: N = (m + M) g, f = F_w.
 */
export function equilibrium(q: LadderInput): Equilibrium {
  const c = Math.cos(q.theta);
  const s = Math.sin(q.theta);
  const armMg = (q.L / 2) * c;
  const armPerson = q.d * c;
  const armWall = q.L * s;
  const Fw = (q.m * G * armMg + q.M * G * armPerson) / armWall;
  const N = (q.m + q.M) * G;
  const f = Fw;
  const fmax = q.mu * N;
  const ratio = fmax > 0 ? f / fmax : f > 0 ? Infinity : 0;
  return { Fw, N, f, fmax, ratio, slips: f > fmax * (1 + 1e-12), armMg, armPerson, armWall };
}

/**
 * Residuals of the equilibrium conditions with the forces of `equilibrium` (all should vanish):
 * ΣF_x = f − F_w, ΣF_y = N − (m + M) g, Στ_foot, and Στ about the top (a second pivot).
 */
export function residuals(q: LadderInput, e: Equilibrium = equilibrium(q)): { Fx: number; Fy: number; tauFoot: number; tauTop: number } {
  const c = Math.cos(q.theta);
  const s = Math.sin(q.theta);
  // Positions relative to the foot (x toward the wall, y up); forces as vectors.
  const forces: { r: [number, number]; F: [number, number] }[] = [
    { r: [q.L * c, q.L * s], F: [-e.Fw, 0] },
    { r: [(q.L / 2) * c, (q.L / 2) * s], F: [0, -q.m * G] },
    { r: [q.d * c, q.d * s], F: [0, -q.M * G] },
    { r: [0, 0], F: [e.f, e.N] },
  ];
  let Fx = 0;
  let Fy = 0;
  let tauFoot = 0;
  let tauTop = 0;
  const top: [number, number] = [q.L * c, q.L * s];
  for (const { r, F } of forces) {
    Fx += F[0];
    Fy += F[1];
    tauFoot += r[0] * F[1] - r[1] * F[0];
    tauTop += (r[0] - top[0]) * F[1] - (r[1] - top[1]) * F[0];
  }
  return { Fx, Fy, tauFoot, tauTop };
}

/**
 * Critical angle: the ladder slips for θ < θc, tanθc = (m/2 + M d/L) / (μs (m + M)).
 * π/2 when μs = 0 (any lean slips); 0 when nothing loads the ladder (m = M = 0).
 */
export function criticalAngle(q: Omit<LadderInput, 'theta'>): number {
  return Math.atan2(q.m / 2 + (q.M * q.d) / q.L, q.mu * (q.m + q.M));
}

/**
 * Critical position: the highest person position (along the ladder, from the foot) that the
 * friction can hold, d_c = L (μs (m + M) tanθ − m/2) / M. d_c ≥ L: safe anywhere on the ladder;
 * d_c < 0: slips even with the person at the foot. Without a person (M = 0): +Infinity if the
 * empty ladder holds, −Infinity if it slips.
 */
export function criticalPosition(q: Omit<LadderInput, 'd'>): number {
  const num = q.mu * (q.m + q.M) * Math.tan(q.theta) - q.m / 2;
  if (q.M <= 0) return num >= 0 ? Infinity : -Infinity;
  return (q.L * num) / q.M;
}

// ---------------------------------------------------------------- climbing and slipping

/** The ladder (uniform rod) with the climber as a point mass M fixed at d along it. */
export interface Body {
  L: number;
  m: number;
  M: number;
  /** Climber's distance from the foot along the ladder [m]. */
  d: number;
}

/** Composite body: total mass, CM distance from the foot along the ladder, moment of inertia about the CM. */
export function composite(b: Body): { mt: number; rc: number; Ic: number } {
  const mt = b.m + b.M;
  const rc = mt > 0 ? ((b.m * b.L) / 2 + b.M * b.d) / mt : b.L / 2;
  const Ic = (b.m * b.L * b.L) / 12 + b.m * (b.L / 2 - rc) ** 2 + b.M * (b.d - rc) ** 2;
  return { mt, rc, Ic };
}

export interface SlipForces {
  /** Angular acceleration θ'' [rad/s²] (θ'' < 0: the ladder falls). */
  alpha: number;
  /** Floor normal force [N]. */
  N: number;
  /** Wall normal force [N]; the top stays on the wall only while F_w ≥ 0. */
  Fw: number;
  /** Kinetic friction μk N at the foot [N], toward the wall (the foot slides away from it). */
  f: number;
}

/** Solve the 3×3 linear system a x = r (Gaussian elimination with partial pivoting). */
function solve3(a: number[][], r: number[]): number[] {
  const m = a.map((row, i) => [...row, r[i]]);
  for (let c = 0; c < 3; c++) {
    let piv = c;
    for (let i = c + 1; i < 3; i++) if (Math.abs(m[i][c]) > Math.abs(m[piv][c])) piv = i;
    [m[c], m[piv]] = [m[piv], m[c]];
    for (let i = c + 1; i < 3; i++) {
      const k = m[i][c] / m[c][c];
      for (let j = c; j < 4; j++) m[i][j] -= k * m[c][j];
    }
  }
  const x = [0, 0, 0];
  for (let i = 2; i >= 0; i--) {
    let s = m[i][3];
    for (let j = i + 1; j < 3; j++) s -= m[i][j] * x[j];
    x[i] = s / m[i][i];
  }
  return x;
}

/**
 * Newton's laws for the composite body while the foot slides along the floor (away from the wall)
 * and the top slides down the frictionless wall; one degree of freedom θ. With the CM at r_c from
 * the foot, x_cm = −(L − r_c) cos θ, y_cm = r_c sin θ (wall at x = 0):
 *   (m+M) ẍ_cm = f − F_w,  (m+M) ÿ_cm = N − (m+M) g,
 *   I_cm θ'' = −r_c cos θ N + r_c sin θ f + (L − r_c) sin θ F_w,  f = μk N.
 * Linear in θ'', N, F_w for given θ, θ'.
 */
export function slipForces(b: Body, muk: number, th: number, om: number): SlipForces {
  const { mt, rc, Ic } = composite(b);
  const s = Math.sin(th);
  const c = Math.cos(th);
  const a = b.L - rc;
  const w2 = om * om;
  const [alpha, N, Fw] = solve3(
    [
      [mt * a * s, -muk, 1],
      [mt * rc * c, -1, 0],
      [Ic, rc * (c - muk * s), -a * s],
    ],
    [-mt * a * c * w2, mt * rc * s * w2 - mt * G, 0],
  );
  return { alpha, N, Fw, f: muk * N };
}

/** Mechanical energy of ladder + climber [J] (floor at U = 0), from the rod and the point mass separately. */
export function mechEnergy(b: Body, th: number, om: number): number {
  const s = Math.sin(th);
  const c = Math.cos(th);
  const Krod = 0.5 * ((b.m * b.L * b.L) / 3) * om * om;
  const Kman = 0.5 * b.M * ((b.L - b.d) ** 2 * s * s + b.d * b.d * c * c) * om * om;
  const U = ((b.m * b.L) / 2 + b.M * b.d) * G * s;
  return Krod + Kman + U;
}

/** Velocity of the foot along the floor [m/s] (negative: away from the wall). */
export const footVelocity = (L: number, th: number, om: number): number => L * Math.sin(th) * om;

export type Phase = 'climb' | 'slip' | 'done';
/**
 * Why a run ended: top (the climber reached the top, no slip), holds (no climber, the ladder
 * holds), wall (the top leaves the wall, F_w = 0), floor (ladder flat), stick (the foot stops).
 */
export type EndReason = 'top' | 'holds' | 'wall' | 'floor' | 'stick';

export interface RunInput {
  theta: number;
  L: number;
  m: number;
  M: number;
  mu: number;
  /** Coefficient of kinetic friction. */
  muk: number;
  /** Start position of the climber [m]. */
  d0: number;
  /** Climbing speed along the ladder [m/s]. */
  v: number;
}

export interface RunState {
  t: number;
  phase: Phase;
  /** Climber's position along the ladder [m]. */
  d: number;
  th: number;
  om: number;
  /** Energy dissipated by kinetic friction since the onset [J]. */
  W: number;
  /** Mechanical energy at the onset [J]. */
  E0: number;
  /** Onset time of the slip [s]. */
  tSlip: number | null;
  /** Time of the end event [s] (the state is frozen there). */
  tStop: number | null;
  end: EndReason | null;
}

export const startRun = (q: RunInput): RunState => ({
  t: 0,
  phase: 'climb',
  d: q.d0,
  th: q.theta,
  om: 0,
  W: 0,
  E0: NaN,
  tSlip: null,
  tStop: null,
  end: null,
});

/** Slip substeps per run step. */
export const SUB = 8;

type Y = [number, number, number];

/** θ, θ', W (energy dissipated by friction, Ẇ = −f v_foot ≥ 0). */
function deriv(b: Body, muk: number, y: Y): Y {
  const sf = slipForces(b, muk, y[0], y[1]);
  return [y[1], sf.alpha, -sf.f * footVelocity(b.L, y[0], y[1])];
}

function rk4(b: Body, muk: number, y: Y, h: number): Y {
  const k1 = deriv(b, muk, y);
  const k2 = deriv(b, muk, [y[0] + (h / 2) * k1[0], y[1] + (h / 2) * k1[1], y[2] + (h / 2) * k1[2]]);
  const k3 = deriv(b, muk, [y[0] + (h / 2) * k2[0], y[1] + (h / 2) * k2[1], y[2] + (h / 2) * k2[2]]);
  const k4 = deriv(b, muk, [y[0] + h * k3[0], y[1] + h * k3[1], y[2] + h * k3[2]]);
  return [0, 1, 2].map((i) => y[i] + (h / 6) * (k1[i] + 2 * k2[i] + 2 * k3[i] + k4[i])) as Y;
}

/** End event at y: the ladder lies flat, the foot stops, or the top would need a pull (F_w < 0). */
function event(b: Body, muk: number, y: Y): EndReason | null {
  if (y[0] <= 0) return 'floor';
  if (y[1] >= 0) return 'stick';
  if (slipForces(b, muk, y[0], y[1]).Fw < 0) return 'wall';
  return null;
}

function finish(s: RunState, why: EndReason, at: number): void {
  s.phase = 'done';
  s.end = why;
  s.tStop = at;
}

/** Integrate the slip for `dt` seconds starting at time t0; stops exactly at an end event. */
function slip(s: RunState, q: RunInput, dt: number, t0: number, hs: number): void {
  const b: Body = { L: q.L, m: q.m, M: q.M, d: s.d };
  const n = Math.max(1, Math.ceil(dt / hs - 1e-9));
  const h = dt / n;
  let y: Y = [s.th, s.om, s.W];
  for (let i = 0; i < n; i++) {
    const y1 = rk4(b, q.muk, y, h);
    const why = event(b, q.muk, y1);
    if (why) {
      // Bisect for the event time inside this substep; stop on the near side of it.
      let lo = 0;
      let hi = h;
      for (let k = 0; k < 60; k++) {
        const mid = (lo + hi) / 2;
        if (event(b, q.muk, rk4(b, q.muk, y, mid))) hi = mid;
        else lo = mid;
      }
      y = rk4(b, q.muk, y, lo);
      [s.th, s.om, s.W] = y;
      finish(s, why, t0 + i * h + lo);
      return;
    }
    y = y1;
  }
  [s.th, s.om, s.W] = y;
}

/**
 * One run step of length h. Climb: d grows at v while the static analysis holds; the slip starts
 * exactly when d reaches d_c (inside the step). Slip: the climber stays at d_c; RK4 substeps of the
 * one-degree-of-freedom motion until an end event. The clock always advances by h.
 */
export function advanceRun(s: RunState, h: number, q: RunInput): void {
  let left = h;
  if (s.phase === 'climb') {
    const dc = criticalPosition({ theta: q.theta, L: q.L, m: q.m, M: q.M, mu: q.mu });
    const begin = (tau: number) => {
      s.phase = 'slip';
      s.tSlip = s.t + tau;
      s.E0 = mechEnergy({ L: q.L, m: q.m, M: q.M, d: s.d }, s.th, 0);
      left = h - tau;
    };
    if (s.d >= dc) begin(0);
    else if (q.M <= 0) finish(s, 'holds', s.t);
    else if (s.d >= q.L) finish(s, 'top', s.t);
    else {
      const target = Math.min(dc, q.L);
      const tau = (target - s.d) / q.v;
      if (tau <= h) {
        s.d = target;
        if (dc <= q.L) begin(tau);
        else finish(s, 'top', s.t + tau);
      } else s.d += q.v * h;
    }
  }
  if (s.phase === 'slip' && left > 0) slip(s, q, left, s.t + (h - left), h / SUB);
  s.t += h;
}

/** Run to the end (or tMax); the final state's t is the run's end on the step grid. */
export function runToEnd(q: RunInput, h: number, tMax = 600): RunState {
  const s = startRun(q);
  while (s.phase !== 'done' && s.t < tMax) advanceRun(s, h, q);
  return s;
}
