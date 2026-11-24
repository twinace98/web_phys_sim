// Σ digits policy D, phase 2 for Ch 33–42 (docs/design.md §3.3): the exact strings of the audit
// items (2026-11-23 §5) at their quoted settings, and sweeps over the controls where the default
// sampling of tests/sigma-all.shared.ts (defaults, min, max) misses an item.
import { describe, expect, it } from 'vitest';
import { defaults } from '../src/core/params';
import { Runner } from '../src/core/runner';
import { readoutText } from '../src/core/tex';
import type { NumberParam, Params, Scene } from '../src/core/types';
import { CHAPTERS } from '../src/sims/registry';
import { panel } from '../src/sims/ch34/scene';
import { iText } from '../src/sims/ch36/phasor';
import { LEVEL_DEC, levelTexts, model } from '../src/sims/ch39/scene';
import { CHECKS, evalTex, parts, policyIssues, recomputes } from './sigma-policy';

async function sceneOf(ch: number, id: string): Promise<Scene> {
  const page = await CHAPTERS.find((m) => m.ch === ch)!.load!();
  return page.scenes.find((s) => s.id === id)! as Scene;
}

/** Σ lines and readout texts (as the shell prints them) at `over`, after `steps` runner steps. */
async function at(ch: number, id: string, over: Params = {}, steps = 0) {
  const sc = await sceneOf(ch, id);
  const r = new Runner(sc, { ...(defaults(sc.params) as Params), ...over } as never, 1);
  if (steps && sc.time) {
    r.play();
    for (let i = 0; i < steps && r.playing; i++) r.advance(sc.time.h);
  }
  const s = r.state as never;
  const p = r.params as never;
  const lines = sc.formula!(s, p);
  const ro = (label: string) => {
    const spec = sc.readouts!.find((x) => x.label === label)!;
    return readoutText(spec as never, spec.value(s, p), p);
  };
  return { lines, ro, all: lines.join('\n') };
}

describe('Ch 33', () => {
  it('refraction: slider string, 0.860 and 59.4° at the default; 1.002 > 1 past the critical angle (R6)', async () => {
    const d = await at(33, 'refraction');
    expect(d.lines[0]).toBe('\\sin\\theta_2 = \\frac{n_1}{n_2}\\sin\\theta_1 = \\frac{1.50}{1.00}\\sin 35.0^\\circ = 0.860');
    expect(d.lines[1]).toBe('\\theta_2 = \\sin^{-1}(0.860) = 59.4^\\circ');
    expect((await at(33, 'refraction', { theta: 41.9 })).lines[0]).toMatch(/\\sin 41\.9\^\\circ = 1\.002 > 1$/);
    // Just below the critical angle sin θ₂ keeps its side of 1; at it (drag snap) the grazing ray.
    expect((await at(33, 'refraction', { theta: 41.8 })).lines[1]).toBe('\\theta_2 = \\sin^{-1}(0.9998) = 88.9^\\circ');
    const c = await at(33, 'refraction', { theta: (Math.asin(1 / 1.5) * 180) / Math.PI });
    expect(c.lines[1]).toBe('\\theta_2 = \\sin^{-1}(1.00) = 90.0^\\circ');
  });

  it('fibre: α as its slider prints it; √(n₁² − n₂²) ≥ 1 with tnCmp', async () => {
    const d = await at(33, 'fibre');
    expect(d.lines[0]).toContain('\\sin 15.0^\\circ');
    expect((await at(33, 'fibre', { clad: '1' })).all).toContain('= 1.12 \\ge 1');
  });
});

describe('Ch 34–35', () => {
  it('lens and mirror: p and f as their sliders print them, in the Σ panel and in the stage panel', async () => {
    const l = await at(34, 'lens');
    expect(l.lines[1]).toBe('i = \\frac{pf}{p - f} = \\frac{(20.0)(15)}{20.0 - 15} = 60.0\\ \\mathrm{cm}');
    expect(l.lines[2]).toBe('m = -\\frac{i}{p} = -\\frac{60.0}{20.0} = -3.00');
    expect((await at(34, 'mirror', { kind: 'convex' })).lines[1]).toBe('\\frac{1}{i} = \\frac{1}{f} - \\frac{1}{p} = \\frac{1}{-15} - \\frac{1}{20.0}');
    const st = panel({ kind: 'converging', f: 15, p: 18, h: 5 });
    expect(st).toContain('\\dfrac{1}{18.0}');
    expect(st).toContain('\\dfrac{1}{15}');
  });

  it('double slit: d and D as their sliders print them', async () => {
    expect((await at(35, 'double')).lines[1]).toBe('\\Delta y \\approx \\frac{\\lambda D}{d} = \\frac{(0.5)(20)}{3.0}\\ \\mu\\mathrm{m} = 3.33\\ \\mu\\mathrm{m}');
  });
});

describe('Ch 36', () => {
  it('single slit: y₁ = 25 tan 14.5° with the printed θ₁; a as its slider prints it', async () => {
    const d = await at(36, 'single');
    expect(d.lines[0]).toBe('\\sin\\theta_1 = \\frac{\\lambda}{a} = \\frac{0.5}{2.0} = 0.250,\\quad \\theta_1 = 14.5^\\circ');
    expect(d.lines[1]).toBe('y_1 = D\\tan\\theta_1 = 25\\tan 14.5^\\circ = 6.45\\ \\mu\\mathrm{m}');
    expect(d.ro('\\theta_1')).toBe('14.5');
  });

  it('two slits with d < a: the line names the slider d and the d actually used (d = a)', async () => {
    const t = await at(36, 'single', { slits: 'two', d: 1, a: 3 });
    expect(t.lines.slice(-2)).toEqual(['d = 1.0\\ \\mu\\mathrm{m} < a\\ \\Rightarrow\\ d = a', '\\frac{d}{a} = \\frac{3.0}{3.0} = 1\\ \\Rightarrow\\ m = \\pm 1, \\pm 2, \\ldots']);
    expect((await at(36, 'single', { slits: 'two' })).lines.at(-1)).toBe('\\frac{d}{a} = \\frac{4.0}{2.0} = 2\\ \\Rightarrow\\ m = \\pm 2, \\pm 4, \\ldots');
  });

  it('phasor near the minimum: φ/2 = 180° + 0.274°, never sin(180°) or 0.00 (R5, R7b)', async () => {
    const d = await at(36, 'phasor');
    expect(d.all).toContain('\\frac{\\phi}{2} = 180^\\circ + 0.274^\\circ');
    expect(d.all).toContain('= \\frac{\\sin(0.274^\\circ)}{10\\sin(18.0^\\circ)} = 0.00154');
    expect(d.all).toContain('\\left(\\frac{E_\\theta}{E_m}\\right)^2 = 2.38\\times 10^{-6}');
    expect(d.ro('I/I_m')).toBe('2.38×10⁻⁶');
    expect(d.all).not.toMatch(/sin\(180/);
    expect(d.all).toContain('\\frac{360^\\circ}{0.5}(2.0)\\sin(14.5^\\circ) = 361^\\circ');
    // A chain that closes exactly prints an exact 0.
    const z = await at(36, 'phasor', { a: 1, theta: 30 });
    expect(z.ro('I/I_m')).toBe('0');
    expect(z.all).toContain('\\right)^2 = 0\n');
  });

  it('phasor sweep: every θ step at several a, λ, N; both I lines recompute within 1 %, no 0.00', async () => {
    const sc = await sceneOf(36, 'phasor');
    const bad: string[] = [];
    for (const a of [0.5, 1.7, 2, 4])
      for (const lambda of [400, 550, 700])
        for (const N of [8, 13, 20])
          for (let k = -400; k <= 400; k += 3) {
            const p = { ...(defaults(sc.params) as Params), a, lambda, N, theta: k / 10 };
            const lines = sc.formula!({ t: 0 } as never, p as never);
            for (const l of lines)
              for (const pt of parts(l)) {
                if (pt.res && /^0\.0+$/.test(pt.res.s)) bad.push(`0.00 at ${JSON.stringify(p)}: ${l}`);
                if (pt.inRaw === undefined || !pt.res || !pt.inp.length) continue;
                const v = evalTex(pt.inRaw);
                if (v !== undefined && !recomputes(pt.resDeg ? (v * 180) / Math.PI : v, pt.res)) bad.push(`${JSON.stringify(p)}: ${l}`);
              }
          }
    expect(bad.slice(0, 5)).toEqual([]);
    expect(iText(1e-30)).toBe('0');
  }, 60_000);
});

describe('Ch 37', () => {
  it('β as its slider prints it; γ to 3 figures (R1, R3)', async () => {
    const c = await at(37, 'clocks');
    expect(c.lines[0]).toBe('\\gamma = \\frac{1}{\\sqrt{1 - \\beta^2}} = \\frac{1}{\\sqrt{1 - (0.80)^2}} = 1.67');
    expect(c.lines[2]).toBe('\\Delta t = \\gamma\\,\\Delta t_0 = 1.67 \\times 2.00 = 3.33\\ \\mathrm{s}');
    expect((await at(37, 'rods', { beta: 0.99 })).lines[1]).toBe('L = \\frac{L_0}{\\gamma} = \\frac{4.00\\ \\mathrm{ls}}{7.09} = 0.564\\ \\mathrm{ls}');
    expect((await at(37, 'spacetime')).lines[1]).toBe("x_\\mathrm{E} = \\gamma(x' + \\beta\\,ct') = 1.25\\,(0 + 0.60 \\times 2.00) = 1.50\\ \\mathrm{ls}");
  });

  it('train: Δt = γβL₀/c directly (R5); Δt′ an exact 0 in the readout and the Σ panel', async () => {
    const t = await at(37, 'simultaneity');
    expect(t.lines[4]).toBe('\\Delta t = t_\\mathrm{F} - t_\\mathrm{R} = \\gamma\\beta\\,\\frac{L_0}{c} = (1.25)(0.60)(4.00\\ \\mathrm{s}) = 3.00\\ \\mathrm{s}');
    expect(t.lines[2]).toBe('t_\\mathrm{R} = \\frac{L/2}{c + v} = \\frac{1.60\\ \\mathrm{ls}}{(1 + 0.60)\\,c} = 1.00\\ \\mathrm{s}');
    expect(t.ro("\\Delta t'")).toBe('0');
  });
});

describe('Ch 38', () => {
  it('de Broglie: readouts with the prefix of the Σ panel and the screen axis (R8); h from CONST', async () => {
    const d = await at(38, 'debroglie');
    expect(d.ro('\\lambda')).toBe('0.167 nm');
    expect(d.ro('\\Delta y')).toBe('6.15 cm');
    expect(d.all).toContain('= 6.15\\ \\text{cm}');
    expect(d.all).toContain('\\frac{6.63\\times 10^{-34}\\ \\text{J\\,s}}');
    expect(d.all).toContain('m = 9.11\\times 10^{-31}\\ \\text{kg},\\quad v = 4.36\\times 10^{6}\\ \\text{m/s}');
    const c = await at(38, 'debroglie', { part: 'c60' });
    expect(c.ro('\\Delta y')).toBe('31.5 μm');
    expect(c.ro('\\lambda')).toBe('2.52 pm');
    expect(c.all).toContain('= 31.5\\ \\mu\\text{m}');
    // Relativistic electron: γ with the figures that show it differs from 1 (R6).
    expect((await at(38, 'debroglie', { ve: 1.5e8 })).lines[0]).toContain('\\gamma = 1.15');
    expect((await at(38, 'debroglie', { ve: 1.5e7 })).lines[0]).toContain('\\gamma = 1.001');
  });

  it('wave packet: k₀ as its slider prints it, ħ/m to 3 figures', async () => {
    expect((await at(38, 'packet')).lines[0]).toBe('v_\\text{g} = \\frac{\\hbar}{m}\\,k_0 = 0.116 \\times 10.0 = 1.16\\ \\mathrm{nm/fs}');
  });
});

describe('Ch 39', () => {
  it('double well Ub = 4.5 eV, b = 0.5 nm: the splitting directly, ΔE₂₁ = 1.08 meV (R5)', async () => {
    const d = await at(39, 'wells', { pot: 'double', Ub: 4.5, b: 0.5 });
    expect(d.lines[0]).toBe('\\Delta E_{21} = E_2 - E_1 = 1.08\\ \\mathrm{meV}');
    const E = model({ pot: 'double', L: 1, U0: 2, hw: 0.2, Ub: 4.5, b: 0.5 }).st.E;
    expect(levelTexts(E).slice(0, 2)).toEqual(['0.314', '0.315']);
    // A pair that prints the same at 3 figures gets a 4th decimal, never a 5th (grid error).
    const E2 = model({ pot: 'double', L: 1.5, U0: 2, hw: 0.2, Ub: 4.5, b: 0.5 }).st.E;
    expect(levelTexts(E2).slice(0, 2)).toEqual(['0.1481', '0.1484']);
    for (const t of levelTexts(E2)) expect(t.split('.')[1].length).toBeLessThanOrEqual(LEVEL_DEC);
    expect((await at(39, 'superposition', { pot: 'double', Ub: 4.5, b: 0.5 })).ro('\\Delta E')).toBe('1.08 meV');
  });

  it('wells: h²/8m to 3 figures, L as its slider prints it; finite-well count with tnCmp (R6)', async () => {
    const d = await at(39, 'wells');
    expect(d.lines[0]).toBe('E_1 = \\frac{h^2}{8mL^2} = \\frac{0.376\\ \\mathrm{eV\\,nm^2}}{(1.00\\ \\mathrm{nm})^2} = 0.376\\ \\mathrm{eV}');
    expect(d.lines[1]).toBe('E_2 = 2^2 E_1 = 4 \\times 0.376 = 1.50\\ \\mathrm{eV}');
    expect((await at(39, 'wells', { pot: 'finite', L: 1.3 })).lines.at(-1)).toBe('N = \\left\\lceil \\frac{2 z_0}{\\pi} \\right\\rceil = \\lceil 2.998 \\rceil = 3');
    expect((await at(39, 'wells', { pot: 'harmonic' })).lines[0]).toBe('E_0 = \\tfrac12\\hbar\\omega = \\tfrac12 \\times 0.20\\ \\mathrm{eV} = 0.100\\ \\mathrm{eV}');
  });

  it('superposition: h from CONST, ΔE to 3 figures, t/T as whole periods + φ, ⟨x⟩ with the run-scale decimals', async () => {
    const h = await at(39, 'superposition', { pot: 'harmonic' }, 300);
    expect(h.lines[1]).toBe('T = \\frac{h}{\\Delta E} = \\frac{4.14\\ \\mathrm{eV\\,fs}}{0.200\\ \\mathrm{eV}} = 20.7\\ \\mathrm{fs}');
    const d = await at(39, 'superposition', {}, 777);
    expect(d.lines[2]).toBe('\\frac{t}{T} = \\frac{7.11\\ \\mathrm{fs}}{3.67\\ \\mathrm{fs}} = 1 + 0.939');
    expect(d.lines.at(-1)).toBe('= 0 - 0.180\\cos(2\\pi \\times 0.939) = -0.167\\ \\mathrm{nm}');
    expect(d.ro('\\langle x\\rangle')).toBe('−0.167');
  });
});

describe('Ch 41–42', () => {
  it('bands b = 0.5 nm: widths computed directly (R5)', async () => {
    const b = await at(41, 'bands', { b: 0.5 });
    expect(b.lines).toEqual(['E_{1,8} - E_{1,1} = 0.00749\\ \\mathrm{eV}', 'W_1 = E_{1,\\max} - E_{1,\\min} = 0.00797\\ \\mathrm{eV}', 'E_\\text{g} = E_{2,\\min} - E_{1,\\max} = 2.20\\ \\mathrm{eV}']);
  });

  it('filling: kT = 0.0259 eV from CONST k_B; diamond n < 1 cm⁻³ in the readout, 1.13×10⁻²⁷ in Σ (R7b)', async () => {
    const s = await at(41, 'filling');
    expect(s.lines[0]).toBe('kT = (8.62\\times 10^{-5}\\ \\mathrm{eV/K})(300\\ \\mathrm{K}) = 0.0259\\ \\mathrm{eV}');
    expect(s.lines[1]).toBe('\\frac{E_\\text{g}}{2kT} = \\frac{1.12\\ \\mathrm{eV}}{2 \\times 0.0259\\ \\mathrm{eV}} = 21.66');
    expect(s.all).toContain('= (1.71\\times 10^{19}\\ \\mathrm{cm^{-3}})\\,e^{-21.66} = 6.68\\times 10^{9}\\ \\mathrm{cm^{-3}}');
    const d = await at(41, 'filling', { mat: 'diamond' });
    expect(d.ro('n')).toBe('< 1');
    expect(d.all).toContain('= 1.13\\times 10^{-27}\\ \\mathrm{cm^{-3}}');
    expect(d.all).toContain('\\ln(N_\\text{v}/N_\\text{c}) = 0\\ \\mathrm{eV}');
    const z = await at(41, 'filling', { T: 0 });
    expect(z.ro('n')).toBe('0');
    expect(z.lines[0]).toBe('kT = (8.62\\times 10^{-5}\\ \\mathrm{eV/K})(0\\ \\mathrm{K}) = 0\\ \\mathrm{eV}');
  });

  it('doping: 3-figure inputs, kT to 3 figures', async () => {
    const d = await at(41, 'doping');
    expect(d.all).toContain('p = \\frac{n_i^2}{n} = \\frac{(6.68\\times 10^{9})^2}{9.96\\times 10^{15}} = 4475\\ \\mathrm{cm^{-3}}');
    expect(d.all).toContain('= 0.0259\\ln\\frac{2.80\\times 10^{19}}{9.96\\times 10^{15}} = 0.205\\ \\mathrm{eV}');
  });

  it('decay: ln 2 = 0.693, t/T½ as its readout, also in the exponent', async () => {
    const d = await at(42, 'decay', {}, 600);
    expect(d.lines[0]).toContain('\\frac{0.693}{5.73\\times 10^{3}\\ \\mathrm{y}}');
    expect(d.lines[1]).toBe(`\\frac{t}{T_{1/2}} = \\frac{12.0}{5.73} = ${d.ro('t/T_{1/2}')}`);
    expect(d.lines[2]).toContain(`0.5^{${d.ro('t/T_{1/2}')}}`);
  });
});

describe('Ch 33–42: policy D over a finer grid of every slider', () => {
  // sigma-all samples defaults, min and max; here each slider also takes interior values (with
  // every other control at its default, min and max) so in-between items are seen.
  const SCENES: [number, string][] = [
    [33, 'refraction'],
    [33, 'fibre'],
    [34, 'lens'],
    [34, 'mirror'],
    [35, 'double'],
    [36, 'single'],
    [36, 'phasor'],
    [37, 'clocks'],
    [37, 'rods'],
    [37, 'spacetime'],
    [37, 'simultaneity'],
    [38, 'packet'],
    [39, 'wells'],
    [39, 'superposition'],
    [41, 'bands'],
    [41, 'filling'],
    [41, 'doping'],
    [42, 'decay'],
  ];
  for (const [ch, id] of SCENES)
    it(`${ch}/${id}`, async () => {
      const sc = await sceneOf(ch, id);
      const bad: string[] = [];
      for (const [k, spec0] of Object.entries(sc.params)) {
        const spec = spec0 as NumberParam;
        if (spec.kind !== 'number' || spec.control === 'select' || spec.group === 'hidden' || spec.log) continue;
        const lo = spec.min ?? 0;
        const hi = spec.max ?? 1;
        const st = spec.step ?? 1;
        for (let i = 1; i < 6; i++) {
          const v = Number((Math.round((lo + ((hi - lo) * i) / 6) / st) * st).toFixed(6));
          const iss = policyIssues(`${ch}/${id}`, { ...sc, params: { ...sc.params, [k]: { ...spec, default: v } } } as Scene);
          for (const c of CHECKS) for (const m of iss.get(c)!) bad.push(`${k}=${v} ${c}: ${m}`);
        }
      }
      expect(bad.slice(0, 5)).toEqual([]);
    }, 120_000);
});
