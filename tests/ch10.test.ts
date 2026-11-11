import { describe, expect, it } from 'vitest';
import { defaults } from '../src/core/params';
import { Runner } from '../src/core/runner';
import { inertiaBySum, inertiaCm, parallelAxis, pointInertia, spinUp, type Shape } from '../src/sims/ch10/physics';
import { rotorScene } from '../src/sims/ch10/rotor';

describe('ch10 point masses', () => {
  it('I = Σ m r²: doubling r quadruples the contribution', () => {
    expect(pointInertia([{ m: 1, r: 0.5 }])).toBeCloseTo(0.25, 12);
    expect(pointInertia([{ m: 1, r: 1 }]) / pointInertia([{ m: 1, r: 0.5 }])).toBeCloseTo(4, 12);
    expect(
      pointInertia([
        { m: 2, r: 0.5 },
        { m: 1, r: 1 },
      ]),
    ).toBeCloseTo(1.5, 12);
  });

  it('constant torque: ω = α t and θ = α t²/2 with α = τ/I', () => {
    const k = spinUp(0.5, 2, 3);
    expect(k.alpha).toBeCloseTo(0.25, 12);
    expect(k.omega).toBeCloseTo(0.75, 12);
    expect(k.theta).toBeCloseTo(1.125, 12);
  });

  it('scene: default rotor B (r doubled) has a quarter of the angular acceleration', () => {
    const run = new Runner(rotorScene, defaults(rotorScene.params));
    run.play();
    for (let i = 0; i < 400 && run.playing; i++) run.advance(0.05);
    const wA = run.hist.col('wA');
    const wB = run.hist.col('wB');
    const n = wA.length - 1;
    expect(run.state.t).toBeCloseTo(6, 9);
    expect(wB[n] / wA[n]).toBeCloseTo(0.25, 12);
  });
});

describe('ch10 rigid bodies and the parallel-axis theorem', () => {
  const M = 2;
  const R = 0.5;
  it('closed-form I_cm: ring MR², disk MR²/2, rod (length 2R) MR²/3', () => {
    expect(inertiaCm('ring', M, R)).toBeCloseTo(0.5, 12);
    expect(inertiaCm('disk', M, R)).toBeCloseTo(0.25, 12);
    expect(inertiaCm('rod', M, R)).toBeCloseTo(1 / 6, 12);
  });

  for (const shape of ['ring', 'disk', 'rod'] as Shape[]) {
    it(`${shape}: Σ m r² over small pieces matches I_cm + M d²`, () => {
      for (const d of [0, 0.1, 0.25, -0.4, 0.5]) {
        const exact = parallelAxis(inertiaCm(shape, M, R), M, d);
        expect(Math.abs(inertiaBySum(shape, M, R, d, 300) - exact) / exact).toBeLessThan(1e-4);
      }
    });
  }
});
