import { describe, expect, it } from 'vitest';
import { envelope, harmonic, nodes, reflectAt, resonance, steadyAmp, stringAdvance, stringInit, stringStep, type Driven, type Reflect } from '../src/sims/ch16/physics';
import { defaults } from '../src/core/params';
import { PARTS_ALPHA, reflect } from '../src/sims/ch16/reflect';
import { STR, resonanceScene } from '../src/sims/ch16/resonance';
import { ProbeDraw } from './stage-probe';

const base: Reflect = { L: 4, v: 2, A: 0.3, mode: 'pulse', end: 'fixed', lambda: 1.6, tau: 0.5, t0: 0.6 };

describe('ch16 reflection', () => {
  it('fixed end: y(L) = 0 always; the pulse returns inverted', () => {
    for (const t of [0, 1, 1.5, 1.8, 2.1, 3]) expect(reflectAt(base, 4, t).y).toBeCloseTo(0, 14);
    // incident peak at x = 0.7 at t = 0; reflected peak back at x = 0.7 when 2L − x = v(t + t0) − v τ/2
    const t = (2 * 4 - 0.7) / 2 - 0.6 + 0.25;
    expect(reflectAt(base, 0.7, t).y).toBeCloseTo(-0.3, 12);
    expect(reflectAt(base, 0.7, 0).y).toBeCloseTo(0.3, 12);
  });

  it('free end: zero slope at L, displacement doubles at the moment of reflection', () => {
    const r: Reflect = { ...base, end: 'free' };
    const h = 1e-6;
    for (const t of [1.5, 1.7, 1.9]) expect((reflectAt(r, 4, t).y - reflectAt(r, 4 - h, t).y) / h).toBeCloseTo(0, 4);
    // pulse peak reaches L when v(t + t0) − v τ/2 = L
    const tp = 4 / 2 + 0.25 - 0.6;
    expect(reflectAt(r, 4, tp).y).toBeCloseTo(0.6, 12);
    const t = (2 * 4 - 0.7) / 2 - 0.6 + 0.25;
    expect(reflectAt(r, 0.7, t).y).toBeCloseTo(0.3, 12);
  });

  it('continuous wave: after 2L/v the string is a standing wave with fixed nodes λ/2 apart', () => {
    for (const end of ['fixed', 'free'] as const) {
      const r: Reflect = { ...base, mode: 'wave', end, A: 0.2, t0: 0 };
      const ns = nodes(r);
      for (let i = 1; i < ns.length; i++) expect(ns[i - 1] - ns[i]).toBeCloseTo(0.8, 12);
      expect(ns[0]).toBeCloseTo(end === 'fixed' ? 4 : 3.6, 12);
      for (const xn of ns) for (const t of [4.1, 4.37, 5.02, 6.6]) expect(reflectAt(r, xn, t).y).toBeCloseTo(0, 12);
      // the displacement never exceeds the envelope 2A|sin k(L−x)| (or |cos|), and reaches it
      for (const x of [0.3, 1.1, 2.5]) {
        let m = 0;
        for (let k = 0; k < 400; k++) m = Math.max(m, Math.abs(reflectAt(r, x, 4.5 + k * 0.002).y));
        expect(m).toBeLessThanOrEqual(envelope(r, x) + 1e-12);
        expect(m).toBeGreaterThan(envelope(r, x) - 1e-3);
      }
    }
  });
});

describe('ch16 resonance', () => {
  const s: Driven = { L: 2, v: 4, beta: 0.3, d: 0.03, N: 100 };

  it('harmonics f_n = n v / 2L; the steady-state curve peaks there', () => {
    expect(harmonic(s, 1)).toBe(1);
    expect(harmonic(s, 3)).toBe(3);
    for (const n of [1, 2, 3, 4]) {
      const peak = resonance(s, n);
      expect(peak).toBeGreaterThan(resonance(s, n - 0.15));
      expect(peak).toBeGreaterThan(resonance(s, n + 0.15));
      expect(peak).toBeGreaterThan(5 * resonance(s, n + 0.5));
      // peak ≈ d v / (β L)
      expect(peak).toBeCloseTo((s.d * s.v) / (s.beta * s.L), 1);
    }
    expect(steadyAmp(s, 1.7, 0)).toBeCloseTo(s.d, 12);
    expect(steadyAmp(s, 1.7, s.L)).toBeCloseTo(0, 12);
  });

  it('finite differences converge to the analytic steady state', () => {
    for (const f of [1.5, 2]) {
      const st = stringInit(s);
      const steps = Math.round(30 / stringStep(s));
      let amp = 0;
      for (let i = 0; i < steps; i++) {
        stringAdvance(s, st, f);
        if (i > steps - Math.round(1 / f / stringStep(s))) amp = Math.max(amp, Math.abs(st.y[Math.round(s.N / 4)]));
      }
      const exact = steadyAmp(s, f, s.L / 4);
      expect(Math.abs(amp - exact) / exact).toBeLessThan(0.03);
      expect(st.y[s.N]).toBe(0);
    }
  });
});

describe('ch16 tab 1 is about reflection (nodes and envelope live in tab 2)', () => {
  class CountDraw extends ProbeDraw {
    circles = 0;
    dashed = 0;
    override circle(): void {
      this.circles++;
    }
    override polyline(...args: unknown[]): void {
      const st = (args[1] ?? {}) as { dash?: number[]; color?: string };
      if (st.dash && st.color === '#8c8c8c') this.dashed++;
    }
  }
  const draw = (p: any, t: number) => {
    const g = new CountDraw(1280, 600);
    g.vp.fit(reflect.world(p), 1280, 600);
    reflect.draw(g, { t }, p, { t, cursorT: t, scrubbing: false, lecture: false });
    return g;
  };

  it('regression: a continuous wave in the steady state draws no node dots and no grey envelope', () => {
    for (const end of ['fixed', 'free']) {
      for (const lambda of [0.4, 1.3, 2.4]) {
        const g = draw({ ...defaults(reflect.params), mode: 'wave', end, lambda }, 12);
        // Only the free-end ring is a circle; before, every node added a black dot.
        expect(g.circles, `${end} ${lambda}`).toBe(end === 'free' ? 1 : 0);
        expect(g.dashed).toBe(0);
      }
    }
  });

  it('continuous wave at the boundary: fixed end at rest, free end swings with 2A', () => {
    for (const end of ['fixed', 'free'] as const) {
      const r: Reflect = { ...base, mode: 'wave', end, A: 0.2, t0: 0 };
      let m = 0;
      for (let k = 0; k < 2000; k++) m = Math.max(m, Math.abs(reflectAt(r, r.L, 4 + k * 0.001).y));
      if (end === 'fixed') expect(m).toBeLessThan(1e-12);
      else expect(m).toBeCloseTo(2 * r.A, 4);
    }
  });

  it('the resonance tab keeps the envelope-and-nodes toggle', () => {
    expect(resonanceScene.params.env.default).toBe(true);
  });
});

describe('ch16 amplitude marker: steady, no phase-dependent wobble (review §0-1)', () => {
  /** Relative half-spread (max − min)/(max + min) of st.amp over the last two periods after 40 s. */
  function wobble(f: number): { now: number; old: number; amp: number } {
    const s = STR;
    const h = stringStep(s);
    const st = stringInit(s);
    const steps = Math.round(40 / h);
    const last = Math.round(2 / f / h);
    let lo = Infinity;
    let hi = 0;
    let oLo = Infinity;
    let oHi = 0;
    for (let i = 0; i < steps; i++) {
      const prev = st.y;
      stringAdvance(s, st, f);
      if (i < steps - last) continue;
      lo = Math.min(lo, st.amp);
      hi = Math.max(hi, st.amp);
      // The old estimate: forward-difference velocity (next − y)/h.
      let a = 0;
      for (let k = 0; k <= s.N; k++) a = Math.max(a, Math.hypot(st.y[k], (st.y[k] - prev[k]) / h / (2 * Math.PI * f)));
      oLo = Math.min(oLo, a);
      oHi = Math.max(oHi, a);
    }
    return { now: (hi - lo) / (hi + lo), old: (oHi - oLo) / (oHi + oLo), amp: (hi + lo) / 2 };
  }

  it('review case: 1 Hz and 4 Hz wobbled ±0.8 % and ±3.1 %, now under 0.05 %', () => {
    const w1 = wobble(1);
    const w4 = wobble(4);
    expect(w1.old).toBeCloseTo(0.008, 3);
    expect(w4.old).toBeCloseTo(0.031, 3);
    expect(w1.now).toBeLessThan(5e-4);
    expect(w4.now).toBeLessThan(5e-4);
  });

  it('sweep over the f slider (0.5–4.5 Hz, harmonics and between): wobble < 0.05 %, level near the resonance curve', () => {
    const p = resonanceScene.params.f as { min: number; max: number };
    for (const f of [p.min, 0.75, 1, 1.5, 2, 2.5, 3, 3.5, 4, 4.25, p.max]) {
      const w = wobble(f);
      expect(w.now).toBeLessThan(5e-4);
      // Finite-difference steady state against the continuous one (grid N = 100).
      expect(Math.abs(w.amp / resonance(STR, f) - 1)).toBeLessThan(0.03);
    }
  });
});

describe('ch16 reflection: the dashed parts stay faint under the solid string (user request 2026-11-19)', () => {
  it('incident and reflected waves are drawn at reduced opacity, the string at full', () => {
    expect(PARTS_ALPHA).toBeGreaterThan(0.2);
    expect(PARTS_ALPHA).toBeLessThanOrEqual(0.5);
  });
});
