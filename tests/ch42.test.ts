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
      const r = new Runner(decayScene, p, 1);
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

describe('ch42 activity readout (P3 leftover)', () => {
  it('R = λN in decays per base unit (y⁻¹, d⁻¹ for ¹³¹I), the same number in the readout and Σ; tiny ²³⁸U rates keep their figures', async () => {
    const { readoutText } = await import('../src/core/tex');
    const ko = (await import('../src/sims/ch42/i18n.ko.json')).default as Record<string, string>;
    const en = (await import('../src/sims/ch42/i18n.en.json')).default as Record<string, string>;
    const spec = decayScene.readouts!.find((x) => x.label === 'R')!;
    for (const [iso, want, unit] of [
      ['c14', '0.121', 'y⁻¹'],
      ['i131', '86.4', 'd⁻¹'],
      ['u238', '1.55×10⁻⁷', 'y⁻¹'],
    ] as const) {
      const p = { ...defaults(decayScene.params), iso, N0: 1000 } as never;
      const r = new Runner(decayScene, p, 1);
      expect(readoutText(spec as never, spec.value(r.state, p), p, r.state)).toBe(`${want} ${unit}`);
      const line = decayScene.formula!(r.state, p).at(-1)!;
      expect(line.startsWith('R = \\lambda N = ')).toBe(true);
      expect(line).toContain('(1000)');
    }
    expect(decayScene.info.assumptions).toContain('ch42.assume.sym');
    for (const d of [ko, en]) expect(d['ch42.assume.sym']).toContain('R = \\lambda N');
  });
});
