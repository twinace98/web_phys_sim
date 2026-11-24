// Review 2026-11-20, group A items: Ch 5 first-law Σ panel after a live change, Ch 11 swivel-chair
// ⓘ numbers, Ch 4 relative-motion ⓘ, Ch 8 path work (friction on a horizontal surface).
import { describe, expect, it } from 'vitest';
import { defaults } from '../src/core/params';
import { Runner } from '../src/core/runner';
import { tn } from '../src/core/tex';
import { first, FIRST_G } from '../src/sims/ch05/first';
import { drift } from '../src/sims/ch04/physics';
import { relative as relScene } from '../src/sims/ch04/relative';
import ch04en from '../src/sims/ch04/i18n.en.json';
import ch04ko from '../src/sims/ch04/i18n.ko.json';
import { G as G8, MASS, MU_K, pathPoints, pathWork } from '../src/sims/ch08/physics';
import { pathScene } from '../src/sims/ch08/path';
import ch08en from '../src/sims/ch08/i18n.en.json';
import ch08ko from '../src/sims/ch08/i18n.ko.json';
import { spinScene } from '../src/sims/ch11/spin';
import ch11en from '../src/sims/ch11/i18n.en.json';
import ch11ko from '../src/sims/ch11/i18n.ko.json';
import { NUM, agrees, agreesWithin, val } from './sigma-digits';

const N = NUM;
const H = 1 / 240;

/** The v line; the v_1 form is split after its symbols ("v = v_1 + a(t - t_1)", "= ..."): joined. */
const lastV = (lines: string[]) => {
  const l = lines[lines.length - 1];
  return l.startsWith('= ') ? `${lines[lines.length - 2]} ${l}` : l;
};

/** Every arithmetic claim of the first-law Σ panel, checked on the printed numbers. */
function checkFirst(s: any, p: any, tag: string): void {
  const lines = first.formula!(s, p);
  const at = (head: string) => lines.find((l) => l.startsWith(head));
  if (s.v <= 0) {
    expect(lines[1], tag).toContain('v = 0\\ ');
    return;
  }
  const fk = at('f_k = ')!;
  const m1 = fk.match(new RegExp(`= (${N}) \\\\times 1 \\\\times 9.8 = (${N})`))!;
  expect(m1, `${tag} ${fk}`).not.toBeNull();
  expect(agrees(val(m1[1]) * FIRST_G, m1[2]), `${tag} ${fk}`).toBe(true);
  expect(m1[2], tag).toBe(tn(-s.f));
  const last = lastV(lines);
  const res =last.match(new RegExp(`= (${N})\\\\ \\\\mathrm\\{m/s\\}$`))![1];
  // The result is the readout string (policy D, R3), also on an exact tie (1.775).
  expect(res, `${tag} ${last}`).toBe(tn(s.v));
  if (s.f + s.F === 0) {
    // Constant velocity: v_0 only while the speed is still the starting one.
    expect(last, tag).toContain(s.v === p.v0 ? 'v = v_0 = ' : 'v = v_1 = ');
    if (s.t1 === 0) expect(s.v, tag).toBe(p.v0);
    return;
  }
  const v0 = last.match(new RegExp(`v = v_0 \\+ at = (${N}) \\+ \\(?(${N})\\)? \\\\times (${N}) = (${N})`));
  const v1 = last.match(new RegExp(`v = v_1 \\+ a\\(t - t_1\\) = (${N}) \\+ \\(?(${N})\\)? \\\\times \\((${N}) - (${N})\\) = (${N})`));
  expect(v0 || v1, `${tag} ${last}`).not.toBeNull();
  if (v0) {
    expect(s.t1, tag).toBe(0);
    // v₀ + at nearly cancels as the puck stops (R5): allow the rounding of the 3-figure a and t.
    expect(agreesWithin((a, b, c) => a + b * c, v0.slice(1, 4), v0[4], [0]), `${tag} ${last}`).toBe(true);
  } else {
    expect(s.t1, tag).toBeGreaterThan(0);
    // t − t₁ is a difference of two 3-figure times (R5): allow their rounding.
    expect(agreesWithin((a, b, c, d) => a + b * (c - d), v1!.slice(1, 5), v1![5]), `${tag} ${last}`).toBe(true);
  }
}

/** Runner advanced by whole steps, with live changes at given step counts. */
function runWith(over: Record<string, unknown>, changes: [number, Record<string, unknown>][], steps: number, onStep?: (r: Runner<any, any>, n: number) => void) {
  const r: Runner<any, any> = new Runner(first as any, { ...defaults(first.params), ...over } as any, 1);
  r.play();
  for (let n = 1; n <= steps && r.playing; n++) {
    for (const [at, ch] of changes) if (at === n - 1) for (const [k, v] of Object.entries(ch)) r.setParam(k as never, v as never);
    r.advance(H);
    onStep?.(r, n);
  }
  return r;
}

describe('Ch 05 first law: Σ after a live μ or push change', () => {
  it('review case: μ 0.1 → 0.3 at t = 1 s, then at t = 1.5 s the line reproduces v (old: 3.0 + (−2.94) × 1.5)', () => {
    const r = runWith({ mu: 0.1 }, [[240, { mu: 0.3 }]], 360);
    const s = r.state;
    expect(s.t).toBeCloseTo(1.5, 12);
    expect(s.v).toBeCloseTo(3 - 0.98 - 2.94 * 0.5, 9);
    expect(s.t1).toBeCloseTo(1, 12);
    expect(s.v1).toBeCloseTo(2.02, 9);
    const last = lastV(first.formula!(s, r.params));
    expect(last).toContain('v = v_1 + a(t - t_1) = 2.02 + (-2.94) \\times (1.50 - 1.00) = 0.550');
    checkFirst(s, r.params, 'review');
  });

  it('review case: μ 0.1 → 0 at t = 1 s: v = v_1 = 2.02 (old: v = v_0 = 2.02 with v_0 = 3.0)', () => {
    const r = runWith({ mu: 0.1 }, [[240, { mu: 0 }]], 600);
    const last = first.formula!(r.state, r.params).at(-1)!;
    expect(last).toContain('v = v_1 = 2.02');
    expect(last).not.toContain('v_0');
  });

  it('scrubbing back: each snapshot carries its own μ, t₁ and v₁ (the slider has moved on)', () => {
    const r = runWith({ mu: 0.1 }, [[240, { mu: 0.3 }], [300, { mu: 0 }], [400, { push: true, mu: 0.2 }]], 1440);
    expect(r.params.mu).toBe(0.2);
    for (let i = 0; i < r.hist.length; i += 5) {
      const s = r.hist.snap(i) as any;
      checkFirst(s, r.params, `snap ${i} t=${s.t}`);
    }
    // Before the change the panel still shows μ = 0.10 and v = v_0 + at.
    const early = first.formula!(r.hist.snap(120) as any, r.params);
    expect(early[0]).toContain('0.10 \\times');
    expect(early.at(-1)).toMatch(/^v = v_0 \+ at = 3\.0 \+ \(-0\.980\) \\times 0\.500 = 2\.51/);
  });

  it('paused, μ moved: the panel keeps the state on the stage (its μ), not the slider', () => {
    const r = runWith({ mu: 0.1 }, [], 120);
    r.pause();
    r.setParam('mu' as never, 0.3 as never);
    checkFirst(r.state, r.params, 'paused');
    expect(first.formula!(r.state, r.params)[0]).toContain('0.10 \\times');
  });

  it('stop: the puck stops in the second segment, then f = 0 and v = 0', () => {
    const r = runWith({ mu: 0.05, v0: 1 }, [[60, { mu: 0.3 }]], 1440);
    expect(r.state.v).toBe(0);
    checkFirst(r.state, r.params, 'stopped');
    // The segment that ended in the stop printed correctly on every step before it.
    runWith({ mu: 0.05, v0: 1 }, [[60, { mu: 0.3 }]], 1440, (rr, n) => checkFirst(rr.state, rr.params, `step ${n}`));
  });

  it('sweep: v0, μ, push at min, max and in between, changed mid-run, every step', () => {
    const starts = [
      { v0: 1, mu: 0 },
      { v0: 5, mu: 0.3 },
      { v0: 3, mu: 0.17, push: true },
      { v0: 2.4, mu: 0.01 },
    ];
    const changes: [number, Record<string, unknown>][][] = [
      [],
      [[100, { mu: 0 }]],
      [[100, { mu: 0.3 }]],
      [[50, { push: true }], [200, { push: false }]],
      [[37, { mu: 0.12 }], [91, { mu: 0.05 }], [173, { mu: 0 }], [260, { mu: 0.3 }]],
      [[80, { push: true }], [120, { mu: 0.29 }], [300, { push: false }]],
    ];
    for (const st of starts)
      for (const ch of changes) runWith(st, ch, 1440, (r, n) => n % 3 === 0 && checkFirst(r.state, r.params, `${JSON.stringify(st)} ${JSON.stringify(ch)} step ${n}`));
  });
});

describe('Ch 11 swivel chair ⓘ: ω ratio numbers against the scene', () => {
  /** ω_in / ω_out from a full pull-in run of the chair at dumbbell mass m. */
  const ratio = (mDb: number) => {
    const p = { ...defaults(spinScene.params), sys: 'chair', arms: 'pull', mDb } as any;
    const r: Runner<any, any> = new Runner(spinScene as any, p, 1);
    r.play();
    for (let i = 0; i < 100000 && r.playing; i++) r.advance(0.02);
    const w = r.hist.col('w');
    return Math.max(...w) / Math.min(...w);
  };
  const ko = ch11ko['ch11.s.obs.ratio'];
  const en = ch11en['ch11.s.obs.ratio'];

  it('review case: dumbbells alone give (0.8/0.2)² = 16, not 4; the text says 16, not "less than 4"', () => {
    expect((0.8 / 0.2) ** 2).toBeCloseTo(16, 12);
    for (const t of [ko, en]) {
      expect(t).toContain('(0.8/0.2)^2 = 16');
      expect(t).not.toMatch(/4배보다|less than 4/);
    }
  });

  it('default 2.4, mass range 0.5–4 kg gives 1.4–3.6 (sweep min, max, in between: monotonic)', () => {
    const lo = spinScene.params.mDb as any;
    expect([lo.min, lo.max]).toEqual([0.5, 4]);
    expect(ratio(2).toFixed(1)).toBe('2.4');
    expect(ratio(0.5).toFixed(1)).toBe('1.4');
    expect(ratio(4).toFixed(1)).toBe('3.6');
    let prev = 1;
    for (const m of [0.5, 1, 1.7, 2.5, 3.3, 4]) {
      const q = ratio(m);
      expect(q).toBeGreaterThan(prev);
      expect(q).toBeLessThan(16);
      prev = q;
    }
    for (const t of [ko, en]) {
      expect(t).toContain('2.4');
      expect(t).toContain('0.5–4 kg');
      expect(t).toContain('1.4–3.6');
    }
  });

  it('puck tension note: (1/0.3)³ = 37 is the largest change, in both languages', () => {
    const rIn = spinScene.params.rIn as any;
    expect(Math.round((1 / rIn.min) ** 3)).toBe(37);
    expect(ch11ko['ch11.s.assume']).toContain('최대 37배');
    expect(ch11en['ch11.s.assume']).toContain('up to 37 times');
  });
});

describe('Ch 04 relative motion ⓘ: heading 60° lands upstream only if v_BW sin 60° > v_WG', () => {
  const landing = (vb: number, u: number, heading = 60) => drift({ W: 20, vb, u, theta: (heading * Math.PI) / 180 });

  it('review case: boat 1 m/s, river 1.5 m/s lands about 25 m downstream', () => {
    expect(landing(1, 1.5)).toBeCloseTo(25.4, 1);
    expect(1 * Math.sin(Math.PI / 3)).toBeLessThan(1.5);
  });

  it('sweep over both sliders: the sign of the drift follows the stated condition; defaults give 1.73 > 1', () => {
    const vb = relScene.params.vb as any;
    const u = relScene.params.u as any;
    for (let b = vb.min; b <= vb.max + 1e-9; b += vb.step)
      for (let w = u.min; w <= u.max + 1e-9; w += u.step) {
        const up = b * Math.sin(Math.PI / 3) > w;
        expect(landing(b, w) < 0, `vb ${b} u ${w}`).toBe(up);
        // Heading 0°: downstream whenever there is a current, straight across without one.
        expect(Math.sign(landing(b, w, 0)), `vb ${b} u ${w} at 0°`).toBe(w > 1e-9 ? 1 : 0);
      }
    expect((vb.default * Math.sin(Math.PI / 3)).toFixed(2)).toBe('1.73');
    expect(u.default).toBe(1);
    for (const t of [ch04ko['ch04.r.obs.up'], ch04en['ch04.r.obs.up']]) {
      expect(t).toContain('v_{BW}\\sin 60^\\circ > v_{WG}');
      expect(t).toContain('1.73 > 1 m/s');
    }
  });
});

describe('Ch 08 path work: friction on a horizontal floor seen from above', () => {
  it('W_f = −μ_k m g s on every path (N = mg), and the ⓘ states the horizontal floor', () => {
    for (const kind of ['straight', 'arc', 'zigzag', 'custom'] as const)
      for (const closed of [false, true]) {
        const pw = pathWork('friction', pathPoints(kind, [0.5, 2.5], closed));
        expect(pw.W.at(-1)).toBeCloseTo(-MU_K * MASS * G8 * pw.L, 12);
      }
    expect(pathScene.info!.assumptions).toContain('ch08.p.assume.plane');
    expect(ch08ko['ch08.p.assume.plane']).toContain('수평 바닥');
    expect(ch08ko['ch08.p.assume.plane']).toContain('$N = mg$');
    expect(ch08en['ch08.p.assume.plane']).toContain('horizontal floor');
    expect(ch08en['ch08.p.assume.plane']).toContain('$N = mg$');
  });
});
