import { describe, expect, it } from 'vitest';
import { EPS0, KAPPA, capState, capacitance, fieldEnergy, type Plates } from '../src/sims/ch25/physics';
import { capPanel, siTex } from '../src/sims/ch25/scene';

const REF: Plates = { A: 1e-2, d: 1e-3, kappa: 1 };
const V0 = 12;

describe('ch25 parallel-plate capacitor', () => {
  it('C = κ ε0 A / d', () => {
    expect(capacitance(REF)).toBeCloseTo(88.54e-12, 15);
    expect(capacitance({ ...REF, A: 2e-2 }) / capacitance(REF)).toBeCloseTo(2, 12);
    expect(capacitance({ ...REF, d: 2e-3 }) / capacitance(REF)).toBeCloseTo(0.5, 12);
    expect(capacitance({ ...REF, kappa: 4.7 }) / capacitance(REF)).toBeCloseTo(4.7, 12);
  });

  it('battery connected: V fixed, Q and U grow by κ, E unchanged', () => {
    const s0 = capState(REF, true, V0, REF);
    const s = capState({ ...REF, kappa: KAPPA.glass }, true, V0, REF);
    expect(s.V).toBeCloseTo(V0, 12);
    expect(s.Q / s0.Q).toBeCloseTo(4.7, 12);
    expect(s.E / s0.E).toBeCloseTo(1, 12);
    expect(s.U / s0.U).toBeCloseTo(4.7, 12);
  });

  it('battery disconnected: Q fixed, V, E and U drop by κ', () => {
    const s0 = capState(REF, false, V0, REF);
    const s = capState({ ...REF, kappa: KAPPA.paper }, false, V0, REF);
    expect(s.Q).toBeCloseTo(s0.Q, 20);
    expect(s.V / s0.V).toBeCloseTo(1 / 3.5, 12);
    expect(s.E / s0.E).toBeCloseTo(1 / 3.5, 12);
    expect(s.U / s0.U).toBeCloseTo(1 / 3.5, 12);
  });

  it('disconnected: pulling the plates apart raises V and U', () => {
    const s = capState({ ...REF, d: 2e-3 }, false, V0, REF);
    expect(s.V).toBeCloseTo(2 * V0, 10);
    expect(s.U / capState(REF, false, V0, REF).U).toBeCloseTo(2, 12);
  });

  it('Gauss with a dielectric: E = (σ − σ_b)/ε0, and U equals the field energy', () => {
    for (const kappa of [1, 3.5, 80.4]) {
      for (const on of [true, false]) {
        const c = { ...REF, kappa };
        const s = capState(c, on, V0, REF);
        expect(s.E).toBeCloseTo((s.sigma - s.sigmaB) / EPS0, 6);
        expect(fieldEnergy(c, s.E) / s.U).toBeCloseTo(1, 12);
        expect(s.Q).toBeCloseTo(s.C * s.V, 20);
      }
    }
  });

  it('panel and SI formatting', () => {
    expect(siTex(88.54e-12, 'F')).toBe('88.5\\,\\mathrm{pF}');
    expect(siTex(12000, 'V/m')).toBe('12.0\\,\\mathrm{kV/m}');
    expect(siTex(1.0625e-9, 'C')).toBe('1.06\\,\\mathrm{nC}');
    const tex = capPanel({ dielectric: 'glass', source: 'on', A: 100, d: 1 });
    expect(tex).toContain('4.70');
    expect(tex).toContain('X/X_0');
  });
});
