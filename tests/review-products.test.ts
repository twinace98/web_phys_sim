// Addition under review: dot and cross products (→ Ch 3).
import { afterEach, describe, expect, it } from 'vitest';
import { fmt } from '../src/core/format';
import { defaults } from '../src/core/params';
import { Rng } from '../src/core/rng';
import type { Params, Scene, Vec2 } from '../src/core/types';
import type { LabelStyle, Stroke } from '../src/draw/draw';
import { Inset } from '../src/sims/inset/inset';
import page from '../src/sims/review/products';
import {
  across,
  along,
  angleBetween,
  crossPolar,
  crossZ,
  dot,
  dotPolar,
  mag,
  placeTip,
  project,
  reject,
  rotateTo,
  shearRect,
  signedAngle,
  signedArea,
  type V2,
} from '../src/sims/review/products/physics';
import { crossScene, dotBox, dotScene, dotSplit, panels, plotBars, plotBound } from '../src/sims/review/products/scene';
import { ProbeDraw } from './stage-probe';

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

  it('dot formula panel: b cos φ = 1.70, a (b cos φ) = (4.12)(1.70) = 7.00 = component form', () => {
    const base = defaults(dotScene.params) as Params;
    const lines = run(dotScene, base);
    expect(lines.length).toBeGreaterThanOrEqual(2);
    expect(lines.length).toBeLessThanOrEqual(5);
    expect(lines[0]).toContain('a\\,(b\\cos\\varphi)');
    expect(lines[1]).toBe('b\\cos\\varphi = (3.16)\\cos 57.5^\\circ = 1.70');
    expect(lines[2]).toBe('a\\,(b\\cos\\varphi) = (4.12)(1.70) = 7.00');
    expect(lines[3]).toMatch(/= 7\.00$/);
    // "a onto b": the other factorisation, b (a cos φ) = (3.16)(2.21) = 7.00.
    const la = run(dotScene, { ...base, proj: 'a' });
    expect(la[1]).toBe('a\\cos\\varphi = (4.12)\\cos 57.5^\\circ = 2.21');
    expect(la[2]).toBe('b\\,(a\\cos\\varphi) = (3.16)(2.21) = 7.00');
    // Obtuse: negative projection, negative product.
    const ob = run(dotScene, { ...base, B: [-3, 1] });
    expect(ob[1]).toMatch(/= -2\.67$/);
    expect(ob[2]).toBe('a\\,(b\\cos\\varphi) = (4.12)(-2.67) = -11.0');
  });

  it('cross formula panel: b sin φ = 2.67, a (b sin φ) = (4.12)(2.67) = 11.0, out of the page; into it when swapped', () => {
    const p = defaults(crossScene.params) as Params;
    const lines = run(crossScene, p);
    expect(lines.length).toBeLessThanOrEqual(5);
    expect(lines[0]).toContain('a\\,(b\\sin\\varphi)');
    expect(lines[1]).toBe('b\\sin\\varphi = (3.16)\\sin(57.5^\\circ) = 2.67');
    expect(lines[2]).toBe('a\\,(b\\sin\\varphi) = (4.12)(2.67) = 11.0');
    expect(lines[3]).toMatch(/= 11\.0$/);
    expect(lines[4]).toContain('\\odot');
    const sw = run(crossScene, { ...p, A: [1, 3], B: [4, 1] });
    expect(sw[1]).toMatch(/= -3\.48$/);
    expect(sw[2]).toMatch(/= -11\.0$/);
    expect(sw[3]).toMatch(/= -11\.0$/);
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

// ------------------------------------------------------------------ drawn bars, areas, labels

/** ProbeDraw that also keeps polygons, lines and every text with its size. */
class RecDraw extends ProbeDraw {
  polys: { pts: Vec2[]; st: Stroke & { fill?: string; fillAlpha?: number } }[] = [];
  lines: { a: Vec2; b: Vec2; st: Stroke }[] = [];
  polylines: { pts: Vec2[]; st: Stroke }[] = [];
  labels: { text: string; x: number; y: number; w: number; size: number; screen: boolean }[] = [];
  polygon(pts: Vec2[], st: Stroke & { fill?: string; fillAlpha?: number } = {}): void {
    this.polys.push({ pts, st });
  }
  line(a?: Vec2, b?: Vec2, st: Stroke = {}): void {
    if (a && b) this.lines.push({ a, b, st });
  }
  polyline(pts?: Vec2[], st: Stroke = {}): void {
    if (pts) this.polylines.push({ pts, st });
  }
  screenText(x: number, y: number, s: string, st: LabelStyle = {}): void {
    super.screenText(x, y, s, st);
    const m = this.marks[this.marks.length - 1];
    this.labels.push({ text: s, x: m.x, y, w: m.w, size: st.size ?? 12, screen: true });
  }
  text(p: Vec2, s: string, st: LabelStyle = {}): void {
    super.text(p, s, st);
    const m = this.marks[this.marks.length - 1];
    // Tick labels: middle baseline in the plane; alphabetic (centre ~4 px higher) under the plot axis.
    const y = st.baseline === 'middle' ? m.y : m.y - 4;
    this.labels.push({ text: s, x: m.x, y, w: m.w, size: st.size ?? 12, screen: false });
  }
}

const win = globalThis as unknown as { window?: unknown };
function phone(on: boolean): void {
  if (on) win.window = { matchMedia: () => ({ matches: true }) };
  else delete win.window;
}
afterEach(() => phone(false));

/** Stage sizes measured in the browser: 1280×800 and 390×844 pages. */
const STAGES = [
  { name: 'desktop', w: 1280, h: 705, narrow: false },
  { name: 'phone', w: 390, h: 660, narrow: true },
];
const DOT_L = { lim: 5, axis: 5.6, half: 6.1, box: true };
const CROSS_L = { lim: 4.5, axis: 9.6, half: 10.1, box: false };

function rec(sc: Scene, p: Params, w: number, h: number): RecDraw {
  const g = new RecDraw(w, h);
  g.vp.fit(sc.world(p), w, h);
  sc.draw(g, { t: 0 }, p, { t: 0, cursorT: 0, scrubbing: false, lecture: false });
  return g;
}

const near = (u: Vec2, v: Vec2, tol = 1e-9) => Math.hypot(u.x - v.x, u.y - v.y) < tol;
const mid = (u: Vec2, v: Vec2): Vec2 => ({ x: (u.x + v.x) / 2, y: (u.y + v.y) / 2 });
/** Square-ended band polygon p+n, q+n, q−n, p−n → its axis p → q. */
const bandAxis = (pts: Vec2[]): [Vec2, Vec2] => [mid(pts[0], pts[3]), mid(pts[1], pts[2])];

/** Vectors every 15° of φ for five magnitude sets (both ≤ lim), plus degenerate pairs. */
function cases(lim: number): [V2, V2][] {
  const out: [V2, V2][] = [];
  const r2 = (v: number) => Math.round(v * 100) / 100 || 0;
  for (const [la, lb, th] of [
    [4.12, 3.16, 14],
    [lim, lim, 0],
    [0.5, lim * 0.9, 30],
    [lim * 0.9, 0.5, -70],
    [2, 2, 135],
  ])
    for (let ph = -180; ph <= 180; ph += 15) {
      const t = (th * Math.PI) / 180;
      const u = t + (ph * Math.PI) / 180;
      out.push([
        [r2(la * Math.cos(t)), r2(la * Math.sin(t))],
        [r2(lb * Math.cos(u)), r2(lb * Math.sin(u))],
      ]);
    }
  out.push(
    [
      [0, 0],
      [1, 3],
    ],
    [
      [4, 1],
      [0, 0],
    ],
    [
      [4, 1],
      [2, 0.5],
    ],
    [
      [4, 1],
      [-4, -1],
    ],
  );
  return out;
}

describe('products: the factorisation', () => {
  it('a·b = a (b cos φ), (a×b)_z = a (b sin φ) to 1e-9; the sheared rectangle has the signed area (a×b)_z', () => {
    for (const [a, b] of randomVectors(1000, 29)) {
      const tol = 1e-9 * Math.max(1, mag(a) * mag(b));
      expect(Math.abs(mag(a) * along(b, a) - dot(a, b))).toBeLessThan(tol);
      expect(Math.abs(mag(a) * across(b, a) - crossZ(a, b))).toBeLessThan(tol);
      expect(Math.abs(mag(reject(b, a)) - Math.abs(across(b, a)))).toBeLessThan(1e-9 * Math.max(1, mag(b)));
      const r = shearRect(a, b);
      expect(Math.abs(signedArea(r) - crossZ(a, b))).toBeLessThan(tol);
      // Shares the parallelogram's top edge b → a + b; base of length a on the line of a.
      expect(r[3]).toEqual(b);
      expect(r[2]).toEqual([a[0] + b[0], a[1] + b[1]]);
      expect(Math.abs(crossZ(a, r[0]))).toBeLessThan(tol);
      expect(Math.abs(mag([r[1][0] - r[0][0], r[1][1] - r[0][1]]) - mag(a))).toBeLessThan(1e-9 * Math.max(1, mag(a)));
    }
  });
});

describe('products: drawn bars and areas equal the products', () => {
  for (const st of STAGES) {
    it(`dot tab (${st.name}): projection band, plot bars and the product rectangle`, () => {
      phone(st.narrow);
      const base = defaults(dotScene.params) as Params;
      for (const proj of ['b', 'a'])
        for (const [A, B] of cases(5)) {
          const p = { ...base, proj, A, B } as unknown as Parameters<typeof dotSplit>[0];
          const g = rec(dotScene as unknown as Scene, p as unknown as Params, st.w, st.h);
          const sp = dotSplit(p);
          const d = dot(A, B);
          // Plot: the bars from the zero line reach the factor and the product (data units).
          const yb = plotBound(mag(A) * mag(B), mag(sp.other));
          const ins = new Inset(g, panels(DOT_L).plot, [0, 180], [-yb, yb]);
          const phi = (angleBetween(A, B) * 180) / Math.PI;
          const bars = plotBars(ins, { phi, y: d, yh: sp.L > 1e-9 ? sp.fac : 0 });
          const toData = (v: Vec2) => -yb + ((v.y - ins.r.y0) / (ins.r.y1 - ins.r.y0)) * 2 * yb;
          expect(Math.abs(toData(bars.prod[1]) - d)).toBeLessThan(1e-9);
          expect(Math.abs(toData(bars.prod[0]))).toBeLessThan(1e-9);
          expect(g.lines.some((l) => near(l.a, bars.prod[0]) && near(l.b, bars.prod[1]))).toBe(true);
          if (sp.L > 1e-9 && Math.abs(sp.fac) > 1e-9) {
            expect(Math.abs(toData(bars.fac[1]) - sp.fac)).toBeLessThan(1e-9);
            // Product bar = L × factor bar (one numeric scale).
            expect(Math.abs(toData(bars.prod[1]) - sp.L * toData(bars.fac[1]))).toBeLessThan(1e-9);
            const drawn = g.polys.filter((q) => q.pts.length === 4 && q.st.fill === sp.role).map((q) => bandAxis(q.pts));
            expect(drawn.some(([u, v]) => near(u, bars.fac[0]) && near(v, bars.fac[1]))).toBe(true);
            // Plane: the projection band runs from O to the foot (signed length b cos φ along a).
            const foot = project(sp.other, sp.base);
            expect(drawn.some(([u, v]) => near(u, { x: 0, y: 0 }) && near(v, { x: foot[0], y: foot[1] }))).toBe(true);
          }
          // Product rectangle: width L, height the factor, signed area L × factor = a·b (k² per unit²).
          const bx = dotBox(g, p);
          if (sp.L < 1e-9) {
            expect(bx).toBeNull();
            continue;
          }
          const area = ((bx!.x1 - bx!.x0) * (bx!.y1 - bx!.ym)) / bx!.k ** 2;
          expect(Math.abs(area - d)).toBeLessThan(1e-9);
          expect(Math.abs((bx!.x1 - bx!.x0) / bx!.k - sp.L)).toBeLessThan(1e-9);
          if (Math.abs(d) > 1e-9) {
            // Below the line exactly when a·b < 0; the drawn polygon has that area.
            expect(Math.sign(bx!.y1 - bx!.ym)).toBe(Math.sign(d));
            const rect = g.polys.find((q) => q.pts.length === 4 && q.st.fill === 'fg' && near(q.pts[0], { x: bx!.x0, y: bx!.ym }));
            expect(rect).toBeTruthy();
            expect(Math.abs(Math.abs(signedArea(rect!.pts.map((v): V2 => [v.x, v.y]))) / bx!.k ** 2 - Math.abs(d))).toBeLessThan(1e-9);
            // The factor side is the band of the same colour as on the plane.
            const fb = g.polys.filter((q) => q.pts.length === 4 && q.st.fill === sp.role).map((q) => bandAxis(q.pts));
            expect(fb.some(([u, v]) => near(u, { x: bx!.x0, y: bx!.ym }) && near(v, { x: bx!.x0, y: bx!.y1 }))).toBe(true);
            // Hatched only when negative.
            const hatch = g.lines.filter((l) => l.st.color === '#5c5c5c' && l.st.alpha === 0.6).length;
            expect(hatch > 0).toBe(d < 0);
          }
          // The rectangle fits its panel.
          const r = panels(DOT_L).box!;
          expect(bx!.x1).toBeLessThanOrEqual(r.x1 + 1e-9);
          expect(Math.abs(bx!.y1 - bx!.ym)).toBeLessThanOrEqual((r.y1 - r.y0) / 2 + 1e-9);
        }
    });

    it(`cross tab (${st.name}): height band F → b, sheared rectangle, plot bars`, () => {
      phone(st.narrow);
      const base = defaults(crossScene.params) as Params;
      for (const [A, B] of cases(4.5)) {
        const g = rec(crossScene as unknown as Scene, { ...base, A, B }, st.w, st.h);
        const cz = crossZ(A, B);
        const hs = across(B, A);
        const r = shearRect(A, B);
        if (mag(A) > 1e-9 && Math.abs(hs) > 1e-6) {
          // Band from the foot F to b's tip: length |b sin φ|; × a = |a × b|.
          const bands = g.polys.filter((q) => q.pts.length === 4 && q.st.fill === 'energyU' && q.st.fillAlpha === 0.35).map((q) => bandAxis(q.pts));
          const hb = bands.find(([u, v]) => near(u, { x: r[0][0], y: r[0][1] }) && near(v, { x: B[0], y: B[1] }));
          expect(hb).toBeTruthy();
          const len = Math.hypot(hb![1].x - hb![0].x, hb![1].y - hb![0].y);
          expect(Math.abs(mag(A) * len - Math.abs(cz))).toBeLessThan(1e-9);
          // The rectangle's drawn sides F → F + a → a + b.
          const side = g.polylines.find((l) => l.pts.length === 3 && near(l.pts[0], { x: r[0][0], y: r[0][1] }));
          expect(side).toBeTruthy();
          expect(near(side!.pts[1], { x: r[1][0], y: r[1][1] })).toBe(true);
          expect(near(side!.pts[2], { x: r[2][0], y: r[2][1] })).toBe(true);
        }
        // Plot bars: product (a×b)_z and height b sin φ; the product is a times the height.
        const yb = plotBound(mag(A) * mag(B), mag(B));
        const ins = new Inset(g, panels(CROSS_L).plot, [-180, 180], [-yb, yb]);
        const phi = (signedAngle(A, B) * 180) / Math.PI;
        const bars = plotBars(ins, { phi, y: cz, yh: hs });
        const toData = (v: Vec2) => -yb + ((v.y - ins.r.y0) / (ins.r.y1 - ins.r.y0)) * 2 * yb;
        expect(Math.abs(toData(bars.prod[1]) - cz)).toBeLessThan(1e-9);
        expect(Math.abs(toData(bars.fac[1]) - hs)).toBeLessThan(1e-9);
        expect(Math.abs(toData(bars.prod[1]) - mag(A) * toData(bars.fac[1]))).toBeLessThan(1e-9);
        expect(g.lines.some((l) => near(l.a, bars.prod[0]) && near(l.b, bars.prod[1]))).toBe(true);
        // Sign: φ > 0 (⊙) gives a positive product and height, φ < 0 (⊗) negative ones.
        if (Math.abs(Math.sin(signedAngle(A, B))) > 1e-6 && mag(A) > 1e-9 && mag(B) > 1e-9) {
          expect(Math.sign(cz)).toBe(Math.sign(phi));
          expect(Math.sign(hs)).toBe(Math.sign(phi));
        }
      }
    });
  }
});

describe('products: labels', () => {
  type Lb = RecDraw['labels'][number];
  const boxOf = (m: Lb) => ({ x0: m.x + 1, x1: m.x + m.w - 1, y0: m.y - m.size * 0.5, y1: m.y + m.size * 0.5 });
  const hit = (a: ReturnType<typeof boxOf>, b: ReturnType<typeof boxOf>) => a.x0 < b.x1 && b.x0 < a.x1 && a.y0 < b.y1 && b.y0 < a.y1;

  for (const st of STAGES) {
    it(`no two labels overlap, none leaves the stage, the values are shown (${st.name})`, () => {
      phone(st.narrow);
      const bad: string[] = [];
      for (const [sc, lim] of [
        [dotScene, 5],
        [crossScene, 4.5],
      ] as const) {
        const base = defaults(sc.params) as Params;
        for (const proj of sc === dotScene ? ['b', 'a'] : ['b'])
          for (const [A, B] of cases(lim)) {
            const g = rec(sc as unknown as Scene, { ...base, proj, A, B }, st.w, st.h);
            const ls = g.labels;
            for (let i = 0; i < ls.length; i++) {
              const bi = boxOf(ls[i]);
              if (bi.x0 < -1 || bi.x1 > st.w + 1 || bi.y0 < -1 || bi.y1 > st.h + 1) bad.push(`${sc.id} ${A}|${B}: "${ls[i].text}" off stage`);
              for (let j = i + 1; j < ls.length; j++) {
                if (!ls[i].screen && !ls[j].screen) continue; // tick labels among themselves
                if (hit(bi, boxOf(ls[j]))) bad.push(`${sc.id} ${proj} ${A}|${B}: "${ls[i].text}" × "${ls[j].text}"`);
              }
            }
            // The product and the factor are shown with their values (plot, rectangle, plane).
            if (mag(A) > 1e-9 && mag(B) > 1e-9) {
              const all = ls.map((m) => m.text).join(' | ');
              const v = sc === dotScene ? dot(A, B) : crossZ(A, B);
              const f = sc === dotScene ? (proj === 'a' ? along(A, B) : along(B, A)) : across(B, A);
              expect(all, all).toContain(fmt(v, 3));
              expect(all, all).toContain(fmt(f, 3));
            }
          }
      }
      expect(bad, bad.slice(0, 12).join('\n')).toEqual([]);
    });
  }
});
