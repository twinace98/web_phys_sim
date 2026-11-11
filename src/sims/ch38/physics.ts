// Ch 38: a wave packet built from plane waves (free electron), and de Broglie wavelengths.
// DOM-free.

// ------------------------------------------------------------------ wave packet

/** ħ/m for the electron [nm²/fs]. */
export const HBAR_M = 0.11576765;
/** Component spacing δk [1/nm]: the sum repeats every 2π/δk = 42 nm. */
export const DK = (2 * Math.PI) / 42;

export interface Packet {
  k: number[];
  a: number[];
}

/**
 * M plane waves e^{i(kx − ωt)}, equally spaced by δk around k0, with Gaussian amplitudes
 * (width s = M/5 in units of δk, so the outermost sit near 2.4 standard deviations).
 */
export function packet(M: number, k0: number): Packet {
  const s = M / 5;
  const k: number[] = [];
  const a: number[] = [];
  for (let i = 0; i < M; i++) {
    const j = i - (M - 1) / 2;
    k.push(k0 + j * DK);
    a.push(Math.exp(-(j * j) / (2 * s * s)));
  }
  return { k, a };
}

/** Free-electron dispersion ω = ħk²/2m [1/fs]. */
export const omega = (k: number) => 0.5 * HBAR_M * k * k;

/** Group velocity dω/dk = ħk/m [nm/fs], the classical particle velocity. */
export const vGroup = (k0: number) => HBAR_M * k0;
/** Phase velocity ω/k [nm/fs] = half the group velocity. */
export const vPhase = (k0: number) => 0.5 * HBAR_M * k0;

/** ψ(x, t) = Σ a_j e^{i(k_j x − ω_j t)}, as [Re, Im]. */
export function psi(pk: Packet, x: number, t: number): [number, number] {
  let re = 0;
  let im = 0;
  for (let j = 0; j < pk.k.length; j++) {
    const ph = pk.k[j] * x - omega(pk.k[j]) * t;
    re += pk.a[j] * Math.cos(ph);
    im += pk.a[j] * Math.sin(ph);
  }
  return [re, im];
}

/** rms spread of k, weighted by |a_j|². */
export function deltaK(pk: Packet): number {
  let w = 0;
  let m = 0;
  let m2 = 0;
  pk.k.forEach((k, j) => {
    const p = pk.a[j] ** 2;
    w += p;
    m += p * k;
    m2 += p * k * k;
  });
  return Math.sqrt(Math.max(0, m2 / w - (m / w) ** 2));
}

/**
 * rms width of |ψ|² over one repeat length centred on `xc` (the packet centre). A single plane
 * wave is not localised: Infinity.
 */
export function deltaX(pk: Packet, t: number, xc: number, n = 1200): number {
  if (pk.k.length < 2) return Infinity;
  const L = (2 * Math.PI) / DK;
  let w = 0;
  let m = 0;
  let m2 = 0;
  for (let i = 0; i < n; i++) {
    const u = -L / 2 + ((i + 0.5) * L) / n;
    const [re, im] = psi(pk, xc + u, t);
    const p = re * re + im * im;
    w += p;
    m += p * u;
    m2 += p * u * u;
  }
  return Math.sqrt(Math.max(0, m2 / w - (m / w) ** 2));
}

// ------------------------------------------------------------------ de Broglie

export const H = 6.62607015e-34;
export const C = 299792458;
export const EV = 1.602176634e-19;
export const ME = 9.1093837015e-31;
export const MN = 1.67492749804e-27;
export const U = 1.66053906660e-27;

export type ParticleId = 'electron' | 'neutron' | 'c60' | 'ball';

export interface Particle {
  mass: number;
  /** Diameter [m]; 0 for a point particle. */
  size: number;
}

export const PARTICLES: Record<ParticleId, Particle> = {
  electron: { mass: ME, size: 0 },
  neutron: { mass: MN, size: 1.7e-15 },
  c60: { mass: 720 * U, size: 1.0e-9 },
  ball: { mass: 0.145, size: 0.074 },
};

/** Relativistic momentum from kinetic energy [J]. */
export const pFromK = (m: number, K: number) => Math.sqrt(K * K + 2 * K * m * C * C) / C;

/** Relativistic momentum from speed [m/s]. */
export const pFromV = (m: number, v: number) => (m * v) / Math.sqrt(1 - (v / C) ** 2);

export const speedFromP = (m: number, p: number) => p / Math.sqrt(m * m + (p / C) ** 2);

/** λ = h/p [m]. */
export const deBroglie = (p: number) => H / p;
