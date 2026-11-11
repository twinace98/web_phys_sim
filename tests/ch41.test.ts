import { describe, expect, it } from 'vitest';
import {
  KB,
  MATERIALS,
  NK,
  TAU,
  carriers,
  chainLevels,
  current,
  fermi,
  kpBands,
  ni,
  occupied,
  shiftStep,
  shownPairs,
} from '../src/sims/ch41/physics';
import { gapOf } from '../src/sims/ch41/bands';
import { layout } from '../src/sims/ch41/filling';

describe('ch41 band formation', () => {
  it('N wells give N levels in each band, inside the Kronig-Penney bands', () => {
    const bs = kpBands(0.1);
    expect(bs.length).toBe(2);
    for (const N of [2, 4, 8, 12]) {
      const E = chainLevels(N, 0.1);
      const low = E.filter((e) => e < (bs[0][1] + bs[1][0]) / 2);
      expect(low.length).toBe(N);
      for (const e of low) {
        expect(e).toBeGreaterThan(bs[0][0] - 0.01);
        expect(e).toBeLessThan(bs[0][1] + 0.01);
      }
    }
  });

  it('closer wells: wider bands and a smaller gap', () => {
    const w = (b: number) => kpBands(b)[0][1] - kpBands(b)[0][0];
    expect(w(0.1)).toBeGreaterThan(w(0.2));
    expect(w(0.2)).toBeGreaterThan(w(0.5));
    expect(gapOf(0.1)).toBeLessThan(gapOf(0.2));
  });

  it('a single well level lies inside the first band', () => {
    const [E1] = chainLevels(1, 0.2);
    const [b0] = kpBands(0.2);
    expect(E1).toBeGreaterThan(b0[0]);
    expect(E1).toBeLessThan(b0[1]);
  });
});

describe('ch41 filling', () => {
  it('Fermi-Dirac: ½ at E_F, step at T = 0, Boltzmann tail', () => {
    expect(fermi(0.3, 0.3, 300)).toBeCloseTo(0.5, 12);
    expect(fermi(-0.01, 0, 0)).toBe(1);
    expect(fermi(0.01, 0, 0)).toBe(0);
    const kT = KB * 300;
    expect(fermi(0.5, 0, 300) / Math.exp(-0.5 / kT)).toBeCloseTo(1, 6);
  });

  it('intrinsic n_i: Si ~10¹⁰ cm⁻³ at 300 K; Ge ≫ Si ≫ diamond; ∝ e^{−Eg/2kT}', () => {
    const si = ni(MATERIALS.si, 300);
    expect(si).toBeGreaterThan(5e9);
    expect(si).toBeLessThan(2e10);
    expect(ni(MATERIALS.ge, 300)).toBeGreaterThan(1e3 * si);
    expect(ni(MATERIALS.diamond, 600)).toBeLessThan(1);
    expect(ni(MATERIALS.si, 400) / si).toBeGreaterThan(100);
  });

  it('drawn pairs: a few for Si at 300 K, none for diamond or at 0 K', () => {
    expect(layout('si', 300).pairs).toBeGreaterThan(0);
    expect(layout('si', 300).pairs).toBeLessThan(8);
    expect(layout('diamond', 600).pairs).toBe(0);
    expect(layout('si', 0).pairs).toBe(0);
    expect(shownPairs(1e20)).toBe(16);
  });
});

describe('ch41 conduction', () => {
  it('relaxation: the shift approaches −Fτ', () => {
    let d = 0;
    for (let i = 0; i < 20000; i++) d = shiftStep(d, 0.04, 0.05);
    expect(d).toBeCloseTo(-0.04 * TAU, 6);
    // Exact over one step: half way after τ ln 2.
    expect(shiftStep(0, 0.04, TAU * Math.LN2)).toBeCloseTo(-0.2, 10);
  });

  it('half band: current along the field; full band: none for any shift', () => {
    const half = occupied('half');
    const full = occupied('full');
    expect(half.length).toBe(NK / 2);
    expect(full.length).toBe(NK);
    expect(current(half, 0)).toBeCloseTo(0, 12);
    expect(current(half, -0.4)).toBeGreaterThan(0.05);
    for (const d of [-0.1, -0.4, -1.7, -3]) expect(current(full, d)).toBeCloseTo(0, 12);
    const nearly = current(occupied('nearly'), -0.4);
    expect(nearly).toBeGreaterThan(0);
    expect(nearly).toBeLessThan(current(half, -0.4));
  });
});

describe('ch41 doping', () => {
  it('n-type 10¹⁶ at 300 K: n ≈ N_D, np = n_i²', () => {
    const c = carriers(300, 1e16, 0);
    expect(c.n / 1e16).toBeCloseTo(1, 1);
    expect((c.n * c.p) / ni(MATERIALS.si, 300) ** 2).toBeCloseTo(1, 6);
    expect(c.mu).toBeGreaterThan(MATERIALS.si.Eg / 2);
  });

  it('p-type: holes are the majority and E_F lies below mid-gap', () => {
    const c = carriers(300, 0, 1e16);
    expect(c.p / 1e16).toBeCloseTo(1, 1);
    expect(c.mu).toBeLessThan(MATERIALS.si.Eg / 2);
  });

  it('freeze-out at low T, intrinsic at high T', () => {
    expect(carriers(50, 1e16, 0).n).toBeLessThan(0.2e16);
    const hot = carriers(800, 1e15, 0);
    expect(hot.n / ni(MATERIALS.si, 800)).toBeLessThan(1.1);
  });

  it('intrinsic: n = p = n_i', () => {
    const c = carriers(300, 0, 0);
    expect(c.n / ni(MATERIALS.si, 300)).toBeCloseTo(1, 6);
    expect(c.p / c.n).toBeCloseTo(1, 6);
  });
});
