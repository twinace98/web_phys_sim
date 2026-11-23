// Review page 102 (hydrogen): level energies, line wavelengths (vacuum and air), series limits,
// sign conventions, the inset labelling and the stage layout.
import { describe, expect, it } from 'vitest';
import { defaults } from '../src/core/params';
import { Runner } from '../src/core/runner';
import {
  A0_NM,
  E_ION,
  HC_EVNM,
  R_H,
  airIndex,
  bohrRadius,
  deltaAtom,
  energy,
  inverseWavelength,
  isEmission,
  lambdaAir,
  lambdaVac,
  photonEnergy,
  seriesLimit,
} from '../src/sims/review/hydrogen/physics';
import { N_PICK, SERIES_COUNT, SERIES_DT, ZOOM_YR, fmtLevel, nearestLevel, series, seriesIndex, transitions, zoomLabels } from '../src/sims/review/hydrogen/scene';
import { readoutText } from '../src/core/precision';
import { photonColor, region, NEUTRAL } from '../src/sims/review/hydrogen/spectrum';
import { KNOB_HIT, hasEarlierLines, knobDx, knobR } from '../src/sims/review/hydrogen/stage';
import en from '../src/sims/review/hydrogen/i18n.en.json';
import ko from '../src/sims/review/hydrogen/i18n.ko.json';
import { NUM, agrees, grab, val } from './sigma-digits';
import { offStage, probe } from './stage-probe';

const near = (a: number, b: number, tol: number) => expect(Math.abs(a - b)).toBeLessThan(tol);

describe('hydrogen levels', () => {
  it('E_n = −13.6 eV/n²: E_1 = −13.598 eV (reduced mass), E_2 = −3.400 eV, E_3 = −1.511 eV', () => {
    near(energy(1), -13.598, 5e-4);
    near(energy(2), -3.3996, 5e-4);
    near(energy(3), -1.5109, 5e-4);
    near(E_ION, 13.6, 0.01);
  });

  it('sign conventions: all bound levels negative, rising towards 0 (ionization) as n → ∞', () => {
    for (let n = 1; n < 50; n++) {
      expect(energy(n)).toBeLessThan(0);
      expect(energy(n + 1)).toBeGreaterThan(energy(n));
    }
    expect(energy(Infinity)).toBe(0);
    expect(-energy(1)).toBeCloseTo(E_ION, 12);
  });

  it('emission 3 → 2: the atom loses ΔE = 1.889 eV, the photon carries +1.889 eV; absorption 2 → 3 the reverse', () => {
    expect(isEmission(3, 2)).toBe(true);
    expect(isEmission(2, 3)).toBe(false);
    expect(deltaAtom(3, 2)).toBeLessThan(0);
    expect(deltaAtom(2, 3)).toBeGreaterThan(0);
    near(photonEnergy(3, 2), 1.88865, 1e-4);
    expect(photonEnergy(2, 3)).toBe(photonEnergy(3, 2));
    // ΔE = 13.6 (1/n_f² − 1/n_i²) eV for emission.
    expect(photonEnergy(3, 2)).toBeCloseTo(E_ION * (1 / 4 - 1 / 9), 12);
  });

  it('Bohr radii r_n = n² a₀', () => {
    expect(bohrRadius(1)).toBeCloseTo(A0_NM, 12);
    expect(bohrRadius(3) / bohrRadius(1)).toBeCloseTo(9, 12);
  });
});

describe('hydrogen lines', () => {
  it('λ = hc/ΔE agrees with 1/λ = R_H (1/n_f² − 1/n_i²)', () => {
    for (const [ni, nf] of [
      [2, 1],
      [3, 2],
      [7, 4],
      [10, 9],
    ])
      expect(lambdaVac(ni, nf)).toBeCloseTo(HC_EVNM / photonEnergy(ni, nf), 8);
    expect(inverseWavelength(3, 2)).toBeCloseTo((R_H * 5) / 36, 6);
  });

  it('Balmer lines in air (as tables quote them): Hα 656.3, Hβ 486.1, Hγ 434.0, Hδ 410.2 nm', () => {
    // NIST air wavelengths 656.279, 486.135, 434.047, 410.174 nm (fine structure neglected here: ≤ 0.02 nm).
    near(lambdaAir(3, 2), 656.279, 0.02);
    near(lambdaAir(4, 2), 486.135, 0.02);
    near(lambdaAir(5, 2), 434.047, 0.02);
    near(lambdaAir(6, 2), 410.174, 0.02);
    // The values as quoted to 0.1 nm (rounding ±0.05 nm plus the neglected fine structure).
    near(lambdaAir(3, 2), 656.3, 0.06);
    near(lambdaAir(4, 2), 486.1, 0.06);
    near(lambdaAir(5, 2), 434.0, 0.06);
    near(lambdaAir(6, 2), 410.2, 0.06);
  });

  it('the page shows vacuum wavelengths: Hα 656.5 nm, about 0.03 % longer than in air', () => {
    expect(lambdaVac(3, 2).toFixed(1)).toBe('656.5');
    near(airIndex(656.47), 1.000276, 2e-6);
    near(lambdaVac(3, 2) / lambdaAir(3, 2) - 1, 2.76e-4, 1e-5);
  });

  it('Lyman α 121.6 nm (vacuum), UV; Balmer α visible; Paschen α IR', () => {
    near(lambdaVac(2, 1), 121.567, 0.003);
    expect(region(lambdaVac(2, 1))).toBe('uv');
    expect(region(lambdaVac(3, 2))).toBe('vis');
    expect(region(lambdaVac(4, 3))).toBe('ir');
    near(lambdaVac(4, 3), 1875.6, 0.2);
  });

  it('series limits (vacuum): Lyman 91.18, Balmer 364.7, Paschen 820.6, Brackett 1458.8 nm', () => {
    near(seriesLimit(1), 91.176, 0.002);
    near(seriesLimit(2), 364.705, 0.005);
    near(seriesLimit(3), 820.59, 0.01);
    near(seriesLimit(4), 1458.8, 0.05);
    // Lines approach the limit from the long-wavelength side.
    for (let n = 3; n < 40; n++) {
      expect(lambdaVac(n + 1, 2)).toBeLessThan(lambdaVac(n, 2));
      expect(lambdaVac(n, 2)).toBeGreaterThan(seriesLimit(2));
    }
  });

  it('photon colour: spectral inside 380–750 nm, neutral grey outside', () => {
    expect(photonColor(121.6)).toBe(NEUTRAL);
    expect(photonColor(1875)).toBe(NEUTRAL);
    expect(photonColor(656.5)).not.toBe(NEUTRAL);
  });
});

describe('hydrogen stage', () => {
  const sizes: [number, number][] = [
    [1280, 704],
    [390, 624],
    [390, 520],
  ];

  it('inset labels: consecutive from n = 5, at least 14 px apart, the selected level always labelled', () => {
    for (const h of [300, 500, 700]) {
      const Y = (E: number) => 20 + ((ZOOM_YR[1] - E) / (ZOOM_YR[1] - ZOOM_YR[0])) * h;
      for (const sel of [[], [10], [9, 10]]) {
        const ns = zoomLabels(Y, sel);
        for (const s of sel) expect(ns).toContain(s);
        for (let i = 1; i < ns.length; i++) expect(Y(energy(ns[i - 1])) - Y(energy(ns[i]))).toBeGreaterThanOrEqual(14);
        expect(ns[0]).toBe(5);
      }
    }
  });

  it('dragging snaps to the nearest level', () => {
    expect(nearestLevel(energy(7) + 0.001)).toBe(7);
    expect(nearestLevel(-20)).toBe(1);
    expect(nearestLevel(0.5)).toBe(N_PICK);
  });

  it('no level label overlaps another, nothing leaves the stage (every pair, wide and narrow)', () => {
    const base = defaults(transitions.params);
    for (const [w, h] of sizes)
      for (let ni = 1; ni <= N_PICK; ni += 3)
        for (let nf = 1; nf <= N_PICK; nf += 2) {
          const p = { ...base, ni, nf, series: ni % 2 ? 'balmer' : 'none' };
          const g = probe(transitions, transitions.init(p, null as never), p, w, h);
          expect(offStage(g, 2)).toEqual([]);
          // Level labels: "n = k" / "k" / "∞" columns right of each panel.
          const labels = g.marks.filter((m) => m.kind === 'text' && /^(\*n\* = )?(\d+|∞)$/.test(m.text!));
          const cols = new Map<number, number[]>();
          for (const m of labels) cols.set(Math.round(m.x), [...(cols.get(Math.round(m.x)) ?? []), m.y]);
          for (const ys of cols.values()) {
            ys.sort((a, b) => a - b);
            for (let i = 1; i < ys.length; i++) expect(ys[i] - ys[i - 1]).toBeGreaterThanOrEqual(13);
          }
        }
  });

  it('lines accumulate in the strip as transitions are picked; reset clears them', () => {
    const p = defaults(transitions.params);
    const s = transitions.init(p, null as never);
    for (const [ni, nf] of [
      [3, 2],
      [4, 2],
      [2, 3],
      [2, 1],
    ])
      probe(transitions, s, { ...p, ni, nf }, 1280, 704);
    expect([...s.seen.keys()].sort()).toEqual(['1-2', '2-3', '2-4']);
    expect(transitions.init(p, null as never).seen.size).toBe(0);
  });

  it('series scene: one line per step, 12 lines, then stops', () => {
    expect(seriesIndex(0)).toBe(0);
    expect(seriesIndex(SERIES_DT * 3.5)).toBe(3);
    expect(seriesIndex(1e3)).toBe(SERIES_COUNT - 1);
    const p = defaults(series.params);
    for (const [w, h] of sizes)
      for (const id of ['lyman', 'balmer', 'paschen', 'brackett'])
        for (const tt of [0, 2.2, SERIES_COUNT * SERIES_DT]) {
          const q = { ...p, series: id, mode: id === 'paschen' ? 'absorption' : 'emission' };
          const g = probe(series, { t: tt, n: Math.round(tt / 0.02) }, q, w, h);
          expect(offStage(g, 2)).toEqual([]);
        }
  });

  it('formula panel: substituted values for the default Hα transition', () => {
    const p = defaults(transitions.params);
    const f = transitions.formula!(transitions.init(p, null as never), p).join(' ');
    // Policy D: levels to 2 decimals (as the stage labels), ΔE and λ as their readouts (3 figures).
    expect(f).toContain('E_{3} = -1.51\\ \\text{eV},\\quad E_{2} = -3.40\\ \\text{eV}');
    expect(f).toContain('= 1.89\\ \\text{eV}');
    expect(f).toContain('= 656\\ \\text{nm}');
    expect(f).toContain('1.52\\times 10^{6}');
    expect(transitions.formula!(transitions.init(p, null as never), { ...p, nf: 3 }).join(' ')).toContain('\\Delta E = 0');
    const fs = series.formula!({ t: 0, n: 0 }, defaults(series.params)).join(' ');
    expect(fs).toContain('\\lambda_\\infty = \\frac{2^2}{R_\\text{H}} = 365\\ \\text{nm}');
    expect(fs).toContain('(1.10\\times 10^{7}\\ \\text{m}^{-1})(0.139),\\quad \\lambda = 656\\ \\text{nm}');
  });

  it('policy D: level labels to 2 decimals (Halliday 13.60 eV), Σ results equal the readouts', () => {
    expect([1, 2, 3, 4, 5].map((n) => fmtLevel(energy(n)))).toEqual(['−13.60', '−3.40', '−1.51', '−0.85', '−0.54']);
    expect(fmtLevel(0)).toBe('0');
    // The labels from the model's 13.598 eV equal those from the printed 13.60 eV for every labelled level.
    for (let n = 1; n <= 40; n++) expect(fmtLevel(energy(n)), `n = ${n}`).toBe(fmtLevel(-13.6 / (n * n)));
    const p = defaults(transitions.params);
    const s = transitions.init(p, null as never);
    const text = (label: string, q: typeof p) => {
      const spec = transitions.readouts!.find((r) => r.label === label)!;
      return readoutText(spec as never, spec.value(s, q), q);
    };
    expect(text('\\Delta E', p)).toBe('1.89');
    expect(text('\\lambda', p)).toBe('656');
    // 10 → 9: λ stays in nm, as the readout and the spectrum axis.
    const far = { ...p, ni: 10, nf: 9 };
    const f = transitions.formula!(s, far);
    expect(f[2]).toContain(`= ${text('\\lambda', far)}\\ \\text{nm}`);
    expect(f[1]).toContain(`= ${text('\\Delta E', far)}\\ \\text{eV}`);
    // The series tab counts n as an integer (R2): Brackett's 12th line is n = 16, not "2×10¹".
    const bs = { ...defaults(series.params), series: 'brackett' };
    const nSpec = series.readouts!.find((r) => r.label === 'n')!;
    const st = { t: 11.5 * SERIES_DT, n: 0 };
    expect(readoutText(nSpec as never, nSpec.value(st, bs), bs)).toBe('16');
    expect(series.formula!(st, bs)[1]).toMatch(/^n = 16:/);
  });
});

describe('hydrogen stage controls (knobs, strip reset)', () => {
  const p0 = defaults(transitions.params);

  it('knob handles keep (or enlarge) their hit areas and sit at the arrow ends', () => {
    const hs = transitions.handles!;
    expect(hs.length).toBe(5);
    for (const h of hs.slice(0, 4)) expect(h.radiusPx).toBeGreaterThanOrEqual(14);
    expect(KNOB_HIT).toBeGreaterThanOrEqual(14);
    // The knob is smaller than its hit circle, so the whole knob can be grabbed.
    expect(knobR() + 4).toBeLessThanOrEqual(KNOB_HIT);
    const s = transitions.init(p0, null as never);
    probe(transitions, s, p0, 1280, 704);
    const f = s.lay!.main;
    const [ni, nf] = [hs[0].pos(s, p0), hs[1].pos(s, p0)];
    expect(f.g.vp.toPx(ni.x, ni.y)[1]).toBeCloseTo(f.Y(energy(3)), 6);
    expect(f.g.vp.toPx(nf.x, nf.y)[1]).toBeCloseTo(f.Y(energy(2)), 6);
  });

  it('close levels (4 → 3): the knobs move beside the arrow, so the arrowhead stays visible; handles follow', () => {
    expect(knobDx(100, 172)).toBe(0);
    expect(knobDx(100, 100)).toBe(0);
    for (const [w, h] of [
      [1280, 704],
      [390, 624],
    ]) {
      const p = { ...p0, ni: 4, nf: 3 };
      const s = transitions.init(p, null as never);
      probe(transitions, s, p, w, h);
      const f = s.lay!.main;
      const xArrow = f.box.l + 0.3 * (f.box.r - f.box.l);
      const dx = knobDx(f.Y(energy(4)), f.Y(energy(3)));
      // 21–25 px between n = 3 and 4: too little for an arrow between two 19 px knobs.
      expect(dx).toBeLessThanOrEqual(-(knobR() + 4));
      const pos = transitions.handles![0].pos(s, p);
      expect(f.g.vp.toPx(pos.x, pos.y)[0]).toBeCloseTo(xArrow + dx, 6);
    }
  });

  it('the strip clear button appears with earlier lines and clears them, keeping the current line', () => {
    const r = new Runner(transitions, p0, 1);
    const s = r.state;
    const clear = transitions.handles![4];
    probe(transitions, s, r.params, 1280, 704);
    // Only the current line: no button, the handle is off the stage.
    expect(s.btn).toBeNull();
    expect(clear.pos(s, r.params).x).toBeLessThan(-1e5);
    for (const [ni, nf] of [
      [4, 2],
      [2, 1],
      [3, 2],
    ]) {
      r.params.ni = ni;
      r.params.nf = nf;
      probe(transitions, s, r.params, 1280, 704);
    }
    expect(s.seen.size).toBe(3);
    expect(hasEarlierLines(s, r.params)).toBe(true);
    expect(s.btn).not.toBeNull();
    expect(clear.pos(s, r.params)).toEqual(s.btn!.c);
    clear.onTap!(r.ctx(), s);
    expect([...s.seen.keys()]).toEqual(['2-3']);
    const g = probe(transitions, s, r.params, 1280, 704);
    expect(s.btn).toBeNull();
    expect(g.marks.some((m) => m.text === 'hyd.clear')).toBe(false);
    // With n_i = n_f there is no current line: clearing empties the strip.
    r.params.ni = 5;
    r.params.nf = 1;
    probe(transitions, s, r.params, 1280, 704);
    r.params.nf = 5;
    probe(transitions, s, r.params, 1280, 704);
    expect(s.btn).not.toBeNull();
    clear.onTap!(r.ctx(), s);
    expect(s.seen.size).toBe(0);
  });

  it('the clear button stays on the stage and clear of the region names (wide and narrow)', () => {
    for (const [w, h] of [
      [1280, 704],
      [390, 624],
      [390, 520],
    ])
      for (const series of ['none', 'paschen']) {
        const p = { ...p0, series };
        const s = transitions.init(p, null as never);
        probe(transitions, s, { ...p, ni: 4, nf: 1 }, w, h);
        const g = probe(transitions, s, p, w, h);
        expect(offStage(g, 2)).toEqual([]);
        const b = g.marks.find((m) => m.text === 'hyd.clear')!;
        expect(b).toBeTruthy();
        expect(s.btn!.box.r).toBeLessThanOrEqual(w);
        for (const m of g.marks) {
          if (m === b || m.kind !== 'text' || Math.abs(m.y - b.y) > 12) continue;
          expect(m.x + m.w <= s.btn!.box.l || m.x >= s.btn!.box.r, `${m.text} at ${w}x${h}`).toBe(true);
        }
        // Not on top of a knob or of the strip.
        expect(s.btn!.box.b).toBeLessThanOrEqual(s.lay!.spec.t + 16);
      }
  });
});

describe('hydrogen Σ: the printed inputs reproduce the printed results', () => {
  const R = (s: string) => new RegExp(s.replace(/N#/g, `(${NUM})`));
  /** A printed wavelength in nm (μm lines converted). */
  const lamOf = (line: string): [string, number] => {
    const [v, unit] = grab(line, R(String.raw`= N#\\ (\\mu\\text\{m\}|\\text\{nm\})$`));
    return [v, unit === '\\mu\\text{m}' ? 1000 : 1];
  };
  const p0 = defaults(transitions.params);

  function checkPair(ni: number, nf: number): string[] {
    const bad: string[] = [];
    const tag = `${ni}→${nf}`;
    const f = transitions.formula!(transitions.init(p0, null as never), { ...p0, ni, nf });
    const [Ec, Ei, Ef] = grab(f[0], R(String.raw`E_n = -\\frac\{N#\\ \\text\{eV\}\}\{n\^2\}:\\quad E_\{\d+\} = N#\\ \\text\{eV\},\\quad E_\{\d+\} = N#`));
    if (!agrees(-val(Ec) / (ni * ni), Ei) || !agrees(-val(Ec) / (nf * nf), Ef)) bad.push(`${tag} E_n ${f[0]}`);
    if (ni === nf) return bad;
    const [Ec2, lo, hi, dE] = grab(f[1], R(String.raw`= N#\\left\(\\frac\{1\}\{(\d+)\^2\} - \\frac\{1\}\{(\d+)\^2\}\\right\)\\ \\text\{eV\} = N#`));
    if (Ec2 !== Ec) bad.push(`${tag} constant differs between lines: ${Ec} / ${Ec2}`);
    if (!agrees(val(Ec2) * (1 / Number(lo) ** 2 - 1 / Number(hi) ** 2), dE)) bad.push(`${tag} ΔE ${f[1]}`);
    const [hc, dE2] = grab(f[2], R(String.raw`\\frac\{N#\\ \\text\{eV\}\\cdot\\text\{nm\}\}\{N#\\ \\text\{eV\}\}`));
    if (dE2 !== dE) bad.push(`${tag} ΔE differs between lines: ${dE} / ${dE2}`);
    const [lam, scale] = lamOf(f[2]);
    if (!agrees(val(hc) / val(dE2) / scale, lam)) bad.push(`${tag} λ ${f[2]}`);
    return bad;
  }

  it("ⓘ names the constants Σ prints (Halliday's 13.60 eV and hc = 1240 eV·nm, policy D)", () => {
    const f = transitions.formula!(transitions.init(p0, null as never), p0).join(' ');
    for (const dict of [ko, en] as Record<string, string>[]) {
      const s = dict['hyd.assume.reduced'];
      expect(s).toContain('13.60');
      expect(s).toContain('1240');
      expect(s).not.toContain('13.5983');
      expect(dict['hyd.t.goal.levels']).toContain('13.60');
    }
    expect(f).toContain('-\\frac{13.60\\ \\text{eV}}{n^2}');
    expect(f).toContain('\\frac{1240\\ \\text{eV}\\cdot\\text{nm}}');
    expect(f).not.toMatch(/13\.598|1239/);
  });

  it('review case: all 90 transitions (n = 1 … 10) and n_i = n_f', () => {
    const bad: string[] = [];
    for (let ni = 1; ni <= N_PICK; ni++) for (let nf = 1; nf <= N_PICK; nf++) bad.push(...checkPair(ni, nf));
    expect(bad.length, bad.slice(0, 5).join('\n')).toBe(0);
  });

  it('series tab: (R_H)(1/n_low² − 1/n²) gives the printed λ for every line of every series', () => {
    const bad: string[] = [];
    for (const id of ['lyman', 'balmer', 'paschen', 'brackett'])
      for (const mode of ['emission', 'absorption'])
        for (let k = 0; k < SERIES_COUNT; k++) {
          const p = { ...defaults(series.params), series: id, mode };
          const f = series.formula!({ t: (k + 0.5) * SERIES_DT, n: 0 }, p);
          const [Rh, kk] = grab(f[1], R(String.raw`\\frac\{1\}\{\\lambda\} = \(N#\\ \\text\{m\}\^\{-1\}\)\(N#\)`));
          const [lam, scale] = lamOf(f[1]);
          if (!agrees(1e9 / (val(Rh) * val(kk)) / scale, lam)) bad.push(`${id} k=${k} ${f[1]}`);
        }
    expect(bad.length, bad.slice(0, 5).join('\n')).toBe(0);
  });
});
