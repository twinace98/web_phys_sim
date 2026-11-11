// Ch 24: work done by the electric field on a test charge along a path. DOM-free.
// Charges in nC, lengths in m, potential in V; with q0 in nC the work comes out in nJ.
import { E, clearOf } from '../field/charges';
import type { Src } from '../field/physics';

/** Closest distance from point c to the segment a→b. */
function segDist(ax: number, ay: number, bx: number, by: number, cx: number, cy: number): number {
  const dx = bx - ax;
  const dy = by - ay;
  const l2 = dx * dx + dy * dy;
  const u = l2 > 0 ? Math.max(0, Math.min(1, ((cx - ax) * dx + (cy - ay) * dy) / l2)) : 0;
  return Math.hypot(ax + u * dx - cx, ay + u * dy - cy);
}

/**
 * W = q0 ∫ E·dl along the polyline (flat [x0, y0, x1, y1, ...]), Simpson's rule on every
 * segment. Path independence makes this equal to −q0 ΔV for any path. Segments that pass
 * close to a charge are split finer (step ≤ a twelfth of the closest approach).
 */
export function workAlong(src: readonly Src[], path: readonly number[], q0: number): number {
  let w = 0;
  for (let k = 2; k < path.length; k += 2) {
    const ax = path[k - 2];
    const ay = path[k - 1];
    const bx = path[k];
    const by = path[k + 1];
    const dx = bx - ax;
    const dy = by - ay;
    let near = Infinity;
    for (const c of src) near = Math.min(near, segDist(ax, ay, bx, by, c.x, c.y));
    const h = Math.min(0.01, Math.max(1e-4, near / 12));
    const n = Math.min(20000, Math.max(1, Math.ceil(Math.hypot(dx, dy) / h)));
    for (let i = 0; i < n; i++) {
      const s0 = i / n;
      const s1 = (i + 1) / n;
      const sm = (s0 + s1) / 2;
      const e0 = E(src, ax + s0 * dx, ay + s0 * dy);
      const em = E(src, ax + sm * dx, ay + sm * dy);
      const e1 = E(src, ax + s1 * dx, ay + s1 * dy);
      const ex = (e0[0] + 4 * em[0] + e1[0]) / 6;
      const ey = (e0[1] + 4 * em[1] + e1[1]) / 6;
      w += (ex * dx + ey * dy) / n;
    }
  }
  return q0 * w;
}

/**
 * Extend a dragged path (flat, last point already clear of the charges) towards (tx, ty)
 * without letting it touch a charge: a segment that comes within `d` of a charge is walked in
 * short steps, every step pushed out to distance `d`, and a chord that would still cut into a
 * charge's disc is replaced by an arc around it. Stops at `maxPts` points.
 */
export function extendPath(src: readonly Src[], path: number[], tx: number, ty: number, d = 0.05, maxPts = Infinity): void {
  let cx = path[path.length - 2];
  let cy = path[path.length - 1];
  const [ex, ey] = clearOf(src, tx, ty, d);
  const push = (x: number, y: number): boolean => {
    if (path.length >= 2 * maxPts) return false;
    if (Math.hypot(x - cx, y - cy) < 1e-4) return true;
    path.push(x, y);
    cx = x;
    cy = y;
    return true;
  };
  const touches = (ax: number, ay: number, bx: number, by: number, r: number) => src.some((c) => segDist(ax, ay, bx, by, c.x, c.y) < r);
  if (!touches(cx, cy, ex, ey, 1.5 * d)) {
    push(ex, ey);
    return;
  }
  const x0 = cx;
  const y0 = cy;
  const n = Math.max(1, Math.ceil(Math.hypot(tx - x0, ty - y0) / (d / 5)));
  for (let i = 1; i <= n; i++) {
    const u = i / n;
    const [x, y] = i === n ? [ex, ey] : clearOf(src, x0 + u * (tx - x0), y0 + u * (ty - y0), d);
    for (const c of src) {
      if (segDist(cx, cy, x, y, c.x, c.y) >= 0.95 * d) continue;
      // Go round charge c on a circle from the current point to (x, y), the shorter way.
      const r0 = Math.max(d, Math.hypot(cx - c.x, cy - c.y));
      const r1 = Math.max(d, Math.hypot(x - c.x, y - c.y));
      const a0 = Math.atan2(cy - c.y, cx - c.x);
      let da = Math.atan2(y - c.y, x - c.x) - a0;
      da -= 2 * Math.PI * Math.round(da / (2 * Math.PI));
      const m = Math.ceil(Math.abs(da) / 0.15);
      for (let j = 1; j < m; j++) {
        const r = r0 + ((r1 - r0) * j) / m;
        const a = a0 + (da * j) / m;
        if (!push(c.x + r * Math.cos(a), c.y + r * Math.sin(a))) return;
      }
    }
    if (!push(x, y)) return;
  }
}
