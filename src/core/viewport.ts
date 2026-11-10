import type { WorldSpec } from './types';

/** World (SI, y up) ↔ canvas CSS pixels (y down). */
export class Viewport {
  scale = 1;
  private ox = 0;
  private oy = 0;
  w = 0;
  h = 0;

  fit(spec: WorldSpec, w: number, h: number): void {
    this.w = w;
    this.h = h;
    const pad = spec.padPx ?? 16;
    const [x0, x1] = spec.x;
    const [y0, y1] = spec.y;
    const aw = Math.max(1, w - 2 * pad);
    const ah = Math.max(1, h - 2 * pad);
    const sx = aw / (x1 - x0);
    this.scale = spec.aspect === 'fit-x' ? sx : Math.min(sx, ah / (y1 - y0));
    this.ox = w / 2 - ((x0 + x1) / 2) * this.scale;
    this.oy = h / 2 + ((y0 + y1) / 2) * this.scale;
  }

  toPx(x: number, y: number): [number, number] {
    return [this.ox + x * this.scale, this.oy - y * this.scale];
  }

  toWorld(px: number, py: number): [number, number] {
    return [(px - this.ox) / this.scale, (this.oy - py) / this.scale];
  }
}
