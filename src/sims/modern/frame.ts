// Pixel-space layout and data frames for stage drawings (Ch 37–41). Scenes using this set
// world = PX_WORLD and lay out their panels in CSS px from the canvas size, so the same scene
// adapts to wide and narrow screens. A Frame maps data (x, y) into a pixel box with
// independent x and y scales (e.g. nm and eV).
import { fmtTick, niceTicks } from '../../core/format';
import type { Vec2, WorldSpec } from '../../core/types';
import type { Draw, LabelStyle, Stroke } from '../../draw/draw';
import { color } from '../../draw/theme';

export const TICK = '#6b6b6b';
export const GRID = '#ececec';

/** Any fixed world: drawings convert CSS px to world with W(). */
export const PX_WORLD = (): WorldSpec => ({ x: [0, 1], y: [0, 1], aspect: 'contain', padPx: 0 });

export interface Box {
  l: number;
  t: number;
  r: number;
  b: number;
}

/** The whole canvas in CSS px, inset by pad. */
export const canvasBox = (g: Draw, pad = 0): Box => ({ l: pad, t: pad, r: g.vp.w - pad, b: g.vp.h - pad });

/** World point of a canvas CSS-px point. */
export function W(g: Draw, x: number, y: number): Vec2 {
  const [a, b] = g.vp.toWorld(x, y);
  return { x: a, y: b };
}

/** Text at a CSS-px position. */
export const textPx = (g: Draw, x: number, y: number, s: string, st?: LabelStyle) => g.text(W(g, x, y), s, st);

export const linePx = (g: Draw, x0: number, y0: number, x1: number, y1: number, st?: Stroke) => g.line(W(g, x0, y0), W(g, x1, y1), st);

export const rectPx = (g: Draw, b: Box, st: Stroke & { fill?: string; fillAlpha?: number }) =>
  g.polygon([W(g, b.l, b.t), W(g, b.r, b.t), W(g, b.r, b.b), W(g, b.l, b.b)], st);

/** Split a box into two side by side (frac of width to the first) or stacked. */
export function split(b: Box, horizontal: boolean, frac: number, gap: number): [Box, Box] {
  if (horizontal) {
    const m = b.l + (b.r - b.l - gap) * frac;
    return [
      { ...b, r: m },
      { ...b, l: m + gap },
    ];
  }
  const m = b.t + (b.b - b.t - gap) * frac;
  return [
    { ...b, b: m },
    { ...b, t: m + gap },
  ];
}

export interface AxesOpts {
  xLabel?: string;
  yLabel?: string;
  xTicks?: number[] | false;
  yTicks?: number[] | false;
  xFmt?: (v: number) => string;
  yFmt?: (v: number) => string;
  /** Draw the x axis at y = 0 instead of at the bottom. */
  xAtZero?: boolean;
}

export class Frame {
  constructor(
    readonly g: Draw,
    readonly box: Box,
    readonly xr: [number, number],
    readonly yr: [number, number],
    readonly log: { x?: boolean; y?: boolean } = {},
  ) {}

  private fx(x: number): number {
    if (!this.log.x) return (x - this.xr[0]) / (this.xr[1] - this.xr[0]);
    return (Math.log10(x) - Math.log10(this.xr[0])) / (Math.log10(this.xr[1]) - Math.log10(this.xr[0]));
  }

  private fy(y: number): number {
    if (!this.log.y) return (y - this.yr[0]) / (this.yr[1] - this.yr[0]);
    return (Math.log10(y) - Math.log10(this.yr[0])) / (Math.log10(this.yr[1]) - Math.log10(this.yr[0]));
  }

  X(x: number): number {
    return this.box.l + this.fx(x) * (this.box.r - this.box.l);
  }

  Y(y: number): number {
    return this.box.b - this.fy(y) * (this.box.b - this.box.t);
  }

  /** Data → world point. */
  P(x: number, y: number): Vec2 {
    return W(this.g, this.X(x), this.Y(y));
  }

  /** Data x of a pixel column. */
  xAt(px: number): number {
    const f = (px - this.box.l) / (this.box.r - this.box.l);
    return this.log.x ? 10 ** (Math.log10(this.xr[0]) + f * (Math.log10(this.xr[1]) - Math.log10(this.xr[0]))) : this.xr[0] + f * (this.xr[1] - this.xr[0]);
  }

  yAt(py: number): number {
    const f = (this.box.b - py) / (this.box.b - this.box.t);
    return this.log.y ? 10 ** (Math.log10(this.yr[0]) + f * (Math.log10(this.yr[1]) - Math.log10(this.yr[0]))) : this.yr[0] + f * (this.yr[1] - this.yr[0]);
  }

  line(x0: number, y0: number, x1: number, y1: number, st?: Stroke): void {
    this.g.line(this.P(x0, y0), this.P(x1, y1), st);
  }

  polyline(pts: [number, number][], st?: Stroke): void {
    this.g.polyline(
      pts.map(([x, y]) => this.P(x, y)),
      st,
    );
  }

  polygon(pts: [number, number][], st: Stroke & { fill?: string; fillAlpha?: number }): void {
    this.g.polygon(
      pts.map(([x, y]) => this.P(x, y)),
      st,
    );
  }

  text(x: number, y: number, s: string, st?: LabelStyle): void {
    this.g.text(this.P(x, y), s, st);
  }

  /** Run fn with drawing clipped to the frame box (plus `pad` px). */
  clip(fn: () => void, pad = 0): void {
    const { ctx } = this.g;
    ctx.save();
    ctx.beginPath();
    ctx.rect(this.box.l - pad, this.box.t - pad, this.box.r - this.box.l + 2 * pad, this.box.b - this.box.t + 2 * pad);
    ctx.clip();
    fn();
    ctx.restore();
  }

  axes(o: AxesOpts = {}): void {
    const g = this.g;
    const { l, r, t, b } = this.box;
    const axis = color('axis');
    const yAxisX = l;
    const xAxisY = o.xAtZero && this.yr[0] < 0 && this.yr[1] > 0 ? this.Y(0) : b;
    linePx(g, yAxisX, t, yAxisX, b, { color: axis, width: 1 });
    linePx(g, l, xAxisY, r, xAxisY, { color: axis, width: 1 });
    const xt = o.xTicks === false ? [] : (o.xTicks ?? (this.log.x ? [] : niceTicks(this.xr[0], this.xr[1], 5)));
    const yt = o.yTicks === false ? [] : (o.yTicks ?? (this.log.y ? [] : niceTicks(this.yr[0], this.yr[1], 4)));
    for (const x of xt) {
      const px = this.X(x);
      if (px < l - 0.5 || px > r + 0.5) continue;
      linePx(g, px, xAxisY, px, xAxisY + 4, { color: axis, width: 1 });
      textPx(g, px, xAxisY + 15, (o.xFmt ?? fmtTick)(x), { size: 11, color: TICK, align: 'center' });
    }
    for (const y of yt) {
      const py = this.Y(y);
      if (py < t - 0.5 || py > b + 0.5) continue;
      linePx(g, yAxisX - 4, py, yAxisX, py, { color: axis, width: 1 });
      textPx(g, yAxisX - 7, py, (o.yFmt ?? fmtTick)(y), { size: 11, color: TICK, align: 'right', baseline: 'middle' });
    }
    if (o.xLabel) textPx(g, r, xAxisY - 6, o.xLabel, { size: 12, color: TICK, align: 'right' });
    if (o.yLabel) textPx(g, l + 6, t + 2, o.yLabel, { size: 12, color: TICK, align: 'left', baseline: 'top' });
  }
}

/** "10⁻¹⁰" style label for a power of ten. */
export function pow10(e: number): string {
  if (e === 0) return '1';
  if (e === 1) return '10';
  return `10^{${e < 0 ? '−' : ''}${Math.abs(e)}}`;
}
