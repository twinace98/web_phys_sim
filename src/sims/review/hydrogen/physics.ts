// Hydrogen atom: Bohr energy levels, transition photons, series. DOM-free.
// Energies use the hydrogen Rydberg constant R_H = R∞/(1 + mₑ/mₚ) (reduced-mass correction),
// so the vacuum wavelengths match measured lines; air wavelengths follow from Edlén's formula.

/** hc [eV·nm]. */
export const HC_EVNM = 1239.841984;
/** Rydberg constant for infinite nuclear mass [1/m]. */
export const R_INF = 10973731.568;
/** mₑ/mₚ. */
export const ME_MP = 1 / 1836.15267343;
/** Rydberg constant for hydrogen [1/m]. */
export const R_H = R_INF / (1 + ME_MP);
/** Ionization energy of hydrogen R_H·hc [eV] (13.598 eV ≈ 13.6 eV). */
export const E_ION = R_H * 1e-9 * HC_EVNM;
/** Bohr radius [nm]. */
export const A0_NM = 0.0529177211;

/** Level energy E_n = −13.6 eV/n² (n = Infinity → 0, the ionization limit). */
export const energy = (n: number): number => (Number.isFinite(n) ? -E_ION / (n * n) : 0);

/** Change of the atom's energy in the transition n_i → n_f: E_f − E_i (< 0 for emission). */
export const deltaAtom = (ni: number, nf: number): number => energy(nf) - energy(ni);

/** Photon energy hf = |E_i − E_f| = 13.6 |1/n_f² − 1/n_i²| eV. */
export const photonEnergy = (ni: number, nf: number): number => Math.abs(deltaAtom(ni, nf));

/** Emission when the electron drops to a lower level (n_f < n_i). */
export const isEmission = (ni: number, nf: number): boolean => nf < ni;

/** 1/λ = R_H |1/n_f² − 1/n_i²| [1/m]. */
export const inverseWavelength = (ni: number, nf: number): number => R_H * Math.abs(1 / (nf * nf) - (Number.isFinite(ni) ? 1 / (ni * ni) : 0));

/** Vacuum wavelength [nm] (Infinity when n_i = n_f). */
export const lambdaVac = (ni: number, nf: number): number => 1e9 / inverseWavelength(ni, nf);

/** Series limit (n_i → ∞) of the series ending on n_low [nm, vacuum]. */
export const seriesLimit = (nLow: number): number => lambdaVac(Infinity, nLow);

/**
 * Refractive index of standard dry air (15 °C, 101.325 kPa) at a vacuum wavelength [nm],
 * Edlén (1966). Valid in the near UV, visible and near IR (about 200–2000 nm).
 */
export function airIndex(lambdaNm: number): number {
  const s2 = (1000 / lambdaNm) ** 2; // σ² [1/µm²]
  return 1 + 1e-8 * (8342.13 + 2406030 / (130 - s2) + 15997 / (38.9 - s2));
}

/** Air wavelength [nm] for λ ≥ 200 nm (the value spectroscopic tables quote there). */
export const lambdaAir = (ni: number, nf: number): number => {
  const v = lambdaVac(ni, nf);
  return v / airIndex(v);
};

/** Bohr orbit radius r_n = n² a₀ [nm]. */
export const bohrRadius = (n: number): number => n * n * A0_NM;

export type SeriesId = 'lyman' | 'balmer' | 'paschen' | 'brackett';

/** Lower level of each series. */
export const SERIES: Record<SeriesId, number> = { lyman: 1, balmer: 2, paschen: 3, brackett: 4 };

/** Upper levels n_low + 1 … n_low + count of a series. */
export const seriesUppers = (nLow: number, count: number): number[] => Array.from({ length: count }, (_, k) => nLow + 1 + k);
