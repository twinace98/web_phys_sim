// Ch 6 friction mass slider (review 2026-11-20 §2): the ⓘ said the slip angle does not depend on
// the mass, but the mass was fixed at 2 kg. Now m is a slider: forces scale with m, motion does not.
import { describe, expect, it } from 'vitest';
import { defaults } from '../src/core/params';
import { Runner } from '../src/core/runner';
import type { Vec2 } from '../src/core/types';
import { forceScale, friction } from '../src/sims/ch06/friction';
import en from '../src/sims/ch06/i18n.en.json';
import ko from '../src/sims/ch06/i18n.ko.json';
import { G, MATERIALS } from '../src/sims/ch06/physics';
import { NUM, agrees, grab, val } from './sigma-digits';
import { ProbeDraw, offStage } from './stage-probe';

type FP = { mode: string; mat: string; m: number };
type FS = { t: number; f: number; N: number; F: number; a: number; v: number; x: number; theta: number; sliding: boolean };

const MASSES = [0.5, 1, 2, 3.7, 6.4, 10];
const MODES = ['pull', 'incline'];
const MATS = Object.keys(MATERIALS);

/** Run to the end (or `upTo` seconds) and return the state. */
function runTo(p: FP, upTo = Infinity): FS {
  const r = new Runner(friction, p as never, 1);
  r.play();
  for (let i = 0; i < 4000 && r.playing && r.state.t < upTo - 1e-9; i++) r.advance(Math.min(0.05, upTo - r.state.t));
  return r.state as unknown as FS;
}

describe('ch06 friction mass slider (review 2026-11-20)', () => {
  it('review case: the scene now has a mass slider 0.5–10 kg, default 2 kg, with label and desc in ko/en', () => {
    const spec = (friction.params as Record<string, { kind: string; control?: string; min?: number; max?: number; default: unknown; label: string; desc?: string; live?: boolean }>).m;
    expect(spec).toBeDefined();
    expect(spec.kind).toBe('number');
    expect(spec.control).toBe('slider');
    expect([spec.min, spec.max, spec.default]).toEqual([0.5, 10, 2]);
    expect(spec.live).toBe(false);
    for (const d of [ko, en] as Record<string, string>[]) {
      expect(d[spec.label]).toBeTruthy();
      expect(d[spec.desc!]).toBeTruthy();
    }
    // The ⓘ no longer states a bare "질량과 무관": it names what scales with m and what does not.
    expect((ko as Record<string, string>)['ch06.f.obs.angle']).toMatch(/\$m\$에 비례/);
    expect((en as Record<string, string>)['ch06.f.obs.angle']).toMatch(/scales .* with \$m\$/);
  });

  it('default 2 kg is the old scene: pull 4 N/s, wood slips at 2.45 s with f = μs mg = 9.8 N', () => {
    const p = defaults(friction.params) as FP;
    expect(p.m).toBe(2);
    const s = runTo(p, 2.4);
    expect(s.F).toBeCloseTo(4 * 2.4, 9);
    const end = runTo(p);
    expect(end.N).toBeCloseTo(2 * G, 12);
    expect(end.f).toBeCloseTo(0.3 * 2 * G, 12);
    expect(end.t).toBeCloseTo(2.45 + 1.2, 9);
  });

  it('sweep: forces ∝ m, while slip time, θ, a, v, x and the run length do not depend on m', () => {
    for (const mode of MODES)
      for (const mat of MATS) {
        const ref = { mode, mat, m: 2 };
        const T = friction.time!.tEnd as (p: unknown) => number;
        for (const t of [0.3, 1.5, 3, Infinity]) {
          const r = runTo(ref, t);
          for (const m of MASSES) {
            const p = { mode, mat, m };
            expect(T(p)).toBeCloseTo(T(ref), 12);
            const s = runTo(p, t);
            const k = m / 2;
            expect(s.t).toBeCloseTo(r.t, 12);
            for (const q of ['f', 'N', 'F'] as const) expect(s[q]).toBeCloseTo(k * r[q], 9);
            for (const q of ['a', 'v', 'x', 'theta'] as const) expect(s[q]).toBeCloseTo(r[q], 9);
            expect(s.sliding).toBe(r.sliding);
            const ro = friction.readouts!;
            expect(ro[1].value(s as never, p as never)).toBeCloseTo(k * ro[1].value(r as never, ref as never), 9);
            // Plot range of f scales with m too, so the graph looks the same with m-times the ticks.
            const [, top] = friction.plots![0].yRange(p as never);
            const [, top2] = friction.plots![0].yRange(ref as never);
            expect(top).toBeCloseTo(k * top2, 9);
          }
        }
      }
  });

  it('Σ lines print m and their arithmetic reproduces the printed results at every mass', () => {
    for (const mode of MODES)
      for (const mat of MATS)
        for (const m of MASSES)
          for (const t of [0.5, Infinity]) {
            const p = { mode, mat, m };
            const s = runTo(p, t);
            const lines = friction.formula!(s as never, p as never);
            // The slider label (policy D, R1): 2.0, not 2.
            const mStr = m.toFixed(1);
            const nLine = lines.find((l) => l.startsWith('N = mg'))!;
            expect(nLine).toContain(` = ${mStr} \\times 9.8`);
            if (mode === 'pull') {
              const [mm, g, N] = grab(nLine, new RegExp(`^N = mg = (${NUM}) \\\\times (${NUM}) = (${NUM})`));
              expect(agrees(val(mm) * val(g), N)).toBe(true);
            }
            const [mu, N2, fs] = grab(lines.find((l) => l.startsWith('\\mu_s N'))!, new RegExp(`= (${NUM}) \\\\times (${NUM}) = (${NUM})`));
            expect(agrees(val(mu) * val(N2), fs)).toBe(true);
            const aLine = lines.find((l) => l.startsWith('a = \\frac'));
            if (aLine) {
              const [F, f, mm, a] = grab(aLine, new RegExp(`\\\\frac\\{(${NUM}) - (${NUM})\\}\\{(${NUM})\\} = (${NUM})`));
              expect(val(mm)).toBe(m);
              expect(agrees((val(F) - val(f)) / val(mm), a)).toBe(true);
            }
          }
  });

  it('arrows: mg is 0.67 m at 0.5 kg, 0.8 m at 2 kg, 0.98 m at 10 kg (about 1.5 times), all arrows on the stage', () => {
    const len = (m: number) => m * G * forceScale(m);
    expect(len(2)).toBeCloseTo(0.8, 12);
    expect(len(0.5)).toBeCloseTo(0.673, 3);
    expect(len(10)).toBeCloseTo(0.978, 3);
    expect(len(10) / len(0.5)).toBeCloseTo(1.45, 2);
    class Tips extends ProbeDraw {
      tips: { x: number; y: number }[] = [];
      arrow(from: Vec2, vec: Vec2, st = {}): void {
        super.arrow(from, vec, st);
        const [x, y] = this.vp.toPx(from.x + vec.x, from.y + vec.y);
        this.tips.push({ x, y });
      }
    }
    for (const [w, h] of [
      [760, 680],
      [390, 250],
    ] as const)
      for (const mode of MODES)
        for (const mat of MATS)
          for (const m of [0.5, 10])
            for (const t of [0.5, 2, Infinity]) {
              const p = { mode, mat, m };
              const s = runTo(p, t);
              const g = new Tips(w, h);
              g.vp.fit(friction.world(p as never), w, h);
              friction.draw(g, s as never, p as never, { t: s.t, cursorT: s.t, scrubbing: false, lecture: false });
              expect(offStage(g), `${w}×${h} ${JSON.stringify(p)} t=${s.t}`).toEqual([]);
              for (const tip of g.tips) {
                expect(tip.x).toBeGreaterThanOrEqual(0);
                expect(tip.x).toBeLessThanOrEqual(w);
                expect(tip.y).toBeGreaterThanOrEqual(0);
                expect(tip.y).toBeLessThanOrEqual(h);
              }
            }
  });
});
