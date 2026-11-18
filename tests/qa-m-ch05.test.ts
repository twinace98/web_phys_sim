import { describe, expect, it } from 'vitest';
import { defaults } from '../src/core/params';
import { Runner } from '../src/core/runner';
import { newton } from '../src/sims/ch05/newton';

const MASSES = [0.5, 0.7, 1, 1.3, 2, 2.9, 3.6, 5];

function endState(p: any) {
  const r = new Runner(newton as any, p);
  r.play();
  for (let i = 0; i < 2000 && r.playing; i++) r.advance(0.05);
  return r.state as any;
}

describe('ch05 second law: a heavier puck visibly accelerates less', () => {
  for (const force of ['off', 'on']) {
    it(`force ${force}: the track and plot ranges do not change with m, so x, v, a scale as 1/m on screen`, () => {
      const base = { ...(defaults(newton.params) as any), force, F: 2 };
      const w0 = newton.world(base);
      const ranges0 = newton.plots!.map((pl) => pl.yRange!(base));
      const frac: number[] = [];
      const xs: number[] = [];
      for (const m of MASSES) {
        const p = { ...base, m };
        expect(newton.world(p)).toEqual(w0);
        expect(newton.plots!.map((pl) => pl.yRange!(p))).toEqual(ranges0);
        const s = endState(p);
        const span = w0.x[1] - w0.x[0];
        frac.push((s.x - w0.x[0]) / span);
        xs.push(s.x);
        // Puck inside the drawn world at the end.
        expect(s.x).toBeLessThanOrEqual(w0.x[1]);
      }
      // Before: every mass ended at the same fraction of the stage (pixel-identical pictures).
      for (let i = 1; i < frac.length; i++) expect(frac[i]).toBeLessThan(frac[i - 1] - 0.005);
      expect(xs[0] / xs[xs.length - 1]).toBeCloseTo(10, 6);
    });
  }

  it('the force plot range is fixed by the largest force, so F shows in the plot', () => {
    const p = defaults(newton.params) as any;
    const rF = newton.plots!.find((pl) => pl.id === 'F')!.yRange!;
    expect(rF({ ...p, F: 0.5 })).toEqual(rF({ ...p, F: 5 }));
    expect(rF(p)[1]).toBeGreaterThanOrEqual(5);
  });
});
