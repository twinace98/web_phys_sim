// Ch 30: Faraday-Lenz (flux through a moving loop) and the four Maxwell equations as small
// numerical checks. DOM-free. SI units unless noted.
import { MU0, discOverlap, type V2 } from '../field/physics';

// ------------------------------------------------------------------ Faraday tab

/** Field region x ∈ [−REGION, REGION], |y| ≤ REGION_H; square loop of side A_LOOP. */
export const REGION = 0.5;
export const REGION_H = 0.45;
export const A_LOOP = 0.4;
/** Loop centre travels from −TRAVEL to +TRAVEL. */
export const TRAVEL = 1;

/** Overlap length of the loop [xc − a/2, xc + a/2] with the region. */
export function overlap(xc: number, a = A_LOOP): number {
  return Math.max(0, Math.min(xc + a / 2, REGION) - Math.max(xc - a / 2, -REGION));
}

/** d(overlap)/d(xc): +1 entering, −1 leaving, 0 otherwise. */
export function overlapRate(xc: number, a = A_LOOP): number {
  const right = xc + a / 2;
  const left = xc - a / 2;
  return (right > -REGION && right < REGION ? 1 : 0) - (left > -REGION && left < REGION ? 1 : 0);
}

/** Coil radius and magnet moment for the magnet scenario. */
export const A_COIL = 0.2;
export const M_MAG = 100;

/**
 * Flux of a point dipole m (along +x, at x) through a coaxial loop of radius a at the origin:
 * Φ = μ0 m a² / (2 (a² + x²)^{3/2}) (by reciprocity with the on-axis field of the loop).
 */
export const dipoleFlux = (x: number, m = M_MAG, a = A_COIL) => (MU0 * m * a * a) / (2 * (a * a + x * x) ** 1.5);
export const dipoleFluxRate = (x: number, m = M_MAG, a = A_COIL) => (-3 * MU0 * m * a * a * x) / (2 * (a * a + x * x) ** 2.5);

export interface FaradayState {
  /** Loop centre (region) or magnet centre (magnet) [m]. */
  x: number;
  /** Φ_B [Wb] and dΦ_B/dt [Wb/s]; EMF = −dΦ/dt. */
  phi: number;
  dphi: number;
}

export function faradayAt(scenario: 'region' | 'magnet', t: number, v: number, B: number): FaradayState {
  const x = -TRAVEL - (scenario === 'magnet' ? 0.2 : 0) + v * t;
  if (scenario === 'magnet') return { x, phi: dipoleFlux(x), dphi: dipoleFluxRate(x) * v };
  return { x, phi: B * A_LOOP * overlap(x), dphi: B * A_LOOP * overlapRate(x) * v };
}

/** Travel time of the scenario at speed v. */
export const faradayEnd = (scenario: 'region' | 'magnet', v: number) => (2 * TRAVEL + (scenario === 'magnet' ? 0.4 : 0)) / v;

// ------------------------------------------------------------------ Maxwell tab: Faraday

/** Radius of the region of uniform, changing B (centred at the origin). */
export const R_B = 0.35;

/**
 * Induced E [V/m] of a uniform B(t) ⊥ page inside r < R (dB/dt > 0 means growing out of the
 * page): E_φ = −(r/2) dB/dt inside, −(R²/2r) dB/dt outside (clockwise for dB/dt > 0).
 */
export function inducedE(x: number, y: number, dBdt: number, R = R_B): V2 {
  const r2 = x * x + y * y;
  if (r2 < 1e-18) return [0, 0];
  const r = Math.sqrt(r2);
  const Ephi = r <= R ? -(r / 2) * dBdt : -((R * R) / (2 * r)) * dBdt;
  return [(-y / r) * Ephi, (x / r) * Ephi];
}

/** −dΦ_B/dt through a circle (cx, cy, r): −dB/dt × overlap with the field disc. */
export const faradayRhs = (cx: number, cy: number, r: number, dBdt: number) => -dBdt * discOverlap(R_B, r, Math.hypot(cx, cy));

// ------------------------------------------------------------------ Maxwell tab: Ampère-Maxwell

/** Charging capacitor: plates at x = ±GAP, radius R_PLATE; wire on the axis; current I_CAP. */
export const GAP = 0.15;
export const R_PLATE = 0.3;
export const R_AMP = 0.4;
export const I_CAP = 2;

export interface AmpereMaxwell {
  /** Conduction current through the surface [A]. */
  ic: number;
  /** Displacement current ε0 dΦ_E/dt through the surface [A]. */
  id: number;
  /** ∮ B·ds around the loop [T m] = 2π r B(r). */
  circ: number;
}

/**
 * Loop of radius R_AMP (> R_PLATE) around the axis at x. 'flat' is the disc bounded by the
 * loop; 'bulge' is a bag bounded by the same loop that reaches the middle of the gap (or, from
 * inside the gap, out past the left plate). B on the loop is μ0 I / (2π r) everywhere, since
 * the loop encloses the whole plate (fringing neglected).
 */
export function ampereMaxwell(x: number, surface: 'flat' | 'bulge'): AmpereMaxwell {
  const inGap = Math.abs(x) < GAP;
  const throughGap = surface === 'flat' ? inGap : !inGap;
  const circ = MU0 * I_CAP;
  return throughGap ? { ic: 0, id: I_CAP, circ } : { ic: I_CAP, id: 0, circ };
}
