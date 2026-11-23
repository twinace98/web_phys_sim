import { describe, expect, it } from 'vitest';
import { KAPPA } from '../src/sims/ch25/physics';
import { capCounts, refState, stateOf } from '../src/sims/ch25/scene';
import ko from '../src/sims/ch25/i18n.ko.json';
import en from '../src/sims/ch25/i18n.en.json';

const base = { dielectric: 'air', source: 'on', A: 100, d: 1 };
const shown = (c: ReturnType<typeof capCounts>) => c.free * c.unit;
/** Drawn field strength: line count, or the fractional short arrow below one line. */
const drawnE = (c: ReturnType<typeof capCounts>) => (c.rawLines >= 0.5 ? c.lines : c.rawLines);

describe('ch25 drawn charges and field lines follow the readouts', () => {
  it('connected water: E/E0 = 1, so as many field lines as air; free charge about 80 times', () => {
    for (const maxN of [8, 13, 26]) {
      const air = capCounts(base, maxN, maxN);
      const water = capCounts({ ...base, dielectric: 'water' }, maxN, maxN);
      expect(air.lines).toBe(5);
      expect(water.lines).toBe(air.lines);
      expect(shown(water) / shown(air)).toBeGreaterThan(60);
      expect(shown(water) / shown(air)).toBeLessThan(100);
      // Induced charge cancels 1 − 1/κ ≈ 98.8 % of the free charge.
      expect(water.bound / water.free).toBeGreaterThan(0.9);
    }
  });

  it('d = 0.5 doubles E and doubles the field lines', () => {
    const a = capCounts({ ...base, dielectric: 'glass' }, 26, 30);
    const b = capCounts({ ...base, dielectric: 'glass', d: 0.5 }, 26, 30);
    expect(b.lines).toBe(2 * a.lines);
    expect(stateOf({ ...base, dielectric: 'glass', d: 0.5 }).E / refState().E).toBeCloseTo(2, 10);
  });

  it('every case: caps hold, bound fraction 1 − 1/κ, lines monotonic in E, charge in σ', () => {
    const cases: (typeof base)[] = [];
    for (const dielectric of Object.keys(KAPPA))
      for (const source of ['on', 'off'])
        for (const A of [50, 100, 200]) for (const d of [0.5, 1, 2]) cases.push({ dielectric, source, A, d });
    for (const maxN of [8, 26]) {
      const rows = cases.map((p) => ({ p, s: stateOf(p), c: capCounts(p, maxN, maxN) }));
      for (const r of rows) {
        expect(r.c.free).toBeLessThanOrEqual(maxN);
        expect(r.c.lines).toBeLessThanOrEqual(maxN);
        expect(r.c.bound).toBeLessThanOrEqual(r.c.free);
        const k = KAPPA[r.p.dielectric];
        if (r.p.dielectric !== 'air') expect(Math.abs(r.c.bound / r.c.free - (1 - 1 / k))).toBeLessThan(0.21);
        // Gauss in unscaled units: field lines = free charge / κ.
        expect(r.c.rawLines).toBeCloseTo(r.c.rawFree / k, 9);
      }
      for (const a of rows)
        for (const b of rows) {
          // Drawn quantities are per cross-section of width ∝ √A.
          if (a.s.E * Math.sqrt(a.p.A) > b.s.E * Math.sqrt(b.p.A) * 1.0001) expect(drawnE(a.c)).toBeGreaterThanOrEqual(drawnE(b.c));
          if (a.s.sigma * Math.sqrt(a.p.A) > b.s.sigma * Math.sqrt(b.p.A) * 1.0001) expect(shown(a.c)).toBeGreaterThanOrEqual(shown(b.c) * 0.75);
        }
    }
  });
});

describe('ch25 ⓘ on induced charge holds in both battery states (review 2026-11-20)', () => {
  it('default (glass, connected): as many field lines as air (5), the plate charge κ times larger', () => {
    for (const maxN of [8, 26]) {
      const air = capCounts(base, maxN, maxN);
      const glass = capCounts({ ...base, dielectric: 'glass' }, maxN, maxN);
      expect(air.lines).toBe(5);
      expect(glass.lines).toBe(5);
      expect(glass.rawFree / air.rawFree).toBeCloseTo(KAPPA.glass / KAPPA.air, 9);
    }
  });

  it('every dielectric, A, d: connected keeps E and the lines of air; disconnected divides E by κ and draws fewer lines', () => {
    for (const dielectric of ['paper', 'glass', 'water'])
      for (const A of [50, 120, 200])
        for (const d of [0.5, 1.3, 2])
          for (const maxN of [8, 26]) {
            const p = { ...base, dielectric, A, d };
            const on = capCounts({ ...p, source: 'on' }, maxN, maxN);
            const onAir = capCounts({ ...p, dielectric: 'air', source: 'on' }, maxN, maxN);
            expect(stateOf({ ...p, source: 'on' }).E).toBeCloseTo(stateOf({ ...p, dielectric: 'air', source: 'on' }).E, 6);
            expect(on.lines).toBe(onAir.lines);
            const off = capCounts({ ...p, source: 'off' }, maxN, maxN);
            const offAir = capCounts({ ...p, dielectric: 'air', source: 'off' }, maxN, maxN);
            const k = KAPPA[dielectric] / KAPPA.air;
            expect(stateOf({ ...p, source: 'off' }).E / stateOf({ ...p, dielectric: 'air', source: 'off' }).E).toBeCloseTo(1 / k, 9);
            expect(drawnE(off)).toBeLessThan(drawnE(offAir));
          }
  });

  it('the sentence states both cases (it said only "fewer field lines"), in ko and en', () => {
    expect(ko['ch25.obs.gauss']).toContain('전원 연결');
    expect(ko['ch25.obs.gauss']).toContain('전원 분리');
    expect(ko['ch25.obs.gauss']).toContain('전기력선 수 그대로');
    expect(en['ch25.obs.gauss']).toContain('Connected');
    expect(en['ch25.obs.gauss']).toContain('Disconnected');
    expect(en['ch25.obs.gauss']).toContain('stay the same');
  });
});
