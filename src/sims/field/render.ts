// Canvas layers of the 2D field engine: vector grid, field lines, contours, heatmap, and the
// glyphs shared by Ch 22–24, 29, 30. Geometry is computed in screen px and memoised, so a
// frame without a change only strokes cached paths.
import { fmt } from '../../core/format';
import type { Vec2 } from '../../core/types';
import type { Draw } from '../../draw/draw';
import { arrowPx } from '../../draw/draw';
import { drawRich } from '../../draw/text';
import { color, theme, withAlpha } from '../../draw/theme';
import { contour, type FieldFn, type Src, type V2 } from './physics';

export const FIELD_GREY = '#8c8c8c';
export const LINE_GREY = '#a6a6a6';
export const SURFACE = '#E69F00';
export const OUT = '#D55E00';
export const IN = '#0072B2';

/** Last-value cache keyed by a string. */
export class Memo<T> {
  private key: string | null = null;
  private val!: T;
  get(key: string, f: () => T): T {
    if (key !== this.key) {
      this.val = f();
      this.key = key;
    }
    return this.val;
  }
}

/** World rectangle covered by the canvas: [x0, y0, x1, y1]. */
export function viewRect(g: Draw): [number, number, number, number] {
  const [x0, y1] = g.vp.toWorld(0, 0);
  const [x1, y0] = g.vp.toWorld(g.vp.w, g.vp.h);
  return [x0, y0, x1, y1];
}

/** Key fragment for anything that depends on the viewport. */
export const vpKey = (g: Draw) => `${g.vp.w}x${g.vp.h}@${g.vp.scale.toFixed(4)}|${theme.scale}`;
export const srcKey = (s: readonly Src[]) => s.map((c) => `${c.x},${c.y},${c.s}`).join(';');

// ------------------------------------------------------------------ vector grid

/** Grid arrows [x, y, ux, uy, len] in px; length grows with log |F| over three decades. */
export function vectorGrid(g: Draw, f: FieldFn, avoid: readonly Vec2[], spacingPx = 34, avoidPx = 16): Float32Array {
  const { vp } = g;
  const sp = spacingPx * theme.scale;
  const nx = Math.floor(vp.w / sp);
  const ny = Math.floor(vp.h / sp);
  const ox = (vp.w - (nx - 1) * sp) / 2;
  const oy = (vp.h - (ny - 1) * sp) / 2;
  const avoidPxs = avoid.map((a) => vp.toPx(a.x, a.y));
  const rows: number[][] = [];
  const mags: number[] = [];
  for (let j = 0; j < ny; j++) {
    for (let i = 0; i < nx; i++) {
      const px = ox + i * sp;
      const py = oy + j * sp;
      if (avoidPxs.some(([ax, ay]) => Math.hypot(px - ax, py - ay) < avoidPx * theme.scale)) continue;
      const [wx, wy] = vp.toWorld(px, py);
      const [fx, fy] = f(wx, wy);
      const m = Math.hypot(fx, fy);
      if (!(m > 0) || !Number.isFinite(m)) continue;
      rows.push([px, py, fx / m, -fy / m, m]);
      mags.push(m);
    }
  }
  if (!mags.length) return new Float32Array(0);
  const sorted = [...mags].sort((a, b) => a - b);
  const hi = sorted[Math.floor(0.9 * (sorted.length - 1))];
  const lo = hi / 1000;
  const out = new Float32Array(rows.length * 5);
  rows.forEach((r, k) => {
    const u = Math.min(1, Math.max(0, Math.log10(r[4] / lo) / 3));
    out.set([r[0], r[1], r[2], r[3], (5 + 21 * u) * theme.scale], k * 5);
  });
  return out;
}

export function drawVectorGrid(g: Draw, arr: Float32Array, col = FIELD_GREY): void {
  const { ctx } = g;
  ctx.save();
  ctx.strokeStyle = col;
  ctx.fillStyle = col;
  ctx.lineWidth = 1.25 * theme.scale;
  ctx.lineCap = 'round';
  const shafts = new Path2D();
  const heads = new Path2D();
  for (let k = 0; k < arr.length; k += 5) {
    const [x, y, ux, uy, len] = [arr[k], arr[k + 1], arr[k + 2], arr[k + 3], arr[k + 4]];
    const x0 = x - (ux * len) / 2;
    const y0 = y - (uy * len) / 2;
    const x1 = x + (ux * len) / 2;
    const y1 = y + (uy * len) / 2;
    const hd = Math.min(5 * theme.scale, len * 0.5);
    shafts.moveTo(x0, y0);
    shafts.lineTo(x1 - ux * hd * 0.6, y1 - uy * hd * 0.6);
    heads.moveTo(x1, y1);
    heads.lineTo(x1 - ux * hd - uy * hd * 0.5, y1 - uy * hd + ux * hd * 0.5);
    heads.lineTo(x1 - ux * hd + uy * hd * 0.5, y1 - uy * hd - ux * hd * 0.5);
    heads.closePath();
  }
  ctx.stroke(shafts);
  ctx.fill(heads);
  ctx.restore();
}

// ------------------------------------------------------------------ polylines (field lines, contours)

export interface PxLines {
  path: Path2D;
  /** Arrowheads [x, y, ux, uy] in px. */
  heads: number[];
}

/**
 * World polylines → one px path, plus arrowheads every `everyPx` of arc length (first at
 * `firstPx`) pointing along f. Pass f = null for no arrowheads.
 */
export function linesPx(g: Draw, lines: readonly number[][], f: FieldFn | null, firstPx = 60, everyPx = 150): PxLines {
  const { vp } = g;
  const path = new Path2D();
  const heads: number[] = [];
  const s = theme.scale;
  for (const l of lines) {
    if (l.length < 4) continue;
    let [px, py] = vp.toPx(l[0], l[1]);
    path.moveTo(px, py);
    let acc = 0;
    let next = firstPx * s;
    for (let k = 2; k < l.length; k += 2) {
      const [qx, qy] = vp.toPx(l[k], l[k + 1]);
      const d = Math.hypot(qx - px, qy - py);
      path.lineTo(qx, qy);
      if (f && d > 0 && acc + d >= next) {
        const [fx, fy] = f(l[k], l[k + 1]);
        let ux = (qx - px) / d;
        let uy = (qy - py) / d;
        if (ux * fx - uy * fy < 0) {
          ux = -ux;
          uy = -uy;
        }
        heads.push(qx, qy, ux, uy);
        next += everyPx * s;
      }
      acc += d;
      px = qx;
      py = qy;
    }
  }
  return { path, heads };
}

export function drawPxLines(g: Draw, L: PxLines, col = LINE_GREY, width = 1.25, dash?: number[]): void {
  const { ctx } = g;
  const s = theme.scale;
  ctx.save();
  ctx.strokeStyle = col;
  ctx.fillStyle = col;
  ctx.lineWidth = width * s;
  ctx.lineJoin = 'round';
  if (dash) ctx.setLineDash(dash.map((d) => d * s));
  ctx.stroke(L.path);
  ctx.setLineDash([]);
  const heads = new Path2D();
  const hd = 7 * s;
  for (let k = 0; k < L.heads.length; k += 4) {
    const [x, y, ux, uy] = [L.heads[k], L.heads[k + 1], L.heads[k + 2], L.heads[k + 3]];
    const bx = x + ux * hd * 0.5;
    const by = y + uy * hd * 0.5;
    heads.moveTo(bx, by);
    heads.lineTo(bx - ux * hd - uy * hd * 0.42, by - uy * hd + ux * hd * 0.42);
    heads.lineTo(bx - ux * hd + uy * hd * 0.42, by - uy * hd - ux * hd * 0.42);
    heads.closePath();
  }
  ctx.fill(heads);
  ctx.restore();
}

// ------------------------------------------------------------------ scalar grid: contours and heatmap

export interface Grid {
  vals: Float64Array;
  nx: number;
  ny: number;
  /** px per grid cell. */
  cell: number;
}

/** Scalar sampled on a px grid covering the canvas (values clamped to ±cap). */
export function scalarGrid(g: Draw, fn: (x: number, y: number) => number, cellPx: number, cap = Infinity): Grid {
  const { vp } = g;
  const cell = cellPx * theme.scale;
  const nx = Math.ceil(vp.w / cell) + 1;
  const ny = Math.ceil(vp.h / cell) + 1;
  const vals = new Float64Array(nx * ny);
  for (let j = 0; j < ny; j++) {
    for (let i = 0; i < nx; i++) {
      const [wx, wy] = vp.toWorld(i * cell, j * cell);
      const v = fn(wx, wy);
      vals[j * nx + i] = Number.isFinite(v) ? Math.max(-cap, Math.min(cap, v)) : v > 0 ? cap : -cap;
    }
  }
  return { vals, nx, ny, cell };
}

/** Contours of the grid at each level → world polylines (via px). */
export function gridContours(g: Draw, gr: Grid, levels: readonly number[]): { level: number; lines: number[][] }[] {
  return levels.map((level) => ({
    level,
    lines: contour(gr.vals, gr.nx, gr.ny, level).map((l) => {
      const out: number[] = [];
      for (let k = 0; k < l.length; k += 2) {
        const [wx, wy] = g.vp.toWorld(l[k] * gr.cell, l[k + 1] * gr.cell);
        out.push(wx, wy);
      }
      return out;
    }),
  }));
}

const rgb = (hex: string): [number, number, number] => {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};

const SUP_DIGIT: Record<string, string> = { '⁻': '-', '⁰': '0', '¹': '1', '²': '2', '³': '3', '⁴': '4', '⁵': '5', '⁶': '6', '⁷': '7', '⁸': '8', '⁹': '9' };

/** Number for a TeX panel: `sig` figures, |v| < zeroTol shows as 0, ×10ⁿ as TeX. */
export function texNum(v: number, sig = 3, zeroTol = 1e-9): string {
  if (!Number.isFinite(v)) return '\\text{–}';
  if (Math.abs(v) < zeroTol) return '0';
  return fmt(v, sig, zeroTol)
    .replace('−', '-')
    .replace(/×10([⁻⁰¹²³⁴⁵⁶⁷⁸⁹]+)/, (_m, e: string) => `\\times 10^{${[...e].map((c) => SUP_DIGIT[c]).join('')}}`);
}

/** Diverging heatmap (blue < 0 < vermilion, white at 0) of tanh(v / scale), as a small canvas. */
export function heatCanvas(gr: Grid, scale: number): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = gr.nx;
  c.height = gr.ny;
  const ctx = c.getContext('2d')!;
  const img = ctx.createImageData(gr.nx, gr.ny);
  const P = rgb(OUT);
  const N = rgb(IN);
  for (let k = 0; k < gr.vals.length; k++) {
    const u = Math.tanh(gr.vals[k] / scale);
    const t = Math.abs(u) * 0.8;
    const C = u >= 0 ? P : N;
    img.data[4 * k] = 255 + (C[0] - 255) * t;
    img.data[4 * k + 1] = 255 + (C[1] - 255) * t;
    img.data[4 * k + 2] = 255 + (C[2] - 255) * t;
    img.data[4 * k + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  return c;
}

export function drawHeat(g: Draw, c: HTMLCanvasElement, gr: Grid): void {
  const { ctx } = g;
  ctx.save();
  ctx.imageSmoothingEnabled = true;
  ctx.drawImage(c, 0, 0, gr.nx, gr.ny, -gr.cell / 2, -gr.cell / 2, gr.nx * gr.cell, gr.ny * gr.cell);
  ctx.restore();
}

// ------------------------------------------------------------------ glyphs

/** Charge disc: vermilion +, blue −; |q| = 2 is larger and shows the 2. */
export function chargeGlyph(g: Draw, p: Vec2, q: number, alpha = 1): void {
  const big = Math.abs(q) > 1.5;
  const r = big ? 13 : 10;
  g.circle(p, r, { fill: q > 0 ? 'positive' : 'negative', alpha });
  const sign = q > 0 ? '+' : '−';
  const label = big ? `${sign}2` : sign;
  g.text(p, label, { size: big ? 12 : 15, color: withAlpha('#ffffff', alpha), align: 'center', baseline: 'middle', weight: 600, dy: big ? 0.5 : q > 0 ? 0.5 : 0 });
}

/** Current ⊥ page: ⊙ out (s > 0), ⊗ in. */
export function wireGlyph(g: Draw, p: Vec2, s: number, alpha = 1, rPx = 10, col = '#1a1a1a'): void {
  const { ctx } = g;
  const [x, y] = g.vp.toPx(p.x, p.y);
  const r = rPx * theme.scale;
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.fillStyle = '#ffffff';
  ctx.strokeStyle = col;
  ctx.lineWidth = 1.75 * theme.scale;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, 2 * Math.PI);
  ctx.fill();
  ctx.stroke();
  if (s > 0) {
    ctx.fillStyle = col;
    ctx.beginPath();
    ctx.arc(x, y, r * 0.28, 0, 2 * Math.PI);
    ctx.fill();
  } else {
    const d = r * 0.6;
    ctx.beginPath();
    ctx.moveTo(x - d, y - d);
    ctx.lineTo(x + d, y + d);
    ctx.moveTo(x + d, y - d);
    ctx.lineTo(x - d, y + d);
    ctx.stroke();
  }
  ctx.restore();
}

/** Closed dashed Gaussian surface / Ampère loop. */
export function drawSurface(g: Draw, poly: readonly V2[]): void {
  const pts = poly.map(([x, y]) => ({ x, y }));
  g.polygon(pts, { color: SURFACE, width: 2, dash: [7, 5] });
}

/** Small draggable knob on a surface. */
export function knob(g: Draw, p: Vec2, kind: 'edge' | 'centre' = 'edge'): void {
  if (kind === 'centre') {
    // A diamond, not a dotted circle: ⊙ means a field or current out of the page (Ch 29, 30).
    const d = g.px(6.5);
    g.polygon(
      [
        { x: p.x, y: p.y + d },
        { x: p.x + d, y: p.y },
        { x: p.x, y: p.y - d },
        { x: p.x - d, y: p.y },
      ],
      { fill: '#ffffff', color: SURFACE, width: 1.75 },
    );
  } else g.circle(p, 5.5, { fill: '#ffffff', color: SURFACE, width: 2 });
}

/**
 * Component arrows along a closed path: at each sample, an arrow of signed size `v` along `dir`
 * (normal or tangent), vermilion if v > 0 (out of the surface / along the loop) and blue if not.
 * Lengths are linear in v up to the 90th percentile of |v|, which is drawn `maxPx` long.
 */
export function componentArrows(g: Draw, samples: { p: V2; dir: V2; v: number }[], maxPx = 26): void {
  // Scale by the 90th percentile so one sample next to a source does not flatten the rest;
  // larger values are capped at maxPx.
  const mags = samples.map((s) => Math.abs(s.v)).sort((a, b) => a - b);
  const vmax = Math.max(mags[Math.floor(0.9 * (mags.length - 1))] ?? 0, 1e-30);
  const { ctx } = g;
  for (const s of samples) {
    const len = Math.min(1, Math.abs(s.v) / vmax) * maxPx * theme.scale;
    if (len < 2.5 * theme.scale) continue;
    const sg = s.v > 0 ? 1 : -1;
    const [x, y] = g.vp.toPx(s.p[0], s.p[1]);
    const ux = s.dir[0] * sg;
    const uy = -s.dir[1] * sg;
    // Outward arrows start on the path; inward ones end on it.
    const [x0, y0] = s.v > 0 ? [x, y] : [x - ux * len, y - uy * len];
    arrowPx(ctx, x0, y0, x0 + ux * len, y0 + uy * len, { color: s.v > 0 ? OUT : IN, width: 1.75 });
  }
}

// ------------------------------------------------------------------ tray (charge palette)

export interface Tray {
  /** World rectangle [x0, y0, x1, y1]. */
  rect: [number, number, number, number];
  /** World centre of each chip. */
  chips: Vec2[];
}

/** Tray anchored to the bottom-left of the canvas, chips 44 px apart. */
export function layoutTray(g: Draw, nChips: number): Tray {
  const s = theme.scale;
  const step = 44 * s;
  const pad = 10 * s;
  const h = 40 * s;
  const w = nChips * step;
  const x0 = pad;
  const y1 = g.vp.h - pad;
  const y0 = y1 - h;
  const [wx0, wy0] = g.vp.toWorld(x0, y1);
  const [wx1, wy1] = g.vp.toWorld(x0 + w, y0);
  const chips: Vec2[] = [];
  for (let i = 0; i < nChips; i++) {
    const [cx, cy] = g.vp.toWorld(x0 + step * (i + 0.5), (y0 + y1) / 2);
    chips.push({ x: cx, y: cy });
  }
  return { rect: [wx0, wy0, wx1, wy1], chips };
}

export function drawTray(g: Draw, tray: Tray): void {
  const { ctx } = g;
  const [x0, y0] = g.vp.toPx(tray.rect[0], tray.rect[3]);
  const [x1, y1] = g.vp.toPx(tray.rect[2], tray.rect[1]);
  ctx.save();
  ctx.fillStyle = 'rgba(255,255,255,0.94)';
  ctx.strokeStyle = '#c8c8c8';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.roundRect(x0, y0, x1 - x0, y1 - y0, 6 * theme.scale);
  ctx.fill();
  ctx.stroke();
  ctx.restore();
}

export const inRect = (r: Tray['rect'], p: Vec2, marginWorld = 0) =>
  p.x >= r[0] - marginWorld && p.x <= r[2] + marginWorld && p.y >= r[1] - marginWorld && p.y <= r[3] + marginWorld;

/** Rich-text label with a white backing, centred at a world point. */
export function tag(g: Draw, p: Vec2, s: string, col: string, dx = 0, dy = 0, align: CanvasTextAlign = 'center'): void {
  const { ctx } = g;
  const [x, y] = g.vp.toPx(p.x, p.y);
  drawRich(ctx, s, x + dx * theme.scale, y + dy * theme.scale, { size: 13, color: color(col), align, baseline: 'middle' });
}
