// Ch 23: Gauss's law for line charges ⊥ page (exact in a 2D cross-section). DOM-free.
// λ in nC/m, lengths in m: E = λ / (2π ε0 r) = 2k λ / r.
import { EPS0, K_E, closedFlux, enclosed, fieldFn, type Src, type V2 } from '../field/physics';
import { Pool, type Placed } from '../field/slots';

/** Field [N/C] per unit strength of the 'line' kernel. */
export const LINE_E = 2 * K_E * 1e-9;
/** λ_enc [nC/m] → λ_enc / ε0 [N m/C]. */
export const ENC_FLUX = 1e-9 / EPS0;

/** Kinds +1, +2, −1, −2 nC/m. */
export const LINE_POOL = new Pool([1, 2, -1, -2], [3, 3, 3, 3]);
export const LINE_LAYOUT: Placed[] = [
  [1, -0.4, 0.15],
  [2, 0.5, -0.2],
];

/** Numerical ∮ E_n dl [N m/C] and λ_enc / ε0 [N m/C] for a closed path. */
export function gauss(src: readonly Src[], poly: readonly V2[]): { flux: number; rhs: number; enc: number } {
  const enc = enclosed(src, poly);
  return { flux: LINE_E * closedFlux(fieldFn(src, 'line'), poly), rhs: enc * ENC_FLUX, enc };
}
