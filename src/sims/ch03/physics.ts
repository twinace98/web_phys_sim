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
 * Snapped tips are stored to 1e-12: in a rotated frame the screen coordinates of a 0.5-step grid
 * point are irrational, and rounding them to 2 decimals shows 1.49 instead of 1.50 (and a coarser
 * rounding would leave a zero component as a visible 1e-7).
 */
/** 2 decimals toward zero: a tip that fits still fits after rounding. */
const r2in = (v: number) => Math.trunc(Math.round(v * 1e9) / 1e7) / 100;
const r12 = (v: number) => Math.round(v * 1e12) / 1e12;

/**
 * Pointer position → stored vector: optionally snapped to a `step` grid of the
 * rotated axes, then clamped to |component| ≤ lim in the screen frame.
 */
export function placeTip(w: V2, phi: number, snap: boolean, lim: number, step = 0.5): V2 {
  const clamp = (x: number) => Math.min(lim, Math.max(-lim, x));
  if (!snap) return [r2(clamp(w[0])), r2(clamp(w[1]))];
  // Nearest grid point of the rotated axes inside the box (rounding each component alone and
  // then clamping the screen coordinates would leave the grid).
  return nearestGridPoint([clamp(w[0]), clamp(w[1])], phi, step, (q) => Math.abs(q[0]) <= lim + 1e-9 && Math.abs(q[1]) <= lim + 1e-9);
}

function nearestGridPoint(w: V2, phi: number, step: number, inside: (q: V2) => boolean): V2 {
  const [u, v] = toAxes(w, phi);
  const i0 = Math.round(u / step);
  const j0 = Math.round(v / step);
  let best: V2 = [0, 0];
  let bestD = Infinity;
  for (let i = i0 - 3; i <= i0 + 3; i++) {
    for (let j = j0 - 3; j <= j0 + 3; j++) {
      const q = fromAxes([i * step, j * step], phi);
      const d = Math.hypot(q[0] - w[0], q[1] - w[1]);
      if (d < bestD && inside(q)) {
        best = q;
        bestD = d;
      }
    }
  }
  return [r12(best[0]), r12(best[1])];
}

/**
 * Whether the tip a and both of its projections on axes rotated by any angle stay within ±lim.
 * The projections lie on the circle with diameter OA (Thales), so the condition is that this
 * circle fits: (|a_x| + |a|)/2 ≤ lim and (|a_y| + |a|)/2 ≤ lim, independent of the axes.
 */
export function componentsFit(a: V2, lim: number): boolean {
  const m = Math.hypot(a[0], a[1]);
  return (Math.abs(a[0]) + m) / 2 <= lim + 1e-6 && (Math.abs(a[1]) + m) / 2 <= lim + 1e-6;
}

/** Scale a toward the origin until componentsFit holds (direction kept). */
export function fitComponents(a: V2, lim: number): V2 {
  const m = Math.hypot(a[0], a[1]);
  if (m === 0) return a;
  const k = Math.min(1, (2 * lim) / (Math.abs(a[0]) + m), (2 * lim) / (Math.abs(a[1]) + m));
  return [a[0] * k, a[1] * k];
}

/**
 * Tip for the components scene: like placeTip, but the tip is kept where both component tips stay
 * on the stage for every axis angle (componentsFit), and a snapped tip is an exact 0.5-step grid
 * point of the rotated axes.
 */
export function placeComponentTip(w: V2, phi: number, snap: boolean, lim: number, step = 0.5): V2 {
  const f = fitComponents(w, lim);
  if (!snap) {
    return [r2in(f[0]), r2in(f[1])];
  }
  return nearestGridPoint(f, phi, step, (q) => componentsFit(q, lim));
}

/** Clamp v so that both v and v + other stay within ±lim in each component. */
export function clampWithPartner(v: V2, other: V2, lim: number): V2 {
  const c = (x: number, o: number) => Math.min(Math.min(lim, lim - o), Math.max(Math.max(-lim, -lim - o), x));
  return [r2(c(v[0], other[0])), r2(c(v[1], other[1]))];
}

/**
 * Change one component of a (along the rotated x axis if axis = 0, y if 1) to the pointer's
 * projection on that axis, keeping the other component. Snapped to `step`; limited so that the
 * tip and both component tips stay on the stage (componentsFit).
 */
export function setComponent(a: V2, phi: number, axis: 0 | 1, pointer: V2, snap: boolean, lim: number, step = 0.5): V2 {
  const uv = toAxes(a, phi);
  const at = (q: number): V2 => fromAxes(axis === 0 ? [q, uv[1]] : [uv[0], q], phi);
  const q0 = uv[axis];
  let q = toAxes(pointer, phi)[axis];
  if (snap) q = Math.round(q / step) * step;
  if (!componentsFit(at(q), lim)) {
    if (!componentsFit(a, lim)) return placeComponentTip(at(q), phi, snap, lim, step);
    // The fitting set is convex: bisect between the current value (fits) and the target.
    let lo = q0;
    let hi = q;
    for (let k = 0; k < 60; k++) {
      const mid = (lo + hi) / 2;
      if (componentsFit(at(mid), lim)) lo = mid;
      else hi = mid;
    }
    q = lo;
    if (snap) {
      // The last grid value on the way from q0 to the edge; none in between keeps q0.
      const g = q > q0 ? Math.floor(q / step + 1e-9) * step : Math.ceil(q / step - 1e-9) * step;
      q = (g - q0) * (q - q0) > 0 ? g : q0;
    }
  }
  const next = at(q);
  return snap ? [r12(next[0]), r12(next[1])] : [r2in(next[0]), r2in(next[1])];
}
