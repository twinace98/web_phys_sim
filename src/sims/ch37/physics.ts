// Ch 37: special relativity with c = 1 (lengths in light-seconds, times in seconds). DOM-free.

export const gamma = (beta: number) => 1 / Math.sqrt(1 - beta * beta);

/** Lorentz transformation from S to S' (S' moves at +β along x): [x', t']. */
export function lorentz(x: number, t: number, beta: number): [number, number] {
  const g = gamma(beta);
  return [g * (x - beta * t), g * (t - beta * x)];
}

/** Inverse transformation, S' → S. */
export const inverse = (xp: number, tp: number, beta: number): [number, number] => lorentz(xp, tp, -beta);

/** Triangle wave between 0 and L with period P (light bouncing between two mirrors). */
export function bounce(t: number, P: number, L: number): number {
  const u = (((t / P) % 1) + 1) % 1;
  return u < 0.5 ? 2 * u * L : 2 * (1 - u) * L;
}

/** Light clock of height L at rest: one tick (round trip) takes 2L. */
export const restPeriod = (L: number) => 2 * L;

/** Seen moving at β, the light runs a zigzag at c, so each tick takes γ·2L. */
export const movingPeriod = (L: number, beta: number) => gamma(beta) * 2 * L;

/** Completed ticks after time t. */
export const ticks = (t: number, period: number) => Math.floor(t / period + 1e-9);

/** Length of a rod of proper length L0 moving at β. */
export const contracted = (L0: number, beta: number) => L0 / gamma(beta);

/**
 * Flash at the centre of a train of proper length L0 (at rest in S', moving at +β in S), at
 * t = t' = 0 at x = x' = 0. Times the light reaches the rear and the front, in S and in S'.
 */
export function trainEvents(L0: number, beta: number): { rearS: number; frontS: number; rearSp: number; frontSp: number } {
  const g = gamma(beta);
  return {
    rearS: L0 / (2 * g * (1 + beta)),
    frontS: L0 / (2 * g * (1 - beta)),
    rearSp: L0 / 2,
    frontSp: L0 / 2,
  };
}

/** Spacetime interval (ct)² − x², the same in every frame. */
export const interval = (x: number, t: number) => t * t - x * x;

// ------------------------------------------------------------------ spacetime-diagram readings

/** An event with its coordinates in S (x, ct) and in S' (x', ct'). */
export interface Event2 {
  x: number;
  t: number;
  xp: number;
  tp: number;
}

/** Event given in S' coordinates, with its S coordinates. */
export function fromSp(xp: number, tp: number, beta: number): Event2 {
  const [x, t] = inverse(xp, tp, beta);
  return { x, t, xp, tp };
}

/** Event given in S coordinates, with its S' coordinates. */
export function fromS(x: number, t: number, beta: number): Event2 {
  const [xp, tp] = lorentz(x, t, beta);
  return { x, t, xp, tp };
}

/**
 * Time dilation on the diagram: a clock at rest at x' = 0 reads ct' = tau at event E. The line of
 * simultaneity in S through E (horizontal) meets the S clock at x = 0 at ct = γ·tau.
 */
export function dilationEvents(tau: number, beta: number): { E: Event2; S: Event2 } {
  const E = fromSp(0, tau, beta);
  return { E, S: fromS(0, E.t, beta) };
}

/**
 * Length contraction on the diagram: a rod at rest in S' between x' = front − L0 and x' = front.
 * F is its front end at ct' = tp. R is the rear end at the same time in S (same ct as F), R' the
 * rear end at the same time in S' (same ct' as F). L = x_F − x_R = L0/γ; x'_F − x'_R' = L0.
 */
export function rodEvents(L0: number, front: number, tp: number, beta: number): { F: Event2; R: Event2; Rp: Event2 } {
  const F = fromSp(front, tp, beta);
  const g = gamma(beta);
  // Rear worldline in S: x = (front − L0)/γ + β ct.
  const R = fromS((front - L0) / g + beta * F.t, F.t, beta);
  return { F, R, Rp: fromSp(front - L0, tp, beta) };
}
