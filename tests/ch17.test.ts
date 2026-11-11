import { describe, expect, it } from 'vitest';
import { defaults } from '../src/core/params';
import { Runner } from '../src/core/runner';
import { beats } from '../src/sims/ch17/beats';
import { doppler } from '../src/sims/ch17/doppler';
import { arrival, beatEnvelope, beatFrequency, fronts, heard, machAngle, wave, wavelengths, type Doppler } from '../src/sims/ch17/physics';

describe('ch17 beats', () => {
  it('y1 + y2 = 2A cos(πΔf t) cos(2π f̄ t); envelope bounds the sum and touches it', () => {
    const f1 = 20;
    const f2 = 22;
    for (const t of [0, 0.013, 0.1, 0.25, 0.377]) {
      const y = wave(1, f1, t) + wave(1, f2, t);
      expect(y).toBeCloseTo(2 * Math.cos(Math.PI * (f2 - f1) * t) * Math.cos(Math.PI * (f1 + f2) * t), 12);
      expect(Math.abs(y)).toBeLessThanOrEqual(beatEnvelope(1, f1, f2, t) + 1e-12);
    }
    // envelope is 0 at half a beat period, 2A at a full one
    expect(beatEnvelope(1, f1, f2, 0.25)).toBeCloseTo(0, 12);
    expect(beatEnvelope(1, f1, f2, 0.5)).toBeCloseTo(2, 12);
    expect(beatFrequency(440, 444)).toBe(4);
    expect(beatFrequency(444, 440)).toBe(4);
  });

  it('scene runs exactly two beat periods and records the sum', () => {
    const p = defaults(beats.params);
    const r = new Runner(beats, p);
    r.play();
    for (let i = 0; i < 100 && r.playing; i++) r.advance(1);
    expect(r.state.t).toBeCloseTo(2 / p.df, 3);
    const y = r.hist.col('y');
    expect(Math.max(...y)).toBeGreaterThan(1.99);
    expect(r.hist.length).toBeLessThan(10000);
  });
});

describe('ch17 Doppler', () => {
  const base: Doppler = { v: 340, f: 100, vs: 170, xs0: -24, vo: 0, xA0: 34, xB0: -34, tPre: 0.25 };

  it('moving source: f v/(v − v_s) ahead, f v/(v + v_s) behind; matches the arrival times of fronts', () => {
    const h = heard(base);
    expect(h.A).toBeCloseTo(200, 12);
    expect(h.B).toBeCloseTo(100 * (340 / 510), 12);
    // successive fronts arrive at a static observer 1/f' apart
    const dtA = arrival(base, 0.01, 34) - arrival(base, 0, 34);
    const dtB = arrival(base, 0.01, -34) - arrival(base, 0, -34);
    expect(1 / dtA).toBeCloseTo(h.A, 9);
    expect(1 / dtB).toBeCloseTo(h.B, 9);
    expect(wavelengths(base).ahead).toBeCloseTo(1.7, 12);
    expect(wavelengths(base).behind).toBeCloseTo(5.1, 12);
  });

  it('moving observers: f (v + v_D)/v approaching, f (v − v_D)/v receding', () => {
    const d: Doppler = { ...base, vs: 0, xs0: 0, vo: 170 };
    expect(heard(d).A).toBeCloseTo(150, 12);
    expect(heard(d).B).toBeCloseTo(50, 12);
  });

  it('fronts: one per period, centred where the source was, radius v (t − t_e)', () => {
    const fr = fronts(base, 0.1);
    expect(fr.length).toBe(Math.floor(0.25 * 100) + Math.floor(0.1 * 100) + 1);
    const last = fr[fr.length - 1];
    expect(last.te).toBeCloseTo(0.1, 12);
    expect(last.r).toBeCloseTo(0, 12);
    const k = fr.find((q) => Math.abs(q.te - 0.05) < 1e-9)!;
    expect(k.cx).toBeCloseTo(-24 + 170 * 0.05, 12);
    expect(k.r).toBeCloseTo(340 * 0.05, 12);
  });

  it('Mach cone only above the speed of sound: sin θ = v / v_s; every front touches the cone', () => {
    expect(Number.isNaN(machAngle(base))).toBe(true);
    expect(Number.isNaN(heard({ ...base, vs: 340 }).A)).toBe(true);
    const d: Doppler = { ...base, vs: 510 };
    const th = machAngle(d);
    expect(Math.sin(th)).toBeCloseTo(2 / 3, 12);
    const t = 0.05;
    const xs = -24 + 510 * t;
    for (const fr of fronts(d, t)) {
      // distance from the centre to the cone line equals the radius
      expect((xs - fr.cx) * Math.sin(th)).toBeCloseTo(fr.r, 9);
    }
  });
});

describe('ch17 Doppler scene over the slider ranges', () => {
  it('every run ends within 0.3 s', () => {
    const base = defaults(doppler.params);
    const r = new Runner(doppler, base);
    for (const vs of [0, 10, 170, 330, 340, 510]) {
      r.setParams({ ...base, who: 'source', vs });
      expect(r.tEnd!).toBeGreaterThan(0);
      expect(r.tEnd!).toBeLessThanOrEqual(0.3 + 1e-12);
    }
    for (const vo of [0, 5, 85, 255]) {
      r.setParams({ ...base, who: 'observer', vo });
      expect(r.tEnd!).toBeGreaterThan(0);
      expect(r.tEnd!).toBeLessThanOrEqual(0.3 + 1e-12);
    }
  });
});
