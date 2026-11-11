// Shared drawing for Ch 28: the ⊗ symbols of a field into the page, and a charged particle.
import type { Vec2 } from '../../core/types';
import type { Draw } from '../../draw/draw';

const FIELD = '#b0b0b0';

/** One ⊗ symbol (field into the page). */
export function into(g: Draw, c: Vec2, rPx = 5): void {
  g.circle(c, rPx, { color: FIELD, width: 1 });
  const d = g.px(rPx * 0.7);
  g.line({ x: c.x - d, y: c.y - d }, { x: c.x + d, y: c.y + d }, { color: FIELD, width: 1 });
  g.line({ x: c.x - d, y: c.y + d }, { x: c.x + d, y: c.y - d }, { color: FIELD, width: 1 });
}

/** ⊗ grid over a box, about `stepPx` apart, optionally kept inside `inside`. */
export function fieldGrid(g: Draw, x0: number, x1: number, y0: number, y1: number, stepPx: number, inside?: (p: Vec2) => boolean): void {
  const d = g.px(stepPx);
  const nx = Math.floor((x1 - x0) / d);
  const ny = Math.floor((y1 - y0) / d);
  const ox = x0 + (x1 - x0 - nx * d) / 2;
  const oy = y0 + (y1 - y0 - ny * d) / 2;
  for (let i = 0; i <= nx; i++) {
    for (let j = 0; j <= ny; j++) {
      const p = { x: ox + i * d, y: oy + j * d };
      if (!inside || inside(p)) into(g, p);
    }
  }
}

/** Charged particle: vermilion with + or blue with −. */
export function particle(g: Draw, c: Vec2, positive: boolean, rPx = 8): void {
  g.circle(c, rPx, { fill: positive ? 'positive' : 'negative' });
  g.text(c, positive ? '+' : '−', { size: 13, color: '#ffffff', align: 'center', baseline: 'middle', weight: 700, dy: 0.5 });
}
