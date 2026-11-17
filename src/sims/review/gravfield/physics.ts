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
