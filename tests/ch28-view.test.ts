import { describe, expect, it } from 'vitest';
import { viewR } from '../src/sims/ch28/lorentz';
import { PARTICLES, radius } from '../src/sims/ch28/physics';

describe('ch28 Lorentz view at strong fields', () => {
  it('zooms in as √B: the largest circle stays half the view at B = 2 and still shrinks with B', () => {
    for (const [particle, key, unit] of [
      ['proton', 'Bi', 1],
      ['electron', 'Be', 1e-3],
      ['alpha', 'Bi', 1],
    ] as const) {
      const pt = PARTICLES[particle];
      const at = (b: number) => ({ particle, Be: 1, Bi: 1, compare: true, v: 3, [key]: b });
      const drawn = (b: number) => (radius(pt, 3e6, b * unit) * 100) / viewR(at(b));
      // Unchanged at the weakest field: the largest circle fills the view half-width.
      expect(drawn(0.5)).toBeCloseTo(1, 9);
      // Before: 0.25 at B = 2 (fixed view); now 0.5, still monotonic in B.
      expect(drawn(2)).toBeCloseTo(0.5, 9);
      expect(drawn(1)).toBeGreaterThan(drawn(2));
      expect(drawn(0.5)).toBeGreaterThan(drawn(1));
    }
  });
});
