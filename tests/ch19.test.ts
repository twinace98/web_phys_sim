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
  PHI_MAX,
  diskSize,
  impulseTop,
  pCum,
  pWin,
  pressureTop,
  pressureExcess,
} from '../src/sims/ch19/physics';
import ko from '../src/sims/ch19/i18n.ko.json';
import en from '../src/sims/ch19/i18n.en.json';
import { gasScene } from '../src/sims/ch19/gas';

describe('ch19 hard-disk gas', () => {
  it('initial kinetic energy is exactly NkT (2D) in both modes; disks do not overlap', () => {
    for (const mode of ['equal', 'mb'] as const) {
      const g = initGas(200, 20, 300, mode, new Rng(3));
      expect(kinetic(g) / (200 * KB * 300)).toBeCloseTo(1, 10);
      for (let i = 0; i < g.N; i++) for (let j = 0; j < i; j++) expect(Math.hypot(g.x[i] - g.x[j], g.y[i] - g.y[j])).toBeGreaterThan(g.sigma);
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

  const range = (k: 'N' | 'L' | 'T') => {
    const sp = gasScene.params[k] as { min: number; max: number };
    return [sp.min, sp.max];
  };

  it('disks keep helium size unless they would cover more than PHI_MAX of the box', () => {
    expect(diskSize(100, 20)).toBe(SIGMA); // default N, L
    expect(diskSize(20, 30)).toBe(SIGMA);
    for (const N of [20, 100, 150, 400, 1000]) {
      for (const L of [15, 20, 30]) {
        const s = diskSize(N, L);
        expect((N * Math.PI * (s / 2) ** 2) / (L * L)).toBeLessThanOrEqual(PHI_MAX * (1 + 1e-12));
      }
    }
  });

  it('at the densest allowed setting (N = 1000, L = 15 nm) the measured pressure stays within 6 % of NkT/A', () => {
    const N = range('N')[1];
    const L = range('L')[0];
    expect(N).toBe(1000);
    let sum = 0;
    for (const seed of [1, 2]) {
      const g = initGas(N, L, 300, 'mb', new Rng(seed));
      for (let i = 0; i < 20000; i++) {
        stepGas(g, 0.01);
        if (g.hits.length > 1000) g.hits.length = 0;
      }
      sum += g.J / (L * g.t) / idealPressure(N, L, 300);
    }
    const ratio = sum / 2;
    // Hard-disk excess 2φ ≈ 3 % at φ = 1.5 %.
    expect(ratio).toBeGreaterThan(1.0);
    expect(ratio).toBeLessThan(1.06);
  }, 60_000);

  it('impulse and both pressure estimates stay inside their plots at every corner of the parameter ranges', () => {
    const [N0, N1] = range('N');
    const [L0, L1] = range('L');
    const [T0, T1] = range('T');
    for (const N of [N0, N1]) {
      for (const L of [L0, L1]) {
        for (const T of [T0, T1]) {
          const pt = pressureTop(N, L, T);
          const jt = impulseTop(N, L, T, 200);
          for (const seed of [1, 2]) {
            const g = initGas(N, L, T, seed === 1 ? 'equal' : 'mb', new Rng(seed));
            for (let i = 0; i < 20000; i++) {
              stepGas(g, 0.01);
              while (g.hits.length && g.hits[0].t < g.t - 12) g.hits.shift();
              if (i % 10 === 9) {
                expect(pWin(g)).toBeLessThan(pt);
                expect(pCum(g)).toBeLessThan(pt);
                expect(g.J).toBeLessThan(jt);
              }
            }
          }
        }
      }
    }
  }, 60_000);
});

describe('ch19 excess over NkT/A: what the info panel claims', () => {
  /** The "within about x %" bound stated in the info panel. */
  const bound = (txt: string) => Number(/(?:약|about) (\d+(?:\.\d+)?) % (?:이내|at every)/.exec(txt)?.[1] ?? NaN) / 100;

  it('the stated bound covers 2φ + σ/L at every N, L on the sliders (largest about 4.7 %)', () => {
    let worst = 0;
    for (let N = 20; N <= 1000; N += 10) for (let L = 15; L <= 30; L++) worst = Math.max(worst, pressureExcess(N, L));
    expect(worst).toBeGreaterThan(0.045);
    for (const msgs of [ko, en] as Record<string, string>[]) {
      const b = bound(msgs['ch19.assume.dense']);
      expect(b).toBeGreaterThanOrEqual(worst);
      expect(b).toBeLessThan(worst + 0.01);
    }
  });

  it('N = 100, L = 15 nm: long runs measure about 2φ + σ/L = 4.4 % above NkT/A, inside the stated bound', () => {
    const N = 100;
    const L = 15;
    let sum = 0;
    for (const seed of [1, 2]) {
      const g = initGas(N, L, 300, 'mb', new Rng(seed));
      for (let i = 0; i < 1_000_000; i++) {
        stepGas(g, 0.01);
        if (g.hits.length > 1000) g.hits.length = 0;
      }
      sum += g.J / (L * g.t) / idealPressure(N, L, 300) - 1;
    }
    const excess = sum / 2;
    expect(pressureExcess(N, L)).toBeCloseTo(0.0438, 3);
    expect(Math.abs(excess - pressureExcess(N, L))).toBeLessThan(0.012);
    expect(excess).toBeGreaterThan(0.03);
    expect(excess).toBeLessThan(bound(ko['ch19.assume.dense']));
  }, 120_000);

  it('collisions per molecule in one 200 ps run match the info panel: about 36 at the defaults, about 2 at N = 20, L = 30 nm, 100 K', () => {
    const per = (N: number, L: number, T: number) => {
      const g = initGas(N, L, T, 'equal', new Rng(3));
      let n = 0;
      const sp = new Float64Array(N);
      for (let i = 0; i < 20000; i++) {
        for (let k = 0; k < N; k++) sp[k] = Math.hypot(g.vx[k], g.vy[k]);
        stepGas(g, 0.01);
        // Walls keep the speed; a disk collision changes it.
        for (let k = 0; k < N; k++) if (Math.abs(Math.hypot(g.vx[k], g.vy[k]) - sp[k]) > 1e-9) n++;
      }
      return n / N;
    };
    expect(per(100, 20, 300)).toBeGreaterThan(30);
    expect(per(100, 20, 300)).toBeLessThan(42);
    expect(per(20, 30, 100)).toBeGreaterThan(1);
    expect(per(20, 30, 100)).toBeLessThan(3);
    for (const msgs of [ko, en] as Record<string, string>[]) {
      expect(msgs['ch19.assume.relax']).toMatch(/36/);
      expect(gasScene.info.assumptions).toContain('ch19.assume.relax');
    }
  });
});
