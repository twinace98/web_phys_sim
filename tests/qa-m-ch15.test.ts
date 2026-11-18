import { describe, expect, it } from 'vitest';
import { omegaD, oscAt, period } from '../src/sims/ch15/physics';
import { PHASE_PER_PERIOD, phaseSamples } from '../src/sims/ch15/shm';

describe('ch15 phase-space path stays smooth on long runs', () => {
  it('at most 2π/40 of phase between samples, for any k, m, damping and run time', () => {
    let worst = 0;
    for (const k of [5, 20, 40]) {
      for (const m of [0.2, 1, 2]) {
        for (const zeta of [0, 0.01, 0.05, 0.2]) {
          const o = { A: 0.2, k, m, zeta };
          const wd = omegaD(o);
          for (const t of [0.3, 5, 19, 60, 300]) {
            const { t0, n } = phaseSamples(o, t);
            // Phase advance per sample (the path's angle in the (x, v/ω) plane grows at ω_d on average).
            worst = Math.max(worst, (wd * (t - t0)) / n);
            // The path ends at the current state.
            expect(t0).toBeGreaterThanOrEqual(0);
            expect(t0).toBeLessThan(t);
          }
        }
      }
    }
    // Before: 160 samples over the whole damped history, 19 s at T = 1.4 s gave 2π/11.8 per sample.
    expect(worst).toBeLessThanOrEqual((2 * Math.PI) / 40);
  });

  it('damped: the spiral keeps every ring down to 1/50 of the oldest one drawn, with a bounded sample count', () => {
    for (const zeta of [0.01, 0.2]) {
      const o = { A: 0.2, k: 40, m: 0.2, zeta };
      const T = period(o);
      const { t0, n } = phaseSamples(o, 1000);
      const ratio = Math.exp(-zeta * Math.sqrt(o.k / o.m) * (1000 - t0));
      expect(ratio).toBeLessThan(1 / 50);
      expect(n).toBeLessThanOrEqual(PHASE_PER_PERIOD * 70);
      // Early on the whole history is drawn.
      expect(phaseSamples(o, 3 * T).t0).toBe(0);
      expect(Number.isFinite(oscAt(o, t0).x)).toBe(true);
    }
  });

  it('undamped: one closed period', () => {
    const o = { A: 0.2, k: 20, m: 1, zeta: 0 };
    const T = period(o);
    const { t0 } = phaseSamples(o, 19);
    expect(19 - t0).toBeCloseTo(T, 12);
  });
});
