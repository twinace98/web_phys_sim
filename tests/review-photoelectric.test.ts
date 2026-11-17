// Addition under review: photoelectric effect (src/sims/review/photoelectric).
import { describe, expect, it } from 'vitest';
import { defaults } from '../src/core/params';
import { Runner } from '../src/core/runner';
import {
  C,
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
  fitLines,
  frequency,
  iSat,
  kMax,
  photonEnergy,
  pointValues,
  readPoints,
  thresholdHz,
  thresholdNm,
  vStop,
  vStopClassical,
} from '../src/sims/review/photoelectric/physics';
import { formulaLines, iAxisMax, photoelectric, tsci, type P } from '../src/sims/review/photoelectric/scene';
import en from '../src/sims/review/photoelectric/i18n.en.json';
import ko from '../src/sims/review/photoelectric/i18n.ko.json';

const LAMS = [180, 250, 300, 400, 500, 600, 750];

describe('photoelectric physics', () => {
  it('hc = 1239.84 eV nm; hf = hc/λ = h c/(λ e)', () => {
    expect(HC_EV_NM).toBeCloseTo(1239.84198, 4);
    for (const nm of LAMS) expect(photonEnergy(nm)).toBeCloseTo((H * frequency(nm)) / QE, 12);
    expect(photonEnergy(400)).toBeCloseTo(3.0996, 4);
  });

  it('K_max = hc/λ − Φ for every metal (0 below threshold)', () => {
    for (const m of METALS) {
      for (const nm of LAMS) {
        const want = Math.max(0, 1239.84198 / nm - m.phi);
        expect(kMax(nm, m.phi)).toBeCloseTo(want, 5);
        expect(vStop(nm, m.phi)).toBeCloseTo(want, 5);
      }
    }
    // Sodium at 400 nm: 3.10 − 2.28 = 0.82 eV, V_stop = 0.82 V.
    expect(kMax(400, 2.28)).toBeCloseTo(0.8196, 4);
  });

  it('threshold λ0 = hc/Φ and f0 = Φ/h; K_max vanishes exactly there', () => {
    const want: Record<string, number> = { Cs: 579.4, Na: 543.8, Zn: 286.3, Cu: 266.6, Pt: 219.4 };
    for (const m of METALS) {
      expect(thresholdNm(m.phi)).toBeCloseTo(want[m.id], 1);
      expect(thresholdHz(m.phi)).toBeCloseTo(C / (thresholdNm(m.phi) * 1e-9), -3);
      expect(kMax(thresholdNm(m.phi) * 1.001, m.phi)).toBe(0);
      expect(kMax(thresholdNm(m.phi) * 0.999, m.phi)).toBeGreaterThan(0);
    }
  });

  it('every metal is stopped inside the voltage range (V_stop ≤ 5 V at 180 nm)', () => {
    for (const m of METALS) expect(vStop(180, m.phi)).toBeLessThanOrEqual(5);
    expect(vStop(180, 2.14)).toBeCloseTo(4.748, 3);
  });

  it('current: saturates for V ≥ 0, falls linearly, 0 for V ≤ −V_stop and below threshold', () => {
    const phi = 2.28;
    const nm = 400;
    const Is = iSat(1, nm, phi);
    // P/(hf) e = 1 µW / 3.0996 V = 0.3226 µA.
    expect(Is).toBeCloseTo(1e3 / photonEnergy(nm), 6);
    expect(Is).toBeCloseTo(322.6, 1);
    for (const V of [0, 0.5, 3]) expect(current(V, 1, nm, phi)).toBeCloseTo(Is, 9);
    const vs = vStop(nm, phi);
    expect(current(-vs / 2, 1, nm, phi)).toBeCloseTo(Is / 2, 9);
    for (const V of [-vs, -vs - 0.01, -5]) expect(current(V, 1, nm, phi)).toBe(0);
    // Below threshold: no current at any voltage, any power.
    for (const V of [-5, 0, 3]) for (const P of [0.1, 2]) expect(current(V, P, 600, phi)).toBe(0);
    // Current ∝ power, V_stop independent of power.
    expect(current(-0.2, 2, nm, phi)).toBeCloseTo(2 * current(-0.2, 1, nm, phi), 9);
    expect(collectedFraction(-0.3, 0)).toBe(0);
    expect(collectedFraction(0.3, 0)).toBe(1);
  });

  it('classical expectation: no threshold, cutoff ∝ power, delay of tens of minutes', () => {
    expect(currentClassical(0, 1, 700)).toBeGreaterThan(0);
    expect(vStopClassical(2)).toBe(2 * vStopClassical(1));
    expect(currentClassical(-vStopClassical(1), 1, 400)).toBe(0);
    // Na, 1 µW on 1 cm², π(0.1 nm)²: 2.28 eV / (10⁻² W/m² · 3.14×10⁻²⁰ m²) = 1.16×10³ s.
    expect(classicalDelay(1, 2.28)).toBeCloseTo((2.28 * QE) / (1e-2 * Math.PI * 1e-20), 6);
    expect(classicalDelay(1, 2.28)).toBeCloseTo(1163, 0);
  });
});

describe('measured points and the fit', () => {
  it('fit of exact points returns h/e and every Φ to 1e-9', () => {
    let D = emptyPoints();
    for (let m = 0; m < METALS.length; m++) {
      for (const nm of [180, 200, 230]) {
        const next = addPoint(D, nm, m);
        if (next) D = next;
      }
    }
    const fit = fitLines(pointValues(readPoints(D)))!;
    expect(fit).not.toBeNull();
    expect(Math.abs(fit.slope / H_OVER_E - 1)).toBeLessThan(1e-9);
    for (let m = 0; m < METALS.length; m++) {
      // Pt has only two points above its 219 nm threshold.
      expect(fit.fitted[m]).toBe(true);
      expect(Math.abs(-fit.intercept[m] - METALS[m].phi)).toBeLessThan(1e-9);
    }
  });

  it('one metal alone: slope h/e and intercept −Φ/e', () => {
    let D = emptyPoints();
    for (const nm of [250, 350, 450, 520]) D = addPoint(D, nm, 1) ?? D;
    const fit = fitLines(pointValues(readPoints(D)))!;
    expect(Math.abs(fit.slope - H_OVER_E) / H_OVER_E).toBeLessThan(1e-9);
    expect(Math.abs(fit.intercept[1] + 2.28)).toBeLessThan(1e-9);
    expect(fit.fitted.filter(Boolean).length).toBe(1);
  });

  it('no fit below two points of one metal; no point below threshold; no duplicates', () => {
    let D = emptyPoints();
    expect(fitLines(pointValues(readPoints(D)))).toBeNull();
    D = addPoint(D, 400, 1)!;
    D = addPoint(D, 300, 0)!;
    expect(fitLines(pointValues(readPoints(D)))).toBeNull();
    expect(addPoint(D, 400, 1)).toBeNull();
    expect(addPoint(D, 600, 1)).toBeNull();
    D = addPoint(D, 350, 1)!;
    expect(fitLines(pointValues(readPoints(D)))).not.toBeNull();
  });

  it('stores at most MAX_POINTS, dropping the oldest; fixed length for the URL', () => {
    let D = emptyPoints();
    for (let i = 0; i < MAX_POINTS + 3; i++) D = addPoint(D, 200 + i, 0)!;
    expect(D.length).toBe(2 * MAX_POINTS);
    const pts = readPoints(D);
    expect(pts.length).toBe(MAX_POINTS);
    expect(pts[0].nm).toBe(203);
    expect(pts.at(-1)!.nm).toBe(200 + MAX_POINTS + 2);
  });
});

describe('photoelectric scene', () => {
  const base = defaults(photoelectric.params) as P;

  it('formula lines: substituted values, 4–6 lines', () => {
    const l = formulaLines(base);
    expect(l.length).toBe(4);
    expect(l[0]).toContain('3.10');
    expect(l[1]).toContain('3.10 - 2.28 = 0.82');
    expect(l[2]).toContain('0.82');
    expect(l[3]).toContain(tsci(H_OVER_E, 4));
    expect(tsci(H_OVER_E, 4)).toBe('4.136\\times10^{-15}');
    const below = formulaLines({ ...base, lam: 700 });
    expect(below[1]).toContain('K_\\text{max} = 0');
    expect(below[1]).toContain('544');
    let D = emptyPoints();
    for (const nm of [250, 350]) D = addPoint(D, nm, 1)!;
    const fitted = formulaLines({ ...base, D, classical: true });
    expect(fitted.length).toBe(6);
    expect(fitted[4]).toContain('-2.28');
    expect(fitted[5]).toContain('t_\\text{cl}');
    for (const s of [...l, ...below, ...fitted]) expect(s).not.toMatch(/NaN|undefined|Infinity|−/);
  });

  it('readouts follow the model; the I–V axis holds the saturation current', () => {
    const r = new Runner(photoelectric, base, 7);
    const ro = (label: string, p: P) => photoelectric.readouts!.find((x) => x.label === label)!.value(r.state, p);
    expect(ro('I', base)).toBeCloseTo(322.6, 1);
    expect(ro('I', { ...base, V: -0.5 })).toBeCloseTo(322.6 * (1 - 0.5 / 0.8196), 0);
    expect(ro('I', { ...base, V: -1 })).toBe(0);
    expect(ro('I', { ...base, lam: 600 })).toBe(0);
    for (const P of [0.1, 0.5, 1, 2]) {
      const top = iAxisMax(P);
      for (const nm of [180, 400, 579, 750]) for (const m of METALS) expect(iSat(P, nm, m.phi)).toBeLessThanOrEqual(top);
      expect(iSat(P, 579, 2.14) / top).toBeGreaterThan(0.6);
    }
  });

  it('no electrons are emitted below threshold; above it, electrons cross or turn back', () => {
    const below = new Runner(photoelectric, { ...base, lam: 600 }, 3);
    below.play();
    for (let i = 0; i < 600; i++) below.advance(1 / 60);
    expect(below.state.electrons.length).toBe(0);
    expect(below.state.hits.length + below.state.photons.length).toBeGreaterThan(0);
    const above = new Runner(photoelectric, { ...base, lam: 250, metal: 'Cs' }, 3);
    expect(above.state.electrons.length).toBeGreaterThan(0);
    // Retarding voltage beyond V_stop: every electron turns back before the collector.
    const stopped = new Runner(photoelectric, { ...base, V: -1, power: 2 }, 5);
    stopped.play();
    let maxX = 0;
    for (let i = 0; i < 900; i++) {
      stopped.advance(1 / 60);
      for (const e of stopped.state.electrons) maxX = Math.max(maxX, e.x);
    }
    // K ≤ 0.82 eV < 1 eV: turning point x = K/(e|V|) < 0.82.
    expect(maxX).toBeLessThan(0.82);
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
