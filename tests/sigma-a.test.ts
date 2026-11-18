// Σ formula panel, Ch 2–6: the printed result of the panel lines equals the scene's own readout or
// physics function (same tn() rounding), at defaults and other settings, at t = 0 and while running.
import { describe, expect, it } from 'vitest';
import { defaults } from '../src/core/params';
import { Runner } from '../src/core/runner';
import { tn } from '../src/core/tex';
import type { Params, Scene } from '../src/core/types';
import { sigToMatch } from '../src/sims/ch02/sigma';
import ch02 from '../src/sims/ch02';
import ch03 from '../src/sims/ch03';
import { add, components } from '../src/sims/ch03/physics';
import ch04 from '../src/sims/ch04';
import ch05 from '../src/sims/ch05';
import { bumperAt } from '../src/sims/ch05/physics';
import { bumperOf } from '../src/sims/ch05/third';
import ch06 from '../src/sims/ch06';
import { MATERIALS } from '../src/sims/ch06/physics';

const DEG = Math.PI / 180;
type Val = (s: never, p: never) => number;
/** A line (first match) and the value its result must print as. A string value names a readout. */
type Expect = [RegExp, Val | string];

/** The printed result: after the last "= ", without the unit, a trailing condition or °. */
export function result(line: string): string {
  return line
    .slice(line.lastIndexOf('= ') + 2)
    .replace(/\\ \\mathrm\{.*$/, '')
    .replace(/\^\\circ$/, '')
    .replace(/\s*\\le .*$/, '')
    .trim();
}

function scene(page: { scenes: Scene[] }, id: string): Scene {
  const s = page.scenes.find((x) => x.id === id);
  if (!s) throw new Error(id);
  return s;
}

/** Run to each of the given step counts and check every expectation that has a matching line. */
function check(sc: Scene, over: Record<string, unknown>, steps: number[], expects: Expect[], need = 1): void {
  const p = { ...(defaults(sc.params) as Params), ...over } as Params;
  const r = new Runner(sc, p as never, 1);
  let done = 0;
  if (sc.time) r.play();
  for (const n of steps) {
    if (sc.time) for (let i = done; i < n && r.playing; i++) r.advance(sc.time.h);
    done = n;
    const s = r.state as never;
    const pp = r.params as never;
    const lines = sc.formula!(s, pp);
    for (const l of lines) expect(l, 'no control characters (a lost backslash)').not.toMatch(/[\t\n\r\f\v]/);
    let hits = 0;
    for (const [re, v] of expects) {
      const line = lines.find((l) => re.test(l));
      if (!line) continue;
      const value = typeof v === 'string' ? sc.readouts!.find((ro) => ro.label === v)!.value(s, pp) : v(s, pp);
      expect(result(line), `${sc.id} ${JSON.stringify(over)} step ${n}: ${line}`).toBe(tn(value));
      hits++;
    }
    expect(hits, `${sc.id} ${JSON.stringify(over)} step ${n}: matched lines`).toBeGreaterThanOrEqual(need);
  }
}

const STEPS = [0, 150, 301, 700, 2000];

describe('sigToMatch', () => {
  it('adds digits until the printed arithmetic gives the printed result', () => {
    // 10 − 9.8 × 1.25 = −2.25, but the exact t = 1.2542 gives −2.29.
    expect(sigToMatch(10 - 9.8 * 1.2542, [1.2542], (t) => 10 - 9.8 * t)).toBe(4);
    expect(sigToMatch(2 * 3, [3], (x) => 2 * x)).toBe(3);
    // A result that prints as 0.00 accepts a printed leftover below 0.005.
    expect(sigToMatch(0, [2.0203051], (t) => 20 - 4.9 * t * t)).toBeLessThan(7);
  });
});

describe('Σ panel agrees with the simulation, Ch 2–6', () => {
  it('Ch 02 graphs and free fall', () => {
    const g = scene(ch02, 'graphs');
    const ex: Expect[] = [
      [/^a = /, 'a'],
      [/^v = /, 'v'],
      [/^x = /, 'x'],
    ];
    for (const over of [{}, { motion: 'reverse' }, { motion: 'custom', v0: -1.3 }, { motion: 'uniform' }]) check(g, over, STEPS, ex, 3);
    const f = scene(ch02, 'freefall');
    const fx: Expect[] = [
      [/^a = -g/, 'a'],
      [/^v = v_0 - gt/, 'v'],
      [/^= /, 'y'],
    ];
    for (const over of [{}, { throw: 'up' }, { throw: 'down', h: 45 }]) check(f, over, STEPS, fx, 3);
  });

  it('Ch 03 components and sum', () => {
    const c = scene(ch03, 'components');
    type PC = { phi: number; A: number[] };
    const comp = (p: PC) => components([p.A[0], p.A[1]], p.phi * DEG);
    const ex: Expect[] = [
      [/^A = \\sqrt/, ((_s: unknown, p: PC) => comp(p).mag) as Val],
      [/^A_x = /, ((_s: unknown, p: PC) => comp(p).ax) as Val],
      [/^A_y = /, ((_s: unknown, p: PC) => comp(p).ay) as Val],
    ];
    for (const over of [{}, { phi: 30 }, { A: [-2.37, 4.11], phi: 17 }, { A: [0.5, -5], phi: 60 }]) check(c, over, [0], ex, 3);
    const s = scene(ch03, 'sum');
    type PS = { A: number[]; B: number[] };
    const sum = (p: PS) => add([p.A[0], p.A[1]], [p.B[0], p.B[1]]);
    const sx: Expect[] = [
      [/^C_x = /, ((_s: unknown, p: PS) => sum(p)[0]) as Val],
      [/^C_y = /, ((_s: unknown, p: PS) => sum(p)[1]) as Val],
      [/^C = /, ((_s: unknown, p: PS) => Math.hypot(...sum(p))) as Val],
    ];
    for (const over of [{}, { A: [-3.25, 0.5], B: [1.1, -2.2] }]) check(s, over, [0], sx, 3);
  });

  it('Ch 04 projectile, circular motion and relative motion', () => {
    const pj = scene(ch04, 'projectile');
    const ex: Expect[] = [
      [/^v_x = /, 'v_x'],
      [/^= .*\\mathrm\{m\/s\}$/, 'v_y'],
      [/^= .*\\mathrm\{m\}$/, ((s: { y: number }) => s.y) as Val],
      [/^v = \\sqrt/, 'v'],
    ];
    for (const over of [{}, { h: 40, theta: 0, g: 'moon' }, { theta: 75, v0: 25, g: 'mars' }]) check(pj, over, STEPS, ex, 4);
    const c = scene(ch04, 'circular');
    const cx: Expect[] = [
      [/^a = /, 'a'],
      [/^T = /, 'T'],
    ];
    for (const over of [{}, { r: 1, v: 3 }, { r: 2.7, v: 1.3 }]) check(c, over, [0, 301], cx, 2);
    const rel = scene(ch04, 'relative');
    const rx: Expect[] = [
      [/^x_\{BG\} = /, 'x_{BG}'],
      [/^y = v_\{BG,y\}/, 'y'],
    ];
    for (const over of [{}, { heading: 0, vb: 1, u: 1.5 }, { heading: 60, vb: 2.9, u: 0.3 }]) check(rel, over, STEPS, rx, 2);
  });

  it('Ch 05 first law, second law, third law and frames', () => {
    const f = scene(ch05, 'first');
    const fx: Expect[] = [
      [/^f(_k)? = /, 'f'],
      [/^F_\\text\{net\} = [-F]/, 'F_\\text{net}'],
      [/^v = v_0 \+ at/, 'v'],
      [/\\Rightarrow\\; v = /, 'v'],
    ];
    for (const over of [{}, { mu: 0.29 }, { mu: 0.1, push: true }, { mu: 0.03, v0: 5 }]) check(f, over, STEPS, fx, 2);
    const n = scene(ch05, 'newton');
    const nx: Expect[] = [
      [/^a = /, 'a'],
      [/^v = /, 'v'],
    ];
    for (const over of [{}, { F: 0.7, m: 3 }, { F: 5, m: 1 }]) check(n, over, STEPS, nx, 2);
    const t = scene(ch05, 'third');
    type PT = Parameters<typeof bumperOf>[0];
    const tx: Expect[] = [
      [/^F_\{BA\} = /, 'F_{BA}'],
      [/^F_\{AB\} = /, 'F_{AB}'],
      [/^a_A = /, ((s: { t: number }, p: PT) => bumperAt(bumperOf(p), s.t).A.a) as Val],
      [/^a_B = /, ((s: { t: number }, p: PT) => bumperAt(bumperOf(p), s.t).B.a) as Val],
      [/^N_A = /, ((_s: unknown, p: PT) => p.mA * 9.8) as Val],
    ];
    // Steps 150–200 fall inside the contact of the default collision (0.6 s to 0.98 s).
    for (const over of [{}, { mode: 'release', fbd: true, mA: 0.5, k: 150 }, { mB: 4.3, v0: 0.5, fbd: true }]) check(t, over, [0, 160, 190, 301, 700], tx, 4);
    const fr = scene(ch05, 'frames');
    const rx: Expect[] = [
      [/^a' = /, 'a'],
      [/^v' = /, 'v'],
      [/\\Rightarrow\\; a = /, 'a'],
      [/^v = v_0/, 'v'],
    ];
    for (const over of [{}, { frame: 'ground' }, { motion: 'uniform' }, { A: 1.7, pseudo: false }]) check(fr, over, STEPS, rx, 2);
  });

  it('Ch 06 friction and circular motion', () => {
    const f = scene(ch06, 'friction');
    const fx: Expect[] = [
      [/^f_[sk] = /, 'f'],
      [/^\\mu_s N = /, '\\mu_s N'],
      [/^N = /, ((s: { N: number }) => s.N) as Val],
      [/^= /, ((s: { a: number }) => s.a) as Val],
      [/^a = \\frac/, ((s: { a: number }) => s.a) as Val],
      [/theta_c = \\tan/, ((_s: unknown, p: { mat: string }) => Math.atan(MATERIALS[p.mat].mus) / DEG) as Val],
    ];
    for (const over of [{}, { mat: 'steel' }, { mode: 'incline' }, { mode: 'incline', mat: 'ice' }, { mode: 'incline', mat: 'rubber' }]) check(f, over, STEPS, fx, 3);
    const c = scene(ch06, 'circular');
    const cx: Expect[] = [
      [/F_\{\\text\{net\},r\} = (?!.*F_\\text\{cf\} =)/, 'F_{\\text{net},r}'],
      [/^\\frac\{mv\^2\}\{r\} = /, 'mv^2/r'],
      [/^v = \\sqrt/, 'v'],
    ];
    const steps = [0, 300, 600, 900, 1200, 2000];
    for (const over of [{}, { cut: true }, { preset: 'flat' }, { preset: 'flat', ice: true }, { preset: 'banked' }, { preset: 'cone' }, { preset: 'cone', cut: true }])
      check(c, over, steps, cx, 2);
  });
});
