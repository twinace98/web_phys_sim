// Ch 29: Biot-Savart summation over current elements in the plane, and the field of line
// currents ⊥ page for Ampère's law. DOM-free. Lengths in m, current in A, B in μT.
import { MU0 } from '../field/physics';
import { Pool, type Placed } from '../field/slots';

/** Current in the Biot-Savart tab [A]. */
export const I_BS = 10;
/** Straight wire: from x = −HALF to +HALF on y = 0, current along +x. */
export const HALF = 1.1;
/** Circular loop radius [m], centred at the origin, current counter-clockwise. */
export const R_LOOP = 0.45;

export interface Element {
  /** Midpoint. */
  x: number;
  y: number;
  /** dl vector. */
  dx: number;
  dy: number;
}

export function elements(wire: 'straight' | 'loop', n: number): Element[] {
  const out: Element[] = [];
  for (let i = 0; i < n; i++) {
    if (wire === 'straight') {
      const dl = (2 * HALF) / n;
      out.push({ x: -HALF + (i + 0.5) * dl, y: 0, dx: dl, dy: 0 });
    } else {
      // Arc elements: midpoint on the circle, dl tangent with the arc length.
      const a = -Math.PI / 2 + (2 * Math.PI * (i + 0.5)) / n;
      const dl = (2 * Math.PI * R_LOOP) / n;
      out.push({ x: R_LOOP * Math.cos(a), y: R_LOOP * Math.sin(a), dx: -dl * Math.sin(a), dy: dl * Math.cos(a) });
    }
  }
  return out;
}

/** dB_z [μT] of one element at (px, py): (μ0 I / 4π) (dl × r)_z / r³, + out of page. */
export function dBz(e: Element, px: number, py: number, I = I_BS): number {
  const rx = px - e.x;
  const ry = py - e.y;
  const r = Math.max(Math.hypot(rx, ry), 1e-6);
  return ((MU0 / (4 * Math.PI)) * I * (e.dx * ry - e.dy * rx) * 1e6) / (r * r * r);
}

/** Exact B_z [μT] of the finite straight wire at (px, py). */
export function straightExact(px: number, py: number, I = I_BS): number {
  const d = Math.abs(py);
  if (d < 1e-9) return 0;
  const s = (x: number) => (x - px) / Math.hypot(x - px, d);
  return (Math.sign(py) * (MU0 / (4 * Math.PI)) * I * (s(HALF) - s(-HALF)) * 1e6) / d;
}

/** Infinite straight wire: μ0 I / (2π d) [μT]. */
export const infiniteWire = (d: number, I = I_BS) => ((MU0 * I) / (2 * Math.PI * d)) * 1e6;
/** Centre of a circular loop: μ0 I / (2R) [μT]. */
export const loopCentre = (I = I_BS) => ((MU0 * I) / (2 * R_LOOP)) * 1e6;

/** Distance from the observation point to the wire. */
export function distToWire(wire: 'straight' | 'loop', px: number, py: number): number {
  if (wire === 'straight') {
    const dx = Math.max(0, Math.abs(px) - HALF);
    return Math.hypot(dx, py);
  }
  return Math.abs(Math.hypot(px, py) - R_LOOP);
}

// ------------------------------------------------------------------ Ampère tab

/** Field [μT] per unit strength of the 'wire' kernel: μ0 I / (2π r) with I = 1 A. */
export const WIRE_B = (MU0 / (2 * Math.PI)) * 1e6;
/** μ0 [μT m/A]. */
export const MU0_UT = MU0 * 1e6;

/** Kinds: 1 A out of the page (⊙), 1 A into the page (⊗). */
export const WIRE_POOL = new Pool([1, -1], [16, 16]);

/** One row of the solenoid section: 16 wires, 8 cm apart. */
const row = (kind: number, y: number): Placed[] => Array.from({ length: 16 }, (_, i) => [kind, Math.round((-0.6 + 0.08 * i) * 1000) / 1000, y] as Placed);

export const WIRE_PRESETS: Record<string, Placed[]> = {
  single: [[0, 0, 0]],
  pair: [
    [0, -0.4, 0],
    [1, 0.4, 0],
  ],
  solenoid: [...row(0, 0.16), ...row(1, -0.16)],
};
