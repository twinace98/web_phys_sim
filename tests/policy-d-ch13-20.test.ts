// Σ digits policy D, phase 2, Ch 13–20 (docs/design.md §3.3): the strings of the audit items
// (2026-11-23, §5) and of the PENDING entries these scenes had, at the quoted settings, and a sweep
// of the policy checks with every number control moved to in-between values.
import { describe, expect, it } from 'vitest';
import { defaults } from '../src/core/params';
import { Runner } from '../src/core/runner';
import { readoutText } from '../src/core/tex';
import type { NumberParam, Params, Scene } from '../src/core/types';
import { orbitScene } from '../src/sims/ch13/orbit';
import { pendulum } from '../src/sims/ch15/pendulum';
import { shm } from '../src/sims/ch15/shm';
import { formulaLines as reflectLines } from '../src/sims/ch16/reflect';
import { resonanceScene } from '../src/sims/ch16/resonance';
import { beats } from '../src/sims/ch17/beats';
import { fmtJ } from '../src/sims/ch18/formula';
import { formulaLines as pathsLines, pathsScene } from '../src/sims/ch18/paths';
import { formulaLines as processLines } from '../src/sims/ch18/process';
import { gasScene } from '../src/sims/ch19/gas';
import { carnotScene, formulaLines as carnotLines } from '../src/sims/ch20/carnot';
import { expansionScene, omegaText } from '../src/sims/ch20/expansion';
import { heatScene } from '../src/sims/ch20/heat';
import { CHAPTERS } from '../src/sims/registry';
import { CHECKS, policyIssues } from './sigma-policy';

type AnyScene = Scene<any, any>;

/** Σ lines and readout strings at these params after running to time t (0: the initial state). */
function at(scene: AnyScene, over: Record<string, unknown>, t = 0) {
  const p = { ...(defaults(scene.params) as Params), ...over };
  const r = new Runner(scene, p as never, 1);
  if (t > 0) {
    r.play();
    while (r.playing && r.state.t < t - 1e-9) r.advance(scene.time!.h);
  }
  const lines = scene.formula!(r.state as never, r.params as never);
  const ro = (scene.readouts ?? []).map((x) => readoutText(x as never, x.value(r.state as never, r.params as never), r.params as Params));
  return { lines, ro, s: r.state, p: r.params };
}

describe('policy D, Ch 13–20: audit items at the quoted settings', () => {
  it('Ch 13 orbit, 15000 km: E = K + U = 13.5 + (-18.7) = -5.18 GJ, the readout; GM printed 3.99×10¹⁴', () => {
    const { lines, ro } = at(orbitScene, { alt: 15000, fbd: true });
    // E also from the launch without the K + U cancellation (R5): f = v₀/v_esc = 0.85.
    expect(lines.slice(2, 5)).toEqual([
      'E = K + U = 13.5 + (-18.7)',
      '= \\big[(v_0/v_\\mathrm{esc})^2 - 1\\big]\\,GMm/r_0',
      '= (0.85^2 - 1)(18.7\\ \\mathrm{GJ}) = -5.18\\ \\mathrm{GJ}',
    ]);
    expect(ro[2]).toBe('−5.18');
    // Near the escape speed: 31.6 + (−32.2) alone would read −0.6; the launch form keeps −0.641.
    expect(at(orbitScene, { speed: 0.99 }).lines[4]).toBe('= (0.99^2 - 1)(32.2\\ \\mathrm{GJ}) = -0.641\\ \\mathrm{GJ}');
    // Exactly the escape speed: E = 0 (R7a), circular 0.71: f² = 1/2 exactly.
    const esc = at(orbitScene, { speed: 1 });
    expect(esc.lines[4]).toBe('= (1.00^2 - 1)(32.2\\ \\mathrm{GJ}) = 0\\ \\mathrm{GJ}');
    expect(esc.ro[2]).toBe('0');
    expect(at(orbitScene, { speed: 0.71 }).lines[4]).toBe('= ((1/\\sqrt{2})^2 - 1)(32.2\\ \\mathrm{GJ}) = -16.1\\ \\mathrm{GJ}');
    expect(lines[0]).toBe('K = \\tfrac12 mv^2 = \\tfrac12(1000)(5.19\\times 10^{3})^2\\ \\mathrm{J} = 13.5\\ \\mathrm{GJ}');
    expect(ro[0]).toBe('5.19');
    expect(lines[1]).toBe('U = -\\frac{GMm}{r} = -\\frac{(3.99\\times 10^{14})(1000)}{2.14\\times 10^{7}}\\ \\mathrm{J} = -18.7\\ \\mathrm{GJ}');
    const all = lines.join(' ');
    expect(all).not.toContain('3.986');
    expect(all.match(/3\.99\\times 10\^\{14\}/g)).toHaveLength(3);
  });

  it('Ch 15 SHM: A, k, m, ζ as their slider labels; the phase with 3 figures in (−180°, 180°]', () => {
    const { lines } = at(shm, {});
    expect(lines.slice(0, 3)).toEqual([
      '\\omega = \\sqrt{k/m} = \\sqrt{20/1.0} = 4.47\\ \\mathrm{rad/s}',
      'T = 2\\pi\\sqrt{m/k} = 2\\pi\\sqrt{1.0/20} = 1.40\\ \\mathrm{s}',
      'x = A\\cos\\omega t = (0.20)\\cos(0^\\circ) = 0.200\\ \\mathrm{m}',
    ]);
    // Turning point: K = 0 exactly (R7a), U and E with the decimals of ½kA².
    expect(lines[4]).toBe('E = K + U = 0 + 0.400 = 0.400\\ \\mathrm{J}');
    expect(lines[5]).toBe('= \\tfrac12 kA^2 = \\tfrac12(20)(0.20)^2 = 0.400\\ \\mathrm{J}');
    // The PENDING case: k = 40 at 1.25 s printed the phase as 92.96°.
    const k40 = at(shm, { k: 40 }, 1.25);
    expect(k40.lines[2]).toBe('x = A\\cos\\omega t = (0.20)\\cos(93.0^\\circ) = -0.0103\\ \\mathrm{m}');
    // 320.3° is now −39.7°.
    expect(at(shm, {}, 1.25).lines[2]).toBe('x = A\\cos\\omega t = (0.20)\\cos(-39.7^\\circ) = 0.154\\ \\mathrm{m}');
    const damped = at(shm, { zeta: 0.1, m: 0.5 });
    expect(damped.lines[1]).toBe('\\omega = \\omega_0\\sqrt{1 - \\zeta^2} = (6.32)\\sqrt{1 - (0.10)^2} = 6.29\\ \\mathrm{rad/s}');
    expect(damped.lines[4]).toBe('= -(6.32)^2(0.200) - 2(0.10)(6.32)(0) = -8.00\\ \\mathrm{m/s^2}');
  });

  it('Ch 15 SHM free-body sum: F_s − mg written as −kx near equilibrium (R5)', () => {
    const { lines, s } = at(shm, { fbd: true, k: 40 }, 1.25);
    expect(Math.abs((s as { x: number }).x)).toBeLessThan(0.02);
    expect(lines.slice(-2)).toEqual(['\\Sigma F = F_s - mg = 10.2 - 9.80', '= -kx = -(40)(-0.0103) = 0.414\\ \\mathrm{N} = ma']);
  });

  it('Ch 15 pendulum, 10°: T₀ = 2.01 s, K = 1.57, T = 2.01 s, (T − T₀)/T₀ = 2K/π − 1 = 0.191 %', () => {
    const { lines, ro } = at(pendulum, { theta0: 10 });
    expect(lines.slice(0, 4)).toEqual([
      'T_0 = 2\\pi\\sqrt{L/g} = 2\\pi\\sqrt{1.0/9.8} = 2.01\\ \\mathrm{s}',
      'K\\!\\left(\\sin\\tfrac{\\theta_0}{2}\\right) = K(\\sin 5^\\circ) = 1.57',
      'T = 4\\sqrt{L/g}\\,K = 4\\sqrt{1.0/9.8} \\times 1.57 = 2.01\\ \\mathrm{s}',
      '\\frac{T - T_0}{T_0} = \\frac{2K}{\\pi} - 1 = 0.191\\ \\%',
    ]);
    expect(ro).toEqual(['2.01', '2.01', '0.191']);
    // At release v = 0 and a_r = 0 exactly (R7a).
    expect(lines[6]).toBe('a_\\mathrm{r} = v^2/L = (0)^2/1.0 = 0\\ \\mathrm{m/s^2}');
  });

  it('Ch 16 reflect: at a fixed end y(L) = h − h is an exact 0 (R7a), the halves with the same string', () => {
    const lines = reflectLines(2.5, { mode: 'wave', end: 'fixed', lambda: 1.6, parts: true });
    expect(lines.slice(-2)).toEqual(['h(t - L/v) = -0.141\\ \\mathrm{m}', 'y(L) = h - h = (-0.141) - (-0.141) = 0\\ \\mathrm{m}']);
    const free = reflectLines(2.5, { mode: 'wave', end: 'free', lambda: 1, parts: true });
    expect(free[1]).toBe('f = v/\\lambda = 2/1.0 = 2.00\\ \\mathrm{Hz}');
  });

  it('Ch 16 resonance: f as its slider label in Σ and readout (0.50, not 0.5 or 0.500)', () => {
    const { lines, ro } = at(resonanceScene, { f: 0.5 });
    expect(lines[0]).toBe('\\lambda = v/f = 4/0.50 = 8.00\\ \\mathrm{m}');
    expect(lines[1]).toBe('2L/\\lambda = 2Lf/v = 2 \\times 2 \\times 0.50/4 = 0.500');
    expect(ro[0]).toBe('0.50');
  });

  it('Ch 17 beats: f_beat = 2.0 Hz (slider label), 20 + 2.0 = 22 Hz; 440 + 1.5 = 441.5 Hz', () => {
    const { lines, ro } = at(beats, {});
    expect(lines.slice(0, 3)).toEqual([
      'f_2 = 20 + 2.0 = 22\\ \\mathrm{Hz}',
      'f_\\text{beat} = \\lvert f_1 - f_2 \\rvert = \\lvert 20 - 22 \\rvert = 2.0\\ \\mathrm{Hz}',
      'T_\\text{beat} = 1/f_\\text{beat} = 1/2.0 = 0.500\\ \\mathrm{s}',
    ]);
    expect(ro).toEqual(['22', '2.0', '0.500']);
    expect(at(beats, { f1: 440, df: 1.5 }).lines[0]).toBe('f_2 = 440 + 1.5 = 441.5\\ \\mathrm{Hz}');
  });

  it('Ch 18 process: p, V, nR with 3 figures, energies in whole joules (Σ, readouts and bars alike)', () => {
    const p = { proc: 'isobaric', dirV: 'expand', dirT: 'heat', gas: 'mono' };
    // The audit's case (V = 16.25 L): was Q = 937.5 + 625.0 = 1562 J next to a 3-figure T line.
    expect(processLines(2.5, p)).toEqual([
      'T = \\frac{pV}{nR} = \\frac{100 \\times 16.3}{3.33} = 488\\ \\mathrm{K}',
      'W = p(V - V_\\text{A}) = 100 \\times (16.3 - 10) = 625\\ \\mathrm{J}',
      '\\Delta E_\\text{int} = \\tfrac{f}{2}\\,\\Delta(pV) = 1.5 \\times (1625 - 1000) = 938\\ \\mathrm{J}',
      'Q = \\Delta E_\\text{int} + W = 938 + 625 = 1563\\ \\mathrm{J}',
    ]);
    expect(processLines(0, p)[3]).toBe('Q = \\Delta E_\\text{int} + W = 0 + 0 = 0\\ \\mathrm{J}');
    expect([fmtJ(0), fmtJ(1e-12), fmtJ(-665.9), fmtJ(1562.5)]).toEqual(['0', '0', '−666', '1563']);
  });

  it('Ch 18 paths, ADB at the end: W = 50 × (23.3 − 10) = 667 J, Q = 250 + 667 = 917 J; readouts in whole J', () => {
    const p = { hl: 'ADB', B: 'b1', gas: 'mono' };
    // The PENDING case: was 50 × (23.33 − 10) and Q = 250.0 + 666.7 = 917 J.
    expect(pathsLines({ t: 5 }, p)).toEqual([
      'W = p_\\text{B}(V - V_\\text{A}) = 50 \\times (23.3 - 10) = 667\\ \\mathrm{J}',
      '\\Delta E_\\text{int} = \\tfrac{f}{2}\\,\\Delta(pV) = 1.5 \\times (1167 - 1000) = 250\\ \\mathrm{J}',
      'Q = \\Delta E_\\text{int} + W = 250 + 667 = 917\\ \\mathrm{J}',
    ]);
    const { ro } = at(pathsScene, { hl: 'ADB' });
    expect(ro).toEqual(['0', '0', '0']);
  });

  it('Ch 19 pressure: k_B and m from the constant table and 3 figures; the measured pressure to its scatter (R4)', () => {
    const z = at(gasScene, {});
    expect(z.lines[0]).toBe('\\frac{J}{L\\,t} = \\frac{0}{20 \\times 10.0} = 0\\ \\mathrm{mN/m}');
    expect(z.lines[1]).toBe('\\frac{NkT}{A} = \\frac{100 \\times 1.38\\times 10^{-23} \\times 300}{(20\\times 10^{-9})^2} = 1.04\\ \\mathrm{mN/m}');
    expect(z.lines[3]).toBe('\\sqrt{\\frac{2kT}{m}} = \\sqrt{\\frac{2 \\times 1.38\\times 10^{-23} \\times 300}{6.65\\times 10^{-27}}} = 1.12\\ \\mathrm{km/s}');
    expect(z.ro[0]).toBe('0');
    const { lines, ro } = at(gasScene, {}, 30);
    expect(ro[0]).toBe('1.2');
    expect(lines[0]).toMatch(/^\\frac\{J\}\{L\\,t\} = \\frac\{\d{3}\}\{20 \\times 30\.0\} = \(1\.2 \\pm 0\.2\)\\ \\mathrm\{mN\/m\}$/);
    expect(lines[2]).toMatch(/= \\frac\{1\.2\}\{1\.04\} = 1\.\d \\pm 0\.2$/);
    // Long run, many molecules: the scatter shrinks and the measured value gets a figure more.
    const big = at(gasScene, { N: 1000, T: 1200, L: 15 }, 50);
    expect(big.ro[0]).toMatch(/^7\d$/);
    expect(big.lines[0]).toMatch(/\\frac\{5\.\d\d\\times 10\^\{4\}\}\{15 \\times 50\.0\} = \(7\d \\pm 2\)/);
  });

  it('Ch 20 expansion, closed box: Ω = 1 and ΔS/k = ln 1 = 0 exactly (R2) in Σ, readouts and bar labels', () => {
    const { lines, ro } = at(expansionScene, {});
    expect(lines[0]).toBe('\\Omega(n) = \\binom{N}{n} = \\binom{10}{10} = 1');
    expect(lines[1]).toBe('\\Delta S/k = \\ln\\Omega(n) = \\ln(1) = 0');
    expect(ro.slice(1)).toEqual(['1', '0']);
    expect([1, 10, 45, 252, Math.exp(66.78)].map(omegaText)).toEqual(['1', '10', '45', '252', '1.01×10²⁹']);
  });

  it('Ch 20 heat: q̄ = 100 as the slider label, S/k to 3 figures, ln 1 = 0 and kT = 0 exactly', () => {
    const a = at(heatScene, {});
    expect(a.lines.slice(0, 4)).toEqual([
      'S_\\text{A}/k = \\ln\\Omega_\\text{A} = \\ln\\binom{129}{100} = 66.3',
      'S_\\text{B}/k = \\ln\\Omega_\\text{B} = \\ln\\binom{69}{0} = 0',
      'S_\\text{tot}/k = 66.3 + 0 = 66.3',
      'kT_\\text{A}/\\varepsilon = \\frac{1}{\\ln(1 + N_\\text{A}/\\bar q_\\text{A})} = \\frac{1}{\\ln(1 + 30/100)} = 3.81',
    ]);
    expect(a.lines[4]).toBe('\\bar q_\\text{B} = 0 \\;\\Rightarrow\\; kT_\\text{B}/\\varepsilon = 0');
    expect(a.ro).toEqual(['100', '3.81', '0']);
    const b = at(heatScene, { start: 'B' });
    expect(b.lines[4]).toBe('kT_\\text{B}/\\varepsilon = \\frac{1}{\\ln(1 + N_\\text{B}/\\bar q_\\text{B})} = \\frac{1}{\\ln(1 + 70/100)} = 1.88');
  });

  it('Ch 20 carnot: nR = 3.33, volumes with 3 figures, energies in whole joules as on the bars', () => {
    const lines = carnotLines(5, { tc: 300, gas: 'mono' });
    expect(lines[0]).toBe('Q_\\text{H} = nRT_\\text{H}\\ln\\frac{V_\\text{B}}{V_\\text{A}} = 3.33 \\times 600\\ln\\frac{20}{10} = 1386\\ \\mathrm{J}');
    expect(lines[1]).toBe('Q_\\text{C} = nRT_\\text{C}\\ln\\frac{V_\\text{C}}{V_\\text{D}} = 3.33 \\times 300\\ln\\frac{56.6}{28.3} = 693\\ \\mathrm{J}');
    expect(lines[5]).toMatch(/^W = Q_\\text\{H\} - Q_\\text\{C\} - \\Delta E_\\text\{int\} = 1386 - \d+ - \(-\d+\) = \d+\\ \\mathrm\{J\}$/);
    expect(at(carnotScene, {}).lines[5]).toBe('W = Q_\\text{H} - Q_\\text{C} - \\Delta E_\\text{int} = 0 - 0 - 0 = 0\\ \\mathrm{J}');
  });
});

/** The scene with every visible number control's default moved to the point `f` of its range (a stop for a select). */
function movedDefaults(scene: AnyScene, f: number): AnyScene {
  const params: Record<string, unknown> = {};
  for (const [k, spec] of Object.entries(scene.params as Record<string, NumberParam>)) {
    if (spec.kind !== 'number' || spec.group === 'hidden') {
      params[k] = spec;
      continue;
    }
    let v: number;
    if (spec.control === 'select') {
      const c = spec.choices ?? [spec.default];
      v = c[Math.min(c.length - 1, Math.floor(f * c.length))];
    } else {
      const lo = spec.min ?? 0;
      const hi = spec.max ?? 1;
      const step = spec.step ?? (hi - lo) / 100;
      v = Number((lo + Math.round((f * (hi - lo)) / step) * step).toFixed(10));
    }
    params[k] = { ...spec, default: v };
  }
  return { ...scene, params } as AnyScene;
}

describe('policy D, Ch 13–20: the checks with the controls at in-between settings', () => {
  for (const ch of [13, 14, 15, 16, 17, 18, 19, 20]) {
    it(`Ch ${ch}: results, slider values, input figures, recomputation, small values at 0.23, 0.5 and 0.77 of every range`, async () => {
      const page = await CHAPTERS.find((m) => m.ch === ch)!.load!();
      const bad: string[] = [];
      for (const s of page.scenes as AnyScene[])
        for (const f of [0.23, 0.5, 0.77]) {
          const issues = policyIssues(`${ch}/${s.id}`, movedDefaults(s, f));
          for (const c of CHECKS) for (const l of issues.get(c)!) bad.push(`${ch}/${s.id} @${f} ${c}: ${l}`);
        }
      expect(bad).toEqual([]);
    }, 120_000);
  }
});
