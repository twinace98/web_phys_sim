import { describe, expect, it } from 'vitest';
import { formulaFree, freeScene } from '../src/sims/ch31/free';
import { tn } from '../src/core/tex';
import { defaults } from '../src/core/params';
import { fmt } from '../src/core/format';
import ko from '../src/sims/ch31/i18n.ko.json';
import en from '../src/sims/ch31/i18n.en.json';
import { acAt, currentAmp, energies, freeAt, impedance, omega0, phase, type Drive, type RLC } from '../src/sims/ch31/physics';

const L = 10e-3;
const C = 10e-6;
const q0 = 100e-6;

/** Residual of L q'' + R q' + q/C using the analytic i and a numerical di/dt. */
function residual(c: RLC, t: number): number {
  const d = 1e-8;
  const a = freeAt(c, q0, t);
  const b = freeAt(c, q0, t + d);
  return (c.L * (b.i - a.i)) / d + c.R * a.i + a.q / c.C;
}

describe('ch31 free RLC', () => {
  it('LC: period 2π√(LC), energy conserved, i = dq/dt', () => {
    const c: RLC = { R: 0, L, C };
    const T = 2 * Math.PI * Math.sqrt(L * C);
    expect(freeAt(c, q0, T).q).toBeCloseTo(q0, 12);
    const U0 = energies(c, q0, 0).UE;
    for (const t of [0.1e-3, 0.5e-3, 1.3e-3, 7.7e-3]) {
      const k = freeAt(c, q0, t);
      const e = energies(c, k.q, k.i);
      expect((e.UE + e.UB) / U0).toBeCloseTo(1, 12);
      const d = 1e-9;
      expect((freeAt(c, q0, t + d).q - k.q) / d).toBeCloseTo(k.i, 4);
    }
    // a quarter period: all energy magnetic
    const k = freeAt(c, q0, T / 4);
    expect(energies(c, k.q, k.i).UB / U0).toBeCloseTo(1, 10);
  });

  it('under-, critically and over-damped solutions satisfy the circuit equation', () => {
    const Rc = 2 * Math.sqrt(L / C);
    for (const R of [5, 20, Rc, 100]) {
      const c: RLC = { R, L, C };
      expect(freeAt(c, q0, 0).q).toBeCloseTo(q0, 15);
      expect(freeAt(c, q0, 0).i).toBeCloseTo(0, 12);
      for (const t of [0.2e-3, 1e-3, 3e-3]) expect(Math.abs(residual(c, t)) / (q0 / C)).toBeLessThan(1e-4);
    }
  });

  it('damping: amplitude after one period drops by e^(−RT/2L); energy decreases', () => {
    const c: RLC = { R: 5, L, C };
    const wd = Math.sqrt(1 / (L * C) - (5 / (2 * L)) ** 2);
    const Td = (2 * Math.PI) / wd;
    expect(freeAt(c, q0, Td).q / q0).toBeCloseTo(Math.exp((-5 * Td) / (2 * L)), 10);
    let prev = Infinity;
    for (let t = 0; t < 5e-3; t += 0.1e-3) {
      const k = freeAt(c, q0, t);
      const e = energies(c, k.q, k.i);
      expect(e.UE + e.UB).toBeLessThanOrEqual(prev + 1e-15);
      prev = e.UE + e.UB;
    }
  });
});

describe('ch31 free RLC: the 100 Ω ⓘ line is tied to R ≥ 2√(L/C) (review §0-1)', () => {
  const Tp = freeScene.readouts![0];
  const base = defaults(freeScene.params);

  it('review case 20 mH, 5 μF: 2√(L/C) = 126.5 Ω, 100 Ω oscillates with T′ = 3.24 ms in the readout and Σ', () => {
    const p = { ...base, R: 100, L: 20, C: 5 };
    expect(2 * Math.sqrt(20e-3 / 5e-6)).toBeCloseTo(126.49, 2);
    const T = Tp.value({ t: 0, n: 0 } as never, p);
    expect(fmt(T, Tp.sig ?? 3)).toBe('3.24');
    const lines = formulaFree({ t: 0, n: 0 } as never, p);
    expect(lines.some((l) => l.startsWith("T' = ") && l.endsWith('3.24\\ \\mathrm{ms}'))).toBe(true);
    expect(lines.some((l) => l.includes('\\ge \\omega_0'))).toBe(false);
    // Defaults: 2√(L/C) = 63.2 Ω, so 100 Ω does not oscillate: no period, Σ states R/2L ≥ ω₀.
    const d = { ...base, R: 100 };
    expect(2 * Math.sqrt(10e-3 / 10e-6)).toBeCloseTo(63.25, 2);
    expect(Number.isNaN(Tp.value({ t: 0, n: 0 } as never, d))).toBe(true);
    expect(formulaFree({ t: 0, n: 0 } as never, d).some((l) => l.includes('\\ge \\omega_0'))).toBe(true);
  });

  it('sweep over every L, C (and R = 0, 1, 50, 99, 100): oscillation iff R < 2√(L/C); 16 of 256 at 100 Ω', () => {
    let osc100 = 0;
    let lo = Infinity;
    let hi = 0;
    for (let L = 5; L <= 20; L++)
      for (let C = 5; C <= 20; C++) {
        const Rc = 2 * Math.sqrt((L * 1e-3) / (C * 1e-6));
        lo = Math.min(lo, Rc);
        hi = Math.max(hi, Rc);
        for (const R of [0, 1, 50, 99, 100]) {
          const p = { ...base, R, L, C };
          const T = Tp.value({ t: 0, n: 0 } as never, p);
          const osc = R < Rc;
          expect(Number.isFinite(T)).toBe(osc);
          const lines = formulaFree({ t: 0, n: 0 } as never, p);
          expect(lines.some((l) => l.startsWith("T' = ") || l.startsWith("R = 0:"))).toBe(osc);
          if (R === 100 && osc) osc100++;
        }
      }
    expect(osc100).toBe(16);
    expect(lo).toBeCloseTo(31.62, 2);
    expect(hi).toBeCloseTo(126.49, 2);
  });

  it('Σ U line: printed terms add up to the printed U, also once U < 10⁻⁹ μJ (100 Ω, 20 mH, 5 μF at 5.55 ms)', () => {
    const val = (s: string) => Number(s.replace(/\\times 10\^\{(-?\d+)\}/, 'e$1'));
    for (const [R, L, C] of [
      [100, 20, 5],
      [100, 10, 10],
      [100, 5, 20],
      [20, 10, 10],
      [0, 10, 10],
    ])
      for (const t of [0, 0.37, 1.1, 2.2, 3.3, 4.71, 5.55, 7, 7.9, 10]) {
        const line = formulaFree({ t, n: 0 } as never, { ...base, R, L, C }).at(-1)!;
        const m = line.match(/= ([-\d.e\\times{}^ ]+) \+ ([-\d.e\\times{}^ ]+) = ([-\d.e\\times{}^ ]+)\\ \\mu/);
        expect(m, line).not.toBeNull();
        const [a, b, c] = [m![1], m![2], m![3]].map((x) => val(x.trim()));
        // The printed U is the readout's U (same zero tolerance 10⁻⁹ μJ).
        const Ur = freeScene.readouts![1].value({ t, n: 0 } as never, { ...base, R, L, C });
        expect(m![3].trim(), line).toBe(tn(Ur));
        if (Math.abs(Ur) < 1e-9) expect([a, b, c]).toEqual([0, 0, 0]);
        else {
          // Terms in exponent form when tiny: their sum, as printed, agrees with the printed U (R3).
          expect(Math.abs(a + b - c), line).toBeLessThanOrEqual(0.01 * c);
          expect(a + b, line).toBeGreaterThan(0);
        }
      }
  });

  it('ⓘ text: the claim carries the condition, the defaults and the 20 mH, 5 μF counter-example', () => {
    for (const s of [ko['ch31.f.obs.over'], en['ch31.f.obs.over']]) {
      expect(s.startsWith('$R \\ge 2\\sqrt{L/C}$')).toBe(true);
      expect(s).toContain('63.2 Ω');
      expect(s).toContain('126.5 Ω');
      expect(s).toContain('3.24 ms');
    }
    expect(ko['ch31.f.obs.over']).not.toMatch(/^저항 100 Ω/);
  });
});

describe('ch31 driven RLC', () => {
  const c: RLC = { R: 20, L, C };
  const w0 = omega0(c);

  it('loop rule ε = v_R + v_L + v_C at every instant, any driving frequency', () => {
    for (const r of [0.5, 0.8, 1, 1.25, 2]) {
      const dr: Drive = { em: 10, wd: r * w0 };
      for (const t of [0, 0.3e-3, 1.1e-3]) {
        const s = acAt(c, dr, t);
        expect(s.vR + s.vL + s.vC).toBeCloseTo(s.emf, 10);
        const d = 1e-9;
        expect((acAt(c, dr, t + d).q - s.q) / d).toBeCloseTo(s.i, 5);
      }
    }
  });

  it('v_L leads i by 90°, v_C lags by 90°', () => {
    const dr: Drive = { em: 10, wd: 0.8 * w0 };
    const T = (2 * Math.PI) / dr.wd;
    // Find a time when i crosses zero going up: v_L is at its maximum there, v_C at its minimum.
    const phi = phase(c, dr.wd);
    const t0 = phi / dr.wd + T;
    const s = acAt(c, dr, t0);
    expect(s.i).toBeCloseTo(0, 10);
    expect(s.vL).toBeCloseTo(currentAmp(c, dr) * dr.wd * L, 8);
    expect(s.vC).toBeCloseTo(-currentAmp(c, dr) / (dr.wd * C), 8);
  });

  it('resonance: Z = R, φ = 0, v_L + v_C = 0, current largest', () => {
    const dr: Drive = { em: 10, wd: w0 };
    expect(impedance(c, w0)).toBeCloseTo(20, 10);
    expect(phase(c, w0)).toBeCloseTo(0, 12);
    for (const t of [0.1e-3, 0.7e-3]) {
      const s = acAt(c, dr, t);
      expect(s.vL + s.vC).toBeCloseTo(0, 10);
    }
    for (const r of [0.5, 0.8, 1.25, 2]) expect(currentAmp(c, { em: 10, wd: r * w0 })).toBeLessThan(currentAmp(c, dr));
    expect(phase(c, 0.5 * w0)).toBeLessThan(0);
    expect(phase(c, 2 * w0)).toBeGreaterThan(0);
  });

  it("free scene shows the damped period T' = 2π/ω', and – when not oscillating", () => {
    const T = freeScene.readouts!.find((r) => r.label === "T'")!;
    const base = { R: 0, L: 10, C: 10, spring: true };
    const s0 = { t: 0, n: 0 };
    // R = 0: T' = T0 = 2π√(LC) = 1.987 ms.
    expect(T.value(s0, base)).toBeCloseTo(2 * Math.PI * Math.sqrt(10e-3 * 10e-6) * 1e3, 9);
    // R = 20 Ω: ω' = √(1/LC − (R/2L)²) = √(10⁷ − 10⁶) rad/s, T' = 2.094 ms.
    expect(T.value(s0, { ...base, R: 20 })).toBeCloseTo(((2 * Math.PI) / Math.sqrt(1e7 - 1e6)) * 1e3, 9);
    // Critical (R = 2√(L/C) = 63.2 Ω for 10 mH, 10 μF) and overdamped: no period.
    expect(T.value(s0, { ...base, R: 64 })).toBeNaN();
    expect(T.value(s0, { ...base, R: 100 })).toBeNaN();
    expect(T.value(s0, { ...base, R: 63, L: 5, C: 20 })).toBeNaN();
    expect(Number.isFinite(T.value(s0, { ...base, R: 63 }))).toBe(true);
  });
});
