// Ch 2: 1D motion with piecewise-constant acceleration. Exact, DOM-free.

export type Motion = 'uniform' | 'accel' | 'startStop' | 'reverse' | 'custom';

export interface Segment {
  t0: number;
  t1: number;
  a: number;
}

export interface Profile {
  x0: number;
  v0: number;
  segs: Segment[];
  tEnd: number;
}

export const T_END = 10;
export const CUSTOM_SEGS = 5;
export const CUSTOM_A_MAX = 2;

export function makeProfile(m: Motion, custom: readonly number[], v0Custom: number): Profile {
  const one = (x0: number, v0: number, a: number): Profile => ({ x0, v0, segs: [{ t0: 0, t1: T_END, a }], tEnd: T_END });
  switch (m) {
    case 'uniform':
      return one(0, 2, 0);
    case 'accel':
      return one(0, 0, 0.5);
    case 'reverse':
      return one(0, 4, -1);
    case 'startStop':
      return {
        x0: 0,
        v0: 0,
        segs: [
          { t0: 0, t1: 3, a: 1 },
          { t0: 3, t1: 7, a: 0 },
          { t0: 7, t1: 10, a: -1 },
        ],
        tEnd: T_END,
      };
    case 'custom': {
      const dt = T_END / CUSTOM_SEGS;
      return {
        x0: 0,
        v0: v0Custom,
        segs: Array.from({ length: CUSTOM_SEGS }, (_, i) => ({ t0: i * dt, t1: (i + 1) * dt, a: custom[i] ?? 0 })),
        tEnd: T_END,
      };
    }
  }
}

export interface Kin {
  x: number;
  v: number;
  a: number;
}

/** Exact state at time t; a(t) is right-continuous at segment boundaries. */
export function stateAt(pr: Profile, t: number): Kin {
  const tc = Math.min(Math.max(t, 0), pr.tEnd);
  let x = pr.x0;
  let v = pr.v0;
  for (let i = 0; i < pr.segs.length; i++) {
    const s = pr.segs[i];
    const last = i === pr.segs.length - 1;
    if (tc >= s.t1 && !last) {
      const d = s.t1 - s.t0;
      x += v * d + 0.5 * s.a * d * d;
      v += s.a * d;
      continue;
    }
    const d = tc - s.t0;
    return { x: x + v * d + 0.5 * s.a * d * d, v: v + s.a * d, a: s.a };
  }
  return { x, v, a: 0 };
}

/** Signed area under a(t) on [t0, t1]: sum of rectangles. */
export function areaUnderA(pr: Profile, t0: number, t1: number): number {
  let area = 0;
  for (const s of pr.segs) {
    const lo = Math.max(t0, s.t0);
    const hi = Math.min(t1, s.t1);
    if (hi > lo) area += s.a * (hi - lo);
  }
  return area;
}

/** Signed area under v(t) on [t0, t1]: v is linear on each segment, so each piece is a trapezoid. */
export function areaUnderV(pr: Profile, t0: number, t1: number): number {
  let area = 0;
  for (const s of pr.segs) {
    const lo = Math.max(t0, s.t0);
    const hi = Math.min(t1, s.t1);
    if (hi <= lo) continue;
    const vLo = stateAt(pr, lo).v;
    const vHi = vLo + s.a * (hi - lo);
    area += 0.5 * (vLo + vHi) * (hi - lo);
  }
  return area;
}

export interface Ranges {
  x: [number, number];
  v: [number, number];
  a: [number, number];
}

export function ranges(pr: Profile): Ranges {
  const r: Ranges = { x: [Infinity, -Infinity], v: [Infinity, -Infinity], a: [Infinity, -Infinity] };
  const N = 1000;
  for (let i = 0; i <= N; i++) {
    const k = stateAt(pr, (i / N) * pr.tEnd);
    for (const key of ['x', 'v', 'a'] as const) {
      r[key][0] = Math.min(r[key][0], k[key]);
      r[key][1] = Math.max(r[key][1], k[key]);
    }
  }
  return r;
}
