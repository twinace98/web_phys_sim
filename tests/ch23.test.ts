import { describe, expect, it } from 'vitest';
import { EPS0, circlePoly, selfIntersects, splinePoly, squarePoly, winding } from '../src/sims/field/physics';
import { defaults } from '../src/core/params';
import type { Handle, ParamValue, Params } from '../src/core/types';
import { gaussScene } from '../src/sims/ch23/scene';
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

describe('ch23 free curve never crosses itself (QA E2)', () => {
  type PP = Params & { shape: string; G: number[]; F: number[] };
  class Ctx {
    sets = 0;
    constructor(public params: PP) {}
    set(k: string, v: ParamValue) {
      this.sets++;
      this.params = { ...this.params, [k]: v };
    }
  }
  const handles = gaussScene.handles as unknown as Handle<{ t: number }, PP>[];
  /** Control-point handle i of the free curve (the last eight handles). */
  const ctrl = (i: number) => handles[handles.length - 8 + i];

  it('a figure 8 has winding −1 in one lobe: that is why it must be refused', () => {
    // Lobes around (−0.3, 0) and (0.3, 0), crossing at the origin.
    const eight = splinePoly(
      [
        [0, 0],
        [0.3, 0.2],
        [0.5, 0],
        [0.3, -0.2],
        [0, 0.001],
        [-0.3, 0.2],
        [-0.5, 0],
        [-0.3, -0.2],
      ],
      16,
    );
    expect(selfIntersects(eight)).toBe(true);
    expect(Math.abs(winding(eight, -0.3, 0))).toBe(1);
    expect(winding(eight, -0.3, 0)).toBe(-winding(eight, 0.3, 0));
    expect(selfIntersects(surfacePoly('free', [0, 0, 0], freeDefault(0.4)))).toBe(false);
    expect(selfIntersects(circlePoly(0, 0, 0.4))).toBe(false);
    expect(selfIntersects(squarePoly(0, 0, 0.4))).toBe(false);
  });

  it('dragging a control point across the curve is refused; an ordinary drag still works', () => {
    const p0 = { ...defaults(gaussScene.params), shape: 'free' } as unknown as PP;
    const [cx, cy] = p0.G;
    // Pull the top control point (index 2) down below the bottom one: the curve would cross itself.
    const c = new Ctx(p0);
    ctrl(2).onDrag(c as never, { t: 0 }, { x: cx, y: cy - 0.62 });
    expect(c.sets).toBe(0);
    expect(c.params.F).toEqual(p0.F);
    // A small outward pull is accepted and the curve stays simple.
    ctrl(2).onDrag(c as never, { t: 0 }, { x: cx + 0.02, y: cy + 0.5 });
    expect(c.sets).toBe(1);
    expect(selfIntersects(surfacePoly('free', c.params.G, c.params.F))).toBe(false);
  });
});
