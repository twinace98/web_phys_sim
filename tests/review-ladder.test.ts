// Addition under review: static equilibrium of a ladder and the slip past its limit (→ Ch 12).
import { describe, expect, it } from 'vitest';
import { defaults } from '../src/core/params';
import { Rng } from '../src/core/rng';
import { Runner } from '../src/core/runner';
import type { Params, Scene } from '../src/core/types';
import page from '../src/sims/review/ladder';
import {
  G,
  advanceRun,
  composite,
  criticalAngle,
  criticalPosition,
  equilibrium,
  mechEnergy,
  residuals,
  runToEnd,
  slipForces,
  startRun,
  type Body,
  type LadderInput,
  type RunInput,
  type RunState,
} from '../src/sims/review/ladder/physics';
import { H, L, endTime, forcesAt, input, ladderScene, onsetTime, runInput } from '../src/sims/review/ladder/scene';

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

// ---------------------------------------------------------------- climbing and slipping

const P0 = (): Params => defaults(ladderScene.params) as Params;
const DEF: RunInput = { theta: 60 * DEG, L, m: 10, M: 70, mu: 0.4, muk: 0.32, d0: 1, v: 0.5 };

function randomRuns(n: number, seed = 31): RunInput[] {
  const rng = new Rng(seed);
  const u = (a: number, b: number) => a + (b - a) * rng.next();
  return Array.from({ length: n }, () => {
    const mu = u(0.05, 1);
    return { theta: u(20, 85) * DEG, L, m: u(1, 40), M: u(1, 150), mu, muk: u(0, 0.95) * mu, d0: u(0, 2), v: u(0.1, 1) };
  });
}

/** Run step by step, calling `each` after every step once the slip has started. */
function runSteps(q: RunInput, each?: (s: RunState) => void): RunState {
  const s = startRun(q);
  while (s.phase !== 'done' && s.t < 600) {
    advanceRun(s, H, q);
    if (s.tSlip !== null) each?.(s);
  }
  return s;
}

/** Lagrange's equation for θ, independent of the Newton solver: J θ'' + ½ J' θ'² + ∂U/∂θ − Q_f = 0. */
function lagrangeResidual(b: Body, muk: number, th: number, om: number): number {
  const s = Math.sin(th);
  const c = Math.cos(th);
  const J = (b.m * b.L * b.L) / 3 + b.M * ((b.L - b.d) ** 2 * s * s + b.d * b.d * c * c);
  const dJ = 2 * b.M * ((b.L - b.d) ** 2 - b.d * b.d) * s * c;
  const sf = slipForces(b, muk, th, om);
  // Friction μk N toward the wall acts at the foot x_A = −L cos θ: generalized force μk N L sin θ.
  return J * sf.alpha + 0.5 * dJ * om * om + ((b.m * b.L) / 2 + b.M * b.d) * G * c - muk * sf.N * b.L * s;
}

describe('ladder: slip dynamics', () => {
  it('Newton solver agrees with Lagrange’s equation; at d_c with μk = μs and θ′ = 0 it gives the static forces', () => {
    const rng = new Rng(77);
    const u = (a: number, b: number) => a + (b - a) * rng.next();
    for (let i = 0; i < 2000; i++) {
      const b = { L, m: u(1, 40), M: u(0, 150), d: u(0, L) };
      const muk = u(0, 1);
      const th = u(1, 89) * DEG;
      const om = -u(0, 3);
      const scale = (b.m + b.M) * G * L;
      expect(Math.abs(lagrangeResidual(b, muk, th, om)) / scale).toBeLessThan(1e-12);
    }
    for (const q of randomRuns(300, 3)) {
      const dc = criticalPosition(q);
      if (!(dc > 0 && dc < L)) continue;
      const sf = slipForces({ L, m: q.m, M: q.M, d: dc }, q.mu, q.theta, 0);
      expect(Math.abs(sf.alpha)).toBeLessThan(1e-9);
      expect(sf.Fw).toBeCloseTo(sf.f, 6);
      expect(sf.N).toBeCloseTo((q.m + q.M) * G, 6);
    }
  });

  it('composite body: CM and I_cm of rod + point mass', () => {
    const c = composite({ L, m: 10, M: 70, d: 3.6 });
    expect(c.mt).toBe(80);
    expect(c.rc).toBeCloseTo((10 * 2.5 + 70 * 3.6) / 80, 12);
    // I about the foot = mL²/3 + M d² = I_cm + (m+M) r_c².
    expect(c.Ic + c.mt * c.rc ** 2).toBeCloseTo((10 * 25) / 3 + 70 * 3.6 ** 2, 9);
  });

  it('slip starts exactly when d reaches d_c (closed form): t_s = (d_c − d0)/v; before it f < μs N', () => {
    for (const q of randomRuns(300)) {
      const dc = criticalPosition(q);
      const s = startRun(q);
      let prev: RunState = { ...s };
      while (s.phase === 'climb') {
        prev = { ...s };
        advanceRun(s, H, q);
      }
      if (dc > L) {
        expect(s.end).toBe('top');
        expect(s.tStop!).toBeCloseTo((L - q.d0) / q.v, 9);
        continue;
      }
      if (dc <= q.d0) {
        expect(s.tSlip).toBe(0);
        expect(s.d).toBe(q.d0);
        continue;
      }
      expect(s.tSlip!).toBeCloseTo((dc - q.d0) / q.v, 9);
      expect(s.d).toBe(dc);
      expect(equilibrium({ theta: q.theta, L, d: s.d, m: q.m, M: q.M, mu: q.mu }).ratio).toBeCloseTo(1, 10);
      expect(equilibrium({ theta: q.theta, L, d: prev.d, m: q.m, M: q.M, mu: q.mu }).slips).toBe(false);
      expect(prev.th).toBe(q.theta);
    }
  });

  it('energy: E_0 − E = W_f (work against kinetic friction) at every step of the slip, to 1e-6 relative', () => {
    for (const q of randomRuns(120, 41)) {
      let worst = 0;
      const s = runSteps(q, (st) => {
        const E = mechEnergy({ L, m: q.m, M: q.M, d: st.d }, st.th, st.om);
        worst = Math.max(worst, Math.abs(st.E0 - E - st.W) / st.E0);
      });
      expect(worst).toBeLessThan(1e-6);
      if (s.tSlip !== null && q.muk > 0.01 && s.end === 'wall') expect(s.W).toBeGreaterThan(0);
    }
  });

  it('frictionless check: the top leaves the wall at sin θ = (2/3) sin θ0 (uniform ladder, and with M at L/2)', () => {
    for (const [th0, M] of [
      [60, 0],
      [75, 0],
      [45, 70],
    ] as const) {
      const q: RunInput = { theta: th0 * DEG, L, m: 10, M, mu: 0, muk: 0, d0: L / 2, v: 0.5 };
      const s = runToEnd(q, H);
      expect(s.end).toBe('wall');
      expect(s.tSlip).toBe(0);
      expect(Math.sin(s.th)).toBeCloseTo((2 / 3) * Math.sin(th0 * DEG), 7);
      expect(s.W).toBe(0);
    }
  });

  it('F_w ≥ 0: positive during the slip; the run stops where F_w = 0 and the state stays there; N > 0', () => {
    for (const q of randomRuns(120, 57)) {
      let minFw = Infinity;
      let minN = Infinity;
      const s = runSteps(q, (st) => {
        const sf = slipForces({ L, m: q.m, M: q.M, d: st.d }, q.muk, st.th, st.om);
        if (st.phase === 'slip') minFw = Math.min(minFw, sf.Fw);
        minN = Math.min(minN, sf.N);
      });
      if (s.tSlip === null) continue;
      expect(['wall', 'floor']).toContain(s.end);
      expect(minFw).toBeGreaterThanOrEqual(0);
      expect(minN).toBeGreaterThan(0);
      if (s.end === 'wall') {
        const sf = slipForces({ L, m: q.m, M: q.M, d: s.d }, q.muk, s.th, s.om);
        expect(Math.abs(sf.Fw) / ((q.m + q.M) * G)).toBeLessThan(1e-9);
      }
      const frozen = { ...s };
      advanceRun(s, H, q);
      expect(s.th).toBe(frozen.th);
      expect(s.om).toBe(frozen.om);
      expect(s.t).toBeCloseTo(frozen.t + H, 12);
    }
  });

  it('μk = μs at d_c: no net torque, the foot does not move (stick); no climber: holds or slips at once', () => {
    const s = runToEnd({ ...DEF, muk: DEF.mu }, H);
    expect(s.end).toBe('stick');
    expect(s.th).toBe(DEF.theta);
    expect(runToEnd({ ...DEF, M: 0 }, H).end).toBe('holds');
    const empty = runToEnd({ ...DEF, M: 0, theta: 20 * DEG, mu: 0.1, muk: 0.08 }, H);
    expect(empty.tSlip).toBe(0);
    expect(empty.end).toBe('wall');
  });

  it('default case (60°, m = 10 kg, M = 70 kg, μs = 0.40, μk = 0.32, d0 = 1 m, v = 0.5 m/s)', () => {
    const s = runToEnd(DEF, H);
    expect(criticalPosition(DEF)).toBeCloseTo(3.602, 3);
    expect(s.tSlip!).toBeCloseTo(5.2037, 4);
    expect(s.end).toBe('wall');
    // The top leaves the wall 0.711 s after the onset, at θ = 36.6°; 129 J dissipated by friction.
    expect(s.tStop! - s.tSlip!).toBeCloseTo(0.7113, 3);
    expect(s.th / DEG).toBeCloseTo(36.58, 2);
    expect(s.E0).toBeCloseTo(2352, 6);
    expect(s.W).toBeCloseTo(129.14, 1);
  });

  it('the result does not depend on the step: H and H/4 agree to 1e-6 rad at the stop', () => {
    const a = runToEnd(DEF, H);
    const b = runToEnd(DEF, H / 4);
    expect(Math.abs(a.th - b.th)).toBeLessThan(1e-6);
    expect(Math.abs(a.tStop! - b.tStop!)).toBeLessThan(1e-6);
  });
});

describe('ladder: scene', () => {
  const formula = ladderScene.formula! as unknown as (s: RunState, p: Params) => string[];

  it('defaults: θ = 60°, d = 1 m, v = 0.5 m/s, μk/μs = 0.8; onset at 5.20 s, run ends at the step after F_w = 0', () => {
    const p = P0();
    expect([p.theta, p.d, p.v, p.kr, p.m, p.M, p.mu]).toEqual([60, 1, 0.5, 0.8, 10, 70, 0.4]);
    expect(runInput(p as never).muk).toBeCloseTo(0.32, 12);
    expect(onsetTime(p as never)!).toBeCloseTo(5.2037, 4);
    const r = new Runner(ladderScene as unknown as Scene<Params, RunState>, p);
    r.play();
    for (let i = 0; i < 2000 && r.playing; i++) r.advance(0.05);
    expect(r.done).toBe(true);
    expect(r.state.end).toBe('wall');
    expect(r.state.t).toBeCloseTo(endTime(p as never), 9);
    expect(r.state.t - r.state.tStop!).toBeLessThan(H + 1e-9);
    // Gauge: f/μsN = μk/μs = 80 % while slipping.
    expect(forcesAt(r.state, p as never).ratio).toBeCloseTo(0.8, 12);
  });

  it('gauge during the climb: f/μsN grows linearly with d and reaches 100 % at d_c', () => {
    const p = P0();
    const s = ladderScene.init(p as never, new Rng(1));
    const seen: number[] = [];
    while (s.phase === 'climb') {
      seen.push(forcesAt(s, p as never).ratio);
      ladderScene.step!(s, H, p as never);
    }
    expect(seen[0]).toBeCloseTo(equilibrium(input(p as never)).ratio, 12);
    expect(Math.max(...seen)).toBeLessThan(1);
    expect(Math.max(...seen)).toBeGreaterThan(0.995);
    // At the onset itself (d = d_c, θ′ = 0) the static friction is exactly μs N.
    expect(equilibrium(input(p as never, s.d)).ratio).toBeCloseTo(1, 12);
  });

  it('static view (t = 0) is the old equilibrium: d = 2.5 m gives F_w = 226 N, N = 784 N, f/μsN = 72 %', () => {
    const p = { ...P0(), d: 2.5 };
    const s = ladderScene.init(p as never, new Rng(1));
    const F = forcesAt(s, p as never);
    expect(Math.round(F.Fw)).toBe(226);
    expect(F.N).toBeCloseTo(784, 9);
    expect(F.ratio).toBeCloseTo(0.7217, 4);
    const lines = formula(s, p);
    expect(lines.length).toBe(5);
    expect(lines[1]).toMatch(/= 226\\ \\text\{N\}$/);
    expect(lines[2]).toContain('\\le \\mu_s N = (0.40)(784) = 314');
    expect(lines[3]).toMatch(/= 3\.60\\ \\text\{m\}$/);
    expect(lines[4]).toMatch(/= 2\.20\\ \\text\{s\}$/);
    // Safe to the top (d_c > L) or no climber: the θc line takes the last place.
    const safe = formula(s, { ...p, mu: 1 });
    expect(safe[3]).toContain('> L');
    expect(safe[4]).toMatch(/\\theta_c = /);
    expect(formula(s, { ...p, M: 0 })[3]).toMatch(/\\theta_c = /);
    // μs = 1, d = 2.5 m: tan θc = (5 + 35)/80 = 0.5 → θc = 26.6°.
    expect(safe[4]).toMatch(/\\theta_c = 26\.6\^\\circ$/);
  });

  it('start above d_c: gauge past 100 %, needed friction dashed; first step starts the slip with f = μk N', () => {
    const p = { ...P0(), d: 4 };
    const s = ladderScene.init(p as never, new Rng(1));
    const F = forcesAt(s, p as never);
    expect(F.over).toBe(true);
    expect(F.ratio).toBeGreaterThan(1);
    expect(F.f).toBeCloseTo(0.4 * 784, 9);
    ladderScene.step!(s, H, p as never);
    expect(s.tSlip).toBe(0);
    const F1 = forcesAt(s, p as never);
    expect(F1.over).toBe(false);
    expect(F1.f / (0.4 * F1.N)).toBeCloseTo(0.8, 12);
    const lines = formula(s, p);
    expect(lines[0]).toContain('\\mu_k N');
    expect(lines[3]).toContain('W_f');
  });

  it('formula lines and readouts stay finite at the slider ends', () => {
    const p = P0();
    const overs: Params[] = [{ mu: 0 }, { M: 0 }, { d: 0 }, { d: 5 }, { theta: 20, d: 5, M: 150 }, { theta: 85, m: 1, M: 0, mu: 1 }, { kr: 0 }, { kr: 0.95, mu: 1 }, { v: 0.1 }, { v: 1 }];
    for (const over of overs) {
      const q = { ...p, ...over };
      const r = new Runner(ladderScene as unknown as Scene<Params, RunState>, q);
      const check = () => {
        for (const line of formula(r.state, q)) expect(line).not.toMatch(/NaN|undefined|Infinity/);
        for (const ro of ladderScene.readouts!) {
          const v = ro.value(r.state, q as never);
          // f/μsN is ∞ only in the static view with μs = 0 (any friction needed exceeds μs N = 0).
          if (!(q.mu === 0 && ro.label.includes('mu_s'))) expect(Number.isFinite(v)).toBe(true);
        }
      };
      check();
      r.play();
      for (let i = 0; i < 4000 && r.playing; i++) r.advance(0.05);
      check();
    }
  });

  it('input() converts degrees; g = 9.8 m/s²', () => {
    const q = input(P0() as never);
    expect(q.theta).toBeCloseTo(60 * DEG, 12);
    expect(G).toBe(9.8);
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
    for (const dict of [page.i18n.ko, page.i18n.en]) {
      expect(Object.keys(dict).sort()).toEqual([...keys].sort());
      for (const v of Object.values(dict)) {
        expect(v).not.toContain('\u2014');
        const parts = v.split('$');
        for (let i = 0; i < parts.length - 1; i += 2) expect(parts[i]).not.toMatch(/[\p{L}\p{N}]$/u);
      }
    }
  });
});

