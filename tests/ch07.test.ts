import { describe, expect, it } from 'vitest';
import { defaults } from '../src/core/params';
import { Runner } from '../src/core/runner';
import { advance, force, kinetic, makeSetup, trajectory, work, type Preset } from '../src/sims/ch07/physics';
import { workEnergy } from '../src/sims/ch07/scene';

const PRESETS: Preset[] = ['const', 'spring', 'pw', 'custom'];
const CUSTOM = [1, 0.5, -1, -0.5];

describe('ch07 work as the area under F(x)', () => {
  it('piecewise force: rectangles, signed, reversed limits flip the sign', () => {
    const su = makeSetup('pw', CUSTOM);
    expect(work(su.prof, 0, 3)).toBeCloseTo(6, 12);
    expect(work(su.prof, 0, 8)).toBeCloseTo(6 - 4.5, 12);
    expect(work(su.prof, 4, 6)).toBeCloseTo(-1.5, 12);
    expect(work(su.prof, 6, 4)).toBeCloseTo(1.5, 12);
  });

  it('spring: W = −½k(x² − x0²) matches a fine Riemann sum', () => {
    const su = makeSetup('spring', CUSTOM);
    let s = 0;
    const N = 20000;
    for (let i = 0; i < N; i++) s += force(su.prof, -2 + (3.5 * (i + 0.5)) / N) * (3.5 / N);
    expect(work(su.prof, -2, 1.5)).toBeCloseTo(s, 8);
  });
});

describe('ch07 work-kinetic energy theorem along the simulated motion', () => {
  for (const pr of PRESETS) {
    it(`${pr}: K − K0 equals the work from the start at every sample`, () => {
      const su = makeSetup(pr, CUSTOM);
      const tj = trajectory(su, 240, 15);
      const K0 = kinetic(su.m, su.v0);
      for (let i = 0; i < tj.n; i += 7) {
        expect(kinetic(su.m, tj.v[i]) - K0).toBeCloseTo(work(su.prof, su.x0, tj.x[i]), 9);
      }
    });
  }

  it('constant force: reaches the end of the track at t = 4 s with K = 9 J', () => {
    const su = makeSetup('const', CUSTOM);
    const tj = trajectory(su, 240, 15);
    expect(tj.tEnd).toBeCloseTo(4, 9);
    expect(kinetic(su.m, tj.v[tj.n - 1])).toBeCloseTo(9, 9);
  });

  it('piecewise: K = 7 J after the push, 2.5 J at the end', () => {
    const su = makeSetup('pw', CUSTOM);
    const tj = trajectory(su, 240, 15);
    expect(kinetic(su.m, tj.v[tj.n - 1])).toBeCloseTo(2.5, 9);
    expect(tj.x[tj.n - 1]).toBe(8);
  });

  it('a strong opposing force turns the block back to the start', () => {
    const su = makeSetup('custom', [-1, -1, -1, -1]);
    const tj = trajectory(su, 240, 15);
    expect(tj.x[tj.n - 1]).toBe(0);
    expect(tj.v[tj.n - 1]).toBeCloseTo(-1, 9);
  });

  it('the exact step is consistent: two half steps equal one full step', () => {
    for (const pr of PRESETS) {
      const su = makeSetup(pr, CUSTOM);
      const a = advance(su, 2.9, 1.3, 0.4);
      const h = advance(su, 2.9, 1.3, 0.2);
      const b = advance(su, h.x, h.v, 0.2);
      expect(b.x).toBeCloseTo(a.x, 10);
      expect(b.v).toBeCloseTo(a.v, 10);
    }
  });

  it('the scene stops at the end of the run', () => {
    const r: Runner<any, any> = new Runner(workEnergy, defaults(workEnergy.params));
    r.play();
    for (let i = 0; i < 400 && r.playing; i++) r.advance(0.1);
    expect(r.playing).toBe(false);
    expect(r.state.x).toBe(8);
  });
});

describe('ch07 i18n', () => {
  it('every key used by the scene exists in both languages, with the same key sets', async () => {
    const page = (await import('../src/sims/ch07')).default;
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
