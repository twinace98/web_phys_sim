import { describe, expect, it } from 'vitest';
import { afterFirst, segments } from '../src/sims/ch33/polar';
import { MEDIA, acceptance, coreAngle, criticalAngle, malus, polarizerChain, reflectance, snell, wallIncidence } from '../src/sims/ch33/physics';
import { traceFibre } from '../src/sims/ch33/refraction';

const deg = Math.PI / 180;

describe('ch33 polarizers', () => {
  it('first polarizer halves unpolarized light, then Malus', () => {
    for (const th of [0, 30, 45, 60, 90]) {
      const [I1, I2] = polarizerChain(1, [0, th * deg]);
      expect(I1).toBeCloseTo(0.5, 12);
      expect(I2).toBeCloseTo(malus(0.5, th * deg), 12);
      expect(afterFirst(2, th * deg)).toBeCloseTo(I2 / I1, 12);
    }
    expect(polarizerChain(1, [0, 90 * deg])[1]).toBeCloseTo(0, 12);
  });

  it('a 45° sheet between crossed polarizers passes I0/8', () => {
    const I = polarizerChain(1, [0, 45 * deg, 90 * deg]);
    expect(I[2]).toBeCloseTo(1 / 8, 12);
    expect(segments({ n: 3, theta: 45 }).at(-1)).toBeCloseTo(1 / 8, 12);
    expect(segments({ n: 3, theta: 0 }).at(-1)).toBeCloseTo(0, 12);
    expect(afterFirst(3, 45 * deg)).toBeCloseTo(0.25, 12);
  });
});

describe('ch33 refraction', () => {
  it("Snell's law and its reverse path", () => {
    const n1 = MEDIA.air;
    const n2 = MEDIA.glass;
    for (const th of [10, 30, 60, 85]) {
      const t2 = snell(n1, n2, th * deg);
      expect(n1 * Math.sin(th * deg)).toBeCloseTo(n2 * Math.sin(t2), 12);
      expect(snell(n2, n1, t2)).toBeCloseTo(th * deg, 10);
    }
  });

  it('critical angles: glass 41.8°, water 48.8°, diamond 24.4°', () => {
    expect(criticalAngle(1.5, 1) / deg).toBeCloseTo(41.81, 2);
    expect(criticalAngle(1.33, 1) / deg).toBeCloseTo(48.75, 2);
    expect(criticalAngle(2.42, 1) / deg).toBeCloseTo(24.41, 2);
    expect(criticalAngle(1, 1.5)).toBeNaN();
    expect(snell(1.5, 1, 42 * deg)).toBeNaN();
  });

  it('Fresnel reflectance: 4 % at normal incidence on glass, 100 % beyond the critical angle', () => {
    expect(reflectance(1, 1.5, 0)).toBeCloseTo(0.04, 10);
    expect(reflectance(1.5, 1, 0)).toBeCloseTo(0.04, 10);
    expect(reflectance(1.5, 1, 50 * deg)).toBe(1);
    expect(reflectance(1.5, 1, 41.5 * deg)).toBeGreaterThan(0.5);
    // Rises monotonically toward the critical angle.
    let last = 0;
    for (let th = 0; th < 41.8; th += 2) {
      const R = reflectance(1.5, 1, th * deg);
      expect(R).toBeGreaterThanOrEqual(last - 0.03);
      last = Math.max(last, R);
    }
  });
});

describe('ch33 optical fibre', () => {
  const f = { n1: 1.5, n2: 1.46, n0: 1 };
  it('acceptance angle: sin α_max = √(n1² − n2²)', () => {
    expect(Math.sin(acceptance(f))).toBeCloseTo(Math.sqrt(1.5 ** 2 - 1.46 ** 2), 12);
    expect(acceptance({ n1: 1.5, n2: 1, n0: 1 })).toBeCloseTo(Math.PI / 2, 12);
    const a = acceptance(f);
    expect(wallIncidence(f, a)).toBeCloseTo(criticalAngle(1.5, 1.46), 10);
    expect(Math.sin(a)).toBeCloseTo(1.5 * Math.sin(coreAngle(f, a)), 12);
  });

  it('guided below the acceptance angle, leaking above it', () => {
    const ok = traceFibre({ alpha: 15, clad: '1.46' });
    expect(ok.escaped.length).toBe(0);
    expect(ok.guided.length).toBeGreaterThanOrEqual(2);
    // No loss along the core after the entry face.
    expect(ok.guided.at(-1)!.I).toBeCloseTo(ok.guided[0].I, 12);
    const leak = traceFibre({ alpha: 35, clad: '1.46' });
    expect(leak.escaped.length).toBeGreaterThan(0);
    expect(traceFibre({ alpha: 60, clad: '1' }).escaped.length).toBe(0);
  });
});
