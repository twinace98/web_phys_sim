import { describe, expect, it } from 'vitest';
import { envelope, harmonic, nodes, reflectAt, resonance, steadyAmp, stringAdvance, stringInit, stringStep, type Driven, type Reflect } from '../src/sims/ch16/physics';

const base: Reflect = { L: 4, v: 2, A: 0.3, mode: 'pulse', end: 'fixed', lambda: 1.6, tau: 0.5, t0: 0.6 };

describe('ch16 reflection', () => {
  it('fixed end: y(L) = 0 always; the pulse returns inverted', () => {
    for (const t of [0, 1, 1.5, 1.8, 2.1, 3]) expect(reflectAt(base, 4, t).y).toBeCloseTo(0, 14);
    // incident peak at x = 0.7 at t = 0; reflected peak back at x = 0.7 when 2L − x = v(t + t0) − v τ/2
    const t = (2 * 4 - 0.7) / 2 - 0.6 + 0.25;
    expect(reflectAt(base, 0.7, t).y).toBeCloseTo(-0.3, 12);
    expect(reflectAt(base, 0.7, 0).y).toBeCloseTo(0.3, 12);
  });

  it('free end: zero slope at L, displacement doubles at the moment of reflection', () => {
    const r: Reflect = { ...base, end: 'free' };
    const h = 1e-6;
    for (const t of [1.5, 1.7, 1.9]) expect((reflectAt(r, 4, t).y - reflectAt(r, 4 - h, t).y) / h).toBeCloseTo(0, 4);
    // pulse peak reaches L when v(t + t0) − v τ/2 = L
    const tp = 4 / 2 + 0.25 - 0.6;
    expect(reflectAt(r, 4, tp).y).toBeCloseTo(0.6, 12);
    const t = (2 * 4 - 0.7) / 2 - 0.6 + 0.25;
    expect(reflectAt(r, 0.7, t).y).toBeCloseTo(0.3, 12);
  });

  it('continuous wave: after 2L/v the string is a standing wave with fixed nodes λ/2 apart', () => {
    for (const end of ['fixed', 'free'] as const) {
      const r: Reflect = { ...base, mode: 'wave', end, A: 0.2, t0: 0 };
      const ns = nodes(r);
      for (let i = 1; i < ns.length; i++) expect(ns[i - 1] - ns[i]).toBeCloseTo(0.8, 12);
      expect(ns[0]).toBeCloseTo(end === 'fixed' ? 4 : 3.6, 12);
      for (const xn of ns) for (const t of [4.1, 4.37, 5.02, 6.6]) expect(reflectAt(r, xn, t).y).toBeCloseTo(0, 12);
      // the displacement never exceeds the envelope 2A|sin k(L−x)| (or |cos|), and reaches it
      for (const x of [0.3, 1.1, 2.5]) {
        let m = 0;
        for (let k = 0; k < 400; k++) m = Math.max(m, Math.abs(reflectAt(r, x, 4.5 + k * 0.002).y));
        expect(m).toBeLessThanOrEqual(envelope(r, x) + 1e-12);
        expect(m).toBeGreaterThan(envelope(r, x) - 1e-3);
      }
    }
  });
});

describe('ch16 resonance', () => {
  const s: Driven = { L: 2, v: 4, beta: 0.3, d: 0.03, N: 100 };

  it('harmonics f_n = n v / 2L; the steady-state curve peaks there', () => {
    expect(harmonic(s, 1)).toBe(1);
    expect(harmonic(s, 3)).toBe(3);
    for (const n of [1, 2, 3, 4]) {
      const peak = resonance(s, n);
      expect(peak).toBeGreaterThan(resonance(s, n - 0.15));
      expect(peak).toBeGreaterThan(resonance(s, n + 0.15));
      expect(peak).toBeGreaterThan(5 * resonance(s, n + 0.5));
      // peak ≈ d v / (β L)
      expect(peak).toBeCloseTo((s.d * s.v) / (s.beta * s.L), 1);
    }
    expect(steadyAmp(s, 1.7, 0)).toBeCloseTo(s.d, 12);
    expect(steadyAmp(s, 1.7, s.L)).toBeCloseTo(0, 12);
  });

  it('finite differences converge to the analytic steady state', () => {
    for (const f of [1.5, 2]) {
      const st = stringInit(s);
      const steps = Math.round(30 / stringStep(s));
      let amp = 0;
      for (let i = 0; i < steps; i++) {
        stringAdvance(s, st, f);
        if (i > steps - Math.round(1 / f / stringStep(s))) amp = Math.max(amp, Math.abs(st.y[Math.round(s.N / 4)]));
      }
      const exact = steadyAmp(s, f, s.L / 4);
      expect(Math.abs(amp - exact) / exact).toBeLessThan(0.03);
      expect(st.y[s.N]).toBe(0);
    }
  });
});
