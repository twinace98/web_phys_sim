import { describe, expect, it } from 'vitest';
import { defaults } from '../src/core/params';
import { Runner } from '../src/core/runner';
import { newton } from '../src/sims/ch05/newton';

function endState(p: any) {
  const r = new Runner(newton as any, p);
  r.play();
  for (let i = 0; i < 2000 && r.playing; i++) r.advance(0.05);
  return r.state as any;
}

describe('ch05 second law: fixed scales, so a = F/m shows on screen', () => {
  const base = defaults(newton.params) as any;
  const w0 = newton.world(base);
  const ranges0 = newton.plots!.map((pl) => pl.yRange!(base));

  it('the track and plot ranges change with neither F nor m', () => {
    for (const F of [0.5, 1, 2.3, 5]) {
      for (const m of [1, 1.7, 3, 5]) {
        const p = { ...base, F, m };
        expect(newton.world(p)).toEqual(w0);
        expect(newton.plots!.map((pl) => pl.yRange!(p))).toEqual(ranges0);
        // The puck stays on the drawn track.
        expect(endState(p).x).toBeLessThanOrEqual(w0.x[1]);
      }
    }
  });

  it('distance on screen scales as F/m: twice the force, twice as far; twice the mass, half as far', () => {
    const x = (F: number, m: number) => endState({ ...base, F, m }).x;
    expect(x(4, 2) / x(2, 2)).toBeCloseTo(2, 9);
    expect(x(2, 2) / x(2, 4)).toBeCloseTo(2, 9);
    expect(x(5, 1) / x(0.5, 5)).toBeCloseTo(50, 9);
  });

  it('the largest acceleration (5 N on 1 kg) fills the a plot and the track', () => {
    const s = endState({ ...base, F: 5, m: 1 });
    const ra = newton.plots!.find((pl) => pl.id === 'a')!.yRange!(base);
    expect(s.a).toBeLessThanOrEqual(ra[1]);
    expect(s.a / ra[1]).toBeGreaterThan(0.85);
    expect(s.x).toBeCloseTo(40, 9);
  });
});
