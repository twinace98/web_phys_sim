// E4: 1D time-independent Schrödinger equation by finite differences (docs/design.md §7 E4).
// Units: x in nm, energy in eV. H = −C d²/dx² + U(x), C = ħ²/2mₑ. The box ends are hard walls
// (ψ = 0), so the grid holds only interior points. The symmetric tridiagonal eigenproblem is
// solved by Sturm-sequence bisection (eigenvalues) and inverse iteration (eigenvectors).
// DOM-free; shared by Ch 39 and Ch 41.

/** ħ²/2mₑ in eV·nm². */
export const HB2M = 0.0380998212;

export interface Potential {
  /** Box [x0, x1]; ψ = 0 at both ends. */
  x0: number;
  x1: number;
  U: (x: number) => number;
}

export interface States {
  /** Interior grid points. */
  x: Float64Array;
  dx: number;
  /** Potential on the grid. */
  U: Float64Array;
  /** Eigenvalues, ascending. */
  E: number[];
  /** Eigenvectors, normalised so that Σ ψ² dx = 1, positive at their first lobe from the left. */
  psi: Float64Array[];
}

/** Sub-samples per grid cell when averaging the potential. */
const SUB = 8;

/** Number of eigenvalues of the tridiagonal matrix (diag d, off-diagonal e) below lam. */
export function sturmCount(d: Float64Array, e: number, lam: number): number {
  let count = 0;
  let q = d[0] - lam;
  if (q < 0) count++;
  const e2 = e * e;
  for (let i = 1; i < d.length; i++) {
    if (q === 0) q = 1e-300;
    q = d[i] - lam - e2 / q;
    if (q < 0) count++;
  }
  return count;
}

/** k-th (0-based) eigenvalue by bisection on the Sturm count. */
function bisect(d: Float64Array, e: number, k: number, lo: number, hi: number): number {
  for (let it = 0; it < 200; it++) {
    const mid = 0.5 * (lo + hi);
    if (mid === lo || mid === hi) break;
    if (sturmCount(d, e, mid) > k) hi = mid;
    else lo = mid;
    if (hi - lo <= 1e-13 * Math.max(1, Math.abs(mid))) break;
  }
  return 0.5 * (lo + hi);
}

/** Solve (T − lam I) y = b for symmetric tridiagonal T (diag d, constant off-diagonal e). */
function solveShifted(d: Float64Array, e: number, lam: number, b: Float64Array): Float64Array {
  const n = d.length;
  const c = new Float64Array(n);
  const y = new Float64Array(n);
  let piv = d[0] - lam;
  if (Math.abs(piv) < 1e-300) piv = 1e-300;
  c[0] = e / piv;
  y[0] = b[0] / piv;
  for (let i = 1; i < n; i++) {
    piv = d[i] - lam - e * c[i - 1];
    if (Math.abs(piv) < 1e-300) piv = 1e-300;
    c[i] = e / piv;
    y[i] = (b[i] - e * y[i - 1]) / piv;
  }
  for (let i = n - 2; i >= 0; i--) y[i] -= c[i] * y[i + 1];
  return y;
}

const dot = (a: Float64Array, b: Float64Array) => {
  let s = 0;
  for (let i = 0; i < a.length; i++) s += a[i] * b[i];
  return s;
};

function scale(v: Float64Array, k: number): void {
  for (let i = 0; i < v.length; i++) v[i] *= k;
}

/**
 * Lowest `count` eigenstates on a grid of n interior points. If maxE is given, only states
 * with E < maxE are returned (e.g. bound states of a finite well).
 */
export function solve(pot: Potential, n: number, count: number, C = HB2M, maxE = Infinity): States {
  const dx = (pot.x1 - pot.x0) / (n + 1);
  const x = new Float64Array(n);
  const U = new Float64Array(n);
  const d = new Float64Array(n);
  const e = -C / (dx * dx);
  let lo = Infinity;
  let hi = -Infinity;
  for (let i = 0; i < n; i++) {
    x[i] = pot.x0 + (i + 1) * dx;
    // Cell average: a step that falls between grid points is weighted by where it falls,
    // which keeps square wells accurate when their edges are off the grid.
    let u = 0;
    for (let j = 0; j < SUB; j++) u += pot.U(x[i] + ((j + 0.5) / SUB - 0.5) * dx);
    U[i] = u / SUB;
    d[i] = U[i] + (2 * C) / (dx * dx);
    lo = Math.min(lo, d[i] - 2 * Math.abs(e));
    hi = Math.max(hi, d[i] + 2 * Math.abs(e));
  }
  const m = Math.min(count, n, Number.isFinite(maxE) ? sturmCount(d, e, maxE) : n);
  const E: number[] = [];
  const psi: Float64Array[] = [];
  for (let k = 0; k < m; k++) {
    const lam = bisect(d, e, k, lo, hi);
    E.push(lam);
    // Inverse iteration from a fixed, non-symmetric start vector.
    let v: Float64Array = new Float64Array(n);
    for (let i = 0; i < n; i++) v[i] = 1 + 0.37 * Math.sin(1.3 * i + 0.7 * k);
    const shift = lam + 1e-11 * Math.max(1, Math.abs(lam));
    for (let it = 0; it < 4; it++) {
      v = solveShifted(d, e, shift, v);
      // Nearly degenerate neighbours (deep double wells, wide bands): keep the vectors orthogonal.
      for (let j = 0; j < psi.length; j++) {
        if (Math.abs(E[j] - lam) < 1e-6 * Math.max(1, Math.abs(lam))) {
          const pj = psi[j];
          const pr = dot(v, pj) * dx;
          for (let i = 0; i < n; i++) v[i] -= pr * pj[i];
        }
      }
      scale(v, 1 / Math.sqrt(dot(v, v) * dx));
    }
    // Sign: positive on the first lobe from the left.
    let peak = 0;
    for (let i = 0; i < n; i++) peak = Math.max(peak, Math.abs(v[i]));
    for (let i = 0; i < n; i++) {
      if (Math.abs(v[i]) > 0.05 * peak) {
        if (v[i] < 0) scale(v, -1);
        break;
      }
    }
    psi.push(v);
  }
  return { x, dx, U, E, psi };
}

// ------------------------------------------------------------------ potentials

/** Infinite square well of width L centred at 0 (the box is the well). */
export const infiniteWell = (L: number): Potential => ({ x0: -L / 2, x1: L / 2, U: () => 0 });

/** Finite square well: depth U0 (bottom at 0, outside at U0), width L, `margin` of barrier each side. */
export const finiteWell = (L: number, U0: number, margin: number): Potential => ({
  x0: -L / 2 - margin,
  x1: L / 2 + margin,
  U: (x) => (Math.abs(x) < L / 2 ? 0 : U0),
});

/** U = ½ m ω² x² = (ħω)² x² / (4C), on [−half, half]. */
export const harmonic = (hw: number, half: number, C = HB2M): Potential => ({
  x0: -half,
  x1: half,
  U: (x) => (hw * hw * x * x) / (4 * C),
});

/** Two wells of width L between hard walls, separated by a barrier of height Ub and width b. */
export const doubleWell = (L: number, b: number, Ub: number): Potential => ({
  x0: -b / 2 - L,
  x1: b / 2 + L,
  U: (x) => (Math.abs(x) < b / 2 ? Ub : 0),
});

/**
 * N finite wells of width a and depth U0, separated by barriers of width b, centred at 0,
 * with `margin` of barrier outside the end wells.
 */
export function wellChain(N: number, a: number, b: number, U0: number, margin: number): Potential {
  const period = a + b;
  const span = N * a + (N - 1) * b;
  const left = -span / 2;
  return {
    x0: left - margin,
    x1: -left + margin,
    U: (x) => {
      const s = x - left;
      if (s < 0 || s > span) return U0;
      const r = s % period;
      return r < a ? 0 : U0;
    },
  };
}

/** Analytic infinite-well levels C (nπ/L)², n = 1, 2, … */
export const infiniteLevel = (n: number, L: number, C = HB2M) => C * ((n * Math.PI) / L) ** 2;

/** Analytic harmonic levels (n + ½) ħω, n = 0, 1, … */
export const harmonicLevel = (n: number, hw: number) => (n + 0.5) * hw;

/** Number of bound states of a finite square well: ⌈(L/π) √(U0/C)⌉. */
export const finiteBoundCount = (L: number, U0: number, C = HB2M) => Math.ceil((L / Math.PI) * Math.sqrt(U0 / C));

/**
 * Bound-state energies of a finite square well from the transcendental equations
 * k tan(kL/2) = κ (even) and −k cot(kL/2) = κ (odd), solved by bisection.
 */
export function finiteLevels(L: number, U0: number, C = HB2M): number[] {
  const out: number[] = [];
  const z0 = (L / 2) * Math.sqrt(U0 / C);
  // z = kL/2 in (0, z0); f(z) = 0 on each branch.
  const fEven = (z: number) => z * Math.tan(z) - Math.sqrt(z0 * z0 - z * z);
  const fOdd = (z: number) => -z / Math.tan(z) - Math.sqrt(z0 * z0 - z * z);
  for (let j = 0; ; j++) {
    const a = (j * Math.PI) / 2 + 1e-12;
    if (a >= z0) break;
    const b = Math.min(((j + 1) * Math.PI) / 2 - 1e-12, z0);
    const f = j % 2 === 0 ? fEven : fOdd;
    let lo = a;
    let hi = b;
    if (f(lo) * f(hi) > 0) continue;
    for (let it = 0; it < 200; it++) {
      const mid = 0.5 * (lo + hi);
      if (f(lo) * f(mid) <= 0) hi = mid;
      else lo = mid;
    }
    const z = 0.5 * (lo + hi);
    out.push(C * ((2 * z) / L) ** 2);
  }
  return out;
}
