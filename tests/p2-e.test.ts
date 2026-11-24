// Review 2026-11-17, priority 2, group E: symbol definitions and renames in ⓘ, Σ and readouts.
// Ch 18 reverse-cycle label, Ch 23 surface ↔ line integral, Ch 31 φ (AC) vs φ₀ (free), Ch 32 Curie
// constant, Ch 37 mirror separation D and tilted-axis ticks, Ch 41 band wording, 106 Φ and ∇.
import { describe, expect, it } from 'vitest';
import { defaults } from '../src/core/params';
import { Runner } from '../src/core/runner';
import type { Params, Scene } from '../src/core/types';
import ch18ko from '../src/sims/ch18/i18n.ko.json';
import ch18en from '../src/sims/ch18/i18n.en.json';
import { cycleScene } from '../src/sims/ch18/cycle';
import ch23ko from '../src/sims/ch23/i18n.ko.json';
import ch23en from '../src/sims/ch23/i18n.en.json';
import { gaussScene } from '../src/sims/ch23/scene';
import ch31ko from '../src/sims/ch31/i18n.ko.json';
import ch31en from '../src/sims/ch31/i18n.en.json';
import { acScene } from '../src/sims/ch31/ac';
import { freeScene } from '../src/sims/ch31/free';
import { freeAt, gamma as damping, omegaDamped, type RLC } from '../src/sims/ch31/physics';
import ch32ko from '../src/sims/ch32/i18n.ko.json';
import ch32en from '../src/sims/ch32/i18n.en.json';
import { magnet } from '../src/sims/ch32/magnet';
import ch37ko from '../src/sims/ch37/i18n.ko.json';
import ch37en from '../src/sims/ch37/i18n.en.json';
import { lightClocks, spacetime } from '../src/sims/ch37/scene';
import { fromS, fromSp, gamma } from '../src/sims/ch37/physics';
import ch41ko from '../src/sims/ch41/i18n.ko.json';
import ch41en from '../src/sims/ch41/i18n.en.json';
import gfko from '../src/sims/review/gravfield/i18n.ko.json';
import gfen from '../src/sims/review/gravfield/i18n.en.json';
import { gravfield } from '../src/sims/review/gravfield/scene';
import { probe } from './stage-probe';

type Dict = Record<string, string>;

/** Every string a student sees for a scene: ⓘ lines (ko and en), equations, Σ lines, readout labels. */
function sceneStrings(scene: Scene, ko: Dict, en: Dict, over: Partial<Params> = {}, steps = 0): string[] {
  const out: string[] = [];
  const info = scene.info;
  for (const k of [...info.goals, ...info.observe, ...(info.assumptions ?? [])]) out.push(ko[k], en[k]);
  out.push(...(info.equations ?? []));
  for (const r of scene.readouts ?? []) out.push(r.label);
  const run = new Runner(scene, { ...(defaults(scene.params) as Params), ...over } as never, 1);
  if (steps && scene.time) {
    run.play();
    for (let i = 0; i < steps && run.playing; i++) run.advance(scene.time.h);
  }
  if (scene.formula) out.push(...scene.formula(run.state as never, run.params as never));
  return out;
}

/** The ⓘ keys of a scene exist and are non-empty in both languages. */
function hasKeys(scene: Scene, ko: Dict, en: Dict, keys: string[]): void {
  const info = scene.info;
  const all = [...info.goals, ...info.observe, ...(info.assumptions ?? [])];
  for (const k of keys) {
    expect(all, k).toContain(k);
    expect(ko[k], `ko ${k}`).toBeTruthy();
    expect(en[k], `en ${k}`).toBeTruthy();
  }
}

/** An opening $ is never directly after a letter or digit. */
const tightDollar = (s: string) => {
  let open = false;
  for (let i = 0; i < s.length; i++) {
    if (s[i] !== '$') continue;
    if (!open && i > 0 && /[\p{L}\p{N}]/u.test(s[i - 1])) return true;
    open = !open;
  }
  return false;
};

describe('Ch 18 counter-clockwise cycle: reverse cycle, not only a refrigerator', () => {
  it('the direction label names refrigerator and heat pump in both languages', () => {
    expect(ch18ko['ch18.dir.ccw']).toBe('반시계 방향 (역순환)');
    expect(ch18en['ch18.dir.ccw']).toBe('Counter-clockwise (reverse cycle)');
    for (const d of [ch18ko, ch18en] as Dict[]) {
      expect(d['ch18.dir.ccw']).not.toMatch(/냉동기|refrigerator/);
      for (const k of ['ch18.c.obs.ccw', 'ch18.d.dir']) expect(d[k]).toMatch(/냉동기·열펌프|refrigerator or heat pump/);
    }
    const opt = (cycleScene.params as Record<string, { options?: { value: string; label: string }[] }>).dir.options!;
    expect(opt.find((o) => o.value === 'ccw')!.label).toBe('ch18.dir.ccw');
  });
});

describe('Ch 23 Gauss: ⓘ links the scene’s line integral to the textbook surface integral', () => {
  it('ch23.goal.2d exists in ko and en and states both integrals and λ_enc', () => {
    hasKeys(gaussScene as Scene, ch23ko, ch23en, ['ch23.goal.2d']);
    for (const s of [ch23ko['ch23.goal.2d'], ch23en['ch23.goal.2d']]) {
      expect(s).toContain('\\oint \\vec E\\cdot d\\vec A');
      expect(s).toContain('\\oint E_n\\,dl');
      expect(s).toContain('q_\\text{enc}');
      expect(s).toContain('\\lambda_\\text{enc}/\\varepsilon_0');
      expect(tightDollar(s)).toBe(false);
    }
  });
});

describe('Ch 31 phase: φ is the AC phase constant only; the free tab uses φ₀', () => {
  const bareInfoPhi = /\\phi(?!_0)/;

  it('free tab: no bare φ in ⓘ, equations, Σ or readouts, at R = 0 and R > 0, mid-run', () => {
    for (const R of [0, 5, 20, 100])
      for (const steps of [0, 300]) {
        const all = sceneStrings(freeScene as Scene, ch31ko, ch31en, { R }, steps);
        for (const s of all) expect(s, s).not.toMatch(bareInfoPhi);
      }
    expect(freeScene.info.equations).toContain("q = Q e^{-Rt/2L}\\cos(\\omega' t + \\phi_0)");
    hasKeys(freeScene as Scene, ch31ko, ch31en, ['ch31.f.assume.phase']);
  });

  it('φ₀ as stated in ⓘ: tan φ₀ = −R/2Lω′ and Q cos φ₀ = q(0) reproduce the exact q(t)', () => {
    const q0 = 1e-4;
    for (const c of [
      { R: 0, L: 10e-3, C: 10e-6 },
      { R: 20, L: 10e-3, C: 10e-6 },
      { R: 40, L: 20e-3, C: 5e-6 },
    ] as RLC[]) {
      const w = omegaDamped(c);
      const g = damping(c);
      const phi0 = Math.atan(-g / w);
      const Q = q0 / Math.cos(phi0);
      for (const t of [0, 0.3e-3, 1.1e-3, 4e-3]) expect(Q * Math.exp(-g * t) * Math.cos(w * t + phi0)).toBeCloseTo(freeAt(c, q0, t).q, 12);
      if (c.R === 0) expect(phi0).toBe(-0);
    }
  });

  it('AC tab: ⓘ states the convention i = I sin(ω_d t − φ), tan φ = (X_L − X_C)/R, φ > 0 lags', () => {
    hasKeys(acScene as Scene, ch31ko, ch31en, ['ch31.a.assume.phase']);
    for (const s of [ch31ko['ch31.a.assume.phase'], ch31en['ch31.a.assume.phase']]) {
      expect(s).toContain('i = I\\sin(\\omega_d t - \\phi)');
      expect(s).toContain('\\tan\\phi = (X_L - X_C)/R');
      expect(s).toContain('\\phi > 0');
      expect(tightDollar(s)).toBe(false);
    }
    expect(ch31en['ch31.a.assume.phase']).toMatch(/lags/);
    expect(ch31ko['ch31.a.assume.phase']).toMatch(/뒤짐/);
  });
});

describe('Ch 32 Curie constant C is defined in ⓘ', () => {
  it('ch32.m.assume.curie exists and defines C with Curie’s law; no other C in the scene', () => {
    hasKeys(magnet as Scene, ch32ko, ch32en, ['ch32.m.assume.curie']);
    for (const s of [ch32ko['ch32.m.assume.curie'], ch32en['ch32.m.assume.curie']]) {
      expect(s).toContain('M = C\\,B_\\text{ext}/T');
      expect(s).toContain('C = \\mu M_\\text{s}/k_B');
      expect(tightDollar(s)).toBe(false);
    }
    // C (alone, not T_C) appears only in Curie's law and its definition.
    const loneC = /(^|[^\\A-Za-z_])C(?![A-Za-z_])/;
    for (const mat of ['para', 'ferro', 'dia'])
      for (const s of sceneStrings(magnet as Scene, ch32ko, ch32en, { mat }, 5)) {
        if (loneC.test(s)) expect(s.includes('M = C') || s.includes('C = \\mu') || s.includes('Curie constant') || s.includes('퀴리 상수'), s).toBe(true);
      }
  });
});

describe('Ch 37 symbols: D is the light-clock mirror separation, L only the contracted length', () => {
  const loneL = /(^|[^\\A-Za-z_])L(?![A-Za-z_])/;

  it('light clocks: no L in ⓘ, equations, Σ or readouts; D in the equation and Σ, all β, mid-run', () => {
    for (const beta of [0, 0.1, 0.5, 0.8, 0.99])
      for (const steps of [0, 900]) {
        const all = sceneStrings(lightClocks as Scene, ch37ko, ch37en, { beta }, steps);
        for (const s of all) expect(s, s).not.toMatch(loneL);
        expect(all.some((s) => s.includes('\\Delta t_0 = \\frac{2D}{c}'))).toBe(true);
      }
    expect(lightClocks.info.equations).toContain('(c\\Delta t/2)^2 = D^2 + (v\\Delta t/2)^2');
    for (const d of [ch37ko, ch37en] as Dict[]) expect(d['ch37.c.assume.clock']).toContain('$D$ = 1 ls');
  });

  it('light clocks: no L drawn on the stage', () => {
    const p = defaults(lightClocks.params) as { beta: number };
    for (const [w, h] of [
      [1280, 560],
      [390, 520],
    ])
      for (const t of [0, 3.7]) {
        const g = probe(lightClocks as Scene, { t, n: Math.round(t * 120) } as never, p as never, w, h);
        expect(g.marks.some((m) => m.text)).toBe(true);
        for (const m of g.marks) if (m.text) expect(m.text).not.toMatch(/\*L\*/);
      }
  });

  it('spacetime ⓘ: the tick-spacing line exists and its factor matches the drawn ct′ ticks', () => {
    hasKeys(spacetime as Scene, ch37ko, ch37en, ['ch37.d.obs.ticks']);
    for (const s of [ch37ko['ch37.d.obs.ticks'], ch37en['ch37.d.obs.ticks']]) {
      expect(s).toContain('\\sqrt{(1+\\beta^2)/(1-\\beta^2)}');
      expect(s).toContain('1.46');
      expect(tightDollar(s)).toBe(false);
    }
    for (const beta of [0, 0.3, 0.6, 0.8]) {
      const f = Math.sqrt((1 + beta * beta) / (1 - beta * beta));
      // ct' tick k drawn at the event (x' = 0, ct' = k); ct tick k at (0, k). Equal x and ct scales.
      const e = fromSp(0, 1, beta);
      expect(Math.hypot(e.x, e.t)).toBeCloseTo(f, 12);
      // x' grid: the line x' = 1 meets the x' axis (ct' = 0) at the same distance.
      const xg = fromSp(1, 0, beta);
      expect(Math.hypot(xg.x, xg.t)).toBeCloseTo(f, 12);
      expect(fromS(e.x, e.t, beta).tp).toBeCloseTo(1, 12);
    }
    expect(Math.sqrt((1 + 0.36) / (1 - 0.36)).toFixed(2)).toBe('1.46');
    expect(gamma(0.6)).toBeCloseTo(1.25, 12);
  });
});

describe('Ch 41 metal: ko matches en (E_F inside a partly filled band)', () => {
  it('no "한가운데"; both say the band is partly filled', () => {
    expect(ch41ko['ch41.f.obs.metal']).not.toContain('한가운데');
    expect(ch41ko['ch41.f.obs.metal']).toContain('일부만 채워진 띠 안');
    expect(ch41en['ch41.f.obs.metal']).toContain('inside a partly filled band');
  });
});

describe('106 gravity field: Φ is defined in ⓘ, no ∇ (beyond first year)', () => {
  it('Φ = U/m in J/kg, and g = −∇Φ points downhill, perpendicular to the equipotentials', () => {
    hasKeys(gravfield as Scene, gfko, gfen, ['gravfield.goal.phi', 'gravfield.goal.grad']);
    expect(gfko['gravfield.goal.phi']).toContain('$U/m$');
    expect(gfko['gravfield.goal.phi']).toContain('J/kg');
    expect(gfen['gravfield.goal.phi']).toContain('$U/m$');
    expect(gfen['gravfield.goal.phi']).toContain('J/kg');
    expect(gfko['gravfield.goal.grad']).toMatch(/내리막.*수직/);
    expect(gfen['gravfield.goal.grad']).toMatch(/downhill.*perpendicular/);
    for (const d of [gfko, gfen] as Dict[])
      for (const k of ['gravfield.goal.phi', 'gravfield.goal.grad']) {
        // ∇Φ was trimmed as beyond first year (QA P3 2026-11-24): the component form stays.
        if (k === 'gravfield.goal.grad') expect(d[k]).toContain('g_s = -\\partial\\Phi/\\partial s');
        expect(d[k]).not.toContain('\\nabla');
        expect(tightDollar(d[k])).toBe(false);
      }
    expect((gravfield as Scene).info.equations!.join(' ')).not.toContain('\\nabla');
  });
});

describe('group E strings: no em-dash, no tight $, 진동수 not 주파수', () => {
  it('changed ⓘ lines', () => {
    const lines: string[] = [
      ch18ko['ch18.dir.ccw'],
      ch18ko['ch18.c.obs.ccw'],
      ch18en['ch18.dir.ccw'],
      ch18en['ch18.c.obs.ccw'],
      ch18ko['ch18.d.dir'],
      ch18en['ch18.d.dir'],
      ch23ko['ch23.goal.2d'],
      ch23en['ch23.goal.2d'],
      ch31ko['ch31.f.assume.phase'],
      ch31en['ch31.f.assume.phase'],
      ch31ko['ch31.a.assume.phase'],
      ch31en['ch31.a.assume.phase'],
      ch32ko['ch32.m.assume.curie'],
      ch32en['ch32.m.assume.curie'],
      ch37ko['ch37.d.obs.ticks'],
      ch37en['ch37.d.obs.ticks'],
      ch37ko['ch37.c.assume.clock'],
      ch37en['ch37.c.assume.clock'],
      ch41ko['ch41.f.obs.metal'],
      ch41en['ch41.f.obs.metal'],
      gfko['gravfield.goal.phi'],
      gfen['gravfield.goal.phi'],
      gfko['gravfield.goal.grad'],
      gfen['gravfield.goal.grad'],
    ];
    for (const s of lines) {
      expect(s).toBeTruthy();
      expect(s).not.toContain('—');
      expect(s).not.toContain('주파수');
      expect(tightDollar(s), s).toBe(false);
    }
  });
});
