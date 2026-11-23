// Σ panel lines shared by the Ch 18 scenes: first law with the current values substituted.
// Energies in J (1 kPa·L = 1 J), from the same pathAt / legWork the bars and readouts use.
// Policy D (docs/design.md §3.3): p, V, T and nR to 3 figures (R3); energies change during a run of
// a few kJ, so they print in whole joules everywhere (R7a, R8): Σ inputs and results, readouts, bars.
import { fmtScale, num, paren, tn, tnScale, u } from '../../core/tex';
import { A0, NR, type St } from './physics';

const J = u('J');

/** Run scale of the Ch 18 and Ch 20 energies [J]: whole joules, residues below 10⁻³ J print 0. */
export const E_SCALE = 1000;
/** An energy as the readouts and bars print it: whole joules ("1563", "0", "−666"). */
export const fmtJ = (v: number) => fmtScale(v, E_SCALE);
/** The same energy in TeX. */
export const tJ = (v: number) => tnScale(v, E_SCALE);
/** A substituted energy: in parentheses when negative. */
export const pJ = (v: number) => paren(tJ(v));

/** T = pV/nR. */
export const tempLine = (st: St) => `T = \\frac{pV}{nR} = \\frac{${tn(st.p)} \\times ${tn(st.V)}}{${tn(NR)}} = ${tn((st.p * st.V) / NR)}${u('K')}`;

/** ΔE_int = (f/2)(pV − p_A V_A), relative to state A = A0. */
export const dELine = (st: St, dE: number, f: number) =>
  `\\Delta E_\\text{int} = \\tfrac{f}{2}\\,\\Delta(pV) = ${num(f / 2)} \\times (${tJ(st.p * st.V)} - ${tJ(A0.p * A0.V)}) = ${tJ(dE)}${J}`;

/** First law: Q = ΔE_int + W. */
export const qLine = (dE: number, W: number, Q: number) => `Q = \\Delta E_\\text{int} + W = ${pJ(dE)} + ${pJ(W)} = ${tJ(Q)}${J}`;
