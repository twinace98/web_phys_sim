// Ch 26: Drude model of conduction in a 2D wire section. DOM-free.
// Electrons move at a fixed (Fermi) speed in random directions, scatter after exponentially
// distributed free times (mean τ), and accelerate opposite to E in between. The mean
// velocity is the drift velocity v_d = a τ, so I = n q A v_d ∝ V A / L → R = ρ L / A.
//
// Model units: lengths in cm along the wire, the height of the drawn section stands for A,
// time in s. Drift is hugely exaggerated relative to the thermal speed (see i18n assumptions).
import type { Rng } from '../../core/rng';

/** Speed of every electron right after a collision [cm/s]. */
export const V_TH = 2;
/** Electrons drawn per unit drawn area. */
export const DENSITY = 24;
/**
 * Simulated electrons per drawn one. The current is counted over all of them: the thermal
 * counting noise falls as 1/√N, so even 0.1 V gives a usable reading in 30 s.
 */
export const SAMPLE = 8;
/** Electron acceleration per (V / cm) [cm/s² per V/cm]. */
export const ACCEL = 6;
/** Mean free time at 300 K [s]; τ ∝ 1/T (phonon scattering). */
export const TAU_300 = 0.25;
/** Drawn height per mm² of cross-section. */
export const H_PER_MM2 = 0.9;
/** Reference wire: L = 4 cm, A = 2 mm², 300 K, R = 10 Ω. Sets the charge of one model electron. */
export const REF = { L: 4, A: 2, T: 300, R: 10 };

export interface Wire {
  /** Length [cm]. */
  L: number;
  /** Cross-section [mm²]. */
  A: number;
  /** Temperature [K]. */
  T: number;
}

export const tauOf = (T: number) => (TAU_300 * 300) / T;
export const heightOf = (A: number) => A * H_PER_MM2;
/** Electron acceleration magnitude for voltage V across the wire. */
export const accelOf = (w: Wire, V: number) => (ACCEL * V) / w.L;
/** Drift speed v_d = a τ (electrons move toward −x, against E). */
export const driftSpeed = (w: Wire, V: number) => accelOf(w, V) * tauOf(w.T);

/** Charge carried by one model electron [C], fixed by the reference wire (I_ref = 1 V / R_ref). */
export const Q_E = 1 / REF.R / (DENSITY * SAMPLE * heightOf(REF.A) * driftSpeed(REF, 1));

/** Current [A] predicted by the model: I = n q h v_d. */
export const currentOf = (w: Wire, V: number) => DENSITY * SAMPLE * Q_E * heightOf(w.A) * driftSpeed(w, V);

/** Resistance [Ω] = V / I, independent of V (Ohm's law); ∝ L / A and ∝ T. */
export const resistanceOf = (w: Wire) => 1 / (DENSITY * SAMPLE * Q_E * heightOf(w.A) * ((ACCEL / w.L) * tauOf(w.T)));

export interface Gas {
  n: number;
  x: Float64Array;
  y: Float64Array;
  vx: Float64Array;
  vy: Float64Array;
  /** Time left until the next collision. */
  left: Float64Array;
  /** Net number of electrons that crossed the mid-plane toward −x (current toward +x). */
  count: number;
  /** Collisions in the last step (flags, for drawing). */
  hit: Uint8Array;
}

const freeTime = (rng: Rng, tau: number) => -tau * Math.log(1 - rng.next());

export function makeGas(w: Wire, rng: Rng): Gas {
  const h = heightOf(w.A);
  const n = Math.round(DENSITY * SAMPLE * w.L * h);
  const g: Gas = {
    n,
    x: new Float64Array(n),
    y: new Float64Array(n),
    vx: new Float64Array(n),
    vy: new Float64Array(n),
    left: new Float64Array(n),
    count: 0,
    hit: new Uint8Array(n),
  };
  const tau = tauOf(w.T);
  for (let i = 0; i < n; i++) {
    g.x[i] = rng.next() * w.L;
    g.y[i] = (rng.next() - 0.5) * h;
    const a = 2 * Math.PI * rng.next();
    g.vx[i] = V_TH * Math.cos(a);
    g.vy[i] = V_TH * Math.sin(a);
    g.left[i] = freeTime(rng, tau);
  }
  return g;
}

/**
 * Advance by dt. E points along +x (high potential at x = 0), so electrons accelerate toward −x.
 * The ends are periodic (the rest of the circuit), the sides reflect.
 */
export function stepGas(g: Gas, w: Wire, V: number, dt: number, rng: Rng): void {
  const a = -accelOf(w, V);
  const tau = tauOf(w.T);
  const half = heightOf(w.A) / 2;
  const mid = w.L / 2;
  for (let i = 0; i < g.n; i++) {
    g.hit[i] = 0;
    const x0 = g.x[i];
    let x = x0 + g.vx[i] * dt + 0.5 * a * dt * dt;
    g.vx[i] += a * dt;
    let y = g.y[i] + g.vy[i] * dt;
    if (y > half) {
      y = 2 * half - y;
      g.vy[i] = -g.vy[i];
    } else if (y < -half) {
      y = -2 * half - y;
      g.vy[i] = -g.vy[i];
    }
    if (x0 >= mid && x < mid) g.count += 1;
    else if (x0 < mid && x >= mid) g.count -= 1;
    if (x < 0) x += w.L;
    else if (x >= w.L) x -= w.L;
    g.x[i] = x;
    g.y[i] = y;
    g.left[i] -= dt;
    if (g.left[i] <= 0) {
      const ang = 2 * Math.PI * rng.next();
      g.vx[i] = V_TH * Math.cos(ang);
      g.vy[i] = V_TH * Math.sin(ang);
      g.left[i] = freeTime(rng, tau);
      g.hit[i] = 1;
    }
  }
}

/** Mean x velocity of all electrons. */
export function meanVx(g: Gas): number {
  let s = 0;
  for (let i = 0; i < g.n; i++) s += g.vx[i];
  return s / g.n;
}
