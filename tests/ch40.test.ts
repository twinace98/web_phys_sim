import { describe, expect, it } from 'vitest';
import { defaults } from '../src/core/params';
import { Rng } from '../src/core/rng';
import { Runner } from '../src/core/runner';
import { DEG, chainProbs, probUp, runChain } from '../src/sims/ch40/physics';
import { angle, angleDevices, devicesOf, sequential, single } from '../src/sims/ch40/scene';

describe('ch40 spin-½ measurement', () => {
  it('P(+θ | +z) = cos²(θ/2)', () => {
    expect(probUp(0, 0)).toBeCloseTo(1, 12);
    expect(probUp(90 * DEG, 0)).toBeCloseTo(0.5, 12);
    expect(probUp(180 * DEG, 0)).toBeCloseTo(0, 12);
    expect(probUp(60 * DEG, 0)).toBeCloseTo(0.75, 12);
    // A −z state (α = π) is + along −z.
    expect(probUp(180 * DEG, 180 * DEG)).toBeCloseTo(1, 12);
  });

  it('chain predictions: zz → all +, zx → ½, zxz → ½ (information erased)', () => {
    const fr = (setup: string, pass = '+') => {
      const [a, b] = chainProbs(devicesOf(setup, pass));
      return a / (a + b);
    };
    expect(fr('zz')).toBeCloseTo(1, 12);
    expect(fr('zx')).toBeCloseTo(0.5, 12);
    expect(fr('zxz')).toBeCloseTo(0.5, 12);
    expect(fr('zxz', '-')).toBeCloseTo(0.5, 12);
    // Fraction of all atoms reaching the last device of z → x → z: ½ · ½.
    const [a, b] = chainProbs(devicesOf('zxz', '+'));
    expect(a + b).toBeCloseTo(0.25, 12);
  });

  it('Monte Carlo agrees with the predictions within 4σ', () => {
    const rng = new Rng(7);
    for (const theta of [0, 45, 90, 120]) {
      const devs = angleDevices(theta);
      let up = 0;
      let n = 0;
      for (let i = 0; i < 20000; i++) {
        const f = runChain(devs, rng);
        if (!f.detected) continue;
        n++;
        if (f.up) up++;
      }
      const P = probUp(theta * DEG, 0);
      expect(Math.abs(up / n - P)).toBeLessThanOrEqual(4 * Math.sqrt((P * (1 - P)) / n) + 1e-9);
      expect(n / 20000).toBeCloseTo(0.5, 1);
    }
  });
});

describe('ch40 scenes', () => {
  it('single device: quantum hits only at ±1, classical spread over the band', () => {
    const run = (model: string) => {
      const r = new Runner(single, { ...defaults(single.params), model, N: 1000 });
      r.play();
      for (let i = 0; i < 2000 && r.playing; i++) r.advance(0.05);
      return r.state.hits;
    };
    const q = run('quantum');
    expect(q.length).toBe(1000);
    expect(q.every((h) => Math.abs(Math.abs(h.z) - 1) < 0.4)).toBe(true);
    const c = run('classical');
    expect(c.filter((h) => Math.abs(h.z) < 0.5).length).toBeGreaterThan(300);
  });

  it('sequential z → x → z ends near half and half; same seed, same counts', () => {
    const run = () => {
      const r = new Runner(sequential, defaults(sequential.params));
      r.play();
      for (let i = 0; i < 4000 && r.playing; i++) r.advance(0.05);
      return r.state.counts.map((c) => [...c]);
    };
    const a = run();
    expect(a).toEqual(run());
    const last = a[a.length - 1];
    const total = a.flat().reduce((x, y) => x + y, 0);
    expect(total).toBe(400);
    expect(last[0] / (last[0] + last[1])).toBeGreaterThan(0.3);
    expect(last[0] / (last[0] + last[1])).toBeLessThan(0.7);
  });

  it('angle scene records the running fraction', () => {
    const r = new Runner(angle, { ...defaults(angle.params), theta: 0 });
    r.play();
    for (let i = 0; i < 4000 && r.playing; i++) r.advance(0.05);
    const fr = r.hist.col('frac');
    expect(fr[fr.length - 1]).toBe(1);
  });
});
