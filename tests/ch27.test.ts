import { describe, expect, it } from 'vitest';
import { defaults } from '../src/core/params';
import { Runner } from '../src/core/runner';
import { ONE_TAU, chargeAt, currentAt, finalCharge, tau, type RC } from '../src/sims/ch27/physics';
import { rcCircuit } from '../src/sims/ch27/scene';
import { timeScale, timeWindow } from '../src/core/types';

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

  it('a run that starts in discharge mode starts from a full capacitor, q = Cε (URL or before play)', () => {
    const qFull = finalCharge(c, true);
    // From the URL: the scene is initialised with sw = discharge.
    const url = new Runner(rcCircuit, { ...defaults(rcCircuit.params), sw: 'discharge' });
    expect(url.state.q).toBeCloseTo(qFull, 12);
    expect(url.hist.col('vc')[0]).toBeCloseTo(12, 9);
    url.play();
    url.advance(2);
    expect(url.state.q / qFull).toBeCloseTo(Math.exp(-1), 2);
    const vc = url.hist.col('vc');
    expect(Math.max(...vc) - Math.min(...vc)).toBeGreaterThan(12 * 0.6);
    // Chosen in the bar before pressing play: the readouts show it at once, then it discharges.
    const ui = new Runner(rcCircuit, defaults(rcCircuit.params));
    ui.setParam('sw', 'discharge');
    const iReadout = rcCircuit.readouts!.find((r) => r.label === 'i')!;
    expect(iReadout.value(ui.state, ui.params)).toBeCloseTo((-qFull / tau(c)) * 1e3, 9);
    ui.play();
    ui.advance(2);
    expect(ui.state.q / qFull).toBeCloseTo(Math.exp(-1), 2);
    // Back to charge before play: empty again.
    const back = new Runner(rcCircuit, { ...defaults(rcCircuit.params), sw: 'discharge' });
    back.setParam('sw', 'charge');
    back.play();
    back.advance(2);
    expect(back.state.q / qFull).toBeCloseTo(ONE_TAU, 2);
  });

  it('changing R while running continues from the present charge with the new τ', () => {
    const run = new Runner(rcCircuit, defaults(rcCircuit.params));
    run.play();
    run.advance(1);
    const q1 = run.state.q;
    run.setParam('R', 1);
    run.advance(1);
    const c1: RC = { R: 1e3, C: 1e-3, emf: 12 };
    expect(run.state.q).toBeCloseTo(chargeAt(c1, true, q1, run.state.t - run.state.ts), 12);
    expect(run.state.t - run.state.ts).toBeGreaterThan(0.95);
  });

  it('switching while paused updates the current readout at once (discharge current < 0)', () => {
    const p = defaults(rcCircuit.params);
    const run = new Runner(rcCircuit, p);
    run.play();
    run.advance(2);
    run.pause();
    const iReadout = rcCircuit.readouts!.find((r) => r.label === 'i')!;
    expect(iReadout.value(run.state, run.params)).toBeGreaterThan(0);
    run.setParam('sw', 'discharge');
    const q = run.state.q;
    // Loop rule for the new position: i = −q/τ, before any step.
    expect(iReadout.value(run.state, run.params)).toBeCloseTo((-q / tau(c)) * 1e3, 9);
    expect(iReadout.value(run.state, run.params)).toBeLessThan(0);
  });

  it('the plots widen to keep the run in view when C or R changes mid-run', () => {
    for (const [k, v] of [['C', 100], ['R', 4], ['R', 0.5], ['C', 1000]] as const) {
      const run = new Runner(rcCircuit, { ...defaults(rcCircuit.params), C: k === 'C' && v === 1000 ? 100 : 1000 });
      run.play();
      for (let i = 0; i < 600; i++) {
        if (i === 300) run.setParam(k, v);
        run.advance(1 / 120);
      }
      for (const pl of rcCircuit.plots!) {
        const [lo, hi] = pl.yRange(run.params);
        for (const x of run.hist.col(pl.traces[0].channel)) {
          expect(Number.isFinite(x)).toBe(true);
          expect(x).toBeGreaterThanOrEqual(lo);
          expect(x).toBeLessThanOrEqual(hi);
        }
      }
    }
  });
});

describe('ch27 switch before play (runner restarts on a live change before the first step)', () => {
  it('discharge chosen before play: the t = 0 sample is already the charged capacitor', () => {
    const r = new Runner(rcCircuit, { ...defaults(rcCircuit.params), sw: 'charge' }, 1);
    r.setParam('sw', 'discharge');
    const q0 = r.hist.col('q')[0];
    expect(r.hist.length).toBe(1);
    expect(q0).toBeGreaterThan(0);
    // After the run has started, a switch is live again (no restart).
    r.play();
    r.advance(0.2);
    const n = r.hist.length;
    r.setParam('sw', 'charge');
    expect(r.hist.length).toBe(n);
  });
});

describe('ch27 time axis follows τ (QA E5)', () => {
  const at = (R: number, C: number) => ({ ...defaults(rcCircuit.params), R, C });
  it('the window is 10τ within 0.5 to 20 s: 5τ is never a sliver of the axis', () => {
    // Before: a fixed 20 s window, so at τ = 0.05 s (0.5 kΩ, 100 μF) 5τ was 1.25 % of the axis.
    const cases: [number, number, number][] = [
      [0.5, 100, 0.05],
      [1.3, 170, 0.221],
      [2, 1000, 2],
      [4, 1000, 4],
    ];
    for (const [R, C, T] of cases) {
      const p = at(R, C);
      expect(tau({ R: R * 1e3, C: C * 1e-6, emf: 12 })).toBeCloseTo(T, 9);
      const w = timeWindow(rcCircuit.time, p);
      expect(w).toBeCloseTo(Math.min(20, Math.max(0.5, 10 * T)), 9);
      // 5τ fills at least a quarter of the axis; the τ marker sits at least 5 % in.
      expect((5 * T) / w).toBeGreaterThanOrEqual(0.25);
      expect(T / w).toBeGreaterThanOrEqual(0.05);
    }
    expect(timeWindow(rcCircuit.time, defaults(rcCircuit.params))).toBe(20);
  });

  it('short τ runs slower than real time (0.1× at 0.05 s), 1× from τ = 0.5 s', () => {
    expect(timeScale(rcCircuit.time, at(0.5, 100))).toBeCloseTo(0.1, 12);
    expect(timeScale(rcCircuit.time, at(1, 250))).toBeCloseTo(0.5, 12);
    expect(timeScale(rcCircuit.time, at(2, 250))).toBe(1);
    expect(timeScale(rcCircuit.time, defaults(rcCircuit.params))).toBe(1);
  });
});
