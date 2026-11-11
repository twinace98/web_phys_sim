import { describe, expect, it } from 'vitest';
import { V } from '../src/sims/field/charges';
import { extendPath, workAlong } from '../src/sims/ch24/physics';

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
