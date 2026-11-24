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
      // Exact: the grid's cell-averaged barrier edges shifted the levels by up to 0.3 % (QA 2026-11-24).
      return { pot, st: doubleWellStates(p.L, p.b, p.Ub, n, MAX_LEVELS, maxE), xr: x, yr: y, n0: 1, walls };
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
  const { x, dx, U } = grid(finiteWell(L, U0, margin), n);
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

/** Grid of n interior points over the box of `pot`, with the potential cell-averaged as in the solver. */
function grid(pot: Potential, n: number): { x: Float64Array; dx: number; U: Float64Array } {
  const dx = (pot.x1 - pot.x0) / (n + 1);
  const x = new Float64Array(n);
  const U = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    x[i] = pot.x0 + (i + 1) * dx;
    let u = 0;
    for (let j = 0; j < SUB; j++) u += pot.U(x[i] + ((j + 0.5) / SUB - 0.5) * dx);
    U[i] = u / SUB;
  }
  return { x, dx, U };
}

/**
 * Exact bound states of the double well (wells of width L between hard walls, barrier Ub of width
 * b centred at 0), sampled on the solver's grid of n points.
 *
 * In the right well ψ = sin k(c − x) with c = b/2 + L (zero at the wall). In the barrier ψ is even
 * (cosh κx, or cos qx above Ub) or odd (sinh κx/κ, or sin qx/q). Matching ψ'/ψ at x = b/2 gives
 * g(E) = k cos kL · B + sin kL · B' = 0 with (B, B') the barrier solution there, continuous through
 * E = Ub. Each parity is scanned for sign changes of g (roots of one parity lie a single-well level
 * spacing apart, far wider than the scan step) and refined by bisection. ψ is normalised on the grid.
 */
export function doubleWellStates(L: number, b: number, Ub: number, n: number, count: number, maxE = Infinity, C = HB2M): States {
  const pot = doubleWell(L, b, Ub);
  const { x, dx, U } = grid(pot, n);
  const h = b / 2;
  const barrier = (E: number, even: boolean): [number, number] => {
    if (E < Ub) {
      const kap = Math.sqrt((Ub - E) / C);
      if (kap * h < 1e-8) return even ? [1, 0] : [h, 1];
      return even ? [Math.cosh(kap * h), kap * Math.sinh(kap * h)] : [Math.sinh(kap * h) / kap, Math.cosh(kap * h)];
    }
    const q = Math.sqrt((E - Ub) / C);
    if (q * h < 1e-8) return even ? [1, 0] : [h, 1];
    return even ? [Math.cos(q * h), -q * Math.sin(q * h)] : [Math.sin(q * h) / q, Math.cos(q * h)];
  };
  const g = (E: number, even: boolean) => {
    const k = Math.sqrt(E / C);
    const [B, Bp] = barrier(E, even);
    return k * Math.cos(k * L) * B + Math.sin(k * L) * Bp;
  };
  const top = Math.min(maxE, Ub + 10);
  const roots: { E: number; even: boolean }[] = [];
  const STEPS = 4000;
  for (const even of [true, false]) {
    let e0 = top * 1e-9;
    let g0 = g(e0, even);
    for (let i = 1; i <= STEPS; i++) {
      const e1 = (top * i) / STEPS;
      const g1 = g(e1, even);
      if (g0 === 0 || Math.sign(g1) !== Math.sign(g0)) {
        let lo = e0;
        let hi = e1;
        const s = Math.sign(g(lo, even));
        for (let it = 0; it < 200 && hi - lo > 1e-15 * hi; it++) {
          const m = 0.5 * (lo + hi);
          if (Math.sign(g(m, even)) === s) lo = m;
          else hi = m;
        }
        roots.push({ E: 0.5 * (lo + hi), even });
      }
      e0 = e1;
      g0 = g1;
    }
  }
  roots.sort((p, q) => p.E - q.E);
  const E: number[] = [];
  const psi: Float64Array[] = [];
  const c = h + L;
  for (const r of roots.slice(0, count)) {
    if (r.E >= maxE) break;
    const k = Math.sqrt(r.E / C);
    const [B0, B1] = barrier(r.E, r.even);
    // Amplitude A of the well solution A sin k(c − x) that meets the barrier solution at x = b/2:
    // from the values (A sin kL = B) or, near a node of sin kL, from the slopes (−A k cos kL = B').
    const sKL = Math.sin(k * L);
    const cKL = Math.cos(k * L);
    const amp = Math.abs(sKL) > Math.abs(cKL) ? B0 / sKL : -B1 / (k * cKL);
    const v = new Float64Array(n);
    for (let i = 0; i < n; i++) {
      const ax = Math.abs(x[i]);
      const sg = r.even || x[i] >= 0 ? 1 : -1;
      v[i] = sg * (ax >= h ? amp * Math.sin(k * (c - ax)) : barrierAt(r.E, r.even, ax, Ub, C));
    }
    let s = 0;
    for (let i = 0; i < n; i++) s += v[i] * v[i];
    const norm = 1 / Math.sqrt(s * dx);
    for (let i = 0; i < n; i++) v[i] *= norm;
    // Sign as the numerical solver: positive on the first lobe from the left.
    let peak = 0;
    for (let i = 0; i < n; i++) peak = Math.max(peak, Math.abs(v[i]));
    for (let i = 0; i < n; i++) {
      if (Math.abs(v[i]) > 0.05 * peak) {
        if (v[i] < 0) for (let j = 0; j < n; j++) v[j] = -v[j];
        break;
      }
    }
    E.push(r.E);
    psi.push(v);
  }
  return { x, dx, U, E, psi };
}

/** Barrier solution at distance a ≥ 0 from the centre: cosh κa or sinh κa/κ (cos qa or sin qa/q above Ub). */
function barrierAt(E: number, even: boolean, a: number, Ub: number, C: number): number {
  const above = E >= Ub;
  const r = Math.sqrt(Math.abs(Ub - E) / C);
  if (r * a < 1e-8) return even ? 1 : a;
  if (even) return above ? Math.cos(r * a) : Math.cosh(r * a);
  return (above ? Math.sin(r * a) : Math.sinh(r * a)) / r;
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
