// Σ digits, policy D (docs/design.md §3.3), phase 2 group D3: Ch 22-32. Exact strings at the
// audit's cases (scratchpad sigfig-review.md §5), and the D checks on states the sigma-all loop
// does not reach (dragged paths, long runs, switches mid-run, near-critical damping).
import { describe, expect, it } from 'vitest';
import { defaults } from '../src/core/params';
import { Runner } from '../src/core/runner';
import { CONST, readoutText, texOf } from '../src/core/tex';
import type { Params, Scene } from '../src/core/types';
import en25 from '../src/sims/ch25/i18n.en.json';
import ko25 from '../src/sims/ch25/i18n.ko.json';
import { field } from '../src/sims/ch22/scene';
import { gaussScene, gaussValues } from '../src/sims/ch23/scene';
import { potential } from '../src/sims/ch24/scene';
import { capacitor } from '../src/sims/ch25/scene';
import { conduction, scatterI } from '../src/sims/ch26/scene';
import { rcCircuit } from '../src/sims/ch27/scene';
import { lorentzScene } from '../src/sims/ch28/lorentz';
import { cyclotronScene } from '../src/sims/ch28/cyclotron';
import { biot } from '../src/sims/ch29/biot';
import { ampere } from '../src/sims/ch29/ampere';
import { faraday } from '../src/sims/ch30/faraday';
import { maxwell } from '../src/sims/ch30/maxwell';
import { acScene } from '../src/sims/ch31/ac';
import { freeScene } from '../src/sims/ch31/free';
import { magnet } from '../src/sims/ch32/magnet';
import { origin } from '../src/sims/ch32/origin';
import { evalTex, parts, recomputes, texClean, toks } from './sigma-policy';

type Run = { r: Runner<Params, { t: number }>; p: Params; lines: () => string[]; ro: (label: string) => string; ov: () => string };

/** A scene at defaults + `over`, run for `seconds` of sim time (whole steps). */
function run(sc: unknown, over: Record<string, unknown> = {}, seconds = 0, seed = 1): Run {
  const scene = sc as Scene;
  const p = { ...(defaults(scene.params) as Params), ...over };
  const r = new Runner(scene, p as never, seed) as unknown as Runner<Params, { t: number }>;
  if (seconds > 0 && scene.time) {
    r.play();
    while (r.state.t < seconds - 1e-9 && r.playing) r.advance(scene.time.h);
  }
  return {
    r,
    p: r.params,
    lines: () => scene.formula!(r.state as never, r.params as never),
    ro: (label) => {
      const spec = scene.readouts!.find((x) => x.label === label)!;
      return readoutText(spec as never, spec.value(r.state as never, r.params as never), r.params);
    },
    ov: () => scene.overlay!(r.state as never, r.params as never),
  };
}

const CONST_TOKS = new Set(Object.values(CONST).flatMap((c) => toks(texClean(c.tex)).map((t) => t.s)));

/**
 * The input and recomputation checks of policy D on any lines: decimal inputs with at most
 * 3 figures (constants and the given slider labels exempt), printed arithmetic within 1 %.
 */
function dIssues(lines: string[], labels: string[] = []): string[] {
  const out: string[] = [];
  for (const l of lines)
    for (const part of parts(l)) {
      for (const t of part.inp) if (!t.int && t.sig > 3 && !CONST_TOKS.has(t.s.replace(/^-/, '')) && !labels.includes(t.s)) out.push(`input ${t.s}: ${l}`);
      if (part.inRaw !== undefined && part.res && part.inp.length) {
        const v = evalTex(part.inRaw);
        if (v !== undefined && !recomputes(v, part.res)) out.push(`recompute ${v}: ${l}`);
      }
    }
  return out;
}

describe('policy D, Ch 22-24', () => {
  it('Ch 22: k is the CONST string', () => {
    const lines = run(field).lines();
    expect(lines[0]).toContain(`\\frac{(${CONST.k.tex})(1)(1)\\times 10^{-18}}`);
    // Parallel plates, test charge on the axis: E_x vanishes by symmetry and prints an exact 0 (R7a).
    const plates = run(field, { preset: 'plates' }).lines();
    expect(plates[1]).toMatch(/= \(0,\\ \d+\)\\ \\mathrm\{N\/C\}$/);
    expect(plates[2]).toContain('\\sqrt{0^2 + ');
    expect(run(field, { test: false }).lines()[0]).toBe(`k = \\frac{1}{4\\pi\\varepsilon_0} = ${CONST.k.tex}\\ \\mathrm{N\\,m^2/C^2}`);
  });

  it('Ch 23: ε0 from CONST; nothing enclosed prints an exact 0 in the stage panel and in Σ', () => {
    const d = run(gaussScene);
    expect(d.lines()[1]).toBe('\\frac{\\lambda_\\text{enc}}{\\varepsilon_0} = \\frac{2\\times 10^{-9}}{8.85\\times 10^{-12}} = 226\\ \\mathrm{N\\,m/C}');
    const G = (defaults(gaussScene.params) as Params).G as number[];
    let zeros = 0;
    for (const g of [[0.5, -0.2, 0.25], [0.8, 0.5, 0.2], [-0.8, -0.5, 0.15], [0, 0, 0.7]]) {
      const c = run(gaussScene, { G: [...g, G[3]] });
      const v = gaussValues(c.p);
      if (v.enc !== 0) continue;
      zeros++;
      expect(c.lines()).toEqual(['\\lambda_\\text{enc} = 0\\ \\mathrm{nC/m}', '\\frac{\\lambda_\\text{enc}}{\\varepsilon_0} = \\frac{0}{8.85\\times 10^{-12}} = 0\\ \\mathrm{N\\,m/C}', '\\oint E_n\\,dl = 0\\ \\mathrm{N\\,m/C}']);
      expect(c.ov()).toContain('\\oint E_n\\,dl &=& 0\\ ');
      expect(c.ov()).toContain('\\varepsilon_0 &=& 0\\ ');
    }
    expect(zeros).toBeGreaterThan(0);
  });

  it('Ch 24: ΔV = 0 at the same point (R7a), not 15.002 - 15.002 = 0.00 V', () => {
    for (const preset of ['dipole', 'single', 'like', 'plates']) {
      const c = run(potential, { preset });
      const lines = c.lines();
      expect(lines[1]).toBe('\\Delta V = V - V_A = 0');
      expect(lines[3]).toBe('-q_0\\,\\Delta V = -(1\\ \\mathrm{nC})(0\\ \\mathrm{V}) = 0\\ \\mathrm{nJ}');
      expect(c.ro('\\Delta V')).toBe('0');
      expect(c.ro('W')).toBe('0');
      expect(lines.join(' ')).not.toMatch(/\d\.\d{4}/);
    }
    // single preset: V = V_A = 15.0 V on the first line.
    expect(run(potential, { preset: 'single' }).lines()[0]).toBe('V = \\sum_i k\\,\\frac{q_i}{r_i} = 15.0\\ \\mathrm{V},\\quad V_A = 15.0\\ \\mathrm{V}');
  });

  it('Ch 24: after a drag ΔV is the readout; the subtraction shows only when 3-figure V, V_A give it (R5)', () => {
    for (const preset of ['dipole', 'single', 'plates']) {
      for (const end of [
        [0.5, -0.3],
        [0.1, 0.4],
        [-0.15 + 1e-3, 0.58],
        [-0.15, 0.58 + 2e-4],
      ]) {
        const c = run(potential, { preset });
        const s = c.r.state as unknown as { path: number[] };
        s.path.push(0.1, 0.45, ...end);
        const lines = c.lines();
        const dV = texOf(c.ro('\\Delta V'));
        expect(lines[1].endsWith(`= ${dV}\\ \\mathrm{V}`), lines[1]).toBe(true);
        expect(lines[3]).toContain(`(${dV}\\ \\mathrm{V})`);
        expect(dIssues(lines), lines.join('\n')).toEqual([]);
      }
    }
  });
});

describe('policy D, Ch 25-27', () => {
  it('Ch 25: κ of air is the table value 1.00054 in the dropdown and in Σ (R8); ε0 from CONST; 3-figure inputs', () => {
    expect(en25['ch25.diel.air']).toBe('Air (κ = 1.00054)');
    expect(ko25['ch25.diel.air']).toBe('공기 (κ = 1.00054)');
    const air = run(capacitor, { dielectric: 'air' }).lines();
    expect(air[0]).toBe('C = \\frac{\\kappa\\varepsilon_0 A}{d} = \\frac{(1.00054)(8.85\\times 10^{-12})(100\\times 10^{-4})}{1.0\\times 10^{-3}}\\ \\mathrm{F} = 88.6\\,\\mathrm{pF}');
    const d = run(capacitor).lines();
    expect(d[0]).toBe('C = \\frac{\\kappa\\varepsilon_0 A}{d} = \\frac{(4.7)(8.85\\times 10^{-12})(100\\times 10^{-4})}{1.0\\times 10^{-3}}\\ \\mathrm{F} = 416\\,\\mathrm{pF}');
    expect(d[1]).toBe('Q = CV_0 = (416\\,\\mathrm{pF})(12\\ \\mathrm{V}) = 4.99\\,\\mathrm{nC}');
    expect(d[4]).toBe('U = \\tfrac{1}{2} C V^2 = \\tfrac{1}{2}(416\\,\\mathrm{pF})(12\\ \\mathrm{V})^2 = 30.0\\,\\mathrm{nJ}');
    // Every option and slider end: no 4-figure input except κ of air, arithmetic within 1 %.
    for (const dielectric of ['air', 'paper', 'glass', 'water'])
      for (const source of ['on', 'off'])
        for (const [A, dd] of [
          [50, 0.5],
          [200, 2],
          [130, 1.3],
        ]) {
          const lines = run(capacitor, { dielectric, source, A, d: dd }).lines();
          expect(dIssues(lines, ['1.00054']), lines.join('\n')).toEqual([]);
        }
  });

  it('Ch 26: measured Ī to its scatter (R4): 0.188 C / 2.0 s = 94 mA; the prediction is V/R = 100 mA, R = 10.0 Ω', () => {
    const c = run(conduction, {}, 3);
    expect(c.ro('\\bar I')).toBe('94');
    expect(c.ro('V/\\bar I')).toBe('10.6');
    expect(c.ro('\\rho L/A')).toBe('10.0');
    const lines = c.lines();
    expect(lines).toContain('R = \\rho\\,\\frac{L}{A} = (10\\ \\Omega)\\,\\frac{4.0}{4}\\cdot\\frac{2}{2.0}\\cdot\\frac{300}{300} = 10.0\\ \\mathrm{\\Omega}');
    expect(lines).toContain('\\frac{V}{R} = \\frac{1.0\\ \\mathrm{V}}{10.0\\ \\Omega} = 100\\ \\mathrm{mA}');
    expect(lines).toContain('\\bar I = \\frac{\\Delta Q}{\\Delta t} = \\frac{0.188\\ \\mathrm{C}}{2.0\\ \\mathrm{s}} = 94\\ \\mathrm{mA}');
    expect(lines).toContain('V/\\bar I = \\frac{1.0\\ \\mathrm{V}}{94\\ \\mathrm{mA}} = 10.6\\ \\mathrm{\\Omega}');
    // No line claims the prediction is the measured I of the readout.
    expect(lines.some((l) => l.startsWith('I ='))).toBe(false);
  });

  it('Ch 26: the scatter estimate follows the spread of 40 seeds (within a factor 1.5) at small and large drift', () => {
    const cases: [Record<string, number>, number, number][] = [
      // [settings, Δt, standard deviation of Ī over 40 seeds measured 2026-11-23]
      [{}, 2, 7.67],
      [{}, 25, 1.45],
      [{ V: 0 }, 5, 3.72],
      [{ V: 1.5, T: 200, L: 2, A: 3 }, 2, 18.17],
      [{ V: 1.5, T: 200, L: 2, A: 3 }, 25, 4.58],
    ];
    for (const [over, dt, sd] of cases) {
      const p = { ...(defaults(conduction.params) as Params), ...over } as never;
      const est = scatterI(p, dt);
      expect(est / sd, JSON.stringify({ over, dt })).toBeGreaterThan(1 / 1.5);
      expect(est / sd, JSON.stringify({ over, dt })).toBeLessThan(1.5);
    }
  });

  it('Ch 26: readouts equal the Σ result and inputs stay at 3 figures over the controls, seeds and the whole run', () => {
    for (const over of [{}, { V: 0.1 }, { V: 1.5, T: 200, L: 2, A: 3 }, { T: 450, L: 6, A: 1 }, { V: 0 }])
      for (const seed of [1, 2, 3])
        for (const t of [3, 8, 30]) {
          const c = run(conduction, over, t, seed);
          const lines = c.lines();
          const I = c.ro('\\bar I');
          if (I === '–') continue;
          expect(lines.some((l) => l.endsWith(`= ${texOf(I)}\\ \\mathrm{mA}`) && l.startsWith('\\bar I')), lines.join('\n')).toBe(true);
          const vi = c.ro('V/\\bar I');
          if (vi !== '–') expect(lines.some((l) => l.startsWith('V/\\bar I') && l.endsWith(`= ${texOf(vi)}\\ \\mathrm{\\Omega}`))).toBe(true);
          expect(dIssues(lines), lines.join('\n')).toEqual([]);
        }
  });

  it('Ch 27: i = (ℰ/R) e^{-t/τ} written directly (R5), not (12 - 11.9994552)/0.5 kΩ', () => {
    const c = run(rcCircuit, { R: 0.5 }, 5);
    const lines = c.lines();
    expect(lines).toContain('i = \\frac{\\mathcal{E}}{R}\\,e^{-t/\\tau} = \\frac{12\\ \\mathrm{V}}{0.5\\ \\mathrm{k\\Omega}}\\,e^{-5.00/0.500} = 0.00109\\ \\mathrm{mA}');
    expect(lines).toContain('V_C = \\frac{q}{C} = \\frac{12.0\\times 10^{-3}}{1000\\times 10^{-6}}\\ \\mathrm{V} = 12.0\\ \\mathrm{V}');
    expect(lines[0]).toBe('\\tau = RC = (0.5\\ \\mathrm{k\\Omega})(1000\\ \\mathrm{\\mu F}) = 0.500\\ \\mathrm{s}');
    expect(c.ro('i')).toBe('0.00109');
    expect(lines.join(' ')).not.toContain('11.99');
    // Default R prints as its slider: 2.0 kΩ.
    expect(run(rcCircuit).lines()[0]).toBe('\\tau = RC = (2.0\\ \\mathrm{k\\Omega})(1000\\ \\mathrm{\\mu F}) = 2.00\\ \\mathrm{s}');
  });

  it('Ch 27: a settled current is a small physical value, never 0.00 (R7b); switches and R, C changes mid-run pass the D checks', () => {
    // τ = 0.05 s: 10 s is 200 τ (i ≈ 10⁻⁸⁶ mA), where the old loop rule printed 0.00.
    const long = run(rcCircuit, { R: 0.5, C: 100 }, 10);
    expect(long.ro('i')).toMatch(/^\d\.\d\d×10⁻[⁰¹²³⁴⁵⁶⁷⁸⁹]+$/);
    expect(long.lines().at(-1)).toMatch(/= \d\.\d\d\\times 10\^\{-\d+\}\\ \\mathrm\{mA\}$/);
    const dis = run(rcCircuit, { sw: 'discharge', R: 0.5, C: 100 }, 10);
    expect(dis.ro('V_C')).toMatch(/^\d\.\d\d×10⁻[⁰¹²³⁴⁵⁶⁷⁸⁹]+$/);
    expect(dis.ro('i')).toMatch(/^−\d\.\d\d×10⁻[⁰¹²³⁴⁵⁶⁷⁸⁹]+$/);
    // Below the smallest double (e^{-1200}) the value is an exact 0 and prints as 0, never 0.00.
    const under = run(rcCircuit, { R: 0.5, C: 100 }, 60);
    expect(under.ro('i')).toBe('0');
    expect(under.lines().at(-1)).toMatch(/= 0\\ \\mathrm\{mA\}$/);
    // At the start of charging: V_C is an exact 0 in the readout and Σ.
    expect(run(rcCircuit).ro('V_C')).toBe('0');
    expect(run(rcCircuit).lines()[2]).toBe('V_C = \\frac{q}{C} = \\frac{0}{1000\\times 10^{-6}}\\ \\mathrm{V} = 0\\ \\mathrm{V}');
    // Switch to discharge, then back to charge mid-run; an R change mid-run; a switch while paused.
    const c = run(rcCircuit, {}, 1.5);
    const h = rcCircuit.time!.h;
    const check = () => {
      const lines = c.lines();
      expect(lines.at(-1)!.endsWith(`= ${texOf(c.ro('i'))}\\ \\mathrm{mA}`), lines.join('\n')).toBe(true);
      expect(dIssues(lines, ['0.5', '2.0', '1.5']), lines.join('\n')).toEqual([]);
    };
    c.r.params.sw = 'discharge';
    for (let i = 0; i < 120; i++) c.r.advance(h);
    check();
    c.r.params.sw = 'charge';
    for (let i = 0; i < 90; i++) c.r.advance(h);
    check();
    expect(c.lines().at(-1)).toContain('\\frac{C\\mathcal{E} - q_0}{\\tau}');
    c.r.params.R = 1.5;
    for (let i = 0; i < 30; i++) c.r.advance(h);
    check();
    c.r.pause?.();
    c.r.params.sw = 'discharge';
    check();
  });
});

describe('policy D, Ch 28-32', () => {
  it('Ch 28 lorentz: e, mₚ, mₑ from CONST; B and v as their sliders', () => {
    const d = run(lorentzScene).lines();
    expect(d[1]).toBe('r = \\frac{mv}{\\lvert q\\rvert B} = \\frac{(1.67\\times 10^{-27})(3.0\\times 10^{6})}{(1.60\\times 10^{-19})(1.00)}\\ \\mathrm{m} = 3.13\\ \\mathrm{cm}');
    const e = run(lorentzScene, { particle: 'electron', compare: false, v: 1.5 }).lines();
    expect(e[2]).toBe('T = \\frac{2\\pi m}{\\lvert q\\rvert B} = \\frac{2\\pi(9.11\\times 10^{-31})}{(1.60\\times 10^{-19})(1.00\\times 10^{-3})}\\ \\mathrm{s} = 35.7\\ \\mathrm{ns}');
    const a = run(lorentzScene, { particle: 'alpha', Bi: 2 }).lines();
    expect(a[0]).toBe('F = \\lvert q\\rvert vB = (2)(1.60\\times 10^{-19})(3.0\\times 10^{6})(2.00) = 1.92\\times 10^{-12}\\ \\mathrm{N}');
  });

  it('Ch 28 cyclotron: e, mₚ from CONST, f/f_c as its slider, 3-figure f_c and v', () => {
    const lines = run(cyclotronScene, { ratio: 1.02 }).lines();
    expect(lines[0]).toBe('f_c = \\frac{\\lvert q\\rvert B}{2\\pi m} = \\frac{(1.60\\times 10^{-19})(1)}{2\\pi(1.67\\times 10^{-27})}\\ \\mathrm{Hz} = 15.2\\ \\mathrm{MHz}');
    expect(lines[1]).toBe('f = 1.02\\,f_c = (1.02)(15.2\\ \\mathrm{MHz}) = 15.6\\ \\mathrm{MHz}');
    for (const t of [200, 1000, 3000]) {
      const c = run(cyclotronScene, {}, t);
      expect(dIssues(c.lines()), c.lines().join('\n')).toEqual([]);
    }
  });

  it('Ch 29 biot: dl, sin φ and r with 3 figures (sin φ as a value), μ0 from CONST', () => {
    const c = run(biot, {}, 4);
    expect(c.lines()[1]).toBe('dB_{24} = 10^{-7}\\,\\frac{(10)(0.0917)(0.315)}{(0.953)^2}\\ \\mathrm{T} = 0.0318\\ \\mathrm{\\mu T}');
    expect(c.lines()[3]).toContain(`(${CONST.mu0.tex})(10)`);
    for (const over of [{}, { wire: 'loop' }, { n: 4 }, { n: 48 }, { wire: 'loop', Pl: [0.3, 0] }, { Ps: [0.5, -0.06] }])
      for (const t of [0, 1.3, 2.7, 4]) {
        const lines = run(biot, over, t).lines();
        expect(dIssues(lines), lines.join('\n')).toEqual([]);
      }
  });

  it('Ch 29 ampere: integers as integers and exact zeros, one string in the stage panel and Σ', () => {
    const d = run(ampere);
    expect(d.lines()[1]).toBe(`\\mu_0 I_\\text{enc} = (${CONST.mu0.tex})(1)\\ \\mathrm{T\\,m} = 1.26\\ \\mu\\mathrm{T\\,m}`);
    expect(d.ov()).toContain('I_\\text{enc} &=& 1\\ \\mathrm{A}');
    const sol = run(ampere, { preset: 'solenoid' });
    expect(sol.ov()).toContain('I_\\text{enc} &=& 4\\ \\mathrm{A}');
    expect(sol.lines()[0]).toBe('I_\\text{enc} = 4\\ \\mathrm{A}');
  });

  it('Ch 30 faraday: B and v as their sliders (0.50), x with 3 figures, an exact 0 for a loop outside or wholly inside', () => {
    const c = run(faraday, {}, 2.5);
    expect(c.lines()).toEqual([
      '\\Phi_B = B\\,a\\,x = (0.50)(0.4)(0.400)\\ \\mathrm{Wb} = 80.0\\ \\mathrm{mWb}',
      '\\mathcal{E} = -\\frac{d\\Phi_B}{dt} = -Ba\\,\\frac{dx}{dt} = -(0.50)(0.4)(0)\\ \\mathrm{V} = 0\\ \\mathrm{mV}',
    ]);
    expect(c.ro('\\mathcal{E}')).toBe('0');
    const start = run(faraday);
    expect(start.ro('\\Phi_B')).toBe('0');
    expect(start.lines()[0]).toBe('\\Phi_B = B\\,a\\,x = (0.50)(0.4)(0)\\ \\mathrm{Wb} = 0\\ \\mathrm{mWb}');
    // t = 1 s: loop centre at −0.5 m, half inside the region while entering.
    const entering = run(faraday, {}, 1);
    expect(entering.lines()[0]).toBe('\\Phi_B = B\\,a\\,x = (0.50)(0.4)(0.200)\\ \\mathrm{Wb} = 40.0\\ \\mathrm{mWb}');
    expect(entering.lines()[1]).toBe('\\mathcal{E} = -\\frac{d\\Phi_B}{dt} = -Ba\\,\\frac{dx}{dt} = -(0.50)(0.4)(0.50)\\ \\mathrm{V} = -100\\ \\mathrm{mV}');
    const m = run(faraday, { scenario: 'magnet' }, 2.5).lines();
    expect(m[1]).toBe(`\\Phi_B = \\frac{(${CONST.mu0.tex})(100)(0.2)^2}{2[(0.2)^2 + 0.0500^2]^{3/2}}\\ \\mathrm{Wb} = 0.287\\ \\mathrm{mWb}`);
    expect(m[2]).toBe('\\mathcal{E} = -\\frac{d\\Phi_B}{dx}\\,v = -(-0.00101\\ \\mathrm{Wb/m})(0.50\\ \\mathrm{m/s}) = 0.506\\ \\mathrm{mV}');
  });

  it('Ch 30 maxwell: one string per quantity in the stage panel and Σ (2 A, exact 0), A = 0.194 m², dB/dt as its slider', () => {
    for (const surf of ['flat', 'bulge']) {
      const c = run(maxwell, { eq: 'ampere', surf });
      const [ic, id] = surf === 'flat' ? ['2', '0'] : ['0', '2'];
      expect(c.lines()[0]).toBe(`i_\\text{enc} = ${ic}\\ \\mathrm{A},\\quad i_d = \\varepsilon_0\\,\\frac{d\\Phi_E}{dt} = ${id}\\ \\mathrm{A}`);
      expect(c.ov()).toContain(`i_\\text{enc} &=& ${ic}\\ \\mathrm{A}`);
      expect(c.ov()).toContain(`d\\Phi_E/dt &=& ${id}\\ \\mathrm{A}`);
      expect(c.ov()).not.toContain('2.00');
    }
    const gb = run(maxwell, { eq: 'gaussB' });
    expect(gb.lines()[1]).toBe('\\oint B_n\\,dl = \\Phi_\\text{out} + \\Phi_\\text{in} = 8.24 + (-8.24) = 0\\ \\mu\\mathrm{T\\,m}');
    expect(gb.ov()).toContain('\\oint B_n\\,dl &=& 0\\ \\mu\\mathrm{T\\,m}');
    const fd = run(maxwell);
    expect(fd.lines()[1]).toBe('-\\frac{d\\Phi_B}{dt} = -\\frac{dB}{dt}\\,A = -(1.0\\ \\mathrm{T/s})(0.194\\ \\mathrm{m^2}) = -0.194\\ \\mathrm{V}');
    expect(fd.ov()).toContain('-d\\Phi_B/dt &=& -0.194\\ \\mathrm{V}');
  });

  it('Ch 31 ac: the ratio and R as their sliders (0.80), no fitted figures', () => {
    const lines = run(acScene).lines();
    expect(lines[0]).toBe('\\omega_d = 0.80\\,\\omega_0 = 0.80 \\times 3162 = 2530\\ \\mathrm{rad/s}');
    for (const ratio of [0.3, 0.99, 1, 1.01, 2.5])
      for (const R of [10, 50]) {
        const l = run(acScene, { ratio, R }).lines();
        expect(dIssues(l), l.join('\n')).toEqual([]);
      }
  });

  it('Ch 31 free: near critical damping ω′ multiplies the direct ω0 − R/2L and ω0 + R/2L (R5)', () => {
    // L = 10 mH, C = 10 μF: ω0 = 3162 /s, critical at R = 63.2 Ω.
    const near = run(freeScene, { R: 63 }).lines();
    expect(near).toContain('\\omega\' = \\sqrt{\\omega_0^2 - (R/2L)^2} = \\sqrt{(\\omega_0 - R/2L)(\\omega_0 + R/2L)}');
    expect(dIssues(near), near.join('\n')).toEqual([]);
    const far = run(freeScene, { R: 20 }).lines();
    expect(far).toContain('= \\sqrt{3162^2 - 1000^2} = 3000\\ \\mathrm{rad/s}');
    for (const R of [0, 1, 20, 60, 62, 63, 100])
      for (const [L, C] of [
        [5, 5],
        [20, 20],
        [10, 10],
        [20, 5],
      ]) {
        const l = run(freeScene, { R, L, C }, 0.004).lines();
        expect(dIssues(l), l.join('\n')).toEqual([]);
      }
  });

  it('Ch 32 materials: k_B T_C = 2.27 J (3 figures), T as its slider (0.50)', () => {
    const lines = run(magnet).lines();
    expect(lines).toContain('k_BT_C = \\frac{2J}{\\ln(1 + \\sqrt2)} = 2.27\\,J');
    expect(lines).toContain('\\frac{2J}{k_BT} = \\frac{2}{0.50 \\times 2.27} = 1.76');
    expect(run(magnet, { T: 2 }).lines()).toContain('T = 2.00\\,T_C \\ge T_C:\\ \\lvert M\\rvert_{B=0} = 0');
  });

  it('Ch 32 origin: e and mₑ from CONST', () => {
    const lines = run(origin).lines();
    expect(lines[1]).toBe('I = \\frac{e}{T} = \\frac{1.60\\times 10^{-19}}{1.52\\times 10^{-16}} = 1.05\\ \\mathrm{mA}');
    expect(lines[4]).toBe('L = mvr = (9.11\\times 10^{-31})(2.19\\times 10^{6})(5.29\\times 10^{-11})');
    expect(dIssues(lines)).toEqual([]);
  });
});
