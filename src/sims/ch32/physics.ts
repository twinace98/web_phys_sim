// Ch 32: origin of atomic magnetic moments and a lattice model of magnetic materials. DOM-free.

// ------------------------------------------------------------------ orbital and spin moments (SI)

export const E_CHARGE = 1.602176634e-19;
export const M_E = 9.1093837015e-31;
export const HBAR = 1.054571817e-34;
/** Bohr radius [m] and electron speed in the first Bohr orbit [m/s]. */
export const A0 = 5.29177210903e-11;
export const V1 = 2.18769126364e6;

/** Orbit of radius r, speed v: period, equivalent current, magnetic moment, angular momentum. */
export function orbit(r: number, v: number) {
  const T = (2 * Math.PI * r) / v;
  const I = E_CHARGE / T;
  return { T, I, mu: I * Math.PI * r * r, L: M_E * v * r };
}

/** Bohr magneton eħ/2m. */
export const MU_B = (E_CHARGE * HBAR) / (2 * M_E);

// ------------------------------------------------------------------ lattice of moments

/** Critical temperature of the square-lattice model with neighbour coupling J = 1 (k_B = 1). */
export const TC = 2 / Math.log(1 + Math.SQRT2);

export interface Lattice {
  nx: number;
  ny: number;
  /** +1 (along +B) or −1, row-major. */
  s: Int8Array;
}

export function randomLattice(nx: number, ny: number, rnd: () => number): Lattice {
  const s = new Int8Array(nx * ny);
  for (let i = 0; i < s.length; i++) s[i] = rnd() < 0.5 ? 1 : -1;
  return { nx, ny, s };
}

/**
 * One Metropolis sweep (N single-moment attempts, periodic boundaries). Energy
 * E = −J Σ_⟨ij⟩ s_i s_j − h Σ s_i; J = 0 gives independent moments (paramagnet).
 */
export function sweep(L: Lattice, J: number, h: number, T: number, rnd: () => number): void {
  const { nx, ny, s } = L;
  const n = nx * ny;
  for (let k = 0; k < n; k++) {
    const i = Math.floor(rnd() * n);
    const x = i % nx;
    const y = (i - x) / nx;
    const nb = s[y * nx + ((x + 1) % nx)] + s[y * nx + ((x + nx - 1) % nx)] + s[((y + 1) % ny) * nx + x] + s[((y + ny - 1) % ny) * nx + x];
    const dE = 2 * s[i] * (J * nb + h);
    if (dE <= 0 || rnd() < Math.exp(-dE / T)) s[i] = -s[i] as 1 | -1;
  }
}

let mark = new Uint8Array(0);
let stack = new Int32Array(0);
let members = new Int32Array(0);

/**
 * One Wolff cluster move: grow a cluster of parallel neighbours (bond probability
 * 1 − e^{−2J/T}) from a random seed, then flip it with the Metropolis probability for the
 * field energy 2h Σ s. Detailed balance holds; it removes critical slowing down near T_c.
 */
export function wolff(L: Lattice, J: number, h: number, T: number, rnd: () => number): void {
  const { nx, ny, s } = L;
  const n = nx * ny;
  if (mark.length < n) {
    mark = new Uint8Array(n);
    stack = new Int32Array(n);
    members = new Int32Array(n);
  }
  const p = 1 - Math.exp((-2 * J) / T);
  const seed = Math.floor(rnd() * n);
  const s0 = s[seed];
  let top = 0;
  let size = 0;
  stack[top++] = seed;
  members[size++] = seed;
  mark[seed] = 1;
  const visit = (j: number) => {
    if (!mark[j] && s[j] === s0 && rnd() < p) {
      mark[j] = 1;
      stack[top++] = j;
      members[size++] = j;
    }
  };
  while (top > 0) {
    const i = stack[--top];
    const x = i % nx;
    const y = (i - x) / nx;
    visit(y * nx + ((x + 1) % nx));
    visit(y * nx + ((x + nx - 1) % nx));
    visit(((y + 1) % ny) * nx + x);
    visit(((y + ny - 1) % ny) * nx + x);
  }
  const dE = 2 * h * s0 * size;
  const flip = dE <= 0 || rnd() < Math.exp(-dE / T);
  for (let k = 0; k < size; k++) {
    const i = members[k];
    mark[i] = 0;
    if (flip) s[i] = -s0 as 1 | -1;
  }
}

export function magnetization(L: Lattice): number {
  let m = 0;
  for (const v of L.s) m += v;
  return m / L.s.length;
}

/** Independent two-state moments in equilibrium: M/M_s = tanh(h/T). */
export const paraM = (h: number, T: number) => Math.tanh(h / T);

/** Onsager's spontaneous magnetization of the square lattice (0 above T_c). */
export const onsagerM = (T: number) => (T >= TC ? 0 : (1 - Math.sinh(2 / T) ** -4) ** 0.125);
