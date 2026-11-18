import { describe, expect, it } from 'vitest';
import { kinetic, makeSetup, trajectory, work } from '../src/sims/ch07/physics';

// QA: the custom profile (4 bars, each −2..2 N in 0.5 N steps) must keep area = ΔK at every sample,
// and a block whose K reaches 0 exactly on an edge must stop there (no creeping past the edge).
const VALS = Array.from({ length: 9 }, (_, i) => -2 + 0.5 * i);

describe('ch07 custom force: all 6561 combinations', () => {
  it('area under F(x) equals ΔK to 1e-9 at every sample, and the run ends on the track', () => {
    let bad = 0;
    let worst = 0;
    for (const a of VALS) for (const b of VALS) for (const c of VALS) for (const d of VALS) {
      const su = makeSetup('custom', [a, b, c, d]);
      const tj = trajectory(su, 240, 15);
      const K0 = kinetic(su.m, su.v0);
      let err = 0;
      for (let i = 0; i < tj.n; i++) {
        err = Math.max(err, Math.abs(kinetic(su.m, tj.v[i]) - K0 - work(su.prof, su.x0, tj.x[i])));
        if (tj.x[i] < su.lo - 1e-12 || tj.x[i] > su.hi + 1e-12) err = Infinity;
      }
      worst = Math.max(worst, err);
      if (err > 1e-9) bad++;
    }
    expect(bad).toBe(0);
    expect(worst).toBeLessThan(1e-9);
  });

  it('[0, −0.5, 0, F4]: K0 = 1 J is used up exactly on 2–4 m, so the block stops at x = 4 m', () => {
    for (const d of VALS) {
      const su = makeSetup('custom', [0, -0.5, 0, d]);
      const tj = trajectory(su, 240, 15);
      const xEnd = tj.x[tj.n - 1];
      expect(xEnd, `F4 = ${d}`).toBeCloseTo(4, 9);
      expect(Math.abs(tj.v[tj.n - 1])).toBeLessThan(1e-9);
    }
  });
});
