import { describe, expect, it } from 'vitest';
import { defaults } from '../src/core/params';
import { Runner } from '../src/core/runner';
import { ONE_TAU, chargeAt, currentAt, finalCharge, tau, type RC } from '../src/sims/ch27/physics';
import { rcCircuit } from '../src/sims/ch27/scene';

const c: RC = { R: 2e3, C: 1e-3, emf: 12 };

describe('ch27 RC circuit', () => {
  it('τ = RC; charging reaches 63 % at τ, current 37 %', () => {
    expect(tau(c)).toBeCloseTo(2, 12);
    const qf = finalCharge(c, true);
    expect(chargeAt(c, true, 0, 2) / qf).toBeCloseTo(ONE_TAU, 12);
    expect(ONE_TAU).toBeCloseTo(0.632, 3);
    expect(currentAt(c, true, 0, 2) / currentAt(c, true, 0, 0)).toBeCloseTo(Math.exp(-1), 12);
    expect(currentAt(c, true, 0, 0)).toBeCloseTo(12 / 2e3, 12);
    expect(chargeAt(c, true, 0, 60)).toBeCloseTo(qf, 12);
  });

  it('current is dq/dt and obeys the loop rule ε = iR + q/C', () => {
    const d = 1e-7;
    for (const t of [0.1, 1, 3]) {
      const q = chargeAt(c, true, 0, t);
      const i = currentAt(c, true, 0, t);
      expect((chargeAt(c, true, 0, t + d) - q) / d).toBeCloseTo(i, 6);
      expect(i * c.R + q / c.C).toBeCloseTo(c.emf, 9);
      const qd = chargeAt(c, false, 6e-3, t);
      expect(currentAt(c, false, 6e-3, t) * c.R + qd / c.C).toBeCloseTo(0, 9);
    }
  });

  it('the tangent at the switching instant reaches the final value at τ', () => {
    const qf = finalCharge(c, true);
    expect(0 + currentAt(c, true, 0, 0) * tau(c)).toBeCloseTo(qf, 12);
    const q0 = 9e-3;
    expect(q0 + currentAt(c, false, q0, 0) * tau(c)).toBeCloseTo(0, 12);
  });

  it('charging dissipates ½Cε² in R (half the battery work)', () => {
    let heat = 0;
    const h = 1e-4;
    for (let t = 0; t < 40; t += h) heat += currentAt(c, true, 0, t + h / 2) ** 2 * c.R * h;
    expect(heat / (0.5 * c.C * c.emf ** 2)).toBeCloseTo(1, 6);
  });

  it('switching to discharge mid-run continues from the charge at that instant', () => {
    const p = defaults(rcCircuit.params);
    const run = new Runner(rcCircuit, p);
    run.play();
    run.advance(2);
    const qMid = run.state.q;
    expect(qMid / finalCharge(c, true)).toBeCloseTo(ONE_TAU, 2);
    run.setParam('sw', 'discharge');
    run.advance(2);
    expect(run.state.q / qMid).toBeCloseTo(Math.exp(-1), 2);
  });
});
