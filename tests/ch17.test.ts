import { describe, expect, it } from 'vitest';
import { defaults } from '../src/core/params';
import { Runner } from '../src/core/runner';
import { fmt } from '../src/core/format';
import { u } from '../src/core/tex';
import { beats } from '../src/sims/ch17/beats';
import { NUM, agrees, agreesWithin, grab, val } from './sigma-digits';
import { doppler, setup } from '../src/sims/ch17/doppler';
import { arrival, arrivalAt, flashing, heardAt, beatEnvelope, beatFrequency, fronts, heard, machAngle, wave, wavelengths, type Doppler } from '../src/sims/ch17/physics';

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

  it('plots draw resolved waveforms at 20 Hz and envelope bands at 440 Hz (no solid colour block)', () => {
    // A 600 px plot showing 2 s: 20 Hz has 14 px per cycle, 440 Hz only 0.7 px.
    const draw = (f1: number) => {
      const lines: number[] = [];
      let fills = 0;
      const ctx = new Proxy({} as Record<string, unknown>, {
        get: (_t, k) => (k === 'fill' ? () => fills++ : () => {}),
        set: () => true,
      });
      const pd = {
        ctx,
        toPx: (t: number, y: number): [number, number] => [t * 300, -y * 50],
        polyline: (pts: [number, number][]) => lines.push(pts.length),
        dot: () => {},
      };
      const p = { ...defaults(beats.params), f1, df: 1 };
      for (const id of ['y1', 'y2', 'y']) beats.drawPlot!(id, pd as never, p, { t: 2, cursorT: 2, scrubbing: false, lecture: false });
      return { lines, fills };
    };
    const lo = draw(20);
    expect(lo.fills).toBe(0);
    expect(Math.max(...lo.lines)).toBeGreaterThan(900);
    const hi = draw(440);
    expect(hi.fills).toBe(3);
    expect(Math.max(...hi.lines)).toBeLessThanOrEqual(401);
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

describe('ch17 Doppler: readouts and flashes agree with the arriving fronts', () => {
  const P = (vs: number) => ({ ...defaults(doppler.params), who: 'source', vs }) as { who: string; vs: number; vo: number };
  const ro = (p: ReturnType<typeof P>, t: number) => doppler.readouts!.map((r) => r.value({ t }, p));
  /** Arrivals at observer w in [t0, t1]. */
  const arrivals = (p: ReturnType<typeof P>, w: 'A' | 'B', t0: number, t1: number) => {
    const d = setup(p).d;
    return fronts(d, t1).map((f) => arrivalAt(d, f.te, w)).filter((x) => x >= t0 && x <= t1).length;
  };

  it('510 m/s: B hears 40 Hz and 200 Hz at once; the flash rate is their sum, not 40 Hz alone', () => {
    const p = P(510);
    const { run } = setup(p);
    const [fA, fB, fB2] = ro(p, run / 2);
    expect(Number.isNaN(fA)).toBe(true);
    expect(fB).toBeCloseTo(40, 9);
    expect(fB2).toBeCloseTo(200, 9);
    // Fronts arriving at B per second over the second half of the run.
    const rate = arrivals(p, 'B', run / 2, run) / (run / 2);
    expect(Math.abs(rate - (fB + fB2)) / (fB + fB2)).toBeLessThan(0.15);
  });

  it('below the speed of sound A hears the source from the start of the run (readout and flashes)', () => {
    for (let vs = 0; vs <= 330; vs += 10) {
      const p = P(vs);
      const { d, run } = setup(p);
      const fA = ro(p, 0)[0];
      expect(fA, `vs = ${vs}`).toBeCloseTo(heard(d).A, 9);
      // Fronts reach A all through the run, at the heard frequency.
      const n = arrivals(p, 'A', 0, run);
      expect(Math.abs(n - fA * run), `vs = ${vs}`).toBeLessThanOrEqual(1.5);
    }
  });

  it('a readout is empty until the first front of its branch has arrived', () => {
    // Before the run's sound reaches A (emission started at −tPre): no value.
    const p = P(170);
    const d = { ...setup(p).d, tPre: 0.01 };
    expect(Number.isNaN(heardAt(d, 0).A)).toBe(true);
    expect(heardAt(d, 0.2).A).toBeCloseTo(200, 9);
    // Subsonic: no second sound at B.
    expect(Number.isNaN(ro(p, 0.1)[2])).toBe(true);
  });

  it('flashes stay apart at 1× and 60 frames per second: one flash per arriving front, at every source speed', () => {
    for (let vs = 0; vs <= 510; vs += 10) {
      const p = P(vs);
      const { d, run, scale } = setup(p);
      const dt = scale / 60;
      for (const w of ['A', 'B'] as const) {
        let on = 0;
        let prev = false;
        for (let t = 0; t <= run; t += dt) {
          const f = flashing(d, w, t);
          if (f && !prev) on++;
          prev = f;
        }
        const n = arrivals(p, w, 0, run);
        // Two branches at B can coincide now and then (above the speed of sound).
        const tol = w === 'B' && vs > 340 ? Math.max(2, 0.2 * n) : 1;
        expect(Math.abs(on - n), `vs = ${vs}, ${w}: ${on} flashes, ${n} fronts`).toBeLessThanOrEqual(tol);
      }
      // One run lasts at most 12 s at 1×.
      expect(run / scale).toBeLessThanOrEqual(12 + 1e-9);
    }
  });
});

// Review 2026-11-20 P2: 440 + 1.5 printed "442 Hz" (3 figures) next to f_beat = 1.50 Hz.
describe('ch17 beats: f₂ and every Σ line reproduce from what is printed', () => {
  const sigma = (p: Record<string, unknown>, steps: number) => {
    const r = new Runner(beats, { ...(defaults(beats.params) as object), ...p } as never, 1);
    r.play();
    for (let i = 0; i < steps && r.playing; i++) r.advance(beats.time!.h);
    const lines = beats.formula!(r.state as never, r.params as never);
    const ro = beats.readouts!.map((x) => x.format?.(x.value(r.state as never, r.params as never)) ?? fmt(x.value(r.state as never, r.params as never), x.sig ?? 3));
    return { lines, ro, t: r.state.t, p: r.params as { f1: number; df: number } };
  };

  it('regression: f₁ = 440 Hz, Δf = 1.5 Hz shows f₂ = 441.5 Hz (Σ and readout), mean 440.75 Hz', () => {
    const { lines, ro } = sigma({ f1: 440, df: 1.5 }, 0);
    expect(lines[0]).toBe(`f_2 = 440 + 1.5 = 441.5${u('Hz')}`);
    expect(lines[1]).toContain('\\lvert 440 - 441.5 \\rvert = 1.50');
    expect(lines[3]).toBe(`\\tfrac{f_1 + f_2}{2} = (440 + 441.5)/2 = 440.75${u('Hz')}`);
    expect(ro[0]).toBe('441.5');
    expect(ro[1]).toBe('1.50');
    expect(lines.join(' ')).not.toContain('442');
  });

  it('sweep: f₁ 20–440 Hz × Δf 1–4 Hz, at the start and mid-run: each line agrees with its printed inputs', () => {
    const bad: string[] = [];
    for (const f1 of [20, 21, 137, 230, 439, 440])
      for (const df of [1, 1.1, 1.3, 1.5, 2, 2.7, 3.9, 4])
        for (const steps of [0, 37, 1111, 2 * 4440 + 5]) {
          const { lines, ro, t, p } = sigma({ f1, df }, steps);
          const tag = `f1=${f1} df=${df} t=${t.toFixed(4)}`;
          const [a, b, f2] = grab(lines[0], new RegExp(`= (${NUM}) \\+ (${NUM}) = (${NUM})`));
          if (val(f2) !== val(a) + val(b) && Math.abs(val(f2) - (val(a) + val(b))) > 1e-9) bad.push(`${tag}: ${lines[0]}`);
          if (ro[0] !== f2) bad.push(`${tag}: readout f2 ${ro[0]} vs ${f2}`);
          const [x1, x2, fb] = grab(lines[1], new RegExp(`\\\\lvert (${NUM}) - (${NUM}) \\\\rvert = (${NUM})`));
          if (!agrees(Math.abs(val(x1) - val(x2)), fb) || x2 !== f2) bad.push(`${tag}: ${lines[1]}`);
          if (ro[1] !== fb) bad.push(`${tag}: readout f_beat ${ro[1]} vs ${fb}`);
          const [fbIn, Tb] = grab(lines[2], new RegExp(`= 1/(${NUM}) = (${NUM})`));
          if (!agrees(1 / val(fbIn), Tb)) bad.push(`${tag}: ${lines[2]}`);
          const [m1, m2, mean] = grab(lines[3], new RegExp(`\\((${NUM}) \\+ (${NUM})\\)/2 = (${NUM})`));
          if (!agrees((val(m1) + val(m2)) / 2, mean) || Math.abs(val(mean) - (p.f1 + p.f1 + p.df) / 2) > 1e-9) bad.push(`${tag}: ${lines[3]}`);
          const [dfIn, tIn, env] = grab(lines[5], new RegExp(`\\\\pi \\\\times (${NUM}) \\\\times (${NUM})\\) \\\\rvert = (${NUM})A`));
          // Near a node the envelope is a small difference (R5): allow the rounding of the 3-figure t.
          if (!agreesWithin((d, tt) => 2 * Math.abs(Math.cos(Math.PI * d * tt)), [dfIn, tIn], env, [0])) bad.push(`${tag}: ${lines[5]}`);
        }
    expect(bad).toEqual([]);
  });

  it('the sound toggle (live) changes no number', () => {
    const a = sigma({ f1: 440, df: 1.5, sound: false }, 500);
    const b = sigma({ f1: 440, df: 1.5, sound: true }, 500);
    expect(b.lines).toEqual(a.lines);
    expect(b.ro).toEqual(a.ro);
  });
});
