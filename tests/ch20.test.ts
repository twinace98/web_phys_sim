import { describe, expect, it } from 'vitest';
import { defaults } from '../src/core/params';
import { Rng } from '../src/core/rng';
import { Runner } from '../src/core/runner';
import {
  entropyLR,
  exchange,
  fillUniform,
  initParticles,
  kTeps,
  leftCount,
  lnBinom,
  lnFact,
  lnOmega,
  moveParticles,
  mostProbable,
  sumRange,
} from '../src/sims/ch20/physics';
import { heatScene } from '../src/sims/ch20/heat';
import { cycle, entropy, heatSplit, temp } from '../src/sims/ch18/physics';

describe('ch20 counting', () => {
  it('ln n! and binomials are exact for small n', () => {
    expect(Math.exp(lnFact(10))).toBeCloseTo(3628800, 4);
    expect(Math.exp(lnBinom(4, 2))).toBeCloseTo(6, 10);
    expect(Math.exp(lnBinom(10, 5))).toBeCloseTo(252, 8);
    expect(lnBinom(5, 7)).toBe(-Infinity);
    // Σ C(N, n) = 2^N
    let s = 0;
    for (let n = 0; n <= 20; n++) s += Math.exp(lnBinom(20, n));
    expect(s).toBeCloseTo(2 ** 20, 3);
  });

  it('entropy of the all-left state is zero and is largest at n = N/2', () => {
    for (const N of [4, 10, 100, 1000]) {
      expect(entropyLR(N, N)).toBeCloseTo(0, 9);
      expect(entropyLR(N, N / 2)).toBeGreaterThan(entropyLR(N, N / 2 - 1));
    }
    // Stirling: ln C(N, N/2) ≈ N ln 2 − ½ ln(πN/2)
    expect(entropyLR(1000, 500)).toBeCloseTo(1000 * Math.LN2 - 0.5 * Math.log((Math.PI * 1000) / 2), 2);
  });

  it('Einstein solid: Ω(N, q) = C(q + N − 1, q); Ω(3, 2) = 6', () => {
    expect(Math.exp(lnOmega(3, 2))).toBeCloseTo(6, 10);
    expect(Math.exp(lnOmega(4, 3))).toBeCloseTo(20, 10);
    expect(lnOmega(30, 0)).toBe(0);
  });

  it('kT/ε = 1/ln(1 + N/q) matches the slope of the exact entropy for large N, q', () => {
    const N = 2000;
    const q = 3000;
    const slope = (lnOmega(N, q + 1) - lnOmega(N, q - 1)) / 2;
    expect(1 / slope).toBeCloseTo(kTeps(N, q), 2);
  });

  it('most probable split puts the energy in proportion to the sizes (equal temperatures)', () => {
    const qa = mostProbable(30, 70, 100);
    expect(Math.abs(qa - 30)).toBeLessThanOrEqual(1);
    expect(kTeps(30, qa)).toBeCloseTo(kTeps(70, 100 - qa), 1);
    expect(mostProbable(50, 50, 100)).toBe(50);
  });
});

describe('ch20 dynamics', () => {
  it('free expansion: all start left, then about half are left, and particles stay in the box', () => {
    const p = initParticles(1000, new Rng(2));
    expect(leftCount(p)).toBe(1000);
    for (let i = 0; i < 1200; i++) moveParticles(p, 1 / 60);
    const n = leftCount(p);
    expect(Math.abs(n - 500)).toBeLessThan(80);
    for (let i = 0; i < p.N; i++) {
      expect(p.x[i]).toBeGreaterThanOrEqual(0);
      expect(p.x[i]).toBeLessThanOrEqual(2);
      expect(p.y[i]).toBeGreaterThanOrEqual(0);
      expect(p.y[i]).toBeLessThanOrEqual(1);
    }
  });

  it('fillUniform places exactly q quanta in the range; exchanges conserve the total', () => {
    const rng = new Rng(9);
    const osc = new Int32Array(100);
    fillUniform(osc, 0, 30, 100, rng);
    expect(sumRange(osc, 0, 30)).toBe(100);
    expect(sumRange(osc, 30, 100)).toBe(0);
    for (let i = 0; i < 5000; i++) exchange(osc, rng);
    expect(sumRange(osc, 0, 100)).toBe(100);
    for (const v of osc) expect(v).toBeGreaterThanOrEqual(0);
  });

  it('random exchange makes q_A relax to the most probable value (time average)', () => {
    const rng = new Rng(4);
    const osc = new Int32Array(100);
    fillUniform(osc, 0, 30, 100, rng);
    for (let i = 0; i < 20000; i++) exchange(osc, rng);
    let mean = 0;
    const n = 2000;
    for (let k = 0; k < n; k++) {
      for (let i = 0; i < 50; i++) exchange(osc, rng);
      mean += sumRange(osc, 0, 30) / n;
    }
    // Mean of q_A over microstates is q N_A / N = 30.
    expect(Math.abs(mean - 30)).toBeLessThan(2);
  });

  it('heat scene: same seed, same run', () => {
    const run = () => {
      const r = new Runner(heatScene, defaults(heatScene.params));
      r.play();
      for (let i = 0; i < 50; i++) r.advance(0.1);
      return r.state.qA;
    };
    expect(run()).toBe(run());
  });
});

describe('ch20 Carnot cycle', () => {
  it('Q_C/Q_H = T_C/T_H, ΔS over the cycle is zero, efficiency 1 − T_C/T_H', () => {
    for (const f of [3, 5]) {
      for (const tc of [200, 300, 400]) {
        const c = cycle('carnot', true, f, tc);
        const { qin, qout } = heatSplit(c.legs, f);
        expect(qout / qin).toBeCloseTo(tc / 600, 9);
        expect((qin - qout) / qin).toBeCloseTo(1 - tc / 600, 9);
        const A = c.corners[0];
        expect(entropy(c.corners[1], A, f)).toBeCloseTo(qin / 600, 9);
        expect(entropy(c.corners[2], A, f)).toBeCloseTo(qin / 600, 9);
        expect(entropy(c.corners[3], A, f)).toBeCloseTo(0, 9);
        expect(temp(c.corners[2])).toBeCloseTo(tc, 9);
      }
    }
  });
});
