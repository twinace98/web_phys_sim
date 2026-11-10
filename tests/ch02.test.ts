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
