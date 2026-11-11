import { describe, expect, it } from 'vitest';
import { defaults } from '../src/core/params';
import { Runner } from '../src/core/runner';
import { endTime, energyScene } from '../src/sims/ch08/energy';
import {
  A,
  B,
  G,
  MASS,
  MU_K,
  POTENTIALS,
  along,
  equilibria,
  forbidden,
  pathPoints,
  pathWork,
  pieceWork,
  stepParticle,
  turningPoints,
  type ForceKind,
  type PathKind,
  type V2,
} from '../src/sims/ch08/physics';

const PATHS: PathKind[] = ['straight', 'arc', 'zigzag', 'custom'];
const VIA: V2 = [1, -1.2];
const end = (f: ForceKind, k: PathKind, closed = false) => {
  const pw = pathWork(f, pathPoints(k, VIA, closed));
  return pw.W[pw.W.length - 1];
};

describe('ch08 path independence', () => {
  it('gravity: W_AB = −mg Δy on every path', () => {
    for (const k of PATHS) expect(end('gravity', k)).toBeCloseTo(-MASS * G * (B[1] - A[1]), 10);
  });

  it('spring: the same end value on every path, also for other waypoints', () => {
    const ref = end('spring', 'straight');
    for (const k of PATHS) expect(end('spring', k)).toBeCloseTo(ref, 10);
    const pw = pathWork('spring', pathPoints('custom', [-2.5, 2.5], false));
    expect(pw.W[pw.W.length - 1]).toBeCloseTo(ref, 10);
  });

  it('closed path: zero for conservative forces, −μk m g × length for friction', () => {
    for (const k of PATHS) {
      expect(end('gravity', k, true)).toBeCloseTo(0, 10);
      expect(end('spring', k, true)).toBeCloseTo(0, 10);
      const pw = pathWork('friction', pathPoints(k, VIA, true));
      expect(pw.W[pw.W.length - 1]).toBeCloseTo(-MU_K * MASS * G * pw.L, 10);
      expect(pw.W[pw.W.length - 1]).toBeLessThan(0);
    }
  });

  it('friction work grows with path length: zigzag most negative', () => {
    expect(end('friction', 'zigzag')).toBeLessThan(end('friction', 'arc'));
    expect(end('friction', 'arc')).toBeLessThan(end('friction', 'straight'));
  });

  it('the spring work on a straight piece is exact (matches a fine F·dr sum)', () => {
    const p: V2 = [-1, 2];
    const q: V2 = [2.5, -0.5];
    let s = 0;
    const N = 20000;
    for (let i = 0; i < N; i++) {
      const t = (i + 0.5) / N;
      const x = p[0] + (q[0] - p[0]) * t;
      const y = p[1] + (q[1] - p[1]) * t;
      const F = [-2 * (x - 0), -2 * (y + 1.5)];
      s += (F[0] * (q[0] - p[0]) + F[1] * (q[1] - p[1])) / N;
    }
    expect(pieceWork('spring', p, q)).toBeCloseTo(s, 8);
  });

  it('cumulative work along the path is continuous and hits the vertex values', () => {
    const pw = pathWork('gravity', pathPoints('zigzag', VIA, false));
    for (let i = 1; i < pw.pts.length; i++) expect(along(pw, 'gravity', pw.s[i]).W).toBeCloseTo(pw.W[i], 10);
  });
});

describe('ch08 energy diagram', () => {
  it('without friction velocity Verlet keeps E constant over many oscillations', () => {
    for (const pot of Object.values(POTENTIALS)) {
      const s = { x: pot === POTENTIALS.hill ? 2.9 : -2.5, v: 0, stopped: false };
      const E0 = pot.U(s.x);
      let worst = 0;
      for (let i = 0; i < 240 * 60; i++) {
        stepParticle(pot, s, 1 / 240, 1, 0);
        worst = Math.max(worst, Math.abs(0.5 * s.v * s.v + pot.U(s.x) - E0));
      }
      expect(worst / Math.max(E0, 1)).toBeLessThan(1e-4);
      expect(s.stopped).toBe(false);
    }
  });

  it('with friction E only decreases and the particle comes to rest', () => {
    const pot = POTENTIALS.double;
    const s = { x: -2.7, v: 0, stopped: false };
    let E = pot.U(s.x);
    for (let i = 0; i < 240 * 60; i++) {
      stepParticle(pot, s, 1 / 240, 1, 0.15);
      const e = 0.5 * s.v * s.v + pot.U(s.x);
      expect(e).toBeLessThanOrEqual(E + 1e-6);
      E = e;
    }
    expect(s.v).toBe(0);
    expect(Math.abs(pot.dU(s.x))).toBeLessThanOrEqual(0.15);
  });

  it('equilibria: double well stable at ±2, unstable at 0', () => {
    const eq = equilibria(POTENTIALS.double);
    expect(eq.length).toBe(3);
    expect(eq[0].x).toBeCloseTo(-2, 6);
    expect(eq[0].stable).toBe(true);
    expect(eq[1].x).toBeCloseTo(0, 6);
    expect(eq[1].stable).toBe(false);
    expect(eq[2].stable).toBe(true);
    const hill = equilibria(POTENTIALS.hill);
    expect(hill.map((q) => q.stable)).toEqual([false, true]);
    expect(hill[0].x).toBeCloseTo(-1.5, 6);
  });

  it('turning points bound the motion: U = E there, and the particle never passes them', () => {
    const pot = POTENTIALS.double;
    const E = pot.U(-2.7);
    const [l, r] = turningPoints(pot, E, -2);
    expect(l).toBeCloseTo(-2.7, 6);
    expect(pot.U(r!)).toBeCloseTo(E, 6);
    const s = { x: -2.7, v: 0, stopped: false };
    for (let i = 0; i < 240 * 20; i++) {
      stepParticle(pot, s, 1 / 240, 1, 0);
      expect(s.x).toBeGreaterThan(l! - 1e-3);
      expect(s.x).toBeLessThan(r! + 1e-3);
    }
    const fb = forbidden(pot, E);
    expect(fb.some(([a, b]) => a < 0 && b > 0)).toBe(true);
  });

  it('the scene runs with default parameters and records constant E', () => {
    const r: Runner<any, any> = new Runner(energyScene, defaults(energyScene.params));
    r.play();
    for (let i = 0; i < 50; i++) r.advance(0.1);
    const Es = r.hist.col('E');
    expect(Math.max(...Es) - Math.min(...Es)).toBeLessThan(1e-3);
  });
});

describe('ch08 energy diagram: end of the run', () => {
  const base = defaults(energyScene.params) as any;
  const run = (p: any) => {
    const r: Runner<any, any> = new Runner(energyScene, p);
    r.play();
    for (let i = 0; i < 2000 && r.playing; i++) r.advance(0.1);
    return r;
  };

  it('regression: over the hill the particle stops on the edge with E conserved, and the clock pauses there', () => {
    const p = { ...base, pot: 'hill', x0s: [-2.7, -2.5, 3.1] };
    const tEnd = endTime(p)!;
    expect(tEnd).toBeGreaterThan(1);
    const r = run(p);
    expect(r.playing).toBe(false);
    expect(r.state.t).toBeCloseTo(tEnd, 9);
    expect(r.state.x).toBe(POTENTIALS.hill.lo);
    const E0 = POTENTIALS.hill.U(3.1);
    const E = 0.5 * r.state.v ** 2 + POTENTIALS.hill.U(r.state.x);
    expect(Math.abs(E / E0 - 1)).toBeLessThan(1e-3);
    // Before: the clock ran on with the particle parked at x = −3.2.
    expect(r.hist.col('t').at(-1)).toBeCloseTo(tEnd, 9);
  });

  it('regression: with friction the clock pauses when the particle comes to rest for good', () => {
    for (const pot of ['double', 'spring', 'hill']) {
      const p = { ...base, pot, friction: true };
      const tEnd = endTime(p)!;
      expect(tEnd, pot).toBeGreaterThan(1);
      const r = run(p);
      expect(r.playing).toBe(false);
      expect(r.state.t).toBeCloseTo(tEnd, 9);
      if (!r.state.stopped) {
        expect(r.state.v).toBe(0);
        expect(Math.abs(POTENTIALS[pot as 'double'].dU(r.state.x))).toBeLessThanOrEqual(0.15);
      }
    }
  });

  it('a frictionless particle trapped in a well has no end (rolling window)', () => {
    expect(endTime({ ...base })).toBeUndefined();
    expect(endTime({ ...base, pot: 'spring' })).toBeUndefined();
  });
});

describe('ch08 i18n', () => {
  it('every key used by the scenes exists in both languages, with the same key sets', async () => {
    const page = (await import('../src/sims/ch08')).default;
    const { ko, en } = page.i18n;
    expect(Object.keys(ko).sort()).toEqual(Object.keys(en).sort());
    for (const s of page.scenes) {
      const keys: string[] = [s.title, ...s.info.goals, ...s.info.observe, ...(s.info.assumptions ?? [])];
      for (const spec of Object.values(s.params) as any[]) {
        keys.push(spec.label);
        if (spec.group !== 'hidden') keys.push(spec.desc);
        for (const o of spec.options ?? []) keys.push(o.label);
      }
      for (const k of keys) {
        expect(ko[k], k).toBeTruthy();
        expect(en[k], k).toBeTruthy();
      }
    }
  });
});
