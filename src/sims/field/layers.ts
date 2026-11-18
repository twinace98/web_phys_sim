// Memoised field layers for a set of sources: grid arrows, field lines, equipotentials,
// potential heatmap, and the palette tray. One instance per scene.
import type { UiState } from '../../core/types';
import type { Draw } from '../../draw/draw';
import { chargeLines, fieldFn, levelCells, potentialAt, type Kernel, type Src } from './physics';
import {
  Memo,
  drawHeat,
  drawPxLines,
  drawTray,
  drawVectorGrid,
  gridContours,
  heatCanvas,
  inRect,
  layoutTray,
  linesPx,
  scalarGrid,
  srcKey,
  vectorGrid,
  viewRect,
  vpKey,
  type Grid,
  type PxLines,
  type Tray,
} from './render';
import type { Pool } from './slots';

/** Potential grid cell [CSS px]. */
const POT_CELL = 5;
/** Equipotentials stop where adjacent lines would be closer than this [CSS px]. */
export const EQ_MIN_PX = 3;
/** Safety cap on the number of levels each side of zero. */
export const EQ_K_MAX = 400;

/**
 * Pieces of a polyline (flat world coordinates) where room(x, y) ≥ 1, each cut end placed where
 * room crosses 1 (linear between vertices). Pieces shorter than minLen are dropped.
 */
export function clipDense(l: readonly number[], room: (x: number, y: number) => number, minLen = 0): number[][] {
  const out: number[][] = [];
  const keep = (c: number[]) => {
    let s = 0;
    for (let k = 2; k < c.length; k += 2) s += Math.hypot(c[k] - c[k - 2], c[k + 1] - c[k - 1]);
    if (s >= minLen) out.push(c);
  };
  let cur: number[] = [];
  let px = l[0];
  let py = l[1];
  let pr = room(px, py);
  if (pr >= 1) cur.push(px, py);
  for (let k = 2; k < l.length; k += 2) {
    const x = l[k];
    const y = l[k + 1];
    const r = room(x, y);
    if ((pr >= 1) !== (r >= 1)) {
      const t = (pr - 1) / (pr - r);
      cur.push(px + t * (x - px), py + t * (y - py));
      if (r < 1) {
        if (cur.length >= 4) keep(cur);
        cur = [];
      }
    }
    if (r >= 1) cur.push(x, y);
    px = x;
    py = y;
    pr = r;
  }
  if (cur.length >= 4) keep(cur);
  return out;
}

export class FieldLayers {
  private vec = new Memo<Float32Array>();
  private lin = new Memo<PxLines>();
  private grid = new Memo<Grid>();
  private hgrid = new Memo<Grid>();
  private eq = new Memo<{ pos: PxLines; neg: PxLines; zero: PxLines }>();
  private heat = new Memo<HTMLCanvasElement>();

  constructor(
    readonly kernel: Kernel,
    readonly perUnit = 10,
  ) {}

  vectors(g: Draw, src: readonly Src[], extraAvoid: readonly Src[] = []): void {
    const key = `${vpKey(g)}|${srcKey(src)}|${srcKey(extraAvoid)}`;
    const arr = this.vec.get(key, () => vectorGrid(g, fieldFn(src, this.kernel), [...src, ...extraAvoid]));
    drawVectorGrid(g, arr);
  }

  /** Field lines: traced from charges, or (wires) contours of the stream function. */
  lines(g: Draw, src: readonly Src[], col?: string, width?: number): void {
    const key = `${vpKey(g)}|${srcKey(src)}`;
    const L = this.lin.get(key, () => {
      const f = fieldFn(src, this.kernel);
      const [x0, y0, x1, y1] = viewRect(g);
      const mx = 0.1 * (x1 - x0);
      const my = 0.1 * (y1 - y0);
      const bounds: [number, number, number, number] = [x0 - mx, y0 - my, x1 + mx, y1 + my];
      if (this.kernel !== 'wire') {
        return linesPx(g, chargeLines(src, this.kernel, this.perUnit, g.px(13), g.px(3), bounds), f);
      }
      // Stream-function contours: equal steps of A give line density ∝ |B|.
      const rMin = g.px(9);
      const gr = scalarGrid(g, (x, y) => potentialAt(src, 'wire', x, y, rMin), 4);
      let lo = Infinity;
      let hi = -Infinity;
      for (const v of gr.vals) {
        lo = Math.min(lo, v);
        hi = Math.max(hi, v);
      }
      // About 30 lines over the range in view, never closer than 0.25 (single wire: ≈ e^0.25 ratio).
      const step = Math.max(0.25, (hi - lo) / 30);
      const levels: number[] = [];
      for (let k = Math.ceil(lo / step - 0.5); k * step + step / 2 <= hi && levels.length < 400; k++) levels.push((k + 0.5) * step);
      const lines = gridContours(g, gr, levels).flatMap((c) => c.lines);
      return linesPx(g, lines, f, 40, 170);
    });
    drawPxLines(g, L, col, width);
  }

  private potGrid(g: Draw, src: readonly Src[], cap: number, memo = this.grid): Grid {
    return memo.get(`${vpKey(g)}|${srcKey(src)}|${cap}`, () => scalarGrid(g, (x, y) => potentialAt(src, this.kernel, x, y, g.px(2)), POT_CELL, cap));
  }

  /**
   * Equipotentials at k·dV (|k| ≤ kMax), coloured by sign; scale converts strength units to
   * volts. Lines stop where neighbours would be closer than EQ_MIN_PX on screen (near a charge),
   * so every level that can still be told apart is drawn.
   */
  equipotentials(g: Draw, src: readonly Src[], scale: number, dV: number, kMax = EQ_K_MAX): void {
    const cap = ((kMax + 1) * dV) / scale;
    const key = `${vpKey(g)}|${srcKey(src)}|${scale}|${dV}|${kMax}`;
    const E = this.eq.get(key, () => {
      const gr = this.potGrid(g, src, cap);
      const step = dV / scale;
      // Cells pass a looser test (half the gap); each line is then cut where the exact spacing
      // step / |E| falls to the gap, so lines end on a smooth curve, not on cell edges.
      const buckets = levelCells(gr.vals, gr.nx, gr.ny, step, kMax, EQ_MIN_PX / 2 / POT_CELL);
      const ks = [...buckets.keys()].sort((a, b) => a - b);
      const cs = gridContours(
        g,
        gr,
        ks.map((k) => k * step),
        ks.map((k) => buckets.get(k)),
      );
      const f = fieldFn(src, this.kernel);
      const gap = g.px(EQ_MIN_PX);
      // Stubs left between dense patches (e.g. at the saddles between the charges of a row).
      const frag = g.px(12);
      /** Spacing to the next line over the minimum gap (≥ 1: drawn). */
      const room = (x: number, y: number) => {
        const [ex, ey] = f(x, y);
        return step / (Math.hypot(ex, ey) * gap);
      };
      const pick = (sel: (l: number) => boolean) =>
        linesPx(
          g,
          cs.filter((c) => sel(c.level)).flatMap((c) => (Math.abs(c.level) <= 1e-12 ? c.lines : c.lines.flatMap((l) => clipDense(l, room, frag)))),
          null,
        );
      return { pos: pick((l) => l > 1e-12), neg: pick((l) => l < -1e-12), zero: pick((l) => Math.abs(l) <= 1e-12) };
    });
    drawPxLines(g, E.pos, '#D55E00', 1.1);
    drawPxLines(g, E.neg, '#0072B2', 1.1);
    drawPxLines(g, E.zero, '#5c5c5c', 1.1, [5, 4]);
  }

  /** Diverging potential map; `vs` (strength units) is where the colour reaches 76 %. */
  heatmap(g: Draw, src: readonly Src[], vs: number, capV: number): void {
    const gr = this.potGrid(g, src, capV, this.hgrid);
    const c = this.heat.get(`${vpKey(g)}|${srcKey(src)}|${vs}|${capV}`, () => heatCanvas(gr, vs));
    drawHeat(g, c, gr);
  }
}

/**
 * Palette tray: lays out one chip per pool kind at the bottom-left of the canvas, stores the
 * layout on the state (handles read it) and draws chips; a kind with no parked slot is faint.
 */
export function palette<S extends { tray?: Tray }>(
  g: Draw,
  s: S,
  pool: Pool,
  coords: readonly number[],
  glyph: (g: Draw, p: { x: number; y: number }, strength: number, alpha: number) => void,
  ui?: UiState,
): void {
  const tray = layoutTray(g, pool.kinds.length);
  s.tray = tray;
  // A drag that began on the stage and is now over the tray will remove that source on release.
  const d = ui?.drag;
  drawTray(g, tray, !!d && !inRect(tray.rect, d.w0) && inRect(tray.rect, d.w));
  const live = pool.available(coords);
  pool.kinds.forEach((q, k) => glyph(g, tray.chips[k], q, live[k] ? 1 : 0.22));
}
