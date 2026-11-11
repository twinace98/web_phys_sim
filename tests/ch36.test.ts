import { describe, expect, it } from 'vitest';
import { defaults } from '../src/core/params';
import { edgePhase, firstMin, phasorChain, singleSlit, sourcesIntensity } from '../src/sims/ch36/physics';
import { pairDiff, singleSlit as singleScene } from '../src/sims/ch36/single';
import { N_MIN, chainOrigin, phasor, slitGeometry } from '../src/sims/ch36/phasor';
import { WaveField } from '../src/sims/wave2d/field';

describe('ch36 phasor chain clears the rays (round 2)', () => {
  it('the chain never reaches back over the ray ends or the wavefront; it stays at 9.2 when far', () => {
    for (const theta of [-40, -14.5, 0, 14.5, 25, 40])
      for (const a of [0.5, 0.8, 2, 4])
        for (const lambda of [400, 700])
          for (const N of [8, 10, 20]) {
            const q = { theta, a, lambda, N };
            const { ends, front } = slitGeometry(q);
            const right = Math.max(...ends.map((e) => e.x), front[0].x, front[1].x);
            const phi = edgePhase(a, lambda / 1000, theta * deg);
            const left = chainOrigin(q) + Math.min(...phasorChain(N, phi, 16 / N).map((p) => p[0]));
            expect(left).toBeGreaterThanOrEqual(right + 1.1 - 1e-9);
            expect(chainOrigin(q)).toBeGreaterThanOrEqual(9.2);
            // E_m line end (origin + 16) stays left of the wide-stage plot at x = 32.
            expect(chainOrigin(q) + 16).toBeLessThan(32);
          }
    // N = 20, λ = 700 nm, θ = 14.5°: the chain used to start at 9.2, over the wavefront.
    expect(chainOrigin({ theta: 14.5, a: 2, lambda: 700, N: 20 })).toBeGreaterThan(12);
  });
});

const deg = Math.PI / 180;

describe('ch36 single slit', () => {
  it('first minimum at a sin θ = λ', () => {
    expect(firstMin(0.5, 2) / deg).toBeCloseTo(14.4775, 3);
    expect(firstMin(0.5, 0.4)).toBeNaN();
    for (const m of [1, 2, 3]) expect(singleSlit(2, 0.5, Math.asin((m * 0.5) / 2))).toBeCloseTo(0, 12);
    expect(singleSlit(2, 0.5, 0)).toBe(1);
  });

  it('phasor chain closes into a circle at φ = 2π and its length gives the intensity', () => {
    for (const N of [6, 10, 20]) {
      const pts = phasorChain(N, 2 * Math.PI, 1 / N);
      const [x, y] = pts[N];
      expect(Math.hypot(x, y)).toBeLessThan(1e-12);
      for (const phi of [0.3, 2, 5, 9]) {
        const end = phasorChain(N, phi, 1 / N)[N];
        expect(Math.hypot(end[0], end[1]) ** 2).toBeCloseTo(sourcesIntensity(N, phi), 12);
      }
    }
  });

  it('many sources reproduce (sin α / α)²', () => {
    for (const th of [3, 8, 20, 35]) {
      const phi = edgePhase(2, 0.5, th * deg);
      expect(sourcesIntensity(400, phi)).toBeCloseTo(singleSlit(2, 0.5, th * deg), 4);
    }
  });

  it('default marker: the source pair differs by about λ/2', () => {
    const p = defaults(singleScene.params);
    expect(Math.abs(pairDiff(p) - 0.5)).toBeLessThan(0.05);
  });

  it('wave field: the screen minimum lies near D tan θ_1', () => {
    const a = 2;
    const lambda = 0.5;
    const D = 25;
    const f = new WaveField({ lambda, apertures: [{ yc: 0, w: a }], xL: -4, x1: D, y0: -12, y1: 12, screenX: D, screenN: 481, maxCells: 20000 });
    const I = f.screenSteady();
    const y1 = D * Math.tan(firstMin(lambda, a));
    let best = -1;
    for (let i = 1; i < I.length - 1; i++) {
      const y = f.screenY[i];
      if (y < 3 || y > 10) continue;
      if (best < 0 || I[i] < I[best]) best = i;
    }
    // Not exactly Fraunhofer at this distance (a²/λD = 0.32): within 0.5 μm.
    expect(Math.abs(f.screenY[best] - y1)).toBeLessThan(0.5);
    expect(I[best] / I[240]).toBeLessThan(0.03);
  });
});

describe('ch36 phasor chain: the minima do not depend on N', () => {
  const spec = phasor.params.N as { min: number; max: number };
  it('N range starts at N_MIN = 8', () => {
    expect(spec.min).toBe(N_MIN);
    expect(N_MIN).toBeGreaterThanOrEqual(8);
  });

  it('for every allowed N: zeros at a sin θ = mλ and no grating principal maximum in range', () => {
    const p0 = defaults(phasor.params);
    for (let N = spec.min; N <= spec.max; N++)
      for (const a of [0.5, 1.3, 2, 4])
        for (const lambda of [400, 530, 700]) {
          const p = { ...p0, N, a, lambda };
          const I = (th: number) => phasor.readouts![1].value({ t: 0 }, { ...p, theta: th });
          for (let m = 1; m * lambda < a * 1000 * Math.sin(40 * deg); m++) {
            const th = Math.asin((m * lambda) / (a * 1000)) / deg;
            expect(sourcesIntensity(N, edgePhase(a, lambda / 1000, th * deg))).toBeLessThan(1e-20);
            expect(I(th)).toBeLessThan(1e-12); // the scene readout uses the same sum
          }
          // Beyond the first minimum the N-source sum stays a small side lobe, as (sin α/α)² does.
          const t1 = firstMin(lambda / 1000, a) / deg;
          for (let th = -40; th <= 40; th += 0.25)
            if (Math.abs(th) > t1 + 0.5) expect(sourcesIntensity(N, edgePhase(a, lambda / 1000, th * deg))).toBeLessThan(0.06);
        }
  });

  it('readouts stay finite over the parameter ranges', () => {
    const p0 = defaults(phasor.params);
    for (const theta of [-40, -14.5, 0, 0.1, 23.7, 40])
      for (const a of [0.5, 2, 4])
        for (const N of [8, 13, 20])
          for (const r of phasor.readouts!) expect(Number.isFinite(r.value({ t: 0 }, { ...p0, theta, a, N }))).toBe(true);
  });
});
