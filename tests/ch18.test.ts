import { describe, expect, it } from 'vitest';
import { Runner } from '../src/core/runner';
import { defaults } from '../src/core/params';
import {
  A0,
  NR,
  cycle,
  eint,
  enclosedArea,
  gammaOf,
  heatSplit,
  legAt,
  legWork,
  pathAt,
  processLeg,
  temp,
  threePaths,
  type Leg,
} from '../src/sims/ch18/physics';
import page from '../src/sims/ch18';

/** ∫ p dV by the trapezoid rule on a fine sampling of the leg. */
function numericWork(l: Leg, n = 20000): number {
  let w = 0;
  let prev = legAt(l, 0);
  for (let i = 1; i <= n; i++) {
    const q = legAt(l, i / n);
    w += 0.5 * (q.p + prev.p) * (q.V - prev.V);
    prev = q;
  }
  return w;
}

describe('ch18 single processes (monatomic, A = 10 L, 100 kPa, 300 K)', () => {
  const f = 3;
  it('A is at 300 K', () => {
    expect(temp(A0)).toBeCloseTo(300, 12);
    expect(NR / 8.314).toBeCloseTo(0.401, 3);
  });

  it('isobaric expansion: W = pΔV, Q = (f/2 + 1) pΔV', () => {
    const l = processLeg('isobaric', true, f);
    const e = pathAt([l], 1, f);
    expect(e.W).toBeCloseTo(1000, 9);
    expect(e.dE).toBeCloseTo(1500, 9);
    expect(e.Q).toBeCloseTo(2500, 9);
    expect(temp(e.st)).toBeCloseTo(600, 9);
  });

  it('isochoric: W = 0, Q = ΔE_int', () => {
    const e = pathAt([processLeg('isochoric', true, f)], 1, f);
    expect(e.W).toBe(0);
    expect(e.Q).toBeCloseTo(e.dE, 12);
    expect(e.dE).toBeCloseTo(1.5 * 10 * 100, 9);
  });

  it('isothermal: ΔE_int = 0, Q = W = nRT ln(V_f/V_i)', () => {
    for (const up of [true, false]) {
      const e = pathAt([processLeg('isothermal', up, f)], 1, f);
      expect(e.dE).toBeCloseTo(0, 9);
      expect(e.W).toBeCloseTo(1000 * Math.log(up ? 2 : 0.5), 9);
      expect(e.Q).toBeCloseTo(e.W, 9);
    }
  });

  it('adiabatic: Q = 0 all along, p V^γ constant, W = −ΔE_int', () => {
    for (const ff of [3, 5]) {
      for (const up of [true, false]) {
        const l = processLeg('adiabatic', up, ff);
        const g = gammaOf(ff);
        for (const s of [0.3, 0.7, 1]) {
          const e = pathAt([l], s, ff);
          expect(e.Q).toBeCloseTo(0, 8);
          expect(e.st.p * e.st.V ** g).toBeCloseTo(A0.p * A0.V ** g, 6);
        }
      }
    }
  });

  it('closed-form work equals the numerical integral of p dV for every kind of leg', () => {
    for (const k of ['isobaric', 'isochoric', 'isothermal', 'adiabatic'] as const) {
      for (const up of [true, false]) {
        const l = processLeg(k, up, 5);
        expect(legWork(l, 1)).toBeCloseTo(numericWork(l), 4);
        expect(legWork(l, 0.4)).toBeCloseTo(numericWork({ ...l, b: legAt(l, 0.4) }), 1);
      }
    }
  });
});

describe('ch18 path dependence', () => {
  it('B = (30 L, 50 kPa): W = 2000, 1000, 1500 J; ΔE_int = 750 J on every path', () => {
    const { paths } = threePaths({ V: 30, p: 50 });
    const ends = paths.map((legs) => pathAt(legs, 1, 3));
    expect(ends.map((e) => e.W)).toEqual([2000, 1000, 1500].map((v) => expect.closeTo(v, 9)));
    for (const e of ends) {
      expect(e.dE).toBeCloseTo(750, 9);
      expect(e.Q).toBeCloseTo(e.dE + e.W, 12);
      expect(e.st.V).toBeCloseTo(30, 12);
      expect(e.st.p).toBeCloseTo(50, 12);
    }
  });

  it('every path reaches B at s = 1', () => {
    for (const B of [
      { V: 20, p: 50 },
      { V: 30, p: 20 },
    ]) {
      for (const legs of threePaths(B).paths) {
        const e = pathAt(legs, 1, 5);
        expect(e.st.V).toBeCloseTo(B.V, 12);
        expect(e.st.p).toBeCloseTo(B.p, 12);
        expect(e.dE).toBeCloseTo(eint(B, 5) - eint(A0, 5), 9);
      }
    }
  });
});

describe('ch18 cycles', () => {
  it('rectangle: ΔE_int = 0, Q_net = W_net = enclosed area = 2000 J; reversed: −2000 J', () => {
    for (const cw of [true, false]) {
      const c = cycle('rect', cw, 3);
      const e = pathAt(c.legs, 1, 3);
      expect(e.dE).toBeCloseTo(0, 9);
      expect(e.W).toBeCloseTo(cw ? 2000 : -2000, 9);
      expect(e.Q).toBeCloseTo(e.W, 9);
      expect(enclosedArea(c.legs)).toBeCloseTo(e.W, 6);
    }
  });

  it('Carnot: closes on itself and its efficiency is 1 − T_C/T_H', () => {
    for (const f of [3, 5]) {
      const c = cycle('carnot', true, f);
      const e = pathAt(c.legs, 1, f);
      expect(e.dE).toBeCloseTo(0, 6);
      const last = legAt(c.legs[3], 1);
      expect(last.V).toBeCloseTo(c.corners[0].V, 9);
      expect(last.p).toBeCloseTo(c.corners[0].p, 9);
      const { qin, qout } = heatSplit(c.legs, f);
      expect(e.W / qin).toBeCloseTo(1 - 300 / 600, 9);
      expect(qin - qout).toBeCloseTo(e.W, 9);
      expect(enclosedArea(c.legs)).toBeCloseTo(e.W, 2);
    }
  });
});

describe('ch18 scenes', () => {
  it('every scene runs to its end time with the default parameters', () => {
    for (const sc of page.scenes) {
      const r = new Runner(sc, defaults(sc.params));
      r.play();
      for (let i = 0; i < 100 && r.playing; i++) r.advance(0.1);
      expect(r.done).toBe(true);
    }
  });
});
