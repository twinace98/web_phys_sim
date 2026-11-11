// Ch 40: Stern-Gerlach measurements of a spin-½ atom. DOM-free.
// Spin states used here all lie in the xz plane, so a state is a direction at angle α from +z
// (toward +x). Measuring along an axis at angle θ gives + with probability cos²((θ − α)/2) and
// leaves the spin along +θ, or along θ + π after −.
import type { Rng } from '../../core/rng';

export const DEG = Math.PI / 180;

/** Probability of + along axis θ for a spin along α. */
export const probUp = (theta: number, alpha: number) => Math.cos((theta - alpha) / 2) ** 2;

/** One measurement: returns the outcome and the new spin direction. */
export function measure(theta: number, alpha: number, rng: Rng): { up: boolean; alpha: number } {
  const up = rng.next() < probUp(theta, alpha);
  return { up, alpha: up ? theta : theta + Math.PI };
}

/** Unpolarised source: a random direction in the xz plane (both outcomes ½ along any axis). */
export const randomSpin = (rng: Rng) => 2 * Math.PI * rng.next();

/** Classical magnet moment, uniform over the sphere: the deflection is ∝ μ_z ∈ [−1, 1], uniform. */
export const classicalMuZ = (rng: Rng) => 2 * rng.next() - 1;

export interface Device {
  /** Axis angle from +z [rad]. */
  theta: number;
  /** Exit passed to the next device: '+', '−' or both (last device: both go to detectors). */
  pass: '+' | '-' | 'both';
}

export interface Fate {
  /** Index of the device where the atom leaves the chain. */
  device: number;
  /** Exit it leaves by. */
  up: boolean;
  /** true: reaches a detector (last device); false: stopped by a blocked exit. */
  detected: boolean;
}

/** Runs one atom through the chain. */
export function runChain(devices: Device[], rng: Rng): Fate {
  let alpha = randomSpin(rng);
  for (let i = 0; i < devices.length; i++) {
    const d = devices[i];
    const m = measure(d.theta, alpha, rng);
    alpha = m.alpha;
    const last = i === devices.length - 1;
    if (last) return { device: i, up: m.up, detected: true };
    const passes = d.pass === 'both' || (d.pass === '+') === m.up;
    if (!passes) return { device: i, up: m.up, detected: false };
  }
  return { device: devices.length - 1, up: true, detected: true };
}

/**
 * Exact probabilities at the last device for an unpolarised beam: [P(+), P(−)] of an atom
 * entering the chain (atoms stopped earlier count in neither).
 */
export function chainProbs(devices: Device[]): [number, number] {
  // Each passed exit fixes the spin, so only the first device sees an unpolarised beam.
  let p = 1;
  let alpha = 0;
  for (let i = 0; i < devices.length; i++) {
    const d = devices[i];
    if (i === devices.length - 1) {
      const u = i === 0 ? 0.5 : probUp(d.theta, alpha);
      return [p * u, p * (1 - u)];
    }
    if (d.pass === 'both') throw new Error('only the last device may pass both exits');
    const up = d.pass === '+';
    const pu = i === 0 ? 0.5 : probUp(d.theta, alpha);
    p *= up ? pu : 1 - pu;
    alpha = up ? d.theta : d.theta + Math.PI;
  }
  return [p, 0];
}
