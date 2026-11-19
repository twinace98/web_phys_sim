// Label placement for the Ch 11 stage. `Recorder` is a Draw that forwards every call to the stage
// and keeps what it drew (in canvas px) as obstacles, so labels drawn last can be put where they
// clear the bodies, arrows, paths and the labels already there.
import type { Vec2 } from '../../core/types';
import type { ArrowStyle, Draw, LabelStyle, Stroke } from '../../draw/draw';
import { measureRich } from '../../draw/text';
import { theme } from '../../draw/theme';
import { boxesOverlap, segHitsBox, type Box, type Seg } from '../ch03/labels';

export type { Box };

const CELL = 32;

/** Canvas-px point. */
export type Pt = [number, number];

/** Text box [canvas px] of `s` drawn at (x, y) with the given alignment, baseline and size. */
export function textBox(ctx: CanvasRenderingContext2D, s: string, x: number, y: number, st: { size?: number; weight?: number; align?: string; baseline?: string } = {}): Box {
  const size = st.size ?? 12;
  const w = measureRich(ctx, s, { size, weight: st.weight });
  const h = size * 1.2 * theme.scale;
  const x0 = st.align === 'center' ? x - w / 2 : st.align === 'right' || st.align === 'end' ? x - w : x;
  const b = st.baseline ?? 'alphabetic';
  const y0 = b === 'middle' ? y - h / 2 : b === 'top' || b === 'hanging' ? y : y - h * 0.8;
  return { x0, y0, x1: x0 + w, y1: y0 + h };
}

export const grow = (b: Box, d: number): Box => ({ x0: b.x0 - d, y0: b.y0 - d, x1: b.x1 + d, y1: b.y1 + d });

/** Is the point inside the polygon (even-odd)? */
export function inPoly(x: number, y: number, poly: Pt[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i];
    const [xj, yj] = poly[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

const corners = (b: Box): Pt[] => [
  [b.x0, b.y0],
  [b.x1, b.y0],
  [b.x1, b.y1],
  [b.x0, b.y1],
];

/** Does the box touch the polygon (edges cross, or one contains the other)? */
export function boxHitsPoly(b: Box, poly: Pt[]): boolean {
  for (let i = 0; i < poly.length; i++) {
    const [ax, ay] = poly[i];
    const [bx, by] = poly[(i + 1) % poly.length];
    if (segHitsBox([ax, ay, bx, by], b)) return true;
  }
  return inPoly((b.x0 + b.x1) / 2, (b.y0 + b.y1) / 2, poly);
}

/** Is the box wholly inside the polygon? */
export function boxInPoly(b: Box, poly: Pt[]): boolean {
  if (!corners(b).every(([x, y]) => inPoly(x, y, poly))) return false;
  for (let i = 0; i < poly.length; i++) {
    const [ax, ay] = poly[i];
    const [bx, by] = poly[(i + 1) % poly.length];
    // An edge that enters the box (a notch of the polygon) breaks it.
    if (segHitsBox([ax, ay, bx, by], grow(b, -0.5))) return false;
  }
  return true;
}

function boxHitsDisc(b: Box, d: { x: number; y: number; r: number }): boolean {
  const dx = Math.max(b.x0 - d.x, 0, d.x - b.x1);
  const dy = Math.max(b.y0 - d.y, 0, d.y - b.y1);
  return dx * dx + dy * dy < d.r * d.r;
}

/** Distance from (x, y) to the segment. */
function segDist(x: number, y: number, [ax, ay, bx, by]: Seg): number {
  const dx = bx - ax;
  const dy = by - ay;
  const l2 = dx * dx + dy * dy;
  const t = l2 > 0 ? Math.min(1, Math.max(0, ((x - ax) * dx + (y - ay) * dy) / l2)) : 0;
  return Math.hypot(x - ax - t * dx, y - ay - t * dy);
}

export class Recorder implements Draw {
  readonly segs: Seg[] = [];
  readonly boxes: Box[] = [];
  readonly discs: { x: number; y: number; r: number }[] = [];
  readonly polys: Pt[][] = [];

  /** `dry`: record only, draw nothing (scene code drawing on `ctx` directly must check it too). */
  constructor(
    readonly g: Draw,
    readonly dry = false,
  ) {}

  get ctx(): CanvasRenderingContext2D {
    return this.g.ctx;
  }
  get vp() {
    return this.g.vp;
  }
  px(n: number): number {
    return this.g.px(n);
  }
  toPx(p: Vec2): Pt {
    return this.g.vp.toPx(p.x, p.y);
  }

  private addLine(pts: Vec2[]): void {
    for (let i = 1; i < pts.length; i++) {
      const [ax, ay] = this.toPx(pts[i - 1]);
      const [bx, by] = this.toPx(pts[i]);
      this.segs.push([ax, ay, bx, by]);
    }
  }

  line(a: Vec2, b: Vec2, st?: Stroke): void {
    if (!this.dry) this.g.line(a, b, st);
    this.addLine([a, b]);
  }
  polyline(pts: Vec2[], st?: Stroke): void {
    if (!this.dry) this.g.polyline(pts, st);
    this.addLine(pts);
  }
  arrow(from: Vec2, vec: Vec2, st: ArrowStyle = {}): void {
    if (!this.dry) this.g.arrow(from, vec, st);
    const [x0, y0] = this.toPx(from);
    const [x1, y1] = this.toPx({ x: from.x + vec.x, y: from.y + vec.y });
    this.segs.push([x0, y0, x1, y1]);
    // Arrowhead: a short cross-stroke at the tip.
    const len = Math.hypot(x1 - x0, y1 - y0);
    if (len >= 0.5) {
      const nx = (-(y1 - y0) / len) * 4 * theme.scale;
      const ny = ((x1 - x0) / len) * 4 * theme.scale;
      this.segs.push([x1 - nx, y1 - ny, x1 + nx, y1 + ny]);
      if (st.label) {
        const off = 10 * theme.scale;
        this.boxes.push(textBox(this.ctx, st.label, x1 + ((x1 - x0) / len) * off, y1 + ((y1 - y0) / len) * off, { size: 13, align: 'center', baseline: 'middle' }));
      }
    }
  }
  circle(c: Vec2, rPx: number, st?: Stroke & { fill?: string }): void {
    if (!this.dry) this.g.circle(c, rPx, st);
    const [x, y] = this.toPx(c);
    this.discs.push({ x, y, r: rPx * theme.scale + 1 });
  }
  polygon(pts: Vec2[], st?: Stroke & { fill?: string; fillAlpha?: number }): void {
    if (!this.dry) this.g.polygon(pts, st);
    this.polys.push(pts.map((p) => this.toPx(p)));
  }
  arc(c: Vec2, rPx: number, a0: number, a1: number, st?: Stroke): void {
    if (!this.dry) this.g.arc(c, rPx, a0, a1, st);
    const [x, y] = this.toPx(c);
    const r = rPx * theme.scale;
    let prev: Pt | null = null;
    for (let i = 0; i <= 12; i++) {
      const a = a0 + ((a1 - a0) * i) / 12;
      const q: Pt = [x + r * Math.cos(a), y - r * Math.sin(a)];
      if (prev) this.segs.push([prev[0], prev[1], q[0], q[1]]);
      prev = q;
    }
  }
  text(p: Vec2, s: string, st: LabelStyle = {}): void {
    if (!this.dry) this.g.text(p, s, st);
    const [x, y] = this.toPx(p);
    this.boxes.push(textBox(this.ctx, s, x + (st.dx ?? 0) * theme.scale, y + (st.dy ?? 0) * theme.scale, st));
  }
  screenText(x: number, y: number, s: string, st: LabelStyle = {}): void {
    if (!this.dry) this.g.screenText(x, y, s, st);
    this.boxes.push(textBox(this.ctx, s, x * theme.scale, y * theme.scale, st));
  }

  /** Rich text drawn straight on the canvas elsewhere, kept as an obstacle polygon [canvas px]. */
  keep(poly: Pt[]): void {
    this.polys.push(poly);
  }

  private grid: Map<number, Seg[]> | null = null;
  private gridN = 0;

  /** Segments in 32-px cells, rebuilt when segments were added since the last query. */
  private cells(): Map<number, Seg[]> {
    if (this.grid && this.gridN === this.segs.length) return this.grid;
    const grid = new Map<number, Seg[]>();
    for (const s of this.segs) {
      const [i0, i1] = [Math.floor(Math.min(s[0], s[2]) / CELL), Math.floor(Math.max(s[0], s[2]) / CELL)];
      const [j0, j1] = [Math.floor(Math.min(s[1], s[3]) / CELL), Math.floor(Math.max(s[1], s[3]) / CELL)];
      for (let i = i0; i <= i1; i++)
        for (let j = j0; j <= j1; j++) {
          const key = i * 65536 + j;
          const list = grid.get(key);
          if (list) list.push(s);
          else grid.set(key, [s]);
        }
    }
    this.grid = grid;
    this.gridN = this.segs.length;
    return grid;
  }

  /** Recorded segments near the box. */
  private near(b: Box): Seg[] {
    const grid = this.cells();
    const out: Seg[] = [];
    for (let i = Math.floor(b.x0 / CELL); i <= Math.floor(b.x1 / CELL); i++)
      for (let j = Math.floor(b.y0 / CELL); j <= Math.floor(b.y1 / CELL); j++) out.push(...(grid.get(i * 65536 + j) ?? []));
    return out;
  }

  /** Nothing recorded touches the box, and it lies on the stage. */
  clear(b: Box): boolean {
    const { w, h } = this.g.vp;
    if (b.x0 < 0 || b.y0 < 0 || b.x1 > w || b.y1 > h) return false;
    if (this.near(b).some((s) => segHitsBox(s, b))) return false;
    if (this.boxes.some((o) => boxesOverlap(o, b))) return false;
    if (this.discs.some((d) => boxHitsDisc(b, d))) return false;
    return !this.polys.some((q) => boxHitsPoly(b, q));
  }

  /** Nothing recorded comes within r of (x, y), and the disc lies on the stage. */
  clearDisc(x: number, y: number, r: number): boolean {
    const { w, h } = this.g.vp;
    if (x - r < 0 || y - r < 0 || x + r > w || y + r > h) return false;
    const b = { x0: x - r, y0: y - r, x1: x + r, y1: y + r };
    if (this.near(b).some((s) => segDist(x, y, s) < r)) return false;
    if (this.boxes.some((o) => boxHitsDisc(o, { x, y, r }))) return false;
    if (this.discs.some((d) => Math.hypot(d.x - x, d.y - y) < d.r + r)) return false;
    return !this.polys.some((q) => inPoly(x, y, q) || q.some((v, i) => segDist(x, y, [v[0], v[1], q[(i + 1) % q.length][0], q[(i + 1) % q.length][1]]) < r));
  }
}
