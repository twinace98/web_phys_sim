import { describe, expect, it } from 'vitest';
import { defaults } from '../src/core/params';
import { Runner } from '../src/core/runner';
import { currentOf } from '../src/sims/ch26/physics';
import { T_PLOT, T_READ, conduction } from '../src/sims/ch26/scene';

describe('ch26 Q/t graph', () => {
  it('starts at 1 s (was 3 s), within the y range of the graph; the readout still waits for 3 s', () => {
    expect(T_PLOT).toBe(1);
    expect(T_READ).toBe(3);
    for (const V of [0, 0.1, 1, 1.5]) {
      const p = { ...defaults(conduction.params), V };
      const I = currentOf({ L: p.L, A: p.A, T: p.T }, V) * 1e3;
      const plot = conduction.plots!.find((q) => q.id === 'i')!;
      const [lo, hi] = plot.yRange!(p);
      let inRange = 0;
      let n = 0;
      for (let seed = 1; seed <= 6; seed++) {
        const run = new Runner(conduction, p, seed);
        run.play();
        run.advance(0.9);
        const read = conduction.readouts!.find((r) => r.label === 'I')!;
        expect(read.value(run.state, p)).toBeNaN();
        run.advance(0.2);
        const rec = conduction.record!(run.state, p) as { i: number };
        expect(Number.isFinite(rec.i)).toBe(true);
        // At 1.1 s: within the graph's range (noise bound) and, for a clear current, below and near I.
        n++;
        if (rec.i >= lo && rec.i <= hi) inRange++;
        if (V >= 1) {
          expect(rec.i).toBeGreaterThan(0.4 * I);
          expect(rec.i).toBeLessThan(1.3 * I);
        }
        expect(read.value(run.state, p)).toBeNaN();
      }
      expect(inRange / n).toBeGreaterThanOrEqual(5 / 6);
    }
  });
});
