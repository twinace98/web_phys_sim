// Free-body-diagram toggle on the mechanics scenes of Ch 11 (roll), Ch 13 (orbit), Ch 15 (SHM,
// pendulum) and the damped-oscillation review page: the toggle, ΣF = ma from the drawn forces at
// several states and settings, and labels apart at the stage sizes of 1280×800 and 390×844.
// Ladder and buoyancy draw their forces as the core visual (no toggle): the weights are dashed.
import { describe, expect, it } from 'vitest';
import { defaults } from '../src/core/params';
import type { Params, Scene, Vec2 } from '../src/core/types';
import type { ArrowStyle } from '../src/draw/draw';
import type { FbdForce } from '../src/draw/fbd';
import { rollScene, fbdForces as rollForces, M as ROLL_M } from '../src/sims/ch11/roll';
import { BETA, BODIES, G as ROLL_G, rollState } from '../src/sims/ch11/physics';
import { orbitScene, fbdForces as orbitForces, model, probeAt, PROBE_MASS, velocityClear as orbitClear, type P as OrbitP } from '../src/sims/ch13/orbit';
import { shm, fbdForces as shmForces } from '../src/sims/ch15/shm';
import { pendulum, fbdForces as pendForces, BOB_M, tension, velocityClear as pendClear } from '../src/sims/ch15/pendulum';
import { freeScene, fbdForces as freeForces } from '../src/sims/review/damped/free';
import { drivenScene, fbdForces as drivenForces } from '../src/sims/review/damped/driven';
import { ladderScene } from '../src/sims/review/ladder/scene';
import { buoyancyScene } from '../src/sims/review/buoyancy/scene';
import { ProbeDraw, offStage, type Mark } from './stage-probe';
import { register } from '../src/core/i18n';
import en from '../src/i18n/en.json';
import ko from '../src/i18n/ko.json';
import ch11en from '../src/sims/ch11/i18n.en.json';
import ch11ko from '../src/sims/ch11/i18n.ko.json';
import ch13en from '../src/sims/ch13/i18n.en.json';
import ch13ko from '../src/sims/ch13/i18n.ko.json';
import dampedEn from '../src/sims/review/damped/i18n.en.json';
import dampedKo from '../src/sims/review/damped/i18n.ko.json';
import buoyEn from '../src/sims/review/buoyancy/i18n.en.json';
import buoyKo from '../src/sims/review/buoyancy/i18n.ko.json';

// Real strings, so the probe measures real label widths (Korean is the default language).
register(ko, en);
register(ch11ko, ch11en);
register(ch13ko, ch13en);
register(dampedKo, dampedEn);
register(buoyKo, buoyEn);

/** Stage sizes measured in the browser at 1280×800 and 390×844 (all these scenes have plots). */
const SIZES = [
  [768, 642],
  [390, 253],
];

const sum = (fs: FbdForce[]): Vec2 => fs.reduce((a, f) => ({ x: a.x + f.F.x, y: a.y + f.F.y }), { x: 0, y: 0 });

function expectToggle(scene: Scene): void {
  expect(scene.params.fbd).toMatchObject({ kind: 'toggle', label: 'fbd.p', desc: 'fbd.d', group: 'main', default: false });
}

/** Text marks as boxes [px]: anchor y ± 7 (one line of 13 px text). */
const boxes = (g: ProbeDraw) =>
  g.marks.filter((m) => (m.kind === 'text' || m.kind === 'arrow-label') && m.text).map((m) => ({ ...m, y0: m.y - 7, y1: m.y + 7 }));

/** Pairs of labels that overlap, where at least one is a force label of the diagram. */
function clashes(g: ProbeDraw, fbdLabels: string[], tag: string): string[] {
  const b = boxes(g);
  const out: string[] = [];
  for (let i = 0; i < b.length; i++)
    for (let j = i + 1; j < b.length; j++) {
      const p = b[i];
      const q = b[j];
      if (!fbdLabels.includes(p.text!) && !fbdLabels.includes(q.text!)) continue;
      const apart = p.x + p.w <= q.x + 1 || q.x + q.w <= p.x + 1 || p.y1 <= q.y0 + 1 || q.y1 <= p.y0 + 1;
      if (!apart) out.push(`${tag}: ${p.text} (${p.x.toFixed(0)}, ${p.y.toFixed(0)}) / ${q.text} (${q.x.toFixed(0)}, ${q.y.toFixed(0)})`);
    }
  return out;
}

/** Labels of the diagram must be on the stage. */
const fbdOff = (g: ProbeDraw, fbdLabels: string[]) => {
  const keep = g.marks.filter((m: Mark) => m.kind !== 'text' || fbdLabels.includes(m.text ?? ''));
  const h = new ProbeDraw(g.w, g.h);
  h.marks.push(...keep.filter((m) => m.kind === 'text'));
  return offStage(h);
};

/**
 * Run `scene` with p, calling `at` at the given step numbers with the state and the states δ before
 * and after it (the scene's own step on copies, a negative step going back), for central differences.
 */
function run<S extends { t: number }>(scene: Scene<any, S>, p: Params, steps: number[], at: (prev: S, s: S, next: S, n: number) => void, d = 1e-5): void {
  const h = scene.time!.h;
  const s = scene.init(p as never, undefined as never);
  const last = Math.max(...steps);
  for (let n = 1; n <= last; n++) {
    scene.step!(s, h, p as never);
    if (!steps.includes(n)) continue;
    const prev = scene.snapshot!(s);
    scene.step!(prev, -d, p as never);
    const next = scene.snapshot!(s);
    scene.step!(next, d, p as never);
    at(prev, scene.snapshot!(s), next, n);
  }
}

/** probe() with a canvas gradient stub (Ch 11 shades its sphere with a radial gradient). */
function probe<P extends Params, S extends { t: number }>(scene: Scene<P, S>, s: S, p: P, w: number, h: number): ProbeDraw {
  const g = new ProbeDraw(w, h);
  (g.ctx as unknown as Record<string, unknown>).createRadialGradient = () => ({ addColorStop: () => undefined });
  g.vp.fit(scene.world(p), w, h);
  scene.draw(g, s, p, { t: s.t, cursorT: s.t, scrubbing: false, lecture: false });
  return g;
}

/** Probe a state at both stage sizes; return clashes and off-stage labels. */
function stageIssues(scene: Scene<any, any>, s: any, p: Params, labels: string[], tag: string): string[] {
  const out: string[] = [];
  for (const [w, h] of SIZES) {
    const g = probe(scene, s, p as never, w, h);
    out.push(...clashes(g, labels, `${tag} ${w}px`), ...fbdOff(g, labels).map((m) => `${tag} ${w}px off: ${m}`));
  }
  return out;
}

// ------------------------------------------------------------------ Ch 11 rolling

describe('Ch 11 roll: free-body diagram of the chosen body', () => {
  const base = { ...(defaults(rollScene.params) as any), fbd: true };

  // In the drawer: θ and the body are the 2 main controls (design.md §4.1, QA 2026-11-24).
  it('has the shared toggle', () =>
    expect(rollScene.params.fbd).toMatchObject({ kind: 'toggle', label: 'fbd.p', desc: 'fbd.d', group: 'advanced', default: false }));

  it('Mg, N and f_s (none for the frictionless block); ΣF = M a down the incline at every angle', () => {
    for (const theta of [5, 17, 30, 40])
      for (const focus of BODIES) {
        const p = { ...base, theta, focus };
        const fs = rollForces(p);
        expect(fs.map((f) => f.label)).toEqual(focus === 'block' ? ['*M**g*', '*N*'] : ['*M**g*', '*N*', '*f*_{s}']);
        const th = (theta * Math.PI) / 180;
        // a from the run: finite difference of v_cm mid-run, not the closed form.
        const r = { theta: th, len: 1.6, R: 0.12, M: ROLL_M };
        const t = 0.3;
        const a = (rollState(r, focus, t + 1e-4).v - rollState(r, focus, t - 1e-4).v) / 2e-4;
        const F = sum(fs);
        expect(F.x).toBeCloseTo(ROLL_M * a * Math.cos(th), 6);
        expect(F.y).toBeCloseTo(-ROLL_M * a * Math.sin(th), 6);
        // Static friction stays within what μs must supply: f_s = β/(1+β) Mg sin θ.
        if (focus !== 'block') expect(Math.hypot(fs[2].F.x, fs[2].F.y)).toBeCloseTo((BETA[focus] / (1 + BETA[focus])) * ROLL_M * ROLL_G * Math.sin(th), 9);
      }
  });

  it('labels apart and on stage at 1280 and 390 px: start, mid-run, finish; every body and angle', () => {
    const bad: string[] = [];
    for (const theta of [5, 30, 40])
      for (const focus of BODIES) {
        const p = { ...base, theta, focus };
        for (const t of [0, 0.4, 0.8, 2]) bad.push(...stageIssues(rollScene as Scene, { t, n: 0 }, p, ['*M**g*', '*N*', '*f*_{s}'], `θ=${theta} ${focus} t=${t}`));
      }
    expect(bad).toEqual([]);
  });

  it('velocity arrows give way to the diagram; the Σ panel adds ΣF = Mg sin θ − f_s = Ma', () => {
    const p = { ...base };
    const g = probe(rollScene, { t: 0.9, n: 0 }, p, 768, 642);
    expect(g.marks.some((m) => m.text === '*v*_{cm}')).toBe(false);
    expect(g.marks.filter((m) => m.kind === 'arrow-tip').length).toBe(3);
    const off = probe(rollScene, { t: 0.9, n: 0 }, { ...p, fbd: false }, 768, 642);
    expect(off.marks.some((m) => m.text === '*v*_{cm}')).toBe(true);
    const lines = rollScene.formula!({ t: 0.5, n: 0 }, p);
    expect(lines.find((l) => l.startsWith('\\Sigma'))).toMatch(/\\Sigma F = Mg\\sin\\theta - f_s = 4\.90 - 1\.63 = 3\.27\\ \\mathrm\{N\} = Ma/);
    expect(rollScene.formula!({ t: 0.5, n: 0 }, { ...p, fbd: false }).some((l) => l.includes('\\Sigma F'))).toBe(false);
  });
});

// ------------------------------------------------------------------ Ch 13 orbit

describe('Ch 13 orbit: F_g on the probe', () => {
  const base = { ...(defaults(orbitScene.params) as OrbitP), fbd: true };
  const H = orbitScene.time!.h;
  const cases: Partial<OrbitP>[] = [{}, { speed: 0.3 }, { speed: Math.SQRT1_2, alt: 1000 }, { speed: 0.99, alt: 15000 }, { speed: 1.4 }, { dir: 80 }, { dir: -60, speed: 0.6 }, { dir: 90, speed: 0.5 }];

  it('has the shared toggle', () => expectToggle(orbitScene as Scene));

  it('ΣF = F_g = m a, with a from the integrated path (central difference of v)', () => {
    for (const c of cases) {
      const p = { ...base, ...c };
      const m = model(p);
      for (const n of [1, Math.floor(m.N / 3), Math.floor((2 * m.N) / 3), m.N - 1]) {
        // The crash step snaps the probe onto the surface: no central difference across it.
        if (n < 1 || n >= m.N - (m.crashed ? 1 : 0)) continue;
        const a = { x: (m.vs[2 * n + 2] - m.vs[2 * n - 2]) / (2 * H), y: (m.vs[2 * n + 3] - m.vs[2 * n - 1]) / (2 * H) };
        const F = sum(orbitForces(probeAt(p, n)));
        // Central difference over the 20 s step: second order, worst near a close periapsis.
        const tol = 2e-3 * Math.hypot(F.x, F.y);
        expect(Math.abs(F.x - PROBE_MASS * a.x), JSON.stringify(c)).toBeLessThan(tol);
        expect(Math.abs(F.y - PROBE_MASS * a.y), JSON.stringify(c)).toBeLessThan(tol);
      }
    }
  });

  it('labels apart and on stage at 1280 and 390 px over the whole run; v hidden only along F_g', () => {
    const bad: string[] = [];
    for (const c of cases) {
      const p = { ...base, ...c };
      const m = model(p);
      for (let k = 0; k <= 24; k++) {
        const n = Math.round((m.N * k) / 24);
        const s = { t: n * H, n };
        bad.push(...stageIssues(orbitScene as Scene, s, p, ['*F*_{g}'], `${JSON.stringify(c)} n=${n}`));
        const g = probe(orbitScene, s, p, 768, 642);
        if (!(m.crashed && n >= m.N)) expect(g.marks.some((q) => q.text === '*v*')).toBe(orbitClear(probeAt(p, n)));
      }
    }
    expect(bad).toEqual([]);
  });

  it('Σ panel: ΣF = F_g = GMm/r² = ma with the current r', () => {
    const lines = orbitScene.formula!({ t: 0, n: 0 }, base);
    // r0 = 6371 + 6000 km: F = GMm/r0² = 2604.6 N (shown to 4 digits, as the readouts do).
    expect(lines.at(-1)).toMatch(/\\Sigma F = F_g = .* = 2605\\ \\mathrm\{N\} = ma$/);
  });
});

// ------------------------------------------------------------------ Ch 15 SHM

describe('Ch 15 SHM: F_s, mg and F_d on the hanging mass', () => {
  const base = { ...(defaults(shm.params) as any), fbd: true };
  const cases = [{}, { A: 0.05, k: 40, m: 0.2 }, { A: 0.3, k: 5, m: 2 }, { zeta: 0.2 }, { zeta: 0.1, A: 0.3, k: 40, m: 0.2 }, { zeta: 0.05, k: 5, m: 2 }];

  it('has the shared toggle', () => expectToggle(shm as Scene));

  it('ΣF = m a (central difference of v) at the start, mid-run and late, with and without damping', () => {
    for (const c of cases) {
      const p = { ...base, ...c };
      run(shm, p, [1, 400, 1234, 3001], (prev, s, next) => {
        const fs = shmForces(s, p);
        expect(fs.map((f) => f.label)).toEqual(p.zeta > 0 ? ['*F*_{s}', '*m**g*', '*F*_{d}'] : ['*F*_{s}', '*m**g*']);
        const a = (next.v - prev.v) / (next.t - prev.t);
        const F = sum(fs);
        expect(F.x).toBe(0);
        expect(Math.abs(F.y - p.m * a)).toBeLessThan(1e-6 * (p.m * 9.8 + p.k * p.A));
      });
    }
  });

  it('labels apart and on stage at 1280 and 390 px; the mass a arrow gives way, v stays', () => {
    const bad: string[] = [];
    for (const c of cases) {
      const p = { ...base, ...c };
      run(shm, p, Array.from({ length: 60 }, (_, i) => 1 + 41 * i), (_a, s, _b, n) => {
        bad.push(...stageIssues(shm as Scene, s, p, ['*F*_{s}', '*m**g*', '*F*_{d}'], `${JSON.stringify(c)} n=${n}`));
      });
    }
    expect(bad).toEqual([]);
    const s = shm.init(base, undefined as never);
    shm.step!(s, 0.3, base);
    // Off: v and a on the circle and on the mass. On: the mass's a goes, the 2 force arrows come.
    const tips = (q: any) => probe(shm, s, q, 768, 642).marks.filter((m) => m.kind === 'arrow-tip').length;
    expect(tips({ ...base, fbd: false })).toBe(4);
    expect(tips(base)).toBe(4 - 1 + 2);
  });

  it('Σ panel: ΣF = F_s − mg (+ F_d) = ma', () => {
    const s = shm.init(base, undefined as never);
    // x = A = 0.2 m, k = 20 N/m, m = 1 kg: F_s = 9.8 − 4 = 5.80 N, ΣF = −kx = −4.00 N. The sum is
    // computed as −kx (policy D, R5: F_s and mg nearly cancel near equilibrium).
    expect(shm.formula!(s, base).slice(-2)).toEqual(['\\Sigma F = F_s - mg = 5.80 - 9.80', '= -kx = -(20)(0.200) = -4.00\\ \\mathrm{N} = ma']);
    const damped = shm.formula!(s, { ...base, zeta: 0.1 }).slice(-2);
    expect(damped[0]).toMatch(/^\\Sigma F = F_s - mg \+ F_d = /);
    expect(damped[1]).toMatch(/^= -kx \+ F_d = -\(20\)\(0\.200\) \+ /);
  });
});

// ------------------------------------------------------------------ Ch 15 pendulum

describe('Ch 15 pendulum: F_T and mg on the bob, independent of the v / a_t / a_r toggle', () => {
  const base = { ...(defaults(pendulum.params) as any), fbd: true };
  const cases = [{}, { theta0: 5 }, { theta0: 30, L: 0.2 }, { theta0: 120, L: 2 }, { theta0: 170 }];

  it('has the shared toggle, separate from the arrows toggle', () => {
    expectToggle(pendulum as Scene);
    expect(pendulum.params.vectors.kind).toBe('toggle');
  });

  it('ΣF = m a, a from the bob position (second difference), at several points of the swing', () => {
    for (const c of cases) {
      const p = { ...base, ...c };
      const pos = (q: { th: number }) => ({ x: p.L * Math.sin(q.th), y: -p.L * Math.cos(q.th) });
      run(pendulum, p, [1, 200, 517, 900, 1500, 2600], (prev, s, next) => {
        const h = next.t - s.t;
        expect(h).toBeCloseTo(1e-4, 12);
        const [a, b, d] = [pos(prev), pos(s), pos(next)];
        const acc = { x: (a.x - 2 * b.x + d.x) / (h * h), y: (a.y - 2 * b.y + d.y) / (h * h) };
        const F = sum(pendForces(s, p));
        const tol = 1e-5 * BOB_M * 9.8 * 5;
        expect(Math.abs(F.x - BOB_M * acc.x), JSON.stringify(c)).toBeLessThan(tol);
        expect(Math.abs(F.y - BOB_M * acc.y), JSON.stringify(c)).toBeLessThan(tol);
      }, 1e-4);
    }
    // Beyond 90° near the top, the rod pushes: F_T < 0.
    expect(tension({ th: (170 * Math.PI) / 180, w: 0 }, { ...base, theta0: 170 })).toBeLessThan(0);
  });

  it('both toggles on: labels apart and on stage; a_t, a_r give way; v only where it is clear of mg', () => {
    const bad: string[] = [];
    for (const c of cases)
      for (const vectors of [true, false]) {
        const p = { ...base, ...c, vectors };
        // Every 40 ms over 7 s: more than a full swing at the longest period (6.9 s at 170°, 2 m).
        run(pendulum, p, Array.from({ length: 175 }, (_, i) => 1 + 40 * i), (_a, s, _b, n) => {
          bad.push(...stageIssues(pendulum as Scene, s, p, ['*F*_{T}', '*m**g*'], `${JSON.stringify(c)} vectors=${vectors} n=${n}`));
          const g = probe(pendulum, s, p, 768, 642);
          const texts = g.marks.map((m) => m.text);
          // F_T's label sits beside the string, not on it.
          const ft = g.marks.find((m) => m.text === '*F*_{T}');
          if (ft) {
            const [x0, y0] = g.vp.toPx(0, 0);
            const [x1, y1] = g.vp.toPx(Math.sin(s.th), -Math.cos(s.th));
            const cx = ft.x + ft.w / 2;
            const d = Math.abs((x1 - x0) * (ft.y - y0) - (y1 - y0) * (cx - x0)) / Math.hypot(x1 - x0, y1 - y0);
            expect(d, `${JSON.stringify(c)} n=${n}`).toBeGreaterThan(10);
          }
          expect(texts.includes('*a*_{t}') || texts.includes('*a*_{r}')).toBe(false);
          if (texts.includes('*v*')) expect(vectors && pendClear(s)).toBe(true);
        });
      }
    expect(bad).toEqual([]);
    // Without the diagram the arrows toggle works as before.
    const s = pendulum.init(base, undefined as never);
    for (let i = 0; i < 300; i++) pendulum.step!(s, 1e-3, base);
    const texts = probe(pendulum, s, { ...base, fbd: false }, 768, 642).marks.map((m) => m.text);
    expect(texts).toContain('*a*_{t}');
    expect(texts).toContain('*a*_{r}');
  });

  it('Σ panel: ΣF_r = F_T − mg cos θ = m a_r', () => {
    const s = pendulum.init(base, undefined as never);
    for (let i = 0; i < 300; i++) pendulum.step!(s, 1e-3, base);
    const line = pendulum.formula!(s, base).at(-1)!;
    expect(line).toMatch(/^\\Sigma F_\\mathrm\{r\} = F_T - mg\\cos\\theta = /);
    expect(pendulum.formula!(s, { ...base, fbd: false }).some((l) => l.includes('\\Sigma'))).toBe(false);
  });
});

// ------------------------------------------------------------------ review: damped and driven

describe('review damped: F_s, mg, F_d (and the driving force F) on the block', () => {
  const freeBase = { ...(defaults(freeScene.params) as any), fbd: true };
  const drivenBase = { ...(defaults(drivenScene.params) as any), fbd: true };
  const freeCases = [{}, { b: 0 }, { b: 8 }, { b: 20, m: 0.2, k: 40 }, { b: 0.5, m: 2, k: 5 }];
  const drivenCases = [{}, { ratio: 0.2 }, { ratio: 2 }, { b: 0.2, m: 0.2, k: 40 }, { b: 4, m: 2, k: 5, ratio: 0.7 }];

  it('both scenes have the shared toggle', () => {
    expectToggle(freeScene as Scene);
    expectToggle(drivenScene as Scene);
  });

  it('free: ΣF = m a (central difference of v) at the start, mid-run and late', () => {
    for (const c of freeCases) {
      const p = { ...freeBase, ...c };
      run(freeScene, p, [1, 700, 2100, 5000], (prev, s, next) => {
        const fs = freeForces(s, p);
        expect(fs.map((f) => f.label)).toEqual(['*F*_{s}', '*m**g*', '*F*_{d}']);
        const a = (next.v - prev.v) / (next.t - prev.t);
        expect(Math.abs(sum(fs).y - p.m * a)).toBeLessThan(1e-6 * (p.m * 9.8 + p.k * 0.2));
      });
    }
  });

  it('driven: ΣF = m a with the driving force F = k y_s, also after ω_d changes mid-run', () => {
    for (const c of drivenCases) {
      const p = { ...drivenBase, ...c };
      run(drivenScene, p, [1, 900, 3000, 7000], (prev, s, next) => {
        const fs = drivenForces(s, p);
        expect(fs.map((f) => f.label)).toEqual(['*F*_{s}', '*m**g*', '*F*_{d}', '*F*']);
        const a = (next.v - prev.v) / (next.t - prev.t);
        expect(Math.abs(sum(fs).y - p.m * a)).toBeLessThan(1e-6 * (p.m * 9.8 + p.k * 0.1));
      });
    }
  });

  it('labels apart and on stage at 1280 and 390 px; the F_d arrow of the arrows toggle gives way', () => {
    const bad: string[] = [];
    const labels = ['*F*_{s}', '*m**g*', '*F*_{d}', '*F*'];
    for (const c of freeCases)
      run(freeScene, { ...freeBase, ...c }, Array.from({ length: 50 }, (_, i) => 1 + 97 * i), (_a, s, _b, n) => {
        bad.push(...stageIssues(freeScene as Scene, s, { ...freeBase, ...c }, labels, `free ${JSON.stringify(c)} n=${n}`));
        const arrows = probe(freeScene, s, { ...freeBase, ...c }, 768, 642).marks.filter((m) => m.kind === 'arrow-label').map((m) => m.text);
        expect(arrows).not.toContain('*F*_{d}');
      });
    for (const c of drivenCases)
      run(drivenScene, { ...drivenBase, ...c }, Array.from({ length: 60 }, (_, i) => 1 + 251 * i), (_a, s, _b, n) => {
        bad.push(...stageIssues(drivenScene as Scene, s, { ...drivenBase, ...c }, labels, `driven ${JSON.stringify(c)} n=${n}`));
      });
    expect(bad).toEqual([]);
  });

  it('Σ panel: ΣF line with the substituted forces', () => {
    const s = freeScene.init(freeBase, undefined as never);
    // x0 = 0.2 m, k = 16 N/m, m = 1 kg, at rest: F_s = 9.8 − 3.2 = 6.60 N, ΣF = −3.20 N.
    expect(freeScene.formula!(s, freeBase).at(-1)).toBe('\\Sigma F = F_s - mg + F_d = 6.60 - 9.80 + 0 = -3.20\\ \\mathrm{N} = ma');
    const d = drivenScene.init(drivenBase, undefined as never);
    // At rest at equilibrium, support at +d: F = kd = 0.320 N is the net force.
    expect(drivenScene.formula!(d, drivenBase).at(-1)).toBe('\\Sigma F = F_s - mg + F_d + F = 9.80 - 9.80 + 0 + 0.320 = 0.320\\ \\mathrm{N} = ma');
  });
});

// ------------------------------------------------------------------ ladder and buoyancy: style only

describe('review ladder and buoyancy: forces already drawn, weights dashed like every free-body diagram', () => {
  class Styles extends ProbeDraw {
    styles: ArrowStyle[] = [];
    arrow(from: Vec2, vec: Vec2, st: ArrowStyle = {}): void {
      this.styles.push(st);
      super.arrow(from, vec, st);
    }
  }
  const draw = (scene: Scene<any, any>, w: number, h: number, set: Record<string, number> = {}) => {
    const p = defaults(scene.params);
    const g = new Styles(w, h);
    g.vp.fit(scene.world(p as never), w, h);
    scene.draw(g, { ...scene.init(p as never, undefined as never), ...set }, p as never, { t: 0, cursorT: 0, scrubbing: false, lecture: false });
    return g.styles;
  };

  it('ladder: mg and Mg dashed, N, F_w, f solid; no extra toggle', () => {
    const st = draw(ladderScene as Scene, 1280, 679);
    expect(st.filter((s) => s.dash).length).toBe(2);
    expect(st.filter((s) => !s.dash).length).toBeGreaterThanOrEqual(3);
    expect('fbd' in ladderScene.params).toBe(false);
  });

  it('buoyancy: F_g dashed, F_b solid; no extra toggle', () => {
    // Block bottom at 0.3 m: partly submerged, so F_b is drawn too.
    const st = draw(buoyancyScene as Scene, 768, 642, { y: 0.3 }).filter((s) => s.width === 2.5);
    expect(st.filter((s) => s.dash).length).toBe(1);
    expect(st.filter((s) => !s.dash).length).toBe(1);
    expect('fbd' in buoyancyScene.params).toBe(false);
  });
});
