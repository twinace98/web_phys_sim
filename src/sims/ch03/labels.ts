// Label placement for the Ch 3 vector diagrams: try spots beside an arrow and keep the first
// whose text box clears the arrows, the axes and the labels already placed.
import type { Role, Vec2 } from '../../core/types';
import type { Draw } from '../../draw/draw';
import { measureRich } from '../../draw/text';
import { theme } from '../../draw/theme';

export type Box = { x0: number; y0: number; x1: number; y1: number };
/** Segment in canvas px. */
export type Seg = [number, number, number, number];

const SIZE = 15;

/** Does segment (ax, ay)–(bx, by) meet the box? (Liang–Barsky.) */
export function segHitsBox([ax, ay, bx, by]: Seg, b: Box): boolean {
  const dx = bx - ax;
  const dy = by - ay;
  let u0 = 0;
  let u1 = 1;
  for (const [p, q] of [
    [-dx, ax - b.x0],
    [dx, b.x1 - ax],
    [-dy, ay - b.y0],
    [dy, b.y1 - ay],
  ] as const) {
    if (p === 0) {
      if (q < 0) return false;
    } else {
      const u = q / p;
      if (p < 0) u0 = Math.max(u0, u);
      else u1 = Math.min(u1, u);
      if (u0 > u1) return false;
    }
  }
  return true;
}

export const boxesOverlap = (a: Box, b: Box) => a.x0 < b.x1 && b.x0 < a.x1 && a.y0 < b.y1 && b.y0 < a.y1;

/** Collects obstacles in canvas px and places labels around them. */
export class LabelLayout {
  readonly segs: Seg[] = [];
  readonly boxes: Box[] = [];

  constructor(private readonly g: Draw) {}

  px(p: Vec2): [number, number] {
    return this.g.vp.toPx(p.x, p.y);
  }

  /** World segment a–b as an obstacle. */
  seg(a: Vec2, b: Vec2): void {
    const [ax, ay] = this.px(a);
    const [bx, by] = this.px(b);
    this.segs.push([ax, ay, bx, by]);
  }

  /** Text box of `text` drawn at canvas (x, y) with baseline middle. */
  box(text: string, x: number, y: number, align: 'left' | 'right' | 'center', size = SIZE): Box {
    const w = measureRich(this.g.ctx, text, { size });
    const h = size * 1.15 * theme.scale;
    const pad = 2 * theme.scale;
    const x0 = align === 'left' ? x : align === 'right' ? x - w : x - w / 2;
    return { x0: x0 - pad, y0: y - h / 2 - pad, x1: x0 + w + pad, y1: y + h / 2 + pad };
  }

  cost(b: Box): number {
    let n = 0;
    const cw = this.g.ctx.canvas.clientWidth;
    const ch = this.g.ctx.canvas.clientHeight;
    if (cw > 0 && (b.x0 < 0 || b.x1 > cw || b.y0 < 0 || b.y1 > ch)) n += 100;
    for (const s of this.segs) if (segHitsBox(s, b)) n += 1;
    for (const o of this.boxes) if (boxesOverlap(o, b)) n += 10;
    return n;
  }

  /** World polyline as obstacles. */
  polyline(pts: Vec2[]): void {
    for (let i = 1; i < pts.length; i++) this.seg(pts[i - 1], pts[i]);
  }

  /**
   * Label at the first candidate (canvas px, baseline middle) with nothing in the way, else the
   * least obstructed one.
   */
  place(cands: { x: number; y: number; align: 'left' | 'right' | 'center' }[], text: string, role: Role | string, size = SIZE, weight?: number): void {
    let best = cands[0];
    let bestCost = Infinity;
    for (const c of cands) {
      const cost = this.cost(this.box(text, c.x, c.y, c.align, size));
      if (cost < bestCost) {
        best = c;
        bestCost = cost;
      }
      if (cost === 0) break;
    }
    this.boxes.push(this.box(text, best.x, best.y, best.align, size));
    this.g.screenText(best.x / theme.scale, best.y / theme.scale, text, { size, color: role, align: best.align, baseline: 'middle', weight });
  }

  /**
   * Label beside the segment `from`→`from + vec`: at fractions `along` of its length, `d` px out
   * along the normal, preferred side first. The first spot with nothing in the way wins.
   */
  beside(from: Vec2, vec: Vec2, prefer: Vec2, text: string, role: Role, dists: number[], along = [0.5, 0.35, 0.65, 0.2, 0.8]): void {
    const [x0, y0] = this.px(from);
    const [x1, y1] = this.px({ x: from.x + vec.x, y: from.y + vec.y });
    const len = Math.hypot(x1 - x0, y1 - y0);
    if (len < 1e-6) return;
    // Canvas normal on the preferred side (prefer is a world direction; canvas y is down).
    let nx = -(y1 - y0) / len;
    let ny = (x1 - x0) / len;
    if (nx * prefer.x - ny * prefer.y < 0) {
      nx = -nx;
      ny = -ny;
    }
    // Candidate offsets in preference order: beside the arrow (preferred side, then the other),
    // then diagonally off either end for an arrow too short to have room beside it.
    const ux = (x1 - x0) / len;
    const uy = (y1 - y0) / len;
    const spots: [number, number, number, number][] = []; // anchor x, y, offset direction x, y
    for (const side of [1, -1]) {
      for (const f of along) spots.push([x0 + (x1 - x0) * f, y0 + (y1 - y0) * f, side * nx, side * ny]);
    }
    const D = Math.SQRT1_2;
    for (const side of [1, -1]) {
      spots.push([x1, y1, D * (ux + side * nx), D * (uy + side * ny)]);
      spots.push([x0, y0, D * (-ux + side * nx), D * (-uy + side * ny)]);
    }
    let best: { x: number; y: number; align: 'left' | 'right' | 'center'; b: Box } | null = null;
    let bestCost = Infinity;
    outer: for (const d of dists) {
      for (const [ax, ay, ox, oy] of spots) {
        const x = ax + ox * d * theme.scale;
        const y = ay + oy * d * theme.scale;
        const align = ox > 0.35 ? 'left' : ox < -0.35 ? 'right' : 'center';
        const b = this.box(text, x, y, align);
        const c = this.cost(b);
        if (c < bestCost) {
          best = { x, y, align, b };
          bestCost = c;
        }
        if (c === 0) break outer;
      }
    }
    if (!best) return;
    this.boxes.push(best.b);
    this.g.screenText(best.x / theme.scale, best.y / theme.scale, text, { size: SIZE, role, align: best.align, baseline: 'middle' });
  }
}
