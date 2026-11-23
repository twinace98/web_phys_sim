import { describe, expect, it } from 'vitest';
import { defaults } from '../src/core/params';
import { Runner } from '../src/core/runner';
import { agm, ellipticK, exactPeriod, omega0, oscAt, pendulumStep, period, periodError, smallAnglePeriod, type Oscillator } from '../src/sims/ch15/physics';
import { ARROW_MAX, ERR_RECT, bobArrows, errPct, pendulum, periodSig, worldTop } from '../src/sims/ch15/pendulum';
import { shm } from '../src/sims/ch15/shm';
import { NUM, agrees, grab, val } from './sigma-digits';
import { offStage, probe, ProbeDraw } from './stage-probe';

const osc = (A: number, k: number, m: number, zeta = 0): Oscillator => ({ A, k, m, zeta });
const DEG = Math.PI / 180;

describe('ch15 simple harmonic motion', () => {
  it('x = A cos ωt, v = −ωA sin ωt, a = −ω²x with ω = √(k/m)', () => {
    const o = osc(0.2, 20, 1);
    const w = Math.sqrt(20);
    for (const t of [0, 0.13, 0.7, 2.9]) {
      const s = oscAt(o, t);
      expect(s.x).toBeCloseTo(0.2 * Math.cos(w * t), 12);
      expect(s.v).toBeCloseTo(-0.2 * w * Math.sin(w * t), 12);
      expect(s.a).toBeCloseTo(-w * w * s.x, 12);
    }
  });

  it('is the projection of uniform circular motion: the reference point stays on a circle of radius A', () => {
    const o = osc(0.3, 40, 0.5);
    for (const t of [0.05, 0.4, 1.3]) {
      const s = oscAt(o, t);
      expect(Math.hypot(s.px, s.py)).toBeCloseTo(0.3, 12);
      expect(Math.hypot(s.pvx, s.pvy)).toBeCloseTo(0.3 * omega0(o), 12);
      expect(Math.hypot(s.pax, s.pay)).toBeCloseTo(0.3 * omega0(o) ** 2, 12);
      // horizontal coordinate of the reference point = v / ω
      expect(s.px).toBeCloseTo(s.v / omega0(o), 12);
    }
  });

  it('period 2π√(m/k), independent of amplitude', () => {
    for (const A of [0.1, 0.2, 0.3]) {
      const o = osc(A, 10, 2);
      const T = period(o);
      expect(T).toBeCloseTo(2 * Math.PI * Math.sqrt(2 / 10), 12);
      expect(oscAt(o, T).x).toBeCloseTo(A, 12);
      expect(oscAt(o, T / 2).x).toBeCloseTo(-A, 12);
    }
  });

  it('K + U = ½kA² at all times without damping', () => {
    const o = osc(0.2, 20, 1);
    for (const t of [0, 0.3, 0.77, 5.1]) expect(oscAt(o, t).E).toBeCloseTo(0.5 * 20 * 0.04, 12);
  });

  it('damped: starts at rest from A, v = dx/dt, a = −ω₀²x − 2γv, energy decreases', () => {
    const o = osc(0.2, 20, 1, 0.05);
    const s0 = oscAt(o, 0);
    expect(s0.x).toBeCloseTo(0.2, 12);
    expect(s0.v).toBeCloseTo(0, 12);
    const g = 0.05 * omega0(o);
    const h = 1e-6;
    for (const t of [0.2, 1.1, 3.3]) {
      const s = oscAt(o, t);
      expect(s.v).toBeCloseTo((oscAt(o, t + h).x - oscAt(o, t - h).x) / (2 * h), 7);
      expect(s.a).toBeCloseTo(-(omega0(o) ** 2) * s.x - 2 * g * s.v, 10);
    }
    expect(oscAt(o, 3).E).toBeLessThan(oscAt(o, 1).E);
  });

  it('runner records one full period back at x = A', () => {
    const p = defaults(shm.params);
    const r = new Runner(shm, p);
    r.play();
    const T = period({ A: p.A, k: p.k, m: p.m, zeta: 0 });
    r.advance(T);
    expect(Math.abs(r.state.t - T)).toBeLessThan(1 / 480 + 1e-9);
    expect(r.state.x).toBeCloseTo(p.A * Math.cos(Math.sqrt(p.k / p.m) * r.state.t), 12);
  });

  it('readouts ω and T describe the same oscillation: ωT = 2π, also when damped', () => {
    for (const zeta of [0, 0.1, 0.2]) {
      const p = { ...defaults(shm.params), m: 2, k: 5, zeta };
      const s = new Runner(shm, p).state;
      const [w, T] = shm.readouts!.slice(0, 2).map((ro) => ro.value(s, p));
      expect(w * T).toBeCloseTo(2 * Math.PI, 12);
      expect(w).toBeCloseTo(Math.sqrt(5 / 2) * Math.sqrt(1 - zeta * zeta), 12);
    }
  });
});

describe('ch15 simple pendulum', () => {
  const pd = { L: 1, g: 9.8 };
  it('AGM and the exact period: small angles → T₀, 90° → 1.18 T₀', () => {
    expect(agm(1, 1)).toBe(1);
    expect(exactPeriod(pd, 1e-4) / smallAnglePeriod(pd)).toBeCloseTo(1, 8);
    expect(exactPeriod(pd, 90 * DEG) / smallAnglePeriod(pd)).toBeCloseTo(1.18034, 5);
    expect(exactPeriod(pd, 10 * DEG) / smallAnglePeriod(pd)).toBeCloseTo(1.0019, 4);
    expect(exactPeriod(pd, 150 * DEG) / smallAnglePeriod(pd)).toBeCloseTo(1.7622, 3);
  });

  it('RK4 integration returns to θ₀ after one exact period and conserves energy', () => {
    for (const th0 of [30, 90, 150]) {
      const s = { th: th0 * DEG, w: 0 };
      const T = exactPeriod(pd, th0 * DEG);
      const h = 1e-3;
      const n = Math.round(T / h);
      const e0 = 0.5 * s.w ** 2 - (9.8 / 1) * Math.cos(s.th);
      for (let i = 0; i < n; i++) pendulumStep(pd, s, h);
      pendulumStep(pd, s, T - n * h);
      expect(s.th).toBeCloseTo(th0 * DEG, 6);
      expect(0.5 * s.w ** 2 - 9.8 * Math.cos(s.th)).toBeCloseTo(e0, 9);
    }
  });


  it('K(k) = ∫ dφ/√(1 − k² sin²φ) and T = 4√(L/g) K(sin(θ₀/2))', () => {
    for (const k of [0, 0.3, Math.SQRT1_2, 0.99]) {
      const n = 20000;
      let sum = 0;
      for (let i = 0; i < n; i++) {
        const phi = ((i + 0.5) / n) * (Math.PI / 2);
        sum += 1 / Math.sqrt(1 - k * k * Math.sin(phi) ** 2);
      }
      expect(ellipticK(k)).toBeCloseTo((sum * Math.PI) / 2 / n, 6);
    }
    expect(ellipticK(Math.SQRT1_2)).toBeCloseTo(1.854075, 6);
    expect(exactPeriod(pd, 90 * DEG)).toBeCloseTo(4 * Math.sqrt(1 / 9.8) * 1.854075, 6);
  });
});

/** Period of the scene's own simulated motion: the first return to θ₀ (ω from + to −), released at rest. */
function measuredPeriod(theta0: number, L = 1): number {
  const p = { ...defaults(pendulum.params), theta0, L };
  const s = pendulum.init(p, null as never);
  const h = 1e-3;
  let prev = s.w;
  while (s.t < 30) {
    pendulum.step!(s, h, p);
    if (prev > 0 && s.w <= 0) return s.t - h * (s.w / (s.w - prev));
    prev = s.w;
  }
  return NaN;
}

const ui = (t: number) => ({ t, cursorT: t, scrubbing: false, lecture: false });

describe('ch15 pendulum: legend and error chart', () => {
  it('the θ(t) legend names both curves in ko and en', async () => {
    const page = (await import('../src/sims/ch15')).default;
    for (const lang of ['ko', 'en'] as const) {
      expect(page.i18n[lang]['ch15.n.leg.real']).toBeTruthy();
      expect(page.i18n[lang]['ch15.n.leg.model']).toContain('cos');
    }
    expect(pendulum.info.observe).toContain('ch15.n.obs.inset');
  });

  it('the chart marks the current release on (T − T0)/T0: 0.191 % at 10°, 1.74 % at 30°, 18.0 % at 90°', () => {
    const p = defaults(pendulum.params) as any;
    for (const [deg, txt] of [[10, '0.191 %'], [30, '1.74 %'], [90, '18.0 %'], [170, '144 %']] as const) {
      const q = { ...p, theta0: deg };
      const g = new ProbeDraw(768, 650);
      g.vp.fit(pendulum.world(q), 768, 650);
      pendulum.draw(g, pendulum.init(q, null as never), q, ui(0));
      expect(g.marks.some((m) => m.text === txt)).toBe(true);
      // The chart sits inside the world, below the swing (bob at y = −L at the bottom).
      expect(pendulum.world(q).y[0]).toBeLessThan(ERR_RECT.y0 - 0.2);
      expect(ERR_RECT.y1).toBeLessThan(-1.5);
    }
    // Monotonic: smaller angle, smaller error; below 1 % under 22.8°.
    const e = [5, 10, 20, 22.8, 23, 45, 90].map((d) => errPct(p, d));
    for (let i = 1; i < e.length; i++) expect(e[i]).toBeGreaterThan(e[i - 1]);
    expect(errPct(p, 22.8)).toBeLessThan(1);
    expect(errPct(p, 23)).toBeGreaterThan(1);
  });
});

describe('ch15 pendulum: one real pendulum against the small-angle model', () => {
  const pd = { L: 1, g: 9.8 };

  it('the error (T − T₀)/T₀ grows with amplitude: 0.19 % at 10°, 1.74 % at 30°, 18.0 % at 90°', () => {
    expect(100 * periodError(pd, 10 * DEG)).toBeCloseTo(0.1907, 3);
    expect(100 * periodError(pd, 30 * DEG)).toBeCloseTo(1.7409, 3);
    expect(100 * periodError(pd, 90 * DEG)).toBeCloseTo(18.034, 2);
    expect(100 * periodError(pd, 150 * DEG)).toBeCloseTo(76.22, 1);
    // independent of L
    expect(periodError({ L: 0.2, g: 9.8 }, 30 * DEG)).toBeCloseTo(periodError({ L: 2, g: 9.8 }, 30 * DEG), 12);
  });

  it('the simulated motion has the exact period, so its measured error matches the readout', () => {
    for (const [th0, pct] of [
      [10, 0.19],
      [30, 1.74],
      [90, 18.03],
    ] as const) {
      const p = { ...defaults(pendulum.params), theta0: th0 };
      const T = measuredPeriod(th0);
      const T0 = smallAnglePeriod(pd);
      expect(T).toBeCloseTo(exactPeriod(pd, th0 * DEG), 5);
      expect(100 * (T / T0 - 1)).toBeCloseTo(pct, 2);
      const [rT, rT0, rErr] = pendulum.readouts!.map((ro) => ro.value(pendulum.init(p, null as never), p));
      expect(rT).toBeCloseTo(T, 5);
      expect(rT0).toBeCloseTo(T0, 12);
      expect(rErr).toBeCloseTo(pct, 2);
    }
    expect(pendulum.readouts!.map((r) => r.unit)).toEqual(['s', 's', '%']);
  });

  it('stage: one bob only (no SHM ghost), arrows v, a_t, a_r', () => {
    const p = defaults(pendulum.params);
    const circles: number[] = [];
    class Rec extends ProbeDraw {
      circle(_c: { x: number; y: number }, rPx: number): void {
        circles.push(rPx);
      }
    }
    const labels = (s: { t: number; th: number; w: number }, q = p) => {
      circles.length = 0;
      const g = new Rec(768, 650);
      g.vp.fit(pendulum.world(q), 768, 650);
      pendulum.draw(g, s, q, ui(s.t));
      // The pendulum's own marks only: the error chart below the swing has its own test.
      const yChart = g.vp.toPx(0, ERR_RECT.y1 + 0.2)[1];
      return g.marks.filter((m) => m.y < yChart).map((m) => m.text ?? 'tip');
    };
    const T = exactPeriod(pd, p.theta0 * DEG);
    // At release (rest): only a_t.
    const s = pendulum.init(p, null as never);
    expect(labels(s)).toEqual(['tip', '*a*_{t}']);
    expect(circles.filter((r) => r > 5)).toHaveLength(1);
    // At the bottom: v and a_r, a_t = 0.
    while (s.t < T / 4 - 1e-9) pendulum.step!(s, 1e-3, p);
    expect(labels(s).sort()).toEqual(['*a*_{r}', '*v*', 'tip', 'tip']);
    expect(circles.filter((r) => r > 5)).toHaveLength(1);
    // On the way down: all three, with v and a_t on the same line, pointing the same way.
    const s2 = pendulum.init(p, null as never);
    while (s2.t < T / 8) pendulum.step!(s2, 1e-3, p);
    const a = bobArrows(s2, p);
    expect(labels(s2).sort()).toEqual(['*a*_{r}', '*a*_{t}', '*v*', 'tip', 'tip', 'tip']);
    expect(a.v.x * a.at.y - a.v.y * a.at.x).toBeCloseTo(0, 12);
    expect(a.v.x * a.at.x + a.v.y * a.at.y).toBeGreaterThan(0);
    // Toggle off: no arrows.
    expect(labels(s2, { ...p, vectors: false })).toEqual([]);
  });

  it('arrows: v and the larger acceleration part reach ARROW_MAX over a swing; nothing off stage', () => {
    for (const theta0 of [5, 10, 30, 90, 120, 170]) {
      const p = { ...defaults(pendulum.params), theta0 };
      const s = pendulum.init(p, null as never);
      const T = exactPeriod(pd, theta0 * DEG);
      let vMax = 0;
      let aMax = 0;
      while (s.t < T) {
        const a = bobArrows(s, p);
        vMax = Math.max(vMax, Math.hypot(a.v.x, a.v.y));
        aMax = Math.max(aMax, Math.hypot(a.at.x, a.at.y), Math.hypot(a.ar.x, a.ar.y));
        for (const [w, h] of [
          [768, 650],
          [390, 255],
        ])
          expect(offStage(probe(pendulum, s, p, w, h))).toEqual([]);
        for (let i = 0; i < 20; i++) pendulum.step!(s, 1e-3, p);
      }
      expect(vMax).toBeCloseTo(ARROW_MAX, 2);
      expect(aMax).toBeCloseTo(ARROW_MAX, 2);
    }
  });

  it('a_r label sits beside the string, not on it; the stage top only grows for releases above 90°', () => {
    const p = defaults(pendulum.params);
    const s = pendulum.init(p, null as never);
    const T = exactPeriod(pd, p.theta0 * DEG);
    while (s.t < T / 8) pendulum.step!(s, 1e-3, p);
    const g = probe(pendulum, s, p, 768, 650);
    const lab = g.marks.find((m) => m.text === '*a*_{r}')!;
    // distance from the label centre to the string line (pivot → bob), in px
    const [ox, oy] = g.vp.toPx(0, 0);
    const [bx, by] = g.vp.toPx(Math.sin(s.th), -Math.cos(s.th));
    const cx = lab.x + lab.w / 2;
    const d = Math.abs((bx - ox) * (oy - lab.y) - (ox - cx) * (by - oy)) / Math.hypot(bx - ox, by - oy);
    expect(d).toBeGreaterThan(10);
    for (const th0 of [5, 30, 90]) expect(worldTop({ ...p, theta0: th0 })).toBeLessThan(0.3);
    expect(worldTop({ ...p, theta0: 170 })).toBeGreaterThan(1);
  });

  it('the pendulum starts from 30° by default (user request 2026-11-19): error 1.74 %', () => {
    expect(defaults(pendulum.params).theta0).toBe(30);
  });

  it('formula panel: T₀, K, T and the error with numbers; a_t against the model −gθ', () => {
    const p = { ...defaults(pendulum.params), theta0: 90 };
    const s = pendulum.init(p, null as never);
    const f = pendulum.formula!(s, p).join('\n');
    expect(f).toContain('2\\pi\\sqrt{1.0/9.8} = 2.007');
    expect(f).toContain('K(\\sin 45^\\circ) = 1.854');
    expect(f).toContain('= 2.369\\ \\mathrm{s}');
    expect(f).toContain('= 18.0\\ \\%');
    expect(f).toContain('-9.8\\sin(90.0^\\circ) = -9.80');
    expect(f).toContain('-g\\theta = -9.8 \\times 1.57 = -15.4');
  });

  // Review 2026-11-20 P2: at 10° the panel printed K = 1.574 next to T = 2.01092 s, but
  // 4√(1.0/9.8) × 1.574 = 2.0112 s, and with that T the error comes out 0.205 %, not 0.191 %.
  it('regression: at 10° every period line follows from its printed inputs (K, T and the error)', () => {
    const p = { ...defaults(pendulum.params), theta0: 10, L: 1 };
    const f = pendulum.formula!(pendulum.init(p, null as never), p);
    expect(f[1]).not.toContain('= 1.574');
    expect(f[1]).toContain('K(\\sin 5^\\circ) = 1.5738');
    expect(f[2]).toContain('\\times 1.5738 = 2.0109\\ \\mathrm{s}');
    expect(f[3]).toContain('\\frac{2.0109 - 2.0071}{2.0071} = 0.19\\ \\%');
    expect(4 * Math.sqrt(1 / 9.8) * 1.5738).toBeCloseTo(2.0109, 4);
    expect(periodLineIssues(p)).toEqual([]);
    // The error's figures follow from the printed periods: 2 here, 3 where T and T₀ give them.
    expect(periodSig(exactPeriod({ L: 1, g: 9.8 }, 10 * DEG), 2 * Math.PI * Math.sqrt(1 / 9.8))).toEqual({ sT: 5, sE: 2 });
    expect(periodSig(exactPeriod({ L: 1, g: 9.8 }, 90 * DEG), 2 * Math.PI * Math.sqrt(1 / 9.8))).toEqual({ sT: 4, sE: 3 });
  });

  it('sweep: θ₀ 5–170° (every degree) × L 0.2–2 m: T₀, K, T and the error reproduce from what is printed', () => {
    const bad: string[] = [];
    let maxT = 0;
    let maxK = 0;
    for (let th = 5; th <= 170; th++)
      for (const L of [0.2, 0.3, 0.7, 1, 1.3, 1.9, 2]) {
        const p = { ...defaults(pendulum.params), theta0: th, L };
        bad.push(...periodLineIssues(p));
        const f = pendulum.formula!(pendulum.init(p, null as never), p);
        maxT = Math.max(maxT, figures(grab(f[2], new RegExp(`= (${NUM})\\\\ \\\\mathrm\\{s\\}`))[0]));
        maxK = Math.max(maxK, figures(grab(f[1], new RegExp(`= (${NUM})$`))[0]));
      }
    expect(bad).toEqual([]);
    // No more figures than the error needs: at most 7 for T (5° needs 6), K one more at most.
    expect(maxT).toBeLessThanOrEqual(7);
    expect(maxK).toBeLessThanOrEqual(8);
    // Mid-run (θ, ω change; the period lines do not) and with the free-body toggle.
    const p = { ...defaults(pendulum.params), theta0: 37, L: 0.6, fbd: true };
    const r = new Runner(pendulum, p);
    r.play();
    r.advance(0.77);
    const f = pendulum.formula!(r.state, p);
    expect(f.slice(0, 4)).toEqual(pendulum.formula!(pendulum.init(p, null as never), p).slice(0, 4));
  });
});

/** Significant figures of a printed number. */
const figures = (t: string) => t.replace(/\\times.*$/, '').replace(/\D/g, '').replace(/^0+/, '').length;

/** The four period lines at p: each result agrees with the arithmetic on the numbers printed before it. */
function periodLineIssues(p: ReturnType<typeof defaults> & { theta0: number; L: number }): string[] {
  const f = pendulum.formula!(pendulum.init(p as never, null as never), p as never);
  const L = p.L;
  const [T0] = grab(f[0], new RegExp(`= (${NUM})\\\\ \\\\mathrm\\{s\\}`));
  const [K] = grab(f[1], new RegExp(`= (${NUM})$`));
  const [Kin, T] = grab(f[2], new RegExp(`\\\\times (${NUM}) = (${NUM})\\\\ \\\\mathrm\\{s\\}`));
  const [a, b, c, e] = grab(f[3], new RegExp(`\\\\frac\\{(${NUM}) - (${NUM})\\}\\{(${NUM})\\} = (${NUM})\\\\ \\\\%`));
  const out: string[] = [];
  const tag = `${p.theta0}° L=${L}`;
  if (!agrees(2 * Math.PI * Math.sqrt(L / 9.8), T0)) out.push(`${tag}: T0 ${f[0]}`);
  if (Kin !== K || !agrees(4 * Math.sqrt(L / 9.8) * val(K), T)) out.push(`${tag}: T from K ${f[2]}`);
  if (a !== T || b !== T0 || c !== T0 || !agrees((100 * (val(a) - val(b))) / val(c), e)) out.push(`${tag}: error ${f[3]}`);
  // The printed error is also the exact one to its figures.
  if (!agrees(100 * periodError({ L, g: 9.8 }, p.theta0 * DEG), e)) out.push(`${tag}: exact error ${e}`);
  if (figures(e) < 2) out.push(`${tag}: error with ${figures(e)} figure`);
  return out;
}

describe('ch15 SHM layout without the phase-space panel', () => {
  it('two columns only: no phase-space axes or labels, a narrower world, nothing off stage', () => {
    const p = defaults(shm.params);
    const w = shm.world(p);
    expect(w.x[1] - w.x[0]).toBeLessThan(1.3); // was 2.03 with the phase-space column
    for (const zeta of [0, 0.2]) {
      const q = { ...p, A: 0.3, zeta };
      const r = new Runner(shm, q);
      r.play();
      for (const t of [0.2, 0.9, 1.6, 3.3]) {
        r.advance(t - r.state.t);
        expect(probe(shm, r.state, q, 768, 650).marks.filter((m) => m.kind === 'text')).toEqual([]);
        for (const [W, H] of [
          [768, 650],
          [390, 255],
        ])
          expect(offStage(probe(shm, r.state, q, W, H))).toEqual([]);
      }
    }
  });
});
