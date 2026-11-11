// Draggable sources with a palette tray. A fixed pool of slots (each with a fixed strength)
// lives in one hidden array parameter, so a layout survives in the URL:
//   Q = [tag, x0, y0, x1, y1, ...]; tag = index of the preset the layout was made from.
// A parked slot (x = PARK) sits in the tray; dragging its chip onto the stage places it, and
// dropping a source back on the tray parks it again.
import type { Handle, Params, SceneCtx, Vec2 } from '../../core/types';
import type { Src } from './physics';
import { inRect, type Tray } from './render';

export const PARK = 99;

/** Preset item: kind index and position. */
export type Placed = [kind: number, x: number, y: number];

export type Box = [x0: number, y0: number, x1: number, y1: number];

export interface SlotSrc extends Src {
  i: number;
  kind: number;
}

const r3 = (v: number) => Math.round(v * 1000) / 1000;

export class Pool {
  readonly kindOf: number[] = [];

  constructor(
    /** Strength of each kind (one chip per kind). */
    readonly kinds: number[],
    counts: number[],
  ) {
    counts.forEach((n, k) => {
      for (let j = 0; j < n; j++) this.kindOf.push(k);
    });
  }

  get size(): number {
    return this.kindOf.length;
  }

  /** Default parameter value: no layout of its own, so the preset is shown. */
  blank(): number[] {
    return [-1, ...new Array<number>(2 * this.size).fill(PARK)];
  }

  /** Slot coordinates for a preset (kinds are filled in slot order). */
  fromPreset(items: readonly Placed[]): number[] {
    const c = new Array<number>(2 * this.size).fill(PARK);
    const used = new Set<number>();
    for (const [k, x, y] of items) {
      const i = this.kindOf.findIndex((kk, j) => kk === k && !used.has(j));
      if (i < 0) continue;
      used.add(i);
      c[2 * i] = x;
      c[2 * i + 1] = y;
    }
    return c;
  }

  /** Coordinates in force: the stored layout if it belongs to this preset, else the preset. */
  coords(Q: readonly number[], tag: number, preset: readonly Placed[]): number[] {
    return Q[0] === tag && Q.length === 1 + 2 * this.size ? Q.slice(1) : this.fromPreset(preset);
  }

  sources(c: readonly number[]): SlotSrc[] {
    const out: SlotSrc[] = [];
    for (let i = 0; i < this.size; i++) {
      if (c[2 * i] >= PARK / 2) continue;
      out.push({ i, kind: this.kindOf[i], x: c[2 * i], y: c[2 * i + 1], s: this.kinds[this.kindOf[i]] });
    }
    return out;
  }

  /** Kinds with at least one parked slot (their chips are live). */
  available(c: readonly number[]): boolean[] {
    const out = this.kinds.map(() => false);
    for (let i = 0; i < this.size; i++) if (c[2 * i] >= PARK / 2) out[this.kindOf[i]] = true;
    return out;
  }
}

export interface SlotBinding<P extends Params, S> {
  pool: Pool;
  /** Coordinates in force for p. */
  coords: (p: P) => number[];
  /** Tag of the current preset. */
  tag: (p: P) => number;
  /** Key of the hidden array parameter. */
  key: keyof P & string;
  /** Region the sources may occupy. */
  box: Box;
  tray: (s: S) => Tray | undefined;
  /** Final say on a dragged position (e.g. keep off a Gaussian surface). */
  adjust?: (p: P, w: Vec2, i: number) => Vec2;
}

/** One handle per slot: a placed source, or the chip of the first parked slot of its kind. */
export function slotHandles<P extends Params, S extends { t: number }>(b: SlotBinding<P, S>): Handle<S, P>[] {
  const { pool } = b;
  const out: Handle<S, P>[] = [];
  for (let i = 0; i < pool.size; i++) {
    const kind = pool.kindOf[i];
    const parked = (c: number[]) => c[2 * i] >= PARK / 2;
    out.push({
      radiusPx: 16,
      pos: (s, p) => {
        const c = b.coords(p);
        if (!parked(c)) return { x: c[2 * i], y: c[2 * i + 1] };
        return b.tray(s)?.chips[kind] ?? { x: 1e9, y: 1e9 };
      },
      when: (p) => {
        const c = b.coords(p);
        if (!parked(c)) return true;
        for (let j = 0; j < i; j++) if (pool.kindOf[j] === kind && c[2 * j] >= PARK / 2) return false;
        return true;
      },
      onDrag: (ctx: SceneCtx<P>, s: S, w: Vec2) => {
        const c = b.coords(ctx.params);
        const tray = b.tray(s);
        if (tray && inRect(tray.rect, w)) {
          c[2 * i] = PARK;
          c[2 * i + 1] = PARK;
        } else {
          const [x0, y0, x1, y1] = b.box;
          let q = { x: Math.min(x1, Math.max(x0, w.x)), y: Math.min(y1, Math.max(y0, w.y)) };
          if (b.adjust) q = b.adjust(ctx.params, q, i);
          c[2 * i] = r3(q.x);
          c[2 * i + 1] = r3(q.y);
        }
        const next = [b.tag(ctx.params), ...c];
        const cur = ctx.params[b.key] as unknown as number[];
        if (next.some((v, k) => v !== cur[k])) ctx.set(b.key, next as P[typeof b.key]);
      },
    });
  }
  return out;
}

/** Index of an option value, used as the layout tag. */
export const tagOf = (options: readonly string[], v: string) => Math.max(0, options.indexOf(v));
