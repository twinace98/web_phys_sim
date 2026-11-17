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
