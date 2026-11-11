// Shared by the Ch 5 scenes: a horizontal track with ticks, and padded plot ranges.
import { fmtTick, niceTicks } from '../../core/format';
import type { Draw } from '../../draw/draw';

export const TICK = '#6b6b6b';

/** Range including zero, at least minSpan wide, with a margin. */
export function padded(lo0: number, hi0: number, minSpan: number): [number, number] {
  let lo = Math.min(lo0, 0);
  let hi = Math.max(hi0, 0);
  if (hi - lo < minSpan) {
    const mid = (hi + lo) / 2;
    lo = Math.min(lo, mid - minSpan / 2);
    hi = Math.max(hi, mid + minSpan / 2);
  }
  const m = 0.12 * (hi - lo);
  return [lo - m, hi + m];
}

/** Track [lo, hi] at height y with ticks and the x axis label. */
export function drawTrack(g: Draw, lo: number, hi: number, y = 0, label = '*x* (m)'): void {
  g.line({ x: lo, y }, { x: hi, y }, { role: 'axis', width: 1.25 });
  for (const x of niceTicks(lo, hi, 8)) {
    g.line({ x, y }, { x, y: y - g.px(5) }, { role: 'axis', width: 1 });
    g.text({ x, y }, fmtTick(x), { size: 11, color: TICK, align: 'center', dy: 18 });
  }
  g.text({ x: hi, y }, label, { size: 12, color: TICK, align: 'right', dy: 36 });
}
