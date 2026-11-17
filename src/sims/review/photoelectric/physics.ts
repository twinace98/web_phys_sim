// Photoelectric effect: photon energy, stopping voltage, photocurrent model, the stopping-voltage
// line fit, and the classical (wave) expectations used for contrast. Units: nm, eV, V, Hz, nA.

/** Planck constant [J s], elementary charge [C], speed of light [m/s] (exact SI values). */
export const H = 6.62607015e-34;
export const QE = 1.602176634e-19;
export const C = 299792458;
/** hc [eV nm]. */
export const HC_EV_NM = (H * C) / QE / 1e-9;
/** h/e [V s]: slope of the V_stop–f line. */
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

/** Photon energy hf [eV] at wavelength λ [nm]. */
export const photonEnergy = (nm: number): number => HC_EV_NM / nm;

/** Frequency f [Hz] at wavelength λ [nm]. */
export const frequency = (nm: number): number => C / (nm * 1e-9);

/** K_max = hf − Φ [eV], 0 below threshold. */
export const kMax = (nm: number, phi: number): number => Math.max(0, photonEnergy(nm) - phi);

/** Threshold (cutoff) wavelength λ0 = hc/Φ [nm]. */
export const thresholdNm = (phi: number): number => HC_EV_NM / phi;

/** Threshold frequency f0 = Φ/h [Hz]. */
export const thresholdHz = (phi: number): number => (phi * QE) / H;

/** Stopping voltage V_stop = K_max/e [V]. */
export const vStop = (nm: number, phi: number): number => kMax(nm, phi);

/** Photon rate [1/s] for light power P [µW] at λ [nm]: P/(hf). */
export const photonRate = (PuW: number, nm: number): number => (PuW * 1e-6) / (photonEnergy(nm) * QE);

/** Saturation current [nA]: every photon with hf > Φ frees one electron (quantum yield 1). */
export const iSat = (PuW: number, nm: number, phi: number): number => (photonEnergy(nm) > phi ? photonRate(PuW, nm) * QE * 1e9 : 0);

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
export const current = (V: number, PuW: number, nm: number, phi: number): number => iSat(PuW, nm, phi) * collectedFraction(V, kMax(nm, phi));

// ------------------------------------------------------------------ classical expectation

/** Classical stopping voltage [V]: grows with intensity, independent of f (scale arbitrary: 2 V per µW). */
export const CLASSICAL_V_PER_UW = 2;
export const vStopClassical = (PuW: number): number => CLASSICAL_V_PER_UW * PuW;

/** Classical current [nA]: same saturation as observed (∝ power), no threshold, cutoff at −V_cl. */
export const currentClassical = (V: number, PuW: number, nm: number): number =>
  photonRate(PuW, nm) * QE * 1e9 * collectedFraction(V, vStopClassical(PuW));

/** Light spot on the emitter [m²] (1 cm²) and the area one electron draws energy from [m²] (π (0.1 nm)²). */
export const SPOT_AREA = 1e-4;
export const ATOM_AREA = Math.PI * (0.1e-9) ** 2;

/** Classical delay [s] before one electron has absorbed Φ from a uniform wave: Φ/(S A). */
export const classicalDelay = (PuW: number, phi: number): number => (phi * QE) / (((PuW * 1e-6) / SPOT_AREA) * ATOM_AREA);

// ------------------------------------------------------------------ measured data

/** Max number of measured points kept (oldest dropped first). */
export const MAX_POINTS = 16;

/** Measured point: wavelength [nm] and metal index; its (f, V_stop) follow from the model. */
export interface Point {
  nm: number;
  m: number;
}

/** Points stored in a flat array [nm0, m0, nm1, m1, …]; nm = 0 marks an empty slot. */
export function readPoints(D: readonly number[]): Point[] {
  const out: Point[] = [];
  for (let i = 0; i + 1 < D.length; i += 2) {
    const nm = D[i];
    const m = Math.round(D[i + 1]);
    if (nm > 0 && m >= 0 && m < METALS.length) out.push({ nm, m });
  }
  return out;
}

export function writePoints(pts: readonly Point[]): number[] {
  const D = new Array<number>(2 * MAX_POINTS).fill(0);
  pts.slice(-MAX_POINTS).forEach((q, i) => {
    D[2 * i] = q.nm;
    D[2 * i + 1] = q.m;
  });
  return D;
}

export const emptyPoints = (): number[] => writePoints([]);

/**
 * Add a measurement. Returns null when nothing changes: below threshold (no current, no stopping
 * voltage to measure) or the same wavelength and metal already measured.
 */
export function addPoint(D: readonly number[], nm: number, m: number): number[] | null {
  if (kMax(nm, METALS[m].phi) <= 0) return null;
  const pts = readPoints(D);
  if (pts.some((q) => q.nm === nm && q.m === m)) return null;
  return writePoints([...pts, { nm, m }]);
}

export interface Fit {
  /** Common slope [V s] of all metals' lines. */
  slope: number;
  /** Intercept [V] per metal index (NaN for a metal without a line). */
  intercept: number[];
  /** Metals with at least two points at different f (they get a line). */
  fitted: boolean[];
}

/**
 * Least-squares fit of V_stop = s f + b_m: one slope shared by all metals (the slope is h/e for
 * every metal), one intercept per metal (−Φ/e). Points as (f [Hz], V_stop [V], metal).
 * Null until some metal has two points at different frequencies.
 */
export function fitLines(pts: readonly { f: number; v: number; m: number }[]): Fit | null {
  const n = METALS.length;
  const groups: { f: number; v: number }[][] = Array.from({ length: n }, () => []);
  for (const q of pts) groups[q.m]?.push(q);
  const fitted = groups.map((g) => g.length >= 2 && g.some((q) => q.f !== g[0].f));
  let sxy = 0;
  let sxx = 0;
  const mean = groups.map((g) => {
    if (!g.length) return { f: NaN, v: NaN };
    return { f: g.reduce((a, q) => a + q.f, 0) / g.length, v: g.reduce((a, q) => a + q.v, 0) / g.length };
  });
  groups.forEach((g, m) => {
    if (!fitted[m]) return;
    // Centred sums: f ~ 10¹⁵ Hz, so subtract the mean before squaring.
    for (const q of g) {
      sxy += (q.f - mean[m].f) * (q.v - mean[m].v);
      sxx += (q.f - mean[m].f) ** 2;
    }
  });
  if (!(sxx > 0)) return null;
  const slope = sxy / sxx;
  const intercept = mean.map((c, m) => (fitted[m] ? c.v - slope * c.f : NaN));
  return { slope, intercept, fitted };
}

/** (f, V_stop) of stored points. */
export const pointValues = (pts: readonly Point[]) => pts.map((q) => ({ f: frequency(q.nm), v: vStop(q.nm, METALS[q.m].phi), m: q.m }));
