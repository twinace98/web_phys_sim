// Ch 20: counting microstates. Free expansion of N independent particles (W = C(N, n)) and two
// Einstein solids exchanging energy quanta. Entropies are in units of k (S/k = ln W). DOM-free.
import type { Rng } from '../../core/rng';

const lnf: number[] = [0];

/** ln n! from a growing table (exact sums of logs). */
export function lnFact(n: number): number {
  for (let k = lnf.length; k <= n; k++) lnf.push(lnf[k - 1] + Math.log(k));
  return lnf[n];
}

/** ln C(n, k). */
export function lnBinom(n: number, k: number): number {
  if (k < 0 || k > n) return -Infinity;
  return lnFact(n) - lnFact(k) - lnFact(n - k);
}

// ------------------------------------------------------------------ free expansion

export interface Particles {
  N: number;
  x: Float64Array;
  y: Float64Array;
  vx: Float64Array;
  vy: Float64Array;
}

/** Box [0, 2] × [0, 1]; all particles start in the left half with Gaussian velocities. */
export function initParticles(N: number, rng: Rng, speed = 0.45): Particles {
  const p: Particles = { N, x: new Float64Array(N), y: new Float64Array(N), vx: new Float64Array(N), vy: new Float64Array(N) };
  for (let i = 0; i < N; i++) {
    p.x[i] = 0.02 + 0.96 * rng.next();
    p.y[i] = 0.02 + 0.96 * rng.next();
    p.vx[i] = speed * rng.normal();
    p.vy[i] = speed * rng.normal();
  }
  return p;
}

/** Free flight with specular walls (no partition). */
export function moveParticles(p: Particles, h: number): void {
  for (let i = 0; i < p.N; i++) {
    let x = p.x[i] + p.vx[i] * h;
    let y = p.y[i] + p.vy[i] * h;
    if (x < 0) {
      x = -x;
      p.vx[i] = -p.vx[i];
    } else if (x > 2) {
      x = 4 - x;
      p.vx[i] = -p.vx[i];
    }
    if (y < 0) {
      y = -y;
      p.vy[i] = -p.vy[i];
    } else if (y > 1) {
      y = 2 - y;
      p.vy[i] = -p.vy[i];
    }
    p.x[i] = x;
    p.y[i] = y;
  }
}

/** Number of particles in the left half: the macrostate n. */
export function leftCount(p: Particles): number {
  let n = 0;
  for (let i = 0; i < p.N; i++) if (p.x[i] < 1) n++;
  return n;
}

/** Entropy of the macrostate n: S/k = ln C(N, n). */
export const entropyLR = (N: number, n: number) => lnBinom(N, n);

// ------------------------------------------------------------------ Einstein solids

/** Microstates of N oscillators sharing q quanta: C(q + N − 1, q). Returns ln Ω. */
export const lnOmega = (N: number, q: number) => (q === 0 ? 0 : lnBinom(q + N - 1, q));

/** kT/ε from 1/T = ∂S/∂E (large-N form): kT/ε = 1 / ln(1 + N/q); zero for q = 0. */
export const kTeps = (N: number, q: number) => (q <= 0 ? 0 : 1 / Math.log(1 + N / q));

/** Most probable q_A when q quanta are shared by solids of NA and NB oscillators. */
export function mostProbable(NA: number, NB: number, q: number): number {
  let best = 0;
  let bv = -Infinity;
  for (let qa = 0; qa <= q; qa++) {
    const v = lnOmega(NA, qa) + lnOmega(NB, q - qa);
    if (v > bv) {
      bv = v;
      best = qa;
    }
  }
  return best;
}

/** q quanta placed in oscillators [from, to) uniformly over microstates (stars and bars). */
export function fillUniform(osc: Int32Array, from: number, to: number, q: number, rng: Rng): void {
  const n = to - from;
  for (let i = from; i < to; i++) osc[i] = 0;
  if (n <= 0 || q <= 0) return;
  // Choose n − 1 bar positions among q + n − 1 slots (Floyd's sampling), then count stars.
  const slots = q + n - 1;
  const bars = new Set<number>();
  for (let j = slots - (n - 1); j < slots; j++) {
    const t = Math.floor(rng.next() * (j + 1));
    bars.add(bars.has(t) ? j : t);
  }
  let k = from;
  for (let s = 0; s < slots; s++) {
    if (bars.has(s)) k++;
    else osc[k]++;
  }
}

/**
 * One random move: a uniformly chosen oscillator, if it has a quantum, gives one to a uniformly
 * chosen oscillator. The proposal is symmetric, so every microstate is equally likely in the long run.
 */
export function exchange(osc: Int32Array, rng: Rng): void {
  const n = osc.length;
  const i = Math.floor(rng.next() * n);
  const j = Math.floor(rng.next() * n);
  if (osc[i] > 0 && i !== j) {
    osc[i]--;
    osc[j]++;
  }
}

export function sumRange(osc: Int32Array, from: number, to: number): number {
  let s = 0;
  for (let i = from; i < to; i++) s += osc[i];
  return s;
}
