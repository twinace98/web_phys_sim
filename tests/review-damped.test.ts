// Addition under review: damped and forced oscillations (#/ch/108).
import { describe, expect, it } from 'vitest';
import { defaults } from '../src/core/params';
import { register } from '../src/core/i18n';
import type { Scene } from '../src/core/types';
import page from '../src/sims/review/damped';
import { D, drivenScene, wdOf, xSpan } from '../src/sims/review/damped/driven';
import { H, X0, freeScene } from '../src/sims/review/damped/free';
import en from '../src/sims/review/damped/i18n.en.json';
import ko from '../src/sims/review/damped/i18n.ko.json';
import {
  amplitudeConst,
  bCrit,
  drivenAmp,
  drivenLag,
  energy,
  energyApprox,
  envelope,
  freeAt,
  gamma,
  omega0,
  omegaPrime,
  peakAmp,
  peakOmega,
  regime,
  rk4,
  type Osc,
} from '../src/sims/review/damped/physics';

register(ko, en);

const BASE: Osc = { m: 1, k: 16, b: 1 };

/** Integrate the free oscillator from rest at X0 with the scene's step and compare with the closed form. */
function maxDeviation(o: Osc, tEnd = 10): { dx: number; dv: number } {
  const p = { ...defaults(freeScene.params), m: o.m, k: o.k, b: o.b };
  const s = freeScene.init(p, undefined as never);
  let dx = 0;
  let dv = 0;
  const n = Math.round(tEnd / H);
  for (let i = 0; i < n; i++) {
    freeScene.step!(s, H, p);
    const e = freeAt(o, X0, s.t);
    dx = Math.max(dx, Math.abs(s.x - e.x) / X0);
    dv = Math.max(dv, Math.abs(s.v - e.v) / (X0 * omega0(o)));
  }
  return { dx, dv };
}

describe('damped: regimes', () => {
  it('b_c = 2√(km) and the regime switches there', () => {
    expect(bCrit(BASE)).toBeCloseTo(8, 12);
    expect(regime({ ...BASE, b: 7.9 })).toBe('under');
    expect(regime({ ...BASE, b: 8 })).toBe('critical');
    expect(regime({ ...BASE, b: 8.1 })).toBe('over');
    // m = 0.8 kg, k = 20 N/m: b_c = 8 as well (km = 16 within rounding).
    expect(regime({ m: 0.8, k: 20, b: 8 })).toBe('critical');
    expect(omegaPrime(BASE)).toBeCloseTo(Math.sqrt(16 - 0.25), 12);
    expect(Number.isNaN(omegaPrime({ ...BASE, b: 8 }))).toBe(true);
  });

  it('the default b = 8.0 kg/s slider value is exactly critical; the slider spans all regimes for every k, m', () => {
    const sp = freeScene.params.b as { min: number; max: number };
    for (const m of [0.2, 2])
      for (const k of [5, 40]) {
        expect(sp.min).toBeLessThan(bCrit({ m, k, b: 0 }));
        expect(sp.max).toBeGreaterThan(bCrit({ m, k, b: 0 }));
      }
  });
});

describe('damped: integrator matches the closed form (1e-6 of x0)', () => {
  const cases: [string, Osc][] = [
    ['under, default', BASE],
    ['under, light, stiff', { m: 0.2, k: 40, b: 0.1 }],
    ['under, near critical', { m: 1, k: 16, b: 7.9 }],
    ['critical', { m: 1, k: 16, b: 8 }],
    ['critical, m = 0.8, k = 20', { m: 0.8, k: 20, b: 8 }],
    ['over', { m: 1, k: 16, b: 15 }],
    ['over, extreme', { m: 0.2, k: 5, b: 20 }],
    ['undamped', { m: 2, k: 5, b: 0 }],
  ];
  for (const [name, o] of cases) {
    it(name, () => {
      const { dx, dv } = maxDeviation(o);
      expect(dx).toBeLessThan(1e-6);
      expect(dv).toBeLessThan(1e-6);
    });
  }
});

describe('damped: envelope and energy', () => {
  it('|x| never exceeds x_m e^{−bt/2m} and touches it once per half period', () => {
    for (const b of [0.5, 1, 4, 7]) {
      const o = { ...BASE, b };
      const wp = omegaPrime(o);
      for (let t = 0; t < 10; t += 0.001) expect(Math.abs(freeAt(o, X0, t).x)).toBeLessThanOrEqual(envelope(o, X0, t) * (1 + 1e-12));
      const delta = Math.atan2(gamma(o), wp);
      for (let j = 0; j < 4; j++) {
        const t = (delta + j * Math.PI) / wp;
        expect(Math.abs(freeAt(o, X0, t).x)).toBeCloseTo(envelope(o, X0, t), 12);
      }
    }
  });

  it('x_m = x0 ω0/ω′ (≈ x0 for light damping)', () => {
    expect(amplitudeConst(BASE, X0)).toBeCloseTo(X0 / Math.sqrt(1 - 1 / 64), 12);
    expect(amplitudeConst({ ...BASE, b: 0 }, X0)).toBeCloseTo(X0, 14);
  });

  it('at the turning points E = ½kx0² e^{−bt/m} exactly; the integrator agrees', () => {
    for (const b of [0.5, 1, 3]) {
      const o = { ...BASE, b };
      const wp = omegaPrime(o);
      for (let j = 1; j <= 5; j++) {
        const t = (j * Math.PI) / wp;
        const q = freeAt(o, X0, t);
        expect(q.v).toBeCloseTo(0, 12);
        expect(energy(o, q.x, q.v).E).toBeCloseTo(0.5 * o.k * X0 * X0 * Math.exp((-b * t) / o.m), 12);
      }
    }
  });

  it('dE/dt = −bv² along the integrated motion', () => {
    const o = BASE;
    const s = { x: X0, v: 0 };
    let t = 0;
    for (let i = 0; i < 3000; i++) {
      const E0 = energy(o, s.x, s.v).E;
      const v0 = s.v;
      rk4(o, s, H);
      t += H;
      const E1 = energy(o, s.x, s.v).E;
      const dEdt = (E1 - E0) / H;
      const P = -o.b * 0.5 * (v0 * v0 + s.v * s.v);
      expect(Math.abs(dEdt - P)).toBeLessThan(1e-4);
    }
  });

  it('½kx_m²e^{−bt/m} is the energy averaged over a period, for light damping', () => {
    const o = { ...BASE, b: 0.2 };
    const T = (2 * Math.PI) / omegaPrime(o);
    for (const t0 of [0, 3, 6]) {
      let sum = 0;
      let ref = 0;
      const n = 4000;
      for (let i = 0; i < n; i++) {
        const t = t0 + ((i + 0.5) * T) / n;
        const q = freeAt(o, X0, t);
        sum += energy(o, q.x, q.v).E;
        ref += energyApprox(o, X0, t);
      }
      expect(Math.abs(sum / ref - 1)).toBeLessThan(2e-3);
    }
  });

  it('critical damping returns faster than overdamping; underdamping crosses zero', () => {
    const crit = { ...BASE, b: 8 };
    for (const b of [9, 12, 20]) for (let t = 0.05; t < 10; t += 0.05) expect(freeAt({ ...BASE, b }, X0, t).x).toBeGreaterThan(freeAt(crit, X0, t).x);
    for (let t = 0; t < 10; t += 0.01) expect(freeAt(crit, X0, t).x).toBeGreaterThan(0);
    expect(Math.min(...Array.from({ length: 1000 }, (_, i) => freeAt({ ...BASE, b: 7 }, X0, i * 0.01).x))).toBeLessThan(0);
  });

  it('energy channel stays inside the plot range in every regime', () => {
    const E = freeScene.plots![1];
    for (const b of [0, 1, 8, 20]) {
      const p = { ...defaults(freeScene.params), b };
      const [, top] = E.yRange(p);
      for (let t = 0; t < 10; t += 0.01) {
        const q = freeAt({ m: p.m, k: p.k, b }, X0, t);
        expect(energy({ m: p.m, k: p.k, b }, q.x, q.v).E).toBeLessThanOrEqual(top);
      }
    }
  });
});

describe('damped: forced oscillation', () => {
  it('steady state: x = x_m cos(ω_d t − φ) with x_m = F_m/√((k − mω_d²)² + (bω_d)²) (1e-6)', () => {
    for (const [ratio, b] of [
      [1, 1],
      [0.5, 1],
      [2, 1],
      [0.98, 0.5],
      [1.3, 4],
    ] as const) {
      const p = { ...defaults(drivenScene.params), ratio, b };
      const s = drivenScene.init(p, undefined as never);
      const tEnd = 40 / gamma({ m: p.m, k: p.k, b });
      const n = Math.round(tEnd / 1e-3);
      for (let i = 0; i < n; i++) drivenScene.step!(s, 1e-3, p);
      const o = { m: p.m, k: p.k, b };
      const dr = { d: D, wd: wdOf(p) };
      const xm = drivenAmp(o, dr);
      const lag = drivenLag(o, dr);
      expect(Math.abs(s.x - xm * Math.cos(s.th - lag)) / xm).toBeLessThan(1e-6);
      expect(Math.abs(Math.hypot(s.x, s.v / dr.wd) / xm - 1)).toBeLessThan(1e-6);
    }
  });

  it('at ω_d = ω0 the amplitude is F_m/(bω0) and x lags the drive by 90°', () => {
    const o = BASE;
    const dr = { d: D, wd: omega0(o) };
    expect(drivenAmp(o, dr)).toBeCloseTo((o.k * D) / (o.b * omega0(o)), 14);
    expect(drivenAmp(o, dr)).toBeCloseTo(0.08, 12);
    expect(drivenLag(o, dr)).toBeCloseTo(Math.PI / 2, 12);
    expect(drivenLag(o, { d: D, wd: 0.2 * omega0(o) })).toBeLessThan(0.1);
    expect(drivenLag(o, { d: D, wd: 2 * omega0(o) })).toBeGreaterThan(Math.PI - 0.2);
  });

  it('the peak lies at √(ω0² − 2γ²); smaller b gives a taller peak', () => {
    for (const b of [0.2, 0.5, 1, 2, 4]) {
      const o = { ...BASE, b };
      let best = 0;
      let wBest = 0;
      for (let w = 0.01; w < 8; w += 0.0005) {
        const a = drivenAmp(o, { d: D, wd: w });
        if (a > best) [best, wBest] = [a, w];
      }
      expect(wBest).toBeCloseTo(peakOmega(o), 3);
      expect(peakAmp(o, D)).toBeCloseTo(best, 6);
    }
    expect(peakAmp({ ...BASE, b: 0.5 }, D)).toBeGreaterThan(peakAmp({ ...BASE, b: 1 }, D) * 1.9);
    // γ ≥ ω0/√2: no peak, the largest amplitude is d at ω_d → 0.
    expect(Number.isNaN(peakOmega({ m: 0.2, k: 5, b: 4 }))).toBe(true);
  });

  it('x and the support stay inside the plot range, also when ω_d jumps while running', () => {
    for (const b of [0.2, 1, 4])
      for (const [r0, r1] of [
        [1, 0.2],
        [1, 2],
        [0.2, 1],
        [2, 1],
      ]) {
        const p = { ...defaults(drivenScene.params), b, ratio: r0 };
        const s = drivenScene.init(p, undefined as never);
        let worst = 0;
        for (let i = 0; i < 60000; i++) {
          if (i === 20000) p.ratio = r1;
          drivenScene.step!(s, 1e-3, p);
          worst = Math.max(worst, Math.abs(s.x));
        }
        expect(worst).toBeLessThan(xSpan(p));
      }
  });
});

describe('damped: page', () => {
  const scenes = page.scenes as Scene[];
  it('every scene has a formula with finite numbers in each regime', () => {
    for (const b of [0, 1, 8, 20]) {
      const p = { ...defaults(freeScene.params), b };
      const s = freeScene.init(p, undefined as never);
      for (let i = 0; i < 500; i++) freeScene.step!(s, H, p);
      const lines = freeScene.formula!(s, p);
      expect(lines.length).toBeGreaterThanOrEqual(2);
      expect(lines.length).toBeLessThanOrEqual(6);
      expect(lines.join(' ')).not.toMatch(/NaN|Infinity|undefined/);
    }
    const p = defaults(drivenScene.params);
    const lines = drivenScene.formula!(drivenScene.init(p, undefined as never), p);
    expect(lines.join(' ')).toContain('0.0800');
    expect(lines.join(' ')).not.toMatch(/NaN|Infinity|undefined/);
  });

  it('i18n: every key in both languages, no em-dash, no `$` right after a letter or digit', () => {
    const keys = new Set<string>();
    for (const sc of scenes) {
      keys.add(sc.title);
      for (const sp of Object.values(sc.params)) {
        keys.add(sp.label);
        if (sp.desc) keys.add(sp.desc);
        if (sp.kind === 'select') for (const o of sp.options) keys.add(o.label);
      }
      for (const k of [...sc.info.goals, ...sc.info.observe, ...(sc.info.assumptions ?? [])]) keys.add(k);
    }
    for (const r of ['under', 'critical', 'over']) keys.add(`damped.regime.${r}`);
    for (const k of keys) {
      expect(ko).toHaveProperty([k]);
      expect(en).toHaveProperty([k]);
    }
    expect(Object.keys(ko).sort()).toEqual(Object.keys(en).sort());
    for (const v of [...Object.values(ko), ...Object.values(en)]) {
      expect(v).not.toContain('\u2014');
      const parts = v.split('$');
      expect(parts.length % 2).toBe(1);
      for (let i = 0; i < parts.length - 1; i += 2) expect(parts[i]).not.toMatch(/[A-Za-z0-9가-힣]$/);
    }
  });
});
