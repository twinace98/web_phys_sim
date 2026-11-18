import { describe, expect, it } from 'vitest';
import { defaults } from '../src/core/params';
import { Runner } from '../src/core/runner';
import { first, firstStep, FIRST_G } from '../src/sims/ch05/first';
import { frames } from '../src/sims/ch05/frames';
import { newton } from '../src/sims/ch05/newton';
import { ballGround, ballInTrain, cartsAt, netForce, pushState, trainAt, type Train } from '../src/sims/ch05/physics';
import { third } from '../src/sims/ch05/third';

const run = (scene: any, p: any): Runner<any, any> => {
  const r = new Runner(scene, p);
  r.play();
  for (let i = 0; i < 2000 && r.playing; i++) r.advance(0.05);
  return r;
};

describe('ch05 first and second law', () => {
  it('a = F/m while the force acts, for every force and mass', () => {
    for (const F of [1, 2, 4]) {
      for (const m of [1, 2, 4]) {
        const k = pushState({ F, m, tOff: Infinity }, 1.7);
        expect(k.a).toBeCloseTo(F / m, 12);
        expect(k.v).toBeCloseTo((F / m) * 1.7, 12);
        expect(k.x).toBeCloseTo(0.5 * (F / m) * 1.7 ** 2, 12);
      }
    }
  });

  it('the slope of v(t) equals a', () => {
    const pu = { F: 2, m: 4, tOff: 2 };
    const d = 1e-6;
    for (const t of [0.5, 1.3, 2.5, 4]) {
      const slope = (pushState(pu, t + d).v - pushState(pu, t - d).v) / (2 * d);
      expect(slope).toBeCloseTo(pushState(pu, t).a, 6);
    }
  });

  it('after the force is removed: F = 0, a = 0, v constant, equal steps in equal times', () => {
    const pu = { F: 2, m: 2, tOff: 2 };
    expect(netForce(pu, 2.5)).toBe(0);
    const xs = [3, 3.5, 4, 4.5].map((t) => pushState(pu, t).x);
    for (let i = 1; i < xs.length; i++) expect(xs[i] - xs[i - 1]).toBeCloseTo(2 * 0.5, 12);
    expect(pushState(pu, 5).v).toBeCloseTo(pushState(pu, 2).v, 12);
    expect(pushState(pu, 5).a).toBe(0);
  });

  it('the second-law scene stops at 4 s with v = (F/m) · 4 s by default (4 N, 2 kg)', () => {
    const r = run(newton, defaults(newton.params));
    expect(r.state.t).toBeCloseTo(4, 12);
    expect(r.state.v).toBeCloseTo(8, 12);
    expect(r.state.a).toBeCloseTo(2, 12);
  });
});

describe('ch05 first law', () => {
  const end = (over: Record<string, unknown>) => run(first, { ...defaults(first.params), ...over }).state as any;

  it('defaults (no friction): constant v, evenly spaced strobe marks, F_net = 0 throughout', () => {
    const r = run(first, defaults(first.params));
    expect(r.state.t).toBeCloseTo(6, 12);
    expect(r.state.v).toBe(3);
    expect(r.state.x).toBeCloseTo(18, 9);
    const m = r.state.marks as number[];
    expect(m.length).toBe(13);
    for (let i = 1; i < m.length; i++) expect(m[i] - m[i - 1]).toBeCloseTo(1.5, 9);
    for (const F of r.hist.col('Fnet')) expect(F).toBe(0);
  });

  it('friction stops the puck after v0/(mu g), at v0²/(2 mu g), then f = 0 at rest', () => {
    for (const [v0, mu] of [[3, 0.1], [5, 0.3], [1, 0.05]]) {
      const s = end({ v0, mu });
      expect(s.v).toBe(0);
      expect(s.x).toBeCloseTo((v0 * v0) / (2 * mu * FIRST_G), 9);
      expect(s.f).toBe(0);
      expect(s.f + s.F).toBe(0);
    }
    // While sliding: F_net = -mu m g (m = 1 kg).
    const r = run(first, { ...defaults(first.params), mu: 0.2 });
    const t = r.hist.col('t');
    const F = r.hist.col('Fnet');
    const i = t.findIndex((x) => x > 0.5);
    expect(F[i]).toBeCloseTo(-0.2 * FIRST_G, 12);
  });

  it('push to match friction: two forces, zero net force, constant velocity', () => {
    const s = end({ mu: 0.3, push: true });
    expect(s.v).toBe(3);
    expect(s.x).toBeCloseTo(18, 9);
    expect(s.f).toBeCloseTo(-0.3 * FIRST_G, 12);
    expect(s.F).toBeCloseTo(0.3 * FIRST_G, 12);
  });

  it('friction lowered to 0 mid-run: the puck keeps the velocity it had', () => {
    const r = new Runner(first as any, { ...defaults(first.params), mu: 0.1 } as any);
    r.play();
    for (let i = 0; i < 20; i++) r.advance(0.05);
    const v1 = (r.state as any).v;
    expect(v1).toBeCloseTo(3 - 0.1 * FIRST_G * 1, 6);
    r.setParam('mu', 0);
    for (let i = 0; i < 2000 && r.playing; i++) r.advance(0.05);
    expect((r.state as any).v).toBeCloseTo(v1, 12);
  });

  it('one step is exact: stopping inside a step lands at v²/(2 mu g)', () => {
    const k = firstStep(0, 0.01, 0.3, false, 1 / 60);
    expect(k.v).toBe(0);
    expect(k.x).toBeCloseTo(0.0001 / (2 * 0.3 * FIRST_G), 15);
  });
});

describe('ch05 third law', () => {
  const c = { mA: 1, mB: 2, F: 2, tc: 1 };

  it('forces are equal and opposite; accelerations are inversely proportional to mass', () => {
    for (const t of [0, 0.3, 0.99]) {
      const k = cartsAt(c, t);
      expect(k.FA).toBe(-k.FB);
      expect(k.FB).toBe(2);
      expect(c.mA * k.A.a).toBeCloseTo(-c.mB * k.B.a, 12);
      expect(Math.abs(k.A.a) / Math.abs(k.B.a)).toBeCloseTo(c.mB / c.mA, 12);
    }
  });

  it('after contact both move uniformly; total momentum stays zero', () => {
    for (const t of [0.4, 1.5, 2.9]) {
      const k = cartsAt(c, t);
      expect(c.mA * k.A.v + c.mB * k.B.v).toBeCloseTo(0, 12);
    }
    const k = cartsAt(c, 2);
    expect(k.FA).toBe(0);
    expect(k.A.a).toBe(0);
    expect(k.B.v).toBeCloseTo(1, 12);
  });

  it('the scene records the force on A and stops at 3 s', () => {
    const r = run(third, defaults(third.params));
    expect(r.state.t).toBeCloseTo(3, 12);
    expect(Math.min(...r.hist.col('FA'))).toBe(-2);
  });
});

describe('ch05 inertial frames', () => {
  const tr = (A: number): Train => ({ v0: 2, A, b0: 2.5 });

  it('ground frame: no force, so the ball moves uniformly whatever the train does', () => {
    for (const A of [0, 1, 2]) {
      expect(ballGround(tr(A), 1.7).a).toBe(0);
      expect(ballGround(tr(A), 1.7).v).toBe(2);
    }
  });

  it('uniformly moving train: the ball stays at rest, same law as on the ground', () => {
    for (const t of [0, 1, 3]) {
      const b = ballInTrain(tr(0), t);
      expect(b.x).toBeCloseTo(2.5, 12);
      expect(b.v).toBeCloseTo(0, 12);
      expect(b.a).toBe(0);
    }
  });

  it('accelerating train: the ball accelerates at −a0 with no force on it', () => {
    const A = 1.5;
    const d = 1e-4;
    for (const t of [0.5, 1.5]) {
      const b = ballInTrain(tr(A), t);
      expect(b.a).toBe(-A);
      const x2 = (ballInTrain(tr(A), t + d).x - 2 * b.x + ballInTrain(tr(A), t - d).x) / (d * d);
      expect(x2).toBeCloseTo(-A, 5);
      expect(b.x).toBeCloseTo(ballGround(tr(A), t).x - trainAt(tr(A), t).x, 12);
    }
  });

  it('the scene stops when the ball reaches the back of the table', () => {
    const p = defaults(frames.params);
    const r = run(frames, p);
    const xs = r.hist.col('x');
    expect(xs[xs.length - 1]).toBeLessThan(-3);
    expect(xs[xs.length - 1]).toBeGreaterThan(-3.4);
  });
});

describe('ch05 slider ranges', () => {
  it('every scene runs to its end at the slider extremes with finite worlds and states', () => {
    const cases: [any, Record<string, number | boolean>[]][] = [
      [newton, [{ m: 1, F: 5 }, { m: 5, F: 0.5 }]],
      [first, [{ v0: 1, mu: 0.3 }, { v0: 5, mu: 0 }, { v0: 5, mu: 0.3, push: true }]],
      [third, [{ mA: 0.5, mB: 5, F: 5 }, { mA: 5, mB: 0.5, F: 0.5 }]],
      [frames, [{ A: 0.5 }, { A: 2 }]],
    ];
    for (const [scene, list] of cases) {
      for (const over of list) {
        const p = { ...defaults(scene.params), ...over };
        const r = run(scene, p);
        expect(r.playing).toBe(false);
        const w = scene.world(p);
        for (const v of [...w.x, ...w.y]) expect(Number.isFinite(v)).toBe(true);
        for (const v of Object.values(r.state)) if (typeof v === 'number') expect(Number.isFinite(v)).toBe(true);
      }
    }
  });
});

describe('ch05 i18n', () => {
  it('every key used by the scenes exists in both languages, with the same key sets', async () => {
    const page = (await import('../src/sims/ch05')).default;
    const { ko, en } = page.i18n;
    expect(Object.keys(ko).sort()).toEqual(Object.keys(en).sort());
    for (const s of page.scenes) {
      const keys: string[] = [s.title, ...s.info.goals, ...s.info.observe, ...(s.info.assumptions ?? [])];
      for (const spec of Object.values(s.params) as any[]) {
        keys.push(spec.label);
        if (spec.group !== 'hidden') keys.push(spec.desc);
        for (const o of spec.options ?? []) keys.push(o.label);
      }
      for (const k of keys) {
        expect(ko[k], k).toBeTruthy();
        expect(en[k], k).toBeTruthy();
      }
    }
  });
});
