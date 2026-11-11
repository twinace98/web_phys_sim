// Closed path for Gauss (flux) and Ampère (circulation): circle, square or free curve.
// Stored in hidden array parameters so a shape survives in the URL:
//   G = [cx, cy, size]   centre (shared by all shapes); radius of the circle, half-side of the square
//   F = [dx0, dy0, ..., dx7, dy7]   control points of the free curve relative to the centre
//                                   (closed Catmull-Rom)
import type { Handle, Params, SceneCtx, Vec2 } from '../../core/types';
import { ccw, circlePoly, distToPoly, distToSeg, splinePoly, squarePoly, type Src, type V2 } from './physics';

export type Shape = 'circle' | 'square' | 'free';

export interface SurfaceParams extends Params {
  shape: string;
  G: number[];
  F: number[];
}

export const SIZE_MIN = 0.1;
export const SIZE_MAX = 1.1;
/** Sources never sit closer than this to the path (world m). */
export const CLEAR = 0.035;

const r3 = (v: number) => Math.round(v * 1000) / 1000;

/** Eight control points (offsets from the centre) on a slightly irregular ring. */
export function freeDefault(r: number): number[] {
  const k = [1, 0.8, 1.15, 0.9, 1.05, 0.75, 1.1, 0.95];
  const out: number[] = [];
  for (let i = 0; i < 8; i++) {
    const a = (2 * Math.PI * i) / 8;
    out.push(r3(r * k[i] * Math.cos(a)), r3(r * k[i] * Math.sin(a) * 0.85));
  }
  return out;
}

/** Counter-clockwise polygon of the path. */
export function surfacePoly(shape: string, G: readonly number[], F: readonly number[]): V2[] {
  const [cx, cy, size] = G;
  if (shape === 'square') return squarePoly(cx, cy, size);
  if (shape === 'free') {
    const ctrl: V2[] = [];
    for (let k = 0; k < F.length; k += 2) ctrl.push([cx + F[k], cy + F[k + 1]]);
    return ccw(splinePoly(ctrl, 16));
  }
  return circlePoly(cx, cy, size, 160);
}

/** Nearest point of a closed polygon to (x, y). */
export function nearestOnPoly(poly: readonly V2[], x: number, y: number): V2 {
  let best: V2 = poly[0];
  let bd = Infinity;
  for (let i = 0, n = poly.length; i < n; i++) {
    const [ax, ay] = poly[i];
    const [bx, by] = poly[(i + 1) % n];
    const d = distToSeg(x, y, ax, ay, bx, by);
    if (d < bd) {
      bd = d;
      const dx = bx - ax;
      const dy = by - ay;
      const l2 = dx * dx + dy * dy;
      const u = l2 > 0 ? Math.min(1, Math.max(0, ((x - ax) * dx + (y - ay) * dy) / l2)) : 0;
      best = [ax + u * dx, ay + u * dy];
    }
  }
  return best;
}

/** Push a source position off the path to distance CLEAR, on the side the pointer is on. */
export function keepOff(poly: readonly V2[], w: Vec2): Vec2 {
  const d = distToPoly(poly, w.x, w.y);
  if (d >= CLEAR) return w;
  const [nx, ny] = nearestOnPoly(poly, w.x, w.y);
  let ux = w.x - nx;
  let uy = w.y - ny;
  const m = Math.hypot(ux, uy);
  if (m < 1e-9) {
    ux = 1;
    uy = 0;
  } else {
    ux /= m;
    uy /= m;
  }
  return { x: nx + ux * CLEAR, y: ny + uy * CLEAR };
}

export interface SurfaceBinding<P extends SurfaceParams> {
  /** Sources the path must stay clear of. */
  sources: (p: P) => readonly Src[];
  /** Region the path may occupy. */
  box: [number, number, number, number];
  /** Restrict to these shapes (e.g. circle only). */
  shapes?: Shape[];
  when?: (p: P) => boolean;
  /** [cx, cy, size] in force (default: p.G). */
  G?: (p: P) => number[];
  /** Stored value for a new [cx, cy, size] (default: as is). */
  packG?: (p: P, G: number[]) => number[];
}

/** Positions of the knobs drawn on the path, matching surfaceHandles. */
export function knobs(shape: string, G: readonly number[], F: readonly number[]): { p: Vec2; kind: 'edge' | 'centre' }[] {
  const [cx, cy, size] = G;
  if (shape === 'free') {
    const out: { p: Vec2; kind: 'edge' | 'centre' }[] = [{ p: { x: cx, y: cy }, kind: 'centre' }];
    for (let k = 0; k < F.length; k += 2) out.push({ p: { x: cx + F[k], y: cy + F[k + 1] }, kind: 'edge' });
    return out;
  }
  const rim = shape === 'square' ? { x: cx + size, y: cy - size } : { x: cx + size * Math.SQRT1_2, y: cy - size * Math.SQRT1_2 };
  return [
    { p: { x: cx, y: cy }, kind: 'centre' },
    { p: rim, kind: 'edge' },
  ];
}

/**
 * Handles: centre (moves the path, any shape), rim (sizes a circle or square), and each control
 * point of the free curve. A move that would put a source within CLEAR of the
 * path is skipped, so the path jumps across a source instead of sitting on it.
 */
export function surfaceHandles<P extends SurfaceParams, S extends { t: number }>(b: SurfaceBinding<P>): Handle<S, P>[] {
  const [bx0, by0, bx1, by1] = b.box;
  const clampX = (x: number) => Math.min(bx1, Math.max(bx0, x));
  const clampY = (y: number) => Math.min(by1, Math.max(by0, y));
  const getG = (p: P) => (b.G ? b.G(p) : p.G);
  const ok = (p: P, shape: string, G: number[], F: number[]) => {
    const poly = surfacePoly(shape, G, F);
    return b.sources(p).every((c) => distToPoly(poly, c.x, c.y) >= CLEAR * 0.999);
  };
  const tryG = (ctx: SceneCtx<P>, G: number[]) => {
    const g = G.map(r3);
    const cur = getG(ctx.params);
    if (g.every((v, k) => v === cur[k])) return;
    if (ok(ctx.params, ctx.params.shape, g, ctx.params.F)) ctx.set('G', (b.packG ? b.packG(ctx.params, g) : g) as P['G']);
  };
  const tryF = (ctx: SceneCtx<P>, F: number[]) => {
    const f = F.map(r3);
    if (f.every((v, k) => v === ctx.params.F[k])) return;
    if (ok(ctx.params, 'free', getG(ctx.params), f)) ctx.set('F', f as P['F']);
  };
  const on = (p: P, shapes: Shape[]) => (b.when?.(p) ?? true) && shapes.includes(p.shape as Shape) && (!b.shapes || b.shapes.includes(p.shape as Shape));

  const hs: Handle<S, P>[] = [
    {
      // Centre: moves the path.
      radiusPx: 14,
      when: (p) => on(p, ['circle', 'square', 'free']),
      pos: (_s, p) => ({ x: getG(p)[0], y: getG(p)[1] }),
      onDrag: (ctx, _s, w) => tryG(ctx, [clampX(w.x), clampY(w.y), getG(ctx.params)[2]]),
    },
    {
      // Rim: size from the distance to the centre.
      radiusPx: 14,
      when: (p) => on(p, ['circle', 'square']),
      pos: (_s, p) => knobs(p.shape, getG(p), p.F)[1].p,
      onDrag: (ctx, _s, w) => {
        const [cx, cy] = getG(ctx.params);
        const size = ctx.params.shape === 'square' ? Math.max(Math.abs(w.x - cx), Math.abs(w.y - cy)) : Math.hypot(w.x - cx, w.y - cy);
        tryG(ctx, [cx, cy, Math.min(SIZE_MAX, Math.max(SIZE_MIN, size))]);
      },
    },
  ];
  for (let i = 0; i < 8; i++) {
    hs.push({
      radiusPx: 13,
      when: (p) => on(p, ['free']),
      pos: (_s, p) => ({ x: getG(p)[0] + p.F[2 * i], y: getG(p)[1] + p.F[2 * i + 1] }),
      onDrag: (ctx, _s, w) => {
        const [cx, cy] = getG(ctx.params);
        const F = [...ctx.params.F];
        F[2 * i] = clampX(w.x) - cx;
        F[2 * i + 1] = clampY(w.y) - cy;
        tryF(ctx, F);
      },
    });
  }
  return hs;
}
