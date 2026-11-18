import { describe, expect, it } from 'vitest';
import { KQ, POINT_POOL, V, pointSources, pointWorld } from '../src/sims/field/charges';
import { FieldLayers } from '../src/sims/field/layers';
import { extendPath, thinPath, workAlong } from '../src/sims/ch24/physics';
import { potential } from '../src/sims/ch24/scene';
import { defaults } from '../src/core/params';
import { Rng } from '../src/core/rng';
import { ProbeDraw } from './stage-probe';

const src = [
  { x: -0.4, y: 0, s: 1 },
  { x: 0.4, y: 0, s: -1 },
];

/** Polyline through the given points, densified. */
function path(pts: [number, number][], per = 50): number[] {
  const out: number[] = [];
  for (let i = 0; i + 1 < pts.length; i++) {
    for (let k = 0; k < per; k++) {
      const u = k / per;
      out.push(pts[i][0] + u * (pts[i + 1][0] - pts[i][0]), pts[i][1] + u * (pts[i + 1][1] - pts[i][1]));
    }
  }
  const last = pts[pts.length - 1];
  out.push(last[0], last[1]);
  return out;
}

describe('ch24 work and potential', () => {
  it('work by the field equals −q0 ΔV, for two different paths', () => {
    const A: [number, number] = [-0.2, 0.4];
    const B: [number, number] = [0.3, -0.3];
    const dV = V(src, ...B) - V(src, ...A);
    const w1 = workAlong(src, path([A, B]), 1);
    const w2 = workAlong(src, path([A, [0.6, 0.6], [0.8, -0.5], B]), 1);
    expect(Math.abs(w1 + dV)).toBeLessThan(1e-4 * Math.abs(dV));
    expect(Math.abs(w2 + dV)).toBeLessThan(1e-4 * Math.abs(dV));
  });

  it('work around a closed loop is zero; along the V = 0 mid-plane it is zero', () => {
    const loop = path([[-0.2, 0.3], [0.5, 0.4], [0.2, -0.5], [-0.2, 0.3]]);
    expect(Math.abs(workAlong(src, loop, 1))).toBeLessThan(1e-5);
    expect(Math.abs(workAlong(src, path([[0, 0.6], [0, -0.6]]), 1))).toBeLessThan(1e-9);
  });

  it('a few long dragged segments still integrate accurately', () => {
    const A: [number, number] = [-0.3, 0.2];
    const B: [number, number] = [0.35, 0.1];
    const w = workAlong(src, [...A, 0, 0.35, ...B], 1);
    const exact = -(V(src, ...B) - V(src, ...A));
    expect(Math.abs(w / exact - 1)).toBeLessThan(1e-4);
  });
});

describe('ch24 fast drags across charges', () => {
  const minDist = (p: number[], s: { x: number; y: number }[]) => {
    let m = Infinity;
    for (let k = 0; k < p.length; k += 2) for (const c of s) m = Math.min(m, Math.hypot(p[k] - c.x, p[k + 1] - c.y));
    return m;
  };

  it('jumping straight through a charge routes round it and keeps W = −q0 ΔV', () => {
    const path = [-0.8, 0];
    // Two jumps whose straight chords pass exactly through the + and the − charge.
    extendPath(src, path, 0, 0);
    extendPath(src, path, 0.8, 0);
    expect(minDist(path, src)).toBeGreaterThan(0.045);
    const exact = -(V(src, 0.8, 0) - V(src, -0.8, 0));
    expect(Math.abs(workAlong(src, path, 1) / exact - 1)).toBeLessThan(0.005);
  });

  it('a wild random drag over several charges stays path-independent', () => {
    const many = [...src, { x: 0, y: 0.3, s: 2 }, { x: 0.1, y: -0.35, s: -2 }];
    let seed = 7;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647) * 2 - 1;
    for (let trial = 0; trial < 5; trial++) {
      const path = [-0.15, 0.45];
      for (let k = 0; k < 40; k++) extendPath(many, path, 1.1 * rnd(), 0.7 * rnd());
      // and a few jumps aimed right at the charges
      for (const c of many) extendPath(many, path, c.x, c.y);
      const n = path.length;
      const exact = -(V(many, path[n - 2], path[n - 1]) - V(many, path[0], path[1]));
      const w = workAlong(many, path, 1);
      expect(minDist(path, many)).toBeGreaterThan(0.045);
      expect(Math.abs(w - exact)).toBeLessThan(0.005 * Math.max(Math.abs(exact), 1));
    }
  });
});

// ---------------------------------------------------------------- QA E3

/** Records every vertex given to a Path2D (the layers build their lines with one). */
const recorded: number[] = [];
class RecPath {
  moveTo(x: number, y: number) {
    recorded.push(x, y);
  }
  lineTo(x: number, y: number) {
    recorded.push(x, y);
  }
  closePath() {}
  rect() {}
  arc() {}
}

/** Closest equipotential vertex to any of the charges [m], on a w × h stage at ΔV = dV. */
function innermost(sources: { x: number; y: number; s: number }[], dV: number, w = 900, h = 600): { r: number; ms: number } {
  const g = new ProbeDraw(w, h);
  g.vp.fit(pointWorld(), w, h);
  (globalThis as { Path2D?: unknown }).Path2D = RecPath;
  recorded.length = 0;
  const t0 = performance.now();
  new FieldLayers('point').equipotentials(g, sources, KQ, dV);
  const ms = performance.now() - t0;
  let r = Infinity;
  for (let k = 0; k < recorded.length; k += 2) {
    const [x, y] = g.vp.toWorld(recorded[k], recorded[k + 1]);
    for (const c of sources) r = Math.min(r, Math.hypot(x - c.x, y - c.y));
  }
  return { r, ms };
}

describe('ch24 equipotentials reach in toward the charges (QA E3)', () => {
  it('ΔV = 1 V: lines continue in to where they are about 3 px apart, not only |V| ≤ 12 V', () => {
    // Single 1 nC at 375 px/m: spacing ΔV r²/(kq) = 3 px at r = √(0.008 m · 8.99 V m) ≈ 0.27 m.
    // Before: the 12 V cap left an empty disc of radius kq/12 V = 0.75 m.
    const single = innermost([{ x: 0, y: 0, s: 1 }], 1);
    expect(single.r).toBeLessThan(0.32);
    expect(single.r).toBeGreaterThan(0.22);
    // Dipole ±1 nC at ±0.4 m (before: 0.30 to 0.47 m) and like pair (before: ≥ 1.2 m round the pair).
    expect(innermost(pointSources({ preset: 'dipole', Q: POINT_POOL.blank() }), 1).r).toBeLessThan(0.3);
    expect(innermost(pointSources({ preset: 'like', Q: POINT_POOL.blank() }), 1).r).toBeLessThan(0.3);
  });

  it('the gap rule never draws lines closer than about 3 px, and stays fast with every charge out', () => {
    // At ΔV = 10 V the 3 px radius is √(0.008 · 8.99 / 10) ≈ 0.085 m.
    expect(innermost([{ x: 0, y: 0, s: 1 }], 10).r).toBeGreaterThan(0.07);
    // All 22 charges in a cluster, ΔV = 1 V: still a few tens of ms.
    const coords = POINT_POOL.blank()
      .slice(1)
      .map((_, k) => (k % 2 ? 0.05 * Math.floor(k / 10) - 0.3 : 0.08 * (Math.floor(k / 2) % 5) - 0.2));
    const all = POINT_POOL.sources(coords);
    expect(all.length).toBe(22);
    const t = innermost(all, 1);
    expect(t.r).toBeLessThan(Infinity);
    expect(t.ms).toBeLessThan(400);
  });
});

describe('ch24 a long drag keeps following the pointer (QA E3, P3)', () => {
  it('past 6000 points the older half is thinned; the end tracks the pointer and W = −q0 ΔV', () => {
    const p = { ...defaults(potential.params), preset: 'dipole' };
    const s = potential.init(p, new Rng(1));
    const h = potential.handles![0];
    const ctx = { params: p, set: () => {} };
    const sources = pointSources(p);
    // 40 laps of a circle of radius 0.6 m round the dipole, in 0.004 m steps (≈ 38 000 moves).
    let last = { x: 0, y: 0 };
    let maxLen = 0;
    for (let a = 0; a < 40 * 2 * Math.PI; a += 0.004 / 0.6) {
      last = { x: 0.6 * Math.cos(a) - 0.1, y: 0.6 * Math.sin(a) };
      h.onDrag(ctx as never, s, last);
      maxLen = Math.max(maxLen, s.path.length / 2);
    }
    const n = s.path.length;
    expect(Math.hypot(s.path[n - 2] - last.x, s.path[n - 1] - last.y)).toBeLessThan(1e-9);
    expect(maxLen).toBeLessThanOrEqual(6000 + 400);
    const exact = -(V(sources, s.path[n - 2], s.path[n - 1]) - V(sources, s.path[0], s.path[1]));
    expect(Math.abs(workAlong(sources, s.path, 1) - exact)).toBeLessThan(1e-3 * Math.max(1, Math.abs(exact)));
  });

  it('thinning never shortcuts through a charge', () => {
    const path = [-0.8, 0];
    // Many small loops round the + charge, then thin hard.
    for (let a = 0; a < 30 * 2 * Math.PI; a += 0.05) extendPath(src, path, -0.4 + 0.08 * Math.cos(a), 0.08 * Math.sin(a));
    const before = path.length;
    thinPath(src, path, 500);
    expect(path.length).toBeLessThan(before);
    for (let k = 2; k < path.length; k += 2)
      for (const c of src) {
        const [ax, ay, bx, by] = [path[k - 2], path[k - 1], path[k], path[k + 1]];
        const dx = bx - ax;
        const dy = by - ay;
        const u = Math.max(0, Math.min(1, ((c.x - ax) * dx + (c.y - ay) * dy) / (dx * dx + dy * dy || 1)));
        expect(Math.hypot(ax + u * dx - c.x, ay + u * dy - c.y)).toBeGreaterThan(0.045);
      }
  });
});
