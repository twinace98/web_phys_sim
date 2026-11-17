// Damped and driven oscillator m x'' + b x' + k x = F(t) (Halliday 15-8, 15-9). SI units, DOM-free.

export interface Osc {
  /** Mass [kg]. */
  m: number;
  /** Spring constant [N/m]. */
  k: number;
  /** Damping constant [kg/s]. */
  b: number;
}

export type Regime = 'under' | 'critical' | 'over';

export const omega0 = (o: Osc) => Math.sqrt(o.k / o.m);
/** Decay constant γ = b/2m of the amplitude. */
export const gamma = (o: Osc) => o.b / (2 * o.m);
/** Critical damping constant b_c = 2√(km): γ = ω₀. */
export const bCrit = (o: Osc) => 2 * Math.sqrt(o.k * o.m);

/** Regime from γ² − ω₀², with a relative tolerance so that b = b_c on the slider grid counts as critical. */
export function regime(o: Osc): Regime {
  const w0 = omega0(o);
  const d = gamma(o) ** 2 - w0 * w0;
  const eps = 1e-9 * w0 * w0;
  return d < -eps ? 'under' : d > eps ? 'over' : 'critical';
}

/** Damped angular frequency ω' = √(ω₀² − γ²); NaN when critically damped or overdamped. */
export const omegaPrime = (o: Osc) => (regime(o) === 'under' ? Math.sqrt(omega0(o) ** 2 - gamma(o) ** 2) : NaN);

/** β = √(γ² − ω₀²) of the overdamped motion; NaN otherwise. */
export const betaOver = (o: Osc) => (regime(o) === 'over' ? Math.sqrt(gamma(o) ** 2 - omega0(o) ** 2) : NaN);

/**
 * Free motion released from rest at x = x0 (closed form):
 *   under:    x = x0 e^{−γt} [cos ω't + (γ/ω') sin ω't]
 *   critical: x = x0 e^{−γt} (1 + γt)
 *   over:     x = x0 e^{−γt} [cosh βt + (γ/β) sinh βt]
 */
export function freeAt(o: Osc, x0: number, t: number): { x: number; v: number } {
  const g = gamma(o);
  const w0 = omega0(o);
  const e = Math.exp(-g * t);
  const r = regime(o);
  if (r === 'under') {
    const w = Math.sqrt(w0 * w0 - g * g);
    const c = Math.cos(w * t);
    const s = Math.sin(w * t);
    return { x: x0 * e * (c + (g / w) * s), v: (-x0 * e * w0 * w0 * s) / w };
  }
  if (r === 'over') {
    const B = Math.sqrt(g * g - w0 * w0);
    const c = Math.cosh(B * t);
    const s = Math.sinh(B * t);
    return { x: x0 * e * (c + (g / B) * s), v: (-x0 * e * w0 * w0 * s) / B };
  }
  return { x: x0 * e * (1 + g * t), v: -x0 * g * g * t * e };
}

/**
 * Amplitude constant x_m of x = x_m e^{−bt/2m} cos(ω't − δ) for release from rest at x0
 * (underdamped): x_m = x0/cos δ = x0 ω₀/ω', tan δ = γ/ω'. NaN when there is no oscillation.
 */
export const amplitudeConst = (o: Osc, x0: number) => (x0 * omega0(o)) / omegaPrime(o);

/** Envelope x_m e^{−bt/2m} (underdamped; NaN otherwise). */
export const envelope = (o: Osc, x0: number, t: number) => amplitudeConst(o, x0) * Math.exp(-gamma(o) * t);

/** Light-damping energy ½ k x_m² e^{−bt/m}: the mechanical energy averaged over one oscillation. */
export const energyApprox = (o: Osc, x0: number, t: number) => 0.5 * o.k * amplitudeConst(o, x0) ** 2 * Math.exp((-o.b * t) / o.m);

export const energy = (o: Osc, x: number, v: number) => {
  const K = 0.5 * o.m * v * v;
  const U = 0.5 * o.k * x * x;
  return { K, U, E: K + U };
};

// ------------------------------------------------------------------ integrator

export interface Motion {
  x: number;
  v: number;
}

/** One RK4 step of m x'' + b x' + k x = F(τ), τ measured from the start of the step. */
export function rk4(o: Osc, s: Motion, h: number, F: (tau: number) => number = () => 0): void {
  const acc = (x: number, v: number, tau: number) => (F(tau) - o.b * v - o.k * x) / o.m;
  const x1 = s.x;
  const v1 = s.v;
  const a1 = acc(x1, v1, 0);
  const x2 = x1 + (h / 2) * v1;
  const v2 = v1 + (h / 2) * a1;
  const a2 = acc(x2, v2, h / 2);
  const x3 = x1 + (h / 2) * v2;
  const v3 = v1 + (h / 2) * a2;
  const a3 = acc(x3, v3, h / 2);
  const x4 = x1 + h * v3;
  const v4 = v1 + h * a3;
  const a4 = acc(x4, v4, h);
  s.x = x1 + (h / 6) * (v1 + 2 * v2 + 2 * v3 + v4);
  s.v = v1 + (h / 6) * (a1 + 2 * a2 + 2 * a3 + a4);
}

// ------------------------------------------------------------------ driven

/**
 * Support moved as y_s = d cos θ, θ' = ω_d. The spring pulls with k(y_s − x), so the driving force is
 * F = k d cos ω_d t with F_m = k d.
 */
export interface Drive {
  /** Support amplitude [m]. */
  d: number;
  /** Driving angular frequency [rad/s]. */
  wd: number;
}

/** Steady-state amplitude x_m = F_m / √((k − mω_d²)² + (bω_d)²). */
export const drivenAmp = (o: Osc, dr: Drive) => (o.k * dr.d) / Math.hypot(o.k - o.m * dr.wd * dr.wd, o.b * dr.wd);

/** Phase lag φ ∈ [0, π] of x behind the drive: x = x_m cos(ω_d t − φ). */
export const drivenLag = (o: Osc, dr: Drive) => Math.atan2(o.b * dr.wd, o.k - o.m * dr.wd * dr.wd);

/** Driving frequency of largest amplitude ω_r = √(ω₀² − 2γ²); NaN when there is no peak (γ ≥ ω₀/√2). */
export function peakOmega(o: Osc): number {
  const q = omega0(o) ** 2 - 2 * gamma(o) ** 2;
  return q > 0 ? Math.sqrt(q) : NaN;
}

/** Largest steady-state amplitude over all driving frequencies. */
export function peakAmp(o: Osc, d: number): number {
  const wr = peakOmega(o);
  return Number.isFinite(wr) ? drivenAmp(o, { d, wd: wr }) : d;
}
