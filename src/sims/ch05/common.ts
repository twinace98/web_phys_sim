// Shared by the Ch 5 scenes: a horizontal track with ticks, padded plot ranges, and the puck with
// its free-body diagram.
import { fmtTick, niceTicks } from '../../core/format';
import type { Draw } from '../../draw/draw';
import { drawFbd, type FbdForce } from '../../draw/fbd';

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

/**
 * Track [lo, hi] at height y with ticks and the x axis label. `clear`: a world x kept free of tick
 * numbers and the axis label (the mg arrow of a free-body diagram hangs through them there).
 */
export function drawTrack(g: Draw, lo: number, hi: number, y = 0, label = '*x* (m)', clear?: number): void {
  // Text of n characters, centred at x (0) or ending at x (1), keeps 6 px from `clear`.
  const free = (x: number, n: number, end: 0 | 1) => {
    if (clear === undefined) return true;
    const w = g.px(n * 7);
    const x0 = end ? x - w : x - w / 2;
    return clear < x0 - g.px(6) || clear > x0 + w + g.px(6);
  };
  g.line({ x: lo, y }, { x: hi, y }, { role: 'axis', width: 1.25 });
  for (const x of niceTicks(lo, hi, 8)) {
    g.line({ x, y }, { x, y: y - g.px(5) }, { role: 'axis', width: 1 });
    const s = fmtTick(x);
    if (free(x, s.length, 0)) g.text({ x, y }, s, { size: 11, color: TICK, align: 'center', dy: 18 });
  }
  if (free(hi, 5, 1)) g.text({ x: hi, y }, label, { size: 12, color: TICK, align: 'right', dy: 36 });
}

/** Puck radius [px]. */
export const PUCK_R = 10;
export const G5 = 9.8;

/** Normal force and weight of a puck of mass m on the horizontal track. */
export const weightPair = (m: number): FbdForce[] => [
  { F: { x: 0, y: m * G5 }, label: '*N*' },
  { F: { x: 0, y: -m * G5 }, label: '*m**g*', field: true },
];

/**
 * Free-body diagram of the puck at x: the puck sits on the track (centre one radius above it) and
 * is faded so the arrows over it read. `perPx` is px per newton (fbdScale of the run's largest force).
 */
export function drawPuckFbd(g: Draw, x: number, forces: readonly FbdForce[], perPx: number): void {
  const c = { x, y: g.px(PUCK_R) };
  g.circle(c, PUCK_R, { fill: 'position', alpha: 0.25 });
  g.circle(c, PUCK_R, { role: 'position', width: 1.25 });
  drawFbd(g, c, forces, perPx);
}
