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
