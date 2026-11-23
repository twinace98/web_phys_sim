// Ch 19 long run (about 14 s): plot ranges at every parameter corner. Its own file, so Vitest
// runs it in parallel with tests/ch19.test.ts and tests/ch19-excess.test.ts.
import { describe, expect, it } from 'vitest';
import { Rng } from '../src/core/rng';
import { impulseTop, initGas, pCum, pWin, pressureTop, stepGas } from '../src/sims/ch19/physics';
import { gasScene } from '../src/sims/ch19/gas';

const range = (k: 'N' | 'L' | 'T') => {
  const sp = gasScene.params[k] as { min: number; max: number };
  return [sp.min, sp.max];
};
describe('ch19 hard-disk gas (long runs)', () => {
  it('impulse and both pressure estimates stay inside their plots at every corner of the parameter ranges', () => {
    const [N0, N1] = range('N');
    const [L0, L1] = range('L');
    const [T0, T1] = range('T');
    for (const N of [N0, N1]) {
      for (const L of [L0, L1]) {
        for (const T of [T0, T1]) {
          const pt = pressureTop(N, L, T);
          const jt = impulseTop(N, L, T, 200);
          for (const seed of [1, 2]) {
            const g = initGas(N, L, T, seed === 1 ? 'equal' : 'mb', new Rng(seed));
            for (let i = 0; i < 20000; i++) {
              stepGas(g, 0.01);
              while (g.hits.length && g.hits[0].t < g.t - 12) g.hits.shift();
              if (i % 10 === 9) {
                expect(pWin(g)).toBeLessThan(pt);
                expect(pCum(g)).toBeLessThan(pt);
                expect(g.J).toBeLessThan(jt);
              }
            }
          }
        }
      }
    }
  }, 60_000);
});
