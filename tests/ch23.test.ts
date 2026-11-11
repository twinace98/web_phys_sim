import { describe, expect, it } from 'vitest';
import { EPS0, circlePoly, squarePoly } from '../src/sims/field/physics';
import { ENC_FLUX, LINE_E, LINE_LAYOUT, LINE_POOL, gauss } from '../src/sims/ch23/physics';
import { freeDefault, surfacePoly } from '../src/sims/field/surface';

describe('ch23 Gauss law for line charges', () => {
  it('E of a line charge is λ/(2π ε0 r)', () => {
    expect(LINE_E).toBeCloseTo(1e-9 / (2 * Math.PI * EPS0), 6);
    expect(ENC_FLUX).toBeCloseTo(112.94, 2);
  });

  it('circle flux equals λ_enc/ε0 within 1e-3 (design.md §8)', () => {
    const src = [{ x: 0.1, y: 0.05, s: 2 }];
    const { flux, rhs } = gauss(src, circlePoly(0, 0, 0.4));
    expect(Math.abs(flux / rhs - 1)).toBeLessThan(1e-3);
  });

  it('default layout: +2 inside the default circle, −1 outside; flux = 2/ε0 per nC/m', () => {
    const src = LINE_POOL.sources(LINE_POOL.fromPreset(LINE_LAYOUT));
    const { flux, rhs, enc } = gauss(src, surfacePoly('circle', [-0.3, 0, 0.4], []));
    expect(enc).toBe(2);
    expect(Math.abs(flux - rhs)).toBeLessThan(1e-3 * rhs);
  });

  it('flux steps by λ/ε0 when a charge crosses the surface, for any shape', () => {
    const shapes = [circlePoly(0, 0, 0.35), squarePoly(0, 0, 0.3), surfacePoly('free', [0, 0, 0], freeDefault(0.4))];
    for (const poly of shapes) {
      const inside = gauss([{ x: 0.05, y: 0.02, s: -1 }, { x: 0.9, y: 0.3, s: 2 }], poly);
      const outside = gauss([{ x: 0.7, y: 0.02, s: -1 }, { x: 0.9, y: 0.3, s: 2 }], poly);
      expect(Math.abs(inside.flux + ENC_FLUX)).toBeLessThan(0.05);
      expect(Math.abs(outside.flux)).toBeLessThan(0.05);
    }
  });
});
