import { describe, expect, it } from 'vitest';
import { HB2M, finiteWell, infiniteLevel, solve } from '../src/sims/modern/eigen';
import { FINITE_MARGIN, finiteWellCount, forbiddenProbability, wellModel, z0Of, type WellParams } from '../src/sims/ch39/physics';
import { HBAR_EVFS, MIN_AMP_PX, clusterRank, model, supStates, wells } from '../src/sims/ch39/scene';
import { defaults } from '../src/core/params';
import type { Vec2 } from '../src/core/types';
import type { Stroke } from '../src/draw/draw';
import { ROLE_COLOR } from '../src/draw/theme';
import ko from '../src/sims/ch39/i18n.ko.json';
import en from '../src/sims/ch39/i18n.en.json';
import { ProbeDraw } from './stage-probe';

const base: WellParams = { kind: 'infinite', L: 1, U0: 2, hw: 0.2, Ub: 2, b: 0.2 };

describe('ch39 wells', () => {
  it('infinite well defaults: four levels below 7 eV, E_n = n² E_1', () => {
    const m = wellModel(base);
    expect(m.st.E.length).toBe(4);
    m.st.E.forEach((E, k) => expect(E).toBeCloseTo(infiniteLevel(k + 1, 1), 3));
  });

  it('narrower well: wider level spacing (∝ 1/L²)', () => {
    const a = wellModel({ ...base, L: 1 }).st.E;
    const b = wellModel({ ...base, L: 0.5 }).st.E;
    expect((b[1] - b[0]) / (a[1] - a[0])).toBeCloseTo(4, 2);
  });

  it('finite well: deeper → more bound states; the ground state leaks into the barrier', () => {
    const n = (U0: number) => wellModel({ ...base, kind: 'finite', U0 }).st.E.length;
    expect([n(1), n(2), n(4)]).toEqual([2, 3, 4]);
    const m = wellModel({ ...base, kind: 'finite' });
    const leak = forbiddenProbability(m.st, 0);
    expect(leak).toBeGreaterThan(0.01);
    expect(leak).toBeLessThan(0.2);
  });

  it('harmonic: ground state ħω/2 and equal spacing ħω', () => {
    const m = wellModel({ ...base, kind: 'harmonic' });
    expect(m.n0).toBe(0);
    expect(m.st.E[0]).toBeCloseTo(0.1, 4);
    for (let k = 1; k < m.st.E.length; k++) expect(m.st.E[k] - m.st.E[k - 1]).toBeCloseTo(0.2, 3);
  });

  it('double well: lowest two levels form a close pair', () => {
    const E = wellModel({ ...base, kind: 'double' }).st.E;
    expect(E[1] - E[0]).toBeLessThan(0.2 * (E[2] - E[1]));
  });
});

describe('ch39 superposition', () => {
  const p = { pot: 'infinite', L: 1, U0: 2, hw: 0.2, Ub: 2, b: 0.2, pair: '12' };
  it('period T = h/(E2 − E1); ⟨x⟩ oscillates for 1 + 2', () => {
    const m = model(p);
    const q = supStates(m, '12');
    expect((2 * Math.PI) / q.w).toBeCloseTo((2 * Math.PI * HBAR_EVFS) / (m.st.E[1] - m.st.E[0]), 10);
    // Infinite well: ⟨x⟩ amplitude = 16 L / (9π²).
    expect(Math.abs(q.xc)).toBeCloseTo(16 / (9 * Math.PI ** 2), 3);
    expect(q.xm).toBeCloseTo(0, 6);
  });

  it('1 + 3 in a symmetric well: ⟨x⟩ stays at 0 (same parity)', () => {
    const q = supStates(model(p), '13');
    expect(q.xc).toBeCloseTo(0, 6);
  });

  it('guard: an index past the last state (unreachable from the controls) is clamped, never read out of range', () => {
    const m = model({ ...p, pot: 'finite', U0: 1, L: 0.5 });
    expect(m.st.E.length).toBe(1);
    const q = supStates(m, '23');
    expect(q.a).toBe(0);
    expect(q.b).toBe(0);
    expect(q.w).toBe(0);
  });
});

describe('ch39 finite well: exact bound states', () => {
  const fin = (L: number, U0: number) => wellModel({ ...base, kind: 'finite', L, U0 });

  it('the diagram shows exactly ⌈2 z0/π⌉ levels over every slider combination (before: 37 of 861 missed one)', () => {
    const miss: string[] = [];
    for (let i = 0; i <= 20; i++) {
      for (let j = 0; j <= 40; j++) {
        const L = Number((0.5 + 0.05 * i).toFixed(2));
        const U0 = Number((0.5 + 0.1 * j).toFixed(1));
        const n = fin(L, U0).st.E.length;
        if (n !== finiteWellCount(L, U0)) miss.push(`L=${L} U0=${U0}: ${n} vs ${finiteWellCount(L, U0)}`);
      }
    }
    expect(miss).toEqual([]);
    // The case the old box-bounded solver lost: a fourth level bound by 0.4 meV.
    const E = fin(1, 3.4).st.E;
    expect(E.length).toBe(4);
    expect(3.4 - E[3]).toBeGreaterThan(0);
    expect(3.4 - E[3]).toBeLessThan(1e-3);
  });

  it('energies satisfy the matching conditions and agree with the grid solver for well-bound states', () => {
    for (const [L, U0] of [[1, 2], [0.5, 4.5], [1.5, 0.5], [1.5, 4.5]]) {
      const { E } = fin(L, U0).st;
      const a = L / 2;
      const z0 = z0Of(L, U0);
      E.forEach((En, k) => {
        const z = a * Math.sqrt(En / HB2M);
        const w = Math.sqrt(z0 * z0 - z * z);
        // Even (k = 0, 2, …): z tan z = w; odd: −z cot z = w.
        const g = k % 2 === 0 ? z * Math.sin(z) - w * Math.cos(z) : z * Math.cos(z) + w * Math.sin(z);
        expect(Math.abs(g)).toBeLessThan(1e-9);
      });
      const num = solve(finiteWell(L, U0, FINITE_MARGIN), 2400, 8, HB2M, U0).E;
      E.forEach((En, k) => {
        if (U0 - En > 0.1) expect(Math.abs(num[k] - En)).toBeLessThan(2e-3);
      });
    }
  });

  it('ψ: normalised over all x (grid sum ≈ 1 for well-bound states), orthogonal, parity alternates', () => {
    const { st } = fin(1, 4.5);
    const dot = (p: Float64Array, q: Float64Array) => p.reduce((s, v, i) => s + v * q[i], 0) * st.dx;
    st.psi.forEach((p, k) => {
      if (4.5 - st.E[k] > 0.2) expect(dot(p, p)).toBeCloseTo(1, 4);
      for (let j = 0; j < k; j++) expect(Math.abs(dot(p, st.psi[j]))).toBeLessThan(1e-3);
      // Mirror pair: x[i] = −x[n−1−i] (the grid has no point at x = 0).
      const i = 1000;
      const sym = p[i] / p[p.length - 1 - i];
      expect(sym).toBeCloseTo(k % 2 === 0 ? 1 : -1, 6);
    });
  });
});

describe('ch39 level labels near the top of a finite well', () => {
  it('a level bound by 0.4 meV prints below U0 (3.3996, not 3.40); ordinary levels keep 3 figures', async () => {
    const { levelText } = await import('../src/sims/ch39/scene');
    const E = wellModel({ ...base, kind: 'finite', L: 1, U0: 3.4 }).st.E;
    expect(levelText(E[3], 3.4)).toBe('3.3996');
    expect(levelText(E[0], 3.4)).toBe('0.255');
    expect(levelText(2.18, Infinity)).toBe('2.18');
  });
});

describe('ch39 wells: every wavefunction stays visible (review 2026-11-17, §0-1)', () => {
  /** Records ψ polylines (stage px) and text marks. */
  class WaveProbe extends ProbeDraw {
    readonly waves: { pts: [number, number][]; dash: boolean }[] = [];
    // The base polyline takes no arguments (it records nothing): read them through a rest parameter.
    polyline(...a: unknown[]): void {
      const [pts, st] = a as [Vec2[], Stroke | undefined];
      if (st?.color === ROLE_COLOR.position) this.waves.push({ pts: pts.map((q) => this.vp.toPx(q.x, q.y)), dash: !!st.dash });
    }
  }
  /** Stage sizes measured in the browser: 1280 × 800 and 390 × 844 windows. */
  const STAGES = [
    [1280, 704],
    [390, 680],
  ] as const;
  const draw = (over: Record<string, unknown>, w: number, h: number) => {
    const p = { ...defaults(wells.params), ...over } as never;
    const g = new WaveProbe(w, h);
    g.vp.fit(wells.world(p), w, h);
    wells.draw(g, { t: 0 }, p, { t: 0, cursorT: 0, scrubbing: false, lecture: false });
    return g;
  };
  const tall = (pts: [number, number][]) => Math.max(...pts.map((q) => q[1])) - Math.min(...pts.map((q) => q[1]));
  const grid = (lo: number, hi: number, n: number) => Array.from({ length: n + 1 }, (_, i) => Number((lo + ((hi - lo) * i) / n).toFixed(2)));

  const cases: Record<string, unknown>[] = [];
  for (const L of grid(0.5, 1.5, 20)) cases.push({ pot: 'infinite', L });
  for (const L of grid(0.5, 1.5, 4)) for (const U0 of grid(0.5, 4.5, 8)) cases.push({ pot: 'finite', L, U0 });
  for (const hw of grid(0.1, 0.5, 8)) cases.push({ pot: 'harmonic', hw });
  for (const L of grid(0.5, 1.5, 4)) for (const Ub of grid(0.5, 4.5, 8)) for (const b of [0.05, 0.1, 0.2, 0.35, 0.5]) cases.push({ pot: 'double', L, Ub, b });

  it(`review case (double, L = 1.5 nm, U_b = 4.5 eV, b = 0.5 nm): ψ at least ${MIN_AMP_PX} px tall (before 0.3 px), pairs dashed`, () => {
    for (const [w, h] of STAGES) {
      const g = draw({ pot: 'double', L: 1.5, Ub: 4.5, b: 0.5 }, w, h);
      expect(g.waves.length).toBe(8);
      for (const wv of g.waves) expect(tall(wv.pts)).toBeGreaterThan(MIN_AMP_PX - 0.5);
      expect(g.waves.map((wv) => wv.dash)).toEqual([false, true, false, true, false, true, false, true]);
    }
  });

  it(`sweep: every well, slider ends and in-between, ψ and |ψ|², 1280 and 390 px: no curve under ${MIN_AMP_PX} px, labels never overlap`, () => {
    const low: string[] = [];
    for (const c of cases) {
      for (const show of ['psi', 'prob']) {
        for (const [w, h] of STAGES) {
          const g = draw({ ...c, show }, w, h);
          g.waves.forEach((wv, k) => {
            if (tall(wv.pts) < MIN_AMP_PX - 0.5) low.push(`${JSON.stringify(c)} ${show} ${w}: ψ${k} ${tall(wv.pts).toFixed(1)} px`);
            // Inside the frame (box t = 30, b = h − 34): the odd partner of the ground pair dips below its level.
            const ys = wv.pts.map((q) => q[1]);
            if (Math.max(...ys) > h - 34 + 0.5 || Math.min(...ys) < 30 - 0.5) low.push(`${JSON.stringify(c)} ${show} ${w}: ψ${k} leaves the frame`);
          });
          const ys = g.marks.filter((m) => m.kind === 'text' && /eV$/.test(m.text ?? '')).map((m) => m.y);
          for (let i = 1; i < ys.length; i++) if (ys[i - 1] - ys[i] < 13.9) low.push(`${JSON.stringify(c)} ${w}: labels ${i - 1}, ${i} overlap`);
          for (const y of ys) if (y < 6) low.push(`${JSON.stringify(c)} ${w}: label off the top at ${y.toFixed(0)}`);
        }
      }
    }
    expect(low).toEqual([]);
  });

  it('only the double well pairs levels (dashed partner); the other wells draw every ψ solid', () => {
    for (const c of cases) {
      const m = model({ ...defaults(wells.params), ...c } as never);
      const rank = clusterRank(m.st.E, m.yr[1] - m.yr[0]);
      if (c.pot !== 'double') expect(rank.every((r) => r === 0), JSON.stringify(c)).toBe(true);
      expect(Math.max(...rank), JSON.stringify(c)).toBeLessThanOrEqual(1);
    }
  });
});

describe('ch39 ⓘ names the method each potential uses (review 2026-11-20)', () => {
  const wp = (kind: WellParams['kind'], over: Partial<WellParams> = {}): WellParams => ({ kind, L: 1, U0: 2, hw: 0.2, Ub: 2, b: 0.2, ...over });

  it('finite well: exact roots (z0 from L and U0), not a 2.5 nm box; the others by finite differences on 1500–2400 points', () => {
    for (const [L, U0] of [
      [0.5, 0.5],
      [1, 2],
      [1.5, 4.5],
    ]) {
      const m = wellModel(wp('finite', { L, U0 }));
      // Exact: the levels solve the even/odd transcendental equations, z = (L/2)√(E/C).
      for (const [k, E] of m.st.E.entries()) {
        const z = (L / 2) * Math.sqrt(E / HB2M);
        const w = Math.sqrt(z0Of(L, U0) ** 2 - z * z);
        const r = k % 2 === 0 ? z * Math.tan(z) - w : -z / Math.tan(z) - w;
        expect(Math.abs(r), `L=${L} U0=${U0} n=${k + 1}`).toBeLessThan(1e-9);
      }
      expect(m.st.E.length).toBe(finiteWellCount(L, U0));
    }
    expect(wellModel(wp('infinite')).st.x.length).toBe(1500);
    expect(wellModel(wp('double')).st.x.length).toBe(1500);
    const h = wellModel(wp('harmonic', { hw: 0.1 }));
    expect(h.st.x.length).toBe(2400);
    // Hard walls at ±7 nm, outside the plotted ±4 nm.
    expect([h.pot.x0, h.pot.x1]).toEqual([-7, 7]);
    expect(h.xr).toEqual([-4, 4]);
    // The double well's outer hard walls are drawn.
    const d = wellModel(wp('double'));
    expect(d.walls).toEqual([d.pot.x0, d.pot.x1]);
  });

  it('the strings say so in ko and en; no ch39 string describes the old 2.5 nm finite-difference box', () => {
    expect(ko['ch39.assume.fd']).toContain('유한 우물·이중 우물은 정확한 해');
    expect(en['ch39.assume.fd']).toContain('the finite and double wells use exact solutions');
    for (const dict of [ko, en] as Record<string, string>[]) for (const [k, v] of Object.entries(dict)) expect(v, k).not.toContain('2.5 nm');
  });
});

describe('ch39 QA 2026-11-24 (P3)', () => {
  it('double well: exact levels agree with a 16× finer grid (the 1500-point grid was 0.3 % off: ΔE 0.321 vs 0.3218 meV)', () => {
    for (const [L, Ub, b] of [
      [1.5, 4.5, 0.5],
      [1, 2, 0.2],
      [0.5, 0.5, 0.05],
      [1.5, 0.5, 0.05],
      [0.5, 4.5, 0.5],
      [1.2, 1.7, 0.3],
    ]) {
      const m = wellModel({ kind: 'double', L, U0: 2, hw: 0.2, Ub, b });
      const fine = solve(m.pot, 24000, 8, HB2M, 4.75).E;
      expect(m.st.E.length, `${L} ${Ub} ${b}`).toBe(fine.length);
      m.st.E.forEach((E, k) => expect(Math.abs(E - fine[k]), `${L} ${Ub} ${b} E${k + 1}`).toBeLessThan(4e-5));
      // ψ orthonormal on the grid.
      const dot = (p: Float64Array, q: Float64Array) => p.reduce((s, v, i) => s + v * q[i], 0) * m.st.dx;
      m.st.psi.forEach((p, k) => {
        expect(dot(p, p)).toBeCloseTo(1, 9);
        for (let j = 0; j < k; j++) expect(Math.abs(dot(p, m.st.psi[j]))).toBeLessThan(1e-6);
      });
    }
    const E = wellModel({ kind: 'double', L: 1.5, U0: 2, hw: 0.2, Ub: 4.5, b: 0.5 }).st.E;
    expect(((E[1] - E[0]) * 1000).toFixed(4)).toBe('0.3218');
  });

  it('superposition clock: decimals from the run length (35990 fs, not 35989.8; 1.37 fs periods keep 2 decimals); the step button still moves T/14', async () => {
    const { clockDecimals } = await import('../src/core/format');
    const { timeWindow } = await import('../src/core/types');
    const { superposition, supDt, supPeriod } = await import('../src/sims/ch39/scene');
    const p0 = defaults(superposition.params) as never as Record<string, unknown>;
    const tm = superposition.time!;
    const dec = (over: Record<string, unknown>) => clockDecimals(tm.frameStep, timeWindow(tm, { ...p0, ...over } as never));
    expect(dec({ pot: 'double', L: 1.5, Ub: 4.5, b: 0.5 })).toBe(0);
    expect(dec({ pot: 'double' })).toBe(0);
    expect(dec({ pair: '13' })).toBe(2);
    for (const over of [{}, { pot: 'double', L: 1.5, Ub: 4.5, b: 0.5 }, { pair: '13' }]) {
      const p = { ...p0, ...over } as never;
      expect((Math.round(tm.frameStep / tm.h) * supDt(p)) / supPeriod(p)).toBeCloseTo(1 / 14, 2);
    }
  });

  it('superposition: the x label sits under the tick numbers, outside the frame (it lay on the ground pair at 390 px)', async () => {
    const { superposition } = await import('../src/sims/ch39/scene');
    for (const [w, h] of [
      [1280, 704],
      [390, 680],
    ]) {
      const p = { ...defaults(superposition.params), pot: 'double', L: 1.5, Ub: 4.5, b: 0.5 } as never;
      const g = new ProbeDraw(w, h);
      g.vp.fit(superposition.world(p), w, h);
      superposition.draw(g, { t: 0, n: 0 }, p, { t: 0, cursorT: 0, scrubbing: false, lecture: false });
      const xl = g.marks.find((m) => m.kind === 'text' && /\(nm\)/.test(m.text ?? ''));
      expect(xl, `${w}`).toBeDefined();
      expect(xl!.y).toBeGreaterThan(h - 34 + 15);
    }
  });

  it('ⓘ: nodes counted correctly per potential; symbols δ, z₀, x̄, A defined; no "E₁, E₂ look equal"', () => {
    expect(ko['ch39.w.obs.nodes']).toContain('$n - 1$개 ($n = 1, 2, 3, \\dots$)');
    expect(ko['ch39.w.obs.nodes']).toContain('조화 퍼텐셜은 $n$개');
    expect(en['ch39.w.obs.nodes']).toContain('the oscillator\'s $E_n$ has $n$');
    expect(wells.info.assumptions).toContain('ch39.w.assume.sym');
    for (const d of [ko, en] as Record<string, string>[]) {
      for (const s of ['\\delta', 'z_0']) expect(d['ch39.w.assume.sym']).toContain(s);
      for (const s of ['\\bar x', '$A$']) expect(d['ch39.s.assume.mean']).toContain(s);
    }
    expect(ko['ch39.s.assume.time']).not.toContain('같게 보임');
    expect(en['ch39.s.assume.time']).not.toContain('look equal');
    // Interior nodes of ψ: E_n (n from 1) has n − 1, the oscillator's E_n has n.
    const nodes = (psi: Float64Array) => {
      let c = 0;
      const peak = Math.max(...psi.map(Math.abs));
      let last = 0;
      for (const v of psi) {
        if (Math.abs(v) < 1e-3 * peak) continue;
        if (last && Math.sign(v) !== last) c++;
        last = Math.sign(v);
      }
      return c;
    };
    for (const kind of ['infinite', 'finite', 'double', 'harmonic'] as const) {
      const m = wellModel({ kind, L: 1, U0: 4, hw: 0.2, Ub: 2, b: 0.2 });
      m.st.psi.forEach((p, k) => expect(nodes(p), `${kind} E${k + m.n0}`).toBe(k));
    }
  });
});
