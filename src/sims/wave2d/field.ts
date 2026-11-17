// 2D scalar wave behind a barrier with apertures (Ch 35, 36). DOM-free.
//
// A plane wave cos(kx − ωt) comes from the left and reaches the barrier (x = 0) at t_b.
// Each aperture is a row of Huygens point sources at x = 0. Behind the barrier
//   ψ(P, t) = Σ_j A_j cos(k r_j − ω t),  A_j ∝ r_j^{-1/2}  (cylindrical waves in 2D),
// so every cell only needs C = Σ A_j cos k r_j and S = Σ A_j sin k r_j:
//   ψ = C cos ωt + S sin ωt.
// A wavefront mask per aperture switches each contribution on when the wave arrives.
// Lengths in μm, times in fs.

/** Speed of light [μm/fs]. */
export const C_LIGHT = 0.299792458;

export interface Aperture {
  /** Centre height [μm]. */
  yc: number;
  /** Width [μm]; 0 → a single point source. */
  w: number;
}

export interface WaveSetup {
  /** Wavelength [μm]. */
  lambda: number;
  apertures: Aperture[];
  /** Plane-wave front position at t = 0 (x < 0). */
  xL: number;
  /** Rendered region: x from xL to x1, y from y0 to y1. */
  x1: number;
  y0: number;
  y1: number;
  /** Screen position (x) and number of samples along it. */
  screenX: number;
  screenN: number;
  /** Upper bound on rendered cells. */
  maxCells?: number;
}

/** Source heights for one aperture: centres of equal sub-intervals, spacing ≤ λ/2 (no spurious orders). */
export function sourcesOf(ap: Aperture, lambda: number): number[] {
  if (ap.w <= 0) return [ap.yc];
  const n = Math.max(2, Math.ceil(ap.w / (lambda / 2)));
  const out: number[] = [];
  for (let i = 0; i < n; i++) out.push(ap.yc + ap.w / 2 - ((i + 0.5) * ap.w) / n);
  return out;
}

/** Distance from (x, y) to the aperture segment at x = 0. */
function distToAperture(ap: Aperture, x: number, y: number): number {
  const lo = ap.yc - ap.w / 2;
  const hi = ap.yc + ap.w / 2;
  const dy = y < lo ? lo - y : y > hi ? y - hi : 0;
  return Math.hypot(x, dy);
}

interface Group {
  C: Float32Array;
  S: Float32Array;
  /** Distance to the aperture: the front arrives at t_b + R / c. */
  R: Float32Array;
}

export class WaveField {
  readonly k: number;
  readonly omega: number;
  /** Time the plane wave reaches the barrier. */
  readonly tb: number;
  readonly nx: number;
  readonly ny: number;
  readonly dx: number;
  readonly dy: number;
  /** First column with x ≥ 0. */
  readonly i0: number;
  readonly sources: number[][];
  private groups: Group[] = [];
  /** Σ A_j per cell: largest possible |ψ|. */
  private norm: Float32Array;
  /** Largest steady amplitude in each column behind the barrier: the crest-line brightness scale. */
  private colMax: Float32Array;
  readonly screenY: Float64Array;
  private screen: { C: Float64Array; S: Float64Array; R: Float64Array }[] = [];

  constructor(readonly s: WaveSetup) {
    const { lambda } = s;
    this.k = (2 * Math.PI) / lambda;
    this.omega = this.k * C_LIGHT;
    this.tb = -s.xL / C_LIGHT;
    const W = s.x1 - s.xL;
    const H = s.y1 - s.y0;
    // λ/4: four samples per wavelength are enough to place the crest lines by linear interpolation.
    let cell = lambda / 4;
    const max = s.maxCells ?? 110000;
    if ((W / cell) * (H / cell) > max) cell = Math.sqrt((W * H) / max);
    this.nx = Math.ceil(W / cell);
    this.ny = Math.ceil(H / cell);
    this.dx = W / this.nx;
    this.dy = H / this.ny;
    this.i0 = Math.ceil(-s.xL / this.dx - 0.5);
    this.sources = s.apertures.map((ap) => sourcesOf(ap, lambda));
    const r0 = lambda;
    const amp = (r: number, n: number) => Math.sqrt(r0 / Math.max(r, r0 / 4)) / n;

    const cols = this.nx - this.i0;
    const cells = cols * this.ny;
    this.norm = new Float32Array(cells);
    const k = this.k;
    const rMin = r0 / 4;
    // Mirror-symmetric set of apertures in a box symmetric about y = 0: compute the upper half,
    // fill the lower half from the mirror aperture (halves the set-up time).
    const mirror = s.apertures.map((ap) => s.apertures.findIndex((b) => Math.abs(b.yc + ap.yc) < 1e-9 && Math.abs(b.w - ap.w) < 1e-9));
    const sym = Math.abs(s.y0 + s.y1) < 1e-9 && mirror.every((m) => m >= 0);
    const rows = sym ? Math.ceil(this.ny / 2) : this.ny;
    for (const _ of s.apertures) this.groups.push({ C: new Float32Array(cells), S: new Float32Array(cells), R: new Float32Array(cells) });
    s.apertures.forEach((ap, g) => {
      const ys = this.sources[g];
      const n = ys.length;
      const grp = this.groups[g];
      for (let j = 0; j < rows; j++) {
        const y = s.y1 - (j + 0.5) * this.dy;
        for (let i = 0; i < cols; i++) {
          const x = s.xL + (i + this.i0 + 0.5) * this.dx;
          const idx = j * cols + i;
          let c = 0;
          let sn = 0;
          let a = 0;
          for (const yj of ys) {
            const dy = y - yj;
            const r = Math.sqrt(x * x + dy * dy);
            const A = Math.sqrt(r0 / (r > rMin ? r : rMin)) / n;
            const ph = k * r;
            c += A * Math.cos(ph);
            sn += A * Math.sin(ph);
            a += A;
          }
          grp.C[idx] = c;
          grp.S[idx] = sn;
          grp.R[idx] = distToAperture(ap, x, y);
          this.norm[idx] += a;
        }
      }
    });
    if (sym) {
      for (let j = rows; j < this.ny; j++) {
        const src = (this.ny - 1 - j) * cols;
        const dst = j * cols;
        s.apertures.forEach((_, g) => {
          const from = this.groups[mirror[g]];
          const to = this.groups[g];
          to.C.set(from.C.subarray(src, src + cols), dst);
          to.S.set(from.S.subarray(src, src + cols), dst);
          to.R.set(from.R.subarray(src, src + cols), dst);
        });
        this.norm.set(this.norm.subarray(src, src + cols), dst);
      }
    }

    // Steady amplitude |Σ (C, S)| per cell; its maximum over each column (one distance from the barrier).
    this.colMax = new Float32Array(cols);
    for (let j = 0; j < this.ny; j++) {
      for (let i = 0; i < cols; i++) {
        const idx = j * cols + i;
        let c = 0;
        let sn = 0;
        for (const g of this.groups) {
          c += g.C[idx];
          sn += g.S[idx];
        }
        const a = Math.hypot(c, sn);
        if (a > this.colMax[i]) this.colMax[i] = a;
      }
    }

    const N = s.screenN;
    this.screenY = new Float64Array(N);
    for (let i = 0; i < N; i++) this.screenY[i] = s.y0 + ((i + 0.5) * H) / N;
    s.apertures.forEach((ap, g) => {
      const ys = this.sources[g];
      const n = ys.length;
      const sc = { C: new Float64Array(N), S: new Float64Array(N), R: new Float64Array(N) };
      for (let i = 0; i < N; i++) {
        const y = this.screenY[i];
        for (const yj of ys) {
          const r = Math.hypot(s.screenX, y - yj);
          const A = amp(r, n);
          sc.C[i] += A * Math.cos(this.k * r);
          sc.S[i] += A * Math.sin(this.k * r);
        }
        sc.R[i] = distToAperture(ap, s.screenX, y);
      }
      this.screen.push(sc);
    });
  }

  get period(): number {
    return (2 * Math.PI) / this.omega;
  }

  /** 0 before the front reaches distance R from an aperture, 1 after; smooth over λ/2. */
  private mask(t: number, R: number): number {
    const m = ((t - this.tb) * C_LIGHT - R) / (0.5 * this.s.lambda);
    return m <= 0 ? 0 : m >= 1 ? 1 : m;
  }

  /** ψ on the screen samples at time t. */
  screenPsi(t: number, out: Float64Array): void {
    const cw = Math.cos(this.omega * t);
    const sw = Math.sin(this.omega * t);
    out.fill(0);
    for (const g of this.screen) {
      for (let i = 0; i < out.length; i++) {
        const m = this.mask(t, g.R[i]);
        if (m > 0) out[i] += m * (g.C[i] * cw + g.S[i] * sw);
      }
    }
  }

  /** Steady time-averaged intensity ⟨ψ²⟩ = (C² + S²)/2 on the screen. */
  screenSteady(): Float64Array {
    const N = this.screenY.length;
    const out = new Float64Array(N);
    for (let i = 0; i < N; i++) {
      let c = 0;
      let s = 0;
      for (const g of this.screen) {
        c += g.C[i];
        s += g.S[i];
      }
      out[i] = (c * c + s * s) / 2;
    }
    return out;
  }

  /** Time the front reaches the screen point nearest to the apertures. */
  screenArrival(): number {
    let r = Infinity;
    for (const g of this.screen) for (const v of g.R) r = Math.min(r, v);
    return this.tb + r / C_LIGHT;
  }

  /**
   * Wavefronts at time t: the crest lines, where the phase of ψ is 0 (mod 2π).
   * With ψ = C cos ωt + S sin ωt = A cos(φ − ωt), the quadrature ψq = S cos ωt − C sin ωt
   * = A sin(φ − ωt) is zero on crests (ψ > 0) and troughs (ψ < 0). Marching squares on ψq,
   * keeping the crossings where ψ > 0, gives the crest lines behind the barrier; each segment
   * carries the local amplitude over the brightest steady amplitude at the same distance from
   * the barrier (its column): 1 in the main beam, 0 on nodal lines.
   * In front of the barrier the incident plane wave cos(kx − ωt) has straight crests at
   * kx − ωt = 2πn, up to the advancing front, each with its front ramp a (0 at the front, 1 from λ/2 behind it).
   */
  crests(t: number): { plane: { x: number; a: number }[]; segs: number[] } {
    const { nx, ny, i0, s } = this;
    const cw = Math.cos(this.omega * t);
    const sw = Math.sin(this.omega * t);
    const cols = nx - i0;
    const front = s.xL + C_LIGHT * t;

    // Crests move with the front (both at c), so a crest can sit exactly on it for good (e.g.
    // x_L a whole number of wavelengths). A hard x < front cut then flips with rounding from
    // frame to frame; the same λ/2 ramp as the field behind the barrier keeps it steady (0 there).
    const plane: { x: number; a: number }[] = [];
    for (let n = Math.ceil((this.k * s.xL - this.omega * t) / (2 * Math.PI)); ; n++) {
      const x = (2 * Math.PI * n + this.omega * t) / this.k;
      if (x >= 0 || x >= front) break;
      const a = Math.min(1, (front - x) / (0.5 * s.lambda));
      if (a > 0.05) plane.push({ x, a });
    }

    const P = new Float32Array(cols * ny);
    const Q = new Float32Array(cols * ny);
    const Wt = new Float32Array(cols * ny);
    const ng = this.groups.length;
    for (let idx = 0; idx < cols * ny; idx++) {
      let psi = 0;
      let q = 0;
      for (let gI = 0; gI < ng; gI++) {
        const g = this.groups[gI];
        const m = this.mask(t, g.R[idx]);
        if (m > 0) {
          psi += m * (g.C[idx] * cw + g.S[idx] * sw);
          q += m * (g.S[idx] * cw - g.C[idx] * sw);
        }
      }
      P[idx] = psi;
      Q[idx] = q;
      const n = this.colMax[idx % cols];
      Wt[idx] = n > 0 ? Math.min(1, Math.sqrt(psi * psi + q * q) / n) : 0;
    }

    const segs: number[] = [];
    // Crossing points of the current cell (up to 4 edges × 2 coordinates).
    const pts = new Float64Array(8);
    let np = 0;
    const edge = (q0: number, q1: number, x0: number, y0: number, x1: number, y1: number) => {
      if (q0 < 0 === q1 < 0) return;
      const u = q0 / (q0 - q1);
      pts[np++] = x0 + (x1 - x0) * u;
      pts[np++] = y0 + (y1 - y0) * u;
    };
    const x0g = s.xL + (i0 + 0.5) * this.dx;
    const y0g = s.y1 - 0.5 * this.dy;
    for (let j = 0; j < ny - 1; j++) {
      for (let i = 0; i < cols - 1; i++) {
        const a = j * cols + i;
        const b = a + 1;
        const c = a + cols + 1;
        const d = a + cols;
        const qa = Q[a];
        const qb = Q[b];
        const qc = Q[c];
        const qd = Q[d];
        // Most cells have no zero of ψq: skip them before anything else.
        const neg = (qa < 0 ? 1 : 0) + (qb < 0 ? 1 : 0) + (qc < 0 ? 1 : 0) + (qd < 0 ? 1 : 0);
        if (neg === 0 || neg === 4) continue;
        if (P[a] + P[b] + P[c] + P[d] <= 0) continue;
        const w = 0.25 * (Wt[a] + Wt[b] + Wt[c] + Wt[d]);
        if (w < 0.03) continue;
        np = 0;
        // Edges a→b (top), b→c (right), d→c (bottom), a→d (left); grid row j is at the top.
        const xa = x0g + i * this.dx;
        const xb = xa + this.dx;
        const ya = y0g - j * this.dy;
        const yd = ya - this.dy;
        edge(qa, qb, xa, ya, xb, ya);
        edge(qb, qc, xb, ya, xb, yd);
        edge(qd, qc, xa, yd, xb, yd);
        edge(qa, qd, xa, ya, xa, yd);
        for (let k = 0; k + 3 < np; k += 4) segs.push(pts[k], pts[k + 1], pts[k + 2], pts[k + 3], w);
      }
    }
    return { plane, segs };
  }
}

/** Approximate sRGB of a visible wavelength [nm] (piecewise linear, darkened for a white page). */
export function wavelengthRGB(nm: number): [number, number, number] {
  let r = 0;
  let g = 0;
  let b = 0;
  if (nm < 440) {
    r = (440 - nm) / 60;
    b = 1;
  } else if (nm < 490) {
    g = (nm - 440) / 50;
    b = 1;
  } else if (nm < 510) {
    g = 1;
    b = (510 - nm) / 20;
  } else if (nm < 580) {
    r = (nm - 510) / 70;
    g = 1;
  } else if (nm < 645) {
    r = 1;
    g = (645 - nm) / 65;
  } else r = 1;
  // Fall-off at the ends of the visible range; overall darkening for contrast on white.
  const f = nm < 420 ? 0.3 + (0.7 * (nm - 380)) / 40 : nm > 700 ? 0.3 + (0.7 * (780 - nm)) / 80 : 1;
  const k = 0.82 * f;
  return [Math.round(255 * r * k), Math.round(255 * g * k), Math.round(255 * b * k)];
}
