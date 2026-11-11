import { describe, expect, it } from 'vitest';
import { E, KQ, POINT_POOL, PRESET_LAYOUT, V, clearOf, pointSources } from '../src/sims/field/charges';
import { K_E } from '../src/sims/field/physics';
import { coulombForces } from '../src/sims/ch22/physics';

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

  it('like pair has a null point midway; plates make a nearly uniform field between them', () => {
    const like = pointSources({ preset: 'like', Q: POINT_POOL.blank() });
    const [lx, ly] = E(like, 0, 0);
    expect(Math.hypot(lx, ly)).toBeLessThan(1e-9);
    const plates = POINT_POOL.sources(POINT_POOL.fromPreset(PRESET_LAYOUT.plates));
    expect(plates.length).toBe(16);
    const e0 = E(plates, 0, 0);
    const e1 = E(plates, 0.2, 0.1);
    expect(e0[1]).toBeLessThan(0);
    expect(Math.abs(e1[1] / e0[1] - 1)).toBeLessThan(0.15);
    expect(Math.abs(e1[0] / e0[1])).toBeLessThan(0.15);
  });

  it('a test charge is pushed off a source to the clearance distance', () => {
    const [x, y] = clearOf([{ x: 0, y: 0, s: 1 }], 0.01, 0, 0.05);
    expect(Math.hypot(x, y)).toBeCloseTo(0.05, 12);
  });
});
