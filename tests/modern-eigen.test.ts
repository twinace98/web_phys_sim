import { describe, expect, it } from 'vitest';
import {
  HB2M,
  doubleWell,
  finiteBoundCount,
  finiteLevels,
  finiteWell,
  harmonic,
  harmonicLevel,
  infiniteLevel,
  infiniteWell,
  solve,
  wellChain,
} from '../src/sims/modern/eigen';

const norm = (p: Float64Array, dx: number) => p.reduce((s, v) => s + v * v, 0) * dx;
const overlap = (a: Float64Array, b: Float64Array, dx: number) => a.reduce((s, v, i) => s + v * b[i], 0) * dx;

describe('finite-difference Schrödinger solver', () => {
  it('infinite well: E_1..E_5 match C(nπ/L)² and converge with the grid', () => {
    for (const L of [0.5, 1, 2]) {
      const st = solve(infiniteWell(L), 1200, 5);
      st.E.forEach((E, k) => expect(Math.abs(E / infiniteLevel(k + 1, L) - 1)).toBeLessThan(1e-4));
    }
    const err = (n: number) => Math.abs(solve(infiniteWell(1), n, 5).E[4] / infiniteLevel(5, 1) - 1);
    // Second-order scheme: doubling the grid cuts the error about four times.
    expect(err(200) / err(400)).toBeGreaterThan(3.5);
    expect(err(200) / err(400)).toBeLessThan(4.5);
  });

  it('infinite well: E_1 = 0.376 eV for an electron in a 1 nm well; E_n ∝ n²', () => {
    const st = solve(infiniteWell(1), 1000, 4);
    expect(st.E[0]).toBeCloseTo(0.376, 3);
    expect(st.E[3] / st.E[0]).toBeCloseTo(16, 2);
  });

  it('harmonic: E_n = (n + ½) ħω, equally spaced', () => {
    for (const hw of [0.1, 0.2, 0.4]) {
      const st = solve(harmonic(hw, 8), 2000, 6);
      st.E.forEach((E, n) => expect(Math.abs(E / harmonicLevel(n, hw) - 1)).toBeLessThan(2e-4));
    }
  });

  it('eigenvectors are normalised, orthogonal, and have n − 1 nodes', () => {
    const st = solve(harmonic(0.2, 6), 1500, 5);
    for (let i = 0; i < 5; i++) {
      expect(norm(st.psi[i], st.dx)).toBeCloseTo(1, 10);
      for (let j = 0; j < i; j++) expect(Math.abs(overlap(st.psi[i], st.psi[j], st.dx))).toBeLessThan(1e-8);
      let nodes = 0;
      const p = st.psi[i];
      const tiny = 1e-3 * Math.max(...p.map(Math.abs));
      let last = 0;
      for (const v of p) {
        if (Math.abs(v) < tiny) continue;
        const s = Math.sign(v);
        if (last && s !== last) nodes++;
        last = s;
      }
      expect(nodes).toBe(i);
    }
  });

  it('finite well: levels match the transcendental equations; bound-state count is finite', () => {
    for (const [L, U0] of [
      [1, 1],
      [1, 2],
      [1, 4],
      [0.6, 5],
    ]) {
      const exact = finiteLevels(L, U0);
      expect(exact.length).toBe(finiteBoundCount(L, U0));
      const st = solve(finiteWell(L, U0, 3), 3000, 20, HB2M, U0);
      expect(st.E.length).toBe(exact.length);
      // Skip a state barely bound (its tail is cut by the box).
      exact.forEach((E, k) => {
        if (U0 - E > 0.05 * U0) expect(Math.abs(st.E[k] - E)).toBeLessThan(5e-4 * U0);
      });
    }
  });

  it('finite well: ψ leaks into the barrier and decays as e^{−κ|x|}', () => {
    const U0 = 2;
    const st = solve(finiteWell(1, U0, 2), 3000, 1);
    const kappa = Math.sqrt((U0 - st.E[0]) / HB2M);
    const at = (x: number) => st.psi[0][Math.round((x - st.x[0]) / st.dx)];
    expect(at(0.6)).toBeGreaterThan(0);
    expect(at(0.9) / at(0.7)).toBeCloseTo(Math.exp(-kappa * 0.2), 2);
  });

  it('double well: levels come in even/odd pairs; the splitting shrinks with the barrier width', () => {
    const split = (b: number) => {
      const st = solve(doubleWell(1, b, 2), 1500, 2);
      return st.E[1] - st.E[0];
    };
    expect(split(0.1)).toBeGreaterThan(split(0.2));
    expect(split(0.2)).toBeGreaterThan(split(0.4));
    const st = solve(doubleWell(1, 0.4, 2), 1500, 4);
    const n = st.x.length;
    const p0 = st.psi[0];
    const p1 = st.psi[1];
    expect(p0[10]).toBeCloseTo(p0[n - 11], 8); // even
    expect(p1[10]).toBeCloseTo(-p1[n - 11], 8); // odd
    // Pair splitting ≪ spacing to the next pair.
    expect(st.E[1] - st.E[0]).toBeLessThan(0.2 * (st.E[2] - st.E[1]));
  });

  it('N wells: each single-well level splits into N levels (a band)', () => {
    const one = solve(wellChain(1, 0.6, 0.2, 5, 1), 1500, 4, HB2M, 5);
    for (const N of [2, 4, 8]) {
      const st = solve(wellChain(N, 0.6, 0.2, 5, 1), 400 * N + 400, 3 * N, HB2M, 5);
      const gapMid = 0.5 * (one.E[0] + one.E[1]);
      expect(st.E.filter((E) => E < gapMid).length).toBe(N);
      // The lowest band contains the single-well level.
      expect(st.E[0]).toBeLessThan(one.E[0]);
      expect(st.E[N - 1]).toBeGreaterThan(one.E[0]);
    }
  });
});
