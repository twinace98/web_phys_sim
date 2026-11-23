import { describe, expect, it } from 'vitest';
import { defaults } from '../src/core/params';
import { Rng } from '../src/core/rng';
import { Runner } from '../src/core/runner';
import {
  entropyLR,
  exchange,
  fillUniform,
  initParticles,
  kTeps,
  leftCount,
  lnBinom,
  lnFact,
  lnOmega,
  moveParticles,
  mostProbable,
  sumRange,
} from '../src/sims/ch20/physics';
import { FLOW_OFF, FLOW_ON, departure, eqTails, heatScene, tangentSlopes, temps } from '../src/sims/ch20/heat';
import en20 from '../src/sims/ch20/i18n.en.json';
import ko20 from '../src/sims/ch20/i18n.ko.json';
import { BAR_TITLE, barItems, carnotScene, heatsAt } from '../src/sims/ch20/carnot';
import { dofOf } from '../src/sims/ch18/process';
import { expansionScene } from '../src/sims/ch20/expansion';
import { probe } from './stage-probe';
import { cycle, entropy, heatSplit, temp } from '../src/sims/ch18/physics';

describe('ch20 counting', () => {
  it('ln n! and binomials are exact for small n', () => {
    expect(Math.exp(lnFact(10))).toBeCloseTo(3628800, 4);
    expect(Math.exp(lnBinom(4, 2))).toBeCloseTo(6, 10);
    expect(Math.exp(lnBinom(10, 5))).toBeCloseTo(252, 8);
    expect(lnBinom(5, 7)).toBe(-Infinity);
    // Σ C(N, n) = 2^N
    let s = 0;
    for (let n = 0; n <= 20; n++) s += Math.exp(lnBinom(20, n));
    expect(s).toBeCloseTo(2 ** 20, 3);
  });

  it('entropy of the all-left state is zero and is largest at n = N/2', () => {
    for (const N of [4, 10, 100, 1000]) {
      expect(entropyLR(N, N)).toBeCloseTo(0, 9);
      expect(entropyLR(N, N / 2)).toBeGreaterThan(entropyLR(N, N / 2 - 1));
    }
    // Stirling: ln C(N, N/2) ≈ N ln 2 − ½ ln(πN/2)
    expect(entropyLR(1000, 500)).toBeCloseTo(1000 * Math.LN2 - 0.5 * Math.log((Math.PI * 1000) / 2), 2);
  });

  it('Einstein solid: Ω(N, q) = C(q + N − 1, q); Ω(3, 2) = 6', () => {
    expect(Math.exp(lnOmega(3, 2))).toBeCloseTo(6, 10);
    expect(Math.exp(lnOmega(4, 3))).toBeCloseTo(20, 10);
    expect(lnOmega(30, 0)).toBe(0);
  });

  it('kT/ε = 1/ln(1 + N/q) matches the slope of the exact entropy for large N, q', () => {
    const N = 2000;
    const q = 3000;
    const slope = (lnOmega(N, q + 1) - lnOmega(N, q - 1)) / 2;
    expect(1 / slope).toBeCloseTo(kTeps(N, q), 2);
  });

  it('most probable split puts the energy in proportion to the sizes (equal temperatures)', () => {
    const qa = mostProbable(30, 70, 100);
    expect(Math.abs(qa - 30)).toBeLessThanOrEqual(1);
    expect(kTeps(30, qa)).toBeCloseTo(kTeps(70, 100 - qa), 1);
    expect(mostProbable(50, 50, 100)).toBe(50);
  });
});

describe('ch20 dynamics', () => {
  it('free expansion: all start left, then about half are left, and particles stay in the box', () => {
    const p = initParticles(1000, new Rng(2));
    expect(leftCount(p)).toBe(1000);
    for (let i = 0; i < 1200; i++) moveParticles(p, 1 / 60);
    const n = leftCount(p);
    expect(Math.abs(n - 500)).toBeLessThan(80);
    for (let i = 0; i < p.N; i++) {
      expect(p.x[i]).toBeGreaterThanOrEqual(0);
      expect(p.x[i]).toBeLessThanOrEqual(2);
      expect(p.y[i]).toBeGreaterThanOrEqual(0);
      expect(p.y[i]).toBeLessThanOrEqual(1);
    }
  });

  it('fillUniform places exactly q quanta in the range; exchanges conserve the total', () => {
    const rng = new Rng(9);
    const osc = new Int32Array(100);
    fillUniform(osc, 0, 30, 100, rng);
    expect(sumRange(osc, 0, 30)).toBe(100);
    expect(sumRange(osc, 30, 100)).toBe(0);
    for (let i = 0; i < 5000; i++) exchange(osc, rng);
    expect(sumRange(osc, 0, 100)).toBe(100);
    for (const v of osc) expect(v).toBeGreaterThanOrEqual(0);
  });

  it('random exchange makes q_A relax to the most probable value (time average)', () => {
    const rng = new Rng(4);
    const osc = new Int32Array(100);
    fillUniform(osc, 0, 30, 100, rng);
    for (let i = 0; i < 20000; i++) exchange(osc, rng);
    let mean = 0;
    const n = 2000;
    for (let k = 0; k < n; k++) {
      for (let i = 0; i < 50; i++) exchange(osc, rng);
      mean += sumRange(osc, 0, 30) / n;
    }
    // Mean of q_A over microstates is q N_A / N = 30.
    expect(Math.abs(mean - 30)).toBeLessThan(2);
  });

  it('heat scene: same seed, same run', () => {
    const run = () => {
      const r = new Runner(heatScene, defaults(heatScene.params), 1);
      r.play();
      for (let i = 0; i < 50; i++) r.advance(0.1);
      return r.state.qA;
    };
    expect(run()).toBe(run());
  });

  // Review 2026-11-20 P2: after equilibrium the arrow still showed 30–44 % of the time at N_A = 10,
  // biased B → A. Cause: the 30 % rule on the displayed temperatures; kT/ε = 1/ln(1 + N/q̄) bends
  // down at small q̄ and the rule divides by the larger temperature, so a small, cold-side
  // fluctuation of A passes it more often (the exchange itself is unbiased: ⟨q_A⟩ = q N_A/N).
  it('regression: N_A = 10, q = 100 at equilibrium: arrow absent nearly always, no B → A bias', () => {
    const p = { ...defaults(heatScene.params), na: 10, q: 100 };
    let n = 0;
    let ab = 0;
    let ba = 0;
    let oldOn = 0;
    for (let seed = 1; seed <= 8; seed++) {
      const r = new Runner(heatScene, p, seed);
      r.play();
      let of = 0;
      for (let i = 0; i < 180 * 30; i++) {
        r.advance(1 / 30);
        // The former rule, replayed on the same q̄_A (without its 1 s dwell): ≥ 30 % apart → shown.
        const [tA, tB] = temps(p, r.state.qSmooth);
        const rd = (tA - tB) / Math.max(tA, tB);
        if (Math.abs(rd) > 0.3) of = Math.sign(rd);
        else if (Math.abs(rd) < 0.15 || Math.sign(rd) !== of) of = 0;
        if (r.state.t < 60) continue;
        n++;
        if (r.state.flow > 0) ab++;
        if (r.state.flow < 0) ba++;
        if (of) oldOn++;
      }
    }
    expect(oldOn / n).toBeGreaterThan(0.2);
    expect((ab + ba) / n).toBeLessThan(0.01);
    expect(ba / n).toBeLessThan(0.005);
  });

  it('heat scene: defaults, all quanta in A or in B: the real initial flow shows from t = 0, hot → cold, then goes', () => {
    for (const start of ['A', 'B']) {
      const p = { ...defaults(heatScene.params), start };
      const dir = start === 'A' ? 1 : -1;
      let late = 0;
      let n = 0;
      for (let seed = 1; seed <= 8; seed++) {
        const r = new Runner(heatScene, p, seed);
        expect(r.state.flow).toBe(dir);
        r.play();
        for (let i = 0; i < 120 * 30; i++) {
          r.advance(1 / 30);
          // Shown for at least the first second, never the wrong way while the solids relax.
          if (r.state.t <= 1) expect(r.state.flow).toBe(dir);
          if (r.state.t < 20) expect(r.state.flow).not.toBe(-dir);
          if (r.state.t > 30) {
            n++;
            if (r.state.flow) late++;
          }
        }
      }
      expect(late / n).toBeLessThan(0.01);
    }
  });

  it('sweep: N_A 10–90 × q 20–200 × start A/B: arrow only hot → cold, shown at t = 0 iff the start is a rare fluctuation', () => {
    for (const na of [10, 11, 30, 50, 89, 90])
      for (const q of [20, 100, 200])
        for (const start of ['A', 'B']) {
          const p = { ...defaults(heatScene.params), na, q, start };
          const { lo, hi } = eqTails(p);
          // Exact tails: complete, and the mean is q N_A / N.
          expect(lo[q]).toBeCloseTo(1, 12);
          expect(hi[0]).toBeCloseTo(1, 12);
          let mean = 0;
          for (let a = 0; a <= q; a++) mean += a * (lo[a] - (a ? lo[a - 1] : 0));
          expect(mean).toBeCloseTo((q * na) / 100, 9);
          for (let seed = 1; seed <= 2; seed++) {
            const r = new Runner(heatScene, p, seed);
            const q0 = r.state.qA;
            const rare = start === 'A' ? hi[q0] < FLOW_ON : lo[q0] < FLOW_ON;
            expect(r.state.flow).toBe(rare ? (start === 'A' ? 1 : -1) : 0);
            r.play();
            let flips = 0;
            let prev = r.state.flow;
            for (let i = 0; i < 40 * 30; i++) {
              r.advance(1 / 30);
              const f = r.state.flow;
              if (f) {
                const [tA, tB] = temps(p, r.state.qSmooth);
                expect(Math.sign(tA - tB)).toBe(f);
                expect(Math.sign(r.state.qSmooth - (q * na) / 100)).toBe(f);
                // Still beyond the FLOW_OFF tail on its side.
                expect(departure(p, r.state.qSmooth, FLOW_OFF)).toBe(f);
              }
              if (f !== prev) flips++;
              prev = f;
            }
            expect(flips).toBeLessThan(8);
          }
        }
  });

  it('ⓘ: net flow from the solid that starts with the quanta (not always A → B); the arrow rule as coded', () => {
    expect(ko20['ch20.h.obs.flow']).not.toContain('A에서 B로');
    expect(en20['ch20.h.obs.flow']).not.toContain('from A to B');
    for (const [lang, word] of [
      [ko20, '처음 양자를 모두 가진 고체'],
      [en20, 'starts with all the quanta'],
    ] as const)
      expect(lang['ch20.h.obs.flow']).toContain(word);
    for (const lang of [ko20, en20] as Record<string, string>[]) {
      const s = lang['ch20.h.assume.arrow'];
      expect(s).toContain(`${100 * FLOW_ON} %`);
      expect(s).toContain(`${100 * FLOW_OFF} %`);
      expect(s).toContain('15 %');
    }
    // The quoted case: N_A = 10, q = 20, all in B: q_A = 0 is 15 % of equilibrium.
    expect(eqTails({ ...defaults(heatScene.params), na: 10, q: 20 }).lo[0]).toBeCloseTo(0.146, 3);
  });

  it('heat scene: displayed temperatures are equal at the mean equilibrium share q_A = N_A q / N', () => {
    for (const na of [10, 30, 90]) {
      const p = { ...defaults(heatScene.params), na, q: 100 };
      const [tA, tB] = temps(p, (na * 100) / 100);
      expect(tA).toBeCloseTo(tB, 10);
    }
  });
});

describe('ch20 Carnot cycle', () => {
  it('Q_C/Q_H = T_C/T_H, ΔS over the cycle is zero, efficiency 1 − T_C/T_H', () => {
    for (const f of [3, 5]) {
      for (const tc of [200, 300, 400]) {
        const c = cycle('carnot', true, f, tc);
        const { qin, qout } = heatSplit(c.legs, f);
        expect(qout / qin).toBeCloseTo(tc / 600, 9);
        expect((qin - qout) / qin).toBeCloseTo(1 - tc / 600, 9);
        const A = c.corners[0];
        expect(entropy(c.corners[1], A, f)).toBeCloseTo(qin / 600, 9);
        expect(entropy(c.corners[2], A, f)).toBeCloseTo(qin / 600, 9);
        expect(entropy(c.corners[3], A, f)).toBeCloseTo(0, 9);
        expect(temp(c.corners[2])).toBeCloseTo(tc, 9);
      }
    }
  });
});

describe('ch20 free expansion: the user removes the partition', () => {
  const run = (open: boolean, steps: number) => {
    const p = defaults(expansionScene.params);
    const r = new Runner(expansionScene, p, 7);
    if (open) r.state.open = true;
    r.play();
    for (let i = 0; i < steps; i++) r.advance(1 / 60);
    return r;
  };

  it('with the partition in place the gas stays on the left (n = N, S = 0) while it runs', () => {
    const r = run(false, 1200);
    expect(r.state.open).toBe(false);
    expect(r.state.n).toBe(10);
    for (let i = 0; i < r.state.part.N; i++) expect(r.state.part.x[i]).toBeLessThanOrEqual(1);
    expect(Math.max(...r.hist.col('S'))).toBe(0);
  });

  it('a tap on the button or on the partition removes it; then the gas spreads towards N/2', () => {
    const p = defaults(expansionScene.params);
    const r = new Runner(expansionScene, p, 7);
    const g = probe(expansionScene, r.state, p, 1280, 520);
    expect(g).toBeTruthy();
    const hs = expansionScene.handles!;
    expect(hs.every((h) => h.when?.(p) ?? true)).toBe(true);
    // Both handles sit on the stage.
    for (const h of hs) {
      const [x, y] = g.vp.toPx(h.pos(r.state, p).x, h.pos(r.state, p).y);
      expect(x > 0 && x < 1280 && y > 0 && y < 520).toBe(true);
    }
    hs[0].onTap!(r.ctx(() => {}), r.state);
    expect(r.state.open).toBe(true);
    probe(expansionScene, r.state, p, 1280, 520);
    expect(hs.every((h) => !(h.when?.(p) ?? true))).toBe(true);
    r.play();
    for (let i = 0; i < 1800; i++) r.advance(1 / 60);
    const n = r.hist.col('n');
    const late = n.slice(-200);
    const mean = late.reduce((a, b) => a + b, 0) / late.length;
    expect(mean).toBeGreaterThan(3);
    expect(mean).toBeLessThan(7);
  });

  it('reset puts the partition back', () => {
    const r = run(true, 60);
    r.reset();
    expect(r.state.open).toBe(false);
    expect(r.state.n).toBe(10);
  });
});

describe('ch20 Carnot bars: first law at every point of the cycle', () => {
  it('W = Q_H − Q_C − ΔE_int all along the cycle; ΔE_int = 0 only when the loop closes', () => {
    for (const gas of ['mono', 'di']) {
      const f = dofOf(gas);
      for (const tc of [150, 300, 500]) {
        const c = cycle('carnot', true, f, tc);
        for (let i = 0; i <= 100; i++) {
          const h = heatsAt(c.legs, i / 100, f);
          expect(h.W).toBeCloseTo(h.qh - h.qc - h.dE, 6);
        }
        expect(heatsAt(c.legs, 1, f).dE).toBeCloseTo(0, 6);
        // After the adiabatic expansion the work exceeds the heat taken in.
        const mid = heatsAt(c.legs, 0.5, f);
        expect(mid.W).toBeGreaterThan(mid.qh);
        expect(mid.dE).toBeLessThan(0);
      }
    }
  });

  it('the bars and their title satisfy the first law at C (end of the adiabatic expansion), defaults: W 2886, Q_H 1386, ΔE_int −1500', () => {
    const p = defaults(carnotScene.params);
    expect(BAR_TITLE).toContain('Δ*E*_{int}');
    const items = barItems(p, 0.5);
    expect(items.map((b) => b[2])).toEqual(['*W*', '*Q*_{H}', '*Q*_{C}', 'Δ*E*_{int}']);
    const [W, qh, qc, dE] = items.map((b) => b[0]);
    expect(Math.round(W)).toBe(2886);
    expect(Math.round(qh)).toBe(1386);
    expect(Math.round(dE)).toBe(-1500);
    expect(W).toBeCloseTo(qh - qc - dE, 6);
    // The scene draws without error at every stage of the cycle.
    for (const t of [0, 2, 4, 6, 8]) probe(carnotScene, { t }, p, 1280, 700);
  });
});

describe('ch20 heat flow: tangents', () => {
  it('tangent slopes are the slopes of the drawn S curves (central difference within 5 %) at every q_A', () => {
    for (const [na, q] of [
      [10, 20],
      [30, 100],
      [90, 20],
      [10, 200],
    ]) {
      const p = { na, q, start: 'A' };
      const S = (N: number, k: number) => lnOmega(N, k);
      for (let qA = 1; qA < q; qA++) {
        const [kA, kB] = tangentSlopes(p, qA);
        const cA = (S(na, qA + 1) - S(na, qA - 1)) / 2;
        const cB = (S(100 - na, q - qA - 1) - S(100 - na, q - qA + 1)) / 2;
        expect(Math.abs(kA / cA - 1), `N_A ${na}, q ${q}, q_A ${qA}`).toBeLessThan(0.05);
        expect(Math.abs(kB / cB - 1), `N_A ${na}, q ${q}, q_A ${qA}`).toBeLessThan(0.05);
      }
    }
  });

  it('N_A = 10, q = 20: at the top (q_A = 1) the two tangents differ by about 12 %, as the info panel says', () => {
    const p = { na: 10, q: 20, start: 'A' };
    expect(mostProbable(10, 90, 20)).toBe(1);
    const [kA, kB] = tangentSlopes(p, 1);
    expect(Math.abs(kA / -kB - 1)).toBeCloseTo(0.124, 2);
  });
});

describe('Ch 20 free expansion: the entropy shown is a change from the all-left state', () => {
  it('plot and readout are labelled ΔS (S = 0 at Ω = 1 is a reference, not the absolute entropy)', () => {
    const plot = expansionScene.plots!.find((pl) => pl.id === 'S')!;
    expect(plot.label).toContain('\\Delta S');
    expect(expansionScene.readouts!.map((r) => r.label)).toContain('\\Delta S/k');
    expect(expansionScene.info!.assumptions).toContain('ch20.e.assume.ref');
  });

  it('ΔS_max = ln C(N, N/2) approaches the thermodynamic N ln 2 (N = 1000: 689.47 vs 693.15)', () => {
    const N = 1000;
    const p = { ...(defaults(expansionScene.params) as any), N };
    const [, hi] = expansionScene.plots!.find((pl) => pl.id === 'S')!.yRange(p);
    const Smax = hi / 1.15;
    expect(Smax).toBeCloseTo(689.4673, 3);
    expect(Smax).toBeCloseTo(N * Math.log(2) - 0.5 * Math.log((Math.PI * N) / 2), 3);
    expect(N * Math.log(2) - Smax).toBeLessThan(0.006 * N * Math.log(2));
  });
});
