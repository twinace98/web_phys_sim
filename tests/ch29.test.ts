import { describe, expect, it } from 'vitest';
import { closedCirc, fieldFn, circlePoly, enclosed, squarePoly, MU0 } from '../src/sims/field/physics';
import { biot } from '../src/sims/ch29/biot';
import { defaults } from '../src/core/params';
import ko from '../src/sims/ch29/i18n.ko.json';
import en from '../src/sims/ch29/i18n.en.json';
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

  it('review case: centre field 13.26 μT = 0.844 μ0 n I (finite length L = 4 d), and the ⓘ says so', () => {
    const src = WIRE_POOL.sources(WIRE_POOL.fromPreset(WIRE_PRESETS.solenoid));
    const f = fieldFn(src, 'wire');
    const B = (x: number, y: number) => WIRE_B * Math.hypot(...f(x, y));
    // 16 wires 8 cm apart per row: n = 12.5 /m, L = 1.28 m; rows 0.32 m apart.
    const xs = WIRE_PRESETS.solenoid.filter((w) => w[0] === 0).map((w) => w[1]);
    const ys = [...new Set(WIRE_PRESETS.solenoid.map((w) => w[2]))];
    const L = xs.length * (xs[1] - xs[0]);
    const d = Math.abs(ys[0] - ys[1]);
    expect(L).toBeCloseTo(1.28, 9);
    expect(d).toBeCloseTo(0.32, 9);
    const ideal = MU0_UT * (xs.length / L) * 1;
    expect(ideal).toBeCloseTo(15.71, 2);
    expect(B(0, 0)).toBeCloseTo(13.26, 2);
    expect(B(0, 0) / ideal).toBeCloseTo((2 / Math.PI) * Math.atan(L / d), 3);
    expect(B(0, 0) / ideal).toBeCloseTo(0.844, 3);
    // Nearly uniform along the middle: within 2 % for |x| ≤ 0.2 m, |y| ≤ 0.1 m.
    for (const x of [-0.2, -0.1, 0, 0.1, 0.2]) for (const y of [-0.1, 0, 0.1]) expect(Math.abs(B(x, y) / B(0, 0) - 1)).toBeLessThan(0.02);
    // The ⓘ quotes these numbers and the length-to-width ratio.
    for (const s of [ko['ch29.a.obs.solenoid'], en['ch29.a.obs.solenoid']]) {
      expect(s).toContain('13.3 μT');
      expect(s).toContain('15.7 μT');
      expect(s).toContain('84 %');
      expect(s).toMatch(/4배|4 times/);
    }
    expect(ko['ch29.a.obs.solenoid']).not.toContain('거의 균일하고 강함');
  });
});

describe('ch29 Biot-Savart reference line and convergence (QA E7)', () => {
  /** The dashed reference value and its label, as drawPlot draws them on the B plot. */
  function ref(p: Record<string, unknown>): { y: number; label: string } {
    let y = NaN;
    let label = '';
    const ctx = {
      save() {},
      restore() {},
      measureText: (t: string) => ({ width: 7 * t.length }),
      fillText: (t: string) => {
        label += t;
      },
    };
    const pd = {
      ctx,
      toPx: (t: number, v: number): [number, number] => [t, v],
      polyline: (pts: [number, number][]) => {
        y = pts[0][1];
      },
      dot: () => {},
    };
    biot.drawPlot!('B', pd as never, p as never, {} as never);
    return { y, label };
  }
  const loopAt = (x: number, y: number) => ({ ...defaults(biot.params), wire: 'loop', Pl: [x, y] });

  it('loop: μ0I/2R only with P at the centre; elsewhere the n → ∞ value (22.05 μT at (0.30, 0), not 13.96)', () => {
    const c = ref(loopAt(0, 0));
    expect(c.y).toBeCloseTo(loopCentre(), 9);
    expect(c.label).toMatch(/R/);
    expect(c.label).not.toMatch(/∞/);
    const off = ref(loopAt(0.3, 0));
    expect(off.y).toBeCloseTo(sum('loop', 200000, 0.3, 0), 3);
    expect(off.y).toBeCloseTo(22.05, 1);
    expect(off.label).toMatch(/∞/);
    // Outside the loop the limit is ⊗ (negative).
    expect(ref(loopAt(0.51, 0)).y).toBeCloseTo(sum('loop', 200000, 0.51, 0), 3);
    expect(ref(loopAt(0.51, 0)).y).toBeLessThan(0);
  });

  it('the sum needs elements shorter than the distance to P (the ⓘ now says so)', () => {
    const ex = straightExact(0, 0.06);
    expect(sum('straight', 4, 0, 0.06) / ex - 1).toBeCloseTo(-0.908, 2);
    expect(sum('straight', 24, 0, 0.06) / ex - 1).toBeCloseTo(-0.088, 2);
    expect(Math.abs(sum('straight', 48, 0, 0.06) / ex - 1)).toBeLessThan(0.003);
    const fine = sum('loop', 200000, 0.51, 0);
    expect(Math.sign(sum('loop', 4, 0.51, 0))).toBe(-Math.sign(fine));
    expect(ko['ch29.b.obs.n']).not.toMatch(/거의 같음/);
    expect(en['ch29.b.obs.n']).not.toMatch(/nearly the same/);
    expect(ko['ch29.b.obs.n']).toMatch(/-91/);
    expect(en['ch29.b.obs.n']).toMatch(/sign/);
  });
});
