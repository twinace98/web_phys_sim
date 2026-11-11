import { describe, expect, it } from 'vitest';
import { defaults } from '../src/core/params';
import { Runner } from '../src/core/runner';
import { angMom, arealVelocity, endTime, kinetic, omega, radius, stepAngle, tension, type Mode, type Pull } from '../src/sims/ch11/physics';
import { stringScene } from '../src/sims/ch11/string';

const pull = (mode: Mode, rIn = 0.5, wOut = 2): Pull => ({ mode, m: 0.2, rOut: 1, rIn, wOut, tRamp: 3, tHold: 2 });

/** φ(t) with RK4 at step h. */
function integrate(c: Pull, h: number): { t: number; phi: number }[] {
  const out = [{ t: 0, phi: 0 }];
  const N = Math.round(endTime(c) / h);
  let phi = 0;
  for (let n = 0; n < N; n++) {
    phi = stepAngle(c, phi, n * h, h);
    out.push({ t: (n + 1) * h, phi });
  }
  return out;
}

describe('ch11 puck on a string', () => {
  it('r(t) is continuous and smooth across the ramps; r ω² r² gives a constant L', () => {
    for (const mode of ['pull', 'release', 'both'] as Mode[]) {
      const c = pull(mode);
      const T = endTime(c);
      for (let t = 0; t <= T; t += 0.01) {
        const d = 1e-6;
        expect(radius(c, t + d).r - radius(c, t).r).toBeLessThan(1e-5);
        expect(c.m * radius(c, t).r ** 2 * omega(c, t)).toBeCloseTo(angMom(c), 12);
      }
      // dr/dt from the closed form agrees with a finite difference
      const t = c.tHold + 1.1;
      expect((radius(c, t + 1e-6).r - radius(c, t - 1e-6).r) / 2e-6).toBeCloseTo(radius(c, t).v, 6);
    }
  });

  it('half the radius: four times ω; K ∝ 1/r² on the circles', () => {
    const c = pull('pull', 0.5);
    expect(omega(c, endTime(c)) / omega(c, 0)).toBeCloseTo(4, 12);
    expect(kinetic(c, endTime(c)) / kinetic(c, 0)).toBeCloseTo(4, 12);
  });

  it('RK4 angle converges (step 1/240 s vs 1/1920 s agree to 1e-7 rad)', () => {
    const c = pull('both', 0.3, 3);
    const a = integrate(c, 1 / 240);
    const b = integrate(c, 1 / 1920);
    expect(Math.abs(a[a.length - 1].phi - b[b.length - 1].phi)).toBeLessThan(1e-7);
  });

  it('equal areas in equal times: swept area = (L / 2m) Δt', () => {
    const c = pull('pull', 0.4);
    const h = 1 / 240;
    const run = integrate(c, h);
    // Area swept between samples i and j: ∫ ½ r² dφ (trapezoid on the fine grid).
    const area = (i: number, j: number) => {
      let A = 0;
      for (let k = i; k < j; k++) {
        const r0 = radius(c, run[k].t).r;
        const r1 = radius(c, run[k + 1].t).r;
        A += 0.25 * (r0 * r0 + r1 * r1) * (run[k + 1].phi - run[k].phi);
      }
      return A;
    };
    const per = 48; // 0.2 s
    const expected = arealVelocity(c) * per * h;
    for (const i of [0, 480, 600, 720, 1200]) expect(area(i, i + per) / expected).toBeCloseTo(1, 5);
  });

  it('the string stays taut and the work done by the pull equals ΔK', () => {
    for (const mode of ['pull', 'release', 'both'] as Mode[]) {
      for (const rIn of [0.3, 0.7]) {
        for (const wOut of [1, 3]) {
          const c = pull(mode, rIn, wOut);
          const T = endTime(c);
          const h = 1e-3;
          let W = 0;
          let Tmin = Infinity;
          for (let t = 0; t < T; t += h) {
            const tm = t + h / 2;
            Tmin = Math.min(Tmin, tension(c, tm));
            // The string pulls inward with T; the puck moves outward at dr/dt: power = −T ṙ.
            W += -tension(c, tm) * radius(c, tm).v * h;
          }
          expect(Tmin).toBeGreaterThan(0);
          expect(W).toBeCloseTo(kinetic(c, T) - kinetic(c, 0), 4);
        }
      }
    }
  });

  it('scene: L channel is flat for the whole run and the run stops at the end', () => {
    const run = new Runner(stringScene, { ...defaults(stringScene.params), mode: 'both' });
    run.play();
    for (let i = 0; i < 400 && run.playing; i++) run.advance(0.05);
    expect(run.playing).toBe(false);
    const L = run.hist.col('L');
    for (const v of L) expect(v).toBeCloseTo(L[0], 12);
    const w = run.hist.col('w');
    expect(Math.max(...w) / w[0]).toBeCloseTo(4, 9);
  });
});
