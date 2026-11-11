import { describe, expect, it } from 'vitest';
import { defaults } from '../src/core/params';
import { Rng } from '../src/core/rng';
import { Runner } from '../src/core/runner';
import { timeUnit } from '../src/core/types';
import { decayScene } from '../src/sims/ch42/decay';
import { ISOTOPES, decayTimes, expected, lambdaOf, remaining } from '../src/sims/ch42/physics';

describe('ch42 radioactive decay', () => {
  it('λ T½ = ln 2 and the expected count halves every half-life', () => {
    for (const iso of ISOTOPES) {
      expect(lambdaOf(iso.half) * iso.half).toBeCloseTo(Math.LN2, 12);
      for (let k = 0; k <= 4; k++) expect(expected(1000, iso.half, k * iso.half)).toBeCloseTo(1000 / 2 ** k, 9);
    }
  });

  it('remaining() counts decay times later than t', () => {
    const s = Float64Array.from([0.5, 1, 1, 2, 3]);
    expect(remaining(s, 0)).toBe(5);
    expect(remaining(s, 1)).toBe(2);
    expect(remaining(s, 2.5)).toBe(1);
    expect(remaining(s, 10)).toBe(0);
  });

  it('a large sample follows N0 e^{−λt} within a few standard deviations', () => {
    const N0 = 100000;
    const times = decayTimes(N0, 5.73, new Rng(1)).sort();
    for (const k of [0.5, 1, 2, 3]) {
      const t = k * 5.73;
      const p = 2 ** -k;
      const sd = Math.sqrt(N0 * p * (1 - p));
      expect(Math.abs(remaining(times, t) - N0 * p)).toBeLessThan(4 * sd);
    }
  });

  it('memoryless: of the nuclei alive at T½, half are still alive at 2T½', () => {
    const times = decayTimes(200000, 1, new Rng(8));
    let alive1 = 0;
    let alive2 = 0;
    for (const t of times) {
      if (t > 1) alive1++;
      if (t > 2) alive2++;
    }
    expect(alive2 / alive1).toBeCloseTo(0.5, 2);
  });

  it('scene: same seed, same run; time unit follows the isotope; runs to 5 half-lives', () => {
    const p = defaults(decayScene.params);
    const run = () => {
      const r = new Runner(decayScene, p);
      r.play();
      for (let i = 0; i < 400 && r.playing; i++) r.advance(0.1);
      return r;
    };
    const a = run();
    const b = run();
    expect(a.done).toBe(true);
    expect(a.state.t).toBeCloseTo(5 * 5.73, 6);
    expect(Array.from(a.hist.col('N'))).toEqual(Array.from(b.hist.col('N')));
    expect(timeUnit(decayScene.time, p)).toBe('×10³ y');
    expect(timeUnit(decayScene.time, { ...p, iso: 'i131' })).toBe('d');
  });
});
