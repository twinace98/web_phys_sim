// Ch 3: vector components in a rotated frame and componentwise addition. DOM-free.

export type V2 = [number, number];

/** Unit vectors of axes rotated by phi (radians) from the screen frame. */
export function axes(phi: number): { ex: V2; ey: V2 } {
  const c = Math.cos(phi);
  const s = Math.sin(phi);
  return { ex: [c, s], ey: [-s, c] };
}

/** Components of a screen-frame vector along axes rotated by phi. */
export function toAxes([x, y]: V2, phi: number): V2 {
  const c = Math.cos(phi);
  const s = Math.sin(phi);
  return [x * c + y * s, -x * s + y * c];
}

/** Screen-frame vector from components along axes rotated by phi. */
export function fromAxes([u, v]: V2, phi: number): V2 {
  const c = Math.cos(phi);
  const s = Math.sin(phi);
  return [u * c - v * s, u * s + v * c];
}

export interface Components {
  ax: number;
  ay: number;
  mag: number;
  /** Angle from the +x axis, (−π, π]. */
  theta: number;
}

export function components(a: V2, phi: number): Components {
  const [ax, ay] = toAxes(a, phi);
  return { ax, ay, mag: Math.hypot(ax, ay), theta: Math.atan2(ay, ax) };
}

export const add = (a: V2, b: V2): V2 => [a[0] + b[0], a[1] + b[1]];
export const sub = (a: V2, b: V2): V2 => [a[0] - b[0], a[1] - b[1]];

/** Round to 2 decimals so URLs and readouts stay clean. */
const r2 = (v: number) => Math.round(v * 100) / 100;

/**
 * Pointer position → stored vector: optionally snapped to a `step` grid of the
 * rotated axes, then clamped to |component| ≤ lim in the screen frame.
 */
export function placeTip(w: V2, phi: number, snap: boolean, lim: number, step = 0.5): V2 {
  let p = w;
  if (snap) {
    const [u, v] = toAxes(w, phi);
    p = fromAxes([Math.round(u / step) * step, Math.round(v / step) * step], phi);
  }
  const clamp = (x: number) => Math.min(lim, Math.max(-lim, x));
  return [r2(clamp(p[0])), r2(clamp(p[1]))];
}

/** Clamp v so that both v and v + other stay within ±lim in each component. */
export function clampWithPartner(v: V2, other: V2, lim: number): V2 {
  const c = (x: number, o: number) => Math.min(Math.min(lim, lim - o), Math.max(Math.max(-lim, -lim - o), x));
  return [r2(c(v[0], other[0])), r2(c(v[1], other[1]))];
}
