// Regression tests for the verified QA findings in Ch 35-39 and 41 (group O).
import { describe, expect, it } from 'vitest';
import { defaults } from '../src/core/params';
import { Runner } from '../src/core/runner';
import { timeScale, timeWindow, type Params } from '../src/core/types';
import { apsOf as aps35, doubleSlit } from '../src/sims/ch35/scene';
import { edgePhase, singleSlit as sinc2, sourcesIntensity } from '../src/sims/ch36/physics';
import { apsOf as aps36, singleSlit, y1Mark } from '../src/sims/ch36/single';
import { phasor } from '../src/sims/ch36/phasor';
import { spacetime } from '../src/sims/ch37/scene';
import { DK, deltaK, deltaX, packet, packetWidth, vGroup } from '../src/sims/ch38/physics';
import { wavePacket } from '../src/sims/ch38/scene';
import { model, superposition, supDt, supGap, supPeriod, supStates } from '../src/sims/ch39/scene';
import { bandsScene } from '../src/sims/ch41/bands';
import { conduction } from '../src/sims/ch41/conduction';
import { WaveField } from '../src/sims/wave2d/field';
import { fieldFor, relIntensity } from '../src/sims/wave2d/slits';
import ko36 from '../src/sims/ch36/i18n.ko.json';
import en36 from '../src/sims/ch36/i18n.en.json';
import ko37 from '../src/sims/ch37/i18n.ko.json';
import ko38 from '../src/sims/ch38/i18n.ko.json';
import ko39 from '../src/sims/ch39/i18n.ko.json';
import ko41 from '../src/sims/ch41/i18n.ko.json';

const deg = Math.PI / 180;

/** Run a slit scene to its end; worst |accumulated − steady| over the screen (both relative to the steady maximum). */
function slitError(scene: any, p: any, f: WaveField): { worst: number; I: Float64Array; steady: Float64Array } {
  const s = scene.init(p);
  const tEnd = scene.time.tEnd(p);
  while (s.t < tEnd) scene.step(s, scene.time.h, p);
  const I = relIntensity(s, f);
  const st = f.screenSteady();
  let mx = 0;
  for (const v of st) mx = Math.max(mx, v);
  const steady = st.map((v) => v / mx);
  let worst = 0;
  for (let i = 0; i < I.length; i++) worst = Math.max(worst, Math.abs(I[i] - steady[i]));
  return { worst, I, steady };
}

describe('Ch 35/36 accumulated screen intensity: each sample averaged over its own time', () => {
  it('Ch 35 default: the outermost maximum reads its steady 0.868 at run end (was 0.661)', () => {
    const p = defaults(doubleSlit.params) as any;
    const { worst, I, steady } = slitError(doubleSlit, p, fieldFor(p.lambda, aps35(p), p.D));
    expect(worst).toBeLessThan(0.01);
    // Outermost local maximum of the steady pattern (y ≈ ±11.55 μm).
    let k = -1;
    for (let i = steady.length - 2; i > 0; i--)
      if (steady[i] > steady[i - 1] && steady[i] >= steady[i + 1]) {
        k = i;
        break;
      }
    expect(steady[k]).toBeCloseTo(0.868, 2);
    expect(I[k]).toBeGreaterThan(0.86);
  });

  it('Ch 35 extreme (d = 5 μm, λ = 400 nm, D = 12 μm) and Ch 36 two slits (a = 1, d = 10, D = 15)', () => {
    const p = { ...defaults(doubleSlit.params), d: 5, lambda: 400, D: 12 } as any;
    expect(slitError(doubleSlit, p, fieldFor(p.lambda, aps35(p), p.D)).worst).toBeLessThan(0.01);
    const q = { ...defaults(singleSlit.params), slits: 'two', a: 1, d: 10, D: 15 } as any;
    expect(slitError(singleSlit, q, fieldFor(q.lambda, aps36(q), q.D)).worst).toBeLessThan(0.01);
  });

  it('before the waves of every aperture have arrived, a sample stays dark', () => {
    const p = defaults(doubleSlit.params) as any;
    const f = fieldFor(p.lambda, aps35(p), p.D);
    const s = doubleSlit.init(p, undefined as any);
    const t0 = f.screenFull();
    const tStop = t0[120] + 2; // centre reached, outer edge (later) not yet
    while (s.t < tStop) doubleSlit.step!(s, doubleSlit.time!.h, p);
    expect(t0[0]).toBeGreaterThan(tStop);
    expect(s.acc[0]).toBe(0);
    expect(s.acc[120]).toBeGreaterThan(0);
  });
});

describe('Ch 36 single slit: Fraunhofer y₁ mark in the Fresnel regime', () => {
  const minNear = (a: number, lam: number, D: number) => {
    const f = new WaveField({ lambda: lam, apertures: [{ yc: 0, w: a }], xL: -4, x1: D, y0: -12, y1: 12, screenX: D, screenN: 481, maxCells: 2000 });
    const I = f.screenSteady();
    let mx = 0;
    for (const v of I) mx = Math.max(mx, v);
    const y1 = D * Math.tan(Math.asin(lam / a));
    let best = Infinity;
    for (let i = 0; i < I.length; i++) if (Math.abs(f.screenY[i] - y1) < 0.2) best = Math.min(best, I[i] / mx);
    return { best, centreIsMax: I[240] / mx > 0.99 };
  };

  it('a = 6 μm, λ = 400 nm, D = 15 μm (a²/λD = 6): the mark is hidden; there y₁ is no minimum', () => {
    const p = { ...defaults(singleSlit.params), a: 6, lambda: 400, D: 15 } as any;
    expect(y1Mark(p)).toBe('hidden');
    const { best, centreIsMax } = minNear(6, 0.4, 15);
    expect(best).toBeGreaterThan(0.4);
    expect(centreIsMax).toBe(false);
  });

  it('defaults: normal mark on a true near-zero minimum; a = 4, λ = 500, D = 25: faint, minimum filled to a few %', () => {
    const p = defaults(singleSlit.params) as any;
    expect(y1Mark(p)).toBe('normal');
    expect(minNear(2, 0.5, 25).best).toBeLessThan(0.03);
    const q = { ...p, a: 4, lambda: 500, D: 25 };
    expect(y1Mark(q)).toBe('faint');
    const m = minNear(4, 0.5, 25).best;
    expect(m).toBeGreaterThan(0.03);
    expect(m).toBeLessThan(0.28);
  });

  it('ⓘ no longer says the minima move "slightly"', () => {
    expect(ko36['ch36.s.assume.scale']).not.toContain('조금 벗어남');
    expect(en36['ch36.s.assume.scale']).not.toContain('slightly');
  });
});

describe('Ch 36 phasor: outer maxima of N sources against the continuous slit', () => {
  it('the ⓘ numbers: 6.8× at the 34° maximum (N = 8, a = 4 μm, λ = 400 nm), 1.1-1.2× at the defaults', () => {
    const at = (N: number, a: number, lam: number, th: number) => sourcesIntensity(N, edgePhase(a, lam, th * deg));
    // Local maximum of the 8-source sum near 33.5°.
    let th = 0;
    let best = 0;
    for (let t = 31; t < 36; t += 0.001)
      if (at(8, 4, 0.4, t) > best) {
        best = at(8, 4, 0.4, t);
        th = t;
      }
    let cont = 0;
    for (let t = 31; t < 36; t += 0.001) cont = Math.max(cont, sinc2(4, 0.4, t * deg));
    expect(th).toBeCloseTo(33.5, 0);
    expect(best / cont).toBeCloseTo(6.8, 1);
    expect(best).toBeCloseTo(0.023, 3);
    // Defaults: second and third maxima.
    const r = (lo: number, hi: number) => {
      let a = 0;
      let c = 0;
      for (let t = lo; t < hi; t += 0.001) {
        a = Math.max(a, at(10, 2, 0.5, t));
        c = Math.max(c, sinc2(2, 0.5, t * deg));
      }
      return a / c;
    };
    expect(r(18, 25)).toBeGreaterThan(1.05);
    expect(r(34, 40)).toBeLessThan(1.25);
    expect(ko36['ch36.ph.assume.draw']).not.toContain('조금 높음');
    expect(ko36['ch36.ph.assume.draw']).toContain('6.8');
    expect(phasor.info.assumptions).toContain('ch36.ph.assume.draw');
  });
});

describe('Ch 38 packet: Δx Δk only for a packet localised within one repeat', () => {
  it('M ≤ 3: Δx and the product read – (M = 3 used to read 0.417 < 1/2); M ≥ 4: ≥ 1/2 at t = 0 and at the end', () => {
    const [dx, , prod] = wavePacket.readouts!;
    for (const k0 of [5, 10, 15])
      for (let M = 1; M <= 33; M++) {
        const p = { ...defaults(wavePacket.params), M, k0 } as any;
        const tEnd = (wavePacket.time!.tEnd as (p: Params) => number)(p);
        for (const t of [0, tEnd / 2, tEnd]) {
          const v = prod.value({ t, n: 0 }, p);
          if (M <= 3) {
            expect(Number.isNaN(v)).toBe(true);
            expect(Number.isNaN(dx.value({ t, n: 0 }, p))).toBe(true);
          } else expect(v).toBeGreaterThanOrEqual(0.5);
        }
      }
    // The raw rms width over a repeat stays below the uniform L/√12 = 12.1 nm: not a packet width.
    expect(deltaX(packet(3, 10), 0, 0) * deltaK(packet(3, 10))).toBeCloseTo(0.417, 3);
    expect(packetWidth(packet(4, 10), 0, 0)).toBeCloseTo(5.84, 2);
    expect(packetWidth(packet(4, 10), 0, 0)).toBeLessThan((2 * Math.PI) / DK / 6);
    expect(vGroup(10)).toBeGreaterThan(0);
  });

  it('ⓘ defines Δx, Δk as standard deviations, Δp = ħΔk and Δx Δp ≥ ħ/2', () => {
    expect(wavePacket.info.assumptions).toContain('ch38.k.assume.define');
    const s = ko38['ch38.k.assume.define'];
    expect(s).toContain('표준편차');
    expect(s).toContain('\\Delta p = \\hbar\\,\\Delta k');
    expect(s).toContain('\\hbar/2');
    expect(wavePacket.info.equations!.join(' ')).toContain('\\tfrac{\\hbar}{2}');
  });
});

describe('Ch 39 superposition: plot window and speed follow the period', () => {
  const p0 = defaults(superposition.params) as any;
  const cases = [
    { ...p0, pot: 'infinite', L: 1, pair: '13' }, // 1.37 fs
    { ...p0, pot: 'double' }, // 61.4 fs
    { ...p0, pot: 'harmonic' },
    { ...p0, pot: 'double', L: 1.5, Ub: 4.5, b: 0.5, pair: '12' }, // 12 870 fs
  ];

  it('period range 1.37-12 870 fs; window = 3 periods, one period = 2 wall seconds at 1×', () => {
    expect(supPeriod(cases[0])).toBeCloseTo(1.375, 2);
    expect(supPeriod(cases[1])).toBeCloseTo(61.4, 1);
    expect(supPeriod(cases[3])).toBeGreaterThan(12800);
    expect(supPeriod(cases[3])).toBeLessThan(12950);
    for (const p of cases) {
      const T = supPeriod(p);
      expect(timeWindow(superposition.time, p) / T).toBeCloseTo(3, 9);
      // Wall seconds per period: runner steps per second = scale/h, each step supDt fs.
      expect(T / ((timeScale(superposition.time, p) / superposition.time!.h) * supDt(p))).toBeCloseTo(2, 9);
    }
  });

  it('every period: after 6 wall seconds the window is filled and ⟨x⟩ swings over its full range (was flat over a fixed 40 fs)', () => {
    for (const p of [cases[0], cases[1], cases[3]]) {
      const r = new Runner(superposition, p, 1);
      r.play();
      // 6 wall seconds at 60 frames per second: three periods.
      for (let i = 0; i < 360; i++) r.advance(1 / 60);
      const T = supPeriod(p);
      expect(r.state.t / T).toBeGreaterThan(2.95);
      expect(r.state.t / T).toBeLessThan(3.05);
      const ts = r.hist.col('t');
      const xs = r.hist.col('xm');
      const w = timeWindow(superposition.time, p);
      const inWin = xs.filter((_, i) => ts[i] >= r.state.t - w);
      // Samples cover the window densely (the history once kept only its last ~350 fs).
      expect(inWin.length).toBeGreaterThan(150);
      const q = supStates(model(p), p.pair);
      expect(Math.max(...inWin) - Math.min(...inWin)).toBeGreaterThan(1.9 * Math.abs(q.xc));
    }
  });

  it('ΔE readout separates levels that print alike (wide, high barrier: both 0.148 eV)', () => {
    const p = cases[3];
    const m = model(p);
    expect(m.st.E[0].toFixed(3)).toBe(m.st.E[1].toFixed(3));
    const dE = superposition.readouts!.find((r) => r.label === '\\Delta E')!;
    expect(dE.value({ t: 0, n: 0 }, p)).toBeCloseTo(supGap(p), 12);
    expect(supGap(p)).toBeCloseTo(4.135667 / supPeriod(p), 6);
  });

  it('ⓘ defines ⟨x⟩, stationary state and Ψ vs ψ', () => {
    for (const k of ['ch39.s.assume.terms', 'ch39.s.assume.mean', 'ch39.s.assume.time']) expect(superposition.info.assumptions).toContain(k);
    expect(ko39['ch39.s.assume.terms']).toContain('정상상태');
    expect(ko39['ch39.s.assume.terms']).toContain('\\Psi(x,t)');
    expect(ko39['ch39.s.assume.mean']).toContain('기댓값');
  });
});

describe('Ch 41 symbols: defined once per tab, no clashes', () => {
  it('band formation: q, d, a, k, κ defined', () => {
    expect(bandsScene.info.assumptions).toContain('ch41.b.assume.sym');
    const s = ko41['ch41.b.assume.sym'];
    for (const sym of ['$q$', '$d = a + b$', '$a$', '$k = ', '\\kappa']) expect(s).toContain(sym);
  });

  it('conduction: hopping energy γ (not t), field ℰ (not E), a, ±π/a and Δk defined', () => {
    const eq = conduction.info.equations!.join(' ');
    expect(eq).not.toContain('-eE');
    expect(eq).toContain('\\mathcal{E}');
    expect(eq).toContain('\\gamma');
    expect(ko41['ch41.c.assume.band']).not.toContain('2t');
    expect(conduction.info.assumptions).toContain('ch41.c.assume.sym');
    const s = ko41['ch41.c.assume.sym'];
    for (const sym of ['\\mathcal{E}', '격자 상수', '\\gamma', '\\Delta k', '\\pm\\pi/a']) expect(s).toContain(sym);
  });
});

describe('Ch 37 spacetime diagram: terms defined in ⓘ', () => {
  it('세계선, 동시선, 사건, 빛 원뿔, 세계 띠', () => {
    expect(spacetime.info.assumptions).toContain('ch37.d.assume.terms');
    const s = ko37['ch37.d.assume.terms'];
    for (const w of ['세계선', '동시선', '사건', '빛 원뿔', '세계 띠']) expect(s).toContain(w);
  });
});
