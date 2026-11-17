// Addition under review #/ch/106: gravitational field and potential of point masses.
import { describe, expect, it } from 'vitest';
import { defaults } from '../src/core/params';
import { D_MOON, G, L, MOON, M_EARTH, gField, gParts, nullPoint, phi, phiStep, type Mass } from '../src/sims/review/gravfield/physics';
import { formulaLines, gravfield, masses, probe } from '../src/sims/review/gravfield/scene';

const earthMoon: Mass[] = [
  { x: -D_MOON / 2, y: 0, m: 1 },
  { x: D_MOON / 2, y: 0, m: MOON },
];

describe('gravfield physics', () => {
  it('g = −∇Φ (central differences) at several points, two masses', () => {
    const ms: Mass[] = [
      { x: -1, y: 0.2, m: 2 },
      { x: 1.3, y: -0.4, m: 0.5 },
    ];
    const h = 1e-5;
    for (const [x, y] of [
      [0.3, 0.9],
      [-2, -1],
      [1.5, 0.5],
      [0, 0],
    ]) {
      const [gx, gy] = gField(ms, x, y);
      const dx = -(phi(ms, x + h, y) - phi(ms, x - h, y)) / (2 * h * L);
      const dy = -(phi(ms, x, y + h) - phi(ms, x, y - h)) / (2 * h * L);
      expect(Math.abs(dx - gx)).toBeLessThan(1e-6 * Math.hypot(gx, gy));
      expect(Math.abs(dy - gy)).toBeLessThan(1e-6 * Math.hypot(gx, gy));
    }
  });

  it('one mass: g = GM/r² towards the mass, ∝ 1/r²; Φ = −GM/r', () => {
    const ms: Mass[] = [{ x: 0, y: 0, m: 1 }];
    const g1 = gField(ms, 1, 0);
    expect(g1[0]).toBeCloseTo(-(G * M_EARTH) / L ** 2, 12);
    expect(Math.abs(g1[1])).toBeLessThan(1e-15);
    expect(-g1[0]).toBeCloseTo(0.03986, 5); // 3.986e14 / (1e8)²
    for (const r of [0.5, 2, 3]) {
      const [gx, gy] = gField(ms, r * Math.cos(1), r * Math.sin(1));
      expect(Math.hypot(gx, gy) * r * r).toBeCloseTo(-g1[0], 12);
    }
    // Twice as far: a quarter of g.
    expect(Math.hypot(...gField(ms, 2, 0)) / Math.hypot(...g1)).toBeCloseTo(0.25, 12);
    expect(phi(ms, 2, 0)).toBeCloseTo(-(G * M_EARTH) / (2 * L), 3);
  });

  it('the null point matches r1/r2 = √(M1/M2); Earth–Moon: 3.46×10⁵ km from the Earth', () => {
    const n = nullPoint(earthMoon[0], earthMoon[1]);
    expect(n.r1 / n.r2).toBeCloseTo(Math.sqrt(1 / MOON), 10);
    expect(n.r1 * 1e5).toBeGreaterThan(3.45e5);
    expect(n.r1 * 1e5).toBeLessThan(3.47e5);
    const [gx, gy] = gField(earthMoon, n.x, n.y);
    const scale = Math.hypot(...gParts(earthMoon, n.x, n.y)[0]);
    expect(Math.hypot(gx, gy)).toBeLessThan(1e-12 * scale);
    // Off-axis pair with other masses: still zero there, and nonzero a little to either side.
    const ms: Mass[] = [
      { x: -1.2, y: 0.5, m: 3 },
      { x: 1.1, y: -0.7, m: 0.4 },
    ];
    const q = nullPoint(ms[0], ms[1]);
    expect(Math.hypot(...gField(ms, q.x, q.y))).toBeLessThan(1e-14);
    expect(Math.hypot(...gField(ms, q.x + 0.05, q.y))).toBeGreaterThan(1e-4);
  });

  it('the field points towards the masses (attraction only)', () => {
    const [gx] = gField(earthMoon, -2.5, 0);
    expect(gx).toBeGreaterThan(0);
    const [, gy] = gField(earthMoon, 0, 1);
    expect(gy).toBeLessThan(0);
  });

  it('equipotential step is a 1-2-5 number near GM_max/(8L)', () => {
    expect(phiStep(earthMoon)).toBeCloseTo(5e5, 6); // 3.986e6/8 = 4.98e5 → 0.5 MJ/kg
    expect(phiStep([{ x: 0, y: 0, m: 10 }])).toBeCloseTo(5e6, 3);
    expect(phiStep([{ x: 0, y: 0, m: 0.01 }])).toBeCloseTo(5e3, 6);
    expect(phiStep([{ x: 0, y: 0, m: 0.03 }])).toBeCloseTo(2e4, 6); // 1.49e4 → 2e4 (log-nearest)
    expect(phiStep([{ x: 0, y: 0, m: 0.05 }])).toBeCloseTo(2e4, 6); // 2.49e4 → 2e4
  });
});

describe('gravfield scene', () => {
  it('default is the Earth–Moon pair 3.84×10⁵ km apart; formula lines carry the numbers', () => {
    const p = defaults(gravfield.params);
    const ms = masses(p);
    expect(ms.length).toBe(2);
    expect(Math.hypot(ms[1].x - ms[0].x, ms[1].y - ms[0].y)).toBeCloseTo(3.844, 6);
    const lines = formulaLines(p);
    expect(lines.length).toBe(5);
    expect(lines[4]).toContain('3.46\\times 10^{8}');
    for (const l of lines) expect(l).not.toMatch(/NaN|Infinity|undefined/);
    const one = formulaLines({ ...p, two: false });
    expect(one.length).toBe(3);
  });

  it('probe stays clear of a mass dragged on top of it', () => {
    const p = { ...defaults(gravfield.params), T: [-D_MOON / 2, 0] };
    const at = probe(p);
    expect(Math.hypot(at.x + D_MOON / 2, at.y)).toBeGreaterThan(0.149);
    for (const l of formulaLines(p)) expect(l).not.toMatch(/NaN|Infinity/);
  });
});
