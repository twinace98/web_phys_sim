// Addition under review: damped and forced oscillations (#/ch/108).
import { describe, expect, it } from 'vitest';
import { defaults } from '../src/core/params';
import { readoutText, texOf } from '../src/core/precision';
import { register } from '../src/core/i18n';
import type { Scene } from '../src/core/types';
import page from '../src/sims/review/damped';
import { NUM, agrees, grab, val } from './sigma-digits';
import { D, drivenScene, wdOf, xSpan } from '../src/sims/review/damped/driven';
import { H, X0, freeScene } from '../src/sims/review/damped/free';
import en from '../src/sims/review/damped/i18n.en.json';
import ko from '../src/sims/review/damped/i18n.ko.json';
import globalEn from '../src/i18n/en.json';
import globalKo from '../src/i18n/ko.json';
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

describe('driven Σ: printed inputs reproduce the results, no zero denominator', () => {
  const R = (s: string) => new RegExp(s.replace(/N#/g, `(${NUM})`));
  const p0 = defaults(drivenScene.params);
  const lines = (q: typeof p0) => drivenScene.formula!(drivenScene.init(q, undefined as never), q);

  it('review case (defaults, ω_d = ω_0): no 4.00/0.00 denominator', () => {
    const f = lines(p0).join(' ');
    expect(f).not.toMatch(/\{-?0(\.0+)?\}/);
  });

  it('every ω_d/ω_0 stop (0.20 … 2.00) at the ends and middle of b, m, k', () => {
    const bad: string[] = [];
    let hits = 0;
    for (let i = 20; i <= 200; i++)
      for (const b of [0.2, 1, 2.5, 4])
        for (const m of [0.2, 1, 2])
          for (const k of [5, 16, 40]) {
            const q = { ...p0, ratio: i / 100, b, m, k };
            const f = lines(q);
            const tag = JSON.stringify(q);
            const all = f.join(' ');
            if (/\{-?0(\.0+)?\}/.test(all)) bad.push(`${tag} zero denominator`);
            const [Fm, den, xm] = grab(f[2], R(String.raw`= \\frac\{N#\}\{N#\} = N#\\ \\mathrm\{m\}$`));
            hits++;
            if (!agrees(val(Fm) / val(den), xm)) bad.push(`${tag} x_m ${f[2]}`);
          }
    expect(bad.length, bad.slice(0, 5).join('\n')).toBe(0);
    expect(hits).toBe(181 * 36);
  });
});

describe('damped Σ: policy D (slider labels, 3-figure inputs, R5 net force, R6 b against b_c)', () => {
  const pf = defaults(freeScene.params);
  const pd = defaults(drivenScene.params);
  const free = (q: typeof pf) => freeScene.formula!(freeScene.init(q, undefined as never), q);
  const driven = (q: typeof pd) => drivenScene.formula!(drivenScene.init(q, undefined as never), q);

  it('slider values as their labels: m = 2.0, k = 40, b = 0.0, ω_d/ω_0 = 0.99', () => {
    const f = free({ ...pf, m: 2, k: 40, b: 0 });
    expect(f[0]).toBe('\\omega_0 = \\sqrt{k/m} = \\sqrt{40/2.0} = 4.47\\ \\mathrm{rad/s}');
    expect(f[1]).toBe('b = 0.0 < b_c = 2\\sqrt{km} = 17.9\\ \\mathrm{kg/s}');
    const d = driven({ ...pd, ratio: 0.99 });
    expect(d[0]).toBe('\\omega_d = 0.99\\,\\omega_0 = 0.99\\sqrt{16/1.0} = 3.96\\ \\mathrm{rad/s}');
    expect(d[2]).toBe('x_m = \\frac{F_m}{\\sqrt{(k - m\\omega_d^2)^2 + (b\\omega_d)^2}} = \\frac{0.320}{3.97} = 0.0805\\ \\mathrm{m}');
    // Forced oscillation kept light (QA 2026-11-24): ω_d, F_m, x_m; no phase lag, no peak shift.
    expect(d.length).toBe(3);
    expect(d.join(' ')).not.toMatch(/\\phi|peak/);
  });

  it('R7b: the envelope, x and E are physical small values, never 0 (b = 7.9 near b_c at t = 10 s)', () => {
    for (const [b, m, k] of [
      [7.9, 1, 16],
      [17.8, 2, 40],
      [9.7, 0.6, 40],
      [1, 1, 16],
      [8, 1, 16],
      [20, 0.2, 40],
    ]) {
      const q = { ...pf, b, m, k };
      const s = freeScene.init(q, undefined as never);
      for (let i = 0; i < 10 / H; i++) freeScene.step!(s, H, q);
      const l = freeScene.formula!(s, q);
      const o = { m, k, b };
      if (b >= bCrit(o)) {
        // Critical and overdamped runs: x itself is the small value.
        expect(l.find((x) => /(^|\\ )x = /.test(x))).toMatch(/= \d\.\d\d\\times 10\^\{-\d+\}\\ \\mathrm\{m\}$/);
      } else {
        const env = envelope(o, X0, s.t);
        const envLine = l.find((x) => x.startsWith('x_m e^{-bt/2m}'))!;
        // 3 figures down to any size (2.90×10⁻¹² m, not 0).
        expect(envLine).toMatch(/= (\d\.\d\d(\\times 10\^\{-\d+\})?|0\.0*[1-9]\d\d)\\ \\mathrm\{m\}$/);
        const [, xm, g, t, res] = /= ([\d.]+)\\, e\^\{-([\d.]+) \\times ([\d.]+)\} = (.+)\\ \\mathrm/.exec(envLine)!;
        const r = Number(res.replace(/\\times 10\^\{(-?\d+)\}/, 'e$1'));
        expect(Math.abs(r - env) / env, envLine).toBeLessThan(0.006);
        // The printed exponent reproduces the printed envelope (R5b: γ and t keep the figures it needs).
        expect(Math.abs(Number(xm) * Math.exp(-Number(g) * Number(t)) - r) / r, envLine).toBeLessThanOrEqual(0.01);
      }
      // E: the readout and Σ print the same string, never 0.
      const ro = freeScene.readouts!.find((x) => x.label === 'E')!;
      const roText = readoutText(ro as never, ro.value(s, q), q, s);
      expect(roText).not.toMatch(/^0$|^0\.0+$/);
      const eTex = texOf(roText);
      expect(l.some((x) => x.startsWith(`E = ${eTex}\\ `) || x.startsWith(`E = K + U = ${eTex}\\ `)), `${eTex} ${l.join(' | ')}`).toBe(true);
    }
  });

  it('R6: b just below b_c keeps the figures that show b < b_c; b = b_c prints =', () => {
    // Defaults k = 16, m = 1.0: b_c = 8.00.
    expect(free({ ...pf, b: 7.9 })[1]).toBe('b = 7.9 < b_c = 2\\sqrt{km} = 8.00\\ \\mathrm{kg/s}');
    expect(free({ ...pf, b: 8 })[1]).toBe('b = 8.0 = b_c = 2\\sqrt{km} = 8.00\\ \\mathrm{kg/s}');
    // k = 17, m = 0.9: b_c = 2√15.3 = 7.8230… > b = 7.8 shows as 7.82.
    expect(free({ ...pf, b: 7.8, k: 17, m: 0.9 })[1]).toMatch(/^b = 7\.8 < b_c = 2\\sqrt\{km\} = 7\.82\\ /);
  });

  it('ΣF: 3-figure forces, the net force from the unrounded ones (R5); no fitted 4-figure terms', () => {
    for (const [sc, q] of [
      [freeScene, { ...pf, fbd: true }],
      [drivenScene, { ...pd, fbd: true }],
    ] as const) {
      const s = sc.init(q as never, undefined as never) as { t: number };
      for (let i = 0; i < 300; i++) sc.step!(s as never, sc.time!.h, q as never);
      const l = sc.formula!(s as never, q as never).find((x) => x.startsWith('\\Sigma F'))!;
      for (const m of l.matchAll(/(?<![\d.])\d+\.\d+/g)) expect(m[0].replace('.', '').replace(/^0+/, '').length, l).toBeLessThanOrEqual(3);
      expect(l).toMatch(/ - 9\.80 /);
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
      // Shared strings (the free-body-diagram toggle) come from src/i18n.
      expect({ ...globalKo, ...ko }).toHaveProperty([k]);
      expect({ ...globalEn, ...en }).toHaveProperty([k]);
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
