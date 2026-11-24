import { describe, expect, it } from 'vitest';
import { defaults, fromQuery } from '../src/core/params';
import { edgePhase, firstMin, phasorChain, singleSlit, sourcesIntensity, twoSlit } from '../src/sims/ch36/physics';
import { apsOf, envelope, markDiff, pairDiff, sepOf, singleSlit as singleScene } from '../src/sims/ch36/single';
import { N_MIN, chainOrigin, phasor, slitGeometry } from '../src/sims/ch36/phasor';
import { WaveField } from '../src/sims/wave2d/field';
import { SCREEN_N, Y0, Y1, fieldFor } from '../src/sims/wave2d/slits';
import ko from '../src/sims/ch36/i18n.ko.json';
import en from '../src/sims/ch36/i18n.en.json';

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

/** Far-field |Σ e^{ik y_j sinθ}|² / n², n equal sources spread over each of two slits (midpoints). */
function twoSlitPhasorSum(a: number, d: number, lambda: number, theta: number, nPer = 2000): number {
  const k = (2 * Math.PI) / lambda;
  let re = 0;
  let im = 0;
  for (const yc of [d / 2, -d / 2])
    for (let j = 0; j < nPer; j++) {
      const y = yc - a / 2 + ((j + 0.5) * a) / nPer;
      re += Math.cos(k * y * Math.sin(theta));
      im += Math.sin(k * y * Math.sin(theta));
    }
  return (re * re + im * im) / (2 * nPer) ** 2;
}

describe('ch36 two slits: single-slit envelope × two-slit fringes', () => {
  it('(sin α/α)² cos² β matches a direct phasor sum over both slits', () => {
    let worst = 0;
    for (const [a, d] of [
      [2, 4],
      [1.5, 4.5],
      [0.5, 1],
      [2, 2],
      [6, 10],
      [1.3, 7.1],
    ])
      for (const lambda of [0.4, 0.5, 0.7])
        for (let th = -40; th <= 40; th += 0.73) {
          const t = th * deg;
          worst = Math.max(worst, Math.abs(twoSlit(a, d, lambda, t) - twoSlitPhasorSum(a, d, lambda, t)));
        }
    expect(worst).toBeLessThan(1e-5);
  });

  it('missing orders: d sin θ = mλ on an envelope zero when d/a is an integer', () => {
    const lambda = 0.5;
    for (const [a, ratio] of [
      [2, 2],
      [1.5, 3],
      [1, 4],
    ]) {
      const d = a * ratio;
      // m = ratio·m' falls on a sin θ = m'λ: intensity 0 (the phasor sum agrees).
      const th = Math.asin((ratio * lambda) / d);
      expect(twoSlit(a, d, lambda, th)).toBeLessThan(1e-25);
      expect(twoSlitPhasorSum(a, d, lambda, th)).toBeLessThan(1e-6);
      // Orders inside the central envelope stay bright; 2d/a − 1 of them.
      let n = 0;
      for (let m = -ratio + 1; m <= ratio - 1; m++) if (twoSlit(a, d, lambda, Math.asin((m * lambda) / d)) > 0.05) n++;
      expect(n).toBe(2 * ratio - 1);
    }
    // At d = a the two slits touch: one slit of width 2a.
    for (const th of [3, 11, 27]) expect(twoSlit(1.5, 1.5, 0.5, th * deg)).toBeCloseTo(singleSlit(3, 0.5, th * deg), 12);
  });

  it('wave field (default two-slit setting): m = ±2 nearly vanishes at y₁, m = ±1 stays bright', () => {
    const p = { ...defaults(singleScene.params), slits: 'two' };
    expect([p.a, p.d, p.lambda, p.D]).toEqual([2, 4, 500, 25]);
    const f = new WaveField({ lambda: 0.5, apertures: apsOf(p), xL: -4, x1: 25, y0: -12, y1: 12, screenX: 25, screenN: 481, maxCells: 20000 });
    const I = f.screenSteady();
    const at = (y: number) => f.screenY.reduce((b, v, i) => (Math.abs(v - y) < Math.abs(f.screenY[b] - y) ? i : b), 0);
    const peak = (y: number) => Math.max(...Array.from({ length: 13 }, (_, k) => I[at(y) + k - 6]));
    const I0 = peak(0);
    const y = (m: number) => 25 * Math.tan(Math.asin((m * 0.5) / 4));
    expect(peak(y(1)) / I0).toBeGreaterThan(0.45);
    expect(peak(y(2)) / I0).toBeLessThan(0.04);
    expect(peak(y(3)) / I0).toBeLessThan(0.06);
    // y(2) is the first envelope zero D tan θ₁.
    expect(y(2)).toBeCloseTo(25 * Math.tan(firstMin(0.5, 2)), 12);
  });

  it('dashed envelope (|E₁| + |E₂|)² bounds the pattern and touches its maxima', () => {
    for (const [a, d, D] of [
      [2, 4, 25],
      [1.5, 4.5, 30],
      [0.8, 6.3, 15],
    ]) {
      const p = { ...defaults(singleScene.params), slits: 'two', a, d, D };
      const env = envelope(p);
      const f = new WaveField({ lambda: 0.5, apertures: apsOf(p), xL: -4, x1: D, y0: -12, y1: 12, screenX: D, screenN: 241 });
      const I = f.screenSteady();
      const max = Math.max(...I);
      for (let i = 0; i < I.length; i++) expect(I[i] / max).toBeLessThanOrEqual(env[i] + 1e-9);
      // At the central maximum the two waves arrive in phase.
      expect(env[120]).toBeCloseTo(I[120] / max, 3);
    }
  });

  it('marker, slit separation and old links', () => {
    const p = { ...defaults(singleScene.params), slits: 'two' };
    // Default point is the first envelope zero: ΔL between the slit centres ≈ 2λ, yet dark.
    expect(markDiff(p)).toBeCloseTo(1.99, 2);
    expect(markDiff({ ...p, slits: 'one' })).toBe(pairDiff(p));
    expect(sepOf({ a: 3, d: 1 })).toBe(3);
    expect(apsOf({ slits: 'two', a: 3, d: 1 })).toEqual([
      { yc: 1.5, w: 3 },
      { yc: -1.5, w: 3 },
    ]);
    expect(apsOf({ slits: 'one', a: 3, d: 5 })).toEqual([{ yc: 0, w: 3 }]);
    const vis = singleScene.params.d.visibleIf!;
    expect(vis({ ...p, slits: 'one' })).toBe(false);
    expect(vis(p)).toBe(true);
    const q = fromQuery(singleScene.params, new URLSearchParams('slits=three&d=40&a=2.5'));
    expect([q.slits, q.d, q.a]).toEqual(['one', 4, 2.5]);
  });
});

describe('ch36 single slit 6 μm: the ⓘ wording matches the drawn screen (review 2026-11-20)', () => {
  /** Outermost screen point at or above half the maximum [μm]; the pattern is symmetric. */
  const halfExtent = (a: number, lambda: number, D: number) => {
    const I = fieldFor(lambda, [{ yc: 0, w: a }], D).screenSteady();
    let max = 0;
    for (const v of I) max = Math.max(max, v);
    let hi = SCREEN_N - 1;
    while (I[hi] < max / 2) hi--;
    return Y0 + ((Y1 - Y0) * hi) / (SCREEN_N - 1);
  };

  it('a = 6 μm, every λ and D in range: bright band ±1–2 μm at half maximum, narrower than the slit (±3 μm)', () => {
    // Review case: defaults λ = 500 nm, D = 25 μm give ±1.0 μm.
    expect(halfExtent(6, 500, 25)).toBeCloseTo(1.0, 5);
    for (const lambda of [400, 550, 700])
      for (const D of [15, 22, 30]) {
        const w = halfExtent(6, lambda, D);
        expect(w).toBeGreaterThanOrEqual(1 - 1e-9);
        expect(w).toBeLessThanOrEqual(2 + 1e-9);
        expect((0.001 * lambda) / 6).toBeLessThanOrEqual(0.12);
      }
  });

  it('the wording no longer claims a band as wide as the slit, in ko and en', () => {
    expect(ko['ch36.s.obs.wide']).not.toContain('슬릿 폭 정도의 밝은 띠');
    expect(en['ch36.s.obs.wide']).not.toContain('a bright band about as wide as the slit');
  });

  // QA 2026-11-24: "±1–2 μm" read as one central band, but at λ = 400 nm, D = 15 μm the centre is
  // a dip (0.47 of the maximum) between two peaks. The text now gives the band at the defaults and
  // names that case.
  const centreRatio = (a: number, lambda: number, D: number) => {
    const I = fieldFor(lambda, [{ yc: 0, w: a }], D).screenSteady();
    let max = 0;
    for (const v of I) max = Math.max(max, v);
    return I[(SCREEN_N - 1) / 2] / max;
  };

  it('defaults: one central band ±1.0 μm; λ = 400 nm, D = 15 μm: centre 0.47 of the maximum, as the text says', () => {
    expect(centreRatio(6, 500, 25)).toBeCloseTo(1, 6);
    expect(centreRatio(6, 400, 15)).toBeCloseTo(0.47, 2);
    for (const m of [ko, en]) {
      expect(m['ch36.s.obs.wide']).toContain('±1.0 μm');
      expect(m['ch36.s.obs.wide']).toContain('0.47');
      expect(m['ch36.s.obs.wide']).toContain('500 nm');
      expect(m['ch36.s.obs.wide']).toContain('0.083');
    }
    expect(0.5 / 6).toBeCloseTo(0.083, 3);
  });
});
