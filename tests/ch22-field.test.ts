// Shared 2D field engine (src/sims/field), used by Ch 22–24, 29, 30.
import { describe, expect, it } from 'vitest';
import {
  adaptiveSimpson,
  chargeLines,
  circlePoly,
  closedCirc,
  closedFlux,
  contour,
  discOverlap,
  enclosed,
  fieldAt,
  fieldFn,
  potentialAt,
  splinePoly,
  squarePoly,
  ccw,
  winding,
  type Src,
} from '../src/sims/field/physics';
import { PARK, Pool } from '../src/sims/field/slots';
import { CLEAR, keepOff, surfacePoly, freeDefault } from '../src/sims/field/surface';
import { distToPoly } from '../src/sims/field/physics';

describe('field kernels', () => {
  it('point kernel is Coulomb: 1/r², radial, potential 1/r, E = −∇V', () => {
    const src: Src[] = [{ x: 0.1, y: -0.2, s: 2 }];
    const [fx, fy] = fieldAt(src, 'point', 0.1 + 0.3, -0.2 + 0.4);
    expect(Math.hypot(fx, fy)).toBeCloseTo(2 / 0.25, 10);
    expect(fx / fy).toBeCloseTo(0.3 / 0.4, 10);
    expect(potentialAt(src, 'point', 0.4, 0.2)).toBeCloseTo(2 / 0.5, 10);
    const two: Src[] = [
      { x: -0.3, y: 0, s: 1 },
      { x: 0.4, y: 0.1, s: -2 },
    ];
    const d = 1e-6;
    for (const k of ['point', 'line'] as const) {
      const [ex, ey] = fieldAt(two, k, 0.1, 0.35);
      const gx = -(potentialAt(two, k, 0.1 + d, 0.35) - potentialAt(two, k, 0.1 - d, 0.35)) / (2 * d);
      const gy = -(potentialAt(two, k, 0.1, 0.35 + d) - potentialAt(two, k, 0.1, 0.35 - d)) / (2 * d);
      expect(gx).toBeCloseTo(ex, 5);
      expect(gy).toBeCloseTo(ey, 5);
    }
  });

  it('wire kernel circles the wire counter-clockwise for s > 0 and is the curl of the stream function', () => {
    const w: Src[] = [{ x: 0, y: 0, s: 1 }];
    const [bx, by] = fieldAt(w, 'wire', 0.5, 0);
    expect(bx).toBeCloseTo(0, 12);
    expect(by).toBeCloseTo(2, 12);
    const pair: Src[] = [
      { x: -0.2, y: 0.1, s: 1 },
      { x: 0.3, y: -0.1, s: -1 },
    ];
    const d = 1e-6;
    const [Bx, By] = fieldAt(pair, 'wire', 0.05, 0.4);
    const dAy = (potentialAt(pair, 'wire', 0.05, 0.4 + d) - potentialAt(pair, 'wire', 0.05, 0.4 - d)) / (2 * d);
    const dAx = (potentialAt(pair, 'wire', 0.05 + d, 0.4) - potentialAt(pair, 'wire', 0.05 - d, 0.4)) / (2 * d);
    expect(dAy).toBeCloseTo(Bx, 5);
    expect(-dAx).toBeCloseTo(By, 5);
  });
});

describe('closed-path integrals', () => {
  it('adaptive Simpson integrates a peaked function', () => {
    const v = adaptiveSimpson((s) => 1 / (1e-4 + (s - 0.37) ** 2), 0, 1, 1e-9);
    const exact = (Math.atan(0.63 / 0.01) + Math.atan(0.37 / 0.01)) / 0.01;
    expect(Math.abs(v - exact) / exact).toBeLessThan(1e-6);
  });

  it('line-charge flux through any closed path is 2π × enclosed strength (Gauss in 2D)', () => {
    const src: Src[] = [
      { x: 0.05, y: 0.02, s: 2 },
      { x: 0.9, y: -0.1, s: -1 },
      { x: -0.25, y: 0.2, s: -1 },
    ];
    const f = fieldFn(src, 'line');
    const paths = [
      circlePoly(0, 0, 0.4, 160),
      squarePoly(0.1, 0.1, 0.3),
      ccw(surfacePoly('free', [0, 0.05, 0], freeDefault(0.45))),
    ];
    for (const poly of paths) {
      const flux = closedFlux(f, poly);
      const enc = enclosed(src, poly);
      expect(Math.abs(flux - 2 * Math.PI * enc)).toBeLessThan(1e-3 * 2 * Math.PI);
    }
    // design.md §8: circle flux = λ_enc/ε0 within 1e-3.
    const one: Src[] = [{ x: 0.1, y: 0, s: 1 }];
    expect(Math.abs(closedFlux(fieldFn(one, 'line'), circlePoly(0, 0, 0.5)) / (2 * Math.PI) - 1)).toBeLessThan(1e-3);
  });

  it('a source just outside contributes nothing; just inside, the full amount', () => {
    const poly = squarePoly(0, 0, 0.3);
    for (const [x, inside] of [
      [0.3 + CLEAR, 0],
      [0.3 - CLEAR, 1],
    ] as const) {
      const f = fieldFn([{ x, y: 0.1, s: 1 }], 'line');
      expect(Math.abs(closedFlux(f, poly) / (2 * Math.PI) - inside)).toBeLessThan(1e-4);
    }
  });

  it('wire circulation is 2π × enclosed current (Ampère in 2D); wire flux through a closed path is 0', () => {
    const src: Src[] = [
      { x: 0, y: 0, s: 1 },
      { x: 0.2, y: 0.1, s: 1 },
      { x: 0.7, y: 0, s: -1 },
    ];
    const f = fieldFn(src, 'wire');
    const poly = ccw(splinePoly([[-0.3, -0.3], [0.4, -0.25], [0.45, 0.3], [-0.2, 0.35]], 20));
    expect(enclosed(src, poly)).toBe(2);
    expect(Math.abs(closedCirc(f, poly) - 2 * Math.PI * 2)).toBeLessThan(1e-4);
    expect(Math.abs(closedFlux(f, poly))).toBeLessThan(1e-4);
  });

  it('winding number counts orientation', () => {
    const sq = squarePoly(0, 0, 1);
    expect(winding(sq, 0.2, 0.3)).toBe(1);
    expect(winding([...sq].reverse(), 0.2, 0.3)).toBe(-1);
    expect(winding(sq, 2, 0)).toBe(0);
  });

  it('disc overlap: disjoint, nested and half-way cases', () => {
    expect(discOverlap(1, 1, 3)).toBe(0);
    expect(discOverlap(1, 0.5, 0.2)).toBeCloseTo(Math.PI * 0.25, 12);
    // Two unit discs whose centres are 1 apart: 2π/3 − √3/2.
    expect(discOverlap(1, 1, 1)).toBeCloseTo((2 * Math.PI) / 3 - Math.sqrt(3) / 2, 12);
  });
});

describe('field lines and contours', () => {
  it('dipole lines leave the positive charge and end on the negative one', () => {
    const src: Src[] = [
      { x: -0.4, y: 0, s: 1 },
      { x: 0.4, y: 0, s: -1 },
    ];
    const lines = chargeLines(src, 'point', 8, 0.03, 0.005, [-3, -3, 3, 3]);
    expect(lines.length).toBe(8);
    let ended = 0;
    for (const l of lines) {
      expect(l[0]).toBeCloseTo(-0.4, 12);
      const x = l[l.length - 2];
      const y = l[l.length - 1];
      if (Math.hypot(x - 0.4, y) < 0.031) ended += 1;
    }
    // Lines close to the axis on the far side escape the bounds; most end on −q.
    expect(ended).toBeGreaterThanOrEqual(6);
  });

  it('contours of r² on a grid are circles', () => {
    const n = 41;
    const vals = new Float64Array(n * n);
    for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) vals[j * n + i] = (i - 20) ** 2 + (j - 20) ** 2;
    const lines = contour(vals, n, n, 100);
    expect(lines.length).toBe(1);
    const l = lines[0];
    for (let k = 0; k < l.length; k += 2) expect(Math.hypot(l[k] - 20, l[k + 1] - 20)).toBeCloseTo(10, 0);
    // Closed: last point equals the first.
    expect(l[l.length - 2]).toBeCloseTo(l[0], 12);
    expect(l[l.length - 1]).toBeCloseTo(l[1], 12);
  });
});

describe('slot pool and surface helpers', () => {
  it('fills preset kinds in slot order and parks the rest', () => {
    const pool = new Pool([1, 2, -1, -2], [2, 1, 2, 1]);
    const c = pool.fromPreset([
      [0, 0.1, 0.2],
      [2, -0.3, 0],
      [0, 0.5, 0.5],
    ]);
    const s = pool.sources(c);
    expect(s.map((v) => v.s)).toEqual([1, 1, -1]);
    expect(pool.available(c)).toEqual([false, true, true, true]);
    expect(pool.blank().length).toBe(1 + 2 * pool.size);
    expect(pool.coords(pool.blank(), 0, [[1, 0, 0]]).filter((v) => v !== PARK).length).toBe(2);
  });

  it('keepOff pushes a point to the clearance distance on its own side', () => {
    const poly = circlePoly(0, 0, 0.5, 200);
    const out = keepOff(poly, { x: 0.49, y: 0 });
    expect(distToPoly(poly, out.x, out.y)).toBeCloseTo(CLEAR, 3);
    expect(out.x).toBeLessThan(0.5);
    const far = keepOff(poly, { x: 0.2, y: 0 });
    expect(far.x).toBe(0.2);
  });
});
