import { describe, expect, it } from 'vitest';
import { imageDistance, magnification, principalRays } from '../src/sims/ch34/physics';
import { defaults } from '../src/core/params';
import { fmt } from '../src/core/format';
import { RIM_SAG_PX, apertureOf, focal, halfWidth, lensScene, mirrorScene, panel, rayHit, sagOf, stretchOf, worldOf } from '../src/sims/ch34/scene';
import { ProbeDraw } from './stage-probe';
import type { Stroke } from '../src/draw/draw';
import type { Vec2 } from '../src/core/types';
import { segHitsRect } from '../src/sims/inset/inset';
import { Viewport } from '../src/core/viewport';

describe('ch34 stage extent (round 2)', () => {
  /** Visible half-height [cm] of the world on a w × h stage, heights divided by the stretch. */
  const visibleY = (q: Parameters<typeof worldOf>[0], narrow: boolean, w: number, h: number) => {
    const vp = new Viewport();
    vp.fit(worldOf(q, narrow), w, h);
    const [x0, yTop] = vp.toWorld(0, 0);
    const [, yBot] = vp.toWorld(w, h);
    return { x0, top: yTop / stretchOf(narrow), bot: yBot / stretchOf(narrow) };
  };

  it('f = 30, p = 25: the third ray meets the lens plane on the stage (it was cut off at 22 cm)', () => {
    const q = { ...defaults(lensScene.params), f: 30, p: 25, h: 5 };
    const r3 = principalRays(25, 5, 30)[2];
    expect(r3.y).toBeCloseTo(30, 9);
    for (const [narrow, w, h] of [
      [false, 1280, 704],
      [true, 390, 597],
    ] as const) {
      const v = visibleY(q, narrow, w, h);
      expect(v.top).toBeGreaterThan(r3.y + 1);
    }
  });

  it('the stage never rescales: not with f (so the image visibly moves and flips) and not with p', () => {
    for (const k of ['converging', 'diverging', 'concave', 'convex', 'plane']) for (const f of [5, 15, 30]) expect(halfWidth(k, f)).toBe(70);
    const base = defaults(lensScene.params);
    const w0 = JSON.stringify(worldOf({ ...base, f: 5, p: 2 }, false));
    for (const f of [5, 18, 30]) for (const p of [10, 25, 29.5, 55]) expect(JSON.stringify(worldOf({ ...base, f, p }, false))).toBe(w0);
    // f = 30: the real image of the farthest object (p = 55, i = 66) now lies on the stage (old edge: 60).
    expect(imageDistance(55, 30)).toBeLessThan(halfWidth('converging', 30));
  });

  it('narrow stage: heights stretched 2.5 times, the diagram below the formula panel', () => {
    const q = { ...defaults(lensScene.params), f: 15 };
    const vp = new Viewport();
    vp.fit(worldOf(q, true), 390, 597);
    const k = stretchOf(true);
    // Top of the frame (k·yw) at least 150 px below the top of the stage; bottom on the stage.
    expect(vp.toPx(0, k * 20)[1]).toBeGreaterThan(150);
    expect(vp.toPx(0, -k * 20)[1]).toBeLessThan(597);
    expect(stretchOf(false)).toBe(1);
  });

  it('segHitsRect: crossing, inside, missing and touching segments', () => {
    expect(segHitsRect(0, 5, 20, 5, 5, 0, 10, 10)).toBe(true);
    expect(segHitsRect(6, 6, 7, 7, 5, 0, 10, 10)).toBe(true);
    expect(segHitsRect(0, 20, 20, 20, 5, 0, 10, 10)).toBe(false);
    expect(segHitsRect(0, 0, 4, 20, 5, 0, 10, 10)).toBe(false);
  });
});

describe('ch34 thin lens and mirror equation', () => {
  it('1/p + 1/i = 1/f with signs', () => {
    expect(imageDistance(25, 15)).toBeCloseTo(37.5, 10);
    expect(imageDistance(30, 15)).toBeCloseTo(30, 10);
    expect(imageDistance(10, 15)).toBeCloseTo(-30, 10);
    expect(imageDistance(30, -15)).toBeCloseTo(-10, 10);
    expect(imageDistance(15, 15)).toBe(Infinity);
    expect(imageDistance(20, Infinity)).toBe(-20);
    expect(magnification(30, 30)).toBeCloseTo(-1, 12);
    expect(magnification(20, -20)).toBeCloseTo(1, 12);
  });

  it('element signs: converging and concave positive, diverging and convex negative, plane infinite', () => {
    expect(focal('converging', 15)).toBe(15);
    expect(focal('concave', 15)).toBe(15);
    expect(focal('diverging', 15)).toBe(-15);
    expect(focal('convex', 15)).toBe(-15);
    expect(focal('plane', 15)).toBe(Infinity);
  });

  it('all principal rays (or their extensions) pass through the image tip', () => {
    for (const f of [10, 15, 20, -10, -20, Infinity]) {
      for (const p of [5, 12, 25, 40, 55]) {
        if (Math.abs(p - f) < 1e-9) continue;
        const h = 4;
        const i = imageDistance(p, f);
        const hi = magnification(p, i) * h;
        const rays = principalRays(p, h, f);
        expect(rays.length).toBe(Number.isFinite(f) ? 3 : 2);
        for (const r of rays) expect(r.y + r.sOut * i).toBeCloseTo(hi, 9);
      }
    }
  });

  it('object at the focal point: outgoing rays are parallel', () => {
    const rays = principalRays(15, 4, 15);
    expect(rays.length).toBe(2);
    expect(rays[0].sOut).toBeCloseTo(rays[1].sOut, 12);
  });
});

describe('ch34 review fixes', () => {
  it('panel and readouts print the same digits for i and m', () => {
    for (const [p, f] of [
      [25, 15],
      [17, 15],
      [8.5, 15],
      [2, 30],
      [55, 5],
      [31.5, 30],
    ]) {
      const q = { ...defaults(lensScene.params), p, f };
      const tex = panel(q);
      for (const r of lensScene.readouts!) {
        const v = r.value({ t: 0 }, q);
        expect(tex).toContain(fmt(v, r.sig ?? 3).replace('−', '-'));
      }
    }
  });

  it('p = f: no ∞ in the panel, since the readouts show "–"', () => {
    const q = { ...defaults(lensScene.params), p: 15, f: 15 };
    for (const r of lensScene.readouts!) expect(fmt(r.value({ t: 0 }, q))).toBe('–');
    const tex = panel(q);
    expect(tex).not.toContain('\\infty');
    expect(tex).toContain('m = -\\dfrac{i}{p} = \\text{–}');
  });

  it('concave mirror: every principal ray meets the drawn mirror (or reflects off the stage)', () => {
    const base = defaults(mirrorScene.params);
    for (const f of [5, 12, 15, 30])
      for (let p = 2; p <= 55; p += 0.5)
        for (const h of [2, 5, 8]) {
          const q = { ...base, kind: 'concave', p, f, h };
          const ap = apertureOf('mirror', q);
          const yw = halfWidth('concave', f) / 3;
          for (const r of principalRays(p, h, f)) {
            if (Math.abs(r.y) > yw + 2) continue; // reflects beyond the frame
            expect(Math.abs(r.y)).toBeLessThanOrEqual(ap);
            // The ray reflects at the vertex plane, on the object's line, inside the rim.
            const hit = rayHit(r);
            expect(hit.x).toBe(0);
            expect(Math.abs(hit.y)).toBeLessThanOrEqual(ap);
            expect(hit.y).toBeCloseTo(h + r.sIn * p, 9);
          }
        }
    // Object just outside F: the ray toward F meets the vertex plane at 20 cm, beyond the old 13 cm mirror.
    const q = { ...base, kind: 'concave', p: 18, f: 15, h: 4 };
    expect(Math.max(...principalRays(18, 4, 15).map((r) => Math.abs(r.y)))).toBeCloseTo(20, 9);
    expect(apertureOf('mirror', q)).toBeGreaterThanOrEqual(20);
    // Far object: the aperture is the frame default, 0.65 of the half-height (70/3 cm).
    expect(apertureOf('mirror', { ...q, p: 25, h: 5 })).toBeCloseTo((0.65 * 70) / 3, 9);
  });

  it('readouts are finite or "–" (p = f only) across kinds, f and p', () => {
    for (const sc of [lensScene, mirrorScene])
      for (const kind of (sc.params.kind as { options: { value: string }[] }).options.map((o) => o.value))
        for (const f of [5, 13, 30])
          for (const p of [2, 7.5, 13, 29.5, 55]) {
            const q = { ...defaults(sc.params), kind, f, p };
            if (focal(kind, f) === p) continue; // p = f: "–" by design, tested above
            for (const r of sc.readouts!) expect(Number.isFinite(r.value({ t: 0 }, q))).toBe(true);
            expect(panel(q)).not.toContain('NaN');
          }
  });
});

describe('ch34 focal-length slider shows every image type (default object at 20 cm)', () => {
  it('f sweeps reduced real, enlarged real and upright virtual images on one fixed stage', () => {
    const p = defaults(lensScene.params).p;
    expect(p).toBe(20);
    const img = (f: number) => {
      const i = 1 / (1 / f - 1 / p);
      return { i, m: -i / p };
    };
    expect(img(6).i).toBeGreaterThan(0);
    expect(Math.abs(img(6).m)).toBeLessThan(1);
    expect(img(12).i).toBeGreaterThan(0);
    expect(Math.abs(img(12).m)).toBeGreaterThan(1);
    expect(img(30).i).toBeLessThan(0);
    expect(img(30).m).toBeGreaterThan(1);
    // QA 2026-11-24: the default image (f = 15, i = 60 cm; 90 cm at p = 18) is on the 70 cm stage,
    // and so are the virtual image at f = 30 (i = −60 cm) and the real one at f = 12 (i = 30 cm).
    const f0 = defaults(lensScene.params).f;
    expect(Math.abs(img(f0).i)).toBeLessThan(halfWidth('converging', f0));
    expect(Math.abs(img(30).i)).toBeLessThan(halfWidth('converging', 30));
    expect(Math.abs(img(12).i)).toBeLessThan(halfWidth('converging', 12));
  });
});

/** ProbeDraw that also records stroked lines, so the drawn rays can be checked. */
class LineProbe extends ProbeDraw {
  readonly lines: { a: Vec2; b: Vec2; st: Stroke }[] = [];
  // Optional parameters: the base ProbeDraw.line takes none.
  line(a?: Vec2, b?: Vec2, st: Stroke = {}): void {
    if (a && b) this.lines.push({ a, b, st });
  }
}

/** Drawn principal rays: per ray colour, the incoming, outgoing and (virtual image) dashed segments. */
function drawnRays(scene: typeof mirrorScene, q: { kind: string; f: number; p: number; h: number }, w = 1280, h = 800) {
  const g = new LineProbe(w, h);
  g.vp.fit(scene.world(q), w, h);
  scene.draw(g, { t: 0 }, q, { t: 0, cursorT: 0, scrubbing: false, lecture: false });
  return ['#009E73', '#CC79A7', '#E69F00'].map((c) => g.lines.filter((l) => l.st.color === c));
}

describe('ch34 principal rays keep their textbook directions (review 2026-11-20)', () => {
  const slope = (l: { a: Vec2; b: Vec2 }) => (l.b.y - l.a.y) / (l.b.x - l.a.x);
  /** Height of the line through segment l at x. */
  const yAt = (l: { a: Vec2; b: Vec2 }, x: number) => l.a.y + slope(l) * (x - l.a.x);

  it('concave mirror f = 10, p = 7 and f = 5, p = 2: the ray through F leaves parallel (was −6.0° and −14°)', () => {
    for (const [f, p] of [
      [10, 7],
      [5, 2],
    ]) {
      const q = { ...defaults(mirrorScene.params), kind: 'concave', f, p };
      const [, , orange] = drawnRays(mirrorScene, q);
      expect(orange.length).toBeGreaterThanOrEqual(2);
      expect(slope(orange[1])).toBeCloseTo(0, 12);
    }
  });

  it('every element, f, p: rays reflect or refract at x = 0 and meet at the image tip; the F ray leaves parallel', () => {
    for (const scene of [lensScene, mirrorScene])
      for (const kind of (scene.params.kind as { options: { value: string }[] }).options.map((o) => o.value))
        for (const f of [5, 10, 17, 30])
          for (const p of [2, 4.5, 7, 9.5, 15, 29.5, 55])
            for (const h of [2, 5, 8]) {
              const q = { kind, f, p, h };
              const ff = focal(kind, f);
              const i = imageDistance(p, ff);
              if (!Number.isFinite(i)) continue;
              const xi = scene === lensScene ? i : -i;
              const yi = magnification(p, i) * h;
              const rays = drawnRays(scene, q);
              expect(rays[2].length > 0).toBe(Number.isFinite(ff));
              for (const segs of rays) {
                if (segs.length === 0) continue;
                const [inc, out] = segs;
                // Incoming from the object tip to the element plane, outgoing from the same point.
                expect(inc.a.x).toBeCloseTo(-p, 9);
                expect(inc.a.y).toBeCloseTo(h, 9);
                expect(inc.b.x).toBe(0);
                expect(out.a).toEqual(inc.b);
                // The outgoing line (or its backward extension) passes through the image tip.
                expect(yAt(out, xi)).toBeCloseTo(yi, 6);
                if (i < 0) {
                  const dash = segs[2];
                  expect(dash.st.dash).toBeDefined();
                  expect(dash.b.x).toBeCloseTo(xi, 9);
                  expect(dash.b.y).toBeCloseTo(yi, 9);
                }
              }
              // Through (or toward) F, then parallel to the axis.
              if (Number.isFinite(ff)) {
                expect(slope(rays[2][1])).toBeCloseTo(0, 9);
                expect(yAt(rays[2][0], -ff)).toBeCloseTo(0, 6);
              }
              // Parallel to the axis in, then through (or away from) F.
              expect(slope(rays[0][0])).toBeCloseTo(0, 12);
              if (Number.isFinite(ff)) expect(yAt(rays[0][1], scene === lensScene ? ff : -ff)).toBeCloseTo(0, 6);
            }
  });

  it('the drawn mirror bows at most RIM_SAG_PX at the rim, so a ray crosses the curve by at most that much', () => {
    for (const f of [5, 15, 30])
      for (const ap of [8, 15.2, 25.3]) {
        for (const rimMax of [0.8, 2.5]) {
          const sag = sagOf(f, ap, rimMax);
          expect((sag * ap * ap) / 2).toBeLessThanOrEqual(rimMax + 1e-12);
          expect(sagOf(-f, ap, rimMax)).toBeCloseTo(-sag, 15);
        }
      }
    expect(sagOf(Infinity, 15, 2.5)).toBe(0);
    expect(RIM_SAG_PX).toBeLessThanOrEqual(8);
  });
});
