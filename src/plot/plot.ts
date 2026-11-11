// Time-series plots with shared cursor, tangent and area overlays (docs/design.md §6.2).
import katex from 'katex';
import type { History } from '../core/history';
import { fmt, fmtTick, niceTicks } from '../core/format';
import { t as tr } from '../core/i18n';
import { timeUnit, type AreaOverlay, type Overlay, type Params, type PlotHandle, type PlotSpec, type Scene, type SceneCtx, type TangentOverlay, type UiState } from '../core/types';
import { applyStroke, type PlotDraw, type Stroke } from '../draw/draw';
import { drawRich, measureRich } from '../draw/text';
import { color, theme, withAlpha } from '../draw/theme';

export interface PlotHost<P extends Params> {
  scene: Scene<P>;
  params(): P;
  ctx(): SceneCtx<P>;
  isPaused(): boolean;
  /** t = null ends scrubbing. */
  setScrub(t: number | null): void;
}

export interface PlotFrame<P extends Params> {
  hist: History<unknown>;
  p: P;
  ui: UiState;
  /** Sample index under the shared cursor. */
  idx: number;
  tRange: [number, number];
}

const TICK_COLOR = '#6b6b6b';

type Box = { x0: number; y0: number; x1: number; y1: number };
type Cand = { x: number; y: number; align: 'left' | 'right' };

/** Does segment (ax, ay)–(bx, by) meet the box? (Liang–Barsky.) */
function segHitsBox(ax: number, ay: number, bx: number, by: number, b: Box): boolean {
  const dx = bx - ax;
  const dy = by - ay;
  let u0 = 0;
  let u1 = 1;
  const edges: [number, number][] = [
    [-dx, ax - b.x0],
    [dx, b.x1 - ax],
    [-dy, ay - b.y0],
    [dy, b.y1 - ay],
  ];
  for (const [pp, q] of edges) {
    if (pp === 0) {
      if (q < 0) return false;
    } else {
      const u = q / pp;
      if (pp < 0) u0 = Math.max(u0, u);
      else u1 = Math.min(u1, u);
      if (u0 > u1) return false;
    }
  }
  return true;
}

const overlaps = (a: Box, b: Box) => a.x0 < b.x1 && b.x0 < a.x1 && a.y0 < b.y1 && b.y0 < a.y1;
const ZERO_COLOR = '#c4c4c4';

class PlotView implements PlotDraw {
  readonly wrap: HTMLDivElement;
  readonly canvas: HTMLCanvasElement;
  readonly ctx: CanvasRenderingContext2D;
  readonly label: HTMLDivElement;
  showTime = false;
  /** Label boxes placed in the current frame (collision avoidance). */
  boxes: Box[] = [];
  /** Candidate chosen last frame per label key, so labels do not flicker between ties. */
  lastPick = new Map<string, number>();
  w = 0;
  h = 0;
  private dpr = 1;
  L = 0;
  R = 1;
  T = 0;
  B = 1;
  private t0 = 0;
  private t1 = 1;
  private y0 = 0;
  private y1 = 1;

  constructor(readonly spec: PlotSpec<any>) {
    this.wrap = document.createElement('div');
    this.wrap.className = 'plot';
    this.canvas = document.createElement('canvas');
    this.label = document.createElement('div');
    this.label.className = 'plabel';
    katex.render(spec.label, this.label, { throwOnError: false });
    this.wrap.append(this.canvas, this.label);
    this.ctx = this.canvas.getContext('2d')!;
  }

  resize(): void {
    const r = this.wrap.getBoundingClientRect();
    this.dpr = window.devicePixelRatio || 1;
    this.w = r.width;
    this.h = r.height;
    this.canvas.width = Math.max(1, Math.round(r.width * this.dpr));
    this.canvas.height = Math.max(1, Math.round(r.height * this.dpr));
  }

  setRanges(tr: [number, number], yr: [number, number]): void {
    const s = theme.scale;
    [this.t0, this.t1] = tr;
    [this.y0, this.y1] = yr;
    this.L = 46 * s;
    this.R = this.w - 14 * s;
    // Top margin reserves a row for the axis label so it never covers data.
    this.T = 26 * s;
    // The time axis has two rows below it: tick labels, then the axis label (clear of every curve).
    this.B = this.h - (this.showTime ? 36 : 6) * s;
    this.label.style.left = `${this.L + 6 * s}px`;
  }

  X(t: number): number {
    return this.L + ((t - this.t0) / (this.t1 - this.t0)) * (this.R - this.L);
  }

  Y(y: number): number {
    return this.B - ((y - this.y0) / (this.y1 - this.y0)) * (this.B - this.T);
  }

  tAt(px: number): number {
    return this.t0 + ((px - this.L) / (this.R - this.L)) * (this.t1 - this.t0);
  }

  yAt(py: number): number {
    return this.y0 + ((this.B - py) / (this.B - this.T)) * (this.y1 - this.y0);
  }

  get yRange(): [number, number] {
    return [this.y0, this.y1];
  }

  get tRange(): [number, number] {
    return [this.t0, this.t1];
  }

  begin(): void {
    this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    this.ctx.clearRect(0, 0, this.w, this.h);
    this.boxes = [];
  }

  clip(): void {
    this.ctx.beginPath();
    this.ctx.rect(this.L, this.T - 1, this.R - this.L, this.B - this.T + 2);
    this.ctx.clip();
  }

  // PlotDraw
  toPx(t: number, y: number): [number, number] {
    return [this.X(t), this.Y(y)];
  }

  polyline(pts: [number, number][], st?: Stroke): void {
    if (pts.length < 2) return;
    const { ctx } = this;
    ctx.save();
    this.clip();
    applyStroke(ctx, st);
    ctx.beginPath();
    pts.forEach(([t, y], i) => (i ? ctx.lineTo(this.X(t), this.Y(y)) : ctx.moveTo(this.X(t), this.Y(y))));
    ctx.stroke();
    ctx.restore();
  }

  dot(t: number, y: number, st: Stroke & { r?: number } = {}): void {
    const { ctx } = this;
    ctx.save();
    ctx.beginPath();
    ctx.arc(this.X(t), this.Y(y), (st.r ?? 4.5) * theme.scale, 0, 2 * Math.PI);
    ctx.fillStyle = color(st.color ?? st.role ?? 'fg');
    ctx.fill();
    ctx.lineWidth = 1.5 * theme.scale;
    ctx.strokeStyle = '#ffffff';
    ctx.stroke();
    ctx.restore();
  }
}

type Drag<P extends Params> = { view: PlotView; handle: PlotHandle<P>; i: number; pointerId: number };

export class PlotGroup<P extends Params> {
  readonly el: HTMLDivElement;
  private views: PlotView[] = [];
  private byId = new Map<string, PlotView>();
  private drag: Drag<P> | null = null;
  private scrubPointer: number | null = null;
  private hover: { view: PlotView; i: number; handle: PlotHandle<P> } | null = null;
  private hatch = new Map<string, CanvasPattern | null>();
  private hist: History<unknown> | null = null;

  constructor(private readonly host: PlotHost<P>) {
    this.el = document.createElement('div');
    this.el.className = 'plots';
    for (const spec of host.scene.plots ?? []) {
      const v = new PlotView(spec);
      this.views.push(v);
      this.byId.set(spec.id, v);
      this.el.append(v.wrap);
      this.bind(v);
    }
    const last = this.views[this.views.length - 1];
    if (last) last.showTime = true;
  }

  resize(): void {
    for (const v of this.views) v.resize();
  }

  render(f: PlotFrame<P>): void {
    const { hist, p, ui, idx } = f;
    this.hist = hist;
    const ts = hist.col('t');
    const scene = this.host.scene;
    const items: { src: PlotView; ov: Overlay }[] = [];
    for (const v of this.views) {
      v.setRanges(f.tRange, v.spec.yRange(p));
      for (const ov of v.spec.overlays?.(p) ?? []) items.push({ src: v, ov });
    }
    const tc = ts[idx] ?? 0;

    for (const v of this.views) {
      v.begin();
      this.axes(v, timeUnit(scene.time, p));
      for (const { src, ov } of items) if (src === v && ov.kind === 'area') this.areaFill(v, ov, hist, idx);
      scene.drawPlot?.(v.spec.id, v, p, ui);
      for (const tr of v.spec.traces) this.trace(v, ts, hist.col(tr.channel), tr.role);
      this.cursor(v, tc);
      for (const { src, ov } of items) {
        if (ov.kind === 'tangent') {
          if (src === v) this.tangent(v, ov, hist, idx);
          if (ov.target?.plot === v.spec.id) this.tangentTarget(v, ov, hist, idx);
        } else {
          if (src === v) this.areaLabel(v, ov, hist, idx, p);
          if (ov.target?.plot === v.spec.id) this.areaTarget(v, ov, hist, idx, p);
        }
      }
      this.handles(v, p);
    }
  }

  // ------------------------------------------------------------ pieces

  private axes(v: PlotView, unit: string): void {
    const { ctx } = v;
    const s = theme.scale;
    const [y0, y1] = v.yRange;
    ctx.save();
    ctx.lineWidth = 1;
    if (y0 < 0 && y1 > 0) {
      ctx.strokeStyle = ZERO_COLOR;
      ctx.beginPath();
      ctx.moveTo(v.L, Math.round(v.Y(0)) + 0.5);
      ctx.lineTo(v.R, Math.round(v.Y(0)) + 0.5);
      ctx.stroke();
    }
    ctx.strokeStyle = color('axis');
    ctx.beginPath();
    ctx.moveTo(Math.round(v.L) + 0.5, v.T);
    ctx.lineTo(Math.round(v.L) + 0.5, v.B);
    ctx.stroke();
    for (const y of niceTicks(y0, y1, 3)) {
      const py = Math.round(v.Y(y)) + 0.5;
      ctx.beginPath();
      ctx.moveTo(v.L - 4 * s, py);
      ctx.lineTo(v.L, py);
      ctx.stroke();
      drawRich(ctx, fmtTick(y), v.L - 7 * s, py, { size: 11, color: TICK_COLOR, align: 'right', baseline: 'middle' });
    }
    if (v.showTime) {
      ctx.strokeStyle = color('axis');
      ctx.beginPath();
      ctx.moveTo(v.L, Math.round(v.B) + 0.5);
      ctx.lineTo(v.R, Math.round(v.B) + 0.5);
      ctx.stroke();
      const [t0, t1] = v.tRange;
      for (const t of niceTicks(t0, t1, 6)) {
        const px = Math.round(v.X(t)) + 0.5;
        ctx.beginPath();
        ctx.moveTo(px, v.B);
        ctx.lineTo(px, v.B + 4 * s);
        ctx.stroke();
        drawRich(ctx, fmtTick(t), px, v.B + 15 * s, { size: 11, color: TICK_COLOR, align: 'center' });
      }
      drawRich(ctx, `*t* (${unit})`, v.R, v.B + 31 * s, { size: 12, color: TICK_COLOR, align: 'right' });
    }
    ctx.restore();
  }

  private trace(v: PlotView, ts: readonly number[], ys: readonly number[], role: Stroke['role']): void {
    const n = Math.min(ts.length, ys.length);
    if (n < 2) return;
    const { ctx } = v;
    ctx.save();
    v.clip();
    applyStroke(ctx, { role, width: 2 });
    ctx.beginPath();
    ctx.moveTo(v.X(ts[0]), v.Y(ys[0]));
    for (let i = 1; i < n; i++) ctx.lineTo(v.X(ts[i]), v.Y(ys[i]));
    ctx.stroke();
    ctx.restore();
  }

  private cursor(v: PlotView, tc: number): void {
    const { ctx } = v;
    const x = Math.round(v.X(tc)) + 0.5;
    ctx.save();
    ctx.strokeStyle = '#b5b5b5';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x, v.T);
    ctx.lineTo(x, v.B);
    ctx.stroke();
    ctx.restore();
  }

  private hatchFor(role: string, ctx: CanvasRenderingContext2D): CanvasPattern | null {
    if (!this.hatch.has(role)) {
      const c = document.createElement('canvas');
      c.width = c.height = 8;
      const g = c.getContext('2d')!;
      g.strokeStyle = withAlpha(color(role), 0.55);
      g.lineWidth = 1.2;
      g.beginPath();
      g.moveTo(-2, 10);
      g.lineTo(10, -2);
      g.moveTo(-2, 2);
      g.lineTo(2, -2);
      g.moveTo(6, 10);
      g.lineTo(10, 6);
      g.stroke();
      this.hatch.set(role, ctx.createPattern(c, 'repeat'));
    }
    return this.hatch.get(role) ?? null;
  }

  /** Signed area under the curve from the first sample to the cursor: solid above zero, hatched below. */
  private areaFill(v: PlotView, ov: AreaOverlay, hist: History<unknown>, idx: number): void {
    const ts = hist.col('t');
    const ys = hist.col(ov.channel);
    if (idx < 1) return;
    const { ctx } = v;
    const path = new Path2D();
    const yz = v.Y(0);
    path.moveTo(v.X(ts[0]), yz);
    for (let i = 0; i <= idx; i++) path.lineTo(v.X(ts[i]), v.Y(ys[i]));
    path.lineTo(v.X(ts[idx]), yz);
    path.closePath();
    const base = color(ov.role);
    ctx.save();
    v.clip();
    ctx.save();
    ctx.beginPath();
    ctx.rect(v.L, v.T, v.R - v.L, Math.max(0, yz - v.T));
    ctx.clip();
    ctx.fillStyle = withAlpha(base, 0.22);
    ctx.fill(path);
    ctx.restore();
    ctx.beginPath();
    ctx.rect(v.L, yz, v.R - v.L, Math.max(0, v.B - yz));
    ctx.clip();
    ctx.fillStyle = withAlpha(base, 0.07);
    ctx.fill(path);
    const pat = this.hatchFor(ov.role, ctx);
    if (pat) {
      ctx.fillStyle = pat;
      ctx.fill(path);
    }
    ctx.restore();
  }

  private areaValue(ov: AreaOverlay, hist: History<unknown>, idx: number, p: P): number {
    const ts = hist.col('t');
    if (ov.area) return ov.area(p, ts[0], ts[idx]);
    const ys = hist.col(ov.channel);
    let a = 0;
    for (let i = 1; i <= idx; i++) a += 0.5 * (ys[i] + ys[i - 1]) * (ts[i] - ts[i - 1]);
    return a;
  }

  private areaLabel(v: PlotView, ov: AreaOverlay, hist: History<unknown>, idx: number, p: P): void {
    const tc = hist.col('t')[idx];
    const txt = `${tr('plot.area')} = ${fmt(this.areaValue(ov, hist, idx, p))} ${ov.unit}`;
    const s = theme.scale;
    const x = v.X(tc);
    // Top corner beside the cursor first, then the bottom corner.
    this.place(v, `area:${ov.channel}`, txt, ov.role, [
      { x: x + 8 * s, y: v.T + 12 * s, align: 'left' },
      { x: x - 8 * s, y: v.T + 12 * s, align: 'right' },
      { x: x + 8 * s, y: v.B - 4 * s, align: 'left' },
      { x: x - 8 * s, y: v.B - 4 * s, align: 'right' },
    ]);
  }

  /** Bar on the target plot: change of the target channel since the first sample. */
  private areaTarget(v: PlotView, ov: AreaOverlay, hist: History<unknown>, idx: number, p: P): void {
    const ts = hist.col('t');
    const ys = hist.col(ov.target!.channel);
    const area = this.areaValue(ov, hist, idx, p);
    const { ctx } = v;
    const s = theme.scale;
    const x = v.X(ts[idx]);
    const ya = v.Y(ys[0]);
    const yb = v.Y(ys[idx]);
    const c = color(ov.role);
    ctx.save();
    v.clip();
    ctx.strokeStyle = c;
    ctx.lineWidth = 1 * s;
    ctx.setLineDash([3 * s, 3 * s]);
    ctx.beginPath();
    ctx.moveTo(v.X(ts[0]), ya);
    ctx.lineTo(x, ya);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.lineWidth = 3 * s;
    ctx.lineCap = 'butt';
    ctx.beginPath();
    ctx.moveTo(x, ya);
    ctx.lineTo(x, yb);
    ctx.stroke();
    ctx.lineWidth = 1.5 * s;
    for (const y of [ya, yb]) {
      ctx.beginPath();
      ctx.moveTo(x - 4 * s, y);
      ctx.lineTo(x + 4 * s, y);
      ctx.stroke();
    }
    ctx.restore();
    const ym = (ya + yb) / 2 + 4 * s;
    const yTop = Math.min(ya, yb) - 6 * s;
    const yBot = Math.max(ya, yb) + 16 * s;
    this.place(v, `bar:${ov.channel}`, `${ov.symbol} = ${fmt(area)} ${ov.unit}`, ov.role, [
      { x: x + 8 * s, y: ym, align: 'left' },
      { x: x - 8 * s, y: ym, align: 'right' },
      { x: x + 8 * s, y: yTop, align: 'left' },
      { x: x - 8 * s, y: yTop, align: 'right' },
      { x: x + 8 * s, y: yBot, align: 'left' },
      { x: x - 8 * s, y: yBot, align: 'right' },
    ]);
  }

  private tangent(v: PlotView, ov: TangentOverlay, hist: History<unknown>, idx: number): void {
    const tc = hist.col('t')[idx];
    const yc = hist.col(ov.channel)[idx];
    const k = hist.col(ov.slopeChannel)[idx];
    if (tc === undefined || yc === undefined || k === undefined) return;
    // Fixed on-screen half-length along the tangent, independent of how steep it is.
    const [cx, cy] = v.toPx(tc, yc);
    const [t0, t1] = v.tRange;
    const d = 1e-3 * (t1 - t0);
    const [qx, qy] = v.toPx(tc + d, yc + k * d);
    const n = Math.hypot(qx - cx, qy - cy) || 1;
    const half = 30 * theme.scale;
    const ux = ((qx - cx) / n) * half;
    const uy = ((qy - cy) / n) * half;
    const [ax, ay] = [cx - ux, cy - uy];
    const [bx, by] = [cx + ux, cy + uy];
    const { ctx } = v;
    ctx.save();
    v.clip();
    applyStroke(ctx, { role: ov.role, width: 2.25 });
    ctx.beginPath();
    ctx.moveTo(ax, ay);
    ctx.lineTo(bx, by);
    ctx.stroke();
    ctx.restore();
    v.dot(tc, yc, { role: ov.role, r: 3.5 });
    const txt = `${tr('plot.slope')} = ${fmt(k)} ${ov.unit}`;
    const s = theme.scale;
    // Beside either end of the tangent, above or below: the first spot clear of curves and labels.
    const xr = Math.min(bx, v.R) + 6;
    const xl = Math.max(ax, v.L) - 6;
    this.place(v, `tan:${ov.channel}`, txt, ov.role, [
      { x: xr, y: by - 8 * s, align: 'left' },
      { x: xr, y: by + 18 * s, align: 'left' },
      { x: xl, y: ay - 8 * s, align: 'right' },
      { x: xl, y: ay + 18 * s, align: 'right' },
    ]);
  }

  private tangentTarget(v: PlotView, ov: TangentOverlay, hist: History<unknown>, idx: number): void {
    const tc = hist.col('t')[idx];
    const y = hist.col(ov.target!.channel)[idx];
    if (tc === undefined || y === undefined) return;
    v.dot(tc, y, { role: ov.role, r: 5 });
  }

  /** Box of a label drawn by textBox at (x, y). */
  private boxOf(v: PlotView, txt: string, c: Cand): Box {
    const s = theme.scale;
    const w = measureRich(v.ctx, txt, { size: 12, weight: 500 });
    const yy = Math.min(Math.max(c.y, v.T + 10 * s), v.B - 4 * s);
    const x0 = c.align === 'left' ? c.x - 3 : c.x - w - 3;
    return { x0, y0: yy - 11 * s, x1: x0 + w + 6, y1: yy + 4 * s };
  }

  /** Curve segments of this plot's traces that pass through the box. */
  private curveHits(v: PlotView, b: Box): number {
    const hist = this.hist;
    if (!hist) return 0;
    const ts = hist.col('t');
    const n = ts.length;
    // Samples are time-ordered: start one sample left of the box.
    const tLeft = v.tAt(b.x0);
    let lo = 0;
    let hi = n - 1;
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1;
      if (ts[mid] <= tLeft) lo = mid;
      else hi = mid;
    }
    let hits = 0;
    for (const tr of v.spec.traces) {
      const ys = hist.col(tr.channel);
      for (let i = Math.max(1, lo); i < n; i++) {
        const ax = v.X(ts[i - 1]);
        if (ax > b.x1) break;
        if (segHitsBox(ax, v.Y(ys[i - 1]), v.X(ts[i]), v.Y(ys[i]), b)) hits += 1;
      }
    }
    return hits;
  }

  /**
   * Draw a label at the first candidate that stays inside the plot and clear of the traces and
   * of labels already placed; keep last frame's choice while it is as good as the best one.
   */
  private place(v: PlotView, key: string, txt: string, role: Stroke['role'], cands: Cand[]): void {
    const score = (c: Cand) => {
      const b = this.boxOf(v, txt, c);
      let n = b.x0 < v.L - 2 || b.x1 > v.R + 2 ? 1e6 : 0;
      for (const o of v.boxes) if (overlaps(b, o)) n += 1e3;
      return n + this.curveHits(v, b);
    };
    const scores = cands.map(score);
    let best = 0;
    for (let i = 1; i < cands.length; i++) if (scores[i] < scores[best]) best = i;
    const prev = v.lastPick.get(key);
    if (prev !== undefined && prev < cands.length && scores[prev] <= scores[best]) best = prev;
    v.lastPick.set(key, best);
    const c = cands[best];
    v.boxes.push(this.boxOf(v, txt, c));
    this.textBox(v, txt, c.x, c.y, role, c.align);
  }

  /** Text on a white backing so it stays legible over curves; y is clamped into the plot. */
  private textBox(v: PlotView, txt: string, x: number, y: number, role: Stroke['role'], align: 'left' | 'right'): void {
    const s = theme.scale;
    const ctx = v.ctx;
    const w = measureRich(ctx, txt, { size: 12, weight: 500 });
    const yy = Math.min(Math.max(y, v.T + 10 * s), v.B - 4 * s);
    ctx.save();
    ctx.fillStyle = 'rgba(255,255,255,0.88)';
    ctx.fillRect(align === 'left' ? x - 3 : x - w - 3, yy - 11 * s, w + 6, 15 * s);
    ctx.restore();
    drawRich(ctx, txt, x, yy, { size: 12, color: color(role ?? 'fg'), align, weight: 500 });
  }

  // ------------------------------------------------------------ handles

  private activeHandles(v: PlotView, p: P): PlotHandle<P>[] {
    return (this.host.scene.plotHandles ?? []).filter((h) => h.plot === v.spec.id && (h.when?.(p) ?? true));
  }

  private handles(v: PlotView, p: P): void {
    const { ctx } = v;
    const s = theme.scale;
    for (const h of this.activeHandles(v, p)) {
      for (let i = 0; i < h.count(p); i++) {
        const [t, y] = h.pos(p, i);
        const x = v.X(t);
        const py = v.Y(y);
        const hot = (this.hover?.handle === h && this.hover.i === i) || (this.drag?.handle === h && this.drag.i === i);
        ctx.save();
        ctx.beginPath();
        ctx.roundRect(x - 13 * s, py - 4.5 * s, 26 * s, 9 * s, 4.5 * s);
        ctx.fillStyle = hot ? '#1a1a1a' : '#5c5c5c';
        ctx.fill();
        ctx.lineWidth = 1.5;
        ctx.strokeStyle = '#ffffff';
        ctx.stroke();
        ctx.restore();
      }
    }
  }

  private hit(v: PlotView, px: number, py: number, touch: boolean): { handle: PlotHandle<P>; i: number } | null {
    const p = this.host.params();
    const rx = (touch ? 24 : 16) * theme.scale;
    const ry = (touch ? 18 : 10) * theme.scale;
    for (const h of this.activeHandles(v, p)) {
      for (let i = 0; i < h.count(p); i++) {
        const [t, y] = h.pos(p, i);
        if (Math.abs(px - v.X(t)) < rx && Math.abs(py - v.Y(y)) < ry) return { handle: h, i };
      }
    }
    return null;
  }

  private bind(v: PlotView): void {
    const c = v.canvas;
    const local = (e: PointerEvent): [number, number] => {
      const r = c.getBoundingClientRect();
      return [e.clientX - r.left, e.clientY - r.top];
    };
    c.addEventListener('pointerdown', (e) => {
      const [px, py] = local(e);
      const h = this.hit(v, px, py, e.pointerType !== 'mouse');
      if (h) {
        this.drag = { view: v, handle: h.handle, i: h.i, pointerId: e.pointerId };
        c.setPointerCapture(e.pointerId);
        h.handle.onDrag(this.host.ctx(), h.i, v.tAt(px), v.yAt(py));
        e.preventDefault();
        return;
      }
      if (this.host.isPaused() && px >= v.L && px <= v.R) {
        this.scrubPointer = e.pointerId;
        c.setPointerCapture(e.pointerId);
        this.host.setScrub(v.tAt(px));
      }
    });
    c.addEventListener('pointermove', (e) => {
      const [px, py] = local(e);
      if (this.drag && this.drag.pointerId === e.pointerId) {
        this.drag.handle.onDrag(this.host.ctx(), this.drag.i, v.tAt(px), v.yAt(py));
        return;
      }
      const h = e.pointerType === 'mouse' ? this.hit(v, px, py, false) : null;
      this.hover = h ? { view: v, ...h } : null;
      c.style.cursor = h ? 'ns-resize' : this.host.isPaused() ? 'col-resize' : 'default';
      if (this.scrubPointer === e.pointerId || (e.pointerType === 'mouse' && this.host.isPaused() && !h)) {
        this.host.setScrub(v.tAt(px));
      }
    });
    const end = (e: PointerEvent) => {
      if (this.drag?.pointerId === e.pointerId) this.drag = null;
      if (this.scrubPointer === e.pointerId) {
        this.scrubPointer = null;
        if (e.pointerType !== 'mouse') this.host.setScrub(null);
      }
    };
    c.addEventListener('pointerup', end);
    c.addEventListener('pointercancel', end);
    c.addEventListener('pointerleave', (e) => {
      this.hover = null;
      if (e.pointerType === 'mouse' && !this.drag && this.scrubPointer === null) this.host.setScrub(null);
    });
  }
}
