import { describe, expect, it } from 'vitest';
import { Runner } from '../src/core/runner';
import { defaults } from '../src/core/params';
import { lorentzScene, orbitsFit, viewR } from '../src/sims/ch28/lorentz';
import { PARTICLES, radius } from '../src/sims/ch28/physics';

describe('ch28 Lorentz view scale', () => {
  it('fixed per species: the drawn radius falls exactly as 1/B (doubling B halves the circle)', () => {
    for (const [particle, key, unit] of [
      ['proton', 'Bi', 1],
      ['electron', 'Be', 1e-3],
      ['alpha', 'Bi', 1],
    ] as const) {
      const pt = PARTICLES[particle];
      const at = (b: number) => ({ particle, Be: 1, Bi: 1, compare: true, v: 3, [key]: b });
      const drawn = (b: number) => (radius(pt, 3e6, b * unit) * 100) / viewR(at(b));
      // Unchanged at the weakest field: the largest circle fills the view half-width.
      expect(drawn(0.5)).toBeCloseTo(1, 9);
      expect(drawn(1)).toBeCloseTo(0.5, 9);
      expect(drawn(2)).toBeCloseTo(0.25, 9);
    }
  });
});

describe('ch28 Lorentz: B changed mid-run (QA 2026-11-24)', () => {
  const R = (p: Record<string, unknown>) => viewR(p as never) / 100;
  /** Every particle stays inside the world box of the scene for `steps` steps. */
  const inBox = (r: Runner<any, any>, steps: number) => {
    const p = r.params as Record<string, unknown>;
    const w = lorentzScene.world(p as never);
    for (let i = 0; i < steps; i++) {
      r.advance(lorentzScene.time!.h);
      for (const k of r.state.ps) {
        expect(k.x * 100).toBeGreaterThanOrEqual(w.x[0] - 1e-6 * R(p));
        expect(k.x * 100).toBeLessThanOrEqual(w.x[1] + 1e-6 * R(p));
        expect(k.y * 100).toBeGreaterThanOrEqual(w.y[0] - 1e-6 * R(p));
        expect(k.y * 100).toBeLessThanOrEqual(w.y[1] + 1e-6 * R(p));
      }
    }
  };

  it('lowering B from the top of a small circle restarts at the launcher; the circles stay on stage', () => {
    for (const [particle, key] of [
      ['proton', 'Bi'],
      ['electron', 'Be'],
      ['alpha', 'Bi'],
    ] as const) {
      for (const compare of [true, false]) {
        const r = new Runner(lorentzScene, { ...defaults(lorentzScene.params), particle, compare, v: 2.3, [key]: 2 } as never);
        r.play();
        // Half a turn: the particles sit at the top of their circles.
        const half = 1.5 / lorentzScene.time!.h / 2;
        inBox(r, Math.round(half));
        expect(r.setParam(key, 0.5)).toBeDefined();
        inBox(r, 2);
        // Restarted from the launch point: the circles pass through it again.
        for (const k of r.state.ps) expect(Math.hypot(k.x, k.y)).toBeLessThan(0.05 * R(r.params));
        inBox(r, 400);
        // Odd values in between, and back up: raising B keeps the motion (smaller circle inside).
        for (const b of [0.85, 1.35, 0.55, 1.95, 0.7]) {
          r.setParam(key, b);
          inBox(r, 157);
        }
      }
    }
  });

  it('raising B keeps the particles where they are (no restart) and orbitsFit agrees', () => {
    const r = new Runner(lorentzScene, defaults(lorentzScene.params) as never);
    r.play();
    inBox(r, 100);
    const before = r.state.ps.map((k: { x: number; y: number }) => ({ ...k }));
    r.setParam('Bi', 1.5);
    r.advance(lorentzScene.time!.h);
    r.state.ps.forEach((k: { x: number; y: number }, i: number) => expect(Math.hypot(k.x - before[i].x, k.y - before[i].y)).toBeLessThan(0.05 * R(r.params)));
    expect(orbitsFit(r.state.ps, r.params as never, 1.5)).toBe(true);
    inBox(r, 400);
  });
});
