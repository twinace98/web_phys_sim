// Regression tests for the 2026-11-11 review fixes in Ch 37–42.
import { describe, expect, it } from 'vitest';
import { Runner } from '../src/core/runner';
import { gamma } from '../src/sims/ch37/physics';
import { groundPosts } from '../src/sims/ch37/scene';
import { EV, ME, deBroglie } from '../src/sims/ch38/physics';
import { deBroglieScene, momentum } from '../src/sims/ch38/scene';
import { HBAR_EVFS, SUP_L_MIN, SUP_U0_MIN, model, pairOf, superposition, supStates } from '../src/sims/ch39/scene';
import { angle } from '../src/sims/ch40/scene';
import { carriersOf, doping } from '../src/sims/ch41/doping';
import { filling } from '../src/sims/ch41/filling';
import { MATERIALS } from '../src/sims/ch41/physics';

describe('ch37 simultaneity: ground posts', () => {
  it('posts 1 ls apart in S, 1/γ ls apart (Lorentz-contracted) in the train frame S′', () => {
    for (const b of [0.1, 0.37, 0.6, 0.8]) {
      const s = groundPosts([-3, 6], 1.3, b, true);
      const sp = groundPosts([-3, 6], 1.3, b, false);
      for (let i = 1; i < s.length; i++) expect(s[i] - s[i - 1]).toBeCloseTo(1, 12);
      for (let i = 1; i < sp.length; i++) expect(sp[i] - sp[i - 1]).toBeCloseTo(1 / gamma(b), 12);
      // The post at x = 0 (the flash point) sits at x′ = −βt′ in S′.
      expect(sp.some((x) => Math.abs(x + b * 1.3) < 1e-12)).toBe(true);
      if (b >= 0.6) expect(sp.length).toBeGreaterThan(s.length);
    }
  });
});

describe('ch38 electron energy slider', () => {
  it('log slider 1–10000 eV; λ falls monotonically and matches h/√(2mK) at low energy', () => {
    const spec = deBroglieScene.params.eK;
    expect(spec.kind === 'number' && spec.control === 'slider' && spec.log && spec.min === 1 && spec.max === 10000).toBe(true);
    let prev = Infinity;
    for (const eK of [1, 3.7, 54, 270, 2300, 10000]) {
      const lam = deBroglie(momentum({ part: 'electron', eK, vn: 2200, vc: 220, vb: 40 }));
      expect(lam).toBeLessThan(prev);
      prev = lam;
      if (eK < 100) expect(lam / (6.62607015e-34 / Math.sqrt(2 * ME * eK * EV))).toBeCloseTo(1, 3);
    }
  });

  it('info equations carry no English words', () => {
    for (const s of [deBroglieScene, superposition]) for (const e of s.info.equations ?? []) expect(e).not.toMatch(/\\text\{\s*[a-z]{2,}/i);
  });
});

describe('ch39 superposition: every pair exists over the whole range', () => {
  const base = { pot: 'infinite', L: 1, U0: 2, hw: 0.2, Ub: 2, b: 0.2, pair: '12', pairH: '01' };
  it('three bound states for every potential at the range corners and in between', () => {
    const Ls = [SUP_L_MIN, 1.05, 1.25, 1.5];
    for (const L of Ls) {
      expect(model({ ...base, L }).st.E.length).toBeGreaterThanOrEqual(3);
      for (const U0 of [SUP_U0_MIN, 1.9, 2.7, 4.5]) expect(model({ ...base, pot: 'finite', L, U0 }).st.E.length).toBeGreaterThanOrEqual(3);
      for (const Ub of [0.5, 4.5]) for (const b of [0.05, 0.5]) expect(model({ ...base, pot: 'double', L, Ub, b }).st.E.length).toBeGreaterThanOrEqual(3);
    }
    for (const hw of [0.1, 0.5]) expect(model({ ...base, pot: 'harmonic', hw }).st.E.length).toBeGreaterThanOrEqual(3);
    const sp = superposition.params;
    expect(sp.L.kind === 'number' && sp.L.min).toBe(SUP_L_MIN);
    expect(sp.U0.kind === 'number' && sp.U0.min).toBe(SUP_U0_MIN);
  });

  it('the selected pair is the one superposed (no substitution), shallowest finite well', () => {
    const p = { ...base, pot: 'finite', L: SUP_L_MIN, U0: SUP_U0_MIN, pair: '23' };
    const m = model(p);
    const q = supStates(m, pairOf(p));
    expect([q.a, q.b]).toEqual([1, 2]);
    expect((2 * Math.PI) / q.w).toBeCloseTo((2 * Math.PI * HBAR_EVFS) / (m.st.E[2] - m.st.E[1]), 10);
  });

  it('oscillator pairs are named by n from 0: "0 + 1" is E₀ + E₁, period h/ħω', () => {
    const p = { ...base, pot: 'harmonic', pairH: '01' };
    const q = supStates(model(p), pairOf(p));
    expect([q.a, q.b]).toEqual([0, 1]);
    expect((2 * Math.PI) / q.w).toBeCloseTo((2 * Math.PI * HBAR_EVFS) / 0.2, 2);
    const q2 = supStates(model(p), pairOf({ ...p, pairH: '12' }));
    expect([q2.a, q2.b]).toEqual([1, 2]);
    // Only one pair selector is visible for each potential.
    const sp = superposition.params;
    expect(sp.pair.visibleIf!(p)).toBe(false);
    expect(sp.pairH.visibleIf!(p)).toBe(true);
    expect(sp.pair.visibleIf!({ ...p, pot: 'double' })).toBe(true);
  });

  it('⟨x⟩ record stays finite for every pair and potential', () => {
    for (const pot of ['infinite', 'finite', 'harmonic', 'double'])
      for (const pr of ['12', '13', '23', '01', '02']) {
        const p = { ...base, pot, pair: pr.startsWith('0') ? '12' : pr, pairH: pr.startsWith('0') ? pr : '12' };
        const r = new Runner(superposition, p as never, 1);
        r.play();
        for (let i = 0; i < 200; i++) r.advance(0.005 / 2);
        for (const v of r.hist.col('xm')) expect(Number.isFinite(v)).toBe(true);
      }
  });
});

describe('ch40 angle scene', () => {
  it('records a finite fraction between 0 and 1 at every angle', () => {
    for (const theta of [0, 35, 90, 145, 180]) {
      const r = new Runner(angle, { theta, N: 100 } as never, 1);
      r.play();
      for (let i = 0; i < 1500 && r.playing; i++) r.advance(1 / 120);
      const col = r.hist.col('frac').filter(Number.isFinite);
      expect(col.length).toBeGreaterThan(0);
      for (const v of col) expect(v >= 0 && v <= 1).toBe(true);
    }
  });
});

describe('ch41 review fixes', () => {
  it('metal: no gap value (prints "–"); semiconductors keep theirs', () => {
    const eg = filling.readouts!.find((r) => r.label.startsWith('E_'))!;
    expect(eg.value({ t: 0 }, { mat: 'metal', T: 300, scale: 'log' })).toBeNaN();
    expect(eg.value({ t: 0 }, { mat: 'si', T: 300, scale: 'log' })).toBeCloseTo(MATERIALS.si.Eg, 6);
  });

  it('impurity concentration is a log slider 10¹⁵–10¹⁷ cm⁻³; n ≈ N_D at in-between values', () => {
    const spec = doping.params.conc;
    expect(spec.kind === 'number' && spec.control === 'slider' && spec.log && spec.min === 1e15 && spec.max === 1e17).toBe(true);
    for (const N of [1e15, 3.2e15, 4.7e16, 1e17]) {
      const c = carriersOf({ type: 'n', T: 300, conc: N });
      expect(c.n / N).toBeGreaterThan(0.9);
      expect(c.n / N).toBeLessThan(1.05);
      const h = carriersOf({ type: 'p', T: 300, conc: N });
      expect(h.p / N).toBeGreaterThan(0.8); // acceptors not fully ionised near 10¹⁷
    }
  });
});
