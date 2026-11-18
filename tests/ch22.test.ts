import { describe, expect, it } from 'vitest';
import { E, KQ, POINT_POOL, PRESET_LAYOUT, V, clearOf, pointSources } from '../src/sims/field/charges';
import { K_E } from '../src/sims/field/physics';
import { coulombForces } from '../src/sims/ch22/physics';
import ko from '../src/sims/ch22/i18n.ko.json';
import en from '../src/sims/ch22/i18n.en.json';

describe('ch22 Coulomb forces and field', () => {
  it('Coulomb force of 1 nC on 1 nC at 0.3 m is k·1e-18/0.09, repulsive', () => {
    const { parts, net } = coulombForces([{ x: 0, y: 0, s: 1 }], 0.3, 0, 1);
    expect(net[0]).toBeCloseTo((K_E * 1e-18) / 0.09, 15);
    expect(net[1]).toBe(0);
    expect(parts[0]).toEqual(net);
  });

  it('net force is the vector sum of the parts and equals q0 E', () => {
    const src = [
      { x: -0.4, y: 0, s: 1 },
      { x: 0.4, y: 0, s: -1 },
      { x: 0.1, y: 0.5, s: 2 },
    ];
    const q0 = 1;
    const { parts, net } = coulombForces(src, 0.05, 0.3, q0);
    const sx = parts.reduce((a, f) => a + f[0], 0);
    const sy = parts.reduce((a, f) => a + f[1], 0);
    expect(net[0]).toBeCloseTo(sx, 18);
    expect(net[1]).toBeCloseTo(sy, 18);
    const [ex, ey] = E(src, 0.05, 0.3);
    expect(net[0]).toBeCloseTo(q0 * 1e-9 * ex, 18);
    expect(net[1]).toBeCloseTo(q0 * 1e-9 * ey, 18);
  });

  it('dipole field on the mid-plane points from + to − and V = 0 there', () => {
    const src = pointSources({ preset: 'dipole', Q: POINT_POOL.blank() });
    expect(src.map((c) => c.s).sort()).toEqual([-1, 1]);
    const [ex, ey] = E(src, 0, 0.3);
    expect(ex).toBeGreaterThan(0);
    expect(ey).toBeCloseTo(0, 9);
    expect(V(src, 0, 0.3)).toBeCloseTo(0, 9);
    // |E| at the mid-plane: 2 k q d / (d² + y²)^{3/2}
    const d = 0.4;
    expect(ex).toBeCloseTo((2 * KQ * d) / (d * d + 0.09) ** 1.5, 9);
  });

  it('like pair has a null point midway', () => {
    const like = pointSources({ preset: 'like', Q: POINT_POOL.blank() });
    const [lx, ly] = E(like, 0, 0);
    expect(Math.hypot(lx, ly)).toBeLessThan(1e-9);
  });

  it('plates (QA E1): direction nearly fixed in the middle, strength not uniform, outside partly cancelled', () => {
    const plates = POINT_POOL.sources(POINT_POOL.fromPreset(PRESET_LAYOUT.plates));
    expect(plates.length).toBe(16);
    const mag = (x: number, y: number) => Math.hypot(...E(plates, x, y));
    // Direction: within 3° of straight down (+ row at y = 0.3 → − row at y = −0.3) for |x| ≤ 0.4, |y| ≤ 0.2.
    for (const x of [0, 0.1, 0.2, 0.3, 0.4])
      for (const y of [-0.2, -0.1, 0, 0.1, 0.2]) {
        const [ex, ey] = E(plates, x, y);
        expect(ey).toBeLessThan(0);
        expect(Math.abs(Math.atan2(ex, -ey))).toBeLessThan((3 * Math.PI) / 180);
      }
    // Strength: weakest midway (561 N/C), +54 % at 0.1 m from a row (864 N/C): not uniform.
    expect(mag(0, 0)).toBeCloseTo(561, -1);
    expect(mag(0, 0.2) / mag(0, 0)).toBeGreaterThan(1.4);
    for (const y of [0.05, 0.1, 0.15, 0.2]) expect(mag(0, y)).toBeGreaterThan(mag(0, 0));
    // Outside: the field reverses and, 0.2 m from the + row, is about half the inside value.
    expect(E(plates, 0, 0.5)[1]).toBeGreaterThan(0);
    expect(mag(0, 0.5) / mag(0, 0.1)).toBeLessThan(0.6);
  });

  it('the plates ⓘ no longer claims a nearly uniform field (QA E1)', () => {
    expect(ko['ch22.obs.plates']).not.toMatch(/균일/);
    expect(en['ch22.obs.plates']).not.toMatch(/uniform/i);
    expect(ko['ch22.as.plates']).toMatch(/막대/);
    expect(en['ch22.as.plates']).toMatch(/rod/);
  });

  it('a test charge is pushed off a source to the clearance distance', () => {
    const [x, y] = clearOf([{ x: 0, y: 0, s: 1 }], 0.01, 0, 0.05);
    expect(Math.hypot(x, y)).toBeCloseTo(0.05, 12);
  });
});
