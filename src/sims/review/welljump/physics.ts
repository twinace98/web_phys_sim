// Electron in an infinite square well: levels E_n = n²h²/(8mL²) and the photon of a transition.
// DOM-free. Units: L in nm, energies in eV, wavelengths in nm.
import { HC_EVNM } from '../hydrogen/physics';

/** Planck constant [J·s], electron mass [kg], elementary charge [C] (CODATA 2018). */
export const H_PLANCK = 6.62607015e-34;
export const M_E = 9.1093837015e-31;
export const E_CHARGE = 1.602176634e-19;

/** h²/(8mₑ) in eV·nm² (0.376 eV for L = 1 nm). */
export const E1_COEF = (H_PLANCK * H_PLANCK) / (8 * M_E) / E_CHARGE / 1e-18;

/** E_n = n² h²/(8 m L²) [eV] for a well of width L [nm]. */
export const level = (n: number, L: number): number => (E1_COEF * n * n) / (L * L);

/** Photon energy |E_i − E_f| [eV]. */
export const photonEnergy = (ni: number, nf: number, L: number): number => Math.abs(level(ni, L) - level(nf, L));

/** Photon wavelength λ = hc/ΔE [nm] (Infinity when n_i = n_f). */
export const lambda = (ni: number, nf: number, L: number): number => HC_EVNM / photonEnergy(ni, nf, L);

/** Normalised stationary state ψ_n(x) [1/√nm] on −L/2 … L/2 (0 outside). */
export function psi(n: number, x: number, L: number): number {
  if (Math.abs(x) > L / 2) return 0;
  return Math.sqrt(2 / L) * Math.sin((n * Math.PI * (x + L / 2)) / L);
}

/** Electric-dipole transitions in a symmetric well need opposite parity: n_i − n_f odd. */
export const dipoleAllowed = (ni: number, nf: number): boolean => Math.abs(ni - nf) % 2 === 1;
