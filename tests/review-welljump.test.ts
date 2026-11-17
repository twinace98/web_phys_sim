// Review page 103 (welljump): infinite-well levels, photon wavelengths, consistency with the
// Ch 39 solver, and the stage layout.
import { describe, expect, it } from 'vitest';
import { defaults } from '../src/core/params';
import { wellModel } from '../src/sims/ch39/physics';
import { HB2M, infiniteLevel, infiniteWell, solve } from '../src/sims/modern/eigen';
import { region } from '../src/sims/review/hydrogen/spectrum';
import { E1_COEF, dipoleAllowed, lambda, level, photonEnergy, psi } from '../src/sims/review/welljump/physics';
import { N_LEVELS, nearestLevel, welljump } from '../src/sims/review/welljump/scene';
import { offStage, probe } from './stage-probe';

const near = (a: number, b: number, tol: number) => expect(Math.abs(a - b)).toBeLessThan(tol);

describe('welljump physics', () => {
  it('E_1 = 9.40 eV for an electron in an infinite well of width 200 pm', () => {
    near(level(1, 0.2), 9.40, 0.005);
    near(E1_COEF, 0.37603, 1e-5);
  });

  it('E_n ∝ n² and ∝ 1/L²', () => {
    for (let n = 1; n <= N_LEVELS; n++) expect(level(n, 0.7) / level(1, 0.7)).toBeCloseTo(n * n, 12);
    expect(level(1, 0.5) / level(1, 1)).toBeCloseTo(4, 12);
  });

  it('2 → 1 at L = 200 pm: ΔE = 28.2 eV, λ = 44.0 nm (UV); 3 → 2 at L = 1 nm: 1.880 eV, 659.4 nm (visible)', () => {
    near(photonEnergy(2, 1, 0.2), 28.20, 0.01);
    near(lambda(2, 1, 0.2), 43.96, 0.02);
    expect(region(lambda(2, 1, 0.2))).toBe('uv');
    near(photonEnergy(3, 2, 1), 1.8801, 1e-4);
    near(lambda(3, 2, 1), 659.44, 0.02);
    expect(region(lambda(3, 2, 1))).toBe('vis');
    expect(region(lambda(2, 1, 1))).toBe('ir');
    expect(lambda(2, 3, 1)).toBe(lambda(3, 2, 1));
  });

  it('λ ∝ L²: doubling the width makes every wavelength 4 times longer', () => {
    for (const [ni, nf] of [
      [2, 1],
      [5, 3],
    ])
      expect(lambda(ni, nf, 1.2) / lambda(ni, nf, 0.6)).toBeCloseTo(4, 10);
  });

  it('agrees with the Ch 39 solver: wellModel at L = 1 nm and eigen.solve at L = 0.2 nm', () => {
    const m = wellModel({ kind: 'infinite', L: 1, U0: 2, hw: 0.2, Ub: 2, b: 0.2 });
    m.st.E.forEach((E, k) => near(E, level(k + 1, 1), 2e-3 * E));
    const st = solve(infiniteWell(0.2), 1500, N_LEVELS, HB2M);
    st.E.forEach((E, k) => {
      near(E, level(k + 1, 0.2), 2e-3 * E);
      expect(infiniteLevel(k + 1, 0.2)).toBeCloseTo(level(k + 1, 0.2), 3);
    });
  });

  it('ψ_n normalised, n − 1 nodes; dipole rule needs n_i − n_f odd', () => {
    const L = 0.8;
    for (let n = 1; n <= N_LEVELS; n++) {
      let s = 0;
      let nodes = 0;
      const M = 4000;
      for (let i = 0; i < M; i++) {
        const x = -L / 2 + ((i + 0.5) * L) / M;
        s += psi(n, x, L) ** 2 * (L / M);
        if (i > 0 && Math.sign(psi(n, x, L)) !== Math.sign(psi(n, x - L / M, L))) nodes++;
      }
      near(s, 1, 1e-6);
      expect(nodes).toBe(n - 1);
    }
    expect(dipoleAllowed(2, 1)).toBe(true);
    expect(dipoleAllowed(3, 1)).toBe(false);
  });
});

describe('welljump stage', () => {
  it('dragging snaps to the nearest level', () => {
    expect(nearestLevel(level(4, 0.5) * 1.01, 0.5)).toBe(4);
    expect(nearestLevel(-1, 0.5)).toBe(1);
  });

  it('nothing leaves the stage and level labels never overlap (widths, pairs, wide and narrow)', () => {
    const base = defaults(welljump.params);
    for (const [w, h] of [
      [1280, 704],
      [390, 560],
      [390, 460],
    ])
      for (const L of [0.2, 0.47, 1, 2])
        for (let ni = 1; ni <= N_LEVELS; ni += 2)
          for (let nf = 1; nf <= N_LEVELS; nf++) {
            const p = { ...base, L, ni, nf, show: nf % 2 ? 'psi' : 'prob' };
            const g = probe(welljump, welljump.init(p, null as never), p, w, h);
            expect(offStage(g, 2)).toEqual([]);
            const labels = g.marks.filter((m) => m.kind === 'text' && /eV$/.test(m.text!)).map((m) => m.y);
            labels.sort((a, b) => a - b);
            for (let i = 1; i < labels.length; i++) expect(labels[i] - labels[i - 1]).toBeGreaterThanOrEqual(13);
          }
  });

  it('picked lines accumulate and follow the width (λ ∝ L²)', () => {
    const p = defaults(welljump.params);
    const s = welljump.init(p, null as never);
    probe(welljump, s, p, 1280, 704);
    probe(welljump, s, { ...p, ni: 2, nf: 1 }, 1280, 704);
    expect([...s.seen.keys()].sort()).toEqual(['1-2', '2-3']);
  });

  it('formula panel: E_n with numbers, ΔE and λ at the defaults (L = 1 nm, 3 → 2)', () => {
    const p = defaults(welljump.params);
    const f = welljump.formula!(welljump.init(p, null as never), p).join(' ');
    expect(f).toContain('0.3760');
    expect(f).toContain('3.384');
    expect(f).toContain('1.504');
    expect(f).toContain('1.880');
    expect(f).toContain('659.4');
    const f2 = welljump.formula!(welljump.init(p, null as never), { ...p, L: 0.2, ni: 1, nf: 2 }).join(' ');
    expect(f2).toContain('9.401');
    expect(f2).toContain('43.96');
    expect(f2).toContain('(0.200\\ \\text{nm})^2');
  });
});
