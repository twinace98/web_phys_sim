// Σ formula panel (Scene.formula) on every scene that has one: at defaults, at every number
// param's min and max, every select option and every toggle flipped, at t = 0 and after running,
// each line parses in KaTeX and shows no NaN / undefined / Infinity, and follows the digit policy D
// (docs/design.md §3.3) except where PENDING says otherwise.
// Filter one chapter with: npx vitest run tests/sigma-all.test.ts -t "Ch 05"
import katex from 'katex';
import { describe, expect, it } from 'vitest';
import { defaults } from '../src/core/params';
import { Runner } from '../src/core/runner';
import type { Params, Scene } from '../src/core/types';
import { CHAPTERS, REVIEW } from '../src/sims/registry';
import { CHECKS, policyIssues, type Check } from './sigma-policy';

const STEPS = 600;

/**
 * Policy-D checks (tests/sigma-policy.ts) still failing on scenes that phase 2 has not converted:
 * scene "ch/id" → check → what fails and the rule that fixes it. Each phase 2 group converts its
 * scenes and deletes their entries; an entry whose check passes fails the test as stale, so the map
 * only shrinks. Checks: result (Σ result = readout string, R3/R8), slider (slider value = control
 * label, R1), inputSig (decimal inputs ≤ 3 figures except CONST, R3), recompute (printed arithmetic
 * within 1 % of the result; R5 lines are rewritten), zero (no 0.00 for physical small values, R7b).
 * Not covered by a check (see the audit §5): R2 integers, R7a residues, CONST values such as 107 g.
 */
const PENDING: Record<string, Partial<Record<Check, string>>> = {
  // Ch 2–6
  '2/freefall': { recompute: 'R7a: landing line "20 + (-10) × 1.24 - 4.9 × 1.24² = 0.00 m" (y = 0 by definition)' },
  '4/projectile': {
    slider: 'R1: v0 "20.0" printed "20" (num)',
    inputSig: 'g = mars: ½g = 1.855 (4 figures)',
    recompute: 'R7a: landing line "0 + 10 sin 45° × 1.44 - 4.9 × 1.44² = 0.00 m"',
  },
  '6/friction': { slider: 'R1: m "2.0" printed "2"' },
  // Ch 9–11
  '9/track': { slider: 'R1: m1, m2, v1 "1.0" printed "1"' },
  '9/puck': { slider: 'R1: m2 "1.0" printed "1"' },
  '10/rotor': { slider: 'R1: rA, rB, m, tau "0.50" printed "0.5"' },
  '11/spin': { slider: 'R1: m, mDb "0.20" printed "0.2"' },
  // Ch 13–17
  '13/orbit': { inputSig: 'GM = 3.986×10¹⁴ (U, v_esc lines): 3 figures or a CONST entry' },
  '15/shm': { slider: 'R1: A, m, zeta "0.20" printed "0.2"', inputSig: 'x line: phase in degrees with 4 figures (tn(…, 4))' },
  '15/pendulum': {
    result: 'T₀, T print 4 figures (periodSig) against readouts 2.01, 2.04',
    inputSig: 'R5: error line (T - T₀)/T₀ on 4–6 figure periods; write 2K/π - 1 directly',
  },
  '16/reflect': { inputSig: 'y(L) = h - h on -0.1414 (R7a: same point, print 0)' },
  '16/resonance': { slider: 'R1: f "2.00" printed "2"' },
  '17/beats': { slider: 'R1: df "2.0" printed "2"' },
  // Ch 18–20
  '18/process': { inputSig: 'fixed tn(…, 4): 100.0, 10.00, 3.333 (T, W, p, Q, ΔE_int lines)' },
  '18/paths': { inputSig: 'fixed tn(…, 4): 10.00, 23.33 (W, Q lines)' },
  '19/pressure': { inputSig: 'fixed tn(…, 4) and k_B, m to 4 figures; R4 for the measured pressure' },
  '20/heat': { slider: 'R1: q "100" printed "100.0"', inputSig: 'fixed tn(…, 4): S/k 66.27, kT/ε lines' },
  '20/carnot': { inputSig: 'fixed tn(…, 4): n = 3.333, Q_H, Q_C, W lines' },
  // Ch 23–27
  '23/gauss': { inputSig: 'ε₀ = 8.854×10⁻¹²: CONST.eps0' },
  '24/potential': { inputSig: 'R7a: ΔV = V - V_A on 4–5 figure equal potentials (15.002 - 15.002); print 0' },
  '25/capacitor': { inputSig: 'ε₀ 8.854×10⁻¹², κ 1.00054 (one table string), fixed tn(…, 4) in C, Q, U, V, E' },
  '26/drift': {
    result: 'R4/R8: I = V/R = 100 mA next to the measured readout 103 mA',
    slider: 'R1: V, L, A "1.0" printed "1" or "1.000"',
    inputSig: 'fixed tn(…, 4): 1.500, 0.2500, 10.00 Ω; R4 for Ī',
  },
  '27/rc': { slider: 'R1: R "2.0" printed "2"', inputSig: 'R5: i = (12 - 11.9994552)/R; write i = (ℰ/R)e^{-t/τ}. V_C on 4-figure q' },
  // Ch 28–32
  '28/lorentz': { slider: 'R1: Bi "1.00" printed "1"', inputSig: 'mₚ, e, mₑ to 4 figures: CONST' },
  '28/cyclotron': { inputSig: 'e, mₚ to 4 figures (CONST); f, K lines with 4-figure inputs' },
  '29/biot': { inputSig: 'dB lines with 4-figure inputs (0.09167, 13.99°, 1.241)' },
  '30/faraday': { slider: 'R1: B, v "0.50" printed "0.5"', inputSig: 'Φ_B, ℰ lines with 4-figure x (0.4000, -1.200)' },
  '30/maxwell': { slider: 'R1: dBdt "1.0" printed "1"', inputSig: 'A = 0.1942 m² (4 figures)' },
  '31/ac': { slider: 'R1: ratio "0.80" printed "0.8"' },
  '32/materials': { slider: 'R1: T "0.50" printed "0.5"', inputSig: 'Onsager T_c = 2.269 (4 figures)' },
};

function cases(scene: Scene): { name: string; p: Params }[] {
  const base = defaults(scene.params) as Params;
  const out = [{ name: 'defaults', p: base }];
  for (const [k, spec] of Object.entries(scene.params)) {
    if (spec.kind === 'number') {
      const vs = spec.control === 'select' ? (spec.choices ?? []) : [spec.min ?? 0, spec.max ?? 1];
      for (const v of vs) out.push({ name: `${k}=${v}`, p: { ...base, [k]: v } });
    } else if (spec.kind === 'select') {
      for (const o of spec.options) if (o.value !== base[k]) out.push({ name: `${k}=${o.value}`, p: { ...base, [k]: o.value } });
    } else if (spec.kind === 'toggle') {
      out.push({ name: `${k}=${!base[k]}`, p: { ...base, [k]: !base[k] } });
    }
  }
  return out;
}

export function sigmaIssues(scene: Scene): string[] {
  const issues: string[] = [];
  if (!scene.formula) return issues;
  for (const c of cases(scene)) {
    const r = new Runner(scene, c.p as never, 1);
    const check = (when: string) => {
      const tag = `${scene.id} [${c.name}] ${when}`;
      let lines: string[];
      try {
        lines = scene.formula!(r.state as never, r.params as never);
      } catch (e) {
        issues.push(`${tag}: formula threw ${(e as Error).message}`);
        return;
      }
      if (!lines.length) issues.push(`${tag}: no lines`);
      for (const l of lines) {
        if (/NaN|undefined|Infinity|null/.test(l)) issues.push(`${tag}: bad value in ${l}`);
        try {
          katex.renderToString(l, { throwOnError: true, displayMode: true });
        } catch (e) {
          issues.push(`${tag}: KaTeX ${(e as Error).message.slice(0, 80)} in ${l}`);
        }
      }
    };
    check('t=0');
    if (scene.time) {
      r.play();
      for (let i = 0; i < STEPS && r.playing; i++) r.advance(scene.time.h);
      check(`t=${r.state.t.toFixed(2)}`);
    }
  }
  return issues;
}

describe('Σ formula panel', () => {
  for (const meta of [...CHAPTERS, ...REVIEW].filter((m) => m.load)) {
    it(`Ch ${String(meta.ch).padStart(2, '0')}: every formula line parses and has finite values`, async () => {
      const page = await meta.load!();
      const issues = page.scenes.flatMap((s) => sigmaIssues(s));
      expect(issues).toEqual([]);
    }, 120_000);
  }
});

describe('Σ digits: policy D (docs/design.md §3.3)', () => {
  const metas = [...CHAPTERS, ...REVIEW].filter((m) => m.load);
  for (const meta of metas) {
    it(`Ch ${String(meta.ch).padStart(2, '0')}: results, slider values, input figures, recomputation, small values`, async () => {
      const page = await meta.load!();
      const bad: string[] = [];
      for (const s of page.scenes) {
        const key = `${meta.ch}/${s.id}`;
        const issues = policyIssues(key, s);
        const waived = PENDING[key] ?? {};
        for (const c of CHECKS) {
          const l = issues.get(c)!;
          if (l.length && !waived[c]) bad.push(`${key} ${c} (${l.length}): ${l.slice(0, 3).join(' | ')}`);
          if (!l.length && waived[c]) bad.push(`${key} ${c}: passes now, remove it from PENDING`);
        }
      }
      expect(bad).toEqual([]);
    }, 120_000);
  }
  it('every PENDING key names a scene', async () => {
    const keys = new Set<string>();
    for (const meta of metas) for (const s of (await meta.load!()).scenes) keys.add(`${meta.ch}/${s.id}`);
    expect(Object.keys(PENDING).filter((k) => !keys.has(k))).toEqual([]);
  });
});

describe('tn: TeX numbers', () => {
  it('prints tiny physical constants when zeroTol = 0; rounding noise still prints 0 by default', async () => {
    const { tn, tp } = await import('../src/core/tex');
    expect(tn(1.602176634e-19, 3, 0)).toBe('1.60\\times 10^{-19}');
    expect(tn(8.854e-12, 4, 0)).toBe('8.854\\times 10^{-12}');
    expect(tn(1e-13)).toBe('0.00');
    expect(tp(-2.5e-19, 2, 0)).toBe('(-2.5\\times 10^{-19})');
  });
});

describe('Σ formula panel on every scene', () => {
  it('every scene of every chapter and review page has a formula', async () => {
    const missing: string[] = [];
    for (const meta of [...CHAPTERS, ...REVIEW].filter((m) => m.load)) {
      const page = await meta.load!();
      for (const s of page.scenes) if (!s.formula) missing.push(`Ch ${meta.ch} ${s.id}`);
    }
    expect(missing).toEqual([]);
  }, 120_000);
});
