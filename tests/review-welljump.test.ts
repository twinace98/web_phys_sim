// Review page 103 (welljump): infinite-well levels, photon wavelengths, consistency with the
// Ch 39 solver, and the stage layout.
import { describe, expect, it } from 'vitest';
import { defaults } from '../src/core/params';
import { Runner } from '../src/core/runner';
import { readoutText } from '../src/core/precision';
import { wellModel } from '../src/sims/ch39/physics';
import { HB2M, infiniteLevel, infiniteWell, solve } from '../src/sims/modern/eigen';
import { region } from '../src/sims/review/hydrogen/spectrum';
import { KNOB_HIT } from '../src/sims/review/hydrogen/stage';
import { E1_COEF, dipoleAllowed, lambda, level, photonEnergy, psi } from '../src/sims/review/welljump/physics';
import { N_LEVELS, nearestLevel, welljump } from '../src/sims/review/welljump/scene';
import { NUM, agrees, grab, val } from './sigma-digits';
import { offStage, probe } from './stage-probe';

const near = (a: number, b: number, tol: number) => expect(Math.abs(a - b)).toBeLessThan(tol);

describe('welljump physics', () => {
  it('E_1 = 9.40 eV for an electron in an infinite well of width 200 pm', () => {
    near(level(1, 0.2), 9.40, 0.005);
    near(E1_COEF, 0.37603, 1e-5);
  });

  it('E_n ∝ n² and ∝ 1/L²', () => {
    for (let n = 1; n <= N_LEVELS; n++) expect(level(n, 0.7) / level(1, 0.7)).toBeCloseTo(n * n, 12);
    expect(level(1, 0.5) / level(1, 1)).toBeCloseTo(4, 12);
  });

  it('2 → 1 at L = 200 pm: ΔE = 28.2 eV, λ = 44.0 nm (UV); 3 → 2 at L = 1 nm: 1.880 eV, 659.4 nm (visible)', () => {
    near(photonEnergy(2, 1, 0.2), 28.20, 0.01);
    near(lambda(2, 1, 0.2), 43.96, 0.02);
    expect(region(lambda(2, 1, 0.2))).toBe('uv');
    near(photonEnergy(3, 2, 1), 1.8801, 1e-4);
    near(lambda(3, 2, 1), 659.44, 0.02);
    expect(region(lambda(3, 2, 1))).toBe('vis');
    expect(region(lambda(2, 1, 1))).toBe('ir');
    expect(lambda(2, 3, 1)).toBe(lambda(3, 2, 1));
  });

  it('λ ∝ L²: doubling the width makes every wavelength 4 times longer', () => {
    for (const [ni, nf] of [
      [2, 1],
      [5, 3],
    ])
      expect(lambda(ni, nf, 1.2) / lambda(ni, nf, 0.6)).toBeCloseTo(4, 10);
  });

  it('agrees with the Ch 39 solver: wellModel at L = 1 nm and eigen.solve at L = 0.2 nm', () => {
    const m = wellModel({ kind: 'infinite', L: 1, U0: 2, hw: 0.2, Ub: 2, b: 0.2 });
    m.st.E.forEach((E, k) => near(E, level(k + 1, 1), 2e-3 * E));
    const st = solve(infiniteWell(0.2), 1500, N_LEVELS, HB2M);
    st.E.forEach((E, k) => {
      near(E, level(k + 1, 0.2), 2e-3 * E);
      expect(infiniteLevel(k + 1, 0.2)).toBeCloseTo(level(k + 1, 0.2), 3);
    });
  });

  it('ψ_n normalised, n − 1 nodes; dipole rule needs n_i − n_f odd', () => {
    const L = 0.8;
    for (let n = 1; n <= N_LEVELS; n++) {
      let s = 0;
      let nodes = 0;
      const M = 4000;
      for (let i = 0; i < M; i++) {
        const x = -L / 2 + ((i + 0.5) * L) / M;
        s += psi(n, x, L) ** 2 * (L / M);
        if (i > 0 && Math.sign(psi(n, x, L)) !== Math.sign(psi(n, x - L / M, L))) nodes++;
      }
      near(s, 1, 1e-6);
      expect(nodes).toBe(n - 1);
    }
    expect(dipoleAllowed(2, 1)).toBe(true);
    expect(dipoleAllowed(3, 1)).toBe(false);
  });
});

describe('welljump stage', () => {
  it('dragging snaps to the nearest level', () => {
    expect(nearestLevel(level(4, 0.5) * 1.01, 0.5)).toBe(4);
    expect(nearestLevel(-1, 0.5)).toBe(1);
  });

  it('nothing leaves the stage and level labels never overlap (widths, pairs, wide and narrow)', () => {
    const base = defaults(welljump.params);
    for (const [w, h] of [
      [1280, 704],
      [390, 560],
      [390, 460],
    ])
      for (const L of [0.2, 0.47, 1, 2])
        for (let ni = 1; ni <= N_LEVELS; ni += 2)
          for (let nf = 1; nf <= N_LEVELS; nf++) {
            const p = { ...base, L, ni, nf, show: nf % 2 ? 'psi' : 'prob' };
            const g = probe(welljump, welljump.init(p, null as never), p, w, h);
            expect(offStage(g, 2)).toEqual([]);
            const labels = g.marks.filter((m) => m.kind === 'text' && /eV$/.test(m.text!)).map((m) => m.y);
            labels.sort((a, b) => a - b);
            for (let i = 1; i < labels.length; i++) expect(labels[i] - labels[i - 1]).toBeGreaterThanOrEqual(13);
          }
  });

  it('picked lines accumulate and follow the width (λ ∝ L²)', () => {
    const p = defaults(welljump.params);
    const s = welljump.init(p, null as never);
    probe(welljump, s, p, 1280, 704);
    probe(welljump, s, { ...p, ni: 2, nf: 1 }, 1280, 704);
    expect([...s.seen.keys()].sort()).toEqual(['1-2', '2-3']);
  });

  it('formula panel: E_n with numbers, ΔE and λ at the defaults (L = 1 nm, 3 → 2)', () => {
    const p = defaults(welljump.params);
    const f = welljump.formula!(welljump.init(p, null as never), p).join(' ');
    // E₁ = 0.376 eV, 3 figures (policy D).
    // Policy D: hc = 1240 eV·nm, mₑc² = 511 keV, L as its slider label, results as the readouts.
    expect(f).toContain('\\frac{(1240\\ \\text{eV}\\cdot\\text{nm})^2}{8\\,(511\\ \\text{keV})\\,(1.0\\ \\text{nm})^2} = 0.376\\ \\text{eV}');
    expect(f).toContain('E_{3} = 3.38\\ \\text{eV},\\quad E_{2} = 1.50\\ \\text{eV}');
    expect(f).toContain('(3^2 - 2^2)(0.376\\ \\text{eV}) = 1.88\\ \\text{eV}');
    expect(f).toContain('\\frac{1240\\ \\text{eV}\\cdot\\text{nm}}{1.88\\ \\text{eV}} = 659\\ \\text{nm}');
    const f2 = welljump.formula!(welljump.init(p, null as never), { ...p, L: 0.2, ni: 1, nf: 2 }).join(' ');
    expect(f2).toContain('= 9.40\\ \\text{eV}');
    expect(f2).toContain('= 44.0\\ \\text{nm}');
    expect(f2).toContain('(0.20\\ \\text{nm})^2');
  });

  it('policy D: Σ results are the readout strings at every slider stop and pair; no fitted constants', () => {
    const p = defaults(welljump.params);
    const s = welljump.init(p, null as never);
    const text = (label: string, q: typeof p) => {
      const spec = welljump.readouts!.find((r) => r.label === label)!;
      return readoutText(spec as never, spec.value(s, q), q);
    };
    const bad: string[] = [];
    for (const L of [0.2, 0.25, 0.5, 1, 1.5, 2])
      for (let ni = 1; ni <= 5; ni++)
        for (let nf = 1; nf <= 5; nf++) {
          const q = { ...p, L, ni, nf };
          const f = welljump.formula!(s, q);
          if (!f[0].endsWith(`= ${text('E_1', q)}\\ \\text{eV}`)) bad.push(`E1 ${L} ${f[0]}`);
          if (!f[0].includes('(1240\\ \\text{eV}\\cdot\\text{nm})^2') || !f[0].includes('(511\\ \\text{keV})')) bad.push(`const ${f[0]}`);
          if (ni === nf) continue;
          if (!f[2].endsWith(`= ${text('\\Delta E', q)}\\ \\text{eV}`)) bad.push(`dE ${L} ${ni}${nf} ${f[2]}`);
          if (!f[3].endsWith(`= ${text('\\lambda', q)}\\ \\text{nm}`)) bad.push(`lam ${L} ${ni}${nf} ${f[3]}`);
        }
    expect(bad).toEqual([]);
  });
});

describe('welljump stage controls (knobs, strip reset)', () => {
  const p0 = defaults(welljump.params);

  it('knob handles keep (or enlarge) their hit areas', () => {
    const hs = welljump.handles!;
    expect(hs.length).toBe(3);
    for (const h of hs.slice(0, 2)) expect(h.radiusPx).toBeGreaterThanOrEqual(14);
    expect(hs[0].radiusPx).toBe(KNOB_HIT);
  });

  it('the strip clear button appears with earlier lines and clears them, keeping the current line', () => {
    const r = new Runner(welljump, p0, 1);
    const s = r.state;
    const clear = welljump.handles![2];
    probe(welljump, s, r.params, 1280, 704);
    expect(s.btn).toBeNull();
    expect(clear.pos(s, r.params).x).toBeLessThan(-1e5);
    r.params.nf = 1;
    probe(welljump, s, r.params, 1280, 704);
    r.params.L = 0.5;
    const g = probe(welljump, s, r.params, 390, 560);
    expect(offStage(g, 2)).toEqual([]);
    expect(g.marks.some((m) => m.text === 'wj.clear')).toBe(true);
    expect(clear.pos(s, r.params)).toEqual(s.btn!.c);
    clear.onTap!(r.ctx(), s);
    expect([...s.seen.keys()]).toEqual(['1-3']);
    probe(welljump, s, r.params, 1280, 704);
    expect(s.btn).toBeNull();
  });
});

describe('welljump Σ: the printed inputs reproduce the printed results', () => {
  const p0 = defaults(welljump.params);
  const R = (s: string) => new RegExp(s.replace(/N#/g, `(${NUM})`));
  // Every slider stop (two figures, 0.20 … 2.0 nm) and every pair of levels.
  const Ls = [...Array.from({ length: 80 }, (_, i) => (20 + i) / 100), ...Array.from({ length: 11 }, (_, i) => 1 + i / 10)];

  function check(L: number, ni: number, nf: number): string[] {
    const bad: string[] = [];
    const f = welljump.formula!(welljump.init(p0, null as never), { ...p0, L, ni, nf });
    const tag = `L=${L} ${ni}→${nf}`;
    const [hc, mc, Lp, E1] = grab(f[0], R(String.raw`\\frac\{\(N#\\ \\text\{eV\}\\cdot\\text\{nm\}\)\^2\}\{8\\,\(N#\\ \\text\{keV\}\)\\,\(N#\\ \\text\{nm\}\)\^2\} = N#\\ \\text\{eV\}`));
    if (!agrees(val(hc) ** 2 / (8 * val(mc) * 1000 * val(Lp) ** 2), E1)) bad.push(`${tag} E1 ${f[0]}`);
    const [Ei, Ef] = grab(f[1], R(String.raw`E_\{\d\} = N#\\ \\text\{eV\},\\quad E_\{\d\} = N#`));
    if (!agrees(ni * ni * val(E1), Ei) || !agrees(nf * nf * val(E1), Ef)) bad.push(`${tag} E_n ${f[1]}`);
    if (ni === nf) return bad;
    const [hi, lo, E1b, dE] = grab(f[2], R(String.raw`\((\d)\^2 - (\d)\^2\)\(N#\\ \\text\{eV\}\) = N#`));
    if (E1b !== E1) bad.push(`${tag} E1 differs between lines: ${E1} / ${E1b}`);
    if (!agrees((Number(hi) ** 2 - Number(lo) ** 2) * val(E1b), dE)) bad.push(`${tag} ΔE ${f[2]}`);
    const [hc2, dE2, lam] = grab(f[3], R(String.raw`\\frac\{N#\\ \\text\{eV\}\\cdot\\text\{nm\}\}\{N#\\ \\text\{eV\}\} = N#`));
    if (dE2 !== dE) bad.push(`${tag} ΔE differs between lines: ${dE} / ${dE2}`);
    if (hc2 !== hc) bad.push(`${tag} hc differs between lines: ${hc} / ${hc2}`);
    if (!agrees(val(hc2) / val(dE2), lam)) bad.push(`${tag} λ ${f[3]}`);
    return bad;
  }

  it('review case L = 1 nm, 3 → 2: the λ line gives the readout 659 nm (policy D, was 659.4)', () => {
    expect(check(1, 3, 2)).toEqual([]);
    expect(welljump.formula!(welljump.init(p0, null as never), p0)[3]).toMatch(/= 659\\ \\text\{nm\}$/);
  });

  it('every slider stop of L and every pair of levels', () => {
    const bad = Ls.flatMap((L) => [1, 2, 3, 4, 5].flatMap((ni) => [1, 2, 3, 4, 5].flatMap((nf) => check(L, ni, nf))));
    expect(bad.length, bad.slice(0, 5).join('\n')).toBe(0);
  });
});
