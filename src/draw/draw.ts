// World-coordinate drawing API for the stage (docs/design.md §6.1).
// Coordinates are world units; widths, fonts and arrowheads are screen px.
import type { Role, Vec2 } from '../core/types';
import type { Viewport } from '../core/viewport';
import { drawRich, type TextStyle } from './text';
import { color, theme } from './theme';

export interface Stroke {
  role?: Role;
  color?: string;
  width?: number;
  dash?: number[];
  alpha?: number;
}

export interface ArrowStyle extends Stroke {
  /** Rich-text label drawn just beyond the tip. */
  label?: string;
}

export interface LabelStyle extends Omit<TextStyle, 'color'> {
  role?: Role;
  color?: string;
  /** Offset in px. */
  dx?: number;
  dy?: number;
}

export interface Draw {
  readonly ctx: CanvasRenderingContext2D;
  readonly vp: Viewport;
  /** World length of n screen px. */
  px(n: number): number;
  line(a: Vec2, b: Vec2, st?: Stroke): void;
  polyline(pts: Vec2[], st?: Stroke): void;
  arrow(from: Vec2, vec: Vec2, st?: ArrowStyle): void;
  /** Circle with radius in screen px. */
  circle(c: Vec2, rPx: number, st?: Stroke & { fill?: Role | string }): void;
  /** Closed polygon; fill and/or stroke. */
  polygon(pts: Vec2[], st?: Stroke & { fill?: Role | string; fillAlpha?: number }): void;
  /** Arc of screen radius rPx from angle a0 to a1 (radians, counter-clockwise from +x in world). */
  arc(c: Vec2, rPx: number, a0: number, a1: number, st?: Stroke): void;
  text(p: Vec2, s: string, st?: LabelStyle): void;
  /** Text at a fixed canvas position in CSS px (x from left, y from top), e.g. a formula panel. */
  screenText(x: number, y: number, s: string, st?: LabelStyle): void;
}

/** Plot-coordinate (t, y) drawing used by scene plot hooks. */
export interface PlotDraw {
  readonly ctx: CanvasRenderingContext2D;
  toPx(t: number, y: number): [number, number];
  polyline(pts: [number, number][], st?: Stroke): void;
  dot(t: number, y: number, st?: Stroke & { r?: number }): void;
}

export function applyStroke(ctx: CanvasRenderingContext2D, st: Stroke = {}): void {
  ctx.strokeStyle = color(st.color ?? st.role ?? 'fg');
  ctx.lineWidth = (st.width ?? 1.5) * theme.scale;
  ctx.setLineDash((st.dash ?? []).map((d) => d * theme.scale));
  ctx.globalAlpha = st.alpha ?? 1;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
}

/** Arrow between two pixel points; head size fixed in px. */
export function arrowPx(ctx: CanvasRenderingContext2D, x0: number, y0: number, x1: number, y1: number, st: Stroke = {}): void {
  const dx = x1 - x0;
  const dy = y1 - y0;
  const len = Math.hypot(dx, dy);
  if (len < 0.5) return;
  const head = Math.min(9 * theme.scale, len * 0.6);
  const ux = dx / len;
  const uy = dy / len;
  const bx = x1 - ux * head;
  const by = y1 - uy * head;
  ctx.save();
  applyStroke(ctx, { width: 2, ...st });
  ctx.beginPath();
  ctx.moveTo(x0, y0);
  ctx.lineTo(bx, by);
  ctx.stroke();
  ctx.fillStyle = ctx.strokeStyle;
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(bx - uy * head * 0.45, by + ux * head * 0.45);
  ctx.lineTo(bx + uy * head * 0.45, by - ux * head * 0.45);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

export class CanvasDraw implements Draw {
  constructor(
    readonly ctx: CanvasRenderingContext2D,
    readonly vp: Viewport,
  ) {}

  px(n: number): number {
    return (n * theme.scale) / this.vp.scale;
  }

  line(a: Vec2, b: Vec2, st?: Stroke): void {
    this.polyline([a, b], st);
  }

  polyline(pts: Vec2[], st?: Stroke): void {
    if (pts.length < 2) return;
    const { ctx } = this;
    ctx.save();
    applyStroke(ctx, st);
    ctx.beginPath();
    pts.forEach((p, i) => {
      const [x, y] = this.vp.toPx(p.x, p.y);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.stroke();
    ctx.restore();
  }

  arrow(from: Vec2, vec: Vec2, st: ArrowStyle = {}): void {
    const [x0, y0] = this.vp.toPx(from.x, from.y);
    const [x1, y1] = this.vp.toPx(from.x + vec.x, from.y + vec.y);
    arrowPx(this.ctx, x0, y0, x1, y1, st);
    if (st.label && Math.hypot(x1 - x0, y1 - y0) >= 0.5) {
      const len = Math.hypot(x1 - x0, y1 - y0);
      const off = 10 * theme.scale;
      drawRich(this.ctx, st.label, x1 + ((x1 - x0) / len) * off, y1 + ((y1 - y0) / len) * off, {
        size: 13,
        color: color(st.color ?? st.role ?? 'fg'),
        align: 'center',
        baseline: 'middle',
      });
    }
  }

  circle(c: Vec2, rPx: number, st: Stroke & { fill?: Role | string } = {}): void {
    const { ctx } = this;
    const [x, y] = this.vp.toPx(c.x, c.y);
    ctx.save();
    ctx.beginPath();
    ctx.arc(x, y, rPx * theme.scale, 0, 2 * Math.PI);
    if (st.fill) {
      ctx.globalAlpha = st.alpha ?? 1;
      ctx.fillStyle = color(st.fill);
      ctx.fill();
    }
    if (st.role || st.color || st.width) {
      applyStroke(ctx, st);
      ctx.stroke();
    }
    ctx.restore();
  }

  polygon(pts: Vec2[], st: Stroke & { fill?: Role | string; fillAlpha?: number } = {}): void {
    if (pts.length < 3) return;
    const { ctx } = this;
    ctx.save();
    ctx.beginPath();
    pts.forEach((p, i) => {
      const [x, y] = this.vp.toPx(p.x, p.y);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.closePath();
    if (st.fill) {
      ctx.globalAlpha = st.fillAlpha ?? 1;
      ctx.fillStyle = color(st.fill);
      ctx.fill();
    }
    if (st.role || st.color || st.width) {
      applyStroke(ctx, st);
      ctx.stroke();
    }
    ctx.restore();
  }

  arc(c: Vec2, rPx: number, a0: number, a1: number, st?: Stroke): void {
    const { ctx } = this;
    const [x, y] = this.vp.toPx(c.x, c.y);
    ctx.save();
    applyStroke(ctx, st);
    ctx.beginPath();
    // World y is up, canvas y is down: world angle a is canvas angle −a.
    ctx.arc(x, y, rPx * theme.scale, -a0, -a1, a1 > a0);
    ctx.stroke();
    ctx.restore();
  }

  screenText(x: number, y: number, s: string, st: LabelStyle = {}): void {
    drawRich(this.ctx, s, x * theme.scale, y * theme.scale, { ...st, color: color(st.color ?? st.role ?? 'fg') });
  }

  text(p: Vec2, s: string, st: LabelStyle = {}): void {
    const [x, y] = this.vp.toPx(p.x, p.y);
    drawRich(this.ctx, s, x + (st.dx ?? 0) * theme.scale, y + (st.dy ?? 0) * theme.scale, {
      ...st,
      color: color(st.color ?? st.role ?? 'fg'),
    });
  }
}
