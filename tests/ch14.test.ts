import { describe, expect, it } from 'vitest';
import { defaults } from '../src/core/params';
import { G, RHO, TravelTime, areaAt, inletHead, speedAt, taps, type Venturi } from '../src/sims/ch14/physics';
import { venturi } from '../src/sims/ch14/scene';
import { offStage, probe, type Mark, type ProbeDraw } from './stage-probe';

const tube = (ratio: number, Q = 0.01, dy = 0): Venturi => ({ A1: 0.01, ratio, Q, dy });

describe('ch14 Venturi tube', () => {
  it('continuity: A v = Q everywhere; throat speed is v1 / ratio', () => {
    const v = tube(0.4, 0.015);
    for (const x of [0, 0.3, 0.55, 0.8, 1.05, 1.6]) expect(areaAt(v, x) * speedAt(v, x)).toBeCloseTo(0.015, 14);
    const [a, b, c] = taps(v);
    expect(b.v / a.v).toBeCloseTo(1 / 0.4, 12);
    expect(c.v).toBeCloseTo(a.v, 12);
    expect(b.A / a.A).toBeCloseTo(0.4, 12);
  });

  it('Bernoulli: p + ½ρv² + ρgy is the same at all taps; p1 − p2 = ½ρ(v2² − v1²) when level', () => {
    for (const dy of [0, 0.1, 0.2]) {
      const tp = taps(tube(0.5, 0.01, dy));
      for (const q of tp) expect(q.sum).toBeCloseTo(tp[0].sum, 9);
    }
    const [a, b] = taps(tube(0.5));
    expect(a.p - b.p).toBeCloseTo(0.5 * RHO * (b.v ** 2 - a.v ** 2), 9);
    expect(a.v).toBeCloseTo(1, 12);
    expect(a.p - b.p).toBeCloseTo(1500, 9);
  });

  it('regression: the height difference is the one between sections 1 and 3, p1 − p3 = ρg Δy', () => {
    // Before: Δy was set over the whole tube, so 20 cm gave 14.4 cm between the standpipes.
    const [a, , c] = taps(tube(0.7, 0.01, 0.2));
    expect(c.y - a.y).toBeCloseTo(0.2, 12);
    expect(a.p - c.p).toBeCloseTo(RHO * G * 0.2, 9);
  });

  it('every standpipe column stands at least 5 cm above the axis', () => {
    // the whole slider ranges: ratio 0.4–1 (0.05), Q 5–15 L/s (0.5), dy 0–20 cm
    for (let ratio = 0.4; ratio <= 1 + 1e-9; ratio += 0.05)
      for (let Q = 0.005; Q <= 0.015 + 1e-9; Q += 0.0005)
        for (const dy of [0, 0.05, 0.13, 0.2]) {
          const v = tube(ratio, Q, dy);
          for (const q of taps(v)) expect(q.p / (RHO * G)).toBeGreaterThan(0.05 - 1e-9);
          expect(inletHead(v)).toBeLessThanOrEqual(1);
        }
  });

  it('travel time: uniform pipe gives L / v; tracer spacing in the throat grows by 1 / ratio', () => {
    const u = new TravelTime(tube(1));
    expect(u.total).toBeCloseTo(1.6 / 1, 9);
    expect(u.xAt(0.5)).toBeCloseTo(0.5, 9);
    const v = tube(0.5);
    const tt = new TravelTime(v);
    const dt = 0.08; // v1 = 1 m/s → 8 cm apart in the wide part
    const t0 = tt.ts[tt.xs.findIndex((x) => x >= 0.8)];
    expect(tt.xAt(t0) - tt.xAt(t0 - dt)).toBeCloseTo(0.16, 3);
    expect(Number.isNaN(tt.xAt(-0.1))).toBe(true);
  });
});

describe('ch14 stage: ½ρv² + ρgh above the pipes, A / v / Av table below (user request 2026-11-19)', () => {
  const texts = (g: ProbeDraw) => g.marks.filter((m) => m.kind === 'text');
  const boxOverlap = (a: Mark, b: Mark) => Math.abs(a.y - b.y) < 12 && a.x < b.x + b.w && b.x < a.x + a.w;
  it('every stack ends on one head line; the labels read ½ρv² + ρgh = the same sum at all three pipes', () => {
    for (const ratio of [0.4, 0.7, 1])
      for (const Q of [5, 10, 15])
        for (const dy of [0, 10, 20]) {
          const tp = taps(tube(ratio, Q / 1000, dy / 100));
          const y1 = tp[0].level - tp[0].p / (RHO * G); // inlet axis
          const heads = tp.map((q) => q.level + q.v ** 2 / (2 * G));
          for (const h of heads) expect(h).toBeCloseTo(heads[0], 9);
          for (const q of tp) expect(q.dyn + RHO * G * (q.level - y1)).toBeCloseTo(tp[0].sum, 6);
        }
  });

  it('three table rows and two term labels per pipe; no text overlaps or leaves the stage', () => {
    const base = defaults(venturi.params);
    for (const [w, h] of [
      [1280, 704],
      [390, 600],
    ])
      for (const ratio of [0.4, 0.75, 1])
        for (const Q of [5, 10, 15])
          for (const dy of [0, 20]) {
            const p = { ...base, ratio, Q, dy };
            const g = probe(venturi, { t: 0.5 }, p, w, h);
            const ts = texts(g);
            expect(ts.filter((m) => m.text?.startsWith('½*ρv*')).length).toBe(3);
            expect(ts.filter((m) => m.text?.startsWith('*ρgh*')).length).toBe(3);
            expect(ts.some((m) => m.text?.includes('*p*'))).toBe(false);
            // Row names (key or translated text, depending on whether strings are loaded).
            for (const [k, sym] of [['ch14.row.A', '*A*'], ['ch14.row.v', '*v*'], ['ch14.row.Q', '*Av*']]) expect(ts.some((m) => m.text === k || m.text?.endsWith(sym))).toBe(true);
            for (let i = 0; i < ts.length; i++)
              for (let j = i + 1; j < ts.length; j++) expect(boxOverlap(ts[i], ts[j]), `${ts[i].text} / ${ts[j].text} at ${w} ${ratio} ${Q} ${dy}`).toBe(false);
            expect(offStage(g)).toEqual([]);
          }
  });
});
