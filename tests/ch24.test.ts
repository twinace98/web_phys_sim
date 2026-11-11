import { describe, expect, it } from 'vitest';
import { V } from '../src/sims/field/charges';
import { workAlong } from '../src/sims/ch24/physics';

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
