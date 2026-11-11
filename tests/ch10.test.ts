import { describe, expect, it } from 'vitest';
import { defaults } from '../src/core/params';
import { Runner } from '../src/core/runner';
import { inertiaBySum, inertiaCm, parallelAxis, pointInertia, spinUp, type Shape } from '../src/sims/ch10/physics';
import { rotorScene } from '../src/sims/ch10/rotor';
import { dLabel, parallelScene } from '../src/sims/ch10/parallel';
import { probe } from './stage-probe';

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

describe('ch10 parallel: d label clear of the rim (round 3)', () => {
  it('ring and disk, phone and desktop, every d: the label box is inside the rim or wholly below the body', () => {
    for (const [w, h] of [
      [390, 300],
      [390, 420],
      [1280, 600],
    ])
      for (const shape of ['ring', 'disk'] as const)
        for (let i = -50; i <= 50; i += 5) {
          const p = { shape, d: i / 100 };
          const g = probe(parallelScene, { t: 0 }, p, w, h);
          const cx = g.vp.toPx(0, 0);
          const rPx = 0.5 / g.px(1);
          const at = dLabel(g, shape, p.d);
          const [lx, ly] = g.vp.toPx(at.x, at.y);
          // Glyph box: 11 px above the baseline, 4 px below it.
          const box = { x0: lx - at.w / 2, x1: lx + at.w / 2, y0: ly + at.dy - 11, y1: ly + at.dy + 4 };
          const corners = [
            [box.x0, box.y0],
            [box.x1, box.y0],
            [box.x0, box.y1],
            [box.x1, box.y1],
          ];
          const dist = corners.map(([x, y]) => Math.hypot(x - cx[0], y - cx[1]));
          const inside = Math.max(...dist) <= rPx - 3 - 1;
          const below = box.y0 >= cx[1] + rPx + 3 + 4;
          expect(inside || below, `${w}x${h} ${shape} d=${p.d}`).toBe(true);
          if (w === 1280) expect(inside).toBe(true);
          expect(box.y1).toBeLessThanOrEqual(h);
        }
  });
});
