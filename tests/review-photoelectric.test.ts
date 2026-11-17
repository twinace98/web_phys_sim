// Addition under review: photoelectric effect (src/sims/review/photoelectric).
import { describe, expect, it } from 'vitest';
import { defaults } from '../src/core/params';
import { Runner } from '../src/core/runner';
import {
  C,
  F_RANGE,
  HC_EV_NM,
  H,
  H_OVER_E,
  MAX_POINTS,
  METALS,
  QE,
  addPoint,
  classicalDelay,
  collectedFraction,
  current,
  currentClassical,
  emptyPoints,
  fCode,
  fitLines,
  iSat,
  kMax,
  photonEnergy,
  pointValues,
  readPoints,
  thresholdF,
  thresholdNm,
  vStop,
  vStopClassical,
  wavelength,
  writePoints,
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

  it('classical expectation: no threshold, cutoff ∝ power, delay of tens of minutes', () => {
    expect(currentClassical(0, 1, 4.3)).toBeGreaterThan(0);
    expect(vStopClassical(2)).toBe(2 * vStopClassical(1));
    expect(currentClassical(-vStopClassical(1), 1, 7.5)).toBe(0);
    // Na, 1 µW on 1 cm², π(0.1 nm)²: 2.28 eV / (10⁻² W/m² · 3.14×10⁻²⁰ m²) = 1.16×10³ s.
    expect(classicalDelay(1, 2.28)).toBeCloseTo((2.28 * QE) / (1e-2 * Math.PI * 1e-20), 6);
    expect(classicalDelay(1, 2.28)).toBeCloseTo(1163, 0);
  });
});

describe('measured points and the fit', () => {
  it('points are stored as exact integers f × 10 and read back unchanged (round trip)', () => {
    for (let c = 40; c <= 166; c++) {
      const f = c / 10;
      expect(fCode(f)).toBe(c);
      // Slider values carry float noise (0.1 steps): the code is still exact.
      expect(fCode(f + 1e-9)).toBe(c);
      expect(fCode(f - 1e-9)).toBe(c);
      const D = writePoints([{ f, m: 3 }]);
      expect(Number.isInteger(D[0])).toBe(true);
      expect(readPoints(D)).toEqual([{ f, m: 3 }]);
      expect(writePoints(readPoints(D))).toEqual(D);
    }
    const D = addPoint(emptyPoints(), 7.499999999, 1)!;
    expect(D.slice(0, 2)).toEqual([75, 1]);
    expect(readPoints(D)[0].f).toBe(7.5);
    // The stored point lands exactly where the hollow marker of the same setting sits.
    expect(pointValues(readPoints(D))[0].v).toBe(vStop(7.5, 2.28));
  });

  it('old links (wavelength codes 180–750 nm) and out-of-range codes read as no points', () => {
    const old = emptyPoints();
    old.splice(0, 6, 400, 1, 250, 0, 180, 4);
    expect(readPoints(old)).toEqual([]);
    expect(readPoints([39, 1, 167, 1, 75, 9, 75, -1])).toEqual([]);
    expect(addPoint(emptyPoints(), 3.9, 0)).toBeNull();
    expect(addPoint(emptyPoints(), 16.7, 0)).toBeNull();
  });

  it('fit of exact points returns h/e and every Φ to 1e-9', () => {
    let D = emptyPoints();
    for (let m = 0; m < METALS.length; m++) {
      for (const f of [14.0, 15.0, 16.6]) {
        const next = addPoint(D, f, m);
        if (next) D = next;
      }
    }
    const fit = fitLines(pointValues(readPoints(D)))!;
    expect(fit).not.toBeNull();
    expect(Math.abs(fit.slope / H_OVER_E - 1)).toBeLessThan(1e-9);
    for (let m = 0; m < METALS.length; m++) {
      expect(fit.fitted[m]).toBe(true);
      expect(Math.abs(-fit.intercept[m] - METALS[m].phi)).toBeLessThan(1e-9);
    }
  });

  it('one metal alone: slope h/e, intercept −Φ/e, zero crossing at f0', () => {
    let D = emptyPoints();
    for (const f of [12, 8.6, 6.7, 5.8]) D = addPoint(D, f, 1) ?? D;
    expect(readPoints(D).length).toBe(4);
    const fit = fitLines(pointValues(readPoints(D)))!;
    expect(Math.abs(fit.slope - H_OVER_E) / H_OVER_E).toBeLessThan(1e-9);
    expect(Math.abs(fit.intercept[1] + 2.28)).toBeLessThan(1e-9);
    expect(-fit.intercept[1] / fit.slope / 1e14).toBeCloseTo(thresholdF(2.28), 9);
    expect(fit.fitted.filter(Boolean).length).toBe(1);
  });

  it('no fit below two points of one metal; no point below threshold; no duplicates', () => {
    let D = emptyPoints();
    expect(fitLines(pointValues(readPoints(D)))).toBeNull();
    D = addPoint(D, 7.5, 1)!;
    D = addPoint(D, 10, 0)!;
    expect(fitLines(pointValues(readPoints(D)))).toBeNull();
    expect(addPoint(D, 7.5, 1)).toBeNull();
    expect(addPoint(D, 7.5000001, 1)).toBeNull();
    expect(addPoint(D, 5.5, 1)).toBeNull();
    D = addPoint(D, 8.6, 1)!;
    expect(fitLines(pointValues(readPoints(D)))).not.toBeNull();
  });

  it('stores at most MAX_POINTS, dropping the oldest; fixed length for the URL', () => {
    let D = emptyPoints();
    for (let i = 0; i < MAX_POINTS + 3; i++) D = addPoint(D, 12 + i / 10, 0)!;
    expect(D.length).toBe(2 * MAX_POINTS);
    const pts = readPoints(D);
    expect(pts.length).toBe(MAX_POINTS);
    expect(pts[0].f).toBe(12.3);
    expect(pts.at(-1)!.f).toBe((120 + MAX_POINTS + 2) / 10);
    // The hidden array parameter keeps its bounds.
    const dp = photoelectric.params.D;
    expect(dp.kind).toBe('array');
    if (dp.kind === 'array') {
      expect(Math.max(...D)).toBeLessThanOrEqual(dp.max!);
      expect(Math.min(...D)).toBeGreaterThanOrEqual(dp.min!);
    }
  });
});

describe('photoelectric scene', () => {
  const base = defaults(photoelectric.params) as P;

  it('formula lines: substituted values, 4–6 lines', () => {
    const l = formulaLines(base);
    expect(l.length).toBe(4);
    expect(l[0]).toContain('(7.5\\times10^{14}');
    expect(l[0]).toContain('= 3.10');
    expect(l[1]).toContain('\\lambda = c/f = 400');
    expect(l[1]).toContain('f_0 = \\Phi/h = 5.51\\times10^{14}');
    expect(l[2]).toContain('V_\\text{stop} = K_\\text{max}');
    expect(l[2]).toContain('3.10 - 2.28 = 0.82');
    expect(l[3]).toContain(tsci(H_OVER_E, 4));
    expect(tsci(H_OVER_E, 4)).toBe('4.136\\times10^{-15}');
    const below = formulaLines({ ...base, f: 5.0 });
    expect(below[2]).toContain('K_\\text{max} = 0');
    expect(below[2]).toContain('f < f_0');
    expect(below[1]).toContain('5.51');
    expect(formulaLines({ ...base, f: 5.0, metal: 'Cs' })[1]).toContain('5.17');
    expect(formulaLines({ ...base, f: 16.6 })[1]).toContain('= 181');
    expect(formulaLines({ ...base, f: 4.0 })[1]).toContain('= 749');
    let D = emptyPoints();
    for (const f of [12, 8.6]) D = addPoint(D, f, 1)!;
    const fitted = formulaLines({ ...base, D, classical: true });
    expect(fitted.length).toBe(6);
    expect(fitted[4]).toContain('-2.28');
    expect(fitted[5]).toContain('t_\\text{cl}');
    for (const s of [...l, ...below, ...fitted]) expect(s).not.toMatch(/NaN|undefined|Infinity|−/);
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

  it('Measure stores the current frequency; Clear empties the points', () => {
    const r = new Runner(photoelectric, { ...base, f: 9.3, metal: 'Zn' }, 1);
    const [measure, clear] = photoelectric.handles!;
    // Below the Zn threshold (10.47): nothing to measure.
    measure.onTap!(r.ctx(), r.state);
    expect(readPoints(r.params.D)).toEqual([]);
    r.params.f = 12.4;
    measure.onTap!(r.ctx(), r.state);
    expect(readPoints(r.params.D)).toEqual([{ f: 12.4, m: 2 }]);
    expect(clear.when!(r.params)).toBe(true);
    clear.onTap!(r.ctx(), r.state);
    expect(readPoints(r.params.D)).toEqual([]);
    expect(clear.when!(r.params)).toBe(false);
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
    for (const k of ['pe.measure', 'pe.clear', 'pe.classical']) keys.add(k);
    for (const k of keys) {
      expect((ko as Record<string, string>)[k], k).toBeTruthy();
      expect((en as Record<string, string>)[k], k).toBeTruthy();
    }
    expect(Object.keys(ko).sort()).toEqual(Object.keys(en).sort());
    expect(JSON.stringify([ko, en])).not.toContain('\u2014');
  });
});
