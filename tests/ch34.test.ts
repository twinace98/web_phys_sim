import { describe, expect, it } from 'vitest';
import { imageDistance, magnification, principalRays } from '../src/sims/ch34/physics';
import { defaults } from '../src/core/params';
import { fmt } from '../src/core/format';
import { apertureOf, focal, lensScene, mirrorHit, mirrorScene, panel } from '../src/sims/ch34/scene';

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
          for (const r of principalRays(p, h, f)) {
            if (Math.abs(r.y) > 22) continue; // reflects off the stage
            expect(Math.abs(r.y)).toBeLessThanOrEqual(ap);
            // The ray is drawn reflecting where it meets the curve, on the object's line, inside the rim.
            const hit = mirrorHit('mirror', q, r);
            expect(hit.x).toBeLessThanOrEqual(0);
            expect(hit.x).toBeGreaterThanOrEqual(-2.5 - 1e-9);
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
