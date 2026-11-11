import { describe, expect, it } from 'vitest';
import { defaults } from '../src/core/params';
import { Rng } from '../src/core/rng';
import { Runner } from '../src/core/runner';
import { Q_E, REF, V_TH, currentOf, driftSpeed, makeGas, meanVx, resistanceOf, stepGas, tauOf, type Wire } from '../src/sims/ch26/physics';
import { conduction } from '../src/sims/ch26/scene';

const W: Wire = { L: 4, A: 2, T: 300 };

/** Time-averaged mean x velocity over a run. */
function averageVx(w: Wire, V: number, T: number, seed: number): number {
  const rng = new Rng(seed);
  const g = makeGas(w, rng);
  const h = 1 / 240;
  for (let t = 0; t < 2; t += h) stepGas(g, w, V, h, rng);
  let s = 0;
  let n = 0;
  for (let t = 0; t < T; t += h) {
    stepGas(g, w, V, h, rng);
    s += meanVx(g);
    n += 1;
  }
  return s / n;
}

describe('ch26 Drude conduction', () => {
  it('reference wire has R = 10 Ω; R ∝ L, ∝ 1/A, ∝ T, independent of V', () => {
    expect(resistanceOf(REF)).toBeCloseTo(10, 10);
    expect(resistanceOf({ ...W, L: 8 }) / resistanceOf(W)).toBeCloseTo(2, 12);
    expect(resistanceOf({ ...W, A: 4 }) / resistanceOf(W)).toBeCloseTo(0.5, 12);
    expect(resistanceOf({ ...W, T: 450 }) / resistanceOf(W)).toBeCloseTo(1.5, 12);
    for (const V of [0.5, 1, 1.5]) expect(V / currentOf(W, V)).toBeCloseTo(resistanceOf(W), 10);
  });

  it('collisions keep the speed and randomise the direction; τ ∝ 1/T', () => {
    expect(tauOf(150) / tauOf(300)).toBeCloseTo(2, 12);
    const rng = new Rng(3);
    const g = makeGas(W, rng);
    for (let i = 0; i < g.n; i++) expect(Math.hypot(g.vx[i], g.vy[i])).toBeCloseTo(V_TH, 12);
  });

  it('no field: no net drift', () => {
    const v = averageVx(W, 0, 20, 7);
    expect(Math.abs(v)).toBeLessThan(0.05);
  });

  it('with a field the mean velocity is the drift velocity −aτ', () => {
    const vd = driftSpeed(W, 1);
    const v = averageVx(W, 1, 30, 11);
    expect(v / -vd).toBeGreaterThan(0.93);
    expect(v / -vd).toBeLessThan(1.07);
  });

  it('counting charge through the cross-section measures I = V / R', () => {
    const run = new Runner(conduction, defaults(conduction.params), 5);
    run.play();
    for (let i = 0; i < 400 && run.playing; i++) run.advance(0.1);
    expect(run.state.t).toBeCloseTo(30, 6);
    const I = (run.state.gas.count * Q_E) / run.state.t;
    expect(I / currentOf(W, 1)).toBeGreaterThan(0.85);
    expect(I / currentOf(W, 1)).toBeLessThan(1.15);
  });

  it('same seed, same run', () => {
    const a = new Runner(conduction, defaults(conduction.params), 9);
    const b = new Runner(conduction, defaults(conduction.params), 9);
    a.play();
    b.play();
    a.advance(1);
    b.advance(1);
    expect(a.state.gas.count).toBe(b.state.gas.count);
    expect(a.state.gas.x[3]).toBe(b.state.gas.x[3]);
  });
});
