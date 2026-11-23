import { describe, expect, it } from 'vitest';
import { fmt, niceTicks } from '../src/core/format';
import { History } from '../src/core/history';
import { LOG_STEPS, decode, encode, fromQuery, logIndex, logStops, logValue, snapNumber, snapStep, toQuery } from '../src/core/params';
import type { NumberParam } from '../src/core/types';
import { Rng } from '../src/core/rng';
import { parseHash } from '../src/core/url';
import { kinematics } from '../src/sims/ch02/scene';

describe('fmt', () => {
  it('keeps significant figures and uses a true minus sign', () => {
    expect(fmt(1.5)).toBe('1.50');
    expect(fmt(-2)).toBe('−2.00');
    expect(fmt(21)).toBe('21.0');
    expect(fmt(0)).toBe('0.00');
  });
  it('prints floating-point noise as zero', () => {
    expect(fmt(3e-16)).toBe('0.00');
    expect(fmt(-1e-12)).toBe('0.00');
  });
  it('uses ×10ⁿ for extremes', () => {
    expect(fmt(6.626e-34, 3, 0)).toBe('6.63×10⁻³⁴');
    expect(fmt(299792458)).toBe('3.00×10⁸');
  });
});

describe('niceTicks', () => {
  it('returns 1-2-5 steps covering the range', () => {
    expect(niceTicks(0, 10, 5)).toEqual([0, 2, 4, 6, 8, 10]);
    expect(niceTicks(-1.2, 1.2, 3)).toEqual([-1, 0, 1]);
  });
});

describe('History', () => {
  it('finds the nearest sample in time', () => {
    const hst = new History<number>();
    for (let i = 0; i <= 10; i++) hst.push({ t: i * 0.1 }, i);
    expect(hst.indexAtTime(0.34)).toBe(3);
    expect(hst.indexAtTime(0.36)).toBe(4);
    expect(hst.indexAtTime(-1)).toBe(0);
    expect(hst.indexAtTime(9)).toBe(10);
  });
  it('decimates when full but keeps first and last samples aligned with snapshots', () => {
    const hst = new History<number>(100);
    for (let i = 0; i <= 250; i++) hst.push({ t: i, y: 2 * i }, i);
    const ts = hst.col('t');
    expect(hst.length).toBeLessThanOrEqual(100);
    expect(ts[0]).toBe(0);
    expect(ts[ts.length - 1]).toBe(250);
    for (let i = 0; i < hst.length; i++) {
      expect(hst.col('y')[i]).toBe(2 * ts[i]);
      expect(hst.snap(i)).toBe(ts[i]);
    }
  });
});

describe('params ↔ URL', () => {
  it('round-trips only non-default values and rejects invalid ones', () => {
    const q = new URLSearchParams('motion=reverse&mode=bogus&custom=2,0,-1,-1,0.5&v0=7');
    const p = fromQuery(kinematics.params, q);
    expect(p.motion).toBe('reverse');
    expect(p.mode).toBe('slope');
    expect(p.custom).toEqual([2, 0, -1, -1, 0.5]);
    expect(p.v0).toBe(0);
    expect(toQuery(kinematics.params, p)).toEqual({ motion: 'reverse', custom: '2,0,-1,-1,0.5' });
  });
  it('rejects arrays of the wrong length or out of range', () => {
    expect(decode(kinematics.params.custom, '1,2')).toBeUndefined();
    expect(decode(kinematics.params.custom, '9,0,0,0,0')).toBeUndefined();
  });
});

describe('URL numbers on the control grid (review 2026-11-20: nClosed=2 gave an even mode)', () => {
  const num = (o: Partial<NumberParam>): NumberParam => ({ kind: 'number', label: 'x', group: 'main', live: true, control: 'slider', default: 0, ...o });

  it('snapStep: min + k·step for several steps, a negative min, no float noise', () => {
    expect(snapStep(2, 1, 2)).toBe(3);
    expect(snapStep(4.9, 1, 2)).toBe(5);
    expect(snapStep(7, 0, 5)).toBe(5);
    expect(snapStep(8, 0, 5)).toBe(10);
    expect(snapStep(-1.26, -2, 0.1)).toBe(-1.3);
    expect(snapStep(0.17, -5, 0.05)).toBe(0.15);
    expect(snapStep(0.3, 0, 0.1)).toBe(0.3);
    // 0.05·k is 0.15000000000000002 for k = 3 in floats; the snap prints clean decimals.
    for (let k = 0; k <= 160; k++) {
      const v = snapStep(-5 + k * 0.05 + 0.01, -5, 0.05);
      expect(String(v)).toMatch(/^-?\d+(\.\d{1,2})?$/);
      expect(v).toBeCloseTo(-5 + k * 0.05, 12);
    }
  });

  it('snapNumber stays in [min, max] when max is off the grid', () => {
    const sp = num({ control: 'stepper', min: 1, max: 14, step: 2 });
    expect(snapNumber(sp, 14)).toBe(13);
    expect(snapNumber(sp, 1)).toBe(1);
  });

  it('stepper and whole-step slider: URL values snap to min + k·step', () => {
    const odd = num({ control: 'stepper', min: 1, max: 15, step: 2, default: 1 });
    expect([2, 4, 6, 14].map((v) => decode(odd, String(v)))).toEqual([3, 5, 7, 15]);
    expect([1, 3, 15].map((v) => decode(odd, String(v)))).toEqual([1, 3, 15]);
    const neg = num({ control: 'slider', min: -40, max: 40, step: 5 });
    expect(decode(neg, '-12')).toBe(-10);
    expect(decode(neg, '-13')).toBe(-15);
    expect(decode(neg, '37.4')).toBe(35);
    const count = num({ control: 'slider', min: 20, max: 1000, step: 10 });
    expect(decode(count, '25.5')).toBe(30);
    const step005 = num({ control: 'stepper', min: -5, max: 3, step: 0.05 });
    expect(decode(step005, '0.17')).toBe(0.15);
    expect(decode(step005, '-1.26')).toBe(-1.25);
  });

  it('fractional-step slider keeps the URL value (handles set values between its points, θc in Ch 33)', () => {
    const sp = num({ min: 0, max: 89, step: 0.1 });
    expect(decode(sp, '41.810314895778596')).toBe(41.810314895778596);
    expect(decode(sp, '30')).toBe(30);
  });

  it('log slider: a mark as it is, any other value at `sig` figures', () => {
    const sp = num({ log: true, sig: 3, min: 500, max: 15000, marks: [1025, 13600] });
    expect(decode(sp, '1025')).toBe(1025);
    expect(decode(sp, '13600')).toBe(13600);
    expect(decode(sp, '1024.7')).toBe(1020);
    expect(decode(sp, '917.3')).toBe(917);
    expect(decode(sp, '14999.9')).toBe(15000);
  });

  it('out of range, NaN and garbage are ignored (default kept)', () => {
    const sp = num({ control: 'stepper', min: 1, max: 15, step: 2 });
    for (const s of ['0', '16', '-3', '1e9', 'NaN', 'Infinity', '-Infinity', 'abc', '3abc', '', ' ', '2,3']) expect(decode(sp, s)).toBeUndefined();
    const schema = { n: { ...sp, default: 1 } };
    expect(fromQuery(schema, new URLSearchParams('n=abc')).n).toBe(1);
    expect(fromQuery(schema, new URLSearchParams('n=')).n).toBe(1);
    expect(fromQuery(schema, new URLSearchParams('n=2')).n).toBe(3);
  });

  it('values set by the controls round-trip through the URL unchanged', () => {
    const odd = num({ control: 'stepper', min: 1, max: 15, step: 2 });
    for (let v = 1; v <= 15; v += 2) expect(decode(odd, encode(v))).toBe(v);
    const fine = num({ control: 'slider', min: -5, max: 3, step: 0.05 });
    for (let k = 0; k <= 160; k++) {
      const v = snapStep(-5 + k * 0.05, -5, 0.05);
      expect(decode(fine, encode(v))).toBe(v);
    }
    const lg = num({ log: true, sig: 3, min: 50, max: 20000, marks: [240, 600, 917, 2700, 7870] });
    for (const v of logStops(lg)) expect(decode(lg, encode(v))).toBe(v);
  });
});

describe('log slider track', () => {
  const num = (o: Partial<NumberParam>): NumberParam => ({ kind: 'number', label: 'x', group: 'main', live: true, control: 'slider', log: true, default: 1, ...o });

  it('without marks: the old grid, 10^x rounded to `sig` figures', () => {
    for (const [min, max, sig] of [
      [50, 20000, 3],
      [0.01, 10, 3],
      [0.2, 2, 2],
      [1e13, 1e18, 2],
    ]) {
      const sp = num({ min, max, sig });
      const lo = Math.log10(min);
      const st = (Math.log10(max) - lo) / LOG_STEPS;
      for (let k = 0; k <= LOG_STEPS; k++) {
        const x = lo + k * st;
        expect(logValue(sp, x)).toBe(Math.min(max, Math.max(min, Number((10 ** x).toPrecision(sig)))));
      }
    }
  });

  it('marks replace the nearest track point; ends and order kept', () => {
    const marks = [240, 600, 917, 2700, 7870];
    const sp = num({ min: 50, max: 20000, sig: 3, marks });
    const stops = logStops(sp);
    expect(stops).toHaveLength(LOG_STEPS + 1);
    for (const m of marks) expect(stops).toContain(m);
    expect(stops[0]).toBe(50);
    expect(stops[LOG_STEPS]).toBe(20000);
    for (let k = 1; k <= LOG_STEPS; k++) expect(stops[k]).toBeGreaterThanOrEqual(stops[k - 1]);
    // The slider position of a mark (the browser puts the thumb on the nearest step) gives the mark.
    for (const m of marks) expect(logValue(sp, Math.log10(m))).toBe(m);
    // The thumb of any slider value sits on a position that gives that value back; ends included.
    for (const v of stops) expect(stops[logIndex(sp, v)]).toBe(v);
    expect(logIndex(sp, 20000)).toBe(LOG_STEPS);
    expect(logIndex(sp, 50)).toBe(0);
  });
});

describe('routing and rng', () => {
  it('parses chapter routes', () => {
    const r = parseHash('#/ch/02?lang=en&motion=accel');
    expect(r.page).toBe('chapter');
    if (r.page === 'chapter') {
      expect(r.ch).toBe(2);
      expect(r.query.get('motion')).toBe('accel');
    }
    expect(parseHash('#/').page).toBe('home');
    expect(parseHash('').page).toBe('home');
  });
  it('is reproducible for a fixed seed', () => {
    const a = new Rng(42);
    const b = new Rng(42);
    for (let i = 0; i < 5; i++) expect(a.next()).toBe(b.next());
  });
});
