// Ch 28: charged particles in a uniform magnetic field, and the cyclotron. SI units, DOM-free.

export const QE = 1.602176634e-19;

export interface Particle {
  /** Mass [kg]. */
  m: number;
  /** Charge [C] (signed). */
  q: number;
}

export const PARTICLES: Record<string, Particle> = {
  electron: { m: 9.1093837e-31, q: -QE },
  proton: { m: 1.67262192e-27, q: QE },
  alpha: { m: 6.6446573e-27, q: 2 * QE },
};

/** Radius of the circle r = m v / (|q| B). */
export const radius = (pt: Particle, v: number, B: number) => (pt.m * v) / (Math.abs(pt.q) * B);
/** Period T = 2π m / (|q| B), independent of the speed. */
export const period = (pt: Particle, B: number) => (2 * Math.PI * pt.m) / (Math.abs(pt.q) * B);

export interface Kin {
  x: number;
  y: number;
  vx: number;
  vy: number;
}

/**
 * Exact motion for dt in a uniform field B ẑ (Bz < 0: into the page):
 * dv/dt = (q/m) v × B. The velocity turns by φ = −(q Bz / m) dt; the speed is unchanged.
 */
export function gyrate(k: Kin, pt: Particle, Bz: number, dt: number): void {
  const W = -(pt.q * Bz) / pt.m; // counter-clockwise angular velocity
  const phi = W * dt;
  const c = Math.cos(phi);
  const s = Math.sin(phi);
  const { vx, vy } = k;
  if (Math.abs(phi) < 1e-12) {
    k.x += vx * dt;
    k.y += vy * dt;
    return;
  }
  k.x += (vx * s - vy * (1 - c)) / W;
  k.y += (vx * (1 - c) + vy * s) / W;
  k.vx = vx * c - vy * s;
  k.vy = vx * s + vy * c;
}

/** Magnetic force q v × B for B = Bz ẑ. */
export const lorentz = (k: Kin, pt: Particle, Bz: number): [number, number] => [pt.q * k.vy * Bz, -pt.q * k.vx * Bz];

// ------------------------------------------------------------------ cyclotron

export interface Cyclotron {
  pt: Particle;
  /** Field magnitude [T], into the page. */
  B: number;
  /** Dee radius [m]. */
  R: number;
  /** Gap width [m]. */
  gap: number;
  /** Peak gap voltage [V]. */
  V0: number;
  /** Oscillator frequency as a multiple of the cyclotron frequency. */
  ratio: number;
}

export const cyclotronOmega = (c: Cyclotron) => (Math.abs(c.pt.q) * c.B) / c.pt.m;
/** Kinetic energy at the dee radius: K = (q B R)² / 2m. */
export const maxEnergy = (c: Cyclotron) => (c.pt.q * c.B * c.R) ** 2 / (2 * c.pt.m);
/** Gap voltage V(t) = V0 cos(ω t): the left dee is at the higher potential when V > 0. */
export const gapVoltage = (c: Cyclotron, t: number) => c.V0 * Math.cos(c.ratio * cyclotronOmega(c) * t);

export interface Run {
  /** Sample times [s]. */
  t: Float64Array;
  x: Float64Array;
  y: Float64Array;
  vx: Float64Array;
  vy: Float64Array;
  /** Kinetic energy [J]. */
  K: Float64Array;
  /** First time with r > rStop, or the end time. */
  tStop: number;
  /** Extraction time (orbit radius reached R) [s], or Infinity if never extracted. */
  tExit: number;
  /** Kinetic energy at extraction [J] (0 if never extracted). */
  kExit: number;
  /** Starting point of the proton [m] (on the gap mid-line, x = 0). */
  y0: number;
  n: number;
}

/** One Boris integration; `onStep` returns true to stop. */
function integrate(c: Cyclotron, y0: number, steps: number, dt: number, onStep: (k: number, x: number, y: number, vx: number, vy: number, out: boolean) => boolean): void {
  const qm = c.pt.q / c.pt.m;
  const w = cyclotronOmega(c);
  let x = 0;
  let y = y0;
  let vx = 0;
  let vy = 0;
  let out = false;
  for (let k = 1; k <= steps; k++) {
    const tm = (k - 0.5) * dt;
    const Ex = !out && Math.abs(x) < c.gap / 2 ? gapVoltage(c, tm) / c.gap : 0;
    const Bz = out ? 0 : -c.B;
    // Boris: half electric kick, magnetic rotation, half electric kick.
    vx += 0.5 * qm * Ex * dt;
    const tz = 0.5 * qm * Bz * dt;
    const sz = (2 * tz) / (1 + tz * tz);
    const px = vx + vy * tz;
    const py = vy - vx * tz;
    vx += py * sz;
    vy -= px * sz;
    vx += 0.5 * qm * Ex * dt;
    x += vx * dt;
    y += vy * dt;
    // Extraction: once the orbit radius m v / |q| B reaches the dee radius, a deflector takes
    // the particle out of the field; it then moves in a straight line.
    if (!out && Math.hypot(vx, vy) >= w * c.R) out = true;
    if (onStep(k, x, y, vx, vy, out)) return;
  }
}

/**
 * Boris integration from rest on the gap mid-line. B (into the page) fills the pole face,
 * a little larger than the dees; E = V(t)/gap along x in the gap |x| < gap/2. The particle is
 * extracted when its orbit radius reaches R, so it leaves with K = (qBR)²/2m for any V0.
 * The start is shifted along y so the orbits are centred on the dees (a trial run from the
 * centre finds the drift of the orbit centre; the motion is unchanged by a shift in y).
 */
export function runCyclotron(c: Cyclotron, tMax: number, dt: number, every: number, rStop: number): Run {
  const steps = Math.ceil(tMax / dt);
  const w = cyclotronOmega(c);
  // Trial run from the centre: orbit centre (x − v_y/ω, y + v_x/ω) at extraction; a particle
  // that is never extracted (detuned) is centred on the y extent of its path instead.
  let cy = 0;
  let yLo = 0;
  let yHi = 0;
  let extracted = false;
  integrate(c, 0, steps, dt, (_k, _x, y, vx, _vy, out) => {
    yLo = Math.min(yLo, y);
    yHi = Math.max(yHi, y);
    if (out) {
      extracted = true;
      cy = y + vx / w;
    }
    return out;
  });
  const y0 = extracted ? -cy : -(yLo + yHi) / 2;

  const n = Math.floor(steps / every) + 1;
  const run: Run = {
    t: new Float64Array(n),
    x: new Float64Array(n),
    y: new Float64Array(n),
    vx: new Float64Array(n),
    vy: new Float64Array(n),
    K: new Float64Array(n),
    tStop: tMax,
    tExit: Infinity,
    kExit: 0,
    y0,
    n: 0,
  };
  const push = (t: number, x: number, y: number, vx: number, vy: number) => {
    const i = run.n++;
    run.t[i] = t;
    run.x[i] = x;
    run.y[i] = y;
    run.vx[i] = vx;
    run.vy[i] = vy;
    run.K[i] = 0.5 * c.pt.m * (vx * vx + vy * vy);
  };
  push(0, 0, y0, 0, 0);
  let stopped = false;
  integrate(c, y0, steps, dt, (k, x, y, vx, vy, out) => {
    if (out && run.tExit === Infinity) {
      run.tExit = k * dt;
      run.kExit = 0.5 * c.pt.m * (vx * vx + vy * vy);
    }
    if (!stopped && x * x + y * y > rStop * rStop) {
      stopped = true;
      run.tStop = k * dt;
    }
    if (k % every === 0 && run.n < n) push(k * dt, x, y, vx, vy);
    return false;
  });
  return run;
}

/** Linear interpolation of a run at time t. */
export function sampleRun(run: Run, t: number): Kin & { K: number; i: number } {
  const dtS = run.t[1] - run.t[0];
  const f = Math.min(Math.max(t / dtS, 0), run.n - 1);
  const i = Math.min(Math.floor(f), run.n - 2);
  const a = f - i;
  const lerp = (arr: Float64Array) => arr[i] + (arr[i + 1] - arr[i]) * a;
  return { x: lerp(run.x), y: lerp(run.y), vx: lerp(run.vx), vy: lerp(run.vy), K: lerp(run.K), i };
}
