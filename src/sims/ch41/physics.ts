// Ch 41: bands from N wells (finite-difference solver + Kronig-Penney limit), Fermi-Dirac
// filling, conduction in E(k), and doped silicon. DOM-free.
import { HB2M, solve, wellChain } from '../modern/eigen';

/** Boltzmann constant [eV/K]. */
export const KB = 8.617333262e-5;

// ------------------------------------------------------------------ band formation

/** Model "atom": square well of width A [nm] and depth U0 [eV]. */
export const A = 0.5;
export const U0 = 5;
/** Barrier kept outside the end wells [nm]. */
const MARGIN = 1;

/** Levels of N identical wells separated by barriers of width b (bound states only). */
export function chainLevels(N: number, b: number): number[] {
  const n = Math.round((N * (A + b) + 2 * MARGIN) / 0.004);
  return solve(wellChain(N, A, b, U0, MARGIN), n, 4 * N, HB2M, U0).E;
}

/** Kronig-Penney: cos(q(a+b)) = D(E). Allowed energies have |D| ≤ 1 (0 < E < U0). */
export function kpD(E: number, b: number, a = A, V = U0, C = HB2M): number {
  const k = Math.sqrt(E / C);
  const kap = Math.sqrt((V - E) / C);
  return Math.cos(k * a) * Math.cosh(kap * b) + ((kap * kap - k * k) / (2 * k * kap)) * Math.sin(k * a) * Math.sinh(kap * b);
}

/** Allowed bands [Emin, Emax] below U0 for an infinite chain (N → ∞). */
export function kpBands(b: number, a = A, V = U0): [number, number][] {
  const out: [number, number][] = [];
  const steps = 20000;
  let start: number | null = null;
  let prevE = 0;
  const ok = (E: number) => Math.abs(kpD(E, b, a, V)) <= 1;
  const edge = (lo: number, hi: number) => {
    // Bisection on the |D| = 1 crossing between lo (one side) and hi (other side).
    const s = ok(lo);
    for (let i = 0; i < 60; i++) {
      const m = 0.5 * (lo + hi);
      if (ok(m) === s) lo = m;
      else hi = m;
    }
    return 0.5 * (lo + hi);
  };
  for (let i = 1; i < steps; i++) {
    const E = (V * i) / steps;
    const inside = ok(E);
    if (inside && start === null) start = i === 1 ? E : edge(prevE, E);
    if (!inside && start !== null) {
      out.push([start, edge(prevE, E)]);
      start = null;
    }
    prevE = E;
  }
  if (start !== null) out.push([start, V]);
  return out;
}

// ------------------------------------------------------------------ Fermi-Dirac, intrinsic carriers

/** Fermi-Dirac occupation; a step at T = 0. */
export function fermi(E: number, mu: number, T: number): number {
  if (T <= 0) return E < mu ? 1 : E > mu ? 0 : 0.5;
  const x = (E - mu) / (KB * T);
  return x > 700 ? 0 : 1 / (1 + Math.exp(x));
}

export interface Semi {
  Eg: number;
  /** Effective densities of states at 300 K [cm⁻³]. */
  Nc: number;
  Nv: number;
}

export type MaterialId = 'metal' | 'ge' | 'si' | 'diamond';

export const MATERIALS: Record<Exclude<MaterialId, 'metal'>, Semi> = {
  ge: { Eg: 0.66, Nc: 1.04e19, Nv: 6.0e18 },
  si: { Eg: 1.12, Nc: 2.8e19, Nv: 1.04e19 },
  diamond: { Eg: 5.47, Nc: 1e19, Nv: 1e19 },
};

/** Conduction electrons in sodium [cm⁻³] (one per atom). */
export const N_METAL = 2.65e22;

export const Nc = (m: Semi, T: number) => m.Nc * (T / 300) ** 1.5;
export const Nv = (m: Semi, T: number) => m.Nv * (T / 300) ** 1.5;

/** Intrinsic carrier density n_i = √(Nc Nv) e^{−Eg/2kT} [cm⁻³]. */
export function ni(m: Semi, T: number): number {
  if (T <= 0) return 0;
  return Math.sqrt(Nc(m, T) * Nv(m, T)) * Math.exp(-m.Eg / (2 * KB * T));
}

/** Intrinsic Fermi level measured from mid-gap [eV]. */
export const intrinsicMu = (m: Semi, T: number) => (T <= 0 ? 0 : 0.5 * KB * T * Math.log(m.Nv / m.Nc));

/**
 * Number of thermally excited electrons drawn in the conduction band (holes alike).
 * Logarithmic in n_i so the steep rise stays visible: about 4 for Si at 300 K, 0 for diamond.
 */
export function shownPairs(n: number, max = 16): number {
  return Math.min(max, Math.max(0, Math.round(2 * Math.log10(1 + n / 1e8))));
}

// ------------------------------------------------------------------ conduction in E(k)

/** Hopping energy t [eV]: E(k) = −2t cos(ka). */
export const HOP = 1;
export const NK = 32;
/** Scattering time [fs]. */
export const TAU = 10;

export const bandE = (ka: number) => -2 * HOP * Math.cos(ka);
/** Group velocity in units of 2ta/ħ. */
export const bandV = (ka: number) => Math.sin(ka);

export type Filling = 'half' | 'nearly' | 'full';

/** Grid k values (ka) in [−π, π). */
export const kGrid = (): number[] => Array.from({ length: NK }, (_, j) => -Math.PI + ((j + 0.5) * 2 * Math.PI) / NK);

/** Occupied grid indices in the ground state: the lowest-energy states. */
export function occupied(f: Filling): number[] {
  const ks = kGrid();
  const order = ks.map((k, j) => ({ j, E: bandE(k) })).sort((a, b) => a.E - b.E || a.j - b.j);
  const n = f === 'half' ? NK / 2 : f === 'nearly' ? NK - 2 : NK;
  return order.slice(0, n).map((o) => o.j);
}

export const wrap = (k: number) => {
  const r = (k + Math.PI) % (2 * Math.PI);
  return (r < 0 ? r + 2 * Math.PI : r) - Math.PI;
};

/**
 * Rigid shift δ of the occupied k states with drive F and relaxation τ: dδ/dt = −F − δ/τ.
 * Exact solution from δ(0) = d0 over a time step h.
 */
export function shiftStep(d0: number, F: number, h: number, tau = TAU): number {
  const dss = -F * tau;
  return dss + (d0 - dss) * Math.exp(-h / tau);
}

/** Net current along the field, in units of e·2ta/ħ per state: J = −Σ v (electrons carry −e). */
export function current(occ: number[], delta: number): number {
  const ks = kGrid();
  let s = 0;
  for (const j of occ) s += bandV(wrap(ks[j] + delta));
  return -s / NK;
}

// ------------------------------------------------------------------ doped silicon

export const SI = MATERIALS.si;
/** Donor (P) and acceptor (B) ionisation energies in Si [eV]. */
export const ED = 0.045;
export const EA = 0.045;

export interface Carriers {
  n: number;
  p: number;
  /** Ionised donors / acceptors [cm⁻³]. */
  Dp: number;
  Am: number;
  /** Fermi level from the valence-band edge [eV]. */
  mu: number;
}

/**
 * Charge neutrality n + N_A⁻ = p + N_D⁺ in Boltzmann statistics, solved for the Fermi level
 * by bisection. Energies from E_v = 0; E_c = E_g.
 */
export function carriers(T: number, Nd: number, Na: number, m: Semi = SI): Carriers {
  const kT = KB * T;
  const Ec = m.Eg;
  const nc = Nc(m, T);
  const nv = Nv(m, T);
  const at = (mu: number): Carriers => {
    const n = nc * Math.exp(-(Ec - mu) / kT);
    const p = nv * Math.exp(-mu / kT);
    const Dp = Nd / (1 + 2 * Math.exp((mu - (Ec - ED)) / kT));
    const Am = Na / (1 + 4 * Math.exp((EA - mu) / kT));
    return { n, p, Dp, Am, mu };
  };
  let lo = -0.5;
  let hi = Ec + 0.5;
  for (let i = 0; i < 200; i++) {
    const mid = 0.5 * (lo + hi);
    const c = at(mid);
    // Net positive charge falls as mu rises.
    if (c.p + c.Dp - c.n - c.Am > 0) lo = mid;
    else hi = mid;
  }
  return at(0.5 * (lo + hi));
}
