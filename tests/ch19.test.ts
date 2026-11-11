import { describe, expect, it } from 'vitest';
import { Rng } from '../src/core/rng';
import {
  KB,
  MASS,
  collide,
  idealPressure,
  initGas,
  kinetic,
  meanSpeed,
  sigmaV,
  speedPdf,
  speeds,
  stepGas,
  SIGMA,
} from '../src/sims/ch19/physics';

describe('ch19 hard-disk gas', () => {
  it('initial kinetic energy is exactly NkT (2D) in both modes; disks do not overlap', () => {
    for (const mode of ['equal', 'mb'] as const) {
      const g = initGas(200, 20, 300, mode, new Rng(3));
      expect(kinetic(g) / (200 * KB * 300)).toBeCloseTo(1, 10);
      for (let i = 0; i < g.N; i++) for (let j = 0; j < i; j++) expect(Math.hypot(g.x[i] - g.x[j], g.y[i] - g.y[j])).toBeGreaterThan(SIGMA);
    }
  });

  it('a disk collision conserves momentum and kinetic energy', () => {
    const g = initGas(2, 10, 300, 'equal', new Rng(1));
    g.x.set([5, 5.2]);
    g.y.set([5, 5.1]);
    g.vx.set([1.3, -0.4]);
    g.vy.set([0.2, -0.9]);
    const px = g.vx[0] + g.vx[1];
    const py = g.vy[0] + g.vy[1];
    const k = kinetic(g);
    expect(collide(g, 0, 1)).toBe(true);
    expect(g.vx[0] + g.vx[1]).toBeCloseTo(px, 14);
    expect(g.vy[0] + g.vy[1]).toBeCloseTo(py, 14);
    expect(kinetic(g)).toBeCloseTo(k, 30);
    // now separating: no second collision
    expect(collide(g, 0, 1)).toBe(false);
  });

  it('energy is conserved over a long run (walls and collisions are elastic)', () => {
    const g = initGas(200, 20, 300, 'equal', new Rng(7));
    const k0 = kinetic(g);
    for (let i = 0; i < 5000; i++) stepGas(g, 0.01);
    expect(kinetic(g) / k0).toBeCloseTo(1, 10);
    for (let i = 0; i < g.N; i++) {
      expect(g.x[i]).toBeGreaterThanOrEqual(0);
      expect(g.x[i]).toBeLessThanOrEqual(20);
    }
  });

  it('time-averaged wall impulse gives the ideal-gas pressure NkT/A at low density', () => {
    const N = 50;
    const L = 30;
    const g = initGas(N, L, 300, 'mb', new Rng(11));
    const tEnd = 1500;
    for (let i = 0; i < tEnd / 0.01; i++) {
      stepGas(g, 0.01);
      if (g.hits.length > 1000) g.hits.length = 0;
    }
    const p = g.J / (L * g.t);
    expect(Math.abs(p / idealPressure(N, L, 300) - 1)).toBeLessThan(0.06);
  });

  it('collisions turn equal speeds into the 2D Maxwell-Boltzmann distribution', () => {
    const g = initGas(300, 20, 300, 'equal', new Rng(5));
    expect(speeds(g).reduce((a, b) => a + b, 0) / g.N).toBeCloseTo(Math.SQRT2 * sigmaV(300), 9);
    for (let i = 0; i < 20000; i++) stepGas(g, 0.01);
    let mean = 0;
    let n = 0;
    for (let k = 0; k < 20; k++) {
      for (let i = 0; i < 200; i++) stepGas(g, 0.01);
      for (const v of speeds(g)) {
        mean += v;
        n++;
      }
    }
    mean /= n;
    expect(Math.abs(mean / meanSpeed(300) - 1)).toBeLessThan(0.03);
  });

  it('the 2D Maxwell-Boltzmann pdf is normalised with mean √(πkT/2m)', () => {
    const T = 600;
    let norm = 0;
    let m1 = 0;
    const dv = 1e-3;
    for (let v = dv / 2; v < 20; v += dv) {
      norm += speedPdf(v, T) * dv;
      m1 += v * speedPdf(v, T) * dv;
    }
    expect(norm).toBeCloseTo(1, 6);
    expect(m1).toBeCloseTo(Math.sqrt((Math.PI * KB * T) / (2 * MASS)) / 1e3, 6);
  });
});
