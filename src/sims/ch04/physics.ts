// Ch 4: projectile motion without air resistance. Exact, DOM-free.
// x(t) = v0x t (uniform), y(t) = h + v0y t − g t²/2 (uniform acceleration −g).

export interface Launch {
  /** Launch height [m]. */
  h: number;
  /** Launch speed [m/s]. */
  v0: number;
  /** Launch angle above the horizontal [rad]. */
  theta: number;
  /** Gravitational acceleration [m/s²]. */
  g: number;
}

export const G: Record<string, number> = { earth: 9.8, mars: 3.71, moon: 1.62 };

export interface Kin {
  x: number;
  y: number;
  vx: number;
  vy: number;
}

export const v0x = (l: Launch) => l.v0 * Math.cos(l.theta);
export const v0y = (l: Launch) => l.v0 * Math.sin(l.theta);

export function stateAt(l: Launch, t: number): Kin {
  const vx = v0x(l);
  const vy0 = v0y(l);
  return { x: vx * t, y: l.h + vy0 * t - 0.5 * l.g * t * t, vx, vy: vy0 - l.g * t };
}

/** Time to reach the ground y = 0 (positive root). */
export function flightTime(l: Launch): number {
  const vy0 = v0y(l);
  return (vy0 + Math.sqrt(vy0 * vy0 + 2 * l.g * l.h)) / l.g;
}

/** Horizontal distance at landing. */
export const range = (l: Launch) => v0x(l) * flightTime(l);

/** Highest point above the ground. */
export function maxHeight(l: Launch): number {
  const vy0 = Math.max(0, v0y(l));
  return l.h + (vy0 * vy0) / (2 * l.g);
}

// ------------------------------------------------------------------ uniform circular motion

export interface Circular {
  /** Radius [m]. */
  r: number;
  /** Speed [m/s]. */
  v: number;
}

/** Counter-clockwise from +x at t = 0. */
export function circularAt(c: Circular, t: number) {
  const w = c.v / c.r;
  const phi = w * t;
  const cs = Math.cos(phi);
  const sn = Math.sin(phi);
  const a = (c.v * c.v) / c.r;
  return { phi, x: c.r * cs, y: c.r * sn, vx: -c.v * sn, vy: c.v * cs, ax: -a * cs, ay: -a * sn };
}

export const centripetal = (c: Circular) => (c.v * c.v) / c.r;
export const period = (c: Circular) => (2 * Math.PI * c.r) / c.v;

// ------------------------------------------------------------------ relative motion: river crossing

export interface River {
  /** River width [m]. */
  W: number;
  /** Boat speed relative to the water [m/s]. */
  vb: number;
  /** Current, water relative to the ground, along +x [m/s]. */
  u: number;
  /** Heading tilted upstream from straight across [rad]. */
  theta: number;
}

type V2 = [number, number];

/** Boat relative to water. */
export const vBW = (r: River): V2 => [-r.vb * Math.sin(r.theta), r.vb * Math.cos(r.theta)];
/** Water relative to ground. */
export const vWG = (r: River): V2 => [r.u, 0];
/** Boat relative to ground: v_BG = v_BW + v_WG (Galilean velocity addition). */
export const vBG = (r: River): V2 => {
  const a = vBW(r);
  return [a[0] + r.u, a[1]];
};

/** Time to cross: only the across component of v_BW matters. */
export const crossingTime = (r: River) => r.W / (r.vb * Math.cos(r.theta));
/** Downstream displacement at arrival (negative: upstream). */
export const drift = (r: River) => vBG(r)[0] * crossingTime(r);
