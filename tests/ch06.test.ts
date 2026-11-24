import { describe, expect, it } from 'vitest';
import { defaults, encode, fromQuery } from '../src/core/params';
import { Runner } from '../src/core/runner';
import { V_RANGE, circular, circularFormula, layout, setupOf } from '../src/sims/ch06/circular';
import { friction } from '../src/sims/ch06/friction';
import {
  G,
  MU_DRY,
  MU_ICE,
  bankFriction,
  bankNormal,
  coneAngle,
  designSpeed,
  setupAt,
  skidSpeed,
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
import { tn } from '../src/core/tex';
import { NUM, agrees, grab, val } from './sigma-digits';
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

describe('ch06 circular: panels on the stage', () => {
  // Measured stage sizes at 1280×800 and 390×844 (ko 704 / 636, en 679 / 608), and shorter ones.
  const SIZES = [
    [1280, 704],
    [1280, 679],
    [390, 661],
    [390, 636],
    [390, 608],
    [390, 560],
  ] as const;
  const V = { string: 'vString', flat: 'vFlat', banked: 'vBanked', cone: 'vCone' } as const;
  /** Every preset at the bottom, default and top of its speed range (flat on ice also around the skid speed). */
  const CASES: Record<string, unknown>[] = [];
  for (const [preset, extras] of [
    ['string', [{}, { cut: true }]],
    ['flat', [{}, { ice: true }]],
    ['banked', [{}]],
    ['cone', [{}, { cut: true }]],
  ] as const) {
    const [lo, hi] = V_RANGE[preset];
    const vs = [lo, SETUPS[preset].v, hi, ...(preset === 'flat' ? [4.42, 4.44] : [])];
    for (const extra of extras) for (const v of vs) CASES.push({ preset, ...extra, [V[preset]]: v });
  }
  type M = { x0: number; x1: number; y0: number; y1: number; text: string };
  const boxOf = (m: ProbeDraw['marks'][number]): M =>
    m.kind === 'arrow-label'
      ? { x0: m.x - m.w / 2, x1: m.x + m.w / 2, y0: m.y - 8, y1: m.y + 8, text: m.text ?? '' }
      : { x0: m.x, x1: m.x + m.w, y0: m.y - 8, y1: m.y + 8, text: m.text ?? '' };
  const hit = (a: M, b: M) => a.x0 < b.x1 && b.x0 < a.x1 && a.y0 < b.y1 && b.y0 < a.y1;

  it('the frames are titled; every label and arrow tip inside its panel, labels apart, over the speed range, from the start to the end of the run, rotating frame on and off', () => {
    for (const rot of [false, true])
      for (const [w, h] of SIZES) {
        const { boxes } = layout(w, h, rot);
        expect(boxes.length).toBe(rot ? 2 : 1);
        if (rot) expect(boxes[0].b).toBeLessThan(boxes[1].t);
        for (const over of CASES) {
          const p = { ...defaults(circular.params), ...over, rot } as any;
          const tEnd = (circular.time!.tEnd as (q: any) => number)(p);
          const lap = lapTime(setupOf(p));
          const times = Number.isFinite(tEnd) ? [0, lap / 8, lap / 4 + 0.01 * lap, (lap / 4 + tEnd) / 2, tEnd] : [0, lap / 8, lap / 3, 0.8 * lap];
          for (const t of times) {
            const tag = `${w}×${h} rot ${rot} ${JSON.stringify(over)} t = ${t.toFixed(3)}`;
            const g = probe(circular, { t, n: Math.round(t * 240) }, p, w, h);
            const labels = g.marks.filter((m) => m.kind === 'text' || m.kind === 'arrow-label').map(boxOf);
            const titles = labels.filter((m) => /^ch06\.c\.frame\./.test(m.text));
            expect(titles.length, tag).toBe(rot ? 2 : 1);
            const inBox = (x0: number, x1: number, y0: number, y1: number) => boxes.some((b) => x0 >= b.l - 1 && x1 <= b.r + 1 && y0 >= b.t - 1 && y1 <= b.b + 1);
            for (const m of labels) expect(inBox(m.x0, m.x1, m.y0, m.y1), `${tag} "${m.text}" at ${m.x0.toFixed(0)}..${m.x1.toFixed(0)}, ${m.y0.toFixed(0)}`).toBe(true);
            for (const m of g.marks.filter((q) => q.kind === 'arrow-tip')) expect(inBox(m.x, m.x, m.y, m.y), `${tag} tip at ${m.x.toFixed(0)}, ${m.y.toFixed(0)}`).toBe(true);
            for (let i = 0; i < labels.length; i++)
              for (let j = i + 1; j < labels.length; j++) expect(hit(labels[i], labels[j]), `${tag} "${labels[i].text}" / "${labels[j].text}"`).toBe(false);
          }
        }
      }
  });

  it('rotating frame off (default): one inertial panel on the whole stage, larger than with two panels; side view below the top view on a phone', () => {
    expect((circular.params as any).rot).toMatchObject({ kind: 'toggle', default: false, group: 'main', label: 'ch06.c.p.rot', desc: 'ch06.c.d.rot' });
    const wide = layout(1280, 704, false);
    expect(wide.stack).toBe(false);
    expect(wide.s).toBeGreaterThan(1.5 * layout(1280, 704, true).s);
    for (const [w, h] of [
      [390, 661],
      [390, 560],
    ]) {
      const one = layout(w, h, false);
      expect(one.stack, `${w}×${h}`).toBe(true);
      expect(one.s, `${w}×${h}`).toBeGreaterThan(1.3 * layout(w, h, true).s);
      expect(one.boxes[0].t).toBeGreaterThanOrEqual(0);
      expect(one.boxes[0].b).toBeLessThanOrEqual(h);
    }
  });

  it('the fictitious forces appear only with the rotating frame on: F_cf (and F_Cor after the release), each with its label', () => {
    const lap = lapTime(SETUPS.string);
    const count = (rot: boolean, t: number, re: RegExp) =>
      probe(circular, { t, n: 0 }, { ...defaults(circular.params), cut: true, rot } as any, 1280, 704).marks.filter((m) => re.test(m.text ?? '')).length;
    // Off: no fictitious force; F_net in the one top view before the release.
    expect(count(false, 0.1 * lap, /F\*_\{(cf|Cor)\}/)).toBe(0);
    expect(count(false, 0.1 * lap, /F\*_\{net\}/)).toBe(1);
    expect(count(false, 0.4 * lap, /F\*_\{(cf|Cor)\}/)).toBe(0);
    // On, before the release: F_cf in the rotating top view and side view; F_net in both top views.
    expect(count(true, 0.1 * lap, /F\*_\{cf\}/)).toBe(2);
    expect(count(true, 0.1 * lap, /F\*_\{Cor\}/)).toBe(0);
    expect(count(true, 0.1 * lap, /F\*_\{net\}/)).toBe(2);
    // After it: F_cf and F_Cor, no net real force.
    expect(count(true, 0.4 * lap, /F\*_\{cf\}/)).toBe(2);
    expect(count(true, 0.4 * lap, /F\*_\{Cor\}/)).toBe(1);
    expect(count(true, 0.4 * lap, /F\*_\{net\}/)).toBe(0);
  });

  it('rotating-frame toggle in the URL as 1/0, speed as a number; out-of-range speeds are ignored', () => {
    const p = fromQuery(circular.params, new URLSearchParams('preset=flat&vFlat=4.5&ice=1&rot=1')) as any;
    expect([p.preset, p.vFlat, p.ice, p.rot]).toEqual(['flat', 4.5, true, true]);
    expect((fromQuery(circular.params, new URLSearchParams('rot=0')) as any).rot).toBe(false);
    expect((fromQuery(circular.params, new URLSearchParams('vFlat=12')) as any).vFlat).toBe(SETUPS.flat.v);
    expect(encode(true)).toBe('1');
  });
});

describe('ch06 circular: speed slider', () => {
  const PRS: Preset[] = ['string', 'flat', 'banked', 'cone'];
  const KEY = { string: 'vString', flat: 'vFlat', banked: 'vBanked', cone: 'vCone' } as const;
  const sweep = (pr: Preset) => {
    const [lo, hi] = V_RANGE[pr];
    return Array.from({ length: 11 }, (_, i) => lo + ((hi - lo) * i) / 10);
  };

  it('one slider per situation on the main bar: default = the former fixed speed on the slider grid (QA 2026-11-24: 8.4462 and 1.6820 were off it)', () => {
    for (const pr of PRS) {
      const spec = (circular.params as any)[KEY[pr]];
      expect(spec).toMatchObject({ kind: 'number', control: 'slider', group: 'main', unit: 'm/s', label: 'ch06.c.p.v', desc: 'ch06.c.d.v' });
      // On the 0.01 m/s grid, within half a step of the former speed.
      expect(Math.abs(spec.default * 100 - Math.round(spec.default * 100))).toBeLessThan(1e-9);
      expect(Math.abs(spec.default - SETUPS[pr].v)).toBeLessThanOrEqual(0.005);
      expect(spec.min).toBeLessThan(spec.default);
      expect(spec.max).toBeGreaterThan(spec.default);
      for (const other of PRS) expect(spec.visibleIf({ preset: other }), `${pr} slider with ${other}`).toBe(other === pr);
      const s = setupOf({ ...(defaults(circular.params) as any), preset: pr });
      expect(s.v).toBe(spec.default);
      expect(s.r).toBeCloseTo(SETUPS[pr].r, pr === 'cone' ? 2 : 12);
      expect(s.theta).toBeCloseTo(SETUPS[pr].theta, pr === 'cone' ? 2 : 12);
    }
    expect((circular.params as any).vBanked.default).toBe(8.45);
    expect((circular.params as any).vCone.default).toBe(1.68);
  });

  it('over the range: real forces add to mv²/r inward and zero vertically', () => {
    for (const pr of PRS)
      for (const v of sweep(pr)) {
        const s = setupAt(pr, v);
        const n = netForce(pr, false, s);
        expect(n.r / required(s), `${pr} ${v}`).toBeCloseTo(1, 12);
        expect(n.z / (s.m * G), `${pr} ${v}`).toBeCloseTo(0, 12);
      }
  });

  it('flat curve: the dry road holds the car over the whole range; on ice the skid speed √(μs g r) = 4.43 m/s lies inside the range', () => {
    const [lo, hi] = V_RANGE.flat;
    expect(skidSpeed(SETUPS.flat, MU_DRY)).toBeGreaterThan(hi);
    const vIce = skidSpeed(SETUPS.flat, MU_ICE);
    expect(vIce).toBeCloseTo(Math.sqrt(0.1 * 9.8 * 20), 12);
    expect(vIce).toBeGreaterThan(lo + 1);
    expect(vIce).toBeLessThan(hi - 1);
    for (const v of sweep('flat')) {
      const p = { ...(defaults(circular.params) as any), preset: 'flat', vFlat: v };
      const s = setupOf(p);
      expect(required(s)).toBeLessThan(MU_DRY * s.m * G);
      // Dry road: never ends. Ice: ends (skids) only above the skid speed.
      expect((circular.time!.tEnd as (q: any) => number)(p)).toBe(Infinity);
      const tEndIce = (circular.time!.tEnd as (q: any) => number)({ ...p, ice: true });
      expect(Number.isFinite(tEndIce), `ice at ${v}`).toBe(v > vIce);
    }
  });

  it('flat curve on ice below the skid speed: friction keeps supplying mv²/r after the quarter lap; above it the inward force is gone', () => {
    const at = (v: number, t: number) => {
      const p = { ...(defaults(circular.params) as any), preset: 'flat', ice: true, vFlat: v };
      const ro = circular.readouts!;
      return { Fr: ro[1].value({ t, n: 0 } as any, p), need: ro[2].value({ t, n: 0 } as any, p), lines: circularFormula(p, t) };
    };
    // Past the quarter lap (on ice) at each speed.
    const late = (v: number) => lapTime(setupAt('flat', v)) / 4 + 0.5;
    const slow = at(4.3, late(4.3));
    expect(slow.Fr).toBeCloseTo(slow.need, 9);
    expect(slow.lines.some((l) => /^f_\{s,\\text\{max\}\} = \\mu_s mg = 0\.1 /.test(l) && /\\ge f_s/.test(l))).toBe(true);
    const fast = at(6, late(6));
    expect(fast.Fr).toBe(0);
    expect(fast.lines.some((l) => /^f_\{s,\\text\{max\}\} = \\mu_s mg = 0\.1 /.test(l) && /< \\frac\{mv\^2\}\{r\}/.test(l))).toBe(true);
    // Before the quarter lap the dry road: μs = 0.6.
    expect(at(6, 0).lines.some((l) => /= 0\.6 \\times/.test(l))).toBe(true);
  });

  it('banked curve: no friction at the design speed √(g r tan θ); above it friction down the slope, below it up the slope, always within μs N', () => {
    const vd = designSpeed(SETUPS.banked);
    expect(vd).toBeCloseTo(SETUPS.banked.v, 12);
    expect(forces('banked').map((f) => f.name)).toEqual(['W', 'N']);
    for (const v of sweep('banked')) {
      const s = setupAt('banked', v);
      const f = bankFriction(s);
      if (Math.abs(v - vd) > 1e-6) expect(Math.sign(f), `${v}`).toBe(Math.sign(v - vd));
      expect(Math.abs(f)).toBeLessThan(MU_DRY * bankNormal(s));
      const ff = forces('banked', false, s).find((x) => x.name === 'f');
      if (ff) {
        // Down the slope = inward and down.
        expect(Math.sign(ff.r)).toBe(Math.sign(f));
        expect(Math.sign(ff.z)).toBe(-Math.sign(f));
      }
    }
  });

  it('conical pendulum: tan θ = v²/(g r) with r = L sin θ; 30° at the default, a faster pendulum tilts more', () => {
    expect(setupAt('cone', SETUPS.cone.v).theta).toBeCloseTo(SETUPS.cone.theta, 12);
    let last = 0;
    for (const v of sweep('cone')) {
      const s = setupAt('cone', v);
      expect(Math.tan(s.theta)).toBeCloseTo((v * v) / (G * s.r), 12);
      expect(s.r).toBeCloseTo(Math.sin(s.theta), 12);
      expect(s.theta).toBeGreaterThan(last);
      last = s.theta;
    }
    expect(coneAngle(V_RANGE.cone[0]) / (Math.PI / 180)).toBeGreaterThan(20);
    expect(coneAngle(V_RANGE.cone[1]) / (Math.PI / 180)).toBeLessThan(45);
  });

  it('readouts follow v; the top-view arrows use one fixed scale per situation (longer arrow for a larger v)', () => {
    for (const pr of PRS) {
      const lens = sweep(pr).map((v) => {
        const p = { ...(defaults(circular.params) as any), preset: pr, [KEY[pr]]: v };
        expect(circular.readouts![0].value({ t: 0, n: 0 } as any, p)).toBeCloseTo(v, 12);
        expect(circular.readouts![2].value({ t: 0, n: 0 } as any, p)).toBeCloseTo(required(setupAt(pr, v)), 9);
        const g = probe(circular, { t: 0, n: 0 }, p, 1280, 704);
        const tips = g.marks.filter((m) => m.kind === 'arrow-tip');
        // Top view: velocity tip first, then the net force; the object starts at the bottom of the circle.
        return [tips[0].x, tips[1].y];
      });
      for (let i = 1; i < lens.length; i++) {
        expect(lens[i][0], `${pr} v arrow`).toBeGreaterThan(lens[i - 1][0]);
        expect(lens[i][1], `${pr} F arrow`).toBeLessThan(lens[i - 1][1]);
      }
    }
  });

  it('regression: at a low speed the short-arrow labels F_net and f_s stay off the car', () => {
    for (const [w, h] of [
      [1280, 704],
      [390, 636],
    ]) {
      const p = { ...(defaults(circular.params) as any), preset: 'flat', vFlat: 2 };
      const { s } = layout(w, h, false);
      const g = probe(circular, { t: 0, n: 0 }, p, w, h);
      // Top view at t = 0: the car at the bottom, velocity along +x, so its tip is level with the car.
      const tipV = g.marks.find((m) => m.kind === 'arrow-tip')!;
      const net = g.marks.find((m) => m.text === '*F*_{net}')!;
      // Label centre above the car's inner edge (0.06 r) by more than half a text height.
      expect(tipV.y - net.y, `${w}`).toBeGreaterThan(0.06 * s + 8);
      // Side view: f_s ends left of the car (half length 0.18 world units), the car centred under N.
      const n = g.marks.find((m) => m.text === '*N*')!;
      const fs = g.marks.find((m) => m.text === '*f*_{s}')!;
      expect(fs.x + fs.w, `${w}`).toBeLessThan(n.x - 0.18 * s);
    }
  });

  it('Σ: with the rotating frame on, the radial forces in that frame add to zero (ΣF′ = F_net,r − F_cf = 0); off, no rotating-frame lines', () => {
    for (const pr of PRS) {
      const base = { ...(defaults(circular.params) as any), preset: pr };
      const off = circularFormula(base, 0.1);
      expect(off.some((l) => /omega|F_\\text\{cf\}|F'_r/.test(l)), pr).toBe(false);
      const on = circularFormula({ ...base, rot: true }, 0.1);
      const sum = on.find((l) => l.startsWith("\\sum F'_r = F_{\\text{net},r} - F_\\text{cf} = "));
      expect(sum, pr).toBeTruthy();
      // Both are mv²/r: the rounding residue prints as an exact 0 (policy D, R7a).
      expect(sum).toMatch(/= 0\\ \\mathrm\{N\}$/);
    }
  });

  it('every new ⓘ / control key exists in ko and en; the rotating frame is called 비관성계', async () => {
    const { ko, en } = (await import('../src/sims/ch06')).default.i18n;
    for (const k of ['ch06.c.p.v', 'ch06.c.d.v', 'ch06.c.p.rot', 'ch06.c.d.rot', 'ch06.c.obs.v', 'ch06.c.obs.bank', 'ch06.c.obs.cone', 'ch06.c.obs.cut', 'ch06.c.obs.rot']) {
      expect(ko[k], k).toBeTruthy();
      expect(en[k], k).toBeTruthy();
    }
    expect(ko['ch06.c.p.rot']).toBe('비관성계 (회전) 보기');
    for (const [k, v] of Object.entries(ko)) if (k.startsWith('ch06.c.')) expect(v, k).not.toContain('회전 기준계');
    for (const [k, v] of Object.entries(en)) if (k.startsWith('ch06.c.')) expect(v, k).not.toMatch(/—/);
  });
});

describe('ch06 circular: Σ arithmetic on the printed numbers gives the printed result, over the speed range', () => {
  const N = NUM;
  const DEG = Math.PI / 180;
  const KEY = { string: 'vString', flat: 'vFlat', banked: 'vBanked', cone: 'vCone' } as const;
  const sweep = (pr: Preset) => {
    const [lo, hi] = V_RANGE[pr];
    return [...Array.from({ length: 9 }, (_, i) => Number((lo + ((hi - lo) * i) / 8).toFixed(2))), SETUPS[pr].v];
  };
  const find = (lines: string[], head: string) => lines.find((l) => l.startsWith(head))!;

  it('mv²/r, the banked friction f_s, the cone r and mg tan θ, the flat f_s,max', () => {
    for (const pr of PRESETS)
      for (const v of sweep(pr)) {
        const p = { ...(defaults(circular.params) as any), preset: pr, [KEY[pr]]: v };
        const lines = circularFormula(p, 0);
        const tag = `${pr} v = ${v}`;
        if (pr !== 'cone') {
          const [m, vv, r, res] = grab(find(lines, '\\frac{mv^2}{r} = \\frac{'), new RegExp(`\\\\frac\\{(${N}) \\\\times (${N})\\^2\\}\\{(${N})\\} = (${N})`));
          expect(agrees((val(m) * val(vv) ** 2) / val(r), res), `${tag} mv²/r`).toBe(true);
        }
        if (pr === 'banked') {
          // v² − v_d² is a small difference near the design speed: printed as one number computed
          // directly (policy D, R5), so the line recomputes within R3's tolerance at every speed.
          const i = lines.indexOf('f_s = \\frac{m\\,(v^2 - v_\\text{d}^2)}{r}\\cos\\theta');
          expect(i, tag).toBeGreaterThanOrEqual(0);
          const re = new RegExp(`^= \\\\frac\\{(${N}) \\\\times \\(?(${N})\\)?\\}\\{(${N})\\}\\\\cos (${N})\\^\\\\circ = (${N})`);
          const [m, d, r, th, res] = grab(lines[i + 1], re);
          const st = setupOf(p);
          expect(d, tag).toBe(tn(st.v * st.v - G * st.r * Math.tan(st.theta)));
          expect(agrees(((val(m) * val(d)) / val(r)) * Math.cos(val(th) * DEG), res), `${tag} f_s`).toBe(true);
        }
        if (pr === 'cone') {
          const [L, th, r] = grab(find(lines, 'r = L'), new RegExp(`= (${N}) \\\\times \\\\sin (${N})\\^\\\\circ = (${N})`));
          expect(agrees(val(L) * Math.sin(val(th) * DEG), r), `${tag} r`).toBe(true);
          const [m, g, th2, res] = grab(find(lines, '\\frac{mv^2}{r} = mg'), new RegExp(`= (${N}) \\\\times (${N})\\\\tan (${N})\\^\\\\circ = (${N})`));
          expect(agrees(val(m) * val(g) * Math.tan(val(th2) * DEG), res), `${tag} mg tan θ`).toBe(true);
        }
        if (pr === 'flat') {
          const [mu, m, g, res] = grab(find(lines, 'f_{s,'), new RegExp(`= (${N}) \\\\times (${N}) \\\\times (${N}) = (${N})`));
          expect(agrees(val(mu) * val(m) * val(g), res), `${tag} f_s,max`).toBe(true);
        }
      }
  });
});
