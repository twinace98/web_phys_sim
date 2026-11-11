import { describe, expect, it } from 'vitest';
import { imageDistance, magnification, principalRays } from '../src/sims/ch34/physics';
import { defaults } from '../src/core/params';
import { fmt } from '../src/core/format';
import { apertureOf, focal, halfWidth, lensScene, mirrorHit, mirrorScene, panel, stretchOf, worldOf } from '../src/sims/ch34/scene';
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

  it('the stage widens with a long converging f only, never with p (no rescaling while dragging)', () => {
    expect(halfWidth('converging', 15)).toBe(60);
    expect(halfWidth('converging', 30)).toBeCloseTo(96, 9);
    expect(halfWidth('diverging', 30)).toBe(60);
    expect(halfWidth('plane', 30)).toBe(60);
    const base = defaults(lensScene.params);
    for (const f of [5, 18, 30]) {
      const w0 = JSON.stringify(worldOf({ ...base, f, p: 2 }, false));
      for (const p of [10, 25, 29.5, 55]) expect(JSON.stringify(worldOf({ ...base, f, p }, false))).toBe(w0);
    }
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
            // The ray is drawn reflecting where it meets the curve, on the object's line, inside the rim.
            const hit = mirrorHit('mirror', q, r);
            expect(hit.x).toBeLessThanOrEqual(0);
            expect(hit.x).toBeGreaterThanOrEqual((-2.5 * halfWidth('concave', f)) / 60 - 1e-9);
            expect(Math.abs(hit.y)).toBeLessThanOrEqual(ap);
            expect(hit.y).toBeCloseTo(h + r.sIn * (hit.x + p), 9);
          }
        }
    // Object just outside F: the ray toward F meets the vertex plane at 20 cm, beyond the old 13 cm mirror.
    const q = { ...base, kind: 'concave', p: 18, f: 15, h: 4 };
    expect(Math.max(...principalRays(18, 4, 15).map((r) => Math.abs(r.y)))).toBeCloseTo(20, 9);
    expect(apertureOf('mirror', q)).toBeGreaterThanOrEqual(20);
    expect(apertureOf('mirror', { ...q, p: 25, h: 5 })).toBe(13);
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
