// Stage sub-panels and small data charts drawn on the stage (shared by Ch 18–20).
// A panel is a pixel rectangle of the stage with its own world viewport; a chart maps
// data (x, y) with independent axis scales into a panel.
import { fmtTick, niceTicks } from '../../core/format';
import type { Vec2, WorldSpec } from '../../core/types';
import { Viewport } from '../../core/viewport';
import { CanvasDraw, type Draw } from '../../draw/draw';
import { color, theme, withAlpha } from '../../draw/theme';

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export const TICK = '#6b6b6b';

/** Whole stage in CSS px. */
export const stageRect = (g: Draw): Rect => ({ x: 0, y: 0, w: g.vp.w, h: g.vp.h });

/** Split into a row (side by side) or column (top to bottom) by weights, with a gap in px. */
export function split(r: Rect, dir: 'row' | 'col', weights: number[], gap = 0): Rect[] {
  const sum = weights.reduce((a, b) => a + b, 0);
  const free = (dir === 'row' ? r.w : r.h) - gap * (weights.length - 1);
  const out: Rect[] = [];
  let at = dir === 'row' ? r.x : r.y;
  for (const w of weights) {
    const len = (free * w) / sum;
    out.push(dir === 'row' ? { x: at, y: r.y, w: len, h: r.h } : { x: r.x, y: at, w: r.w, h: len });
    at += len + gap;
  }
  return out;
}

export const inset = (r: Rect, d: number): Rect => ({ x: r.x + d, y: r.y + d, w: Math.max(1, r.w - 2 * d), h: Math.max(1, r.h - 2 * d) });

/** Draw into a sub-rectangle with its own world coordinates. */
export function inPanel(g: Draw, r: Rect, world: WorldSpec, fn: (d: Draw) => void): void {
  const vp = new Viewport();
  vp.fit(world, r.w, r.h);
  g.ctx.save();
  g.ctx.translate(r.x, r.y);
  fn(new CanvasDraw(g.ctx, vp));
  g.ctx.restore();
}

export interface Margins {
  l: number;
  r: number;
  t: number;
  b: number;
}

/** Data chart inside a panel. `d` draws in panel pixels (y up); P(x, y) maps data to it. */
export class Chart {
  readonly L: number;
  readonly R: number;
  readonly B: number;
  readonly T: number;

  constructor(
    readonly d: Draw,
    w: number,
    h: number,
    readonly xr: [number, number],
    readonly yr: [number, number],
    m: Margins,
  ) {
    const s = theme.scale;
    this.L = m.l * s;
    this.R = Math.max(this.L + 10, w - m.r * s);
    this.B = m.b * s;
    this.T = Math.max(this.B + 10, h - m.t * s);
  }

  X(x: number): number {
    return this.L + ((x - this.xr[0]) / (this.xr[1] - this.xr[0])) * (this.R - this.L);
  }

  Y(y: number): number {
    return this.B + ((y - this.yr[0]) / (this.yr[1] - this.yr[0])) * (this.T - this.B);
  }

  P(x: number, y: number): Vec2 {
    return { x: this.X(x), y: this.Y(y) };
  }

  /** Run fn with drawing clipped to the plot area. */
  clip(fn: () => void): void {
    const { ctx, vp } = this.d;
    const [x0, y0] = vp.toPx(this.L, this.T);
    ctx.save();
    ctx.beginPath();
    ctx.rect(x0 - 1, y0 - 1, this.R - this.L + 2, this.T - this.B + 2);
    ctx.clip();
    fn();
    ctx.restore();
  }

  /** Left and bottom axes with tick labels; labels are rich text. */
  axes(o: { xLabel?: string; yLabel?: string; xTicks?: number; yTicks?: number; xTickList?: number[]; yTickList?: number[] }): void {
    const { d } = this;
    const st = { role: 'axis' as const, width: 1.25 };
    d.line({ x: this.L, y: this.B }, { x: this.R, y: this.B }, st);
    d.line({ x: this.L, y: this.B }, { x: this.L, y: this.T }, st);
    const xt = o.xTickList ?? (o.xTicks === 0 ? [] : niceTicks(this.xr[0], this.xr[1], o.xTicks ?? 5));
    for (const x of xt) {
      const X = this.X(x);
      d.line({ x: X, y: this.B }, { x: X, y: this.B - 4 }, { role: 'axis', width: 1 });
      d.text({ x: X, y: this.B }, fmtTick(x), { size: 11, color: TICK, align: 'center', dy: 15 });
    }
    const yt = o.yTickList ?? (o.yTicks === 0 ? [] : niceTicks(this.yr[0], this.yr[1], o.yTicks ?? 4));
    for (const y of yt) {
      const Y = this.Y(y);
      d.line({ x: this.L, y: Y }, { x: this.L - 4, y: Y }, { role: 'axis', width: 1 });
      d.text({ x: this.L, y: Y }, fmtTick(y), { size: 11, color: TICK, align: 'right', baseline: 'middle', dx: -7 });
    }
    if (o.xLabel) d.text({ x: this.R, y: this.B }, o.xLabel, { size: 12, color: TICK, align: 'right', dy: 30 });
    if (o.yLabel) d.text({ x: this.L, y: this.T }, o.yLabel, { size: 12, color: TICK, align: 'left', dx: 6, dy: -4 });
  }

  /** Filled area between the curve pts and y = 0; hatched instead of solid when `hatched`. */
  area(pts: Vec2[], fill: string, hatched: boolean, alpha = 0.2): void {
    if (pts.length < 2) return;
    const poly = [{ x: pts[0].x, y: 0 }, ...pts, { x: pts[pts.length - 1].x, y: 0 }].map((q) => this.P(q.x, q.y));
    if (!hatched) {
      this.d.polygon(poly, { fill, fillAlpha: alpha });
      return;
    }
    const { ctx, vp } = this.d;
    const pat = hatch(ctx, fill);
    ctx.save();
    ctx.beginPath();
    poly.forEach((q, i) => {
      const [x, y] = vp.toPx(q.x, q.y);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.closePath();
    ctx.fillStyle = withAlpha(color(fill), 0.06);
    ctx.fill();
    if (pat) {
      ctx.fillStyle = pat;
      ctx.fill();
    }
    ctx.restore();
  }
}

/** Chart in rect r: margins in px (scaled in lecture mode). */
export function chart(g: Draw, r: Rect, xr: [number, number], yr: [number, number], m: Margins, fn: (c: Chart) => void): void {
  inPanel(g, r, { x: [0, r.w], y: [0, r.h], aspect: 'contain', padPx: 0 }, (d) => fn(new Chart(d, r.w, r.h, xr, yr, m)));
}

const hatches = new Map<string, CanvasPattern | null>();
function hatch(ctx: CanvasRenderingContext2D, c: string): CanvasPattern | null {
  if (!hatches.has(c)) {
    const cv = document.createElement('canvas');
    cv.width = cv.height = 8;
    const h = cv.getContext('2d')!;
    h.strokeStyle = withAlpha(color(c), 0.6);
    h.lineWidth = 1.2;
    h.beginPath();
    h.moveTo(-2, 10);
    h.lineTo(10, -2);
    h.moveTo(-2, 2);
    h.lineTo(2, -2);
    h.moveTo(6, 10);
    h.lineTo(10, 6);
    h.stroke();
    hatches.set(c, ctx.createPattern(cv, 'repeat'));
  }
  return hatches.get(c) ?? null;
}

/** Vertical bar from 0 to v in a chart, with its value at the tip and a label below the axis. */
export function bar(c: Chart, x: number, halfW: number, v: number, fill: string, value: string, label?: string): void {
  const y0 = c.Y(0);
  const y1 = c.Y(v);
  const x0 = c.X(x) - halfW;
  const x1 = c.X(x) + halfW;
  if (Math.abs(y1 - y0) > 0.5) {
    c.d.polygon(
      [
        { x: x0, y: y0 },
        { x: x1, y: y0 },
        { x: x1, y: y1 },
        { x: x0, y: y1 },
      ],
      { fill, fillAlpha: 0.85 },
    );
  }
  const up = v >= 0;
  c.d.text({ x: c.X(x), y: y1 }, value, { size: 11, color: fill, align: 'center', dy: up ? -5 : 14, weight: 500 });
  // Label on the other side of the zero line, next to the bar's foot.
  if (label) c.d.text({ x: c.X(x), y: y0 }, label, { size: 13, color: fill, align: 'center', dy: up ? 18 : -8 });
}
