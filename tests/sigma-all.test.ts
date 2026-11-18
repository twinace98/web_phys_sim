// Σ formula panel (Scene.formula) on every scene that has one: at defaults, at every number
// param's min and max, every select option and every toggle flipped, at t = 0 and after running,
// each line parses in KaTeX and shows no NaN / undefined / Infinity.
// Filter one chapter with: npx vitest run tests/sigma-all.test.ts -t "Ch 05"
import katex from 'katex';
import { describe, expect, it } from 'vitest';
import { defaults } from '../src/core/params';
import { Runner } from '../src/core/runner';
import type { Params, Scene } from '../src/core/types';
import { CHAPTERS, REVIEW } from '../src/sims/registry';

const STEPS = 600;

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
