// Σ formula panel: checks that cover every chapter at once. The per-chapter checks (KaTeX parse,
// policy D digits) run in tests/sigma-all-*.test.ts, sharded so Vitest runs them in parallel.
// Filter one chapter with: npx vitest run tests/sigma-all -t "Ch 05"
import { describe, expect, it } from 'vitest';
import { HEAVY, METAS, PENDING, SHARDS, shard } from './sigma-all.shared';
import { CHAPTERS, REVIEW } from '../src/sims/registry';

describe('Σ checks: shards', () => {
  it('every chapter is in exactly one shard or is a heavy chapter with its own files', () => {
    for (const meta of METAS) {
      const n = Array.from({ length: SHARDS }, (_, k) => shard(k)(meta)).filter(Boolean).length + (HEAVY.has(meta.ch) ? 1 : 0);
      expect(n, `Ch ${meta.ch}`).toBe(1);
    }
  });
  it('every PENDING key names a scene', async () => {
    const keys = new Set<string>();
    for (const meta of METAS) for (const s of (await meta.load!()).scenes) keys.add(`${meta.ch}/${s.id}`);
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
