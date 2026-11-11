import { describe, expect, it } from 'vitest';
import { imageDistance, magnification, principalRays } from '../src/sims/ch34/physics';
import { focal } from '../src/sims/ch34/scene';

describe('ch34 thin lens and mirror equation', () => {
  it('1/p + 1/i = 1/f with signs', () => {
    expect(imageDistance(25, 15)).toBeCloseTo(37.5, 10);
    expect(imageDistance(30, 15)).toBeCloseTo(30, 10);
    expect(imageDistance(10, 15)).toBeCloseTo(-30, 10);
    expect(imageDistance(30, -15)).toBeCloseTo(-10, 10);
    expect(imageDistance(15, 15)).toBe(Infinity);
    expect(imageDistance(20, Infinity)).toBe(-20);
    expect(magnification(30, 30)).toBeCloseTo(-1, 12);
    expect(magnification(20, -20)).toBeCloseTo(1, 12);
  });

  it('element signs: converging and concave positive, diverging and convex negative, plane infinite', () => {
    expect(focal('converging', 15)).toBe(15);
    expect(focal('concave', 15)).toBe(15);
    expect(focal('diverging', 15)).toBe(-15);
    expect(focal('convex', 15)).toBe(-15);
    expect(focal('plane', 15)).toBe(Infinity);
  });

  it('all principal rays (or their extensions) pass through the image tip', () => {
    for (const f of [10, 15, 20, -10, -20, Infinity]) {
      for (const p of [5, 12, 25, 40, 55]) {
        if (Math.abs(p - f) < 1e-9) continue;
        const h = 4;
        const i = imageDistance(p, f);
        const hi = magnification(p, i) * h;
        const rays = principalRays(p, h, f);
        expect(rays.length).toBe(Number.isFinite(f) ? 3 : 2);
        for (const r of rays) expect(r.y + r.sOut * i).toBeCloseTo(hi, 9);
      }
    }
  });

  it('object at the focal point: outgoing rays are parallel', () => {
    const rays = principalRays(15, 4, 15);
    expect(rays.length).toBe(2);
    expect(rays[0].sOut).toBeCloseTo(rays[1].sOut, 12);
  });
});
