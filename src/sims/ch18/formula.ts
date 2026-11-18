// Σ panel lines shared by the Ch 18 scenes: first law with the current values substituted.
// Energies in J (1 kPa·L = 1 J), from the same pathAt / legWork the bars and readouts use.
import { num, tn, tp, u } from '../../core/tex';
import { A0, NR, type St } from './physics';

const J = u('J');
/** Substituted energy: four figures, so sums of them reproduce the three-figure result; exactly 0 as 0. */
export const e4 = (v: number) => (Math.abs(v) < 1e-9 ? '0' : tp(v, 4));

/** T = pV/nR. */
export const tempLine = (st: St) => `T = \\frac{pV}{nR} = \\frac{${tn(st.p, 4)} \\times ${tn(st.V, 4)}}{${tn(NR, 4)}} = ${tn((st.p * st.V) / NR)}${u('K')}`;

/** ΔE_int = (f/2)(pV − p_A V_A), relative to state A = A0. */
export const dELine = (st: St, dE: number, f: number) =>
  `\\Delta E_\\text{int} = \\tfrac{f}{2}\\,\\Delta(pV) =${num(f / 2)} \\times (${tn(st.p * st.V, 4)} - ${tn(A0.p * A0.V, 4)}) = ${tn(dE)}${J}`;

/** First law: Q = ΔE_int + W. */
export const qLine = (dE: number, W: number, Q: number) => `Q = \\Delta E_\\text{int} + W = ${e4(dE)} + ${e4(W)} = ${tn(Q)}${J}`;
