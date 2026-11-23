// Σ formula panel checks shared by the sharded test files (sigma-all*.test.ts). Each check runs a
// scene at defaults, at every number param's min and max, every select option and every toggle
// flipped, at t = 0 and after running: (1) each line parses in KaTeX and shows no NaN / undefined /
// Infinity; (2) the digit policy D (docs/design.md §3.3, tests/sigma-policy.ts) holds except where
// PENDING says otherwise. Vitest runs files in parallel and the tests of one file in sequence, so
// the chapters are spread over several files (tests/sigma-all-*.test.ts) to keep the run short.
import katex from 'katex';
import { describe, expect, it } from 'vitest';
import { defaults } from '../src/core/params';
import { Runner } from '../src/core/runner';
import type { Params, Scene } from '../src/core/types';
import { CHAPTERS, REVIEW, type ChapterMeta } from '../src/sims/registry';
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
export const PENDING: Record<string, Partial<Record<Check, string>>> = {
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

/** Chapters and review pages that have a page to load. */
export const METAS = [...CHAPTERS, ...REVIEW].filter((m) => m.load);

const label = (meta: ChapterMeta) => `Ch ${String(meta.ch).padStart(2, '0')}`;

/** Both checks for the chapters this shard picks. */
export function sigmaSuites(pick: (meta: ChapterMeta) => boolean, which: { parse?: boolean; policy?: boolean } = { parse: true, policy: true }): void {
  const metas = METAS.filter(pick);
  if (which.parse)
    describe('Σ formula panel', () => {
      for (const meta of metas) {
        it(`${label(meta)}: every formula line parses and has finite values`, async () => {
          const page = await meta.load!();
          const issues = page.scenes.flatMap((s) => sigmaIssues(s));
          expect(issues).toEqual([]);
        }, 120_000);
      }
    });
  if (which.policy)
    describe('Σ digits: policy D (docs/design.md §3.3)', () => {
      for (const meta of metas) {
        it(`${label(meta)}: results, slider values, input figures, recomputation, small values`, async () => {
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
    });
}

/**
 * The heavy chapter: Ch 32 materials at T ≥ T_C runs several lattice sweeps and Wolff updates per
 * step (about 20 s for that one case), so each check gets its own file.
 */
export const HEAVY = new Set([32]);
/** Number of shards the other chapters are spread over. */
export const SHARDS = 4;
/** Shard k of the other chapters, round robin by position. */
export const shard = (k: number) => (meta: ChapterMeta) => !HEAVY.has(meta.ch) && METAS.indexOf(meta) % SHARDS === k;
