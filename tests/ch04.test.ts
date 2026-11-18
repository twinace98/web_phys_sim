import { describe, expect, it } from 'vitest';
import { defaults, fromQuery } from '../src/core/params';
import { Runner } from '../src/core/runner';
import { G, flightTime, maxHeight, range, stateAt, v0x, type Launch } from '../src/sims/ch04/physics';
import { circular } from '../src/sims/ch04/circular';
import { projectile } from '../src/sims/ch04/scene';
import { fmt } from '../src/core/format';

const deg = Math.PI / 180;
const ground = (thetaDeg: number, v0 = 20, g = 9.8): Launch => ({ h: 0, v0, theta: thetaDeg * deg, g });

describe('ch04 projectile', () => {
  it('range from the ground is v0² sin 2θ / g, largest at 45°', () => {
    for (const th of [15, 30, 45, 60, 75]) {
      const l = ground(th);
      expect(range(l)).toBeCloseTo((20 * 20 * Math.sin(2 * th * deg)) / 9.8, 10);
    }
    expect(range(ground(45))).toBeGreaterThan(range(ground(30)));
    expect(range(ground(45))).toBeGreaterThan(range(ground(60)));
    expect(range(ground(30))).toBeCloseTo(range(ground(60)), 10);
  });

  it('flight time from the ground is 2 v0 sin θ / g; max height (v0 sin θ)² / 2g', () => {
    const l = ground(60, 25);
    expect(flightTime(l)).toBeCloseTo((2 * 25 * Math.sin(60 * deg)) / 9.8, 12);
    expect(maxHeight(l)).toBeCloseTo((25 * Math.sin(60 * deg)) ** 2 / (2 * 9.8), 12);
    expect(stateAt(l, flightTime(l)).y).toBeCloseTo(0, 10);
  });

  it('x is uniform: equal steps in equal times; v_x is constant', () => {
    const l = ground(30);
    const dt = 0.25;
    const xs = [0, 1, 2, 3, 4].map((k) => stateAt(l, k * dt).x);
    for (let k = 1; k < xs.length; k++) expect(xs[k] - xs[k - 1]).toBeCloseTo(v0x(l) * dt, 12);
    expect(stateAt(l, 0.1).vx).toBe(stateAt(l, 2.3).vx);
  });

  it('y has uniform acceleration −g: second differences are −g Δt²', () => {
    const l = ground(70);
    const dt = 0.2;
    const ys = [0, 1, 2, 3].map((k) => stateAt(l, k * dt).y);
    expect(ys[2] - 2 * ys[1] + ys[0]).toBeCloseTo(-9.8 * dt * dt, 12);
    expect(ys[3] - 2 * ys[2] + ys[1]).toBeCloseTo(-9.8 * dt * dt, 12);
  });

  it('horizontal launch lands when a dropped ball would: sqrt(2h/g), for any speed', () => {
    for (const v0 of [10, 15, 20, 25]) {
      expect(flightTime({ h: 20, v0, theta: 0, g: 9.8 })).toBeCloseTo(Math.sqrt((2 * 20) / 9.8), 12);
    }
  });

  it('smaller g gives proportionally longer flights', () => {
    expect(flightTime(ground(45, 20, G.moon)) / flightTime(ground(45, 20, G.earth))).toBeCloseTo(9.8 / 1.62, 10);
  });
});

describe('ch04 scene through the runner', () => {
  it('stops exactly at landing and records the landing point', () => {
    const p = defaults(projectile.params);
    const r = new Runner(projectile, p);
    r.play();
    for (let i = 0; i < 400 && r.playing; i++) r.advance(0.1);
    expect(r.playing).toBe(false);
    const T = r.tEnd!;
    expect(r.state.t).toBeCloseTo(T, 12);
    const ys = r.hist.col('y');
    expect(ys[ys.length - 1]).toBeCloseTo(0, 9);
  });
});

describe('ch04 angle and height together', () => {
  it('an angled throw from a height lands later and farther than from the ground', () => {
    const fromGround: Launch = { h: 0, v0: 20, theta: 30 * deg, g: 9.8 };
    const fromHill: Launch = { ...fromGround, h: 20 };
    expect(flightTime(fromHill)).toBeGreaterThan(flightTime(fromGround));
    expect(range(fromHill)).toBeGreaterThan(range(fromGround));
    expect(stateAt(fromHill, flightTime(fromHill)).y).toBeCloseTo(0, 10);
  });

  it('from a height the best angle is below 45°', () => {
    const r = (th: number) => range({ h: 20, v0: 20, theta: th * deg, g: 9.8 });
    expect(r(30)).toBeGreaterThan(r(45));
  });

  it('θ = 0 at h = 0 lands at once without breaking the scene', () => {
    const p = { ...defaults(projectile.params), theta: 0, h: 0 };
    const r = new Runner(projectile, p);
    expect(r.tEnd).toBe(0);
    const w = projectile.world(p);
    expect(Number.isFinite(w.x[0]) && w.x[1] > w.x[0] && w.y[1] > w.y[0]).toBe(true);
    r.play();
    r.advance(0.1);
    expect(r.playing).toBe(false);
  });
});

describe('ch04 position readouts (review 2026-11-17, §0-1)', () => {
  const val = (label: string) => projectile.readouts!.find((r) => r.label === label)!;
  const show = (label: string, s: any, p: any) => {
    const r = val(label);
    return fmt(r.value(s, p), r.sig ?? 3, r.zeroTol);
  };

  it('readouts are x, y (m) then v_x, v_y, v (m/s); R stays out (a constant of the launch)', () => {
    expect(projectile.readouts!.map((r) => [r.label, r.unit])).toEqual([
      ['x', 'm'],
      ['y', 'm'],
      ['v_x', 'm/s'],
      ['v_y', 'm/s'],
      ['v', 'm/s'],
    ]);
  });

  it('sweep θ, h, v0, g (ends, in-between, every planet): x and y follow x(t), y(t); at landing x = R and y prints 0', () => {
    const sp = projectile.params as any;
    const thetas = [sp.theta.min, 30, 45, sp.theta.max];
    const hs = [sp.h.min, 17, sp.h.max];
    const v0s = [sp.v0.min, 17.5, sp.v0.max];
    for (const theta of thetas)
      for (const h of hs)
        for (const v0 of v0s)
          for (const g of ['earth', 'mars', 'moon']) {
            const p = { ...defaults(projectile.params), theta, h, v0, g } as any;
            const r = new Runner(projectile, p);
            const l: Launch = { h, v0, theta: theta * deg, g: G[g] };
            const T = r.tEnd!;
            r.play();
            r.advance(T / 2);
            const mid = stateAt(l, r.state.t);
            expect(val('x').value(r.state, p)).toBeCloseTo(mid.x, 9);
            expect(val('y').value(r.state, p)).toBeCloseTo(mid.y, 9);
            for (let i = 0; i < 400 && r.playing; i++) r.advance(0.5);
            const tag = `θ=${theta} h=${h} v0=${v0} ${g}`;
            expect(show('x', r.state, p), tag).toBe(fmt(range(l)));
            expect(show('y', r.state, p), tag).toBe('0.00');
          }
  });
});

describe('ch04 circular: no velocity circle', () => {
  it('an old share link with hodo=… still loads: the key is ignored, the other values are kept', () => {
    for (const q of ['hodo=0&r=2.5', 'hodo=1&r=2.5', 'hodo=garbage&r=2.5']) {
      const p = fromQuery(circular.params, new URLSearchParams(q)) as Record<string, unknown>;
      expect(p).toEqual({ r: 2.5, v: 2 });
    }
  });

  it('the world is square around the circle, so the circle fills the stage height', () => {
    const w = circular.world(defaults(circular.params));
    expect(w.x[1] - w.x[0]).toBeCloseTo(w.y[1] - w.y[0], 12);
    expect(w.x[0]).toBeCloseTo(-w.x[1], 12);
  });
});
