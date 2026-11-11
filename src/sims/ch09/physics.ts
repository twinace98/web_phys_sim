// Ch 9: collisions on a frictionless track (1D) and table (2D). Exact, event-driven, DOM-free.
// Between events every body moves uniformly, so positions are evaluated in closed form.

// ------------------------------------------------------------------ 1D

/**
 * Velocities after a head-on collision with coefficient of restitution e
 * (e = 1 elastic, 0 < e < 1 inelastic, e = 0 perfectly inelastic).
 */
export function collide1D(m1: number, v1: number, m2: number, v2: number, e: number): [number, number] {
  const M = m1 + m2;
  const p = m1 * v1 + m2 * v2;
  return [(p - m2 * e * (v1 - v2)) / M, (p + m1 * e * (v1 - v2)) / M];
}

/**
 * Two bodies at rest-together velocity V pushed apart by a spring that releases energy E.
 * Momentum stays m1 v1 + m2 v2 = (m1 + m2) V; kinetic energy rises by E.
 */
export function explode1D(m1: number, m2: number, V: number, E: number): [number, number] {
  const M = m1 + m2;
  return [V - Math.sqrt((2 * E * m2) / (m1 * M)), V + Math.sqrt((2 * E * m1) / (m2 * M))];
}

export type Kind1D = 'elastic' | 'inelastic' | 'stick' | 'explode';

export interface Track {
  kind: Kind1D;
  m1: number;
  m2: number;
  /** Initial velocities (ignored for 'explode', which starts at rest). */
  v1: number;
  v2: number;
  /** Coefficient of restitution for 'inelastic'. */
  e: number;
  /** Energy released by the spring for 'explode' [J]. */
  E: number;
  /** Cart widths [m]. */
  w1: number;
  w2: number;
  /** Initial centres [m]. */
  x1: number;
  x2: number;
  /** Spring release time for 'explode' [s]. */
  tSep: number;
}

export interface Motion1D {
  /** Time of the collision or separation, Infinity if none. */
  tc: number;
  /** Positions at tc. */
  xc: [number, number];
  before: [number, number];
  after: [number, number];
}

export function restitution(tr: Track): number {
  return tr.kind === 'elastic' ? 1 : tr.kind === 'stick' ? 0 : tr.e;
}

/** When and how the single event happens. With two bodies and no walls there is at most one. */
export function motion1D(tr: Track): Motion1D {
  if (tr.kind === 'explode') {
    const after = explode1D(tr.m1, tr.m2, 0, tr.E);
    return { tc: tr.tSep, xc: [tr.x1, tr.x2], before: [0, 0], after };
  }
  const before: [number, number] = [tr.v1, tr.v2];
  const gap = tr.x2 - tr.x1 - (tr.w1 + tr.w2) / 2;
  const closing = tr.v1 - tr.v2;
  if (closing <= 0) return { tc: Infinity, xc: [tr.x1, tr.x2], before, after: before };
  const tc = gap / closing;
  const xc: [number, number] = [tr.x1 + tr.v1 * tc, tr.x2 + tr.v2 * tc];
  return { tc, xc, before, after: collide1D(tr.m1, tr.v1, tr.m2, tr.v2, restitution(tr)) };
}

export interface State1D {
  x1: number;
  x2: number;
  v1: number;
  v2: number;
}

export function state1D(tr: Track, mo: Motion1D, t: number): State1D {
  if (t < mo.tc) {
    const [v1, v2] = mo.before;
    return { x1: tr.x1 + v1 * t, x2: tr.x2 + v2 * t, v1, v2 };
  }
  const [v1, v2] = mo.after;
  const d = t - mo.tc;
  return { x1: mo.xc[0] + v1 * d, x2: mo.xc[1] + v2 * d, v1, v2 };
}

// ------------------------------------------------------------------ 2D

export type V2 = [number, number];

export interface Puck {
  m: number;
  R: number;
  x: V2;
  v: V2;
}

export type Kind2D = 'elastic' | 'inelastic' | 'stick';

const dot = (a: V2, b: V2) => a[0] * b[0] + a[1] * b[1];
const sub = (a: V2, b: V2): V2 => [a[0] - b[0], a[1] - b[1]];

/** First time the discs touch, Infinity if they never do. */
export function contactTime(a: Puck, b: Puck): number {
  const dr = sub(b.x, a.x);
  const dv = sub(b.v, a.v);
  const s = a.R + b.R;
  const A = dot(dv, dv);
  const B = dot(dr, dv);
  const C = dot(dr, dr) - s * s;
  if (A === 0 || B >= 0) return Infinity;
  const disc = B * B - A * C;
  if (disc < 0) return Infinity;
  return (-B - Math.sqrt(disc)) / A;
}

/**
 * Velocities after contact. Frictionless discs: the impulse is along the line of centres and
 * the tangential components are unchanged. 'stick': both leave with the centre-of-mass velocity.
 */
export function collide2D(a: Puck, b: Puck, kind: Kind2D, e: number): [V2, V2] {
  const M = a.m + b.m;
  if (kind === 'stick') {
    const vc: V2 = [(a.m * a.v[0] + b.m * b.v[0]) / M, (a.m * a.v[1] + b.m * b.v[1]) / M];
    return [vc, [vc[0], vc[1]]];
  }
  const ee = kind === 'elastic' ? 1 : e;
  const d = sub(b.x, a.x);
  const L = Math.hypot(d[0], d[1]);
  const n: V2 = [d[0] / L, d[1] / L];
  const vn = dot(sub(a.v, b.v), n);
  const J = ((1 + ee) * a.m * b.m * vn) / M;
  return [
    [a.v[0] - (J / a.m) * n[0], a.v[1] - (J / a.m) * n[1]],
    [b.v[0] + (J / b.m) * n[0], b.v[1] + (J / b.m) * n[1]],
  ];
}

export interface Motion2D {
  tc: number;
  /** Pucks at the moment of contact (positions) with their velocities after it. */
  at: [Puck, Puck];
  init: [Puck, Puck];
}

export function motion2D(a: Puck, b: Puck, kind: Kind2D, e: number): Motion2D {
  const tc = contactTime(a, b);
  if (!Number.isFinite(tc)) return { tc, at: [a, b], init: [a, b] };
  const move = (p: Puck): Puck => ({ ...p, x: [p.x[0] + p.v[0] * tc, p.x[1] + p.v[1] * tc] });
  const a1 = move(a);
  const b1 = move(b);
  const [va, vb] = collide2D(a1, b1, kind, e);
  return { tc, at: [{ ...a1, v: va }, { ...b1, v: vb }], init: [a, b] };
}

export function state2D(mo: Motion2D, t: number): [Puck, Puck] {
  const go = (p: Puck, d: number): Puck => ({ ...p, x: [p.x[0] + p.v[0] * d, p.x[1] + p.v[1] * d] });
  return t < mo.tc ? [go(mo.init[0], t), go(mo.init[1], t)] : [go(mo.at[0], t - mo.tc), go(mo.at[1], t - mo.tc)];
}

// ------------------------------------------------------------------ totals

export const kinetic = (m: number, v: number) => 0.5 * m * v * v;
export const kinetic2 = (p: Puck) => 0.5 * p.m * dot(p.v, p.v);
