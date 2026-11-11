import { describe, expect, it } from 'vitest';
import { viewR } from '../src/sims/ch28/lorentz';
import { PARTICLES, radius } from '../src/sims/ch28/physics';

describe('ch28 Lorentz view scale', () => {
  it('fixed per species: the drawn radius falls exactly as 1/B (doubling B halves the circle)', () => {
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
      expect(drawn(1)).toBeCloseTo(0.5, 9);
      expect(drawn(2)).toBeCloseTo(0.25, 9);
    }
  });
});
