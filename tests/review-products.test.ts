// Addition under review: dot and cross products (→ Ch 3).
import { describe, expect, it } from 'vitest';
import { defaults } from '../src/core/params';
import { Rng } from '../src/core/rng';
import type { Params, Scene } from '../src/core/types';
import page from '../src/sims/review/products';
import { angleBetween, crossPolar, crossZ, dot, dotPolar, mag, placeTip, project, rotateTo, signedAngle, type V2 } from '../src/sims/review/products/physics';
import { crossScene, dotScene } from '../src/sims/review/products/scene';

const DEG = Math.PI / 180;

function randomVectors(n: number, seed = 7): [V2, V2][] {
  const rng = new Rng(seed);
  const r = () => (rng.next() * 2 - 1) * 5;
  return Array.from({ length: n }, () => [
    [r(), r()],
    [r(), r()],
  ]);
}

describe('products: component form = magnitude-angle form', () => {
  it('a·b = ab cos φ and (a×b)_z = ab sin φ to 1e-12 over random vectors', () => {
    for (const [a, b] of randomVectors(2000)) {
      const scale = Math.max(1, mag(a) * mag(b));
      expect(Math.abs(dot(a, b) - dotPolar(a, b)) / scale).toBeLessThan(1e-12);
      expect(Math.abs(crossZ(a, b) - crossPolar(a, b)) / scale).toBeLessThan(1e-12);
      // Pythagoras of the two products: (a·b)² + (a×b)² = a²b².
      expect(Math.abs(dot(a, b) ** 2 + crossZ(a, b) ** 2 - (mag(a) * mag(b)) ** 2) / scale ** 2).toBeLessThan(1e-12);
    }
  });

  it('default vectors a = (4, 1), b = (1, 3): a·b = 7, (a×b)_z = 11, φ = 57.53°', () => {
    const a: V2 = [4, 1];
    const b: V2 = [1, 3];
    expect(dot(a, b)).toBe(7);
    expect(crossZ(a, b)).toBe(11);
    expect(angleBetween(a, b) / DEG).toBeCloseTo(57.529, 3);
  });
});

describe('products: special angles', () => {
  it('perpendicular vectors: a·b = 0, |a×b| = ab', () => {
    for (const [a] of randomVectors(200, 3)) {
      const b: V2 = [-a[1] * 0.7, a[0] * 0.7];
      expect(Math.abs(dot(a, b))).toBeLessThan(1e-12);
      expect(Math.abs(dotPolar(a, b))).toBeLessThan(1e-12 * Math.max(1, mag(a) * mag(b)));
      expect(Math.abs(Math.abs(crossZ(a, b)) - mag(a) * mag(b))).toBeLessThan(1e-12 * Math.max(1, mag(a) * mag(b)));
    }
  });

  it('parallel and antiparallel vectors: a×b = 0, a·b = ±ab', () => {
    const a: V2 = [3, -2];
    expect(crossZ(a, [6, -4])).toBe(0);
    expect(crossZ(a, [-1.5, 1])).toBe(0);
    expect(dot(a, [6, -4])).toBeCloseTo(mag(a) * mag([6, -4]), 12);
    expect(dot(a, [-1.5, 1])).toBeCloseTo(-mag(a) * mag([-1.5, 1]), 12);
    expect(angleBetween(a, [-1.5, 1]) / DEG).toBeCloseTo(180, 10);
  });
});

describe('products: sign conventions', () => {
  it('x̂ × ŷ = +k̂ (out of the page), ŷ × x̂ = −k̂', () => {
    expect(crossZ([1, 0], [0, 1])).toBe(1);
    expect(crossZ([0, 1], [1, 0])).toBe(-1);
    expect(signedAngle([1, 0], [0, 1]) / DEG).toBeCloseTo(90, 12);
    expect(signedAngle([0, 1], [1, 0]) / DEG).toBeCloseTo(-90, 12);
  });

  it('b counter-clockwise from a (0 < φ < 180°) → (a×b)_z > 0; clockwise → < 0; b×a = −a×b', () => {
    for (const [a, b] of randomVectors(500, 11)) {
      const phi = signedAngle(a, b);
      if (Math.abs(Math.sin(phi)) < 1e-9) continue;
      expect(Math.sign(crossZ(a, b))).toBe(Math.sign(phi));
      expect(crossZ(b, a)).toBe(-crossZ(a, b));
    }
  });

  it('a·b > 0 for φ < 90°, < 0 for φ > 90°', () => {
    for (const [a, b] of randomVectors(500, 13)) {
      const phi = angleBetween(a, b);
      if (Math.abs(phi - Math.PI / 2) < 1e-9) continue;
      expect(Math.sign(dot(a, b))).toBe(phi < Math.PI / 2 ? 1 : -1);
    }
  });
});

describe('products: projection and parallelogram', () => {
  it('projection of b on a has signed length b cos φ and leaves a residual perpendicular to a', () => {
    for (const [a, b] of randomVectors(500, 17)) {
      const pr = project(b, a);
      const signed = dot(pr, a) / mag(a);
      expect(signed).toBeCloseTo(mag(b) * Math.cos(angleBetween(a, b)), 10);
      expect(Math.abs(dot([b[0] - pr[0], b[1] - pr[1]], a))).toBeLessThan(1e-10 * Math.max(1, mag(a) * mag(b)));
    }
  });

  it('|a × b| = area of the parallelogram O, a, a + b, b (shoelace) = a (b sin φ)', () => {
    for (const [a, b] of randomVectors(500, 19)) {
      const pts: V2[] = [[0, 0], a, [a[0] + b[0], a[1] + b[1]], b];
      let s2 = 0;
      for (let i = 0; i < 4; i++) {
        const [x0, y0] = pts[i];
        const [x1, y1] = pts[(i + 1) % 4];
        s2 += x0 * y1 - x1 * y0;
      }
      expect(Math.abs(s2 / 2)).toBeCloseTo(Math.abs(crossZ(a, b)), 10);
      const pr = project(b, a);
      const height = mag([b[0] - pr[0], b[1] - pr[1]]);
      expect(mag(a) * height).toBeCloseTo(Math.abs(crossZ(a, b)), 10);
    }
  });
});

describe('products: dragging', () => {
  it('placeTip keeps |v| ≤ lim, snaps to the 0.5 grid', () => {
    for (const [w] of randomVectors(500, 23)) {
      const big: V2 = [w[0] * 2, w[1] * 2];
      expect(mag(placeTip(big, false, 4.5))).toBeLessThanOrEqual(4.5 + 1e-9);
      const s = placeTip(big, true, 4.5);
      expect(mag(s)).toBeLessThanOrEqual(4.5 + 1e-9);
      expect(Object.is(s[0], -0)).toBe(false);
      expect(Math.abs(s[0] * 2) % 1).toBe(0);
      expect(Math.abs(s[1] * 2) % 1).toBe(0);
    }
  });

  it('rotateTo sets the signed angle from a, length kept (to the 0.001 rounding)', () => {
    const a: V2 = [4, 1];
    const b: V2 = [1, 3];
    for (const phiDeg of [-180, -135, -90, -30, 0, 45, 90, 120, 179]) {
      const r = rotateTo(a, b, phiDeg * DEG);
      expect(Math.abs(mag(r) - mag(b))).toBeLessThan(0.001);
      const got = signedAngle(a, r) / DEG;
      const diff = ((got - phiDeg + 540) % 360) - 180;
      expect(Math.abs(diff)).toBeLessThan(0.3);
    }
  });
});

describe('products: scenes', () => {
  const run = (sc: Scene, p: Params) => sc.formula!({ t: 0 }, p);

  it('dot formula panel: both forms give 7.00 for the defaults; b cos φ = 1.70', () => {
    const lines = run(dotScene, defaults(dotScene.params) as Params);
    expect(lines.length).toBeGreaterThanOrEqual(2);
    expect(lines.length).toBeLessThanOrEqual(5);
    expect(lines[1]).toMatch(/= 7\.00$/);
    expect(lines[2]).toMatch(/= 7\.00$/);
    expect(lines[3]).toMatch(/= 1\.70$/);
  });

  it('cross formula panel: both forms give 11.0, out of the page; into the page when swapped', () => {
    const p = defaults(crossScene.params) as Params;
    const lines = run(crossScene, p);
    expect(lines[1]).toMatch(/= 11\.0$/);
    expect(lines[2]).toMatch(/= 11\.0$/);
    expect(lines[3]).toMatch(/= 11\.0$/);
    expect(lines[4]).toContain('\\odot');
    const sw = run(crossScene, { ...p, A: [1, 3], B: [4, 1] });
    expect(sw[2]).toMatch(/= -11\.0$/);
    expect(sw[4]).toContain('\\otimes');
  });

  it('formula lines stay finite for zero, parallel and antiparallel vectors', () => {
    for (const sc of [dotScene, crossScene]) {
      const base = defaults(sc.params) as Params;
      for (const [A, B] of [
        [[0, 0], [1, 3]],
        [[0, 0], [0, 0]],
        [[2, 1], [4, 2]],
        [[2, 1], [-4, -2]],
      ]) {
        for (const line of run(sc, { ...base, A, B })) expect(line).not.toMatch(/NaN|Infinity|undefined/);
      }
    }
  });

  it('every i18n key of the page exists in ko and en; no em-dash; no $ glued to a letter or digit', () => {
    const keys = new Set<string>();
    for (const sc of page.scenes) {
      keys.add(sc.title);
      for (const sp of Object.values(sc.params)) {
        keys.add(sp.label);
        if (sp.desc) keys.add(sp.desc);
        if (sp.kind === 'select') for (const o of sp.options) keys.add(o.label);
      }
      for (const k of [...sc.info.goals, ...sc.info.observe, ...(sc.info.assumptions ?? [])]) keys.add(k);
    }
    for (const k of keys) {
      expect(page.i18n.ko[k], `ko ${k}`).toBeTruthy();
      expect(page.i18n.en[k], `en ${k}`).toBeTruthy();
    }
    for (const dict of [page.i18n.ko, page.i18n.en]) {
      for (const v of Object.values(dict)) {
        expect(v).not.toContain('\u2014');
        // Opening $ (even-numbered occurrences) never directly after a letter or digit.
        const parts = v.split('$');
        for (let i = 0; i < parts.length - 1; i += 2) expect(parts[i]).not.toMatch(/[\p{L}\p{N}]$/u);
      }
    }
  });
});
