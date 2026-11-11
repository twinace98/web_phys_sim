import { describe, expect, it } from 'vitest';
import { bounce, contracted, gamma, interval, inverse, lorentz, movingPeriod, restPeriod, ticks, trainEvents } from '../src/sims/ch37/physics';

describe('ch37 Lorentz transformation', () => {
  it('γ: 1.25 at β = 0.6, 5/3 at 0.8', () => {
    expect(gamma(0.6)).toBeCloseTo(1.25, 12);
    expect(gamma(0.8)).toBeCloseTo(5 / 3, 12);
  });

  it('inverse undoes the transformation; the interval is invariant', () => {
    for (const [x, t] of [
      [1.5, 3],
      [-2, 0.5],
      [3, -1],
    ]) {
      const [xp, tp] = lorentz(x, t, 0.6);
      const [x2, t2] = inverse(xp, tp, 0.6);
      expect(x2).toBeCloseTo(x, 12);
      expect(t2).toBeCloseTo(t, 12);
      expect(interval(xp, tp)).toBeCloseTo(interval(x, t), 12);
    }
  });

  it('light stays at c: x = t maps to x′ = t′', () => {
    const [xp, tp] = lorentz(2, 2, 0.8);
    expect(xp).toBeCloseTo(tp, 12);
  });

  it('simultaneous in S (Δt = 0) → Δt′ = −γβΔx in S′', () => {
    const b = 0.5;
    const tA = lorentz(-1.5, 3, b)[1];
    const tB = lorentz(1.5, 3, b)[1];
    expect(tB - tA).toBeCloseTo(-gamma(b) * b * 3, 12);
  });
});

describe('ch37 light clocks and rods', () => {
  it('moving clock period = γ × rest period; the zigzag runs at c', () => {
    const L = 1;
    const b = 0.8;
    expect(movingPeriod(L, b) / restPeriod(L)).toBeCloseTo(gamma(b), 12);
    // Half a tick: up L while moving β·P/2 sideways; path length = c·P/2.
    const half = movingPeriod(L, b) / 2;
    expect(Math.hypot(L, b * half)).toBeCloseTo(half, 12);
  });

  it('bounce: triangle wave between the mirrors', () => {
    expect(bounce(0, 2, 1)).toBeCloseTo(0, 12);
    expect(bounce(1, 2, 1)).toBeCloseTo(1, 12);
    expect(bounce(2.5, 2, 1)).toBeCloseTo(0.5, 12);
    expect(ticks(6, 2)).toBe(3);
    expect(ticks(5.99, 2)).toBe(2);
  });

  it('contraction L0/γ', () => {
    expect(contracted(4, 0.6)).toBeCloseTo(3.2, 12);
    expect(contracted(4, 0.8)).toBeCloseTo(2.4, 12);
  });
});

describe('ch37 train flash', () => {
  it('train frame: both ends at L0/2; ground frame: rear first, Δt = γβL0', () => {
    for (const b of [0.3, 0.6, 0.8]) {
      const e = trainEvents(4, b);
      expect(e.rearSp).toBe(e.frontSp);
      expect(e.rearS).toBeLessThan(e.frontS);
      expect(e.frontS - e.rearS).toBeCloseTo(gamma(b) * b * 4, 12);
      // Same events by Lorentz transformation of (x′ = ±2, t′ = 2).
      expect(inverse(-2, 2, b)[1]).toBeCloseTo(e.rearS, 12);
      expect(inverse(2, 2, b)[1]).toBeCloseTo(e.frontS, 12);
    }
  });
});
