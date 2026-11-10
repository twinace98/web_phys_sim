import { describe, expect, it } from 'vitest';
import { defaults } from '../src/core/params';
import { Runner } from '../src/core/runner';
import { areaUnderA, areaUnderV, makeProfile, ranges, stateAt, T_END, type Motion } from '../src/sims/ch02/physics';
import { kinematics } from '../src/sims/ch02/scene';

const MOTIONS: Motion[] = ['uniform', 'accel', 'startStop', 'reverse', 'custom'];
const CUSTOM = [1, 0, -1, -1, 0.5];
const times = Array.from({ length: 101 }, (_, i) => (i / 100) * T_END);

describe('ch02 physics', () => {
  for (const m of MOTIONS) {
    const pr = makeProfile(m, CUSTOM, 1);

    it(`${m}: area under a(t) equals Δv`, () => {
      for (const t of times) expect(areaUnderA(pr, 0, t)).toBeCloseTo(stateAt(pr, t).v - pr.v0, 12);
    });

    it(`${m}: area under v(t) equals Δx`, () => {
      for (const t of times) expect(areaUnderV(pr, 0, t)).toBeCloseTo(stateAt(pr, t).x - pr.x0, 12);
    });

    it(`${m}: slope of x(t) equals v, slope of v(t) equals a (away from jumps)`, () => {
      const d = 1e-6;
      for (const t of times.slice(1, -1)) {
        if (pr.segs.some((s) => Math.abs(s.t0 - t) < 2 * d)) continue;
        const k = stateAt(pr, t);
        expect((stateAt(pr, t + d).x - stateAt(pr, t - d).x) / (2 * d)).toBeCloseTo(k.v, 6);
        expect((stateAt(pr, t + d).v - stateAt(pr, t - d).v) / (2 * d)).toBeCloseTo(k.a, 6);
      }
    });

    it(`${m}: x and v are continuous at segment boundaries`, () => {
      for (const s of pr.segs.slice(1)) {
        const before = stateAt(pr, s.t0 - 1e-9);
        const after = stateAt(pr, s.t0);
        expect(after.x).toBeCloseTo(before.x, 6);
        expect(after.v).toBeCloseTo(before.v, 6);
      }
    });
  }

  it('startStop ends at rest after 21 m', () => {
    const k = stateAt(makeProfile('startStop', CUSTOM, 0), T_END);
    expect(k.x).toBeCloseTo(21, 12);
    expect(k.v).toBeCloseTo(0, 12);
  });

  it('reverse turns around at t = 4 s, x = 8 m', () => {
    const pr = makeProfile('reverse', CUSTOM, 0);
    expect(stateAt(pr, 4).v).toBeCloseTo(0, 12);
    expect(ranges(pr).x[1]).toBeCloseTo(8, 3);
    expect(stateAt(pr, T_END).x).toBeCloseTo(-10, 12);
  });
});

describe('ch02 scene through the runner', () => {
  it('runs to tEnd, auto-pauses, and records every step', () => {
    const r = new Runner(kinematics, defaults(kinematics.params));
    r.play();
    for (let i = 0; i < 200; i++) r.advance(0.1);
    expect(r.playing).toBe(false);
    expect(r.state.t).toBe(T_END);
    const ts = r.hist.col('t');
    expect(ts[ts.length - 1]).toBe(T_END);
    expect(ts.length).toBe(240 * T_END + 1);
  });

  it('recorded samples match the exact solution', () => {
    const p = defaults(kinematics.params);
    const r = new Runner(kinematics, p);
    r.play();
    for (let i = 0; i < 200; i++) r.advance(0.1);
    const pr = makeProfile(p.motion as Motion, p.custom, p.v0);
    const ts = r.hist.col('t');
    const xs = r.hist.col('x');
    for (let i = 0; i < ts.length; i += 97) expect(xs[i]).toBeCloseTo(stateAt(pr, ts[i]).x, 12);
  });

  it('a non-live parameter change resets to t = 0', () => {
    const r = new Runner(kinematics, defaults(kinematics.params));
    r.play();
    r.advance(0.05);
    expect(r.state.t).toBeGreaterThan(0);
    expect(r.setParam('motion', 'reverse')).toBe(true);
    expect(r.state.t).toBe(0);
    expect(r.hist.length).toBe(1);
    expect(r.setParam('mode', 'area')).toBe(false);
  });
});

describe('ch02 free fall', () => {
  it('drop from h lands at sqrt(2h/g) with v = −sqrt(2gh)', async () => {
    const { fallProfile, stateAt } = await import('../src/sims/ch02/physics');
    const pr = fallProfile(20, 0);
    expect(pr.tEnd).toBeCloseTo(Math.sqrt(40 / 9.8), 12);
    const k = stateAt(pr, pr.tEnd);
    expect(k.x).toBeCloseTo(0, 10);
    expect(k.v).toBeCloseTo(-Math.sqrt(2 * 9.8 * 20), 10);
    expect(k.a).toBe(-9.8);
  });

  it('distances fallen in equal intervals go as 1 : 3 : 5 (Galileo)', async () => {
    const { fallProfile, stateAt } = await import('../src/sims/ch02/physics');
    const pr = fallProfile(45, 0);
    const y = (t: number) => stateAt(pr, t).x;
    const d = [0, 1, 2, 3].map((k) => y(k * 0.1) - y((k + 1) * 0.1));
    expect(d[1] / d[0]).toBeCloseTo(3, 10);
    expect(d[2] / d[0]).toBeCloseTo(5, 10);
    expect(d[3] / d[0]).toBeCloseTo(7, 10);
  });

  it('thrown up: v = 0 at the top, a = −g there too; areas match the changes', async () => {
    const { fallProfile, stateAt, areaUnderA, areaUnderV } = await import('../src/sims/ch02/physics');
    const pr = fallProfile(20, 10);
    const tTop = 10 / 9.8;
    expect(stateAt(pr, tTop).v).toBeCloseTo(0, 12);
    expect(stateAt(pr, tTop).a).toBe(-9.8);
    expect(stateAt(pr, tTop).x).toBeCloseTo(20 + 100 / (2 * 9.8), 12);
    for (const t of [0.3, tTop, 2.5]) {
      expect(areaUnderA(pr, 0, t)).toBeCloseTo(stateAt(pr, t).v - 10, 12);
      expect(areaUnderV(pr, 0, t)).toBeCloseTo(stateAt(pr, t).x - 20, 12);
    }
  });

  it('the free-fall scene stops exactly at the ground', async () => {
    const { freefall } = await import('../src/sims/ch02/freefall');
    const r = new Runner(freefall, defaults(freefall.params));
    r.play();
    for (let i = 0; i < 100 && r.playing; i++) r.advance(0.1);
    expect(r.playing).toBe(false);
    const ys = r.hist.col('y');
    expect(ys[ys.length - 1]).toBeCloseTo(0, 9);
  });
});
