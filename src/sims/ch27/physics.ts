// Ch 27: RC circuit, exact. From a switch time with charge q0, the charge relaxes
// exponentially to its final value qf (Cε when charging, 0 when discharging).

export interface RC {
  /** Resistance [Ω]. */
  R: number;
  /** Capacitance [F]. */
  C: number;
  /** Battery emf [V]. */
  emf: number;
}

export const tau = (c: RC) => c.R * c.C;

/** Final charge for the switch position. */
export const finalCharge = (c: RC, charging: boolean) => (charging ? c.C * c.emf : 0);

/** Charge a time dt after the switch, starting from q0. */
export function chargeAt(c: RC, charging: boolean, q0: number, dt: number): number {
  const qf = finalCharge(c, charging);
  return qf + (q0 - qf) * Math.exp(-dt / tau(c));
}

/** Current dq/dt into the positive plate (negative while discharging). */
export function currentAt(c: RC, charging: boolean, q0: number, dt: number): number {
  const qf = finalCharge(c, charging);
  return ((qf - q0) / tau(c)) * Math.exp(-dt / tau(c));
}

/** Fraction of the way from start to final value after one time constant: 1 − 1/e ≈ 63 %. */
export const ONE_TAU = 1 - Math.exp(-1);
