// Ch 39: bound states of 1D wells (infinite, finite, harmonic, double). DOM-free.
import { HB2M, doubleWell, finiteWell, harmonic, infiniteWell, solve, type Potential, type States } from '../modern/eigen';

export type WellKind = 'infinite' | 'finite' | 'harmonic' | 'double';

export interface WellParams {
  kind: WellKind;
  /** Well width [nm] (each well for the double well). */
  L: number;
  /** Finite-well depth [eV]. */
  U0: number;
  /** ħω [eV]. */
  hw: number;
  /** Double-well barrier height [eV] and width [nm]. */
  Ub: number;
  b: number;
}

export interface WellModel {
  pot: Potential;
  st: States;
  /** Visible ranges: x [nm], E [eV]. */
  xr: [number, number];
  yr: [number, number];
  /** Index of the first level as printed: 0 for the oscillator, 1 otherwise. */
  n0: number;
  /** Hard walls drawn as vertical lines (x positions), if any. */
  walls: number[];
}

/** Finite well: barrier kept on each side inside the solver box [nm]. */
export const FINITE_MARGIN = 2.5;
const MAX_LEVELS = 8;

/** Fixed display ranges per potential, so changing a width or depth never rescales the axes. */
const RANGE: Record<WellKind, { x: [number, number]; y: [number, number] }> = {
  infinite: { x: [-1, 1], y: [0, 7] },
  finite: { x: [-1.5, 1.5], y: [0, 5] },
  harmonic: { x: [-4, 4], y: [0, 2] },
  double: { x: [-2, 2], y: [0, 5] },
};

export function wellModel(p: WellParams): WellModel {
  const { x, y } = RANGE[p.kind];
  const top = y[1] * 0.95;
  let pot: Potential;
  let n = 1500;
  let maxE = top;
  let walls: number[] = [];
  switch (p.kind) {
    case 'infinite':
      pot = infiniteWell(p.L);
      walls = [-p.L / 2, p.L / 2];
      break;
    case 'finite':
      pot = finiteWell(p.L, p.U0, FINITE_MARGIN);
      n = 2400;
      maxE = Math.min(top, p.U0);
      break;
    case 'harmonic':
      pot = harmonic(p.hw, 7);
      n = 2400;
      break;
    case 'double':
      pot = doubleWell(p.L, p.b, p.Ub);
      walls = [pot.x0, pot.x1];
      break;
  }
  const st = solve(pot, n, MAX_LEVELS, HB2M, maxE);
  return { pot, st, xr: x, yr: y, n0: p.kind === 'harmonic' ? 0 : 1, walls };
}

/**
 * Classical turning points: the x range where E ≥ U (allowed region). For the double well
 * below the barrier this is two intervals.
 */
export function allowed(pot: Potential, E: number, x0: number, x1: number, steps = 800): [number, number][] {
  const out: [number, number][] = [];
  let start: number | null = null;
  for (let i = 0; i <= steps; i++) {
    const x = x0 + ((x1 - x0) * i) / steps;
    const inside = x >= pot.x0 && x <= pot.x1 && pot.U(x) <= E;
    if (inside && start === null) start = x;
    if (!inside && start !== null) {
      out.push([start, x]);
      start = null;
    }
  }
  if (start !== null) out.push([start, x1]);
  return out;
}

/** Probability of finding the particle where E < U (classically forbidden). */
export function forbiddenProbability(st: States, k: number): number {
  let s = 0;
  for (let i = 0; i < st.x.length; i++) if (st.U[i] > st.E[k]) s += st.psi[k][i] ** 2 * st.dx;
  return s;
}
