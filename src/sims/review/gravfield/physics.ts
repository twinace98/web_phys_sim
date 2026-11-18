// Gravitational field and potential of point masses in the plane. DOM-free.
// Lengths in L = 10⁵ km = 10⁸ m, masses in Earth masses M⊕, real G.
// The masses enter the shared field engine (src/sims/field/physics.ts) as point sources of
// strength s = −M: the 'point' kernel then gives Σ s r̂/r² (pointing towards the masses, since
// gravity only attracts) and the potential Σ s/r = −Σ M/r.
import { fieldAt, potentialAt, type Src, type V2 } from '../../field/physics';

export const G = 6.674e-11; // N m²/kg²
export const M_EARTH = 5.972e24; // kg
export const L = 1e8; // m per world unit (10⁵ km)
/** Earth–Moon mass ratio and distance [L]. */
export const MOON = 0.0123;
export const D_MOON = 3.844;

/** g [m/s²] per unit of the engine field (M⊕ / L²). */
export const G_UNIT = (G * M_EARTH) / (L * L);
/** Φ [J/kg] per unit of the engine potential (M⊕ / L). */
export const PHI_UNIT = (G * M_EARTH) / L;

export interface Mass {
  x: number;
  y: number;
  /** Mass [M⊕]. */
  m: number;
}

export const sources = (ms: readonly Mass[]): Src[] => ms.map((b) => ({ x: b.x, y: b.y, s: -b.m }));

/** Gravitational field g [m/s²] at (x, y) [L]. */
export function gField(ms: readonly Mass[], x: number, y: number): V2 {
  const [fx, fy] = fieldAt(sources(ms), 'point', x, y);
  return [G_UNIT * fx, G_UNIT * fy];
}

/** Gravitational potential Φ [J/kg] at (x, y) [L]; zero at infinity. */
export const phi = (ms: readonly Mass[], x: number, y: number): number => PHI_UNIT * potentialAt(sources(ms), 'point', x, y, 1e-9);

/** Field of each mass [m/s²] at (x, y): g_i = G M_i / r_i², towards mass i. */
export const gParts = (ms: readonly Mass[], x: number, y: number): V2[] => ms.map((b) => gField([b], x, y));

/**
 * The point between two masses where g = 0. Along the line, G M1/r1² = G M2/r2², so
 * r1/r2 = √(M1/M2) and r1 = d / (1 + √(M2/M1)) from mass 1.
 */
export function nullPoint(a: Mass, b: Mass): { x: number; y: number; r1: number; r2: number; d: number } {
  const d = Math.hypot(b.x - a.x, b.y - a.y);
  const r1 = d / (1 + Math.sqrt(b.m / a.m));
  const u = d > 0 ? r1 / d : 0;
  return { x: a.x + u * (b.x - a.x), y: a.y + u * (b.y - a.y), r1, r2: d - r1, d };
}

/** 1, 2 or 5 times a power of ten, the nearest to v on a log scale. */
export function niceStep(v: number): number {
  const e = Math.floor(Math.log10(v));
  const m = v / 10 ** e;
  const c = [1, 2, 5, 10].reduce((a, b) => (Math.abs(Math.log(m / b)) < Math.abs(Math.log(m / a)) ? b : a));
  return c * 10 ** e;
}

/** Equipotential spacing ΔΦ [J/kg]: a 1-2-5 step near G M_max / (8 L). */
export const phiStep = (ms: readonly Mass[]): number => niceStep((PHI_UNIT * Math.max(...ms.map((b) => b.m))) / 8);

// ------------------------------------------------------------------ points where g = 0

/** Field (engine units M⊕/L²), its Jacobian ∂g_a/∂x_b, and Σ M_i/r_i² (a size scale) at (x, y). */
export function fieldJac(ms: readonly Mass[], x: number, y: number): { gx: number; gy: number; jxx: number; jxy: number; jyy: number; scale: number } {
  let gx = 0;
  let gy = 0;
  let jxx = 0;
  let jxy = 0;
  let jyy = 0;
  let scale = 0;
  for (const b of ms) {
    const dx = x - b.x;
    const dy = y - b.y;
    const r2 = dx * dx + dy * dy;
    const r = Math.sqrt(r2);
    const r3 = r2 * r;
    const r5 = r3 * r2;
    gx -= (b.m * dx) / r3;
    gy -= (b.m * dy) / r3;
    jxx -= b.m * (1 / r3 - (3 * dx * dx) / r5);
    jyy -= b.m * (1 / r3 - (3 * dy * dy) / r5);
    jxy += (3 * b.m * dx * dy) / r5;
    scale += b.m / r2;
  }
  return { gx, gy, jxx, jxy, jyy, scale };
}

export interface NullPt {
  x: number;
  y: number;
  /**
   * saddle: within the plane Φ rises along one direction and falls along the other, so the
   * equipotential through the point crosses itself (figure eight). max: Φ is highest there within
   * the plane (e.g. the centre of three equal masses); its equipotential shrinks to the point.
   */
  kind: 'saddle' | 'max';
}

/** Newton's method on g(x, y) = 0 from (x, y); null if it leaves `box` or does not converge. */
function newton(ms: readonly Mass[], x: number, y: number, box: readonly number[]): NullPt | null {
  for (let it = 0; it < 80; it++) {
    const f = fieldJac(ms, x, y);
    const det = f.jxx * f.jyy - f.jxy * f.jxy;
    if (Math.hypot(f.gx, f.gy) <= 1e-13 * f.scale) return { x, y, kind: det < 0 ? 'saddle' : 'max' };
    if (!(Math.abs(det) > 0)) return null;
    let dx = -(f.jyy * f.gx - f.jxy * f.gy) / det;
    let dy = -(f.jxx * f.gy - f.jxy * f.gx) / det;
    // Short steps: at most a third of the way to the nearest mass, and 0.5 L.
    let near = Infinity;
    for (const b of ms) near = Math.min(near, Math.hypot(x - b.x, y - b.y));
    const lim = Math.min(0.5, near / 3);
    const len = Math.hypot(dx, dy);
    if (len > lim) {
      dx *= lim / len;
      dy *= lim / len;
    }
    x += dx;
    y += dy;
    if (x < box[0] || x > box[2] || y < box[1] || y > box[3]) return null;
  }
  return null;
}

/**
 * Every point where g = 0. Such points lie inside the convex hull of the masses (outside it every
 * mass pulls towards the same side), so Newton's method starts from a grid of div × div seeds
 * over the masses' bounding box, from the two-mass null point of every pair and from the centre
 * of every three. The masses lie in the plane, so the field there has no out-of-plane component:
 * these are the zeros of the full 3D field.
 */
export function nullPoints(ms: readonly Mass[], div = 24): NullPt[] {
  if (ms.length < 2) return [];
  const xs = ms.map((b) => b.x);
  const ys = ms.map((b) => b.y);
  const x0 = Math.min(...xs);
  const x1 = Math.max(...xs);
  const y0 = Math.min(...ys);
  const y1 = Math.max(...ys);
  const span = Math.max(x1 - x0, y1 - y0);
  const box = [x0 - 0.5 * span, y0 - 0.5 * span, x1 + 0.5 * span, y1 + 0.5 * span];
  const seeds: [number, number][] = [];
  for (let i = 0; i < ms.length; i++)
    for (let j = i + 1; j < ms.length; j++) {
      const n = nullPoint(ms[i], ms[j]);
      seeds.push([n.x, n.y]);
      for (let k = j + 1; k < ms.length; k++) seeds.push([(ms[i].x + ms[j].x + ms[k].x) / 3, (ms[i].y + ms[j].y + ms[k].y) / 3]);
    }
  const w = Math.max(x1 - x0, 1e-3 * span);
  const h = Math.max(y1 - y0, 1e-3 * span);
  for (let a = 0; a < div; a++) for (let b = 0; b < div; b++) seeds.push([x0 + (w * (a + 0.5)) / div, y0 + (h * (b + 0.5)) / div]);
  const out: NullPt[] = [];
  const tol = 1e-7 * span;
  for (const [sx, sy] of seeds) {
    if (ms.some((b) => Math.hypot(sx - b.x, sy - b.y) < 1e-9 * span)) continue;
    const q = newton(ms, sx, sy, box);
    if (q && !out.some((o) => Math.hypot(o.x - q.x, o.y - q.y) < tol)) out.push(q);
  }
  return out;
}
