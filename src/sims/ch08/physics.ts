// Ch 8: work along a path (conservative versus friction) and motion in a potential U(x). DOM-free.

export type V2 = [number, number];
export const G = 9.8;

// ------------------------------------------------------------------ work along a path

export type ForceKind = 'gravity' | 'spring' | 'friction';
export type PathKind = 'straight' | 'arc' | 'zigzag' | 'custom';

export const A: V2 = [-2, 0];
export const B: V2 = [2, 1.5];
/** Spring anchor (natural length zero). */
export const ANCHOR: V2 = [0, -1.5];
export const MASS = 1;
export const K_SPRING = 2;
export const MU_K = 0.5;

const sub = (a: V2, b: V2): V2 => [a[0] - b[0], a[1] - b[1]];
const len = (a: V2) => Math.hypot(a[0], a[1]);
const lerp = (a: V2, b: V2, t: number): V2 => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];

/** Polyline from A to B; `closed` adds the straight way back to A. */
export function pathPoints(kind: PathKind, via: V2, closed: boolean): V2[] {
  let pts: V2[];
  switch (kind) {
    case 'straight':
      pts = [A, B];
      break;
    case 'arc': {
      // Circular arc bulging to the upper left of AB with sagitta h.
      const h = 1.6;
      const c = sub(B, A);
      const L = len(c);
      const n: V2 = [-c[1] / L, c[0] / L];
      const R = (h * h + (L * L) / 4) / (2 * h);
      const mid = lerp(A, B, 0.5);
      const O: V2 = [mid[0] - n[0] * (R - h), mid[1] - n[1] * (R - h)];
      const a0 = Math.atan2(A[1] - O[1], A[0] - O[0]);
      let a1 = Math.atan2(B[1] - O[1], B[0] - O[0]);
      if (a1 > a0) a1 -= 2 * Math.PI;
      pts = Array.from({ length: 49 }, (_, i) => {
        const a = a0 + ((a1 - a0) * i) / 48;
        return [O[0] + R * Math.cos(a), O[1] + R * Math.sin(a)] as V2;
      });
      pts[0] = A;
      pts[48] = B;
      break;
    }
    case 'zigzag': {
      const c = sub(B, A);
      const L = len(c);
      const n: V2 = [-c[1] / L, c[0] / L];
      const k = 6;
      pts = [A];
      for (let i = 1; i < k; i++) {
        const p = lerp(A, B, i / k);
        const s = i % 2 ? 1 : -1;
        pts.push([p[0] + n[0] * 0.9 * s, p[1] + n[1] * 0.9 * s]);
      }
      pts.push(B);
      break;
    }
    case 'custom':
      pts = [A, via, B];
      break;
  }
  return closed ? [...pts, A] : pts;
}

/** Work by the force on one straight piece p → q (exact). */
export function pieceWork(f: ForceKind, p: V2, q: V2): number {
  switch (f) {
    case 'gravity':
      return -MASS * G * (q[1] - p[1]);
    case 'spring': {
      const rp = sub(p, ANCHOR);
      const rq = sub(q, ANCHOR);
      return -0.5 * K_SPRING * (rq[0] ** 2 + rq[1] ** 2 - rp[0] ** 2 - rp[1] ** 2);
    }
    case 'friction':
      return -MU_K * MASS * G * len(sub(q, p));
  }
}

export interface PathWork {
  pts: V2[];
  /** Arc length at each vertex. */
  s: number[];
  /** Cumulative work at each vertex. */
  W: number[];
  L: number;
}

export function pathWork(f: ForceKind, pts: V2[]): PathWork {
  const s = [0];
  const W = [0];
  for (let i = 1; i < pts.length; i++) {
    s.push(s[i - 1] + len(sub(pts[i], pts[i - 1])));
    W.push(W[i - 1] + pieceWork(f, pts[i - 1], pts[i]));
  }
  return { pts, s, W, L: s[s.length - 1] };
}

/** Position, unit tangent and cumulative work at arc length s. */
export function along(pw: PathWork, f: ForceKind, s: number): { p: V2; dir: V2; W: number } {
  const sc = Math.min(Math.max(s, 0), pw.L);
  let i = 1;
  while (i < pw.pts.length - 1 && pw.s[i] < sc) i++;
  const a = pw.pts[i - 1];
  const b = pw.pts[i];
  const seg = pw.s[i] - pw.s[i - 1];
  const t = seg > 0 ? (sc - pw.s[i - 1]) / seg : 0;
  const p = lerp(a, b, t);
  const d = sub(b, a);
  const l = len(d) || 1;
  return { p, dir: [d[0] / l, d[1] / l], W: pw.W[i - 1] + pieceWork(f, a, p) };
}

/** Force vector at a point moving along dir. */
export function forceAt(f: ForceKind, p: V2, dir: V2): V2 {
  switch (f) {
    case 'gravity':
      return [0, -MASS * G];
    case 'spring':
      return [-K_SPRING * (p[0] - ANCHOR[0]), -K_SPRING * (p[1] - ANCHOR[1])];
    case 'friction':
      return [-MU_K * MASS * G * dir[0], -MU_K * MASS * G * dir[1]];
  }
}

// ------------------------------------------------------------------ energy diagram

export type PotKind = 'double' | 'spring' | 'hill';

export interface Potential {
  U: (x: number) => number;
  dU: (x: number) => number;
  lo: number;
  hi: number;
}

const C_HILL = 2 / 4.5;

export const POTENTIALS: Record<PotKind, Potential> = {
  double: { U: (x) => (x * x - 4) ** 2 / 8, dU: (x) => (x * (x * x - 4)) / 2, lo: -3.2, hi: 3.2 },
  spring: { U: (x) => 0.3 * x * x, dU: (x) => 0.6 * x, lo: -3.2, hi: 3.2 },
  hill: { U: (x) => 1.2 + C_HILL * (x ** 3 / 3 - 2.25 * x), dU: (x) => C_HILL * (x * x - 2.25), lo: -3.2, hi: 3.2 },
};

export interface Particle {
  x: number;
  v: number;
  /** Stuck by friction, or left the domain. */
  stopped: boolean;
}

/**
 * One step of velocity Verlet (symplectic, so E stays constant without friction), then kinetic
 * friction of size f opposing v. A particle at rest stays put while |dU/dx| ≤ f.
 */
export function stepParticle(pot: Potential, s: Particle, h: number, m: number, f: number): void {
  if (s.stopped) return;
  const a0 = -pot.dU(s.x) / m;
  if (f > 0 && s.v === 0 && Math.abs(pot.dU(s.x)) <= f) return;
  const vh = s.v + 0.5 * h * a0;
  s.x += h * vh;
  s.v = vh + 0.5 * h * (-pot.dU(s.x) / m);
  if (f > 0) {
    const dv = (f / m) * h;
    s.v = Math.abs(s.v) <= dv ? 0 : s.v - Math.sign(s.v) * dv;
  }
  if (s.x < pot.lo || s.x > pot.hi) {
    s.x = Math.min(Math.max(s.x, pot.lo), pot.hi);
    s.stopped = true;
  }
}

/** Roots of g on [lo, hi] by sampling and bisection. */
function roots(g: (x: number) => number, lo: number, hi: number, n = 800): number[] {
  const out: number[] = [];
  let x0 = lo;
  let g0 = g(x0);
  for (let i = 1; i <= n; i++) {
    const x1 = lo + ((hi - lo) * i) / n;
    const g1 = g(x1);
    if (g0 === 0) out.push(x0);
    else if (g0 * g1 < 0) {
      let a = x0;
      let b = x1;
      for (let k = 0; k < 60; k++) {
        const c = (a + b) / 2;
        if (g(a) * g(c) <= 0) b = c;
        else a = c;
      }
      out.push((a + b) / 2);
    }
    x0 = x1;
    g0 = g1;
  }
  return out;
}

/** Equilibrium points (dU/dx = 0) with stability from the sign of U''. */
export function equilibria(pot: Potential): { x: number; stable: boolean }[] {
  return roots(pot.dU, pot.lo, pot.hi).map((x) => {
    const d = 1e-4;
    return { x, stable: pot.dU(x + d) - pot.dU(x - d) > 0 };
  });
}

/** Turning points around x: nearest U = E to the left and right (null if none in the domain). */
export function turningPoints(pot: Potential, E: number, x: number): [number | null, number | null] {
  const r = roots((q) => pot.U(q) - E, pot.lo, pot.hi, 1600);
  let left: number | null = null;
  let right: number | null = null;
  for (const q of r) {
    if (q <= x + 1e-9) left = q;
    else if (right === null) right = q;
  }
  return [left, right];
}

/** x-intervals where U > E: classically forbidden for energy E. */
export function forbidden(pot: Potential, E: number, n = 600): [number, number][] {
  const out: [number, number][] = [];
  let start: number | null = null;
  for (let i = 0; i <= n; i++) {
    const x = pot.lo + ((pot.hi - pot.lo) * i) / n;
    const in_ = pot.U(x) > E;
    if (in_ && start === null) start = x;
    if (!in_ && start !== null) {
      out.push([start, x]);
      start = null;
    }
  }
  if (start !== null) out.push([start, pot.hi]);
  return out;
}
