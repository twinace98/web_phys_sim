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
      // Exact: a box-bounded grid pushes a barely bound state (decay length ≫ margin) above U0.
      return { pot, st: finiteWellStates(p.L, p.U0, FINITE_MARGIN, 2400, MAX_LEVELS, Math.min(top, p.U0)), xr: x, yr: y, n0: 1, walls };
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

/** Sub-samples per grid cell when averaging the potential (as in the numerical solver). */
const SUB = 8;

/** z0 = (L/2)√(2mU0)/ħ = (L/2)√(U0/C) with C = ħ²/2m [eV nm²]. */
export const z0Of = (L: number, U0: number, C = HB2M): number => (L / 2) * Math.sqrt(U0 / C);

/** Number of bound states of a finite square well: ⌈2 z0/π⌉ (a state exactly at threshold is unbound). */
export const finiteWellCount = (L: number, U0: number, C = HB2M): number => Math.ceil((2 * z0Of(L, U0, C)) / Math.PI - 1e-12);

/**
 * Exact bound states of a finite square well (bottom 0, depth U0, width L centred at 0), sampled on
 * the same grid as the numerical solver over [−L/2 − margin, L/2 + margin].
 *
 * With a = L/2, z = ka and z0 = a√(U0/C): even states solve z sin z = √(z0² − z²) cos z on
 * [jπ, jπ + π/2), odd states z cos z = −√(z0² − z²) sin z on [jπ + π/2, (j+1)π), each interval
 * below z0 holding exactly one root. ψ is cos(kx) or sin(kx) inside and decays as e^{−κ(|x|−a)}
 * outside, normalised over all x (a very shallow state keeps most of its weight beyond the grid).
 */
export function finiteWellStates(L: number, U0: number, margin: number, n: number, count: number, maxE = Infinity, C = HB2M): States {
  const pot = finiteWell(L, U0, margin);
  const dx = (pot.x1 - pot.x0) / (n + 1);
  const x = new Float64Array(n);
  const U = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    x[i] = pot.x0 + (i + 1) * dx;
    let u = 0;
    for (let j = 0; j < SUB; j++) u += pot.U(x[i] + ((j + 0.5) / SUB - 0.5) * dx);
    U[i] = u / SUB;
  }
  const a = L / 2;
  const z0 = a * Math.sqrt(U0 / C);
  const w = (z: number) => Math.sqrt(Math.max(0, z0 * z0 - z * z));
  const roots: { z: number; even: boolean }[] = [];
  for (let j = 0; ; j++) {
    for (const even of [true, false]) {
      const lo = j * Math.PI + (even ? 0 : Math.PI / 2);
      if (lo >= z0) continue;
      const hi = Math.min(lo + Math.PI / 2, z0);
      const g = (z: number) => (even ? z * Math.sin(z) - w(z) * Math.cos(z) : z * Math.cos(z) + w(z) * Math.sin(z));
      let l = lo;
      let h = hi;
      const gl = g(l);
      for (let it = 0; it < 200; it++) {
        const m = 0.5 * (l + h);
        if (Math.sign(g(m)) === Math.sign(gl)) l = m;
        else h = m;
      }
      const z = 0.5 * (l + h);
      // A root at z0 itself (κ = 0) is the unbound threshold, not a state.
      if (w(z) > 1e-12) roots.push({ z, even });
    }
    if ((j + 1) * Math.PI >= z0) break;
  }
  roots.sort((p, q) => p.z - q.z);
  const E: number[] = [];
  const psi: Float64Array[] = [];
  for (const r of roots) {
    const k = r.z / a;
    const En = C * k * k;
    if (E.length >= count || En > maxE) break;
    const kap = w(r.z) / a;
    const edge = r.even ? Math.cos(r.z) : Math.sin(r.z);
    const norm2 = a + ((r.even ? 1 : -1) * Math.sin(2 * r.z)) / (2 * k) + (edge * edge) / kap;
    const A = 1 / Math.sqrt(norm2);
    const v = new Float64Array(n);
    for (let i = 0; i < n; i++) {
      const xi = x[i];
      if (Math.abs(xi) <= a) v[i] = A * (r.even ? Math.cos(k * xi) : Math.sin(k * xi));
      else v[i] = A * edge * (r.even || xi > 0 ? 1 : -1) * Math.exp(-kap * (Math.abs(xi) - a));
    }
    // Sign as the numerical solver: positive on the first lobe from the left.
    let peak = 0;
    for (let i = 0; i < n; i++) peak = Math.max(peak, Math.abs(v[i]));
    for (let i = 0; i < n; i++) {
      if (Math.abs(v[i]) > 0.05 * peak) {
        if (v[i] < 0) for (let j = 0; j < n; j++) v[j] = -v[j];
        break;
      }
    }
    E.push(En);
    psi.push(v);
  }
  return { x, dx, U, E, psi };
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
