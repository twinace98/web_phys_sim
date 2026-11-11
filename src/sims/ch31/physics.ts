// Ch 31: series RLC circuit, exact. SI units, DOM-free.
//   Free:   L q'' + R q' + q/C = 0, q(0) = q0, i(0) = 0.
//   Driven: steady state for ε(t) = εm sin(ωd t).

export interface RLC {
  /** Resistance [Ω]. */
  R: number;
  /** Inductance [H]. */
  L: number;
  /** Capacitance [F]. */
  C: number;
}

export const omega0 = (c: RLC) => 1 / Math.sqrt(c.L * c.C);
/** Damping constant γ = R / 2L. */
export const gamma = (c: RLC) => c.R / (2 * c.L);

/** Charge and current of the free circuit (under-, critically or over-damped). */
export function freeAt(c: RLC, q0: number, t: number): { q: number; i: number } {
  const g = gamma(c);
  const w0 = omega0(c);
  const d = g * g - w0 * w0;
  const eps = 1e-9 * w0 * w0;
  if (d < -eps) {
    const wd = Math.sqrt(-d);
    const e = Math.exp(-g * t);
    return {
      q: q0 * e * (Math.cos(wd * t) + (g / wd) * Math.sin(wd * t)),
      i: (-q0 * e * (w0 * w0) * Math.sin(wd * t)) / wd,
    };
  }
  if (d > eps) {
    const b = Math.sqrt(d);
    const s1 = -g + b;
    const s2 = -g - b;
    const e1 = Math.exp(s1 * t);
    const e2 = Math.exp(s2 * t);
    return { q: (q0 * (s2 * e1 - s1 * e2)) / (s2 - s1), i: (q0 * s1 * s2 * (e1 - e2)) / (s2 - s1) };
  }
  const e = Math.exp(-g * t);
  return { q: q0 * e * (1 + g * t), i: -q0 * g * g * t * e };
}

/** Electric and magnetic energy. */
export const energies = (c: RLC, q: number, i: number) => ({ UE: (q * q) / (2 * c.C), UB: 0.5 * c.L * i * i });

// ------------------------------------------------------------------ driven, steady state

export interface Drive {
  /** Peak emf [V]. */
  em: number;
  /** Driving angular frequency [rad/s]. */
  wd: number;
}

export const reactanceL = (c: RLC, wd: number) => wd * c.L;
export const reactanceC = (c: RLC, wd: number) => 1 / (wd * c.C);
export const impedance = (c: RLC, wd: number) => Math.hypot(c.R, reactanceL(c, wd) - reactanceC(c, wd));
/** Phase constant φ: the current lags the emf by φ (negative: leads). */
export const phase = (c: RLC, wd: number) => Math.atan2(reactanceL(c, wd) - reactanceC(c, wd), c.R);
/** Current amplitude I = εm / Z. */
export const currentAmp = (c: RLC, dr: Drive) => dr.em / impedance(c, dr.wd);

export interface ACState {
  emf: number;
  i: number;
  /** di/dt. */
  didt: number;
  q: number;
  vR: number;
  vL: number;
  vC: number;
}

/** Steady state: i = I sin(ωt − φ), q = ∫ i dt = −(I/ω) cos(ωt − φ). */
export function acAt(c: RLC, dr: Drive, t: number): ACState {
  const I = currentAmp(c, dr);
  const th = dr.wd * t - phase(c, dr.wd);
  const i = I * Math.sin(th);
  const didt = I * dr.wd * Math.cos(th);
  const q = (-I / dr.wd) * Math.cos(th);
  return { emf: dr.em * Math.sin(dr.wd * t), i, didt, q, vR: i * c.R, vL: c.L * didt, vC: q / c.C };
}
