// Ch 24: work done by the electric field on a test charge along a path. DOM-free.
// Charges in nC, lengths in m, potential in V; with q0 in nC the work comes out in nJ.
import { E } from '../field/charges';
import type { Src } from '../field/physics';

/**
 * W = q0 ∫ E·dl along the polyline (flat [x0, y0, x1, y1, ...]), Simpson's rule on every
 * segment. Path independence makes this equal to −q0 ΔV for any path.
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
    // Split long segments so Simpson stays accurate near a charge.
    const n = Math.max(1, Math.ceil(Math.hypot(dx, dy) / 0.01));
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
