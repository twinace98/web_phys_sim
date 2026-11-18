import { describe, expect, it } from 'vitest';
import { defaults } from '../src/core/params';
import { Runner } from '../src/core/runner';
import { currentOf, tauOf } from '../src/sims/ch26/physics';
import { COUNT_FROM, PLOT_AFTER, READ_AFTER, conduction, countStart } from '../src/sims/ch26/scene';

describe('ch26 Ī graph', () => {
  it('counting starts at 4τ (1 s at 300 K); the graph follows 1 s later, the readout 2 s later', () => {
    expect(COUNT_FROM).toBe(4);
    expect(countStart(300)).toBeCloseTo(4 * tauOf(300), 12);
    expect(countStart(300)).toBeCloseTo(1, 12);
    expect(PLOT_AFTER).toBe(1);
    expect(READ_AFTER).toBe(2);
    for (const V of [0, 0.1, 1, 1.5]) {
      const p = { ...defaults(conduction.params), V };
      const I = currentOf({ L: p.L, A: p.A, T: p.T }, V) * 1e3;
      const plot = conduction.plots!.find((q) => q.id === 'i')!;
      const [lo, hi] = plot.yRange!(p);
      const read = conduction.readouts!.find((r) => r.label === 'I')!;
      let inRange = 0;
      let n = 0;
      for (let seed = 1; seed <= 6; seed++) {
        const run = new Runner(conduction, p, seed);
        run.play();
        run.advance(1.9);
        expect((conduction.record!(run.state, p) as { i: number }).i).toBeNaN();
        run.advance(0.2);
        const rec = conduction.record!(run.state, p) as { i: number };
        expect(Number.isFinite(rec.i)).toBe(true);
        // At 2.1 s: within the graph's range (noise bound) and, for a clear current, near I.
        n++;
        if (rec.i >= lo && rec.i <= hi) inRange++;
        if (V >= 1) {
          expect(rec.i).toBeGreaterThan(0.6 * I);
          expect(rec.i).toBeLessThan(1.4 * I);
        }
        expect(read.value(run.state, p)).toBeNaN();
        run.advance(0.95);
        expect(Number.isFinite(read.value(run.state, p))).toBe(true);
      }
      expect(inRange / n).toBeGreaterThanOrEqual(5 / 6);
    }
  });

  it('Ī is no longer biased low by the build-up of the drift (QA E4)', () => {
    // Before: Q/t from t = 0 gave E[Ī] = I [1 − (τ/t)(1 − e^{−t/τ})], −8.3 % at 3 s (V/I ≈ 10.9 Ω).
    // Now ΔQ/Δt from 4τ: expected bias −τ e^{−4}/(t − 4τ) ≈ −0.2 %; mean of 60 runs (σ ≈ 5 % each).
    const p = { ...defaults(conduction.params), V: 1.5 };
    const I = currentOf({ L: p.L, A: p.A, T: p.T }, p.V) * 1e3;
    const read = conduction.readouts!.find((r) => r.label === 'I')!;
    const ohm = conduction.readouts!.find((r) => r.label === 'V/I')!;
    let sum = 0;
    let sumR = 0;
    const N = 60;
    for (let seed = 1; seed <= N; seed++) {
      const run = new Runner(conduction, p, seed);
      run.play();
      run.advance(3.001);
      sum += read.value(run.state, p) / I;
      sumR += ohm.value(run.state, p);
    }
    expect(Math.abs(sum / N - 1)).toBeLessThan(0.025);
    expect(Math.abs(sumR / N - 10)).toBeLessThan(0.3);
  });
});
