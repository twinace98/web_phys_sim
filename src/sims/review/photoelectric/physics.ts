// Photoelectric effect: photon energy, stopping voltage, photocurrent model, and the classical
// (wave) expectations used for contrast. Units: frequency 10¹⁴ Hz,
// wavelength nm, eV, V, nA.

/** Planck constant [J s], elementary charge [C], speed of light [m/s] (exact SI values). */
export const H = 6.62607015e-34;
export const QE = 1.602176634e-19;
export const C = 299792458;
/** hc [eV nm]. */
export const HC_EV_NM = (H * C) / QE / 1e-9;
/** h/e [V s]: V_stop grows by h/e per unit frequency. */
export const H_OVER_E = H / QE;

export interface Metal {
  id: string;
  /** Work function Φ [eV] (typical polycrystalline values). */
  phi: number;
}

export const METALS: Metal[] = [
  { id: 'Cs', phi: 2.14 },
  { id: 'Na', phi: 2.28 },
  { id: 'Zn', phi: 4.33 },
  { id: 'Cu', phi: 4.65 },
  { id: 'Pt', phi: 5.65 },
];

export const metalIndex = (id: string): number => Math.max(0, METALS.findIndex((m) => m.id === id));

/**
 * Light frequencies are given in units of 10¹⁴ Hz (the control's unit); F14 converts to Hz.
 * The range covers about 181–750 nm (vacuum ultraviolet to deep red).
 */
export const F14 = 1e14;
export const F_RANGE: [number, number] = [4.0, 16.6];

/** Photon energy hf [eV] at frequency f [10¹⁴ Hz]. */
export const photonEnergy = (f: number): number => (H * f * F14) / QE;

/** Wavelength λ = c/f [nm] at frequency f [10¹⁴ Hz]. */
export const wavelength = (f: number): number => C / (f * F14) / 1e-9;

/** K_max = hf − Φ [eV], 0 below threshold. */
export const kMax = (f: number, phi: number): number => Math.max(0, photonEnergy(f) - phi);

/** Threshold (cutoff) frequency f0 = Φ/h [10¹⁴ Hz]. */
export const thresholdF = (phi: number): number => (phi * QE) / H / F14;

/** Threshold (cutoff) wavelength λ0 = hc/Φ [nm]. */
export const thresholdNm = (phi: number): number => HC_EV_NM / phi;

/** Stopping voltage V_stop = K_max/e [V]. */
export const vStop = (f: number, phi: number): number => kMax(f, phi);

/** Photon rate [1/s] for light power P [µW] at frequency f [10¹⁴ Hz]: P/(hf). */
export const photonRate = (PuW: number, f: number): number => (PuW * 1e-6) / (photonEnergy(f) * QE);

/** Saturation current [nA]: every photon with hf > Φ frees one electron (quantum yield 1). */
export const iSat = (PuW: number, f: number, phi: number): number => (photonEnergy(f) > phi ? photonRate(PuW, f) * QE * 1e9 : 0);

/**
 * Fraction of the emitted electrons that reach the collector at applied voltage V [V]
 * (V > 0: collector positive). Kinetic energies are uniform on [0, K_max] and directed at the
 * collector, so a retarding voltage removes those with K < e|V|.
 */
export function collectedFraction(V: number, kmax: number): number {
  if (V >= 0) return 1;
  if (kmax <= 0) return 0;
  return Math.max(0, 1 - -V / kmax);
}

/** Photocurrent [nA] at applied voltage V [V]. */
export const current = (V: number, PuW: number, f: number, phi: number): number => iSat(PuW, f, phi) * collectedFraction(V, kMax(f, phi));

// ------------------------------------------------------------------ classical expectation

/** Classical stopping voltage [V]: grows with intensity, independent of f (scale arbitrary: 2 V per µW). */
export const CLASSICAL_V_PER_UW = 2;
export const vStopClassical = (PuW: number): number => CLASSICAL_V_PER_UW * PuW;

/** Classical current [nA]: same saturation as observed (∝ power), no threshold, cutoff at −V_cl. */
export const currentClassical = (V: number, PuW: number, f: number): number =>
  photonRate(PuW, f) * QE * 1e9 * collectedFraction(V, vStopClassical(PuW));

/** Light spot on the emitter [m²] (1 cm²) and the area one electron draws energy from [m²] (π (0.1 nm)²). */
export const SPOT_AREA = 1e-4;
export const ATOM_AREA = Math.PI * (0.1e-9) ** 2;

/** Classical delay [s] before one electron has absorbed Φ from a uniform wave: Φ/(S A). */
export const classicalDelay = (PuW: number, phi: number): number => (phi * QE) / (((PuW * 1e-6) / SPOT_AREA) * ATOM_AREA);

