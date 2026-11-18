// Free-body-diagram toggle in the Ch 2, 4, 5 and 7 scenes: the toggle exists, the drawn forces
// (from the scenes' own force functions) sum to m·a at many states, the arrows drawn from the body
// match those forces, and no label overlaps another at the 1280 px and 390 px stage sizes.
import { describe, expect, it } from 'vitest';
import { defaults } from '../src/core/params';
import { Runner } from '../src/core/runner';
import type { Params, Scene, Vec2 } from '../src/core/types';
import type { ArrowStyle } from '../src/draw/draw';
import { FBD_ZERO, type FbdForce } from '../src/draw/fbd';
import { freefall, freefallForces } from '../src/sims/ch02/freefall';
import { G as GS, stateAt as projAt } from '../src/sims/ch04/physics';
import { projectile, projectileForces } from '../src/sims/ch04/scene';
import { FIRST_M, first, firstFbd, firstStep } from '../src/sims/ch05/first';
import { FRAMES_M, frames, framesFbd } from '../src/sims/ch05/frames';
import { newton, newtonFbd } from '../src/sims/ch05/newton';
import { ballGround, ballInTrain } from '../src/sims/ch05/physics';
import { workEnergy, workFbd } from '../src/sims/ch07/scene';
import { M as M7, advance, force, makeSetup } from '../src/sims/ch07/physics';
import { ProbeDraw, type Mark } from './stage-probe';

/** Probe that also keeps every arrow (start, vector, dashed) in world units. */
class ArrowProbe extends ProbeDraw {
  readonly arrows: {
    from: Vec2;
    vec: Vec2;
    dash: boolean;
    kinematic: boolean;
  }[] = [];
  override arrow(from: Vec2, vec: Vec2, st: ArrowStyle = {}): void {
    super.arrow(from, vec, st);
    this.arrows.push({
      from,
      vec,
      dash: !!st.dash,
      kinematic: st.role === 'velocity' || st.role === 'acceleration',
    });
  }
}

function probeAt<P extends Params, S extends { t: number }>(scene: Scene<P, S>, s: S, p: P, w: number, h: number, narrow = false): ArrowProbe {
  const G = globalThis as unknown as { window?: unknown };
  const had = 'window' in G;
  const old = G.window;
  // Ch 7 lays out for phones through matchMedia.
  if (narrow) G.window = { matchMedia: () => ({ matches: true }) };
  try {
    const g = new ArrowProbe(w, h);
    g.vp.fit(scene.world(p), w, h);
    scene.draw(g, s, p, {
      t: s.t,
      cursorT: s.t,
      scrubbing: false,
      lecture: false,
    });
    return g;
  } finally {
    if (narrow) {
      if (had) G.window = old;
      else delete G.window;
    }
  }
}

const sum = (fs: readonly FbdForce[]) => fs.reduce((a, f) => ({ x: a.x + f.F.x, y: a.y + f.F.y }), { x: 0, y: 0 });
const present = (fs: readonly FbdForce[]) => fs.filter((f) => Math.hypot(f.F.x, f.F.y) > FBD_ZERO);

/** Runner states at fractions of the run (0 = start, 1 = end). */
function statesAt<P extends Params, S extends { t: number }>(scene: Scene<P, S>, p: P, fr = [0, 0.3, 0.5, 0.8, 1]): S[] {
  const r = new Runner(scene, p, 3);
  const tEnd = r.tEnd ?? 6;
  const out: S[] = [];
  for (const f of fr) {
    let n = 0;
    while (r.state.t < f * tEnd - 1e-9 && !r.done && n++ < 100000) r.stepFrame();
    out.push(structuredClone(r.state) as S);
  }
  return out;
}

/** Labels (FBD texts and arrow labels) that overlap another text on the stage. */
function overlaps(marks: Mark[], isFbd: (m: Mark) => boolean): string[] {
  const texts = marks.filter((m) => m.kind === 'text' || m.kind === 'arrow-label');
  const bad: string[] = [];
  for (let i = 0; i < texts.length; i++)
    for (let j = i + 1; j < texts.length; j++) {
      const a = texts[i];
      const b = texts[j];
      if (!isFbd(a) && !isFbd(b)) continue;
      const apart = a.x + a.w <= b.x || b.x + b.w <= a.x || Math.abs(a.y - b.y) >= 14;
      if (!apart) bad.push(`${a.text} (${a.x.toFixed(0)}, ${a.y.toFixed(0)}) / ${b.text} (${b.x.toFixed(0)}, ${b.y.toFixed(0)})`);
    }
  return bad;
}

/**
 * The arrows drawn from the body centre `c`: one per nonzero force, in its direction, dashed for
 * field forces. Returns the mismatches.
 */
function arrowsMatch(g: ArrowProbe, c: Vec2, forces: readonly FbdForce[]): string[] {
  const at = g.arrows.filter((a) => !a.kinematic && Math.hypot(a.from.x - c.x, a.from.y - c.y) < 1e-9);
  const want = present(forces);
  const bad: string[] = [];
  if (at.length !== want.length) bad.push(`${at.length} arrows from the centre, ${want.length} forces`);
  for (const f of want) {
    const m = Math.hypot(f.F.x, f.F.y);
    const hit = at.find((a) => {
      const l = Math.hypot(a.vec.x, a.vec.y);
      return Math.abs(a.vec.x / l - f.F.x / m) < 1e-9 && Math.abs(a.vec.y / l - f.F.y / m) < 1e-9 && a.dash === !!f.field;
    });
    if (!hit) bad.push(`no arrow for ${f.label}`);
  }
  return bad;
}

const LABEL = /^\*(m\*\*g|N|F|f)\*/;
const SIDE = [
  [768, 640, 0],
  [390, 500, 0],
];
const STACK = [
  [1280, 192, 0],
  [390, 230, 0],
];
const SOLO = [
  [1280, 700, 0],
  [390, 600, 1],
];

function toggleOf(scene: Scene): void {
  const spec = scene.params.fbd as any;
  expect(spec, `${scene.id}: fbd toggle`).toBeTruthy();
  expect(spec.kind).toBe('toggle');
  expect(spec.label).toBe('fbd.p');
  expect(spec.desc).toBe('fbd.d');
  expect(spec.group).toBe('main');
  expect(spec.default).toBe(false);
}

describe('free-body-diagram toggle: present in each changed scene', () => {
  it('free fall, projectile, first law, second law, inertial frames, work-energy', () => {
    for (const s of [freefall, projectile, first, newton, frames, workEnergy] as Scene[]) toggleOf(s);
  });
});

describe('Ch 2 free fall', () => {
  const base = { ...(defaults(freefall.params) as any), fbd: true };
  const cases = ['drop', 'up', 'down'].flatMap((th) => [5, 20, 45].map((h) => ({ ...base, throw: th, h })));

  it('ΣF = m a: mg alone gives a = −g at every instant, the top of the throw included', () => {
    for (const p of cases)
      for (const s of statesAt(freefall, p)) {
        for (const m of [0.1, 1, 7]) {
          const F = sum(freefallForces(m));
          expect(F.x).toBe(0);
          expect(F.y / m).toBeCloseTo(s.a, 12);
        }
      }
  });

  it('draws mg from the ball centre, dashed; no a arrow; labels apart at 1280 and 390 px', () => {
    for (const p of [...cases, { ...base, vectors: false }, { ...base, strobe: false }])
      for (const s of statesAt(freefall, p))
        for (const [w, h] of SIDE) {
          const g = probeAt(freefall, s, p, w, h);
          expect(arrowsMatch(g, { x: 0, y: s.y }, freefallForces())).toEqual([]);
          expect(g.marks.some((m) => m.text === '*a*')).toBe(false);
          expect(overlaps(g.marks, (m) => LABEL.test(m.text ?? ''))).toEqual([]);
        }
  });
});

describe('Ch 4 projectile', () => {
  const base = { ...(defaults(projectile.params) as any), fbd: true };
  const cases: any[] = [];
  for (const theta of [0, 30, 75]) for (const h of [0, 40]) for (const v0 of [10, 25]) for (const g of ['earth', 'mars', 'moon']) cases.push({ ...base, theta, h, v0, g });

  it('ΣF = m a: mg alone gives a = (0, −g), checked against the motion', () => {
    for (const p of cases) {
      const l = {
        h: p.h,
        v0: p.v0,
        theta: (p.theta * Math.PI) / 180,
        g: GS[p.g],
      };
      for (const s of statesAt(projectile, p)) {
        const dt = 1e-3;
        const a0 = projAt(l, s.t);
        const a1 = projAt(l, s.t + dt);
        const F = sum(projectileForces(l.g, 2));
        expect(F.x / 2).toBeCloseTo((a1.vx - a0.vx) / dt, 9);
        expect(F.y / 2).toBeCloseTo((a1.vy - a0.vy) / dt, 9);
      }
    }
  });

  it('mg dashed from the ball; labels (mg, v, v_x, v_y, ticks) apart at 1280 and 390 px', () => {
    for (const p of [...cases, { ...base, vectors: false }])
      for (const s of statesAt(projectile, p))
        for (const [w, h] of SIDE) {
          const g = probeAt(projectile, s, p, w, h);
          expect(arrowsMatch(g, { x: s.x, y: s.y }, projectileForces(GS[p.g]))).toEqual([]);
          const bad = overlaps(g.marks, (m) => LABEL.test(m.text ?? ''));
          expect(bad, `${JSON.stringify(p)} t=${s.t.toFixed(2)} ${w}px`).toEqual([]);
        }
  });
});

describe('Ch 5 first law', () => {
  const base = { ...(defaults(first.params) as any), fbd: true };
  const cases: any[] = [];
  for (const mu of [0, 0.12, 0.3]) for (const push of [false, true]) for (const v0 of [1, 3, 5]) cases.push({ ...base, mu, push, v0 });

  it('ΣF = m a: f_k + F horizontally (a from one exact step), N − mg = 0', () => {
    for (const p of cases)
      for (const s of statesAt(first, p)) {
        const F = sum(firstFbd(s));
        expect(F.y).toBeCloseTo(0, 12);
        const h = 1e-4;
        const nx = firstStep(s.x, s.v, p.mu, p.push, h);
        // While sliding through the step (or at rest) the step's acceleration is exact.
        if (s.v <= 0 || nx.v > 0) expect(F.x / FIRST_M).toBeCloseTo((nx.v - s.v) / h, 9);
      }
  });

  it('forces shown: f_k only while sliding with friction, F only with the push', () => {
    const labels = (s: any) =>
      present(firstFbd(s))
        .map((f) => f.label)
        .sort();
    const [s0] = statesAt(first, { ...base, mu: 0.3, push: true });
    expect(labels(s0)).toEqual(['*F*', '*N*', '*f*_{k}', '*m**g*']);
    const end = statesAt(first, { ...base, mu: 0.3, v0: 1 }, [1])[0];
    expect(end.v).toBe(0);
    expect(labels(end)).toEqual(['*N*', '*m**g*']);
  });

  it('arrows from the puck centre; labels apart from each other and the tick numbers at 1280 and 390 px', () => {
    for (const p of cases)
      for (const s of statesAt(first, p))
        for (const [w, h] of STACK) {
          const g = probeAt(first, s, p, w, h);
          expect(arrowsMatch(g, { x: s.x, y: g.px(10) }, firstFbd(s))).toEqual([]);
          expect(
            overlaps(g.marks, (m) => LABEL.test(m.text ?? '')),
            `${JSON.stringify(p)} t=${s.t} ${w}`,
          ).toEqual([]);
        }
  });
});

describe('Ch 5 second law', () => {
  const base = { ...(defaults(newton.params) as any), fbd: true };
  const cases: any[] = [];
  for (const m of [1, 2.6, 5]) for (const F of [0.5, 4, 5]) cases.push({ ...base, m, F });

  it('ΣF = m a: F horizontally, N − mg = 0', () => {
    for (const p of cases)
      for (const s of statesAt(newton, p)) {
        const F = sum(newtonFbd(s, p));
        expect(F.x).toBeCloseTo(p.m * s.a, 12);
        expect(F.y).toBeCloseTo(0, 12);
      }
  });

  it('arrows from the puck centre; labels apart at 1280 and 390 px', () => {
    for (const p of cases)
      for (const s of statesAt(newton, p))
        for (const [w, h] of STACK) {
          const g = probeAt(newton, s, p, w, h);
          expect(arrowsMatch(g, { x: s.x, y: g.px(10) }, newtonFbd(s, p))).toEqual([]);
          expect(overlaps(g.marks, (m) => LABEL.test(m.text ?? ''))).toEqual([]);
        }
  });
});

describe('Ch 5 inertial frames', () => {
  const base = { ...(defaults(frames.params) as any), fbd: true };
  const cases: any[] = [];
  for (const frame of ['ground', 'train'])
    for (const motion of ['uniform', 'accel']) for (const A of [0.5, 1.3, 2]) for (const pseudo of [true, false]) cases.push({ ...base, frame, motion, A, pseudo });

  it('real forces N and mg sum to zero; with the pseudo force, ΣF = m a′ in the accelerating train', () => {
    for (const p of cases) {
      const tr = { v0: 2, A: p.motion === 'accel' ? p.A : 0, b0: 2.5 };
      for (const s of statesAt(frames, p)) {
        const { real, pseudo } = framesFbd(p);
        const F = sum(real);
        expect(F.x).toBe(0);
        expect(F.y).toBeCloseTo(0, 12);
        const a = (p.frame === 'train' ? ballInTrain(tr, s.t) : ballGround(tr, s.t)).a;
        if (p.frame === 'train' && tr.A > 0) {
          // Non-inertial: the real forces alone miss m a′ by m a_0; the pseudo force closes the gap.
          expect(FRAMES_M * a).toBeCloseTo(-FRAMES_M * tr.A, 12);
          expect(pseudo).toBe(p.pseudo ? -FRAMES_M * tr.A : 0);
          if (p.pseudo) expect(F.x + pseudo).toBeCloseTo(FRAMES_M * a, 12);
        } else {
          expect(pseudo).toBe(0);
          expect(F.x).toBeCloseTo(FRAMES_M * a, 12);
        }
      }
    }
  });

  it('N and mg from the ball centre, pseudo force grey dashed; labels apart at 1280 and 390 px', () => {
    for (const p of cases)
      for (const s of statesAt(frames, p))
        for (const [w, h] of STACK) {
          const g = probeAt(frames, s, p, w, h);
          const at = g.arrows.find((a) => a.vec.x === 0 && a.vec.y < 0)!.from;
          expect(
            arrowsMatch(g, at, [
              ...framesFbd(p).real,
              ...(framesFbd(p).pseudo
                ? [
                    {
                      F: { x: framesFbd(p).pseudo, y: 0 },
                      label: 'ps',
                      field: true,
                    },
                  ]
                : []),
            ]),
          ).toEqual([]);
          const bad = overlaps(g.marks, (m) => LABEL.test(m.text ?? '') || (m.text ?? '').startsWith('−'));
          expect(bad, `${JSON.stringify(p)} t=${s.t.toFixed(2)} ${w}px`).toEqual([]);
          // Nothing off the stage.
          for (const m of g.marks) expect(m.y > -1 && m.y < h + 1, `${m.kind} ${m.text} y=${m.y} ${w}px`).toBe(true);
        }
  });
});

describe('Ch 7 work-energy', () => {
  const base = { ...(defaults(workEnergy.params) as any), fbd: true };
  const cases: any[] = [
    ...['const', 'spring', 'pw'].map((preset) => ({ ...base, preset })),
    { ...base, preset: 'custom', custom: [2, -2, 2, -2] },
    { ...base, preset: 'custom', custom: [-2, 0, 0, 0] },
    { ...base, preset: 'pw', bars: false },
  ];

  it('ΣF = m a: F(x) horizontally (a from the exact motion), N − mg = 0', () => {
    for (const p of cases) {
      const su = makeSetup(p.preset, p.custom);
      for (const s of statesAt(workEnergy, p)) {
        const fs = workFbd(s, p);
        const F = sum(fs);
        expect(F.y).toBeCloseTo(0, 12);
        expect(F.x).toBe(force(su.prof, s.x));
        // a over a short exact step, away from the edges of a piecewise force.
        const h = 1e-6;
        const nx = advance(su, s.x, s.v, h);
        if (su.prof.kind === 'spring' || force(su.prof, nx.x) === force(su.prof, s.x)) expect(F.x / M7).toBeCloseTo((nx.v - s.v) / h, 4);
        expect(fs[0].label).toBe(p.preset === 'spring' ? '*F*_{s}' : '*F*');
      }
    }
  });

  it('arrows from the block centre; labels apart from each other and the area / ΔK labels at 1280 and 390 px', () => {
    for (const p of cases)
      for (const s of statesAt(workEnergy, p, [0, 0.2, 0.4, 0.6, 0.8, 1]))
        for (const [w, h, narrow] of SOLO) {
          const g = probeAt(workEnergy, s, p, w, h, !!narrow);
          const c = g.arrows.find((a) => a.vec.x === 0 && a.vec.y < 0)!.from;
          expect(arrowsMatch(g, c, workFbd(s, p))).toEqual([]);
          const bad = overlaps(g.marks, (m) => LABEL.test(m.text ?? ''));
          expect(bad, `${p.preset} t=${s.t.toFixed(2)} ${w}px`).toEqual([]);
        }
  });
});
