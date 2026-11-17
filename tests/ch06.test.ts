import { describe, expect, it } from 'vitest';
import { defaults } from '../src/core/params';
import { Runner } from '../src/core/runner';
import { circular, layout } from '../src/sims/ch06/circular';
import { friction } from '../src/sims/ch06/friction';
import {
  G,
  MATERIALS,
  SETUPS,
  criticalAngle,
  fictitious,
  forces,
  lapTime,
  netForce,
  omega,
  pullAt,
  required,
  slipTimePull,
  slipTimeTilt,
  rotatingViewAt,
  tiltAt,
  topViewAt,
  type Preset,
} from '../src/sims/ch06/physics';
import { ProbeDraw, probe } from './stage-probe';

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
      // Top view in units of r; velocity arrow 0.55 long; inertial panel top 1.75.
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

describe('ch06 circular: the frame rotating with the object', () => {
  it('regression: before the release the object rests at (0, −r) and the real net force plus the centrifugal force is zero', () => {
    for (const pr of PRESETS) {
      const s = SETUPS[pr];
      const F = netForce(pr);
      expect(F.z).toBeCloseTo(0, 9);
      for (const t of [0, 0.13, 0.5 * lapTime(s), 2.7 * lapTime(s)]) {
        const q = rotatingViewAt(s, t);
        expect(q.onCircle).toBe(true);
        expect(Math.hypot(q.x, q.y + s.r)).toBeLessThan(1e-12 * s.r);
        // v′ = 0, so no Coriolis force.
        expect(Math.hypot(q.vx, q.vy)).toBeLessThan(1e-12 * s.v);
        const { cf, cor } = fictitious(s, q);
        expect(Math.hypot(cor.x, cor.y)).toBeLessThan(1e-9 * F.r);
        // Real net force: F.r toward the axis.
        const d = Math.hypot(q.x, q.y);
        const real = { x: (-F.r * q.x) / d, y: (-F.r * q.y) / d };
        expect(Math.hypot(real.x + cf.x, real.y + cf.y), pr).toBeLessThan(1e-9 * F.r);
        expect(Math.hypot(cf.x, cf.y)).toBeCloseTo(s.m * omega(s) ** 2 * s.r, 9);
      }
    }
  });

  it('after the release the path seen from the rotating frame has a′ = (F_cf + F_Cor)/m', () => {
    for (const pr of ['string', 'flat', 'cone'] as const) {
      const s = SETUPS[pr];
      const tRel = lapTime(s) / 4;
      const dt = 1e-4 * lapTime(s);
      for (const tau of [0.02, 0.1, 0.25, 0.5, 0.95].map((k) => (k * s.r) / s.v)) {
        const t = tRel + tau;
        const a = rotatingViewAt(s, t - dt, tRel);
        const b = rotatingViewAt(s, t + dt, tRel);
        const q = rotatingViewAt(s, t, tRel);
        const acc = { x: (b.vx - a.vx) / (2 * dt), y: (b.vy - a.vy) / (2 * dt) };
        const { cf, cor } = fictitious(s, q);
        const want = { x: (cf.x + cor.x) / s.m, y: (cf.y + cor.y) / s.m };
        const scale = s.v * omega(s);
        expect(Math.hypot(acc.x - want.x, acc.y - want.y) / scale, `${pr} τ = ${tau}`).toBeLessThan(1e-6);
        // v′ is the time derivative of x′.
        const vel = { x: (b.x - a.x) / (2 * dt), y: (b.y - a.y) / (2 * dt) };
        expect(Math.hypot(vel.x - q.vx, vel.y - q.vy) / s.v).toBeLessThan(1e-6);
      }
    }
  });

  it('after the release the rotating-frame path moves outward and bends backward (clockwise), while the inertial path is straight', () => {
    const s = SETUPS.string;
    const tRel = lapTime(s) / 4;
    let r0 = s.r;
    let ang0 = -Math.PI / 2;
    for (const k of [0.2, 0.4, 0.6, 0.8, 0.95]) {
      const q = rotatingViewAt(s, tRel + (k * s.r) / s.v, tRel);
      const r = Math.hypot(q.x, q.y);
      const ang = Math.atan2(q.y, q.x);
      expect(r).toBeGreaterThan(r0);
      expect(ang).toBeLessThan(ang0);
      r0 = r;
      ang0 = ang;
      // Exact: x″ = r (cos θ + θ sin θ, −sin θ + θ cos θ) in the release-aligned frame, θ = ωτ.
      expect(r).toBeCloseTo(s.r * Math.hypot(1, k), 12);
    }
  });
});

describe('ch06 circular: two panels on the stage', () => {
  const SIZES = [
    [1280, 704],
    [390, 661],
    [390, 560],
  ] as const;
  const CASES = [{}, { cut: true }, { preset: 'flat' }, { preset: 'flat', ice: true }, { preset: 'banked' }, { preset: 'cone' }, { preset: 'cone', cut: true }];
  type M = { x0: number; x1: number; y0: number; y1: number; text: string };
  const boxOf = (m: ProbeDraw['marks'][number]): M =>
    m.kind === 'arrow-label'
      ? { x0: m.x - m.w / 2, x1: m.x + m.w / 2, y0: m.y - 8, y1: m.y + 8, text: m.text ?? '' }
      : { x0: m.x, x1: m.x + m.w, y0: m.y - 8, y1: m.y + 8, text: m.text ?? '' };
  const hit = (a: M, b: M) => a.x0 < b.x1 && b.x0 < a.x1 && a.y0 < b.y1 && b.y0 < a.y1;

  it('both frames titled; every label inside its panel and apart from the others, from the start to the end of the run', () => {
    for (const [w, h] of SIZES) {
      const { boxes } = layout(w, h);
      expect(boxes[0].b).toBeLessThan(boxes[1].t);
      for (const over of CASES) {
        const p = { ...defaults(circular.params), ...over } as any;
        const tEnd = (circular.time!.tEnd as (q: any) => number)(p);
        const lap = lapTime(SETUPS[p.preset as Preset]);
        const times = Number.isFinite(tEnd) ? [0, lap / 8, lap / 4 + 0.01 * lap, (lap / 4 + tEnd) / 2, tEnd] : [0, lap / 8, lap / 3];
        for (const t of times) {
          const tag = `${w}×${h} ${JSON.stringify(over)} t = ${t.toFixed(3)}`;
          const g = probe(circular, { t, n: Math.round(t * 240) }, p, w, h);
          const labels = g.marks.filter((m) => m.kind === 'text' || m.kind === 'arrow-label').map(boxOf);
          const titles = labels.filter((m) => /^ch06\.c\.frame\./.test(m.text));
          expect(titles.length, tag).toBe(2);
          for (const m of labels) {
            const inside = boxes.some((b) => m.x0 >= b.l - 1 && m.x1 <= b.r + 1 && m.y0 >= b.t - 1 && m.y1 <= b.b + 1);
            expect(inside, `${tag} "${m.text}" at ${m.x0.toFixed(0)}..${m.x1.toFixed(0)}, ${m.y0.toFixed(0)}`).toBe(true);
          }
          for (let i = 0; i < labels.length; i++)
            for (let j = i + 1; j < labels.length; j++) expect(hit(labels[i], labels[j]), `${tag} "${labels[i].text}" / "${labels[j].text}"`).toBe(false);
        }
      }
    }
  });

  it('the rotating frame draws the centrifugal force (and the Coriolis force after the release), the inertial frame does not', () => {
    const p = { ...defaults(circular.params), cut: true } as any;
    const lap = lapTime(SETUPS.string);
    const count = (t: number, re: RegExp) => probe(circular, { t, n: 0 }, p, 1280, 704).marks.filter((m) => re.test(m.text ?? '')).length;
    // Before the release: F_cf in the rotating top view and side view; F_net in both top views.
    expect(count(0.1 * lap, /F\*_\{cf\}/)).toBe(2);
    expect(count(0.1 * lap, /F\*_\{Cor\}/)).toBe(0);
    expect(count(0.1 * lap, /F\*_\{net\}/)).toBe(2);
    // After it: F_cf and F_Cor, no net real force.
    expect(count(0.4 * lap, /F\*_\{cf\}/)).toBe(2);
    expect(count(0.4 * lap, /F\*_\{Cor\}/)).toBe(1);
    expect(count(0.4 * lap, /F\*_\{net\}/)).toBe(0);
  });
});
