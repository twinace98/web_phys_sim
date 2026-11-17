// Field lines on minority-sign charges, and removing placed charges (double tap, drop on tray).
import { describe, expect, it } from 'vitest';
import { defaults } from '../src/core/params';
import type { Params } from '../src/core/types';
import { POINT_POOL, pointCoords, pointSources } from '../src/sims/field/charges';
import { chargeLines, type Src } from '../src/sims/field/physics';
import { field } from '../src/sims/ch22/scene';

const R0 = 0.04;
const BOUNDS: [number, number, number, number] = [-1.5, -1, 1.5, 1];

/** Lines that start or end within 1.05 r0 of the source (a line starting there counts once). */
function touching(lines: number[][], c: Src): number {
  let n = 0;
  for (const L of lines) {
    const s = Math.hypot(L[0] - c.x, L[1] - c.y) < 1e-9;
    const e = Math.hypot(L[L.length - 2] - c.x, L[L.length - 1] - c.y) < 1.05 * R0;
    if (s || e) n++;
  }
  return n;
}

describe('field lines reach every charge in proportion to |q|', () => {
  const CASES: Src[][] = [
    [
      { x: -0.4, y: 0, s: 2 },
      { x: 0.4, y: 0, s: -1 },
    ],
    [
      { x: -0.4, y: 0, s: 1 },
      { x: 0.4, y: 0, s: -2 },
    ],
    [
      { x: -0.8, y: 0.3, s: 2 },
      { x: 0.9, y: -0.5, s: -1 },
      { x: 0.2, y: 0.6, s: -1 },
    ],
    [
      { x: 0, y: 0, s: 2 },
      { x: 0, y: 0.5, s: 1 },
      { x: 0.7, y: -0.4, s: -1 },
    ],
    [
      { x: -0.3, y: 0, s: 1 },
      { x: 0.3, y: 0, s: -1 },
    ],
  ];
  it('each charge has at least its own count, 10 per nC', () => {
    for (const src of CASES) {
      const lines = chargeLines(src, 'point', 10, R0, 0.01, BOUNDS);
      for (const c of src) expect(touching(lines, c), JSON.stringify(src)).toBeGreaterThanOrEqual(Math.round(10 * Math.abs(c.s)));
    }
  });
  it('the far −1 nC charge gets too few lines from the +2 nC charge alone; its own lines make up the rest', () => {
    const src = CASES[2];
    const lines = chargeLines(src, 'point', 10, R0, 0.01, BOUNDS);
    const far = src[1];
    const arrived = lines.filter((L) => Math.hypot(L[0] - src[0].x, L[1] - src[0].y) < 1e-9 && Math.hypot(L[L.length - 2] - far.x, L[L.length - 1] - far.y) < 1.05 * R0).length;
    const own = lines.filter((L) => Math.hypot(L[0] - far.x, L[1] - far.y) < 1e-9).length;
    expect(arrived).toBeLessThan(10);
    expect(own).toBeGreaterThan(0);
    expect(arrived + own).toBeGreaterThanOrEqual(10);
  });
});

describe('field lines follow a dragged charge continuously (Ch 22–24)', () => {
  // Every charge seeds at fixed angles: dragging by 1 px changes at most one line (one crossing
  // a separatrix), never the whole fan around a charge as when the gaps were refilled each frame.
  for (const [kern, perUnit] of [
    ['line', 8],
    ['point', 10],
  ] as const) {
    it(`${kern} kernel: at most one line added or removed per 1 px drag step`, () => {
      const key = (l: number[]) => `${Math.abs(l[0] + 0.4) < 1e-9 ? 'P' : 'N'}${Math.round(Math.atan2(l[3] - l[1], l[2] - l[0]) * 100)}`;
      let prev: Set<string> | null = null;
      for (let i = 0; i <= 300; i += 3) {
        const src: Src[] = [
          { x: -0.4, y: 0.15, s: 2 },
          { x: 0.2 + i / 300, y: -0.2, s: -1 },
        ];
        const keys = new Set(chargeLines(src, kern, perUnit, R0, 0.01, BOUNDS).map(key));
        if (prev) {
          let d = 0;
          for (const k of keys) if (!prev.has(k)) d++;
          for (const k of prev) if (!keys.has(k)) d++;
          expect(d, `step ${i}`).toBeLessThanOrEqual(2);
        }
        prev = keys;
      }
    });
  }
});

describe('removing a placed charge', () => {
  type P = Params & { preset: string; view: string; test: boolean; Q: number[]; T: number[] };
  /** Minimal scene context whose params follow every set(). */
  const ctxFor = (p: P) => {
    const c = {
      p,
      get params(): P {
        return c.p;
      },
      set(k: string, v: unknown) {
        c.p = { ...c.p, [k]: v } as P;
      },
    };
    return c;
  };
  it('a double tap on a placed charge parks it; a double tap on a tray chip does nothing', () => {
    const p = defaults(field.params) as P;
    expect(pointSources(p).length).toBe(2); // dipole
    const ctx = ctxFor(p);
    const s = { t: 0 };
    const slot = field.handles!.findIndex((h, i) => i > 0 && (h.when?.(ctx.p as never) ?? true) && Math.abs(h.pos(s, ctx.p as never).x + 0.4) < 1e-9);
    expect(slot).toBeGreaterThan(0);
    field.handles![slot].onDoubleTap!(ctx as never, s);
    expect(pointSources(ctx.p).map((c) => c.s)).toEqual([-1]);
    const before = [...pointCoords(ctx.p)];
    // A parked slot's handle (its tray chip) ignores the double tap.
    field.handles![slot].onDoubleTap!(ctx as never, s);
    expect(pointCoords(ctx.p)).toEqual(before);
    expect(POINT_POOL.available(pointCoords(ctx.p))[0]).toBe(true);
  });
});
