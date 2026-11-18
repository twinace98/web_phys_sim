// Free-body diagrams on the stage: every force on one body, drawn from one point on one scale.
// Convention (same on every page): field forces (gravity, electric) dashed, contact forces solid;
// each label just beyond its arrow tip. The body itself is the caller's: fade it while the diagram
// is on (fillAlpha ≈ 0.25) so arrows over it stay readable.
import type { Role, ToggleParam, Vec2 } from '../core/types';
import type { Draw } from './draw';

export interface FbdForce {
  /** Force vector [N] in world axes (x right, y up). */
  F: Vec2;
  /** Rich-text label as elsewhere on the stage, e.g. '*m*_{A}*g*', '*N*', '*f*_{k}'. */
  label: string;
  /** Field force (gravity, electric): dashed. Default: contact (solid). */
  field?: boolean;
  /** Colour role (default 'force'). */
  role?: Role;
}

/** Shortest arrow drawn for a nonzero force [px], so its direction still reads. */
export const FBD_MIN_PX = 14;
/** Forces smaller than this [N] are treated as absent (no arrow, no label). */
export const FBD_ZERO = 1e-9;

/**
 * Pixels per newton so that the largest force expected over the whole run is `maxPx` long.
 * Pass a run-wide maximum (not this frame's), so arrows do not rescale while the sim plays.
 */
export const fbdScale = (maxForce: number, maxPx = 56): number => (maxForce > 0 ? maxPx / maxForce : 0);

/** The toggle every page uses: label and description from the shared strings. */
export const fbdParam = (def = false, group: 'main' | 'advanced' = 'main'): ToggleParam => ({
  kind: 'toggle',
  label: 'fbd.p',
  desc: 'fbd.d',
  group,
  live: true,
  default: def,
});

/**
 * Draw the forces on one body from `at` (world). `perPx` is px per newton (fbdScale). Labels sit
 * beyond each tip along the arrow, aligned away from it, so they clear the arrow and the body.
 */
export function drawFbd(g: Draw, at: Vec2, forces: readonly FbdForce[], perPx: number, opts: { size?: number; dot?: boolean } = {}): void {
  const size = opts.size ?? 13;
  for (const f of forces) {
    const mag = Math.hypot(f.F.x, f.F.y);
    if (!(mag > FBD_ZERO)) continue;
    const ux = f.F.x / mag;
    const uy = f.F.y / mag;
    const lenPx = Math.max(mag * perPx, FBD_MIN_PX);
    const vec = { x: g.px(lenPx * ux), y: g.px(lenPx * uy) };
    const role = f.role ?? 'force';
    g.arrow(at, vec, { role, width: 2.5, dash: f.field ? [5, 3] : undefined });
    // Label beyond the tip: to the side for mostly horizontal arrows, above/below for vertical ones.
    const tip = { x: at.x + vec.x, y: at.y + vec.y };
    const horiz = Math.abs(ux) >= 0.5;
    g.text(tip, f.label, {
      size,
      role,
      align: horiz ? (ux > 0 ? 'left' : 'right') : 'center',
      baseline: 'middle',
      dx: horiz ? (ux > 0 ? 5 : -5) : 0,
      // Screen y grows downwards.
      dy: horiz ? -uy * 8 : uy > 0 ? -11 : 11,
    });
  }
  if (opts.dot !== false) g.circle(at, 2.5, { fill: 'fg' });
}
