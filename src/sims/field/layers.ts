// Memoised field layers for a set of sources: grid arrows, field lines, equipotentials,
// potential heatmap, and the palette tray. One instance per scene.
import type { Draw } from '../../draw/draw';
import { chargeLines, fieldFn, potentialAt, type Kernel, type Src } from './physics';
import {
  Memo,
  drawHeat,
  drawPxLines,
  drawTray,
  drawVectorGrid,
  gridContours,
  heatCanvas,
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
    return memo.get(`${vpKey(g)}|${srcKey(src)}|${cap}`, () => scalarGrid(g, (x, y) => potentialAt(src, this.kernel, x, y, g.px(2)), 5, cap));
  }

  /** Equipotentials at k·dV (|k| ≤ kMax), coloured by sign; scale converts strength units to volts. */
  equipotentials(g: Draw, src: readonly Src[], scale: number, dV: number, kMax = 12): void {
    const cap = ((kMax + 1) * dV) / scale;
    const key = `${vpKey(g)}|${srcKey(src)}|${scale}|${dV}|${kMax}`;
    const E = this.eq.get(key, () => {
      const gr = this.potGrid(g, src, cap);
      const levels: number[] = [];
      for (let k = -kMax; k <= kMax; k++) levels.push((k * dV) / scale);
      const cs = gridContours(g, gr, levels);
      const pick = (sel: (l: number) => boolean) =>
        linesPx(
          g,
          cs.filter((c) => sel(c.level)).flatMap((c) => c.lines),
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
export function palette<S extends { tray?: Tray }>(g: Draw, s: S, pool: Pool, coords: readonly number[], glyph: (g: Draw, p: { x: number; y: number }, strength: number, alpha: number) => void): void {
  const tray = layoutTray(g, pool.kinds.length);
  s.tray = tray;
  drawTray(g, tray);
  const live = pool.available(coords);
  pool.kinds.forEach((q, k) => glyph(g, tray.chips[k], q, live[k] ? 1 : 0.22));
}
