import { describe, expect, it } from 'vitest';
import { EPS0, circlePoly, selfIntersects, splinePoly, squarePoly, winding } from '../src/sims/field/physics';
import { defaults } from '../src/core/params';
import type { Handle, ParamValue, Params } from '../src/core/types';
import { RING_GAP, RING_W, gaussScene, lineChargeGlyph } from '../src/sims/ch23/scene';
import { chargeGlyph } from '../src/sims/field/render';
import { ProbeDraw } from './stage-probe';
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

describe('ch23 line charges drawn end-on, distinct from point charges (review §0-1)', () => {
  type C = { x: number; y: number; r: number; role?: string; fill?: string };
  function circlesOf(p: Params, w: number, h: number): C[] {
    const circles: C[] = [];
    const g = new (class extends ProbeDraw {
      circle(c: { x: number; y: number }, r: number, st?: { role?: string; fill?: string }): void {
        const [x, y] = this.vp.toPx(c.x, c.y);
        circles.push({ x, y, r, role: st?.role, fill: st?.fill });
      }
    })(w, h);
    g.vp.fit(gaussScene.world(p as never), w, h);
    gaussScene.draw(g, { t: 0 }, p as never, { t: 0, cursorT: 0, scrubbing: false, lecture: false });
    return circles;
  }

  it('± disc inside a ring of the same colour on a white halo, on the stage and in the tray, every view and screen', () => {
    for (const [w, h] of [
      [1280, 800],
      [390, 844],
    ])
      for (const view of ['lines', 'vectors', 'off']) {
        const p = { ...defaults(gaussScene.params), view } as Params;
        const circles = circlesOf(p, w, h);
        const src = LINE_POOL.sources(LINE_POOL.fromPreset(LINE_LAYOUT));
        for (const c of src) {
          const r = Math.abs(c.s) > 1.5 ? 13 : 10;
          const role = c.s > 0 ? 'positive' : 'negative';
          const ring = circles.filter((k) => Math.abs(k.r - r - RING_GAP) < 1e-9 && k.role === role && k.fill === '#ffffff');
          const disc = circles.filter((k) => k.r === r && k.fill === role);
          // Concentric: the ring sits around the disc with a visible gap.
          expect(ring.some((a) => disc.some((d) => Math.hypot(a.x - d.x, a.y - d.y) < 1e-9))).toBe(true);
        }
        // Tray chips for ±2 carry the ring too; neighbouring chips (44 px apart) do not touch.
        for (const role of ['positive', 'negative']) expect(circles.some((k) => Math.abs(k.r - 13 - RING_GAP) < 1e-9 && k.role === role)).toBe(true);
        expect(2 * (13 + RING_GAP + RING_W / 2)).toBeLessThan(44);
      }
    // Every disc drawn has its ring (rings = discs).
    const all = circlesOf(defaults(gaussScene.params), 390, 844);
    expect(all.filter((k) => k.fill === '#ffffff' && k.role !== undefined).length).toBe(all.filter((k) => k.fill === 'positive' || k.fill === 'negative').length);
  });

  it('lineChargeGlyph draws ring then disc; the shared point-charge glyph (Ch 22, 24) stays without a ring', () => {
    const rec = (f: (g: ProbeDraw) => void) => {
      const out: { r: number; role?: string }[] = [];
      const g = new (class extends ProbeDraw {
        circle(_c: unknown, r: number, st?: { role?: string }): void {
          out.push({ r, role: st?.role });
        }
      })(400, 400);
      f(g);
      return out;
    };
    expect(rec((g) => lineChargeGlyph(g, { x: 0, y: 0 }, -1))).toEqual([{ r: 10 + RING_GAP, role: 'negative' }, { r: 10, role: undefined }]);
    expect(rec((g) => chargeGlyph(g, { x: 0, y: 0 }, 2)).map((c) => c.role)).toEqual([undefined]);
  });
});

describe('QA 2026-11-24 (P3): the Gaussian surface and its knobs stay on the ±0.8 m stage', () => {
  type PP = Params & { shape: string; G: number[]; F: number[] };
  class Ctx {
    constructor(public params: PP) {}
    set(k: string, v: ParamValue) {
      this.params = { ...this.params, [k]: v };
    }
  }
  const hs = gaussScene.handles as unknown as Handle<{ t: number }, PP>[];
  const centre = hs[hs.length - 10];
  const rim = hs[hs.length - 9];
  const inBox = (p: PP) => {
    for (const [x, y] of surfacePoly(p.shape, p.G, p.F)) {
      expect(Math.abs(x)).toBeLessThanOrEqual(1.15 + 0.01);
      expect(Math.abs(y)).toBeLessThanOrEqual(0.75 + 0.01);
    }
    for (const h of [centre, rim]) {
      if (h.when && !h.when(p)) continue;
      const k = h.pos({ t: 0 }, p);
      expect(Math.abs(k.y)).toBeLessThanOrEqual(0.75 + 1e-9);
      expect(Math.abs(k.x)).toBeLessThanOrEqual(1.15 + 1e-9);
    }
  };
  it('rim pulled far out, centre pushed to every corner, for the circle, the square and the free curve', () => {
    for (const shape of ['circle', 'square', 'free']) {
      const c = new Ctx({ ...(defaults(gaussScene.params) as PP), shape });
      for (const w of [
        { x: 2, y: -2 },
        { x: 0.3, y: -1.5 },
        { x: 1.9, y: 0.1 },
      ]) {
        if (shape !== 'free') rim.onDrag(c as never, { t: 0 }, w);
        inBox(c.params);
        for (const corner of [
          { x: 2, y: 2 },
          { x: -2, y: -2 },
          { x: 1.3, y: -0.2 },
          { x: -0.1, y: 0.9 },
        ]) {
          centre.onDrag(c as never, { t: 0 }, corner);
          inBox(c.params);
        }
      }
      // The circle still grows to the largest size that fits (0.75 m about the stage centre).
      if (shape === 'circle') {
        centre.onDrag(c as never, { t: 0 }, { x: 0, y: 0 });
        rim.onDrag(c as never, { t: 0 }, { x: 3, y: -3 });
        expect(c.params.G[2]).toBeGreaterThan(0.7);
        expect(c.params.G[2]).toBeLessThanOrEqual(0.75);
      }
    }
  });
});
