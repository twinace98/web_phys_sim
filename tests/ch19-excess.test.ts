// Ch 19 long run (about 12 s): the measured excess over NkT/A at N = 100, L = 15 nm. Its own file,
// so Vitest runs it in parallel with tests/ch19.test.ts and tests/ch19-long.test.ts.
import { describe, expect, it } from 'vitest';
import { Rng } from '../src/core/rng';
import { idealPressure, initGas, pressureExcess, stepGas } from '../src/sims/ch19/physics';
import ko from '../src/sims/ch19/i18n.ko.json';

/** The "within about x %" bound stated in the info panel. */
const bound = (txt: string) => Number(/(?:약|about) (\d+(?:\.\d+)?) % (?:이내|at every)/.exec(txt)?.[1] ?? NaN) / 100;

describe('ch19 excess over NkT/A (long runs)', () => {
  it('N = 100, L = 15 nm: long runs measure about 2φ + σ/L = 4.4 % above NkT/A, inside the stated bound', () => {
    const N = 100;
    const L = 15;
    let sum = 0;
    for (const seed of [1, 2]) {
      const g = initGas(N, L, 300, 'mb', new Rng(seed));
      for (let i = 0; i < 1_000_000; i++) {
        stepGas(g, 0.01);
        if (g.hits.length > 1000) g.hits.length = 0;
      }
      sum += g.J / (L * g.t) / idealPressure(N, L, 300) - 1;
    }
    const excess = sum / 2;
    expect(pressureExcess(N, L)).toBeCloseTo(0.0438, 3);
    expect(Math.abs(excess - pressureExcess(N, L))).toBeLessThan(0.012);
    expect(excess).toBeGreaterThan(0.03);
    expect(excess).toBeLessThan(bound(ko['ch19.assume.dense']));
  }, 120_000);
});
