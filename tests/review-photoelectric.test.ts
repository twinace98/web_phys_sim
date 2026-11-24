// Addition under review: photoelectric effect (src/sims/review/photoelectric).
import { describe, expect, it } from 'vitest';
import { defaults, fromQuery } from '../src/core/params';
import { probe } from './stage-probe';
import { Runner } from '../src/core/runner';
import { readoutText } from '../src/core/precision';
import {
  C,
  F_RANGE,
  HC_EV_NM,
  H,
  H_OVER_E,
  METALS,
  QE,
  classicalDelay,
  collectedFraction,
  current,
  currentClassical,
  iSat,
  kMax,
  photonEnergy,
  thresholdF,
  thresholdNm,
  vStop,
  vStopClassical,
  wavelength,
} from '../src/sims/review/photoelectric/physics';
import { formulaLines, iAxisMax, photoelectric, tsci, type P } from '../src/sims/review/photoelectric/scene';
import en from '../src/sims/review/photoelectric/i18n.en.json';
import ko from '../src/sims/review/photoelectric/i18n.ko.json';

/** Frequencies [10¹⁴ Hz] across the slider range. */
const FS = [4.0, 5.0, 6.3, 7.5, 10, 12.7, 16.6];

describe('photoelectric physics', () => {
  it('hf = h f; λ = c/f; hc = 1239.84 eV nm', () => {
    expect(HC_EV_NM).toBeCloseTo(1239.84198, 4);
    for (const f of FS) {
      expect(photonEnergy(f)).toBeCloseTo((H * f * 1e14) / QE, 12);
      expect(wavelength(f)).toBeCloseTo(C / (f * 1e14) / 1e-9, 9);
      expect(photonEnergy(f) * wavelength(f)).toBeCloseTo(HC_EV_NM, 9);
    }
    expect(photonEnergy(7.5)).toBeCloseTo(3.1018, 4);
    expect(wavelength(7.5)).toBeCloseTo(399.72, 2);
  });

  it('frequency control covers the old 180–750 nm range in steps of 0.1', () => {
    const fp = photoelectric.params.f;
    expect(fp.kind === 'number' && [fp.min, fp.max, fp.step, fp.default, fp.control, fp.group]).toEqual([4.0, 16.6, 0.1, 7.5, 'slider', 'main']);
    expect(F_RANGE).toEqual([4.0, 16.6]);
    expect(wavelength(F_RANGE[0])).toBeCloseTo(749.5, 1);
    expect(wavelength(F_RANGE[1])).toBeCloseTo(180.6, 1);
    expect('lam' in photoelectric.params).toBe(false);
  });

  it('K_max = hf − Φ for every metal (0 below threshold)', () => {
    for (const m of METALS) {
      for (const f of FS) {
        const want = Math.max(0, 0.41356677 * f - m.phi);
        expect(kMax(f, m.phi)).toBeCloseTo(want, 6);
        expect(vStop(f, m.phi)).toBeCloseTo(want, 6);
      }
    }
    // Sodium at 7.5×10¹⁴ Hz: 3.10 − 2.28 = 0.82 eV, V_stop = 0.82 V.
    expect(kMax(7.5, 2.28)).toBeCloseTo(0.8218, 4);
  });

  it('threshold f0 = Φ/h per metal (Na 5.51, Cs 5.17 ×10¹⁴ Hz); K_max vanishes exactly there', () => {
    const want: Record<string, number> = { Cs: 5.174, Na: 5.513, Zn: 10.47, Cu: 11.244, Pt: 13.662 };
    for (const m of METALS) {
      const f0 = thresholdF(m.phi);
      expect(f0).toBeCloseTo(want[m.id], 2);
      expect(f0 * 1e14).toBeCloseTo((m.phi * QE) / H, -3);
      expect(wavelength(f0)).toBeCloseTo(thresholdNm(m.phi), 9);
      expect(f0).toBeGreaterThan(F_RANGE[0]);
      expect(f0).toBeLessThan(F_RANGE[1]);
      expect(kMax(f0 * 0.999, m.phi)).toBe(0);
      expect(kMax(f0 * 1.001, m.phi)).toBeGreaterThan(0);
      // On the control's 0.1 grid: no current one step below f0, current one step above.
      const below = Math.floor(f0 * 10) / 10;
      expect(current(0, 1, below, m.phi)).toBe(0);
      expect(current(0, 1, below + 0.1, m.phi)).toBeGreaterThan(0);
    }
    expect(thresholdF(2.28).toFixed(2)).toBe('5.51');
    expect(thresholdF(2.14).toFixed(2)).toBe('5.17');
  });

  it('every metal is stopped inside the voltage range (V_stop ≤ 5 V at the top frequency)', () => {
    for (const m of METALS) expect(vStop(F_RANGE[1], m.phi)).toBeLessThanOrEqual(5);
    expect(vStop(16.6, 2.14)).toBeCloseTo(4.725, 3);
  });

  it('current: saturates for V ≥ 0, falls linearly, 0 for V ≤ −V_stop and below threshold', () => {
    const phi = 2.28;
    const f = 7.5;
    const Is = iSat(1, f, phi);
    // P/(hf) e = 1 µW / 3.1018 V = 0.3224 µA.
    expect(Is).toBeCloseTo(1e3 / photonEnergy(f), 6);
    expect(Is).toBeCloseTo(322.4, 1);
    for (const V of [0, 0.5, 3]) expect(current(V, 1, f, phi)).toBeCloseTo(Is, 9);
    const vs = vStop(f, phi);
    expect(current(-vs / 2, 1, f, phi)).toBeCloseTo(Is / 2, 9);
    for (const V of [-vs, -vs - 0.01, -5]) expect(current(V, 1, f, phi)).toBe(0);
    // Below threshold: no current at any voltage, any power.
    for (const V of [-5, 0, 3]) for (const P of [0.1, 2]) expect(current(V, P, 5.0, phi)).toBe(0);
    // Current ∝ power, V_stop independent of power.
    expect(current(-0.2, 2, f, phi)).toBeCloseTo(2 * current(-0.2, 1, f, phi), 9);
    expect(collectedFraction(-0.3, 0)).toBe(0);
    expect(collectedFraction(0.3, 0)).toBe(1);
  });

  it('classical expectation: no threshold, cutoff ∝ power, delay of minutes to hours', () => {
    expect(currentClassical(0, 1, 4.3)).toBeGreaterThan(0);
    expect(vStopClassical(2)).toBe(2 * vStopClassical(1));
    expect(currentClassical(-vStopClassical(1), 1, 7.5)).toBe(0);
    // Na, 1 µW on 1 cm², π(0.1 nm)²: 2.28 eV / (10⁻² W/m² · 3.14×10⁻²⁰ m²) = 1.16×10³ s.
    expect(classicalDelay(1, 2.28)).toBeCloseTo((2.28 * QE) / (1e-2 * Math.PI * 1e-20), 6);
    expect(classicalDelay(1, 2.28)).toBeCloseTo(1163, 0);
    // The ⓘ range "about 9 min to 8 h" (QA 2026-11-24, was "tens of minutes"): Cs at 2 µW to Pt at 0.1 µW.
    const phis = METALS.map((m) => m.phi);
    expect(classicalDelay(2, Math.min(...phis)) / 60).toBeCloseTo(9.1, 1);
    expect(classicalDelay(0.1, Math.max(...phis)) / 3600).toBeCloseTo(8.0, 1);
  });
});

describe('photoelectric scene', () => {
  const base = defaults(photoelectric.params) as P;

  it('formula lines: substituted values, 3 lines (4 with the classical comparison)', () => {
    const l = formulaLines(base);
    expect(l.length).toBe(3);
    expect(l[0]).toContain('(7.5\\times10^{14}');
    expect(l[0]).toContain('= 3.10');
    expect(l[1]).toContain('\\lambda = c/f = 400');
    expect(l[1]).toContain('f_0 = \\Phi/h = 5.51\\times10^{14}');
    expect(l[2]).toContain('V_\\text{stop} = K_\\text{max}');
    // Policy D: K_max is the V_stop readout string (3 figures), h is Halliday's 4.14×10⁻¹⁵ eV s.
    expect(l[2]).toContain('3.10 - 2.28 = 0.822\\ \\mathrm{eV}');
    expect(l[0]).toContain('(4.14\\times 10^{-15}\\ \\mathrm{eV\\,s})');
    expect(tsci(H_OVER_E, 4)).toBe('4.136\\times10^{-15}');
    const below = formulaLines({ ...base, f: 5.0 });
    expect(below[2]).toContain('K_\\text{max} = 0');
    expect(below[2]).toContain('f < f_0');
    expect(below[1]).toContain('5.51');
    expect(formulaLines({ ...base, f: 5.0, metal: 'Cs' })[1]).toContain('5.17');
    expect(formulaLines({ ...base, f: 16.6 })[1]).toContain('= 181');
    expect(formulaLines({ ...base, f: 4.0 })[1]).toContain('= 749');
    const fitted = formulaLines({ ...base, classical: true });
    expect(fitted.length).toBe(4);
    expect(fitted[3]).toContain('t_\\text{cl}');
    for (const s of [...l, ...below, ...fitted]) expect(s).not.toMatch(/NaN|undefined|Infinity|−/);
  });

  it('policy D: K_max near the threshold is the V_stop readout (R5), f_0 has 3 figures', () => {
    // Na at 5.6×10¹⁴ Hz: hf = 2.316 eV, K_max = 0.0360 eV (the printed 2.32 − 2.28 gives 0.04).
    const near = formulaLines({ ...base, f: 5.6 });
    expect(near[0]).toContain('(5.6\\times10^{14}');
    expect(near[2]).toContain('= 2.32 - 2.28 = 0.0360\\ \\mathrm{eV}');
    const r = new Runner(photoelectric, { ...base, f: 5.6 }, 1);
    const vs = photoelectric.readouts!.find((x) => x.label === 'V_\\text{stop}')!;
    expect(readoutText(vs as never, vs.value(r.state, { ...base, f: 5.6 }), base)).toBe('0.0360');
    // Pt: f_0 = 13.66×10¹⁴ Hz prints 3 figures.
    expect(formulaLines({ ...base, metal: 'Pt' })[1]).toContain('f_0 = \\Phi/h = 13.7\\times10^{14}');
    // Every slider value of f prints as its label (one decimal).
    for (let f = 4.0; f <= 16.6 + 1e-9; f += 0.1) expect(formulaLines({ ...base, f: Number(f.toFixed(1)) })[0]).toContain(`(${f.toFixed(1)}\\times10^{14}`);
  });

  it('readouts follow the model; the I–V axis holds the saturation current', () => {
    const r = new Runner(photoelectric, base, 7);
    const ro = (label: string, p: P) => photoelectric.readouts!.find((x) => x.label === label)!.value(r.state, p);
    expect(ro('I', base)).toBeCloseTo(322.4, 1);
    expect(ro('I', { ...base, V: -0.5 })).toBeCloseTo(322.4 * (1 - 0.5 / 0.8218), 0);
    expect(ro('I', { ...base, V: -1 })).toBe(0);
    expect(ro('I', { ...base, f: 5.0 })).toBe(0);
    expect(ro('hf', { ...base, f: 10 })).toBeCloseTo(4.1357, 4);
    for (const P of [0.1, 0.5, 1, 2]) {
      const top = iAxisMax(P);
      for (const f of [...FS, 5.2]) for (const m of METALS) expect(iSat(P, f, m.phi)).toBeLessThanOrEqual(top);
      expect(iSat(P, 5.2, 2.14) / top).toBeGreaterThan(0.6);
    }
  });

  it('the V_stop–f measurement plot is gone: no stored points, no buttons, two panels (tube, I–V)', () => {
    expect(Object.keys(photoelectric.params).sort()).toEqual(['V', 'classical', 'f', 'metal', 'power']);
    expect(photoelectric.handles ?? []).toEqual([]);
    for (const [w, h] of [[1280, 640], [390, 520]]) {
      const r = new Runner(photoelectric, base, 1);
      const g = probe(photoelectric, r.state, base, w, h);
      const texts = g.marks.filter((m) => m.kind === 'text').map((m) => m.text ?? '');
      expect(texts.some((t) => t.includes('*V*_{stop} (V)'))).toBe(false);
      expect(texts.some((t) => /^\*f\* \(10\^\{14\} Hz\)$/.test(t))).toBe(false);
      // The I–V curve keeps its cutoff label.
      expect(texts).toContain('−*V*_{stop}');
    }
    // An old link with stored points still opens (the unknown D is ignored).
    const p = fromQuery(photoelectric.params, new URLSearchParams('f=9&D=120,1,86,1'));
    expect(p).toEqual({ ...base, f: 9 });
  });

  it('no electrons are emitted below threshold; above it, electrons cross or turn back', () => {
    const below = new Runner(photoelectric, { ...base, f: 5.0 }, 3);
    below.play();
    for (let i = 0; i < 600; i++) below.advance(1 / 60);
    expect(below.state.electrons.length).toBe(0);
    expect(below.state.hits.length + below.state.photons.length).toBeGreaterThan(0);
    const above = new Runner(photoelectric, { ...base, f: 12, metal: 'Cs' }, 3);
    expect(above.state.electrons.length).toBeGreaterThan(0);
    // Retarding voltage beyond V_stop: every electron turns back before the collector.
    const stopped = new Runner(photoelectric, { ...base, V: -1, power: 2 }, 5);
    stopped.play();
    let maxX = 0;
    for (let i = 0; i < 900; i++) {
      stopped.advance(1 / 60);
      for (const e of stopped.state.electrons) maxX = Math.max(maxX, e.x);
    }
    // K ≤ 0.82 eV < 1 eV: turning point x = K/(e|V|) < 0.83.
    expect(maxX).toBeLessThan(0.83);
    expect(maxX).toBeGreaterThan(0.2);
  });

  it('every i18n key used by the scene exists in ko and en, without em-dash', () => {
    const keys = new Set<string>([photoelectric.title, ...photoelectric.info.goals, ...photoelectric.info.observe, ...(photoelectric.info.assumptions ?? [])]);
    for (const sp of Object.values(photoelectric.params)) {
      keys.add(sp.label);
      if (sp.desc) keys.add(sp.desc);
      if (sp.kind === 'select') for (const o of sp.options) keys.add(o.label);
    }
    for (const k of ['pe.classical']) keys.add(k);
    for (const k of keys) {
      expect((ko as Record<string, string>)[k], k).toBeTruthy();
      expect((en as Record<string, string>)[k], k).toBeTruthy();
    }
    expect(Object.keys(ko).sort()).toEqual(Object.keys(en).sort());
    expect(JSON.stringify([ko, en])).not.toContain('\u2014');
  });
});
