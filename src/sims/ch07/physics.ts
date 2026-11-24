// Ch 7: work by a position-dependent force F(x) and the work-kinetic energy theorem. DOM-free.
// The motion is integrated exactly: piecewise-constant forces segment by segment (uniform
// acceleration inside each, exact crossing times), the spring by its exact rotation in phase space.

export type Profile =
  | { kind: 'pw'; /** Segment edges, increasing. */ xs: number[]; /** Force on each segment [N]. */ Fs: number[] }
  | { kind: 'spring'; k: number };

export interface Setup {
  prof: Profile;
  m: number;
  x0: number;
  v0: number;
  /** Track [lo, hi]: the run ends when the block leaves it. */
  lo: number;
  hi: number;
}

export const M = 2;
export const SEG = 4;
export const F_MAX = 2;
export const TRACK = 8;

export type Preset = 'const' | 'spring' | 'pw' | 'custom';

const edges = (n: number, len: number) => Array.from({ length: n + 1 }, (_, i) => (i * len) / n);

export function makeSetup(pr: Preset, custom: readonly number[]): Setup {
  switch (pr) {
    case 'const':
      return { prof: { kind: 'pw', xs: [0, TRACK], Fs: [1] }, m: M, x0: 0, v0: 1, lo: 0, hi: TRACK };
    case 'spring':
      return { prof: { kind: 'spring', k: 2 }, m: M, x0: -2, v0: 0, lo: -2.5, hi: 2.5 };
    case 'pw':
      return { prof: { kind: 'pw', xs: [0, 3, 5, TRACK], Fs: [2, 0, -1.5] }, m: M, x0: 0, v0: 1, lo: 0, hi: TRACK };
    case 'custom':
      return { prof: { kind: 'pw', xs: edges(SEG, TRACK), Fs: Array.from({ length: SEG }, (_, i) => custom[i] ?? 0) }, m: M, x0: 0, v0: 1, lo: 0, hi: TRACK };
  }
}

/** F(x); at an edge the segment to the right. */
export function force(p: Profile, x: number): number {
  if (p.kind === 'spring') return -p.k * x;
  const i = segIndex(p.xs, x, 1);
  return p.Fs[i];
}

function segIndex(xs: number[], x: number, dir: number): number {
  const n = xs.length - 1;
  for (let i = 0; i < n; i++) {
    if (x < xs[i + 1] || (x === xs[i + 1] && dir < 0)) return Math.max(i, 0);
  }
  return n - 1;
}

/** Work ∫ F dx from xa to xb (signed area under F(x)). */
export function work(p: Profile, xa: number, xb: number): number {
  if (p.kind === 'spring') return -0.5 * p.k * (xb * xb - xa * xa);
  const sgn = xb >= xa ? 1 : -1;
  const lo = Math.min(xa, xb);
  const hi = Math.max(xa, xb);
  let w = 0;
  const n = p.Fs.length;
  for (let i = 0; i < n; i++) {
    // The outer segments extend to ±∞.
    const a = i === 0 ? -Infinity : p.xs[i];
    const b = i === n - 1 ? Infinity : p.xs[i + 1];
    const l = Math.max(lo, a);
    const r = Math.min(hi, b);
    if (r > l) w += p.Fs[i] * (r - l);
  }
  return sgn * w;
}

/**
 * Time τ ≥ 0 at which x + vτ + aτ²/2 first reaches the edge b while moving out through it
 * (out = +1 for the upper edge, −1 for the lower one), or Infinity. A root at τ ≈ 0 counts when the
 * block is moving outward then: rounding can leave x a few ulps short of an edge it has reached,
 * and treating that as "no crossing" would run the whole step with the wrong segment's force.
 */
function hitTime(x: number, v: number, a: number, b: number, out: 1 | -1): number {
  const d = b - x;
  const eps = 1e-12;
  const ok = (r: number) => r > eps || (r >= -eps && (v + a * Math.max(r, 0)) * out > 0);
  if (Math.abs(a) < 1e-15) {
    if (Math.abs(v) < 1e-15) return Infinity;
    const t = d / v;
    return ok(t) ? Math.max(t, 0) : Infinity;
  }
  let disc = v * v + 2 * a * d;
  // A turning point on the edge itself (K used up exactly there) comes out a rounding error short
  // after many steps (~1e-13 m): a turning point within 1 nm of the edge counts as reaching it.
  if (disc < 0 && Math.abs(disc / (2 * a)) < 1e-9) disc = 0;
  if (disc < 0) return Infinity;
  const s = Math.sqrt(disc);
  const r1 = (-v - s) / a;
  const r2 = (-v + s) / a;
  let best = Infinity;
  for (const r of [r1, r2]) if (ok(r) && Math.max(r, 0) < best) best = Math.max(r, 0);
  return best;
}

/** Exact advance by dt. */
export function advance(su: Setup, x: number, v: number, dt: number): { x: number; v: number } {
  const p = su.prof;
  if (p.kind === 'spring') {
    const w = Math.sqrt(p.k / su.m);
    const c = Math.cos(w * dt);
    const s = Math.sin(w * dt);
    return { x: x * c + (v / w) * s, v: -x * w * s + v * c };
  }
  let rem = dt;
  for (let guard = 0; guard < 64 && rem > 0; guard++) {
    const dir = v !== 0 ? Math.sign(v) : 0;
    let i = segIndex(p.xs, x, dir || 1);
    // At rest on an edge: take the side the force pushes toward.
    if (dir === 0 && i > 0 && x === p.xs[i] && p.Fs[i] < 0) i -= 1;
    const a = p.Fs[i] / su.m;
    const lo = i === 0 ? -Infinity : p.xs[i];
    const hi = i === p.Fs.length - 1 ? Infinity : p.xs[i + 1];
    const tLo = Number.isFinite(lo) ? hitTime(x, v, a, lo, -1) : Infinity;
    const tHi = Number.isFinite(hi) ? hitTime(x, v, a, hi, 1) : Infinity;
    const tx = Math.min(tLo, tHi);
    if (tx >= rem) {
      return { x: x + v * rem + 0.5 * a * rem * rem, v: v + a * rem };
    }
    v = v + a * tx;
    // Arriving at rest on the edge: drop the rounding residue so the rest rule below decides.
    if (Math.abs(v) < 1e-9) v = 0;
    x = tLo < tHi ? lo : hi;
    rem -= tx;
  }
  return { x, v };
}

export const kinetic = (m: number, v: number) => 0.5 * m * v * v;

export interface Trajectory {
  x: Float64Array;
  v: Float64Array;
  /** Number of samples (the last one is where the run ends). */
  n: number;
  rate: number;
  tEnd: number;
}

/** Samples at `rate` per second until the block leaves the track, or tMax. */
export function trajectory(su: Setup, rate: number, tMax: number): Trajectory {
  const N = Math.ceil(tMax * rate) + 1;
  const xs = new Float64Array(N);
  const vs = new Float64Array(N);
  let x = su.x0;
  let v = su.v0;
  xs[0] = x;
  vs[0] = v;
  let n = 1;
  const h = 1 / rate;
  while (n < N) {
    ({ x, v } = advance(su, x, v, h));
    if (x > su.hi || x < su.lo) {
      // Stop on the track end: the last part of the step, solved exactly.
      const edge = x > su.hi ? su.hi : su.lo;
      const prev = xs[n - 1];
      const pv = vs[n - 1];
      let lo = 0;
      let hi = h;
      for (let k = 0; k < 60; k++) {
        const mid = (lo + hi) / 2;
        const q = advance(su, prev, pv, mid).x;
        if ((edge === su.hi ? q < edge : q > edge)) lo = mid;
        else hi = mid;
      }
      const q = advance(su, prev, pv, hi);
      xs[n] = edge;
      vs[n] = q.v;
      return { x: xs, v: vs, n: n + 1, rate, tEnd: (n - 1) / rate + hi };
    }
    xs[n] = x;
    vs[n] = v;
    n += 1;
    // At rest where no force acts (K used up exactly on a segment edge with F = 0 beyond it): the
    // block stays there for good, so the run ends instead of idling to tMax (QA 2026-11-24: 11 s).
    if (v === 0 && vs[n - 2] === 0 && x === xs[n - 2]) return { x: xs, v: vs, n, rate, tEnd: (n - 1) / rate };
  }
  return { x: xs, v: vs, n, rate, tEnd: (n - 1) / rate };
}
