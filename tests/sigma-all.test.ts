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
