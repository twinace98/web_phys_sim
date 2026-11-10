import { describe, expect, it } from 'vitest';
import { fmt, niceTicks } from '../src/core/format';
import { History } from '../src/core/history';
import { decode, fromQuery, toQuery } from '../src/core/params';
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
