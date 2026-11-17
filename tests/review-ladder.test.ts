// Addition under review: static equilibrium of a ladder (→ Ch 12).
import { describe, expect, it } from 'vitest';
import { defaults } from '../src/core/params';
import { Rng } from '../src/core/rng';
import type { Params } from '../src/core/types';
import page from '../src/sims/review/ladder';
import { G, criticalAngle, criticalPosition, equilibrium, residuals, type LadderInput } from '../src/sims/review/ladder/physics';
import { L, input, ladderScene } from '../src/sims/review/ladder/scene';

const DEG = Math.PI / 180;

function randomInputs(n: number, seed = 5): LadderInput[] {
  const rng = new Rng(seed);
  const u = (a: number, b: number) => a + (b - a) * rng.next();
  return Array.from({ length: n }, () => ({ theta: u(20, 85) * DEG, L, d: u(0, L), m: u(1, 40), M: u(0, 150), mu: u(0, 1) }));
}

describe('ladder: equilibrium', () => {
  it('ΣF_x, ΣF_y, Στ about the foot and about the top vanish to 1e-9 over random settings', () => {
    for (const q of randomInputs(2000)) {
      const r = residuals(q);
      expect(Math.abs(r.Fx)).toBeLessThan(1e-9);
      expect(Math.abs(r.Fy)).toBeLessThan(1e-9);
      expect(Math.abs(r.tauFoot)).toBeLessThan(1e-9);
      expect(Math.abs(r.tauTop)).toBeLessThan(1e-9);
    }
  });

  it('60°, m = 10 kg, M = 70 kg half-way: F_w ≈ 226 N, N = 784 N, f/μsN = 72 % at μs = 0.40', () => {
    const e = equilibrium({ theta: 60 * DEG, L, d: L / 2, m: 10, M: 70, mu: 0.4 });
    expect(e.Fw).toBeCloseTo(226.3, 1);
    expect(Math.round(e.Fw)).toBe(226);
    expect(e.N).toBeCloseTo(784, 9);
    expect(e.f).toBe(e.Fw);
    expect(e.fmax).toBeCloseTo(313.6, 9);
    expect(e.ratio).toBeCloseTo(0.7217, 4);
    expect(e.slips).toBe(false);
  });

  it('lever arms: (L/2) cos θ, d cos θ, L sin θ', () => {
    const e = equilibrium({ theta: 60 * DEG, L, d: 2.5, m: 10, M: 70, mu: 0.4 });
    expect(e.armMg).toBeCloseTo(1.25, 12);
    expect(e.armPerson).toBeCloseTo(1.25, 12);
    expect(e.armWall).toBeCloseTo(4.3301, 4);
  });

  it('F_w grows as the person climbs and as the angle drops; N does not change', () => {
    const base = { theta: 60 * DEG, L, d: 1, m: 10, M: 70, mu: 0.4 };
    const e0 = equilibrium(base);
    const up = equilibrium({ ...base, d: 4 });
    const low = equilibrium({ ...base, theta: 45 * DEG });
    expect(up.Fw).toBeGreaterThan(e0.Fw);
    expect(low.Fw).toBeGreaterThan(e0.Fw);
    expect(up.N).toBe(e0.N);
    expect(low.N).toBe(e0.N);
  });
});

describe('ladder: critical condition', () => {
  it('θc from the closed form tan θc = (m/2 + Md/L) / (μs (m + M)) gives f = μs N exactly', () => {
    for (const q of randomInputs(1000, 9)) {
      if (q.mu < 0.02) continue;
      const thc = criticalAngle(q);
      expect(Math.tan(thc)).toBeCloseTo((q.m / 2 + (q.M * q.d) / q.L) / (q.mu * (q.m + q.M)), 9);
      if (thc < 1 * DEG || thc > 89 * DEG) continue;
      const e = equilibrium({ ...q, theta: thc });
      expect(e.ratio).toBeCloseTo(1, 10);
      expect(equilibrium({ ...q, theta: thc + 0.01 * DEG }).slips).toBe(false);
      expect(equilibrium({ ...q, theta: thc - 0.01 * DEG }).slips).toBe(true);
    }
  });

  it('default case: θc = 51.3°; the ladder slips at 51° and holds at 52°', () => {
    const q = { L, d: 2.5, m: 10, M: 70, mu: 0.4 };
    expect(criticalAngle(q) / DEG).toBeCloseTo(51.34, 2);
    expect(equilibrium({ ...q, theta: 51 * DEG }).slips).toBe(true);
    expect(equilibrium({ ...q, theta: 52 * DEG }).slips).toBe(false);
  });

  it('critical position d_c gives f = μs N; higher slips, lower holds', () => {
    for (const q of randomInputs(1000, 21)) {
      if (q.M < 1) continue;
      const dc = criticalPosition(q);
      if (!(dc > 0.01 && dc < q.L - 0.01)) continue;
      expect(equilibrium({ ...q, d: dc }).ratio).toBeCloseTo(1, 10);
      expect(equilibrium({ ...q, d: dc + 0.005 }).slips).toBe(true);
      expect(equilibrium({ ...q, d: dc - 0.005 }).slips).toBe(false);
    }
    // 60°, defaults: d_c = L (μs (m+M) tan θ − m/2) / M = 3.60 m.
    expect(criticalPosition({ theta: 60 * DEG, L, m: 10, M: 70, mu: 0.4 })).toBeCloseTo(3.602, 3);
  });

  it('μs = 0: any lean slips (θc = 90°); no person: d_c is ±∞', () => {
    expect(criticalAngle({ L, d: 2, m: 10, M: 70, mu: 0 }) / DEG).toBeCloseTo(90, 12);
    expect(equilibrium({ theta: 85 * DEG, L, d: 0, m: 10, M: 0, mu: 0 }).slips).toBe(true);
    expect(criticalPosition({ theta: 60 * DEG, L, m: 10, M: 0, mu: 0.4 })).toBe(Infinity);
    expect(criticalPosition({ theta: 20 * DEG, L, m: 10, M: 0, mu: 0.1 })).toBe(-Infinity);
  });
});

describe('ladder: scene', () => {
  const formula = ladderScene.formula! as unknown as (s: { t: number }, p: Params) => string[];
  it('formula panel for the defaults: F_w = 226 N, N = 784 N, μs N = 314 N, θc = 51.3°', () => {
    const p = defaults(ladderScene.params) as Params;
    const lines = formula({ t: 0 }, p);
    expect(lines.length).toBeLessThanOrEqual(5);
    expect(lines[1]).toMatch(/= 226\\ \\text\{N\}$/);
    expect(lines[2]).toMatch(/= 784\\ \\text\{N\}$/);
    expect(lines[3]).toContain('\\le \\mu_s N = 314');
    expect(lines[4]).toMatch(/\\theta_c = 51\.3\^\\circ$/);
    const slip = formula({ t: 0 }, { ...p, theta: 40 });
    expect(slip[3]).toContain('> \\mu_s N');
  });

  it('input() converts degrees; g = 9.8 m/s²', () => {
    const p = defaults(ladderScene.params) as Params;
    const q = input(p as never);
    expect(q.theta).toBeCloseTo(60 * DEG, 12);
    expect(G).toBe(9.8);
  });

  it('formula lines stay finite at the slider ends (μs = 0, M = 0, d = 0, θ = 20° and 85°)', () => {
    const p = defaults(ladderScene.params) as Params;
    const overs: Params[] = [{ mu: 0 }, { M: 0 }, { d: 0 }, { theta: 20, d: 5, M: 150 }, { theta: 85, m: 1, M: 0, mu: 1 }];
    for (const over of overs) {
      for (const line of formula({ t: 0 }, { ...p, ...over })) expect(line).not.toMatch(/NaN|undefined/);
    }
  });

  it('every i18n key exists in ko and en; no em-dash; no $ glued to a letter or digit', () => {
    const keys = new Set<string>();
    for (const sc of page.scenes) {
      keys.add(sc.title);
      for (const sp of Object.values(sc.params)) {
        keys.add(sp.label);
        if (sp.desc) keys.add(sp.desc);
      }
      for (const k of [...sc.info.goals, ...sc.info.observe, ...(sc.info.assumptions ?? [])]) keys.add(k);
    }
    for (const k of keys) {
      expect(page.i18n.ko[k], `ko ${k}`).toBeTruthy();
      expect(page.i18n.en[k], `en ${k}`).toBeTruthy();
    }
    for (const dict of [page.i18n.ko, page.i18n.en]) {
      for (const v of Object.values(dict)) {
        expect(v).not.toContain('\u2014');
        const parts = v.split('$');
        for (let i = 0; i < parts.length - 1; i += 2) expect(parts[i]).not.toMatch(/[\p{L}\p{N}]$/u);
      }
    }
  });
});
