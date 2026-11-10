import { describe, expect, it } from 'vitest';
import { defaults } from '../src/core/params';
import { Runner } from '../src/core/runner';
import { G, flightTime, maxHeight, range, stateAt, v0x, type Launch } from '../src/sims/ch04/physics';
import { projectile } from '../src/sims/ch04/scene';

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
