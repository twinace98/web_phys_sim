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
import { intrinsicMu } from '../src/sims/ch41/physics';
import { REF_UNDOPED, belowOne, carriersOf, doping, dotRef } from '../src/sims/ch41/doping';
import { fromQuery } from '../src/core/params';
import { offStage, probe } from './stage-probe';

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
  it('readouts: a density under 1 cm⁻³ prints "< 1" (review case 50 K, N_D = 10¹⁶: p ≈ 10⁻⁹²)', () => {
    expect(belowOne(3.38e-92)).toBe('< 1');
    expect(belowOne(0.999)).toBe('< 1');
    expect(belowOne(1)).toBeUndefined();
    expect(belowOne(1e16)).toBeUndefined();
    const [rn, rp] = doping.readouts!;
    expect(rn.format).toBe(belowOne);
    expect(rp.format).toBe(belowOne);
    for (const type of ['i', 'n', 'p'] as const)
      for (const T of [30, 50, 100, 300, 800])
        for (const conc of [1e13, 1e16, 1e18]) {
          const p = { ...fromQuery(doping.params, new URLSearchParams()), type, T, conc } as never;
          for (const r of [rn, rp]) {
            const v = r.value(undefined as never, p);
            expect(Number.isFinite(v)).toBe(true);
            expect(r.format!(v)).toBe(v < 1 ? '< 1' : undefined);
          }
        }
    expect(carriersOf({ ...fromQuery(doping.params, new URLSearchParams()), type: 'n', T: 50, conc: 1e16 } as never).p).toBeLessThan(1);
  });

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

  it('doping tab offers undoped, n- and p-type; the strength slider is on the main bar and hidden when undoped', () => {
    const spec = doping.params.type;
    expect(spec.kind === 'select' && spec.options.map((o) => o.value)).toEqual(['i', 'n', 'p']);
    const conc = doping.params.conc;
    expect(conc.group).toBe('main');
    expect(conc.visibleIf!({ type: 'i', T: 300, conc: 1e16 })).toBe(false);
    expect(conc.visibleIf!({ type: 'n', T: 300, conc: 1e16 })).toBe(true);
    // An old "pure" link (type=i) is valid again.
    const p = fromQuery(doping.params, new URLSearchParams('type=i&T=400'));
    expect(p).toEqual({ type: 'i', T: 400, conc: 1e16 });
  });

  it('undoped: n = p = n_i at every T, E_F at the intrinsic level, whatever the hidden concentration says', () => {
    for (const T of [100, 300, 500, 800]) {
      for (const conc of [1e13, 1e18]) {
        const c = carriersOf({ type: 'i', T, conc });
        expect(c.n / ni(MATERIALS.si, T)).toBeCloseTo(1, 6);
        expect(c.p / c.n).toBeCloseTo(1, 6);
        expect(c.Dp + c.Am).toBe(0);
        // Slightly below mid-gap: E_F − E_g/2 = ½ kT ln(N_v/N_c) (−0.034 eV at 800 K).
        expect(c.mu - MATERIALS.si.Eg / 2).toBeCloseTo(intrinsicMu(MATERIALS.si, T), 6);
      }
    }
    expect(dotRef({ type: 'i', T: 300, conc: 1e13 })).toBe(REF_UNDOPED);
    expect(dotRef({ type: 'n', T: 300, conc: 1e13 })).toBe(1e13);
  });

  it('doping strength 10¹³–10¹⁸: E_F approaches the band edge, intrinsic onset moves up', () => {
    const gap = (N: number) => MATERIALS.si.Eg - carriersOf({ type: 'n', T: 300, conc: N }).mu;
    expect(gap(1e13)).toBeCloseTo(0.384, 2);
    expect(gap(1e18)).toBeCloseTo(0.093, 2);
    // Still non-degenerate at the top of the range (Boltzmann): E_c − E_F > 3 kT.
    expect(gap(1e18)).toBeGreaterThan(3 * 8.617e-5 * 300);
    const onset = (N: number) => {
      let T = 300;
      while (carriersOf({ type: 'n', T, conc: N }).n < 2 * N) T += 5;
      return T;
    };
    expect(onset(1e13)).toBe(450);
    expect(onset(1e15)).toBe(620);
  });

  it('intrinsic: n = p = n_i (the reference curve on the doping graph)', () => {
    const c = carriers(300, 0, 0);
    expect(c.n / ni(MATERIALS.si, 300)).toBeCloseTo(1, 6);
    expect(c.p / c.n).toBeCloseTo(1, 6);
  });
});

describe('ch41 doping: dopant level labels', () => {
  const isLevel = (s = '') => s.includes('ch41.d.level') || s.includes('*E*_{d}') || s.includes('*E*_{a}');
  it('n- and p-type name their level in the gap, clear of the E_F line; undoped has none', () => {
    for (const [w, h] of [
      [1280, 704],
      [390, 680],
    ])
      for (const type of ['i', 'n', 'p'] as const)
        for (const T of [30, 50, 100, 200, 300, 500, 800])
          for (const conc of [1e13, 1e15, 1e16, 1e17, 1e18]) {
            const p = { ...fromQuery(doping.params, new URLSearchParams()), type, T, conc } as never;
            const g = probe(doping, { t: 0 }, p, w, h);
            const labels = g.marks.filter((m) => m.kind === 'text' && isLevel(m.text));
            const ef = g.marks.find((m) => m.kind === 'text' && m.text === '*E*_{F}')!;
            if (type === 'i') {
              expect(labels).toHaveLength(0);
              continue;
            }
            expect(labels).toHaveLength(1);
            expect(Math.abs(labels[0].y - ef.y), `${type} ${T} K ${conc} at ${w}`).toBeGreaterThanOrEqual(10);
            expect(offStage(g)).toEqual([]);
          }
  });
});
