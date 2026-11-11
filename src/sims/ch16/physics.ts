// Ch 16: waves on a string. Reflection at a fixed or free end (exact superposition of the
// incident wave and its image), and a driven string with both ends fixed (finite differences
// at Courant number 1, plus the exact damped steady state for the resonance curve). DOM-free.

export type End = 'fixed' | 'free';
export type Mode = 'pulse' | 'wave';

export interface Reflect {
  /** Boundary at x = L [m]. */
  L: number;
  /** Wave speed [m/s]. */
  v: number;
  /** Amplitude of the incident wave [m]. */
  A: number;
  mode: Mode;
  end: End;
  /** Wavelength of the continuous wave [m]. */
  lambda: number;
  /** Pulse duration [s]; its length on the string is v·tau. */
  tau: number;
  /** Time shift: the incident wave's front is at x = v (t + t0). */
  t0: number;
}

/** Shape of the incident disturbance as a function of time since its front passed. */
export function source(r: Reflect, s: number): number {
  if (s < 0) return 0;
  if (r.mode === 'pulse') return s > r.tau ? 0 : r.A * Math.sin((Math.PI * s) / r.tau) ** 2;
  return r.A * Math.sin(((2 * Math.PI * r.v) / r.lambda) * s);
}

/** Reflection coefficient: −1 (inverted) at a fixed end, +1 at a free end. */
export const sign = (e: End) => (e === 'fixed' ? -1 : 1);

/**
 * Incident wave travelling +x and the reflected wave travelling −x, which is the incident wave
 * mirrored about x = L (inverted at a fixed end). Their sum satisfies y(L) = 0 (fixed) or
 * ∂y/∂x(L) = 0 (free).
 */
export function reflectAt(r: Reflect, x: number, t: number) {
  const inc = source(r, t + r.t0 - x / r.v);
  const ref = sign(r.end) * source(r, t + r.t0 - (2 * r.L - x) / r.v);
  return { inc, ref, y: inc + ref };
}

/** Standing-wave nodes in [0, L] once the reflected wave has filled the string. */
export function nodes(r: Reflect): number[] {
  const out: number[] = [];
  const first = r.end === 'fixed' ? 0 : r.lambda / 4;
  for (let d = first; d <= r.L + 1e-9; d += r.lambda / 2) out.push(r.L - d);
  return out;
}

/** Standing-wave envelope 2A|sin k(L − x)| (fixed) or 2A|cos k(L − x)| (free). */
export function envelope(r: Reflect, x: number): number {
  const ph = ((2 * Math.PI) / r.lambda) * (r.L - x);
  return 2 * r.A * Math.abs(r.end === 'fixed' ? Math.sin(ph) : Math.cos(ph));
}

// ------------------------------------------------------------------ driven string, both ends fixed

export interface Driven {
  L: number;
  v: number;
  /** Damping rate β in y_tt + 2β y_t = v² y_xx [1/s]. */
  beta: number;
  /** Driver amplitude at x = 0 [m]. */
  d: number;
  /** Grid cells. */
  N: number;
}

/** Natural frequencies f_n = n v / 2L. */
export const harmonic = (s: Driven, n: number) => (n * s.v) / (2 * s.L);

export interface StringState {
  t: number;
  y: number[];
  yPrev: number[];
  phase: number;
  /** Largest local amplitude √(y² + (ẏ/ω)²) along the string. */
  amp: number;
}

export function stringInit(s: Driven): StringState {
  return { t: 0, y: new Array(s.N + 1).fill(0), yPrev: new Array(s.N + 1).fill(0), phase: 0, amp: 0 };
}

/** Time step for Courant number 1 (exact propagation without damping). */
export const stringStep = (s: Driven) => s.L / s.N / s.v;

/** One leapfrog step; the left end is driven at d sin(phase), the right end is fixed. */
export function stringAdvance(s: Driven, st: StringState, f: number): void {
  const h = stringStep(s);
  const bh = s.beta * h;
  const { y, yPrev } = st;
  const next = new Array(s.N + 1);
  for (let i = 1; i < s.N; i++) next[i] = (2 * y[i] - (1 - bh) * yPrev[i] + (y[i + 1] - 2 * y[i] + y[i - 1])) / (1 + bh);
  st.phase += 2 * Math.PI * f * h;
  next[0] = s.d * Math.sin(st.phase);
  next[s.N] = 0;
  const w = 2 * Math.PI * f;
  let amp = 0;
  for (let i = 0; i <= s.N; i++) {
    const vel = (next[i] - y[i]) / h;
    amp = Math.max(amp, Math.hypot(next[i], vel / w));
  }
  st.yPrev = y;
  st.y = next;
  st.amp = amp;
  st.t += h;
}

type C = [number, number];
const csqrt = ([a, b]: C): C => {
  const r = Math.hypot(a, b);
  const re = Math.sqrt((r + a) / 2);
  const im = Math.sign(b || 1) * Math.sqrt(Math.max(0, (r - a) / 2));
  return [re, im];
};
const csin = ([a, b]: C): C => [Math.sin(a) * Math.cosh(b), Math.cos(a) * Math.sinh(b)];
const cabs = ([a, b]: C) => Math.hypot(a, b);
const cmul = ([a, b]: C, [c, e]: C): C => [a * c - b * e, a * e + b * c];

/** Complex wavenumber of the damped string: κ² v² = ω² − 2iβω. */
function kappa(s: Driven, f: number): C {
  const w = 2 * Math.PI * f;
  const [re, im] = csqrt([w * w, -2 * s.beta * w]);
  return [re / s.v, im / s.v];
}

/** Steady-state amplitude at x: d |sin κ(L − x)| / |sin κL|. */
export function steadyAmp(s: Driven, f: number, x: number): number {
  const k = kappa(s, f);
  return (s.d * cabs(csin(cmul(k, [s.L - x, 0])))) / cabs(csin(cmul(k, [s.L, 0])));
}

/** Largest steady-state amplitude along the string: the resonance curve. */
export function resonance(s: Driven, f: number, n = 200): number {
  let m = 0;
  for (let i = 0; i <= n; i++) m = Math.max(m, steadyAmp(s, f, (s.L * i) / n));
  return m;
}
