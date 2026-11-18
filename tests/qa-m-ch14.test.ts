import { describe, expect, it } from 'vitest';
import { defaults } from '../src/core/params';
import { axisY, inletHead, radiusAt, TAPS, taps, type Venturi } from '../src/sims/ch14/physics';
import { venturi } from '../src/sims/ch14/scene';

describe('ch14 Venturi: every standpipe level shows above the pipe', () => {
  it('all 5733 slider combinations: level ≥ top wall + 3 cm at every tap, and inside the world', () => {
    let bad = 0;
    let minGap = Infinity;
    let n = 0;
    for (let i = 0; i <= 12; i++) {
      const ratio = 0.4 + 0.05 * i;
      for (let j = 0; j <= 20; j++) {
        const Q = 5 + 0.5 * j;
        for (let dy = 0; dy <= 20; dy++) {
          n++;
          const v: Venturi = { A1: 0.01, ratio, Q: Q / 1000, dy: dy / 100 };
          const tp = taps(v);
          TAPS.forEach((x, k) => {
            const gap = tp[k].level - (axisY(v, x) + radiusAt(v, x));
            minGap = Math.min(minGap, gap);
            if (gap < 0.03 - 1e-9) bad++;
          });
          const w = venturi.world({ ...(defaults(venturi.params) as any), ratio, Q, dy });
          for (const q of tp) expect(q.level).toBeLessThan(w.y[1]);
          expect(inletHead(v)).toBeLessThanOrEqual(1);
        }
      }
    }
    expect(n).toBe(5733);
    // Before: 633 combinations had a level below the top wall (inside the pipe).
    expect(bad).toBe(0);
    expect(minGap).toBeGreaterThanOrEqual(0.03 - 1e-9);
  });
});
