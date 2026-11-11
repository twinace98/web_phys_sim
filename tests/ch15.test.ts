import { describe, expect, it } from 'vitest';
import { defaults } from '../src/core/params';
import { Runner } from '../src/core/runner';
import { agm, exactPeriod, omega0, oscAt, pendulumStep, period, smallAnglePeriod, type Oscillator } from '../src/sims/ch15/physics';
import { pendulum } from '../src/sims/ch15/pendulum';
import { shm } from '../src/sims/ch15/shm';

const osc = (A: number, k: number, m: number, zeta = 0): Oscillator => ({ A, k, m, zeta });
const DEG = Math.PI / 180;

describe('ch15 simple harmonic motion', () => {
  it('x = A cos ωt, v = −ωA sin ωt, a = −ω²x with ω = √(k/m)', () => {
    const o = osc(0.2, 20, 1);
    const w = Math.sqrt(20);
    for (const t of [0, 0.13, 0.7, 2.9]) {
      const s = oscAt(o, t);
      expect(s.x).toBeCloseTo(0.2 * Math.cos(w * t), 12);
      expect(s.v).toBeCloseTo(-0.2 * w * Math.sin(w * t), 12);
      expect(s.a).toBeCloseTo(-w * w * s.x, 12);
    }
  });

  it('is the projection of uniform circular motion: the reference point stays on a circle of radius A', () => {
    const o = osc(0.3, 40, 0.5);
    for (const t of [0.05, 0.4, 1.3]) {
      const s = oscAt(o, t);
      expect(Math.hypot(s.px, s.py)).toBeCloseTo(0.3, 12);
      expect(Math.hypot(s.pvx, s.pvy)).toBeCloseTo(0.3 * omega0(o), 12);
      expect(Math.hypot(s.pax, s.pay)).toBeCloseTo(0.3 * omega0(o) ** 2, 12);
      // horizontal coordinate of the reference point = v / ω
      expect(s.px).toBeCloseTo(s.v / omega0(o), 12);
    }
  });

  it('period 2π√(m/k), independent of amplitude', () => {
    for (const A of [0.1, 0.2, 0.3]) {
      const o = osc(A, 10, 2);
      const T = period(o);
      expect(T).toBeCloseTo(2 * Math.PI * Math.sqrt(2 / 10), 12);
      expect(oscAt(o, T).x).toBeCloseTo(A, 12);
      expect(oscAt(o, T / 2).x).toBeCloseTo(-A, 12);
    }
  });

  it('K + U = ½kA² at all times without damping', () => {
    const o = osc(0.2, 20, 1);
    for (const t of [0, 0.3, 0.77, 5.1]) expect(oscAt(o, t).E).toBeCloseTo(0.5 * 20 * 0.04, 12);
  });

  it('damped: starts at rest from A, v = dx/dt, a = −ω₀²x − 2γv, energy decreases', () => {
    const o = osc(0.2, 20, 1, 0.05);
    const s0 = oscAt(o, 0);
    expect(s0.x).toBeCloseTo(0.2, 12);
    expect(s0.v).toBeCloseTo(0, 12);
    const g = 0.05 * omega0(o);
    const h = 1e-6;
    for (const t of [0.2, 1.1, 3.3]) {
      const s = oscAt(o, t);
      expect(s.v).toBeCloseTo((oscAt(o, t + h).x - oscAt(o, t - h).x) / (2 * h), 7);
      expect(s.a).toBeCloseTo(-(omega0(o) ** 2) * s.x - 2 * g * s.v, 10);
    }
    expect(oscAt(o, 3).E).toBeLessThan(oscAt(o, 1).E);
  });

  it('runner records one full period back at x = A', () => {
    const p = defaults(shm.params);
    const r = new Runner(shm, p);
    r.play();
    const T = period({ A: p.A, k: p.k, m: p.m, zeta: 0 });
    r.advance(T);
    expect(Math.abs(r.state.t - T)).toBeLessThan(1 / 480 + 1e-9);
    expect(r.state.x).toBeCloseTo(p.A * Math.cos(Math.sqrt(p.k / p.m) * r.state.t), 12);
  });
});

describe('ch15 simple pendulum', () => {
  const pd = { L: 1, g: 9.8 };
  it('AGM and the exact period: small angles → T₀, 90° → 1.18 T₀', () => {
    expect(agm(1, 1)).toBe(1);
    expect(exactPeriod(pd, 1e-4) / smallAnglePeriod(pd)).toBeCloseTo(1, 8);
    expect(exactPeriod(pd, 90 * DEG) / smallAnglePeriod(pd)).toBeCloseTo(1.18034, 5);
    expect(exactPeriod(pd, 10 * DEG) / smallAnglePeriod(pd)).toBeCloseTo(1.0019, 4);
    expect(exactPeriod(pd, 150 * DEG) / smallAnglePeriod(pd)).toBeCloseTo(1.7622, 3);
  });

  it('RK4 integration returns to θ₀ after one exact period and conserves energy', () => {
    for (const th0 of [30, 90, 150]) {
      const s = { th: th0 * DEG, w: 0 };
      const T = exactPeriod(pd, th0 * DEG);
      const h = 1e-3;
      const n = Math.round(T / h);
      const e0 = 0.5 * s.w ** 2 - (9.8 / 1) * Math.cos(s.th);
      for (let i = 0; i < n; i++) pendulumStep(pd, s, h);
      pendulumStep(pd, s, T - n * h);
      expect(s.th).toBeCloseTo(th0 * DEG, 6);
      expect(0.5 * s.w ** 2 - 9.8 * Math.cos(s.th)).toBeCloseTo(e0, 9);
    }
  });

  it('scene: the pendulum lags its SHM model at 90°', () => {
    const p = defaults(pendulum.params);
    const r = new Runner(pendulum, p);
    r.play();
    r.advance(smallAnglePeriod({ L: p.L, g: 9.8 }));
    // the SHM model is back at θ₀; the real pendulum is not yet
    expect(r.state.th).toBeLessThan(p.theta0 * DEG - 0.1);
  });
});
