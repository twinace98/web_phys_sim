// Parameter sweeps with physics checks for the electromagnetism scenes changed in the
// 2026-11-11 review fixes (Ch 24, 26, 27, 28, 31). The site-wide param-sweep test covers
// finiteness and plot ranges; these add the physics that must hold at every setting.
import { describe, expect, it } from 'vitest';
import { defaults } from '../src/core/params';
import { Rng } from '../src/core/rng';
import { Runner } from '../src/core/runner';
import type { Scene } from '../src/core/types';
import { PRESETS, PRESET_LAYOUT, POINT_POOL, V } from '../src/sims/field/charges';
import { extendPath, workAlong } from '../src/sims/ch24/physics';
import { conduction } from '../src/sims/ch26/scene';
import { currentOf } from '../src/sims/ch26/physics';
import { rcCircuit } from '../src/sims/ch27/scene';
import { cyclotronScene } from '../src/sims/ch28/cyclotron';
import { lorentzScene } from '../src/sims/ch28/lorentz';
import { PARTICLES, maxEnergy, period, radius } from '../src/sims/ch28/physics';
import { freeScene } from '../src/sims/ch31/free';

/** Run to the end (or n steps) and return the runner. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyRunner = Runner<any, any>;
function run(scene: Scene, p: Record<string, unknown>, n = 40000, seed = 3): AnyRunner {
  const r: AnyRunner = new Runner(scene, p as never, seed);
  r.play();
  const h = scene.time!.h;
  for (let i = 0; i < n && r.playing; i++) r.advance(h / (scene.time!.scale ?? 1));
  return r;
}

const finiteChannels = (r: AnyRunner) => {
  const keys = Object.keys(r.scene.record?.(r.state, r.params) ?? { t: 0 });
  for (const k of keys) for (const v of r.hist.col(k)) expect(Number.isFinite(v) || Number.isNaN(v)).toBe(true);
};

describe('Ch 24: W = −q0 ΔV after wild drags, every preset', () => {
  it('random drags across all presets stay path-independent within 0.5 %', () => {
    const rng = new Rng(17);
    for (const pre of PRESETS) {
      const coords = POINT_POOL.coords(POINT_POOL.blank(), 0, PRESET_LAYOUT[pre]);
      const src = POINT_POOL.sources(coords);
      const path = [-0.15, 0.45];
      for (let k = 0; k < 60; k++) extendPath(src, path, 2.3 * rng.next() - 1.15, 1.5 * rng.next() - 0.75, 0.05, 6000);
      for (const c of src) extendPath(src, path, c.x + 1e-4, c.y, 0.05, 6000);
      const n = path.length;
      const exact = -(V(src, path[n - 2], path[n - 1]) - V(src, path[0], path[1]));
      const w = workAlong(src, path, 1);
      expect(Math.abs(w - exact)).toBeLessThan(0.005 * Math.max(Math.abs(exact), 1));
    }
  });
});

describe('Ch 26: measured current follows I = V/R at every setting', () => {
  it('V, T, L, A at min / max / odd values: I within the counting noise of the prediction', () => {
    const base = defaults(conduction.params);
    const cases = [
      {},
      { V: 0.1 },
      { V: 1.5 },
      { T: 200 },
      { T: 450 },
      { L: 2 },
      { L: 6 },
      { A: 1 },
      { A: 3 },
      { V: 0.7, T: 330, L: 3.5, A: 1.3 },
      { V: 1.3, T: 210, L: 5.5, A: 2.7 },
    ];
    for (const c of cases) {
      const p = { ...base, ...c };
      const r = run(conduction, p);
      finiteChannels(r);
      const I = conduction.readouts![0].value(r.state, p as never);
      const pred = currentOf({ L: p.L, A: p.A, T: p.T }, p.V) * 1e3;
      // ~1 mA spread at the default wire; allow 4 mA plus 6 %.
      expect(Math.abs(I - pred)).toBeLessThan(4 + 0.06 * pred);
    }
  });
});

describe('Ch 27: loop rule and readouts after switching and live R, C changes', () => {
  it('ε = iR + q/C holds at every recorded sample; readouts finite', () => {
    const base = defaults(rcCircuit.params);
    for (const [k, v] of [['R', 0.5], ['R', 4], ['R', 1.3], ['C', 100], ['C', 1000], ['C', 470], ['sw', 'discharge']] as const) {
      for (const paused of [false, true]) {
        const r = new Runner(rcCircuit, { ...base, C: k === 'C' && v === 1000 ? 100 : base.C }, 1);
        r.play();
        for (let i = 0; i < 400; i++) r.advance(1 / 120);
        if (paused) r.pause();
        r.setParam(k, v as never);
        for (const ro of rcCircuit.readouts!) expect(Number.isFinite(ro.value(r.state, r.params))).toBe(true);
        // Readout current follows the loop rule of the present switch position at once.
        const p = r.params;
        const i = rcCircuit.readouts!.find((x) => x.label === 'i')!.value(r.state, p) * 1e-3;
        const emf = p.sw === 'charge' ? 12 : 0;
        expect(i * p.R * 1e3 + r.state.q / (p.C * 1e-6)).toBeCloseTo(emf, 6);
        r.play();
        for (let n = 0; n < 400; n++) r.advance(1 / 120);
        finiteChannels(r);
      }
    }
  });
});

describe('Ch 28: cyclotron exit energy and the charged-particle circle at every setting', () => {
  it('in tune, every V0 leaves with (qBR)²/2m within 1 %; detuned runs stay finite', () => {
    const base = defaults(cyclotronScene.params);
    const kmax = maxEnergy({ pt: PARTICLES.proton, B: 1, R: 0.05, gap: 0.006, V0: 1e4, ratio: 1 }) / 1.602176634e-16;
    for (const V0 of [5, 6, 8, 11, 14, 17, 20]) {
      const r = run(cyclotronScene, { ...base, V0 }, 400000);
      finiteChannels(r);
      const K = cyclotronScene.readouts![0].value(r.state, r.params);
      expect(Math.abs(K / kmax - 1)).toBeLessThan(0.01);
    }
    for (const ratio of [0.9, 0.95, 0.97, 1.03, 1.1]) {
      for (const V0 of [5, 20]) {
        const r = run(cyclotronScene, { ...base, ratio, V0 }, 400000);
        finiteChannels(r);
        for (const ro of cyclotronScene.readouts!) expect(Number.isFinite(ro.value(r.state, r.params))).toBe(true);
        // Never above the extraction energy.
        for (const k of r.hist.col('K')) expect(k).toBeLessThan(1.01 * kmax);
      }
    }
  });

  it('every particle, B and speed: r readout = mv/|q|B, the orbit closes after one period', () => {
    const base = defaults(lorentzScene.params);
    for (const particle of ['proton', 'electron', 'alpha']) {
      for (const B of [0.5, 0.85, 1.35, 2]) {
        for (const v of [1, 1.7, 3]) {
          const p = { ...base, particle, Be: B, Bi: B, compare: false, v };
          const pt = PARTICLES[particle];
          const Bt = particle === 'electron' ? B * 1e-3 : B;
          const r = new Runner(lorentzScene, p as never, 1);
          const T = period(pt, Bt) * 1e9; // ns
          r.play();
          while (r.state.t < 1.5 * T) r.advance(lorentzScene.time!.h);
          const rr = lorentzScene.readouts![0].value(r.state, r.params);
          const rad = radius(pt, v * 1e6, Bt);
          expect(rr).toBeCloseTo(rad * 100, 6);
          // The trail covers the whole circle (no angular gap): the orbit closes on screen.
          const tr = (r.state as unknown as { trails: number[][] }).trails[0];
          const cy = pt.q > 0 ? rad : -rad;
          const ang = [];
          for (let i = 0; i < tr.length; i += 2) ang.push(Math.atan2(tr[i + 1] - cy, tr[i]));
          ang.sort((a, b) => a - b);
          let gap = ang[0] + 2 * Math.PI - ang[ang.length - 1];
          for (let i = 1; i < ang.length; i++) gap = Math.max(gap, ang[i] - ang[i - 1]);
          expect(gap).toBeLessThan(0.2);
        }
      }
    }
  });
});

describe("Ch 31: T' and energy at every R, L, C", () => {
  it("T' finite exactly when underdamped; U never rises", () => {
    const base = defaults(freeScene.params);
    for (const R of [0, 1, 37, 63, 64, 100]) {
      for (const [L, C] of [[5, 5], [5, 20], [20, 5], [20, 20], [13, 7]]) {
        const p = { ...base, R, L, C };
        const r = run(freeScene, p, 2400);
        finiteChannels(r);
        const Tp = freeScene.readouts![0].value(r.state, p as never);
        const under = R < 2 * Math.sqrt((L * 1e-3) / (C * 1e-6)) - 1e-9;
        expect(Number.isFinite(Tp)).toBe(under);
        const U = r.hist.col('U');
        for (let i = 1; i < U.length; i++) expect(U[i]).toBeLessThanOrEqual(U[i - 1] * (1 + 1e-9) + 1e-12);
      }
    }
  });
});
