import { describe, expect, it } from 'vitest';
import { closedCirc, fieldFn, circlePoly, enclosed, squarePoly, MU0 } from '../src/sims/field/physics';
import { HALF, I_BS, MU0_UT, R_LOOP, WIRE_B, WIRE_POOL, WIRE_PRESETS, dBz, elements, infiniteWire, loopCentre, straightExact } from '../src/sims/ch29/physics';

const sum = (wire: 'straight' | 'loop', n: number, x: number, y: number) => elements(wire, n).reduce((a, e) => a + dBz(e, x, y), 0);

describe('ch29 Biot-Savart sum', () => {
  it('straight wire: the element sum converges to the finite-wire formula', () => {
    const exact = straightExact(0.15, 0.3);
    expect(Math.abs(sum('straight', 2000, 0.15, 0.3) / exact - 1)).toBeLessThan(1e-5);
    expect(Math.abs(sum('straight', 24, 0.15, 0.3) / exact - 1)).toBeLessThan(0.02);
    // Field below the wire points into the page.
    expect(sum('straight', 24, 0.1, -0.2)).toBeLessThan(0);
  });

  it('finite wire approaches μ0 I / 2πd close to the middle', () => {
    for (const d of [0.05, 0.1]) expect(Math.abs(straightExact(0, d) / infiniteWire(d) - 1)).toBeLessThan(0.005);
    expect(infiniteWire(0.3)).toBeCloseTo((MU0 * I_BS) / (2 * Math.PI * 0.3) * 1e6, 9);
    expect(HALF).toBeGreaterThan(1);
  });

  it('loop centre: every element gives the same dB, and the sum is μ0 I / 2R for any n', () => {
    for (const n of [12, 24, 48]) {
      const d = elements('loop', n).map((e) => dBz(e, 0, 0));
      for (const v of d) expect(v).toBeCloseTo(d[0], 12);
      expect(sum('loop', n, 0, 0)).toBeCloseTo(loopCentre(), 9);
    }
    expect(loopCentre()).toBeCloseTo((MU0 * I_BS) / (2 * R_LOOP) * 1e6, 9);
  });

  it('in-plane field of the loop: out of the page inside, into the page outside', () => {
    expect(sum('loop', 96, 0.2, 0.1)).toBeGreaterThan(0);
    expect(sum('loop', 96, 0.7, 0)).toBeLessThan(0);
  });
});

describe('ch29 Ampère circulation', () => {
  it('∮ B·dl = μ0 I_enc for each preset and loop shape', () => {
    for (const name of Object.keys(WIRE_PRESETS)) {
      const src = WIRE_POOL.sources(WIRE_POOL.fromPreset(WIRE_PRESETS[name]));
      for (const poly of [circlePoly(-0.35, -0.12, 0.3), squarePoly(0.02, 0.17, 0.11), circlePoly(0, 0.16, 0.17)]) {
        const circ = WIRE_B * closedCirc(fieldFn(src, 'wire'), poly);
        const rhs = MU0_UT * enclosed(src, poly);
        expect(Math.abs(circ - rhs)).toBeLessThan(1e-3);
      }
    }
  });

  it('solenoid section: a loop around part of the top row encloses those wires; interior field ≫ exterior', () => {
    const src = WIRE_POOL.sources(WIRE_POOL.fromPreset(WIRE_PRESETS.solenoid));
    expect(enclosed(src, circlePoly(0, 0.16, 0.17))).toBe(4);
    const f = fieldFn(src, 'wire');
    const bin = Math.hypot(...f(0, 0));
    const bout = Math.hypot(...f(0, 0.45));
    expect(f(0, 0)[0]).toBeGreaterThan(0);
    expect(bout / bin).toBeLessThan(0.2);
  });
});
