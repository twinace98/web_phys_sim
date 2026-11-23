// Ch 13 scene: launch a probe from a given altitude with a speed set as a fraction of the local
// escape speed, and drag its direction. The sign of E = K + U decides: ellipse, parabola or
// hyperbola.
// Free-body diagram: the one force on the probe, F_g = GMm/r² towards the Earth's centre.
import { t as tr } from '../../core/i18n';
import { num, slider, tn, u } from '../../core/tex';
import type { ParamSchema, Scene, Vec2 } from '../../core/types';
import type { Draw } from '../../draw/draw';
import { drawFbd, fbdParam, fbdScale, type FbdForce } from '../../draw/fbd';
import { ROLE_COLOR } from '../../draw/theme';
import { GM, R_EARTH, accel, classify, elements, energy, escapeSpeed, radius, speed, yoshida, type Body, type OrbitKind, type V2 } from './physics';

export type P = { speed: number; alt: number; dir: number; predict: boolean; areas: boolean; ueff: boolean; fbd: boolean };

interface S {
  t: number;
  n: number;
}

const H = 20; // physics step [s]
const SUB = 8; // Yoshida substeps per physics step (2.5 s)
const MASS = 1000; // probe mass [kg], for K, U, E in GJ
const MM = 1e6; // world unit: 10³ km
const DEG = Math.PI / 180;
const EARTH_FILL = '#dce8f2';
const EARTH_LINE = '#8fb3cf';
const SECTOR_FILL = ['#E69F00', '#56B4E9'];

/** v0 / v_esc; 0.71 on the slider means exactly the circular speed 1/√2. */
const fraction = (p: P) => (Math.abs(p.speed - Math.SQRT1_2) < 0.005 ? Math.SQRT1_2 : p.speed);
const r0Of = (p: P) => R_EARTH + p.alt * 1e3;

/** Launch on the left of the Earth; dir = angle from the counter-clockwise tangent towards outward radial. */
function launch(p: P, dirDeg = p.dir): Body {
  const r0 = r0Of(p);
  const v = fraction(p) * escapeSpeed(r0);
  const d = dirDeg * DEG;
  // At (−r0, 0): tangent (0, −1), outward radial (−1, 0).
  return { x: [-r0, 0], v: [-Math.sin(d) * v, -Math.cos(d) * v] };
}

const GAUGE = 0.6; // escape-speed circle at launch: at least this fraction of r0 ...
const GAUGE_VIEW = 0.09; // ... and at least this fraction of the view, so it stays readable on huge orbits
const INSET_STRIP = 0.62; // width of the strip reserved for the U_eff diagram, as a fraction of the view height
const R_STOP = 2.5; // escaping probes stop at this many r0, a circle that lies inside the view

export interface View {
  /** World box [m]. */
  x: [number, number];
  y: [number, number];
  /** Escape-speed circle radius at launch [m]: sets the velocity scale. */
  g0: number;
  /** Escape orbits stop at this distance [m]; Infinity for bound orbits. */
  rStop: number;
}

/** Eccentricity vector (points to the periapsis). */
function eccVector(b: Body): V2 {
  const r = radius(b);
  const v2 = b.v[0] ** 2 + b.v[1] ** 2;
  const rv = b.x[0] * b.v[0] + b.x[1] * b.v[1];
  return [((v2 - GM / r) * b.x[0] - rv * b.v[0]) / GM, ((v2 - GM / r) * b.x[1] - rv * b.v[1]) / GM];
}

let viewKey = '';
let viewMemo: View | null = null;
/**
 * View box [m]: the worst case over every launch direction (−90° to 90°) for this speed and
 * altitude, so the probe and the predicted path stay on stage whatever direction is dragged, and
 * dragging never rescales the view. Bound orbits: union of the bounding boxes of all the ellipses.
 * Escape orbits: the circle r ≤ R_STOP r0 where they are stopped. Padded by the escape-speed circle
 * that travels with the probe (radius g0 √(r0/r)).
 */
export function view(p: P): View {
  const key = `${p.speed}|${p.alt}`;
  if (key === viewKey && viewMemo) return viewMemo;
  const r0 = r0Of(p);
  const f = fraction(p);
  const box = { x0: -r0, x1: R_EARTH, y0: -R_EARTH, y1: R_EARTH };
  const grow = (x0: number, x1: number, y0: number, y1: number) => {
    box.x0 = Math.min(box.x0, x0);
    box.x1 = Math.max(box.x1, x1);
    box.y0 = Math.min(box.y0, y0);
    box.y1 = Math.max(box.y1, y1);
  };
  grow(-R_EARTH, R_EARTH, -R_EARTH, R_EARTH);
  let rLow = r0; // lowest distance any direction reaches (surface if some crash)
  let rStop = Infinity;
  if (f < 1) {
    for (let d = -90; d <= 90; d++) {
      const b = launch(p, d);
      const { a, e, rp } = elements(b);
      const ev = eccVector(b);
      const w = e > 1e-9 ? Math.atan2(ev[1], ev[0]) : 0;
      const bb = a * Math.sqrt(Math.max(0, 1 - e * e));
      const cx = -a * e * Math.cos(w);
      const cy = -a * e * Math.sin(w);
      const hx = Math.hypot(a * Math.cos(w), bb * Math.sin(w));
      const hy = Math.hypot(a * Math.sin(w), bb * Math.cos(w));
      grow(cx - hx, cx + hx, cy - hy, cy + hy);
      rLow = Math.min(rLow, Math.max(R_EARTH, rp));
    }
  } else {
    rStop = R_STOP * r0;
    grow(-rStop, rStop, -rStop, rStop);
    rLow = R_EARTH;
  }
  const D = Math.max(box.x1 - box.x0, box.y1 - box.y0);
  const g0 = Math.max(GAUGE * r0, GAUGE_VIEW * D);
  // Around the probe at distance r: the gauge circle, radius g0 √(r0/r), and the velocity arrow,
  // length g0 √(f² − 1 + r0/r) (longer than the circle on escape orbits).
  const gAt = (r: number) => g0 * Math.sqrt(Math.max(0, f * f - 1) + r0 / Math.max(r, rLow));
  const rho = rLow + gAt(rLow);
  grow(-rho, rho, -rho, rho);
  grow(-r0 - g0, -r0 + g0, -g0, g0);
  const m = 0.04 * D;
  viewMemo = {
    x: [box.x0 - gAt(-box.x0) - m, box.x1 + gAt(box.x1) + m],
    y: [box.y0 - gAt(-box.y0) - m, box.y1 + gAt(box.y1) + m],
    g0,
    rStop,
  };
  viewKey = key;
  return viewMemo;
}

export interface Model {
  b0: Body;
  kind: OrbitKind;
  /** Positions [m] and velocities [m/s] at every physics step. */
  xs: Float64Array;
  vs: Float64Array;
  N: number;
  crashed: boolean;
  period: number;
  sectorDt: number;
  rMax: number;
  /** Lowest distance along the computed path [m] (R_EARTH after a crash). */
  rMin: number;
  /** Largest speed and escape speed reached [m/s]. */
  vMax: number;
  /** Plot range of the specific energies [J/kg]. */
  eMin: number;
  eMax: number;
}

let memoKey = '';
let memo: Model | null = null;
export function model(p: P): Model {
  const key = `${p.speed}|${p.alt}|${p.dir}`;
  if (key === memoKey && memo) return memo;
  const b0 = launch(p);
  const kind = p.speed === 1 ? 'parabola' : classify(b0);
  const el = elements(b0);
  const r0 = r0Of(p);
  const tCirc = 2 * Math.PI * Math.sqrt(r0 ** 3 / GM);
  // Three orbits, but never more than 40 circular periods (orbits just below escape are huge);
  // always at least one full orbit so the predicted path closes. Escape orbits stop at rStop.
  const tMax = kind === 'ellipse' ? Math.max(el.period, Math.min(3 * el.period, 40 * tCirc)) : 20 * tCirc;
  const rStop = view(p).rStop;
  const nMax = Math.ceil(tMax / H);
  const xs = new Float64Array(2 * (nMax + 1));
  const vs = new Float64Array(2 * (nMax + 1));
  const b: Body = { x: [...b0.x], v: [...b0.v] };
  xs.set(b.x, 0);
  vs.set(b.v, 0);
  let N = nMax;
  let crashed = false;
  let rMax = radius(b);
  let rMin = radius(b);
  let vMax = speed(b);
  for (let n = 1; n <= nMax; n++) {
    for (let k = 0; k < SUB; k++) yoshida(b, H / SUB);
    const r = radius(b);
    if (r <= R_EARTH) {
      // Stop on the surface along the last direction, with the impact speed E gives there
      // (the step overshot below the surface; snapping x alone would make E jump).
      const E0 = energy(b);
      b.x = [(b.x[0] * R_EARTH) / r, (b.x[1] * R_EARTH) / r];
      const k = Math.sqrt(Math.max(0, 2 * (E0 + GM / R_EARTH))) / (speed(b) || 1);
      b.v = [b.v[0] * k, b.v[1] * k];
      crashed = true;
    }
    xs.set(b.x, 2 * n);
    vs.set(b.v, 2 * n);
    rMax = Math.max(rMax, radius(b));
    rMin = Math.min(rMin, radius(b));
    vMax = Math.max(vMax, speed(b));
    if (crashed || (kind !== 'ellipse' && radius(b) >= rStop)) {
      N = n;
      break;
    }
  }
  const E = energy(b0);
  memo = {
    b0,
    kind,
    xs,
    vs,
    N,
    crashed,
    period: el.period,
    sectorDt: (kind === 'ellipse' ? el.period : tCirc) / 12,
    rMax,
    rMin,
    vMax: Math.max(vMax, escapeSpeed(rMin)),
    eMin: Math.min(-GM / rMin, E),
    eMax: Math.max(0.5 * vMax * vMax, E, 0),
  };
  memoKey = key;
  return memo;
}

function bodyAt(p: P, n: number): Body {
  const m = model(p);
  const i = 2 * Math.min(n, m.N);
  return { x: [m.xs[i], m.xs[i + 1]], v: [m.vs[i], m.vs[i + 1]] };
}

const w = (x: number[] | Float64Array, i: number): Vec2 => ({ x: x[i] / MM, y: x[i + 1] / MM });

/** Probe state after n physics steps (the run's last state beyond its end). */
export const probeAt = (p: P, n: number): Body => bodyAt(p, n);
export { MASS as PROBE_MASS };

/** The one force on the probe [N]: gravitation of the Earth, m times the acceleration the integrator uses. */
export function fbdForces(b: Body): FbdForce[] {
  const a = accel(b.x);
  return [{ F: { x: MASS * a[0], y: MASS * a[1] }, label: '*F*_{g}', field: true }];
}

/** Px per newton for the run: the largest F_g, at the lowest point of the path, gets the full length. */
export const fbdPerN = (p: P) => fbdScale((GM * MASS) / model(p).rMin ** 2);

/**
 * With the diagram on, v gives way where it would run along F_g (within 30°: a launch close to
 * straight down, or falling back); elsewhere the two arrows point apart.
 */
export function velocityClear(b: Body): boolean {
  const vx = b.v[0];
  const vy = b.v[1];
  const sp = Math.hypot(vx, vy);
  const r = radius(b);
  if (sp === 0) return true;
  // cos of the angle between v and the inward radial (−x/r).
  return (-(vx * b.x[0] + vy * b.x[1]) / (sp * r)) < Math.cos(30 * DEG);
}

const params: ParamSchema<P> = {
  speed: { kind: 'number', label: 'ch13.p.speed', desc: 'ch13.d.speed', group: 'main', live: false, control: 'slider', min: 0.3, max: 1.4, step: 0.01, default: 0.85 },
  alt: { kind: 'number', label: 'ch13.p.alt', desc: 'ch13.d.alt', group: 'main', live: false, control: 'slider', min: 1000, max: 15000, step: 500, default: 6000, unit: 'km' },
  fbd: fbdParam(),
  dir: { kind: 'number', label: 'ch13.p.dir', desc: 'ch13.d.dir', group: 'hidden', live: false, control: 'slider', min: -90, max: 90, default: 0 },
  predict: { kind: 'toggle', label: 'ch13.p.predict', desc: 'ch13.d.predict', group: 'advanced', live: true, default: true },
  areas: { kind: 'toggle', label: 'ch13.p.areas', desc: 'ch13.d.areas', group: 'advanced', live: true, default: false },
  ueff: { kind: 'toggle', label: 'ch13.p.ueff', desc: 'ch13.d.ueff', group: 'advanced', live: true, default: false },
};

/**
 * Energy diagram in the lower-right corner of the stage (screen px): effective potential
 * U_eff(r) = −GMm/r + L²/(2mr²), the level E, and the current r. Where E meets U_eff the probe
 * turns around (periapsis, apoapsis); the gap E − U_eff is the radial kinetic energy.
 */
function effectivePotential(g: Draw, p: P, rNow: number): void {
  const m = model(p);
  const h = m.b0.x[0] * m.b0.v[1] - m.b0.x[1] * m.b0.v[0];
  const E = energy(m.b0);
  const U = (r: number) => -GM / r + (h * h) / (2 * r * r);
  const r0 = R_EARTH;
  const r1 = Math.max(m.rMax, 2 * r0Of(p)) * 1.15;
  let uMin = 0;
  for (let i = 0; i <= 100; i++) uMin = Math.min(uMin, U(r0 + ((r1 - r0) * i) / 100));
  const y0 = Math.min(uMin, E) * 1.15;
  const y1 = Math.max(E, 0) + 0.35 * Math.abs(y0);
  const ctx = g.ctx;
  // Inside the empty strip right of the orbit box (see world), at most 210 × 130 px.
  const stripLeft = g.vp.toPx(view(p).x[1] / MM, 0)[0];
  const W = Math.max(110, Math.min(210, g.vp.w - stripLeft - 16));
  const Hh = Math.round(Math.min(130, 0.62 * W));
  const bx = g.vp.w - W - 10;
  const by = g.vp.h - Hh - 10;
  const X = (r: number) => bx + 10 + ((r - r0) / (r1 - r0)) * (W - 20);
  const Y = (u: number) => by + 22 + ((y1 - u) / (y1 - y0)) * (Hh - 32);
  ctx.save();
  ctx.fillStyle = 'rgba(255,255,255,0.92)';
  ctx.strokeStyle = '#d0d0d0';
  ctx.lineWidth = 1;
  ctx.fillRect(bx, by, W, Hh);
  ctx.strokeRect(bx + 0.5, by + 0.5, W, Hh);
  // r axis at U = 0.
  ctx.strokeStyle = '#c4c4c4';
  ctx.beginPath();
  ctx.moveTo(X(r0), Y(0));
  ctx.lineTo(X(r1), Y(0));
  ctx.stroke();
  ctx.beginPath();
  ctx.rect(bx + 1, by + 1, W - 2, Hh - 2);
  ctx.clip();
  ctx.strokeStyle = ROLE_COLOR.energyU;
  ctx.lineWidth = 2;
  ctx.setLineDash([5, 3]);
  ctx.beginPath();
  for (let i = 0; i <= 120; i++) {
    const r = r0 + ((r1 - r0) * i) / 120;
    if (i) ctx.lineTo(X(r), Y(U(r)));
    else ctx.moveTo(X(r), Y(U(r)));
  }
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.strokeStyle = ROLE_COLOR.energyE;
  ctx.beginPath();
  ctx.moveTo(X(r0), Y(E));
  ctx.lineTo(X(r1), Y(E));
  ctx.stroke();
  // Current r: from U_eff(r) up to E is the radial kinetic energy.
  const xr = X(Math.min(rNow, r1));
  ctx.strokeStyle = ROLE_COLOR.energyK;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(xr, Y(U(rNow)));
  ctx.lineTo(xr, Y(E));
  ctx.stroke();
  ctx.fillStyle = ROLE_COLOR.position;
  ctx.beginPath();
  ctx.arc(xr, Y(E), 4, 0, 2 * Math.PI);
  ctx.fill();
  ctx.restore();
  const at = (x: number, y: number): Vec2 => {
    const [wx, wy] = g.vp.toWorld(x, y);
    return { x: wx, y: wy };
  };
  // Labels at the right end: E on the side of its line away from the U_eff tail, U_eff on the
  // side of the tail away from E.
  const tailAbove = U(r1) > E;
  const clampY = (y: number) => Math.min(Math.max(y, by + 14), by + Hh - 5);
  g.text(at(bx + W - 8, clampY(Y(U(r1)) + (tailAbove ? -6 : 15))), '*U*_{eff}', { size: 12, role: 'energyU', align: 'right' });
  g.text(at(bx + W - 8, clampY(Y(E) + (tailAbove ? 15 : -6))), '*E*', { size: 12, color: '#1a1a1a', align: 'right' });
  g.text(at(bx + W - 8, Y(0) - 5), '*r*', { size: 12, color: '#6b6b6b', align: 'right' });
}

/** World length per m/s of velocity: the escape-speed circle at launch has radius g0. */
const kv = (p: P) => view(p).g0 / MM / escapeSpeed(r0Of(p));

function sectors(g: Draw, p: P, n: number): void {
  const m = model(p);
  const at = (k: number) => Math.round((k * m.sectorDt) / H);
  const nEnd = Math.min(n, m.kind === 'ellipse' ? at(12) : m.N);
  for (let k = 0; at(k + 1) <= nEnd; k++) {
    const pts: Vec2[] = [{ x: 0, y: 0 }];
    for (let i = at(k); i <= at(k + 1); i++) pts.push(w(m.xs, 2 * i));
    g.polygon(pts, { fill: SECTOR_FILL[k % 2], fillAlpha: 0.25 });
  }
}

/** Sim seconds per wall second at 1×: 4000, faster for long ellipses so one orbit takes at most ORBIT_WALL s. */
const SCALE = 4000;
const ORBIT_WALL = 10;
export function timeScaleOf(p: P): number {
  // The period depends only on the energy (speed and altitude), not on the dragged direction.
  const r0 = r0Of(p);
  const f = fraction(p);
  if (p.speed === 1 || f >= 1) return SCALE;
  const a = r0 / (2 * (1 - f * f));
  return Math.max(SCALE, (2 * Math.PI * Math.sqrt(a ** 3 / GM)) / ORBIT_WALL);
}

/** Smallest drawn Earth radius [px], kept inside the lowest point of the path. */
const EARTH_MIN_PX = 6;

/** E [GJ] at the escape speed: a numerical residue of a few GJ runs, printed as an exact 0 (R7a); else undefined (3 figures). */
const eZero = (E: number) => (Math.abs(E) < 1e-6 ? '0' : undefined);

/** A speed in m/s to 3 figures, with a power of ten from 10³ m/s on (6823 → 6.82×10³, as v = 6.82 km/s). */
function tsi(x: number): string {
  const e = Math.floor(Math.log10(Math.abs(Number(x.toPrecision(3)))));
  return e < 3 ? tn(x) : `${tn(x / 10 ** e)}\\times 10^{${e}}`;
}

/**
 * Σ panel at the probe's current position (SI inside, GJ and km/s out, as in the readouts): K, U,
 * E = K + U (fixed by the launch), the local escape speed and how v compares with it (E < 0 ⇔ v < v_esc).
 */
export function formulaLines(s: S, p: P): string[] {
  const m = model(p);
  const b = bodyAt(p, s.n);
  const r = radius(b);
  const v = speed(b);
  const K = (0.5 * MASS * v * v) / 1e9;
  const U = (-GM * MASS) / r / 1e9;
  const E = (MASS * energy(m.b0)) / 1e9;
  const vesc = escapeSpeed(r);
  // Inputs to 3 figures (policy D, R3); GM as Halliday's G M_E = (6.67×10⁻¹¹)(5.98×10²⁴) = 3.99×10¹⁴,
  // the model keeps 3.986×10¹⁴. Results print from the unrounded values, like the readouts.
  const gm = tn(GM);
  const rel = m.kind === 'ellipse' ? '<' : m.kind === 'hyperbola' ? '>' : '=';
  // E = K + U nearly cancels close to the escape speed (31.6 + (−32.2) = −0.641 GJ at 0.99), so E is
  // also computed without the cancellation (R5): at launch K₀ = f² GMm/r₀ with f = v₀/v_esc the
  // slider value (0.71: exactly 1/√2), so E = (f² − 1) GMm/r₀.
  const f2 = Math.abs(p.speed - Math.SQRT1_2) < 0.005 ? '(1/\\sqrt{2})^2' : `${slider(params.speed, p.speed)}^2`;
  const U0 = (GM * MASS) / r0Of(p) / 1e9;
  const lines = [
    `K = \\tfrac12 mv^2 = \\tfrac12(${num(MASS)})(${tsi(v)})^2\\ \\mathrm{J} = ${tn(K)}${u('GJ')}`,
    `U = -\\frac{GMm}{r} = -\\frac{(${gm})(${num(MASS)})}{${tn(r)}}\\ \\mathrm{J} = ${tn(U)}${u('GJ')}`,
    `E = K + U = ${tn(K)} + (${tn(U)})`,
    `= \\big[(v_0/v_\\mathrm{esc})^2 - 1\\big]\\,GMm/r_0`,
    `= (${f2} - 1)(${tn(U0)}${u('GJ')}) = ${eZero(E) ?? tn(E)}${u('GJ')}`,
    `v_\\mathrm{esc} = \\sqrt{\\frac{2GM}{r}} = \\sqrt{\\frac{2(${gm})}{${tn(r)}}}\\ \\mathrm{m/s} = ${tn(vesc / 1e3)}${u('km/s')}`,
    `v = ${tn(v / 1e3)}${u('km/s')} ${rel} v_\\mathrm{esc}`,
  ];
  if (p.fbd) {
    // The free-body diagram has one force: the net force is F_g.
    const F = (GM * MASS) / (r * r);
    lines.push(`\\Sigma F = F_g = \\frac{GMm}{r^2} = \\frac{(${gm})(${num(MASS)})}{(${tn(r)})^2} = ${tn(F)}${u('N')} = ma`);
  }
  return lines;
}

export const orbitScene: Scene<P, S> = {
  id: 'orbit',
  title: 'ch13.o.scene',
  params,
  time: { h: H, recordEvery: 2, frameStep: 200, scale: (p) => timeScaleOf(p as P), tEnd: (p) => model(p as P).N * H },

  world: (p) => {
    const v = view(p);
    // The U_eff diagram gets an empty strip on the right, so it never covers the orbit.
    const strip = p.ueff ? INSET_STRIP * (v.y[1] - v.y[0]) : 0;
    return { x: [v.x[0] / MM, (v.x[1] + strip) / MM], y: [v.y[0] / MM, v.y[1] / MM], aspect: 'contain', padPx: 12 };
  },

  init: () => ({ t: 0, n: 0 }),
  step: (s, _h, p) => {
    s.n = Math.min(s.n + 1, model(p).N);
    s.t = s.n * H;
  },

  record: (s, p) => {
    const b = bodyAt(p, s.n);
    const r = radius(b);
    const v = speed(b);
    const K = (0.5 * MASS * v * v) / 1e9;
    const U = (-GM * MASS) / r / 1e9;
    return { t: s.t, r: r / MM, v: v / 1e3, vesc: escapeSpeed(r) / 1e3, K, U, E: K + U };
  },
  snapshot: (s) => ({ ...s }),

  draw: (g, s, p) => {
    const m = model(p);
    const O: Vec2 = { x: 0, y: 0 };
    if (p.areas) sectors(g, p, s.n);

    // Earth.
    // On huge near-escape orbits the Earth would shrink to a few px: draw it at least EARTH_MIN_PX,
    // but never out to the lowest point of the path (a crash keeps the true size).
    const rE = Math.max(R_EARTH / MM, Math.min(g.px(EARTH_MIN_PX), (0.8 * m.rMin) / MM));
    const earth: Vec2[] = [];
    for (let i = 0; i < 96; i++) earth.push({ x: rE * Math.cos((i / 96) * 2 * Math.PI), y: rE * Math.sin((i / 96) * 2 * Math.PI) });
    g.polygon(earth, { fill: EARTH_FILL, color: EARTH_LINE, width: 1.25 });
    g.circle(O, 2, { fill: EARTH_LINE });

    // Predicted path (dotted) and path flown so far (solid).
    if (p.predict) {
      const pts: Vec2[] = [];
      const step = Math.max(1, Math.floor(m.N / 1500));
      for (let i = 0; i <= m.N; i += step) pts.push(w(m.xs, 2 * i));
      pts.push(w(m.xs, 2 * m.N));
      g.polyline(pts, { color: '#8c8c8c', width: 1.5, dash: [3, 5] });
    }
    const flown: Vec2[] = [];
    const step = Math.max(1, Math.floor(s.n / 1500));
    for (let i = 0; i < s.n; i += step) flown.push(w(m.xs, 2 * i));
    flown.push(w(m.xs, 2 * s.n));
    g.polyline(flown, { role: 'position', width: 1.75, alpha: 0.7 });

    const k = kv(p);
    const L0 = w(m.b0.x, 0);
    if (s.n > 0) {
      // Launch point and launch velocity stay draggable while the probe flies.
      g.arrow(L0, { x: m.b0.v[0] * k, y: m.b0.v[1] * k }, { role: 'velocity', width: 1.25, alpha: 0.4 });
      g.circle(L0, 3.5, { fill: '#ffffff', role: 'position', width: 1.25 });
    } else {
      g.circle({ x: L0.x + m.b0.v[0] * k, y: L0.y + m.b0.v[1] * k }, 14, { fill: 'velocity', alpha: 0.12 });
    }

    const b = bodyAt(p, s.n);
    const P0 = w(b.x, 0);
    const r = radius(b);
    if (m.crashed && s.n >= m.N) {
      const d = g.px(6);
      g.line({ x: P0.x - d, y: P0.y - d }, { x: P0.x + d, y: P0.y + d }, { color: '#1a1a1a', width: 2.5 });
      g.line({ x: P0.x - d, y: P0.y + d }, { x: P0.x + d, y: P0.y - d }, { color: '#1a1a1a', width: 2.5 });
    } else {
      const fbd = p.fbd;
      if (!fbd || velocityClear(b)) g.arrow(P0, { x: b.v[0] * k, y: b.v[1] * k }, { role: 'velocity', width: 2.5, label: '*v*' });
      // Faded under the free-body diagram, so the arrow from its centre reads.
      g.circle(P0, 6, { fill: 'position', alpha: fbd ? 0.25 : 1 });
      if (fbd) drawFbd(g, P0, fbdForces(b), fbdPerN(p));
    }

    // Orbit type from the sign of E.
    const name = tr(`ch13.kind.${m.kind}`) + (m.crashed ? ` · ${tr('ch13.kind.crash')}` : '');
    g.screenText(14, 22, name, { size: 13, color: '#1a1a1a' });

    if (p.ueff) effectivePotential(g, p, r);
  },

  handles: [
    {
      pos: (_s, p) => {
        const m = model(p);
        const k = kv(p);
        const L0 = w(m.b0.x, 0);
        return { x: L0.x + m.b0.v[0] * k, y: L0.y + m.b0.v[1] * k };
      },
      radiusPx: 16,
      onDrag: (ctx, _s, q) => {
        const L0 = { x: -r0Of(ctx.params) / MM, y: 0 };
        // Angle from the tangent (0, −1) towards the outward radial (−1, 0).
        const dx = q.x - L0.x;
        const dy = q.y - L0.y;
        let dir = Math.round(Math.atan2(-dx, -dy) / DEG);
        dir = Math.max(-90, Math.min(90, dir));
        if (dir !== ctx.params.dir) ctx.set('dir', dir);
      },
    },
  ],

  plots: [
    { id: 'r', label: 'r\\,(10^3\\,\\mathrm{km})', traces: [{ channel: 'r', role: 'position' }], yRange: (p) => [0, (model(p).rMax / MM) * 1.1] },
    {
      id: 'v',
      label: `\\textcolor{${ROLE_COLOR.velocity}}{v},\\ \\textcolor{${ROLE_COLOR.muted}}{v_\\mathrm{esc}}\\,(\\mathrm{km/s})`,
      traces: [
        { channel: 'vesc', role: 'muted' },
        { channel: 'v', role: 'velocity' },
      ],
      yRange: (p) => [0, (model(p).vMax / 1e3) * 1.08],
    },
    {
      id: 'E',
      label: `\\textcolor{${ROLE_COLOR.energyK}}{K},\\ \\textcolor{${ROLE_COLOR.energyU}}{U},\\ E\\,(\\mathrm{GJ})`,
      traces: [
        { channel: 'K', role: 'energyK' },
        { channel: 'U', role: 'energyU' },
        { channel: 'E', role: 'energyE' },
      ],
      yRange: (p) => {
        const m = model(p);
        const lo = (MASS * m.eMin) / 1e9;
        const hi = (MASS * m.eMax) / 1e9;
        const pad = 0.08 * (hi - lo);
        return [lo - pad, hi + pad];
      },
    },
  ],

  readouts: [
    { label: 'v', unit: 'km/s', value: (s, p) => speed(bodyAt(p, s.n)) / 1e3 },
    { label: 'v_\\mathrm{esc}', unit: 'km/s', value: (s, p) => escapeSpeed(radius(bodyAt(p, s.n))) / 1e3 },
    { label: 'E', unit: 'GJ', value: (_s, p) => (MASS * energy(model(p).b0)) / 1e9, format: eZero },
  ],

  formula: (s, p) => formulaLines(s, p),

  info: {
    goals: ['ch13.o.goal.law', 'ch13.o.goal.E', 'ch13.o.goal.esc'],
    observe: ['ch13.o.obs.dir', 'ch13.o.obs.circ', 'ch13.o.obs.energy', 'ch13.o.obs.crash', 'ch13.o.obs.kepler', 'ch13.o.obs.ueff'],
    equations: [
      'F = \\frac{GMm}{r^2}, \\quad U = -\\frac{GMm}{r}',
      'E = K + U = \\tfrac{1}{2}mv^2 - \\frac{GMm}{r}',
      'v_\\mathrm{esc} = \\sqrt{\\frac{2GM}{r}}, \\quad v_\\mathrm{circ} = \\sqrt{\\frac{GM}{r}} = \\frac{v_\\mathrm{esc}}{\\sqrt 2}',
    ],
    assumptions: ['ch13.o.assume', 'ch13.o.assume.num'],
  },
};

