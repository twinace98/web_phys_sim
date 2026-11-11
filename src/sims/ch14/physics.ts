// Ch 14: steady, incompressible, inviscid flow through a Venturi tube. Exact, DOM-free.
// Continuity A v = Q; Bernoulli p + ½ρv² + ρgy = const along the tube.

export const RHO = 1000; // water [kg/m³]
export const G = 9.8; // [m/s²]

/** Tube layout along x [m]: wide inlet, converging cone, throat, diverging cone, wide outlet. */
export const TUBE = { L: 1.6, c0: 0.45, c1: 0.65, d0: 0.95, d1: 1.15 };
/** Pressure taps (standpipes) at the middle of the inlet, throat and outlet. */
export const TAPS = [0.225, 0.8, 1.375];

export interface Venturi {
  /** Wide cross-section [m²]. */
  A1: number;
  /** Throat area over wide area. */
  ratio: number;
  /** Volume flow rate [m³/s]. */
  Q: number;
  /** Outlet height above the inlet [m]; the axis rises linearly along the tube. */
  dy: number;
}

const smooth = (u: number) => (u <= 0 ? 0 : u >= 1 ? 1 : u * u * (3 - 2 * u));

/** Pipe radius at x (circular cross-section; radius blends smoothly in the cones). */
export function radiusAt(v: Venturi, x: number): number {
  const r1 = Math.sqrt(v.A1 / Math.PI);
  const r2 = r1 * Math.sqrt(v.ratio);
  const { c0, c1, d0, d1 } = TUBE;
  if (x <= c0 || x >= d1) return r1;
  if (x < c1) return r1 + (r2 - r1) * smooth((x - c0) / (c1 - c0));
  if (x <= d0) return r2;
  return r2 + (r1 - r2) * smooth((x - d0) / (d1 - d0));
}

export const areaAt = (v: Venturi, x: number) => Math.PI * radiusAt(v, x) ** 2;
/** Axis height at x. */
export const axisY = (v: Venturi, x: number) => (v.dy * x) / TUBE.L;
/** Continuity: v = Q / A. */
export const speedAt = (v: Venturi, x: number) => v.Q / areaAt(v, x);

/**
 * Gauge pressure head at the inlet tap, chosen so that every standpipe column stays at least
 * 5 cm above the pipe axis, rounded up to a 5 cm water column.
 */
export function inletHead(v: Venturi): number {
  const v1 = speedAt(v, TAPS[0]);
  const y1 = axisY(v, TAPS[0]);
  let need = 0;
  for (const x of TAPS) need = Math.max(need, axisY(v, x) - y1 + (speedAt(v, x) ** 2 - v1 * v1) / (2 * G));
  return Math.ceil((need + 0.05) / 0.05 - 1e-9) * 0.05;
}

export interface Tap {
  A: number;
  v: number;
  /** A v [m³/s]. */
  flow: number;
  /** Height of the axis above the inlet axis [m]. */
  y: number;
  /** Gauge pressure [Pa]. */
  p: number;
  /** ½ρv² [Pa]. */
  dyn: number;
  /** ρ g y [Pa]. */
  grav: number;
  /** p + ½ρv² + ρgy [Pa]. */
  sum: number;
  /** Standpipe water level (world y) = axis height + p/(ρg). */
  level: number;
}

/** Bernoulli at every tap, heights measured from the inlet axis. */
export function taps(v: Venturi): Tap[] {
  const x1 = TAPS[0];
  const y1 = axisY(v, x1);
  const v1 = speedAt(v, x1);
  const total = RHO * G * inletHead(v) + 0.5 * RHO * v1 * v1;
  return TAPS.map((x) => {
    const A = areaAt(v, x);
    const vv = v.Q / A;
    const y = axisY(v, x) - y1;
    const dyn = 0.5 * RHO * vv * vv;
    const grav = RHO * G * y;
    const p = total - dyn - grav;
    return { A, v: vv, flow: A * vv, y, p, dyn, grav, sum: p + dyn + grav, level: axisY(v, x) + p / (RHO * G) };
  });
}

/**
 * Travel time from the inlet (x = 0) to x along the axis, τ(x) = ∫ ds / v, tabulated.
 * Tracers released at equal time intervals sit where τ(x) equals their age.
 */
export class TravelTime {
  readonly xs: number[] = [];
  readonly ts: number[] = [];
  constructor(v: Venturi, n = 800) {
    const slope = v.dy / TUBE.L;
    const ds = Math.sqrt(1 + slope * slope);
    const dx = TUBE.L / n;
    let tau = 0;
    this.xs.push(0);
    this.ts.push(0);
    for (let i = 0; i < n; i++) {
      // Simpson on each cell: 1/v = A/Q is smooth.
      const x0 = i * dx;
      const inv = (x: number) => 1 / speedAt(v, x);
      tau += ((dx * ds) / 6) * (inv(x0) + 4 * inv(x0 + dx / 2) + inv(x0 + dx));
      this.xs.push(x0 + dx);
      this.ts.push(tau);
    }
  }

  get total(): number {
    return this.ts[this.ts.length - 1];
  }

  /** Position reached after travelling for `age`; NaN outside the tube. */
  xAt(age: number): number {
    const { xs, ts } = this;
    if (age < 0 || age > this.total) return NaN;
    let lo = 0;
    let hi = ts.length - 1;
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1;
      if (ts[mid] <= age) lo = mid;
      else hi = mid;
    }
    const f = (age - ts[lo]) / (ts[hi] - ts[lo]);
    return xs[lo] + f * (xs[hi] - xs[lo]);
  }
}
