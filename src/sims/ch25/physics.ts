// Ch 25: parallel-plate capacitor with a dielectric filling the gap. Exact, DOM-free.
// C = κ ε0 A / d. Battery connected: V fixed. Disconnected: Q fixed at its reference value.

export const EPS0 = 8.854e-12;

export interface Plates {
  /** Plate area [m²]. */
  A: number;
  /** Plate separation [m]. */
  d: number;
  /** Dielectric constant of the material filling the gap. */
  kappa: number;
}

/** Dielectric constants (HRW Table 25-1). */
export const KAPPA: Record<string, number> = { air: 1.00054, paper: 3.5, glass: 4.7, water: 80.4 };

export const capacitance = (c: Plates) => (c.kappa * EPS0 * c.A) / c.d;

export interface CapState {
  C: number;
  Q: number;
  V: number;
  /** Field in the gap [V/m]. */
  E: number;
  /** Stored energy [J]. */
  U: number;
  /** Free charge density on the plates [C/m²]. */
  sigma: number;
  /** Induced (bound) charge density on the dielectric faces [C/m²]. */
  sigmaB: number;
}

/**
 * State of the capacitor. The reference state is the reference geometry with an empty gap
 * (κ = 1), charged to V0. Connected: V = V0. Disconnected: the charge Q0 = C_ref V0 stays.
 */
export function capState(c: Plates, connected: boolean, V0: number, ref: Plates): CapState {
  const C = capacitance(c);
  const Q = connected ? C * V0 : capacitance({ ...ref, kappa: 1 }) * V0;
  const V = Q / C;
  const sigma = Q / c.A;
  return { C, Q, V, E: V / c.d, U: (Q * V) / 2, sigma, sigmaB: sigma * (1 - 1 / c.kappa) };
}

/** Energy density ε0 κ E² / 2 times the gap volume; equals Q V / 2. */
export const fieldEnergy = (c: Plates, E: number) => 0.5 * c.kappa * EPS0 * E * E * c.A * c.d;
