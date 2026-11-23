// Σ digit policy D, phase 2, Ch 2–11 (docs/design.md §3.3): the audit items of 2026-11-23 at their
// quoted parameter values, the slider labels that the PENDING map waived, and a sweep over every
// control of every Ch 2–11 scene (min, quarter points, max, every option) running the D checks.
import { describe, expect, it } from 'vitest';
import { defaults } from '../src/core/params';
import { fmt } from '../src/core/format';
import { readoutText } from '../src/core/precision';
import { Runner } from '../src/core/runner';
import type { NumberParam, Params, Scene } from '../src/core/types';
import { CHAPTERS } from '../src/sims/registry';
import { componentPanel } from '../src/sims/ch03/scene';
import { velocityPanel } from '../src/sims/ch04/relative';
import { parallelScene } from '../src/sims/ch10/parallel';
import { probe } from './stage-probe';
import { CHECKS, evalTex, parts, policyIssues, ulpOf } from './sigma-policy';

async function scene(ch: number, id: string): Promise<Scene> {
  const page = await CHAPTERS.find((m) => m.ch === ch)!.load!();
  return page.scenes.find((s) => s.id === id)!;
}

/** Σ lines and readout strings after `steps` physics steps (Infinity: to the end of the run). */
function at(sc: Scene, over: Params, steps: number) {
  const r = new Runner(sc, { ...(defaults(sc.params) as Params), ...over } as never, 1);
  if (sc.time && steps > 0) {
    r.play();
    for (let i = 0; i < steps && r.playing; i++) r.advance(sc.time.h);
  }
  const lines = sc.formula!(r.state as never, r.params as never);
  const ro = (label: string) => {
    const spec = sc.readouts!.find((q) => q.label === label)!;
    return readoutText(spec as never, spec.value(r.state as never, r.params as never), r.params as never);
  };
  return { lines, ro, s: r.state as never as Record<string, number>, playing: r.playing };
}

const END = 1e6;

describe('Ch 2 free fall (audit §5: 2.0203, 0.00 m at landing)', () => {
  it('t with 3 figures; at landing y is an exact 0 in the Σ line and the readout (R7a)', async () => {
    const sc = await scene(2, 'freefall');
    const end = at(sc, {}, END);
    expect(end.lines).toContain('v = v_0 - gt = 0 - 9.8 \\times 2.02 = -19.8\\ \\mathrm{m/s}');
    expect(end.lines).toContain('= 20 + 0 \\times 2.02 - 4.9 \\times 2.02^2 = 0\\ \\mathrm{m}');
    expect(end.ro('y')).toBe('0');
    // Thrown down: the line PENDING named.
    const down = at(sc, { throw: 'down' }, END);
    expect(down.lines).toContain('= 20 + (-10) \\times 1.24 - 4.9 \\times 1.24^2 = 0\\ \\mathrm{m}');
    // During the flight y has fixed decimals from the height (20 m: one decimal), as its readout.
    const mid = at(sc, {}, 240);
    expect(mid.lines).toContain('= 20 + 0 \\times 1.00 - 4.9 \\times 1.00^2 = 15.1\\ \\mathrm{m}');
    expect(mid.ro('y')).toBe('15.1');
    // 5 m: two decimals.
    expect(at(sc, { h: 5 }, 0).ro('y')).toBe('5.00');
  });
});

describe('Ch 3 component sum (audit §5: overlay 0.05 against Σ 0.0500, R8)', () => {
  it('stage panel and Σ print each component with the drag resolution, 2 decimals', async () => {
    const sc = await scene(3, 'sum');
    const p = { drag: 'smooth', A: [0.05, 1], B: [0, 2] };
    const lines = sc.formula!({ t: 0 } as never, p as never);
    expect(lines[0]).toBe('C_x = A_x + B_x = 0.05 + 0.00 = 0.05');
    expect(componentPanel([0.05, 1], [0, 2])).toContain('{0.05} + \\textcolor{#E69F00}{0.00} = 0.05');
    expect(lines[1]).toBe('C_y = A_y + B_y = 1.00 + 2.00 = 3.00');
    expect(sc.formula!({ t: 0 } as never, { drag: 'smooth', A: [4, 1], B: [-1.25, 3] } as never)[0]).toBe('C_x = A_x + B_x = 4.00 + (-1.25) = 2.75');
  });
});

describe('Ch 4 projectile (audit §5: 17.678; PENDING: v0 label, ½g on Mars, landing line)', () => {
  it('v0 as its label, ½g with 3 figures, components with 3 figures, landing y = 0', async () => {
    const sc = await scene(4, 'projectile');
    const d = at(sc, {}, 0);
    expect(d.lines).toContain('v_x = v_0\\cos\\theta = 20.0\\cos 45^\\circ = 14.1\\ \\mathrm{m/s}');
    // v0 = 25 m/s after 600 steps (t = 2.50 s): the audit's √(17.678² + (−6.82)²).
    expect(at(sc, { v0: 25 }, 600).lines).toContain('v = \\sqrt{v_x^2 + v_y^2} = \\sqrt{17.7^2 + (-6.82)^2} = 18.9\\ \\mathrm{m/s}');
    const mars = at(sc, { g: 'mars' }, 600);
    expect(mars.lines).toContain('= 0 + 20.0\\sin 45^\\circ \\times 2.50 - 1.86 \\times 2.50^2 = 23.8\\ \\mathrm{m}');
    expect(mars.lines).toContain('= 20.0\\sin 45^\\circ - 3.71 \\times 2.50 = 4.87\\ \\mathrm{m/s}');
    const land = at(sc, { v0: 10 }, END);
    expect(land.lines).toContain('= 0 + 10.0\\sin 45^\\circ \\times 1.44 - 4.9 \\times 1.44^2 = 0\\ \\mathrm{m}');
    expect(land.ro('y')).toBe('0');
  });
  it('circular: v readout as its slider label; relative: v_WG as its label in the stage panel and Σ', async () => {
    const c = await scene(4, 'circular');
    expect(at(c, {}, 0).ro('v')).toBe('2.0');
    expect(at(c, { v: 1.3 }, 0).lines[0]).toBe('a = \\frac{v^2}{r} = \\frac{1.3^2}{2.0} = 0.845\\ \\mathrm{m/s^2}');
    const r = await scene(4, 'relative');
    const p = defaults(r.params) as never as { heading: number; vb: number; u: number };
    expect(velocityPanel({ ...p, heading: 29 })).toContain('0.0304 = \\textcolor{#0072B2}{(-0.970)} + \\textcolor{#E69F00}{1.0}');
    expect(at(r, { heading: 29 }, 0).lines).toContain('= -2.0\\sin 29^\\circ + 1.0 = 0.0304\\ \\mathrm{m/s}');
  });
});

describe('Ch 5 (audit §5: 1.3333 × 0.41667, m = 2.000; first law 1.77 against 1.78)', () => {
  it('second law: F and m as their labels, a and t with 3 figures', async () => {
    const sc = await scene(5, 'newton');
    const d = at(sc, {}, 0);
    expect(d.lines[0]).toBe('a = \\frac{F_\\text{net}}{m} = \\frac{4.0}{2.0} = 2.00\\ \\mathrm{m/s^2}');
    expect(d.ro('F_\\text{net}')).toBe('4.0');
    const m3 = at(sc, { m: 3 }, 100);
    expect(m3.lines).toContain('v = at = 1.33 \\times 0.417 = 0.556\\ \\mathrm{m/s}');
    expect(m3.lines[0]).toBe('a = \\frac{F_\\text{net}}{m} = \\frac{4.0}{3.0} = 1.33\\ \\mathrm{m/s^2}');
  });
  it('first law at μ = 0.3 after 100 steps: the result is the readout 1.78, inputs with 3 figures', async () => {
    const sc = await scene(5, 'first');
    const r = at(sc, { mu: 0.3 }, 100);
    expect(r.ro('v')).toBe('1.78');
    expect(r.lines).toContain('v = v_0 + at = 3.0 + (-2.94) \\times 0.417 = 1.78\\ \\mathrm{m/s}');
    expect(r.lines[0]).toBe('f_k = \\mu_k m g = 0.30 \\times 1 \\times 9.8 = 2.94\\ \\mathrm{N}');
  });
  it('third law and frames: masses, k and a₀ as their labels', async () => {
    const t = at(await scene(5, 'third'), { fbd: true }, 0);
    expect(t.lines).toContain('a_A = \\frac{F_{AB}}{m_A} = \\frac{0.00}{3.0} = 0.00\\ \\mathrm{m/s^2}');
    expect(t.lines).toContain('N_A = m_A g = 3.0 \\times 9.8 = 29.4\\ \\mathrm{N}');
    expect(t.lines[0]).toBe('F_{BA} = k\\,c = 50 \\times 0.00 = 0.00\\ \\mathrm{N}');
    const f = at(await scene(5, 'frames'), { A: 2 }, 0);
    expect(f.lines).toContain("a' = a - a_0 = 0 - 2.0 = -2.00\\ \\mathrm{m/s^2}");
    expect(at(await scene(5, 'frames'), { motion: 'uniform' }, 0).lines).toContain("a' = a - a_0 = 0 - 0 = 0.00\\ \\mathrm{m/s^2}");
  });
});

describe('Ch 6 (PENDING: m label; banked friction as a direct difference, R5)', () => {
  it('friction: m as its label, the stage angle the Σ string', async () => {
    const sc = await scene(6, 'friction');
    expect(at(sc, {}, 0).lines[0]).toBe('N = mg = 2.0 \\times 9.8 = 19.6\\ \\mathrm{N}');
    const inc = at(sc, { mode: 'incline', m: 3.7 }, 300);
    expect(inc.lines[0]).toMatch(/^N = mg\\cos\\theta = 3\.7 \\times 9\.8\\cos /);
    const p = { ...(defaults(sc.params) as Params), mode: 'incline' };
    const r = new Runner(sc, p as never, 1);
    r.play();
    for (let i = 0; i < 123; i++) r.advance(sc.time!.h);
    const g = probe(sc, r.state as never, r.params as never, 800, 500);
    const deg = (r.state as never as { theta: number }).theta / (Math.PI / 180);
    expect(g.marks.some((m) => m.text === `*θ* = ${fmt(deg)}°`)).toBe(true);
    expect(sc.formula!(r.state as never, r.params as never).join(' ')).toContain(`\\sin ${fmt(deg)}^\\circ`);
  });
  it('circular, banked: f_s from v² − v_d² printed as one number, over speeds near the design speed', async () => {
    const sc = await scene(6, 'circular');
    for (const v of [8.4, 8.45, 8.47, 8.5, 9, 4, 11]) {
      const l = at(sc, { preset: 'banked', vBanked: v }, 0).lines;
      const i = l.indexOf('f_s = \\frac{m\\,(v^2 - v_\\text{d}^2)}{r}\\cos\\theta');
      expect(i, `${v}`).toBeGreaterThan(0);
      const [, m, d, r, th, res] = l[i + 1].match(/^= \\frac\{(\d+) \\times \(?(-?[\d.]+)\)?\}\{(\d+)\}\\cos (\d+)\^\\circ = (-?[\d.]+)/)!;
      const f = ((Number(m) * Number(d)) / Number(r)) * Math.cos((Number(th) * Math.PI) / 180);
      expect(Math.abs(f - Number(res)), `${v}: ${l[i + 1]}`).toBeLessThanOrEqual(Math.max(0.01 * Math.abs(Number(res)), 0.01));
    }
    // v = 8.50 m/s: (8.50² − 9.8 × 20 tan 20°) = 0.912 m²/s².
    expect(at(sc, { preset: 'banked', vBanked: 8.5 }, 0).lines).toContain('= \\frac{1000 \\times 0.912}{20}\\cos 20^\\circ = 42.8\\ \\mathrm{N}');
    // The speed readout at the slider's resolution: 10.00, as the slider label.
    expect(at(sc, { preset: 'flat', vFlat: 10 }, 0).ro('v')).toBe('10.00');
    // On the circle F_net,r and F_cf print as mv²/r: one number, not 3612 against 3613 (R8).
    const b = at(sc, { preset: 'banked', vBanked: 8.5, rot: true }, 100);
    expect(b.lines).toContain("\\sum F'_r = F_{\\text{net},r} - F_\\text{cf} = 3613 - 3613 = 0\\ \\mathrm{N}");
    expect(b.ro('F_{\\text{net},r}')).toBe(b.ro('mv^2/r'));
    expect(at(sc, { rot: true }, 100).lines).toContain("\\sum F'_r = F_{\\text{net},r} - F_\\text{cf} = 4.50 - 4.50 = 0\\ \\mathrm{N}");
  });
});

describe('Ch 7 spring at the end of the run (audit §5: 2.96×10⁻⁴ m/s, 8.76×10⁻⁸ J)', () => {
  it('v, K, W and ΔK: residues below 10⁻³ of the run scale print an exact 0 (R7a)', async () => {
    const sc = await scene(7, 'work');
    const e = at(sc, { preset: 'spring' }, END);
    expect(e.ro('v')).toBe('0');
    expect(e.ro('K')).toBe('0');
    expect(e.lines).toContain('= -\\tfrac12(2)[(-2.00)^2 - (-2)^2] = 0\\ \\mathrm{J}');
    expect(e.lines).toContain('K = \\tfrac12 mv^2 = \\tfrac12(2)(0)^2 = 0\\ \\mathrm{J}');
    expect(e.lines).toContain('= \\tfrac12(2)[(0)^2 - 0^2] = 0\\ \\mathrm{J}');
    expect(e.lines.join(' ')).not.toMatch(/10\^\{-/);
    // Mid-run: the same strings as the readouts.
    const m = at(sc, { preset: 'spring' }, 600);
    expect(m.lines).toContain(`K = \\tfrac12 mv^2 = \\tfrac12(2)(${m.ro('v')})^2 = ${m.ro('K')}\\ \\mathrm{J}`);
    // Piecewise force: the segment force as set.
    expect(at(sc, {}, 600).lines[0]).toBe('F(5.26\\ \\mathrm{m}) = -1.5\\ \\mathrm{N}');
  });
});

describe('Ch 8 (R7a: closed path and turning points)', () => {
  it('path: around a closed path W is an exact 0; g from the constant table', async () => {
    const sc = await scene(8, 'path');
    for (const force of ['gravity', 'spring']) {
      const e = at(sc, { force, closed: true }, END);
      expect(e.lines.some((l) => /^\\oint .* = 0\\ \\mathrm\{J\}$/.test(l)), force).toBe(true);
      expect(e.ro('W'), force).toBe('0');
    }
    expect(at(sc, {}, 0).lines).toContain('= -(1)(9.8)(1.5) = -14.7\\ \\mathrm{J}');
  });
  it('energy: K, U and E as their readouts, E = K + U on those strings', async () => {
    const sc = await scene(8, 'energy');
    for (const steps of [0, 300, 600]) {
      const r = at(sc, {}, steps);
      expect(r.lines).toContain(`E = K + U = ${r.ro('K')} + ${r.ro('U')} = ${r.ro('E')}\\ \\mathrm{J}`);
    }
  });
});

describe('Ch 9 (PENDING: m1, m2, v1 labels; R7a totals)', () => {
  it('track: masses and initial velocities as their labels, e as its label or an exact 1', async () => {
    const sc = await scene(9, 'track');
    const d = at(sc, {}, 0);
    expect(d.lines[1]).toBe('= (1.0)(2.00) + (1.0)(0.00) = 2.00\\ \\mathrm{kg\\,m/s}');
    expect(d.lines[4]).toBe('v_\\mathrm{cm} = \\frac{p_\\mathrm{tot}}{m_1 + m_2} = \\frac{2.00}{2.0} = 1.00\\ \\mathrm{m/s}');
    expect(at(sc, {}, 800).lines).toContain('e = \\frac{v_{2f} - v_{1f}}{v_{1i} - v_{2i}} = \\frac{(2.00) - (0.00)}{(2.0) - (0.0)} = 1');
    const ine = at(sc, { kind: 'inelastic', m1: 1.3, m2: 2.7, v2: -0.7, e: 0.35 }, 800);
    expect(ine.lines[1]).toBe(`= (1.3)(-0.460) + (2.7)(0.485) = ${ine.ro('p_\\mathrm{tot}')}\\ \\mathrm{kg\\,m/s}`);
    // 3 figures (zero handling only, 2026-11-24).
    expect(ine.ro('p_\\mathrm{tot}')).toBe('0.710');
    expect(ine.lines[5]).toMatch(/\{\(2\.0\) - \(-0\.7\)\} = 0\.35$/);
    // Explosion from rest: p_tot is an exact 0.
    const ex = at(sc, { kind: 'explode' }, 600);
    expect(ex.ro('p_\\mathrm{tot}')).toBe('0');
    expect(ex.lines[1]).toMatch(/ = 0\\ \\mathrm\{kg\\,m\/s\}$/);
  });
  it('puck: m2 as its label, p_tot,y an exact 0', async () => {
    const sc = await scene(9, 'puck');
    const e = at(sc, {}, 600);
    expect(e.lines[1]).toBe('= (1)(0.463) + (1.0)(1.04) = 1.50\\ \\mathrm{kg\\,m/s}');
    expect(e.lines[3]).toBe('= (1)(0.693) + (1.0)(-0.693) = 0\\ \\mathrm{kg\\,m/s}');
    expect(e.ro('p_{\\mathrm{tot},y}')).toBe('0');
  });
});

describe('Ch 10 (PENDING: rA, rB, m, tau labels; d at the drag resolution)', () => {
  it('rotor: slider values as their labels', async () => {
    const l = at(await scene(10, 'rotor'), {}, 600).lines;
    expect(l[0]).toBe('I_A = 2mr_A^2 = 2(1.0)(0.50)^2 = 0.500\\ \\mathrm{kg\\,m^2}');
    expect(l[1]).toBe('I_B = 2mr_B^2 = 2(1.0)(1.00)^2 = 2.00\\ \\mathrm{kg\\,m^2}');
    expect(l[2]).toBe('\\alpha_A = \\frac{\\tau}{I_A} = \\frac{0.50}{0.500} = 1.00\\ \\mathrm{rad/s^2}');
    expect(l[5]).toBe('\\omega_B = \\alpha_B t = (0.250)(2.50) = 0.625\\ \\mathrm{rad/s}');
  });
  it('parallel: d with 2 decimals in Σ and on the stage', async () => {
    const sc = parallelScene;
    expect(at(sc, {}, 0).lines[1]).toBe('Md^2 = (2)(0.30)^2 = 0.180\\ \\mathrm{kg\\,m^2}');
    expect(at(sc, { d: -0.05 }, 0).lines[1]).toBe('Md^2 = (2)(-0.05)^2 = 0.00500\\ \\mathrm{kg\\,m^2}');
    const g = probe(sc, { t: 0 } as never, { ...(defaults(sc.params) as Params), d: -0.05 } as never, 800, 500);
    expect(g.marks.some((m) => m.text === '*d* = 0.05 m')).toBe(true);
  });
});

describe('Ch 11 (PENDING: m, mDb labels)', () => {
  it('spin: the puck mass and the dumbbell mass as their labels', async () => {
    const sc = await scene(11, 'spin');
    const p = at(sc, {}, 0).lines;
    expect(p[0]).toBe('I = mr^2 = (0.20)(1.00)^2 = 0.200\\ \\mathrm{kg\\,m^2}');
    expect(p[3]).toBe('\\frac{dA}{dt} = \\frac{L}{2m} = \\frac{0.400}{2(0.20)} = 1.00\\ \\mathrm{m^2/s}');
    expect(at(sc, { sys: 'chair' }, 0).lines[0]).toBe('I = I_0 + 2mr^2 = 1.5 + 2(2.0)(0.800)^2 = 4.06\\ \\mathrm{kg\\,m^2}');
  });
  it('roll: θ as its label, g from the constant table', async () => {
    const l = at(await scene(11, 'roll'), { theta: 12 }, 0).lines;
    expect(l[0]).toBe('a = \\frac{g\\sin\\theta}{1 + \\beta} = \\frac{9.8\\sin 12^\\circ}{1 + \\tfrac12} = 1.36\\ \\mathrm{m/s^2}');
  });
});

/**
 * A recomputation flagged by the 1 % check that stays within the rounding of 3-figure inputs (R3):
 * each input carries up to ±0.5 %, a square or product of two up to ±1 %, the result ±0.5 %; so
 * within 2 % (or 2 units in the result's last digit) it is an accepted last-digit difference. A small
 * difference of large terms (R5) misses by far more.
 */
function lastDigitOnly(sub: string): boolean {
  return parts(sub).every((pt) => {
    if (pt.inRaw === undefined || !pt.res) return true;
    const v = evalTex(pt.inRaw);
    if (v === undefined) return true;
    const x = pt.resDeg ? v / (Math.PI / 180) : v;
    return Math.abs(x - pt.res.v) <= Math.max(0.02 * Math.abs(pt.res.v), 2 * ulpOf(pt.res)) * (1 + 1e-9);
  });
}

describe('sweep: the D checks over every control of every Ch 2–11 scene', () => {
  /** Quarter points of a number control (on its step), every option of a select. */
  function samples(spec: Scene['params'][string]): unknown[] {
    if (spec.kind === 'select') return spec.options.map((o) => o.value);
    if (spec.kind !== 'number') return [];
    const n = spec as NumberParam;
    if (n.control === 'select') return n.choices ?? [];
    const lo = n.min ?? 0;
    const hi = n.max ?? 1;
    const step = n.step ?? 0.01;
    return [0.25, 0.5, 0.75].map((f) => Number((Math.round((lo + f * (hi - lo)) / step) * step).toFixed(6)));
  }
  for (const ch of [2, 3, 4, 5, 6, 7, 8, 9, 10, 11])
    it(`Ch ${String(ch).padStart(2, '0')}: results, slider labels, input figures, recomputation, small values`, async () => {
      const page = await CHAPTERS.find((m) => m.ch === ch)!.load!();
      const bad: string[] = [];
      for (const sc of page.scenes)
        for (const [k, spec] of Object.entries(sc.params))
          for (const v of samples(spec)) {
            // The scene with this control moved: policyIssues runs its own min/max/option cases around it.
            const moved = { ...sc, params: { ...sc.params, [k]: { ...spec, default: v } } } as Scene;
            const issues = policyIssues(`${ch}/${sc.id}`, moved);
            for (const c of CHECKS)
              for (const msg of issues.get(c)!)
                if (!(c === 'recompute' && lastDigitOnly(msg.slice(msg.indexOf(': ') + 2)))) bad.push(`${ch}/${sc.id} ${k}=${String(v)} ${c}: ${msg}`);
          }
      expect(bad).toEqual([]);
    }, 300_000);
});
