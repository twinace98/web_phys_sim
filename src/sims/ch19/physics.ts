// Ch 19: 2D hard-disk gas in a square box. DOM-free.
// Units: length nm, time ps, velocity nm/ps (= km/s). Disks are helium-like.
// Impulse in pN·ps (1e-24 N·s), force in pN, 2D pressure (force per wall length) in mN/m = pN/nm.
import type { Rng } from '../../core/rng';

export const KB = 1.380649e-23;
/** Helium atom mass [kg]. */
export const MASS = 6.646e-27;
/** Disk diameter [nm] (helium kinetic diameter). */
export const SIGMA = 0.26;
/** Impulse of one wall bounce per unit |v_x| [pN·ps per nm/ps]: 2 m v_x. */
export const J_PER_V = (2 * MASS * 1e3) / 1e-24;

/** Standard deviation of one velocity component [nm/ps]: √(kT/m). */
export const sigmaV = (T: number) => Math.sqrt((KB * T) / MASS) / 1e3;

/** Ideal 2D gas: p = NkT/A [mN/m], L in nm. */
export const idealPressure = (N: number, L: number, T: number) => ((N * KB * T) / (L * 1e-9) ** 2) * 1e3;
/** Mean force on one wall [pN] = p L. */
export const idealForce = (N: number, L: number, T: number) => idealPressure(N, L, T) * L;

/** 2D Maxwell–Boltzmann speed distribution f(v) = (m v / kT) exp(−m v² / 2kT), v in nm/ps. */
export function speedPdf(v: number, T: number): number {
  const s2 = sigmaV(T) ** 2;
  return (v / s2) * Math.exp((-v * v) / (2 * s2));
}

/** Mean speed in 2D: √(πkT / 2m). */
export const meanSpeed = (T: number) => Math.sqrt(Math.PI / 2) * sigmaV(T);

export interface Hit {
  t: number;
  y: number;
  /** Impulse 2 m |v_x| [pN·ps]. */
  J: number;
}

export interface Gas {
  N: number;
  L: number;
  x: Float64Array;
  y: Float64Array;
  vx: Float64Array;
  vy: Float64Array;
  /** Cumulative impulse delivered to the right wall [pN·ps]. */
  J: number;
  /** Right-wall bounces, oldest first (trimmed by the caller). */
  hits: Hit[];
  t: number;
  // collision grid
  cell: number;
  nc: number;
  head: Int32Array;
  next: Int32Array;
}

/**
 * N disks at random non-overlapping positions. 'equal': every disk has speed √(2kT/m) in a
 * random direction; 'mb': Gaussian components rescaled so the total kinetic energy is exactly NkT.
 */
export function initGas(N: number, L: number, T: number, mode: 'equal' | 'mb', rng: Rng): Gas {
  const x = new Float64Array(N);
  const y = new Float64Array(N);
  const vx = new Float64Array(N);
  const vy = new Float64Array(N);
  const r = SIGMA / 2;
  for (let i = 0; i < N; i++) {
    for (let tries = 0; tries < 2000; tries++) {
      x[i] = r + (L - 2 * r) * rng.next();
      y[i] = r + (L - 2 * r) * rng.next();
      let ok = true;
      for (let j = 0; j < i && ok; j++) ok = (x[i] - x[j]) ** 2 + (y[i] - y[j]) ** 2 > (1.05 * SIGMA) ** 2;
      if (ok) break;
    }
  }
  const s = sigmaV(T);
  if (mode === 'equal') {
    const v0 = Math.SQRT2 * s;
    for (let i = 0; i < N; i++) {
      const a = 2 * Math.PI * rng.next();
      vx[i] = v0 * Math.cos(a);
      vy[i] = v0 * Math.sin(a);
    }
  } else {
    let k = 0;
    for (let i = 0; i < N; i++) {
      vx[i] = s * rng.normal();
      vy[i] = s * rng.normal();
      k += vx[i] ** 2 + vy[i] ** 2;
    }
    const f = Math.sqrt((2 * N * s * s) / k);
    for (let i = 0; i < N; i++) {
      vx[i] *= f;
      vy[i] *= f;
    }
  }
  const nc = Math.max(1, Math.min(64, Math.floor(L / SIGMA)));
  return { N, L, x, y, vx, vy, J: 0, hits: [], t: 0, cell: L / nc, nc, head: new Int32Array(nc * nc), next: new Int32Array(N) };
}

/** Elastic collision of equal disks i, j if they overlap and approach. Returns true if they collided. */
export function collide(g: Gas, i: number, j: number): boolean {
  const dx = g.x[j] - g.x[i];
  const dy = g.y[j] - g.y[i];
  const d2 = dx * dx + dy * dy;
  if (d2 >= SIGMA * SIGMA || d2 === 0) return false;
  const dvx = g.vx[j] - g.vx[i];
  const dvy = g.vy[j] - g.vy[i];
  const dot = dvx * dx + dvy * dy;
  if (dot >= 0) return false;
  // Exchange the velocity components along the line of centres.
  const k = dot / d2;
  g.vx[i] += k * dx;
  g.vy[i] += k * dy;
  g.vx[j] -= k * dx;
  g.vy[j] -= k * dy;
  return true;
}

/** Advance by h: free flight, wall bounces (right-wall impulses recorded), disk collisions. */
export function stepGas(g: Gas, h: number): void {
  const { N, L, x, y, vx, vy } = g;
  const r = SIGMA / 2;
  g.t += h;
  for (let i = 0; i < N; i++) {
    x[i] += vx[i] * h;
    y[i] += vy[i] * h;
    if (x[i] > L - r) {
      if (vx[i] > 0) {
        const J = J_PER_V * vx[i];
        g.J += J;
        g.hits.push({ t: g.t, y: y[i], J });
        vx[i] = -vx[i];
      }
      x[i] = 2 * (L - r) - x[i];
    } else if (x[i] < r) {
      if (vx[i] < 0) vx[i] = -vx[i];
      x[i] = 2 * r - x[i];
    }
    if (y[i] > L - r) {
      if (vy[i] > 0) vy[i] = -vy[i];
      y[i] = 2 * (L - r) - y[i];
    } else if (y[i] < r) {
      if (vy[i] < 0) vy[i] = -vy[i];
      y[i] = 2 * r - y[i];
    }
  }
  // Cell list: each disk only meets disks in its own and the 8 neighbouring cells.
  const { nc, cell, head, next } = g;
  head.fill(-1);
  for (let i = 0; i < N; i++) {
    const cx = Math.min(nc - 1, Math.max(0, Math.floor(x[i] / cell)));
    const cy = Math.min(nc - 1, Math.max(0, Math.floor(y[i] / cell)));
    const c = cy * nc + cx;
    next[i] = head[c];
    head[c] = i;
  }
  for (let i = 0; i < N; i++) {
    const cx = Math.min(nc - 1, Math.max(0, Math.floor(x[i] / cell)));
    const cy = Math.min(nc - 1, Math.max(0, Math.floor(y[i] / cell)));
    for (let oy = -1; oy <= 1; oy++) {
      const yy = cy + oy;
      if (yy < 0 || yy >= nc) continue;
      for (let ox = -1; ox <= 1; ox++) {
        const xx = cx + ox;
        if (xx < 0 || xx >= nc) continue;
        for (let j = head[yy * nc + xx]; j >= 0; j = next[j]) if (j > i) collide(g, i, j);
      }
    }
  }
}

export function kinetic(g: Gas): number {
  let k = 0;
  for (let i = 0; i < g.N; i++) k += g.vx[i] ** 2 + g.vy[i] ** 2;
  return 0.5 * MASS * 1e6 * k;
}

export function speeds(g: Gas): number[] {
  const out: number[] = [];
  for (let i = 0; i < g.N; i++) out.push(Math.hypot(g.vx[i], g.vy[i]));
  return out;
}

// ------------------------------------------------------------------ pressure estimates

/** Moving-average window for the force on the wall [ps]. */
export const WIN = 10;

/** Pressure from the impulses of the last WIN ps [mN/m]; before t = WIN the window still counts WIN ps. */
export function pWin(g: Gas): number {
  let j = 0;
  for (const h of g.hits) if (h.t > g.t - WIN) j += h.J;
  return j / (g.L * WIN);
}

/** Mean pressure since t = 0, J / (L t) [mN/m]; the first WIN ps are divided by WIN so a lone early bounce is no spike. */
export const pCum = (g: Gas) => g.J / (g.L * Math.max(g.t, WIN));

/** Expected right-wall bounces per ps in equilibrium: N ⟨|v_x|⟩ / 2L with ⟨|v_x|⟩ = √(2kT/πm). */
export const hitRate = (N: number, L: number, T: number) => (N * sigmaV(T) * Math.sqrt(2 / Math.PI)) / (2 * L);

/**
 * Relative standard deviation of the impulse summed over a time span with n expected bounces:
 * Poisson count times a flux-weighted |v_x| (⟨v²⟩/⟨v⟩² = 4/π) gives √(4/π) / √n.
 */
export const impulseCv = (n: number) => Math.sqrt(4 / Math.PI / Math.max(n, 1e-9));

/**
 * Top of the pressure plots: ideal value plus the finite-size excess, four standard deviations of a
 * WIN-ps window, and a Poisson tail term for windows with only a few bounces.
 */
export function pressureTop(N: number, L: number, T: number): number {
  const n = hitRate(N, L, T) * WIN;
  return idealPressure(N, L, T) * Math.max(2, 1.2 + 4 * impulseCv(n) + 1.5 / n);
}

/** Top of the cumulative-impulse plot over a run of tEnd ps. */
export const impulseTop = (N: number, L: number, T: number, tEnd: number) =>
  idealForce(N, L, T) * tEnd * Math.max(1.3, 1.15 + 3.5 * impulseCv(hitRate(N, L, T) * tEnd));
