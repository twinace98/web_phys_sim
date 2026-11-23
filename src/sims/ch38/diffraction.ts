// Ch 38 tab 2: matter-wave diffraction. Electrons, neutrons, C60 molecules or a baseball pass one at
// a time through a crystal, a nanofabricated grating or a millimetre slit pair and land on a screen
// as single dots; the dots build up |ψ|². Fringes show only when λ/d is not tiny.
import { fmt, niceTicks } from '../../core/format';
import { t } from '../../core/i18n';
import type { Rng } from '../../core/rng';
import type { ParamSchema, Scene } from '../../core/types';
import type { Draw } from '../../draw/draw';
import { measureRich } from '../../draw/text';
import { ROLE_COLOR } from '../../draw/theme';
import { texNum } from '../field/render';
import { Frame, PX_WORLD, TICK, canvasBox, linePx, pow10, rectPx, textPx, type Box } from '../modern/frame';
import { C, EV, H, PARTICLES, type ParticleId } from './physics';

// ------------------------------------------------------------------ particles

type PD = { part: string; ve: number; vn: number; vc: number; vb: number; st: string };

const SPEED_KEY: Record<ParticleId, 've' | 'vn' | 'vc' | 'vb'> = { electron: 've', neutron: 'vn', c60: 'vc', ball: 'vb' };

/** Speed [m/s] of the chosen particle. */
export const speedOf = (p: PD): number => p[SPEED_KEY[p.part as ParticleId] ?? 've'];

export const gammaOf = (v: number) => 1 / Math.sqrt(1 - (v / C) ** 2);

/** Relativistic momentum γmv [kg·m/s]. */
export const momentumOf = (m: number, v: number) => gammaOf(v) * m * v;

/** Kinetic energy (γ − 1)mc² [J], written as mv²γ²/(γ + 1) so a baseball keeps its digits. */
export function kineticOf(m: number, v: number): number {
  const g = gammaOf(v);
  return (m * v * v * g * g) / (g + 1);
}

/** de Broglie wavelength h/p [m] of a particle of mass m at speed v. */
export const lambdaOf = (m: number, v: number) => H / momentumOf(m, v);

export function lambdaP(p: PD): number {
  return lambdaOf(PARTICLES[p.part as ParticleId].mass, speedOf(p));
}

// ------------------------------------------------------------------ structures

export type StructId = 'crystal' | 'grating' | 'slits';

export interface Structure {
  /** Period [m]. */
  d: number;
  /** Opening width [m]; 0 → atoms instead of slits (Gaussian envelope of width `atom`). */
  a: number;
  /** Atom size [m] of a crystal: scattering falls off as exp[−(π·atom·sinθ/λ)²] (form-factor stand-in). */
  atom: number;
  /** Illuminated periods. */
  N: number;
  /** Structure → screen [m]. */
  L: number;
  /** Half height of the screen [m]. */
  Y: number;
  /** Screen axis unit [m] and its label. */
  unit: number;
  unitLabel: string;
}

export const STRUCTS: Record<StructId, Structure> = {
  // Nickel surface-row spacing of Davisson–Germer, treated as a transmission grating of 20 atoms.
  crystal: { d: 0.215e-9, a: 0, atom: 0.05e-9, N: 20, L: 0.05, Y: 0.1, unit: 0.01, unitLabel: 'cm' },
  // SiN grating of Arndt et al. (1999): 100 nm period, 50 nm slits, detector 1.25 m behind.
  grating: { d: 100e-9, a: 50e-9, atom: 0, N: 20, L: 1.25, Y: 150e-6, unit: 1e-6, unitLabel: 'μm' },
  // Two 0.25 mm slits 1 mm apart, screen 1 m behind.
  slits: { d: 1e-3, a: 0.25e-3, atom: 0, N: 2, L: 1, Y: 1e-3, unit: 1e-3, unitLabel: 'mm' },
};

/** The classic experiment of each particle, used when the structure is 'auto'. */
export const AUTO_STRUCT: Record<ParticleId, StructId> = { electron: 'crystal', neutron: 'crystal', c60: 'grating', ball: 'slits' };

export const structIdOf = (p: PD): StructId => (p.st === 'auto' ? AUTO_STRUCT[p.part as ParticleId] : (p.st as StructId));

/** Half the width of the illuminated aperture [m] (centre of the outer slit plus half a slit). */
export const apertureHalf = (s: Structure) => ((s.N - 1) * s.d) / 2 + s.a / 2;

/**
 * Screen resolution δ [m]: a 96th of the screen height, about 5 px on the dot screen of a phone or a
 * laptop and two histogram bins (HIST_BINS). Rows of dots δ apart show as separate fringes. Below δ
 * the first order falls in the histogram bin next to the central peak (one block); from about 1.06 δ
 * (δ plus the width of a first-order peak) the bin between them is nearly empty.
 */
export const RES_DIV = 96;
export const resolution = (s: Structure) => (2 * s.Y) / RES_DIV;
/** Histogram bins over the screen: two per δ, so the histogram resolves what the dots resolve. */
export const HIST_BINS = 2 * RES_DIV;

// ------------------------------------------------------------------ far-field pattern

/** N-period interference factor [sin(Nπf)/(N sin πf)]², periodic in f with peaks 1 at integers. */
export function gridFactor(N: number, f: number): number {
  const sf = Math.sin(Math.PI * f);
  if (Math.abs(sf) < 1e-9) return 1;
  const r = Math.sin(N * Math.PI * f) / (N * sf);
  return r * r;
}

/** Single-slit envelope (sin β/β)², β = π a sinθ/λ = π (a/d) u; for atoms exp[−(π·atom·u/d)²]. */
export function envelope(s: Structure, u: number): number {
  if (s.a === 0) return Math.exp(-(((Math.PI * s.atom * u) / s.d) ** 2));
  const b = (Math.PI * s.a * u) / s.d;
  if (Math.abs(b) < 1e-9) return 1;
  const r = Math.sin(b) / b;
  return r * r;
}

/**
 * Far-field probability density in u = d sinθ/λ (u = m at the m-th order): interference × envelope ×
 * cos θ. That is dP/dθ ∝ cos²θ · I (2D obliquity factor), and ds = cos θ dθ.
 */
export function farDensity(s: Structure, lam: number, u: number): number {
  const sn = (u * lam) / s.d;
  if (Math.abs(sn) >= 1) return 0;
  return gridFactor(s.N, u) * envelope(s, u) * Math.sqrt(1 - sn * sn);
}

/** Screen position L tan θ [m] of the far-field direction u. */
export function yOfU(s: Structure, lam: number, u: number): number {
  const sn = (u * lam) / s.d;
  return (s.L * sn) / Math.sqrt(1 - sn * sn);
}

/** Inverse of yOfU. */
export function uOfY(s: Structure, lam: number, y: number): number {
  return ((y / Math.hypot(y, s.L)) * s.d) / lam;
}

/** Orders kept on each side: beyond, the envelope holds < 10⁻³ of the hits (and the spread is sub-pixel). */
export const M_CAP = 2000;

/** |u| that can still reach the screen (far-field spread plus the aperture offset), capped. */
function uReach(s: Structure, lam: number): number {
  return Math.min(uOfY(s, lam, s.Y + apertureHalf(s)), (s.d / lam) * (1 - 1e-12), M_CAP + 0.5);
}

export interface Fringe {
  /** λ/d = sin θ₁. */
  ratio: number;
  /** First-order angle [rad], NaN if λ ≥ d. */
  theta1: number;
  /** Position of the first maximum L tan θ₁ [m], NaN if λ ≥ d. */
  y1: number;
  /** Small-angle fringe spacing λL/d [m]. */
  dyApprox: number;
  /** Screen resolution δ [m]. */
  res: number;
  /** First order exists and lies at least δ (and the illuminated width 2·apertureHalf) from the centre. */
  resolvable: boolean;
  /** First maximum on the screen. */
  onScreen: boolean;
}

export function fringe(s: Structure, lam: number): Fringe {
  const ratio = lam / s.d;
  const theta1 = ratio < 1 ? Math.asin(ratio) : NaN;
  const y1 = ratio < 1 ? s.L * Math.tan(theta1) : NaN;
  const res = resolution(s);
  const resolvable = ratio < 1 && y1 >= Math.max(res, 2 * apertureHalf(s));
  return { ratio, theta1, y1, dyApprox: (lam * s.L) / s.d, res, resolvable, onScreen: ratio < 1 && y1 <= s.Y };
}

// ------------------------------------------------------------------ sampling hits

export interface Hit {
  /** Screen position [m]. */
  y: number;
  /** Transverse position in the structure [m] (which slit, where in it). */
  x: number;
  /** Random position across the screen face, 0–1 (drawing only). */
  z: number;
}

const F_TABLE = 4000;

/**
 * Exact sampler of the screen distribution: the far-field direction by rejection (order m chosen with
 * weight ∫G over the visible part × a bound of envelope·cosθ, the offset within the order by the
 * inverse CDF of G), plus the aperture offset (uniform slit, uniform point in it). Hits off the
 * screen are not detected and are drawn again.
 */
export class HitSampler {
  private cdf = new Float64Array(F_TABLE + 1);
  private orders: { m: number; c0: number; c1: number; bound: number }[] = [];
  private cum: number[] = [];

  constructor(
    readonly s: Structure,
    readonly lam: number,
  ) {
    // CDF of G over f ∈ [−½, ½] (trapezoid on a grid that resolves the 1/N-wide peaks).
    let acc = 0;
    let prev = gridFactor(s.N, -0.5);
    for (let i = 1; i <= F_TABLE; i++) {
      const g = gridFactor(s.N, -0.5 + i / F_TABLE);
      acc += 0.5 * (prev + g);
      this.cdf[i] = acc;
      prev = g;
    }
    for (let i = 0; i <= F_TABLE; i++) this.cdf[i] /= acc;
    const U = uReach(s, lam);
    const M = Math.min(Math.ceil(U + 0.5), M_CAP);
    let tot = 0;
    for (let m = -M; m <= M; m++) {
      const f0 = Math.max(-0.5, -U - m);
      const f1 = Math.min(0.5, U - m);
      if (f1 <= f0) continue;
      const c0 = this.cdfAt(f0);
      const c1 = this.cdfAt(f1);
      if (c1 <= c0) continue;
      // Slits: envelope ≤ min(1, 1/β²). Atoms: the Gaussian falls with |u|. And cos θ ≤ 1.
      const umin = m + f0 <= 0 && m + f1 >= 0 ? 0 : Math.min(Math.abs(m + f0), Math.abs(m + f1));
      const b = (Math.PI * s.a * umin) / s.d;
      const bound = s.a === 0 ? envelope(s, umin) : b <= 1 ? 1 : 1 / (b * b);
      if (!(bound > 0)) continue;
      tot += (c1 - c0) * bound;
      this.orders.push({ m, c0, c1, bound });
      this.cum.push(tot);
    }
  }

  private cdfAt(f: number): number {
    const x = (f + 0.5) * F_TABLE;
    const i = Math.min(F_TABLE - 1, Math.max(0, Math.floor(x)));
    return this.cdf[i] + (this.cdf[i + 1] - this.cdf[i]) * (x - i);
  }

  private fOfCdf(c: number): number {
    let lo = 0;
    let hi = F_TABLE;
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1;
      if (this.cdf[mid] <= c) lo = mid;
      else hi = mid;
    }
    const span = this.cdf[hi] - this.cdf[lo];
    const fr = span > 0 ? (c - this.cdf[lo]) / span : 0.5;
    return -0.5 + (lo + fr) / F_TABLE;
  }

  /** Far-field direction u of one particle. */
  sampleU(rng: Rng): number {
    const s = this.s;
    const tot = this.cum[this.cum.length - 1];
    for (let tries = 0; tries < 10000; tries++) {
      const r = rng.next() * tot;
      let lo = 0;
      let hi = this.cum.length - 1;
      while (lo < hi) {
        const mid = (lo + hi) >> 1;
        if (this.cum[mid] > r) hi = mid;
        else lo = mid + 1;
      }
      const o = this.orders[lo];
      const u = o.m + this.fOfCdf(o.c0 + rng.next() * (o.c1 - o.c0));
      const sn = (u * this.lam) / s.d;
      if (Math.abs(sn) >= 1) continue;
      if (rng.next() * o.bound <= envelope(s, u) * Math.sqrt(1 - sn * sn)) return u;
    }
    return 0;
  }

  /** One detected hit. */
  sample(rng: Rng): Hit {
    const s = this.s;
    for (let tries = 0; tries < 10000; tries++) {
      const u = this.sampleU(rng);
      const j = Math.min(s.N - 1, Math.floor(rng.next() * s.N));
      const x = (j - (s.N - 1) / 2) * s.d + s.a * (rng.next() - 0.5);
      const y = yOfU(s, this.lam, u) + x;
      if (Math.abs(y) <= s.Y) return { y, x, z: rng.next() };
    }
    return { y: 0, x: 0, z: rng.next() };
  }
}

// ------------------------------------------------------------------ expected distribution

/** Add weight w spread evenly over [y0, y1] into nb bins covering [−Y, Y]. */
function depositBox(out: Float64Array, Y: number, y0: number, y1: number, w: number): void {
  const nb = out.length;
  const bw = (2 * Y) / nb;
  if (y1 - y0 < 1e-6 * bw) {
    const k = Math.floor((y0 + Y) / bw);
    if (k >= 0 && k < nb) out[k] += w;
    return;
  }
  const k0 = Math.max(0, Math.floor((y0 + Y) / bw));
  const k1 = Math.min(nb - 1, Math.floor((y1 + Y) / bw));
  for (let k = k0; k <= k1; k++) {
    const lo = Math.max(y0, -Y + k * bw);
    const hi = Math.min(y1, -Y + (k + 1) * bw);
    if (hi > lo) out[k] += (w * (hi - lo)) / (y1 - y0);
  }
}

/**
 * Probability of a detected hit in each of nb equal bins over the screen [−Y, Y] (sums to 1), by
 * midpoint quadrature in u (24 points per 1/N peak width) convolved with the aperture.
 */
export function binMasses(s: Structure, lam: number, nb: number): Float64Array {
  const out = new Float64Array(nb);
  const U = uReach(s, lam);
  // Fine enough for the 1/N-wide peaks and for the screen bins (dy/du grows as 1/cos³θ).
  const snMax = Math.min(0.999, (U * lam) / s.d);
  const duBin = (uOfY(s, lam, (2 * s.Y) / nb) / 4) * (1 - snMax * snMax) ** 1.5;
  const du = Math.min(1 / (24 * s.N), duBin);
  const n = Math.ceil((2 * U) / du);
  const step = (2 * U) / n;
  for (let i = 0; i < n; i++) {
    const u = -U + (i + 0.5) * step;
    const w = farDensity(s, lam, u) * step;
    if (w <= 0) continue;
    const yf = yOfU(s, lam, u);
    for (let j = 0; j < s.N; j++) {
      const xc = (j - (s.N - 1) / 2) * s.d + yf;
      depositBox(out, s.Y, xc - s.a / 2, xc + s.a / 2, w / s.N);
    }
  }
  const tot = out.reduce((a, b) => a + b, 0);
  if (tot > 0) for (let k = 0; k < nb; k++) out[k] /= tot;
  return out;
}

// ------------------------------------------------------------------ arrivals

export const MAX_HITS = 3000;
/** Detected hits by time t: a few per second at first (one at a time), then faster. */
export const hitsBy = (t: number) => Math.min(MAX_HITS, Math.floor(4 * t + 0.4 * t * t * t + 1e-9));
/** Arrival time of hit k (0-based): hitsBy(τ) = k + 1. */
export function arrival(k: number): number {
  const n = k + 1;
  let lo = 0;
  let hi = 40;
  for (let i = 0; i < 60; i++) {
    const mid = (lo + hi) / 2;
    if (4 * mid + 0.4 * mid ** 3 >= n) hi = mid;
    else lo = mid;
  }
  return hi;
}
export const T_END = arrival(MAX_HITS - 1) + 0.6;
/** Flight time on the stage [s] (drawing only). */
const T_FLY = 0.6;

// ------------------------------------------------------------------ formatting

const LEN_UNITS: [number, string, string][] = [
  [1, 'm', '\\text{m}'],
  [1e-2, 'cm', '\\text{cm}'],
  [1e-3, 'mm', '\\text{mm}'],
  [1e-6, 'μm', '\\mu\\text{m}'],
  [1e-9, 'nm', '\\text{nm}'],
  [1e-12, 'pm', '\\text{pm}'],
  [1e-15, 'fm', '\\text{fm}'],
];

const trimZeros = (v: string) => (v.includes('.') && !/×|times/.test(v) ? v.replace(/\.?0+$/, '') : v);
/** Prefix unit for L: the largest with a value ≥ 1 (≥ 0.1 for nm: 0.215 nm, not 215 pm). */
const lenUnit = (L: number) => LEN_UNITS.find(([f]) => L >= f * (f === 1e-9 ? 0.0995 : 0.9995) && L / f < 1000);

/** Length with a prefix, plain text, trailing zeros dropped: '0.215 nm', '1 mm', '1.14×10⁻³⁴ m'. */
export function lenText(L: number, sig = 3): string {
  const u = lenUnit(L);
  return u ? `${trimZeros(fmt(L / u[0], sig))} ${u[1]}` : `${fmt(L, sig, 0)} m`;
}

/** Length with a prefix, TeX; `exact` drops trailing zeros (apparatus constants such as 1 mm). */
export function lenTex(L: number, sig = 3, exact = false): string {
  if (!Number.isFinite(L)) return '\\text{–}';
  const u = lenUnit(L);
  if (!u) return `${texNum(L, sig, 0)}\\ \\text{m}`;
  const v = texNum(L / u[0], sig, 0);
  return `${exact ? trimZeros(v) : v}\\ ${u[2]}`;
}

// ------------------------------------------------------------------ params

const speed = (key: ParticleId, min: number, max: number, def: number, sig: number) => ({
  kind: 'number' as const,
  label: 'ch38.df.p.v',
  desc: 'ch38.df.d.v',
  group: 'main' as const,
  live: false,
  control: 'slider' as const,
  log: true,
  sig,
  min,
  max,
  default: def,
  unit: 'm/s',
  visibleIf: (p: Record<string, unknown>) => p.part === key,
});

const params: ParamSchema<PD> = {
  part: {
    kind: 'select',
    label: 'ch38.df.p.part',
    desc: 'ch38.df.d.part',
    group: 'main',
    live: false,
    default: 'electron',
    options: [
      { value: 'electron', label: 'ch38.df.part.electron' },
      { value: 'neutron', label: 'ch38.df.part.neutron' },
      { value: 'c60', label: 'ch38.df.part.c60' },
      { value: 'ball', label: 'ch38.df.part.ball' },
    ],
  },
  // Electron 0.71 eV – 79 keV; 4.36×10⁶ m/s = 54.0 eV (Davisson–Germer).
  ve: speed('electron', 5e5, 1.5e8, 4.36e6, 3),
  // Cold to hot neutrons; 2200 m/s thermal.
  vn: speed('neutron', 100, 30000, 2200, 2),
  // Molecular beam from an oven; 220 m/s as in Arndt et al.
  vc: speed('c60', 50, 500, 220, 2),
  vb: speed('ball', 1, 50, 40, 2),
  st: {
    kind: 'select',
    label: 'ch38.df.p.st',
    desc: 'ch38.df.d.st',
    group: 'advanced',
    live: false,
    default: 'auto',
    options: [
      { value: 'auto', label: 'ch38.df.st.auto' },
      { value: 'crystal', label: 'ch38.df.st.crystal' },
      { value: 'grating', label: 'ch38.df.st.grating' },
      { value: 'slits', label: 'ch38.df.st.slits' },
    ],
  },
};

// ------------------------------------------------------------------ state, memo

interface S {
  t: number;
  hits: Hit[];
  arrive: Float64Array;
}

const ARRIVE = Float64Array.from({ length: MAX_HITS }, (_, k) => arrival(k));
/** Flight time of each hit on the stage: twice the gap to the previous arrival (at most T_FLY), so
 *  only one or two particles are on their way at any time, however fast the hits come. */
const FLY = Float64Array.from({ length: MAX_HITS }, (_, k) => Math.min(T_FLY, ARRIVE[k], 2 * (ARRIVE[k] - (k > 0 ? ARRIVE[k - 1] : 0))));

let sampKey = '';
let sampMemo: HitSampler | null = null;
function samplerOf(s: Structure, lam: number): HitSampler {
  const key = `${s.d}|${s.N}|${lam}`;
  if (key !== sampKey || !sampMemo) {
    sampMemo = new HitSampler(s, lam);
    sampKey = key;
  }
  return sampMemo;
}

const NB = HIST_BINS;
let massKey = '';
let massMemo: Float64Array = new Float64Array(NB);
function massesOf(s: Structure, lam: number): Float64Array {
  const key = `${s.d}|${s.N}|${lam}`;
  if (key !== massKey) {
    massMemo = binMasses(s, lam, NB);
    massKey = key;
  }
  return massMemo;
}

// ------------------------------------------------------------------ drawing

const BLUE = ROLE_COLOR.position;
const INK = '#1a1a1a';
const WALL = '#5c5c5c';
const ATOM = '#9a9a9a';
const SCREEN = '#f3f3f3';

function drawRuler(g: Draw, o: Box, narrow: boolean, lam: number, s: Structure, size: number): number {
  const L = o.l + (narrow ? 14 : 30);
  const R = o.r - (narrow ? 14 : 30);
  const yR = o.t + 50;
  const ruler = new Frame(g, { l: L, r: R, t: yR, b: yR }, [1e-36, 1], [0, 1], { x: true });
  linePx(g, L, yR, R, yR, { role: 'axis', width: 1.5 });
  const xl = ruler.X(lam);
  const every = narrow ? 12 : 6;
  for (let e = -36; e <= 0; e++) {
    const x = ruler.X(10 ** e);
    const major = e % every === 0;
    linePx(g, x, yR, x, yR + (major ? 6 : 3), { role: 'axis', width: 1 });
    if (!major) continue;
    // Tick label clamped to the canvas, left out where it would meet the λ label below the marker.
    const lbl = `${pow10(e)} m`;
    const w = measureRich(g.ctx, lbl, { size: 11 });
    const cx = Math.min(Math.max(x, o.l + 2 + w / 2), o.r - 2 - w / 2);
    if (Math.abs(cx - xl) > w / 2 + 9) textPx(g, cx, yR + 19, lbl, { size: 11, color: TICK, align: 'center' });
  }
  // d and the particle size above the ruler, the second one a row higher if they would touch.
  const tops: { x: number; label: string; color: string }[] = [{ x: ruler.X(s.d), label: '*d*', color: INK }];
  if (size > 0) tops.push({ x: ruler.X(size), label: t('ch38.df.size'), color: TICK });
  tops.forEach((q, i) => {
    const w = measureRich(g.ctx, q.label, { size: 12 });
    const cx = Math.min(Math.max(q.x, L + w / 2), R - w / 2);
    const clash = i > 0 && Math.abs(cx - tops[0].x) < (w + measureRich(g.ctx, tops[0].label, { size: 12 })) / 2 + 6;
    const up = clash ? 32 : 15;
    linePx(g, q.x, yR, q.x, yR - up + 3, { color: q.color, width: 1.25 });
    textPx(g, cx, yR - up, q.label, { size: 12, color: q.color, align: 'center' });
  });
  // λ below: triangle pointing at the ruler, label under the tick labels.
  g.polygon(
    [ruler.P(lam, 0), { x: ruler.P(lam, 0).x - g.px(5), y: ruler.P(lam, 0).y - g.px(9) }, { x: ruler.P(lam, 0).x + g.px(5), y: ruler.P(lam, 0).y - g.px(9) }],
    { fill: BLUE },
  );
  textPx(g, Math.min(Math.max(xl, L + 6), R - 6), yR + 22, '*λ*', { size: 14, color: BLUE, align: 'center' });
  return yR + 30;
}

function drawStructure(g: Draw, id: StructId, xs: number, yc: number, hS: number, yPx: (y: number) => number): void {
  if (id === 'crystal') {
    const rows = 9;
    const sp = hS / rows;
    const r = Math.max(2, Math.min(4.5, sp * 0.28));
    for (let c = 0; c < 3; c++)
      for (let k = 0; k < rows; k++) g.circle(W2(g, xs + (c - 1) * sp, yc - hS / 2 + (k + 0.5) * sp), r, { fill: ATOM });
  } else if (id === 'grating') {
    const n = 9;
    const gap = Math.max(2, hS / 40);
    const span = hS * 0.5;
    const cuts: number[] = [];
    for (let k = 0; k < n; k++) cuts.push(yc - span / 2 + (k + 0.5) * (span / n));
    let y0 = yc - hS / 2;
    for (const c of [...cuts, yc + hS / 2 + gap / 2]) {
      rectPx(g, { l: xs - 3, r: xs + 3, t: y0, b: c - gap / 2 }, { fill: WALL });
      y0 = c + gap / 2;
    }
  } else {
    // Slit pair drawn at the screen's scale: its shadow bands line up with the slits.
    const s = STRUCTS.slits;
    const edges = [-s.Y, -s.d / 2 - s.a / 2, -s.d / 2 + s.a / 2, s.d / 2 - s.a / 2, s.d / 2 + s.a / 2, s.Y];
    for (let k = 0; k < edges.length; k += 2) {
      rectPx(g, { l: xs - 4, r: xs + 4, t: yPx(edges[k + 1]), b: yPx(edges[k]) }, { fill: WALL });
    }
  }
}

const W2 = (g: Draw, x: number, y: number) => {
  const [a, b] = g.vp.toWorld(x, y);
  return { x: a, y: b };
};

function drawScene(g: Draw, st: S, p: PD, tNow: number): void {
  const id = p.part as ParticleId;
  const sid = structIdOf(p);
  const s = STRUCTS[sid];
  const lam = lambdaP(p);
  const fr = fringe(s, lam);
  const o = canvasBox(g);
  const Wd = o.r - o.l;
  const narrow = Wd < 600;
  const pad = narrow ? 10 : 24;

  const rulerB = drawRuler(g, o, narrow, lam, s, PARTICLES[id].size);

  // ---- experiment: source → structure → screen | histogram | y axis
  const eT = rulerB + (narrow ? 44 : 50);
  const eB = o.b - (narrow ? 14 : 22);
  const yc = (eT + eB) / 2;
  const axisW = narrow ? 30 : 46;
  const histW = narrow ? 62 : Math.max(110, 0.17 * Wd);
  const panelW = narrow ? 80 : Math.max(130, 0.22 * Wd);
  const histR = o.r - pad - axisW;
  const histL = histR - histW;
  const panelR = histL - (narrow ? 6 : 10);
  const panelL = panelR - panelW;
  const srcL = o.l + pad;
  const srcR = srcL + (narrow ? 18 : 28);
  const xs = srcR + (panelL - srcR) * 0.38;
  const yPx = (y: number) => yc - (y / s.Y) * ((eB - eT) / 2);

  // Source and beam.
  const srcH = sid === 'slits' ? Math.abs(yPx(s.d / 2 + s.a) - yPx(-s.d / 2 - s.a)) : 22;
  rectPx(g, { l: srcL, r: srcR, t: yc - srcH / 2, b: yc + srcH / 2 }, { fill: '#7a7a7a' });
  if (sid !== 'slits') linePx(g, srcR, yc, xs - 6, yc, { color: BLUE, width: 2, alpha: 0.15 });

  const hS = sid === 'slits' ? eB - eT : Math.min(0.5 * (eB - eT), 150);
  drawStructure(g, sid, xs, yc, hS, yPx);
  // d under the structure; for the slit pair (as tall as the screen) left of the wall, between the slits.
  const dLbl = `*d* = ${lenText(s.d)}`;
  if (sid === 'slits') textPx(g, xs - 10, yc, dLbl, { size: 12, color: INK, align: 'right', baseline: 'middle' });
  else textPx(g, xs, yc + hS / 2 + 18, dLbl, { size: 12, color: INK, align: 'center' });

  // Screen face with the hits.
  rectPx(g, { l: panelL, r: panelR, t: eT, b: eB }, { fill: SCREEN, color: '#9a9a9a', width: 1 });
  const n = Math.min(st.hits.length, hitsBy(st.t));
  const ctx = g.ctx;
  const rDot = narrow ? 1.1 : 1.3;
  ctx.save();
  ctx.fillStyle = BLUE;
  ctx.globalAlpha = 0.85;
  ctx.beginPath();
  for (let k = 0; k < n; k++) {
    const h = st.hits[k];
    const x = panelL + 2 + h.z * (panelW - 4);
    const y = yPx(h.y);
    ctx.moveTo(x + rDot, y);
    ctx.arc(x, y, rDot, 0, 2 * Math.PI);
  }
  ctx.fill();
  ctx.restore();

  // Particles in flight: source → structure (at their slit) → screen.
  const xApPx = (x: number) => (sid === 'slits' ? yPx(x) : yc);
  for (let k = n; k < st.hits.length; k++) {
    const ta = st.arrive[k];
    const fly = FLY[k];
    if (ta - fly >= tNow) break;
    const f = (tNow - (ta - fly)) / fly;
    const h = st.hits[k];
    const ya = xApPx(h.x);
    const xh = panelL + 2 + h.z * (panelW - 4);
    const f1 = (xs - srcR) / (xh - srcR);
    let x: number;
    let y: number;
    if (f < f1) {
      x = srcR + (xs - srcR) * (f / f1);
      y = ya;
    } else {
      const q = (f - f1) / (1 - f1);
      x = xs + (xh - xs) * q;
      y = ya + (yPx(h.y) - ya) * q;
    }
    g.circle(W2(g, x, y), narrow ? 2.5 : 3, { fill: BLUE });
  }

  // Histogram of the hits and the expected counts N·P (|ψ|², dashed).
  const mass = massesOf(s, lam);
  const counts = new Float64Array(NB);
  for (let k = 0; k < n; k++) {
    const b = Math.min(NB - 1, Math.max(0, Math.floor(((st.hits[k].y + s.Y) / (2 * s.Y)) * NB)));
    counts[b] += 1;
  }
  const nn = Math.max(n, 1);
  let mMax = 0;
  for (let k = 0; k < NB; k++) mMax = Math.max(mMax, mass[k] * nn, counts[k]);
  const xH = (c: number) => histL + (c / (mMax * 1.25)) * (histR - histL);
  const bh = (eB - eT) / NB;
  if (n > 0) {
    const poly: { x: number; y: number }[] = [W2(g, histL, eB)];
    for (let k = 0; k < NB; k++) {
      const yb = eB - k * bh;
      poly.push(W2(g, xH(counts[k]), yb), W2(g, xH(counts[k]), yb - bh));
    }
    poly.push(W2(g, histL, eT));
    g.polygon(poly, { fill: BLUE, fillAlpha: 0.45 });
  }
  // Expected counts per bin as a step outline, the same bins as the bars.
  const curve: { x: number; y: number }[] = [W2(g, histL, eB)];
  for (let k = 0; k < NB; k++) curve.push(W2(g, xH(mass[k] * nn), eB - k * bh), W2(g, xH(mass[k] * nn), eB - (k + 1) * bh));
  curve.push(W2(g, histL, eT));
  g.polyline(curve, { color: INK, width: 1.25, dash: [4, 3] });
  linePx(g, histL, eT, histL, eB, { role: 'axis', width: 1 });
  textPx(g, histL + 4, eT - 14, '|*ψ*|^{2}', { size: 12, color: INK });

  // Screen axis y (right of the histogram).
  const ax = histR + 4;
  linePx(g, ax, eT, ax, eB, { role: 'axis', width: 1 });
  for (const v of niceTicks(-s.Y / s.unit, s.Y / s.unit, 4)) {
    const y = yPx(v * s.unit);
    linePx(g, ax, y, ax + 4, y, { role: 'axis', width: 1 });
    textPx(g, ax + 7, y, fmtTickSigned(v), { size: 11, color: TICK, align: 'left', baseline: 'middle' });
  }
  textPx(g, o.r - pad + (narrow ? 4 : 0), eT - 14, `*y* (${s.unitLabel})`, { size: 12, color: TICK, align: 'right' });

  // Fringe spacing Δy left of the screen, only when the first order is resolvable and on the screen.
  if (fr.resolvable && fr.onScreen) {
    const xb = panelL - 7;
    const y0 = yPx(0);
    const y1 = yPx(fr.y1);
    linePx(g, xb, y0, xb, y1, { color: INK, width: 1.25 });
    linePx(g, xb - 4, y0, xb + 2, y0, { color: INK, width: 1.25 });
    linePx(g, xb - 4, y1, xb + 2, y1, { color: INK, width: 1.25 });
    textPx(g, xb - 6, (y0 + y1) / 2, 'Δ*y*', { size: 13, color: INK, align: 'right', baseline: 'middle' });
  }
}

const fmtTickSigned = (v: number) => {
  if (Math.abs(v) < 1e-12) return '0';
  const s = Number(v.toPrecision(6)).toString();
  return s.startsWith('-') ? '−' + s.slice(1) : s;
};

// ------------------------------------------------------------------ formula panel

export function formulaLines(p: PD): string[] {
  const id = p.part as ParticleId;
  const m = PARTICLES[id].mass;
  const v = speedOf(p);
  const g = gammaOf(v);
  const pp = momentumOf(m, v);
  const lam = H / pp;
  const s = STRUCTS[structIdOf(p)];
  const fr = fringe(s, lam);
  const K = kineticOf(m, v);
  const mTex = id === 'ball' ? '0.145\\ \\text{kg}' : `${texNum(m, 4, 0)}\\ \\text{kg}`;
  const eV = K / EV;
  const Ktex =
    id === 'ball'
      ? `${texNum(K, 3)}\\ \\text{J}`
      : eV >= 1e4
        ? `${texNum(eV / 1e3, 3)}\\ \\text{keV}`
        : eV < 0.1
          ? `${texNum(eV * 1e3, 3, 0)}\\ \\text{meV}`
          : `${texNum(eV, 3)}\\ \\text{eV}`;
  const rel = g - 1 > 1e-3;
  const lines = [
    `m = ${mTex},\\quad v = ${texNum(v, 3)}\\ \\text{m/s}${rel ? `,\\quad \\gamma = ${texNum(g, 4)}` : ''}`,
    `p = ${rel ? '\\gamma m v' : 'm v'} = ${texNum(pp, 3, 0)}\\ \\text{kg\\,m/s},\\quad K = ${rel ? '(\\gamma - 1)\\,mc^2' : '\\tfrac12 mv^2'} = ${Ktex}`,
    `\\lambda = \\frac{h}{p} = \\frac{6.626\\times10^{-34}\\ \\text{J\\,s}}{${texNum(pp, 3, 0)}\\ \\text{kg\\,m/s}} = ${lenTex(lam)}`,
  ];
  // Apparatus constants exact (0.215 nm, 1 mm, 1.25 m), not padded to three figures.
  const dTex = lenTex(s.d, 3, true);
  const sinL = `\\sin\\theta_1 = \\frac{\\lambda}{d} = \\frac{${lenTex(lam)}}{${dTex}} = ${texNum(fr.ratio, 3, 0)}`;
  if (fr.ratio >= 1) {
    lines.push(`${sinL} > 1\\ \\ (\\text{${t('ch38.df.f.none')}})`);
    return lines;
  }
  const deg = (fr.theta1 * 180) / Math.PI;
  const small = fr.theta1 < 0.1;
  const LTex = lenTex(s.L, 3, true);
  lines.push(small ? sinL : `${sinL},\\quad \\theta_1 = ${texNum(deg, 3)}^\\circ`);
  lines.push(
    small
      ? `\\Delta y \\approx \\frac{\\lambda L}{d} = \\frac{(${lenTex(lam)})(${LTex})}{${dTex}} = ${lenTex(fr.dyApprox)}`
      : `\\Delta y = L\\tan\\theta_1 = (${LTex})\\tan ${texNum(deg, 3)}^\\circ = ${lenTex(fr.y1)}`,
  );
  if (!fr.resolvable) {
    // δ with enough figures that it never prints equal to the Δy above (3 figures). The criterion
    // uses L tan θ₁, and λL/d = L sin θ₁ is smaller still.
    let sig = 3;
    while (sig < 6 && lenTex(small ? fr.dyApprox : fr.y1) === lenTex(fr.res, sig)) sig++;
    lines.push(`\\Delta y < \\delta = ${lenTex(fr.res, sig)}\\ \\ (\\text{${t('ch38.df.f.unres')}})`);
  }
  else if (!fr.onScreen) lines.push(`\\Delta y > Y = ${lenTex(s.Y, 2, true)}\\ \\ (\\text{${t('ch38.df.f.off')}})`);
  return lines;
}

// ------------------------------------------------------------------ scene

export const diffractionScene: Scene<PD, S> = {
  id: 'debroglie',
  title: 'ch38.df.scene',
  params,
  world: PX_WORLD,
  time: { h: 0.02, recordEvery: 5, frameStep: 0.2, tEnd: T_END, unit: '' },

  init: (p, rng) => {
    const smp = samplerOf(STRUCTS[structIdOf(p)], lambdaP(p));
    const hits: Hit[] = [];
    for (let k = 0; k < MAX_HITS; k++) hits.push(smp.sample(rng));
    return { t: 0, hits, arrive: ARRIVE };
  },
  step: (s, h) => {
    s.t += h;
  },
  record: (s) => ({ t: s.t, n: hitsBy(s.t) }),
  snapshot: (s) => ({ ...s }),

  draw: (g, s, p, ui) => drawScene(g, s, p, ui?.tFrame ?? s.t),

  readouts: [
    { label: '\\lambda', unit: 'm', value: (_s, p) => lambdaP(p), zeroTol: 0 },
    { label: '\\Delta y', unit: 'm', value: (_s, p) => fringe(STRUCTS[structIdOf(p)], lambdaP(p)).y1, zeroTol: 0 },
    { label: 'N', unit: '', value: (s) => Math.min(s.hits.length, hitsBy(s.t)), sig: 1 },
  ],

  formula: (_s, p) => formulaLines(p),

  info: {
    goals: ['ch38.df.goal.dots', 'ch38.df.goal.scale'],
    observe: ['ch38.df.obs.single', 'ch38.df.obs.dg', 'ch38.df.obs.speed', 'ch38.df.obs.neutron', 'ch38.df.obs.c60', 'ch38.df.obs.ball', 'ch38.df.obs.same'],
    equations: [
      '\\lambda = \\frac{h}{p}, \\qquad p = \\gamma m v',
      'd\\sin\\theta_m = m\\lambda, \\qquad \\Delta y \\approx \\frac{\\lambda L}{d}',
      'P(\\theta) \\propto \\lvert\\psi\\rvert^2 \\propto \\left[\\frac{\\sin(N\\pi d\\sin\\theta/\\lambda)}{N\\sin(\\pi d\\sin\\theta/\\lambda)}\\right]^2 \\left[\\frac{\\sin\\beta}{\\beta}\\right]^2 \\cos^2\\theta, \\quad \\beta = \\frac{\\pi a\\sin\\theta}{\\lambda}',
    ],
    assumptions: ['ch38.df.as.model', 'ch38.df.as.struct', 'ch38.df.as.res', 'ch38.df.as.size', 'ch38.df.as.beam', 'ch38.df.as.rel', 'ch38.df.as.anim'],
  },
};
