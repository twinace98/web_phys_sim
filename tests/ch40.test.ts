import { describe, expect, it } from 'vitest';
import { defaults, fromQuery } from '../src/core/params';
import { Rng } from '../src/core/rng';
import { Runner } from '../src/core/runner';
import { DEG, chainProbs, probUp, runChain } from '../src/sims/ch40/physics';
import { angle, angleDevices, devicesOf, sequential, single } from '../src/sims/ch40/scene';

describe('ch40 spin-½ measurement', () => {
  it('P(+θ | +z) = cos²(θ/2)', () => {
    expect(probUp(0, 0)).toBeCloseTo(1, 12);
    expect(probUp(90 * DEG, 0)).toBeCloseTo(0.5, 12);
    expect(probUp(180 * DEG, 0)).toBeCloseTo(0, 12);
    expect(probUp(60 * DEG, 0)).toBeCloseTo(0.75, 12);
    // A −z state (α = π) is + along −z.
    expect(probUp(180 * DEG, 180 * DEG)).toBeCloseTo(1, 12);
  });

  it('chain predictions: z → x → z gives ½ for either x exit (information erased)', () => {
    const fr = (pass: string) => {
      const [a, b] = chainProbs(devicesOf(pass));
      return a / (a + b);
    };
    expect(devicesOf('+').map((d) => d.theta / DEG)).toEqual([0, 90, 0]);
    expect(fr('+')).toBeCloseTo(0.5, 12);
    expect(fr('-')).toBeCloseTo(0.5, 12);
    // Fraction of all atoms reaching the last device of z → x → z: ½ · ½.
    const [a, b] = chainProbs(devicesOf('+'));
    expect(a + b).toBeCloseTo(0.25, 12);
    // The removed z → z and z → x arrangements are θ = 0° and 90° of the angle tab.
    const ang = (theta: number) => {
      const [u, d] = chainProbs(angleDevices(theta));
      return u / (u + d);
    };
    expect(ang(0)).toBeCloseTo(1, 12);
    expect(ang(90)).toBeCloseTo(0.5, 12);
  });

  it('old share links: a removed arrangement is ignored, an unknown exit falls back to +x', () => {
    const p = fromQuery(sequential.params, new URLSearchParams('setup=zz&pass=-'));
    expect(p).toEqual({ pass: '-', N: 400 });
    expect(fromQuery(sequential.params, new URLSearchParams('pass=x')).pass).toBe('+');
  });

  it('Monte Carlo agrees with the predictions within 4σ', () => {
    const rng = new Rng(7);
    for (const theta of [0, 45, 90, 120]) {
      const devs = angleDevices(theta);
      let up = 0;
      let n = 0;
      for (let i = 0; i < 20000; i++) {
        const f = runChain(devs, rng);
        if (!f.detected) continue;
        n++;
        if (f.up) up++;
      }
      const P = probUp(theta * DEG, 0);
      expect(Math.abs(up / n - P)).toBeLessThanOrEqual(4 * Math.sqrt((P * (1 - P)) / n) + 1e-9);
      expect(n / 20000).toBeCloseTo(0.5, 1);
    }
  });
});

describe('ch40 scenes', () => {
  it('single device: quantum hits only at ±1, classical spread over the band', () => {
    const run = (model: string) => {
      const r = new Runner(single, { ...defaults(single.params), model, N: 1000 }, 1);
      r.play();
      for (let i = 0; i < 2000 && r.playing; i++) r.advance(0.05);
      return r.state.hits;
    };
    const q = run('quantum');
    expect(q.length).toBe(1000);
    expect(q.every((h) => Math.abs(Math.abs(h.z) - 1) < 0.4)).toBe(true);
    const c = run('classical');
    expect(c.filter((h) => Math.abs(h.z) < 0.5).length).toBeGreaterThan(300);
  });

  it('sequential z → x → z ends near half and half; same seed, same counts', () => {
    const run = () => {
      const r = new Runner(sequential, defaults(sequential.params), 1);
      r.play();
      for (let i = 0; i < 4000 && r.playing; i++) r.advance(0.05);
      return r.state.counts.map((c) => [...c]);
    };
    const a = run();
    expect(a).toEqual(run());
    const last = a[a.length - 1];
    const total = a.flat().reduce((x, y) => x + y, 0);
    expect(total).toBe(400);
    expect(last[0] / (last[0] + last[1])).toBeGreaterThan(0.3);
    expect(last[0] / (last[0] + last[1])).toBeLessThan(0.7);
  });

  it('angle scene records the running fraction', () => {
    const r = new Runner(angle, { ...defaults(angle.params), theta: 0 }, 1);
    r.play();
    for (let i = 0; i < 4000 && r.playing; i++) r.advance(0.05);
    const fr = r.hist.col('frac');
    expect(fr[fr.length - 1]).toBe(1);
  });
});

describe('ch40 QA 2026-11-24 (P3)', () => {
  it('cos²(θ/2) is a prediction with 3 figures: 0.998 at 5° (was "1.0"), the same string in the readout and Σ', async () => {
    const { readoutText } = await import('../src/core/tex');
    for (const [theta, want] of [
      [5, '0.998'],
      [60, '0.750'],
      [0, '1.00'],
      [175, '0.00190'],
    ] as const) {
      const p = { ...defaults(angle.params), theta };
      const r = new Runner(angle, p, 1);
      const spec = angle.readouts!.find((x) => x.label === '\\cos^2(\\theta/2)')!;
      expect(readoutText(spec as never, spec.value(r.state, p), p)).toBe(want);
      expect(angle.formula!(r.state, p)[0]).toMatch(new RegExp(`= ${want.replace('.', '\\.')}$`));
    }
  });

  it('error bar: ±σ_P from the prediction (the Σ panel σ_P), drawn about the measured fraction', async () => {
    const { ProbeDraw } = await import('./stage-probe');
    const { UP_COLOR } = await import('../src/sims/ch40/chain');
    type Pt = { x: number; y: number };
    class LineProbe extends ProbeDraw {
      readonly bars: number[] = [];
      curve: Pt[] = [];
      line(...a: unknown[]): void {
        const [p, q, st] = a as [Pt, Pt, { color?: string }];
        if (st?.color === UP_COLOR && p.x === q.x) this.bars.push(Math.abs(q.y - p.y));
      }
      polyline(...a: unknown[]): void {
        const [pts, st] = a as [Pt[], { color?: string; width?: number }];
        if (st?.color === '#1a1a1a' && st.width === 1.5 && pts.length > 50) this.curve = pts;
      }
    }
    for (const seed of [3, 4]) {
      const p = { ...defaults(angle.params), theta: 60, N: 100 };
      const r = new Runner(angle, p, seed);
      r.play();
      for (let i = 0; i < 4000 && r.playing; i++) r.advance(0.05);
      const g = new LineProbe(1280, 704);
      g.vp.fit(angle.world(p), 1280, 704);
      angle.draw(g, r.state, p, { t: r.state.t, cursorT: r.state.t, scrubbing: false, lecture: false });
      // The prediction curve runs from P = 1 (θ = 0) to P = 0 (θ = 180°): world units per unit of P.
      const scale = g.curve[0].y - g.curve[g.curve.length - 1].y;
      const sig = angle.formula!(r.state, p).find((l) => l.startsWith('\\sigma_P'))!;
      const N = Number(/\{(\d+)\}\} = /.exec(sig)![1]);
      // The bar is the last vertical line in the + colour (the apparatus draws a few before it).
      expect(g.bars.at(-1)! / scale).toBeCloseTo(2 * Math.sqrt((0.75 * 0.25) / N), 9);
    }
  });

  it('ⓘ defines F_z, μ_z, g_s, e, m, S_z and says what the error bar is', async () => {
    const ko = (await import('../src/sims/ch40/i18n.ko.json')).default as Record<string, string>;
    const en = (await import('../src/sims/ch40/i18n.en.json')).default as Record<string, string>;
    expect(single.info.assumptions).toContain('ch40.s.assume.sym');
    for (const d of [ko, en]) {
      for (const s of ['F_z', '\\mu_z', 'g_s', '$e$', '$m$', 'S_z']) expect(d['ch40.s.assume.sym']).toContain(s);
      expect(d['ch40.a.obs.N']).toContain('\\sigma_P');
    }
  });
});
