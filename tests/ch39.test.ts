import { describe, expect, it } from 'vitest';
import { infiniteLevel } from '../src/sims/modern/eigen';
import { forbiddenProbability, wellModel, type WellParams } from '../src/sims/ch39/physics';
import { HBAR_EVFS, model, supStates } from '../src/sims/ch39/scene';

const base: WellParams = { kind: 'infinite', L: 1, U0: 2, hw: 0.2, Ub: 2, b: 0.2 };

describe('ch39 wells', () => {
  it('infinite well defaults: four levels below 7 eV, E_n = n² E_1', () => {
    const m = wellModel(base);
    expect(m.st.E.length).toBe(4);
    m.st.E.forEach((E, k) => expect(E).toBeCloseTo(infiniteLevel(k + 1, 1), 3));
  });

  it('narrower well: wider level spacing (∝ 1/L²)', () => {
    const a = wellModel({ ...base, L: 1 }).st.E;
    const b = wellModel({ ...base, L: 0.5 }).st.E;
    expect((b[1] - b[0]) / (a[1] - a[0])).toBeCloseTo(4, 2);
  });

  it('finite well: deeper → more bound states; the ground state leaks into the barrier', () => {
    const n = (U0: number) => wellModel({ ...base, kind: 'finite', U0 }).st.E.length;
    expect([n(1), n(2), n(4)]).toEqual([2, 3, 4]);
    const m = wellModel({ ...base, kind: 'finite' });
    const leak = forbiddenProbability(m.st, 0);
    expect(leak).toBeGreaterThan(0.01);
    expect(leak).toBeLessThan(0.2);
  });

  it('harmonic: ground state ħω/2 and equal spacing ħω', () => {
    const m = wellModel({ ...base, kind: 'harmonic' });
    expect(m.n0).toBe(0);
    expect(m.st.E[0]).toBeCloseTo(0.1, 4);
    for (let k = 1; k < m.st.E.length; k++) expect(m.st.E[k] - m.st.E[k - 1]).toBeCloseTo(0.2, 3);
  });

  it('double well: lowest two levels form a close pair', () => {
    const E = wellModel({ ...base, kind: 'double' }).st.E;
    expect(E[1] - E[0]).toBeLessThan(0.2 * (E[2] - E[1]));
  });
});

describe('ch39 superposition', () => {
  const p = { pot: 'infinite', L: 1, U0: 2, hw: 0.2, Ub: 2, b: 0.2, pair: '12' };
  it('period T = h/(E2 − E1); ⟨x⟩ oscillates for 1 + 2', () => {
    const m = model(p);
    const q = supStates(m, '12');
    expect((2 * Math.PI) / q.w).toBeCloseTo((2 * Math.PI * HBAR_EVFS) / (m.st.E[1] - m.st.E[0]), 10);
    // Infinite well: ⟨x⟩ amplitude = 16 L / (9π²).
    expect(Math.abs(q.xc)).toBeCloseTo(16 / (9 * Math.PI ** 2), 3);
    expect(q.xm).toBeCloseTo(0, 6);
  });

  it('1 + 3 in a symmetric well: ⟨x⟩ stays at 0 (same parity)', () => {
    const q = supStates(model(p), '13');
    expect(q.xc).toBeCloseTo(0, 6);
  });

  it('guard: an index past the last state (unreachable from the controls) is clamped, never read out of range', () => {
    const m = model({ ...p, pot: 'finite', U0: 1, L: 0.5 });
    expect(m.st.E.length).toBe(1);
    const q = supStates(m, '23');
    expect(q.a).toBe(0);
    expect(q.b).toBe(0);
    expect(q.w).toBe(0);
  });
});
