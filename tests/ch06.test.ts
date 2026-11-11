import { describe, expect, it } from 'vitest';
import { defaults } from '../src/core/params';
import { Runner } from '../src/core/runner';
import { circular } from '../src/sims/ch06/circular';
import { friction } from '../src/sims/ch06/friction';
import {
  G,
  MATERIALS,
  SETUPS,
  criticalAngle,
  forces,
  lapTime,
  netForce,
  pullAt,
  required,
  slipTimePull,
  slipTimeTilt,
  tiltAt,
  topViewAt,
  type Preset,
} from '../src/sims/ch06/physics';

const PRESETS: Preset[] = ['string', 'flat', 'banked', 'cone'];

describe('ch06 friction: horizontal pull', () => {
  for (const [name, mat] of Object.entries(MATERIALS)) {
    const p = { m: 2, k: 4, mat };
    const ts = slipTimePull(p);

    it(`${name}: static friction equals the pull up to μs N, then drops to μk N`, () => {
      for (const t of [0, 0.3 * ts, 0.99 * ts]) {
        const s = pullAt(p, t);
        expect(s.f).toBeCloseTo(s.F, 12);
        expect(s.f).toBeLessThanOrEqual(mat.mus * s.N + 1e-12);
        expect(s.v).toBe(0);
      }
      expect(pullAt(p, ts).F).toBeCloseTo(mat.mus * 2 * G, 12);
      const after = pullAt(p, ts + 0.5);
      expect(after.f).toBeCloseTo(mat.muk * 2 * G, 12);
      expect(after.a).toBeCloseTo((after.F - after.f) / 2, 12);
    });

    it(`${name}: after the slip, v' = a and x' = v`, () => {
      const d = 1e-6;
      for (const t of [ts + 0.2, ts + 1]) {
        expect((pullAt(p, t + d).v - pullAt(p, t - d).v) / (2 * d)).toBeCloseTo(pullAt(p, t).a, 5);
        expect((pullAt(p, t + d).x - pullAt(p, t - d).x) / (2 * d)).toBeCloseTo(pullAt(p, t).v, 5);
      }
      expect(pullAt(p, ts + 1e-9).v).toBeCloseTo(0, 6);
    });
  }
});

describe('ch06 friction: tilting board', () => {
  it('sliding starts at tan θc = μs, independent of mass', () => {
    for (const mat of Object.values(MATERIALS)) {
      for (const m of [1, 5]) {
        const p = { m, w: 0.1, mat };
        const tc = slipTimeTilt(p);
        expect(Math.tan(tiltAt(p, tc).theta)).toBeCloseTo(mat.mus, 12);
        const before = tiltAt(p, 0.999 * tc);
        expect(before.sliding).toBe(false);
        expect(before.f).toBeCloseTo(m * G * Math.sin(before.theta), 12);
        expect(before.f).toBeLessThanOrEqual(mat.mus * before.N);
      }
    }
    expect((criticalAngle(MATERIALS.wood) * 180) / Math.PI).toBeCloseTo(26.565, 3);
  });

  it('once sliding: a = g (sin θc − μk cos θc), friction μk N', () => {
    const mat = MATERIALS.steel;
    const p = { m: 2, w: 0.1, mat };
    const s = tiltAt(p, slipTimeTilt(p) + 1);
    const th = criticalAngle(mat);
    expect(s.a).toBeCloseTo(G * (Math.sin(th) - mat.muk * Math.cos(th)), 12);
    expect(s.f).toBeCloseTo(mat.muk * 2 * G * Math.cos(th), 12);
    expect(s.v).toBeCloseTo(s.a, 12);
  });

  it('the scene stops after sliding in both modes', () => {
    for (const mode of ['pull', 'incline']) {
      const r: Runner<any, any> = new Runner(friction, { ...defaults(friction.params), mode });
      r.play();
      for (let i = 0; i < 400 && r.playing; i++) r.advance(0.1);
      expect(r.playing).toBe(false);
      expect(r.state.sliding).toBe(true);
    }
  });
});

describe('ch06 circular motion', () => {
  it('real forces add to a net force mv²/r toward the centre, zero vertically', () => {
    for (const pr of PRESETS) {
      const n = netForce(pr);
      expect(n.r).toBeCloseTo(required(SETUPS[pr]), 9);
      expect(n.z).toBeCloseTo(0, 9);
    }
  });

  it('banked curve and conical pendulum run at v² = g r tan θ', () => {
    for (const pr of ['banked', 'cone'] as const) {
      const s = SETUPS[pr];
      expect(s.v * s.v).toBeCloseTo(G * s.r * Math.tan(s.theta), 12);
    }
  });

  it('flat curve: the friction needed stays below μs mg (μs = 0.6, dry asphalt)', () => {
    const f = forces('flat').find((x) => x.name === 'f')!;
    expect(f.r).toBeLessThan(0.6 * SETUPS.flat.m * G);
  });

  it('cut string or icy road: no inward force, the object moves along the tangent', () => {
    for (const pr of ['string', 'flat', 'cone'] as const) expect(netForce(pr, true).r).toBe(0);
    const s = SETUPS.string;
    const tRel = lapTime(s) / 4;
    const a = topViewAt(s, tRel, tRel);
    const b = topViewAt(s, tRel + 0.3, tRel);
    expect(a.x).toBeCloseTo(s.r, 12);
    expect(b.x).toBeCloseTo(s.r, 12);
    expect(b.y - a.y).toBeCloseTo(s.v * 0.3, 12);
    expect(b.onCircle).toBe(false);
  });

  it('on the circle the speed is constant and the radius fixed', () => {
    const s = SETUPS.cone;
    for (const t of [0, 0.4, 1.3]) {
      const k = topViewAt(s, t);
      expect(Math.hypot(k.x, k.y)).toBeCloseTo(s.r, 12);
      expect(Math.hypot(k.vx, k.vy)).toBeCloseTo(s.v, 12);
    }
  });

  it('the scene runs without end unless the force is removed', () => {
    const p = defaults(circular.params);
    const r = new Runner(circular, p);
    expect(r.tEnd).toBe(Infinity);
    const r2 = new Runner(circular, { ...p, cut: true });
    r2.play();
    for (let i = 0; i < 100 && r2.playing; i++) r2.advance(0.1);
    expect(r2.playing).toBe(false);
  });
});

describe('ch06 i18n', () => {
  it('every key used by the scenes exists in both languages, with the same key sets', async () => {
    const page = (await import('../src/sims/ch06')).default;
    const { ko, en } = page.i18n;
    expect(Object.keys(ko).sort()).toEqual(Object.keys(en).sort());
    for (const s of page.scenes) {
      const keys: string[] = [s.title, ...s.info.goals, ...s.info.observe, ...(s.info.assumptions ?? [])];
      for (const spec of Object.values(s.params) as any[]) {
        keys.push(spec.label, spec.desc);
        for (const o of spec.options ?? []) keys.push(o.label);
      }
      for (const k of keys) {
        expect(ko[k], k).toBeTruthy();
        expect(en[k], k).toBeTruthy();
      }
    }
  });
});

describe('ch06 circular: after the release', () => {
  it('regression: the released object and its velocity arrow stay on stage until the run ends', () => {
    const base = defaults(circular.params) as any;
    for (const [preset, extra] of [
      ['string', { cut: true }],
      ['cone', { cut: true }],
      ['flat', { ice: true }],
    ] as const) {
      const p = { ...base, preset, ...extra };
      const tEnd = (circular.time!.tEnd as (q: any) => number)(p);
      const s = SETUPS[preset];
      const k = topViewAt(s, tEnd, lapTime(s) / 4);
      expect(k.onCircle).toBe(false);
      // Top view in units of r; velocity arrow 0.55 long; world top 1.75 with a 16 px margin.
      const y = k.y / s.r + (0.55 * k.vy) / s.v;
      expect(y, preset).toBeLessThan(1.6);
      // Before: the object travelled 1.6 r along the tangent, past the top of the stage.
      expect(k.y / s.r, preset).toBeGreaterThan(0.6);
    }
  });

  it('regression: the cut conical pendulum falls (free fall below the release point) instead of hanging in the air', () => {
    const base = defaults(circular.params) as any;
    const p = { ...base, preset: 'cone', cut: true };
    const run = new Runner(circular, p);
    run.play();
    for (let i = 0; i < 400 && run.playing; i++) run.advance(0.02);
    const s = SETUPS.cone;
    const tau = run.state.t - lapTime(s) / 4;
    expect(tau).toBeGreaterThan(0.15);
    const fall = 0.5 * G * tau * tau;
    // Drawn 1.4 world units per metre; mg arrow 0.75 long; world bottom −1.3.
    expect(-fall * 1.4 - 0.75).toBeGreaterThan(-1.2);
    expect(forces('cone', true).map((f) => f.name)).toEqual(['W']);
  });
});
