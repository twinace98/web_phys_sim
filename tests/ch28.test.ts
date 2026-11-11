import { describe, expect, it } from 'vitest';
import { PARTICLES, cyclotronOmega, gyrate, lorentz, maxEnergy, period, radius, runCyclotron, type Cyclotron, type Kin } from '../src/sims/ch28/physics';

const p = PARTICLES.proton;
const e = PARTICLES.electron;

describe('ch28 charged particle in a uniform field', () => {
  it('r = mv/|q|B and T = 2πm/|q|B', () => {
    expect(radius(p, 2e6, 1)).toBeCloseTo(0.020876, 5);
    expect(period(p, 1) * 1e9).toBeCloseTo(65.59, 1);
    expect(period(e, 1e-3) * 1e9).toBeCloseTo(35.72, 1);
    expect(radius(p, 4e6, 1) / radius(p, 2e6, 1)).toBeCloseTo(2, 12);
  });

  it('exact rotation keeps the speed, closes the circle after one period, any speed', () => {
    const B = -1;
    const T = period(p, 1);
    for (const v of [1e6, 2e6, 3e6]) {
      const k: Kin = { x: 0, y: 0, vx: v, vy: 0 };
      const n = 1000;
      let maxR = 0;
      for (let i = 0; i < n; i++) {
        gyrate(k, p, B, T / n);
        expect(Math.hypot(k.vx, k.vy)).toBeCloseTo(v, 6);
        maxR = Math.max(maxR, Math.hypot(k.x, k.y));
      }
      expect(k.x).toBeCloseTo(0, 12);
      expect(k.y).toBeCloseTo(0, 12);
      expect(maxR / (2 * radius(p, v, 1))).toBeCloseTo(1, 4);
    }
  });

  it('field into the page: protons turn counter-clockwise, electrons clockwise; F ⊥ v', () => {
    const kp: Kin = { x: 0, y: 0, vx: 1e6, vy: 0 };
    gyrate(kp, p, -1, period(p, 1) / 8);
    expect(kp.y).toBeGreaterThan(0);
    const ke: Kin = { x: 0, y: 0, vx: 1e6, vy: 0 };
    gyrate(ke, e, -1e-3, period(e, 1e-3) / 8);
    expect(ke.y).toBeLessThan(0);
    const [fx, fy] = lorentz(kp, p, -1);
    expect(fx * kp.vx + fy * kp.vy).toBeCloseTo(0, 30);
    expect(Math.hypot(fx, fy)).toBeCloseTo(p.q * 1e6 * 1, 25);
  });
});

describe('ch28 cyclotron', () => {
  const cfg = (ratio: number, V0 = 1e4): Cyclotron => ({ pt: p, B: 1, R: 0.05, gap: 0.006, V0, ratio });
  const T = (2 * Math.PI) / cyclotronOmega(cfg(1));

  it('in tune, the proton gains about qV0 per crossing and leaves with (qBR)²/2m', () => {
    const c = cfg(1);
    const run = runCyclotron(c, 20 * T, 1e-11, 10, 0.05);
    expect(run.tStop).toBeLessThan(20 * T);
    const i = Math.floor(run.tStop / (run.t[1] - run.t[0]));
    expect(run.K[i] / maxEnergy(c)).toBeGreaterThan(0.8);
    expect(run.K[i] / maxEnergy(c)).toBeLessThan(1.05);
    // Starting mid-gap gives qV0/2, then about qV0 per crossing: 1.5 qV0 after the second.
    const i3 = Math.floor((0.75 * T) / (run.t[1] - run.t[0]));
    expect(run.K[i3] / (p.q * 1e4)).toBeGreaterThan(1.3);
    expect(run.K[i3] / (p.q * 1e4)).toBeLessThan(1.55);
  });

  it('detuned, the energy rises, falls again, and the proton stays inside', () => {
    const c = cfg(0.95);
    const run = runCyclotron(c, 12 * T, 1e-11, 10, 0.065);
    expect(run.tStop).toBeCloseTo(12 * T, 12);
    let kMax = 0;
    for (let i = 0; i < run.n; i++) kMax = Math.max(kMax, run.K[i]);
    expect(kMax).toBeLessThan(0.75 * maxEnergy(c));
    const at11 = Math.floor((11 * T) / (run.t[1] - run.t[0]));
    expect(run.K[at11]).toBeLessThan(0.3 * kMax);
  });
});
