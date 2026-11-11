import { describe, expect, it } from 'vitest';
import { G, RHO, TravelTime, areaAt, inletHead, speedAt, taps, type Venturi } from '../src/sims/ch14/physics';

const tube = (ratio: number, Q = 0.01, dy = 0): Venturi => ({ A1: 0.01, ratio, Q, dy });

describe('ch14 Venturi tube', () => {
  it('continuity: A v = Q everywhere; throat speed is v1 / ratio', () => {
    const v = tube(0.4, 0.015);
    for (const x of [0, 0.3, 0.55, 0.8, 1.05, 1.6]) expect(areaAt(v, x) * speedAt(v, x)).toBeCloseTo(0.015, 14);
    const [a, b, c] = taps(v);
    expect(b.v / a.v).toBeCloseTo(1 / 0.4, 12);
    expect(c.v).toBeCloseTo(a.v, 12);
    expect(b.A / a.A).toBeCloseTo(0.4, 12);
  });

  it('Bernoulli: p + ½ρv² + ρgy is the same at all taps; p1 − p2 = ½ρ(v2² − v1²) when level', () => {
    for (const dy of [0, 0.1, 0.2]) {
      const tp = taps(tube(0.5, 0.01, dy));
      for (const q of tp) expect(q.sum).toBeCloseTo(tp[0].sum, 9);
    }
    const [a, b] = taps(tube(0.5));
    expect(a.p - b.p).toBeCloseTo(0.5 * RHO * (b.v ** 2 - a.v ** 2), 9);
    expect(a.v).toBeCloseTo(1, 12);
    expect(a.p - b.p).toBeCloseTo(1500, 9);
  });

  it('regression: the height difference is the one between sections 1 and 3, p1 − p3 = ρg Δy', () => {
    // Before: Δy was set over the whole tube, so 20 cm gave 14.4 cm between the standpipes.
    const [a, , c] = taps(tube(0.7, 0.01, 0.2));
    expect(c.y - a.y).toBeCloseTo(0.2, 12);
    expect(a.p - c.p).toBeCloseTo(RHO * G * 0.2, 9);
  });

  it('every standpipe column stands at least 5 cm above the axis', () => {
    // the whole slider ranges: ratio 0.4–1 (0.05), Q 5–15 L/s (0.5), dy 0–20 cm
    for (let ratio = 0.4; ratio <= 1 + 1e-9; ratio += 0.05)
      for (let Q = 0.005; Q <= 0.015 + 1e-9; Q += 0.0005)
        for (const dy of [0, 0.05, 0.13, 0.2]) {
          const v = tube(ratio, Q, dy);
          for (const q of taps(v)) expect(q.p / (RHO * G)).toBeGreaterThan(0.05 - 1e-9);
          expect(inletHead(v)).toBeLessThanOrEqual(1);
        }
  });

  it('travel time: uniform pipe gives L / v; tracer spacing in the throat grows by 1 / ratio', () => {
    const u = new TravelTime(tube(1));
    expect(u.total).toBeCloseTo(1.6 / 1, 9);
    expect(u.xAt(0.5)).toBeCloseTo(0.5, 9);
    const v = tube(0.5);
    const tt = new TravelTime(v);
    const dt = 0.08; // v1 = 1 m/s → 8 cm apart in the wide part
    const t0 = tt.ts[tt.xs.findIndex((x) => x >= 0.8)];
    expect(tt.xAt(t0) - tt.xAt(t0 - dt)).toBeCloseTo(0.16, 3);
    expect(Number.isNaN(tt.xAt(-0.1))).toBe(true);
  });
});
