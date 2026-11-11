// Shared drawing helpers for the Ch 9 scenes.
import type { Vec2 } from '../../core/types';
import type { Draw, PlotDraw } from '../../draw/draw';
import { ROLE_COLOR } from '../../draw/theme';

/** Body 1 blue, body 2 orange, totals black (same as vector sums in Ch 3 and Ch 4). */
export const C1 = ROLE_COLOR.position;
export const C2 = ROLE_COLOR.energyU;
export const TICK = '#6b6b6b';

/** TeX for a coloured three-trace plot label: body 1, body 2, total. */
export function trioLabel(a: string, b: string, tot: string, unit: string): string {
  return `\\textcolor{${C1}}{${a}},\\ \\textcolor{${C2}}{${b}},\\ ${tot}\\,(\\mathrm{${unit}})`;
}

/** Centre-of-mass symbol: circle with two filled opposite quadrants. */
export function cmMark(g: Draw, c: Vec2, rPx = 7): void {
  const r = g.px(rPx);
  const quad = (a0: number): Vec2[] => {
    const pts: Vec2[] = [c];
    for (let i = 0; i <= 8; i++) {
      const a = a0 + (i / 8) * (Math.PI / 2);
      pts.push({ x: c.x + r * Math.cos(a), y: c.y + r * Math.sin(a) });
    }
    return pts;
  };
  g.circle(c, rPx, { fill: '#ffffff', color: '#1a1a1a', width: 1.5 });
  g.polygon(quad(0), { fill: '#1a1a1a' });
  g.polygon(quad(Math.PI), { fill: '#1a1a1a' });
}

/** Range including zero with a margin and a minimum span. */
export function padded(vals: number[], minSpan: number): [number, number] {
  let lo = Math.min(0, ...vals);
  let hi = Math.max(0, ...vals);
  if (hi - lo < minSpan) {
    const mid = (hi + lo) / 2;
    lo = Math.min(lo, mid - minSpan / 2);
    hi = Math.max(hi, mid + minSpan / 2);
  }
  const m = 0.1 * (hi - lo);
  return [lo - m, hi + m];
}

/**
 * Pale wide band under a body-1 trace, from 0 to t1: body 1 then differs from body 2 by line
 * style as well as colour, and stays visible where a body-2 or total trace lies on top of it
 * (equal-mass explosion K1 = K2; p_tot = p1 while body 2 is at rest). `jumps`: collision times.
 */
export function halo(pd: PlotDraw, f: (t: number) => number, t1: number, jumps: number[]): void {
  if (t1 <= 0) return;
  const ts: number[] = [];
  for (let i = 0; i <= 160; i++) ts.push((t1 * i) / 160);
  for (const tj of jumps) if (Number.isFinite(tj) && tj > 0 && tj < t1) ts.push(tj - 1e-9, tj + 1e-9);
  ts.sort((a, b) => a - b);
  pd.polyline(
    ts.map((t) => [t, f(t)]),
    { color: C1, width: 7, alpha: 0.25 },
  );
}
