// Stage pointer hit test, DOM-free so it can be unit-tested.

/** Minimum hit radius [px] for a touch, so a finger can grab a small handle. */
const TOUCH_RADIUS = 24;

/**
 * Handle under the pointer: the nearest one whose (touch-enlarged) radius contains it, so
 * overlapping hit areas pick the handle the finger is actually on. Returns its index or −1.
 */
export function nearestHandle(pts: { i: number; x: number; y: number; r: number }[], px: number, py: number, touch: boolean): number {
  let best = -1;
  let bestD = Infinity;
  for (const q of pts) {
    const d = Math.hypot(px - q.x, py - q.y);
    if (d <= Math.max(q.r, touch ? TOUCH_RADIUS : 0) && d < bestD) {
      best = q.i;
      bestD = d;
    }
  }
  return best;
}
