import { describe, expect, it } from 'vitest';
import { defaults } from '../src/core/params';
import { edgePhase, firstMin, phasorChain, singleSlit, sourcesIntensity } from '../src/sims/ch36/physics';
import { pairDiff, singleSlit as singleScene } from '../src/sims/ch36/single';
import { WaveField } from '../src/sims/wave2d/field';

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
