// Small x-y plot drawn inside the stage (for graphs whose horizontal axis is not time:
// M(B), I(θ), screen intensity). World-coordinate rectangle, data ranges, plain axes.
import { fmtTick } from '../../core/format';
import type { Vec2 } from '../../core/types';
import type { Draw, Stroke } from '../../draw/draw';
import { drawRich, measureRich } from '../../draw/text';
import { color, theme } from '../../draw/theme';

export const TICK = '#6b6b6b';

export interface Rect {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

export interface Axes {
  xLabel?: string;
  yLabel?: string;
  xTicks?: number[];
  yTicks?: number[];
  /** Tick label text; default fmtTick. */
  xFmt?: (v: number) => string;
  yFmt?: (v: number) => string;
  /** Axes through data zero instead of along the left and bottom edges. */
  cross?: boolean;
}

export class Inset {
  constructor(
    readonly g: Draw,
    readonly r: Rect,
    readonly xr: [number, number],
    readonly yr: [number, number],
  ) {}

  /** Data → world. */
  P(x: number, y: number): Vec2 {
    const { r, xr, yr } = this;
    return { x: r.x0 + ((x - xr[0]) / (xr[1] - xr[0])) * (r.x1 - r.x0), y: r.y0 + ((y - yr[0]) / (yr[1] - yr[0])) * (r.y1 - r.y0) };
  }

  /** World → data x. */
  xAt(wx: number): number {
    const { r, xr } = this;
    return xr[0] + ((wx - r.x0) / (r.x1 - r.x0)) * (xr[1] - xr[0]);
  }

  frame(a: Axes = {}): void {
    const { g, xr, yr } = this;
    const ax = a.cross ? Math.min(Math.max(0, yr[0]), yr[1]) : yr[0];
    const ay = a.cross ? Math.min(Math.max(0, xr[0]), xr[1]) : xr[0];
    const st = { role: 'axis' as const, width: 1.25 };
    g.line(this.P(xr[0], ax), this.P(xr[1], ax), st);
    g.line(this.P(ay, yr[0]), this.P(ay, yr[1]), st);
    const fx = a.xFmt ?? fmtTick;
    const fy = a.yFmt ?? fmtTick;
    for (const x of a.xTicks ?? []) {
      const p = this.P(x, ax);
      g.line(p, { x: p.x, y: p.y - g.px(4) }, { role: 'axis', width: 1 });
      g.text(p, fx(x), { size: 11, color: TICK, align: 'center', dy: 15 });
    }
    for (const y of a.yTicks ?? []) {
      const p = this.P(ay, y);
      g.line(p, { x: p.x - g.px(4), y: p.y }, { role: 'axis', width: 1 });
      if (a.cross && ay > xr[0]) {
        // Axis inside the plot: a faint guide across it, the label outside the left edge.
        const q = this.P(xr[0], y);
        g.line(q, this.P(xr[1], y), { color: '#d8d8d8', width: 1, dash: [3, 4] });
        g.text(q, fy(y), { size: 11, color: TICK, align: 'right', baseline: 'middle', dx: -7 });
      } else g.text(p, fy(y), { size: 11, color: TICK, align: 'right', baseline: 'middle', dx: -7 });
    }
    if (a.xLabel) g.text(this.P(xr[1], ax), a.xLabel, { size: 12, color: TICK, align: 'right', dy: a.xTicks?.length ? 30 : 16 });
    if (a.yLabel) g.text(this.P(ay, yr[1]), a.yLabel, { size: 12, color: TICK, align: 'center', dy: -9 });
  }

  /** Clip drawing to the inset rectangle while fn runs. */
  clip(fn: () => void): void {
    const { g, r } = this;
    const [ax, ay] = g.vp.toPx(r.x0, r.y1);
    const [bx, by] = g.vp.toPx(r.x1, r.y0);
    g.ctx.save();
    g.ctx.beginPath();
    g.ctx.rect(ax - 2, ay - 2, bx - ax + 4, by - ay + 4);
    g.ctx.clip();
    fn();
    g.ctx.restore();
  }

  curve(pts: [number, number][], st?: Stroke): void {
    this.clip(() => this.g.polyline(pts.map(([x, y]) => this.P(x, y)), st));
  }

  dot(x: number, y: number, fill: string, rPx = 4.5): void {
    this.g.circle(this.P(x, y), rPx, { fill, color: '#ffffff', width: 1.5 });
  }
}

/** Rich text on a white backing box, so it stays legible over a coloured field. */
export function boxText(
  g: Draw,
  p: Vec2,
  s: string,
  st: { size?: number; color?: string; align?: 'left' | 'center' | 'right'; dx?: number; dy?: number } = {},
): void {
  const size = st.size ?? 13;
  const [x0, y0] = g.vp.toPx(p.x, p.y);
  const x = x0 + (st.dx ?? 0) * theme.scale;
  const y = y0 + (st.dy ?? 0) * theme.scale;
  const ctx = g.ctx;
  const w = measureRich(ctx, s, { size });
  const align = st.align ?? 'left';
  const left = align === 'center' ? x - w / 2 : align === 'right' ? x - w : x;
  const hh = size * theme.scale;
  ctx.save();
  ctx.fillStyle = 'rgba(255,255,255,0.9)';
  ctx.fillRect(left - 4, y - hh * 0.62 - 3, w + 8, hh * 1.24 + 6);
  ctx.restore();
  drawRich(ctx, s, x, y, { size, color: color(st.color ?? 'fg'), align, baseline: 'middle' });
}
