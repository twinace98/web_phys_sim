// Every log slider in every scene lands exactly on its default and on each of its marks
// (review 2026-11-20: 106 M1 = 1 showed 0.989 / 1.01, Ch 38 vₑ = 4.36×10⁶ was unreachable).
import { describe, expect, it } from 'vitest';
import { decode, logIndex, logStops } from '../src/core/params';
import type { NumberParam } from '../src/core/types';
import { CHAPTERS, REVIEW } from '../src/sims/registry';

describe('log sliders reach their default and marks', () => {
  it('every scene', async () => {
    let n = 0;
    for (const meta of [...CHAPTERS, ...REVIEW].filter((m) => m.load)) {
      const page = await meta.load!();
      for (const scene of page.scenes)
        for (const [key, spec] of Object.entries(scene.params)) {
          if (spec.kind !== 'number' || !spec.log) continue;
          const sp = spec as NumberParam;
          const stops = logStops(sp);
          for (const v of [sp.default, ...(sp.marks ?? [])]) {
            const where = `${meta.id ?? ''} ${scene.id}.${key} = ${v}`;
            expect(stops, where).toContain(v);
            // The thumb placed for v gives v back, and a URL with v keeps it.
            expect(stops[logIndex(sp, v)], where).toBe(v);
            expect(decode(sp, String(v)), where).toBe(v);
          }
          // Both ends stay reachable.
          expect(stops[0]).toBe(sp.min);
          expect(stops[stops.length - 1]).toBe(sp.max);
          n++;
        }
    }
    expect(n).toBeGreaterThanOrEqual(8);
  });
});
