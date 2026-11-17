// Photoelectric effect: a phototube lit by photons of one wavelength, ejected electrons crossing
// the gap against (or with) the applied voltage, an ammeter, a photon-energy gauge, and two plots:
// measured stopping voltages against frequency (fitted line, slope h/e) and the I–V curve.
// The measured points live in the hidden array parameter D, so they survive in the URL.
import { fmt } from '../../../core/format';
import { t } from '../../../core/i18n';
import type { Rng } from '../../../core/rng';
import type { Handle, ParamSchema, Scene, SceneCtx, Vec2 } from '../../../core/types';
import type { Draw } from '../../../draw/draw';
import { measureRich } from '../../../draw/text';
import { Frame, PX_WORLD, TICK, W, canvasBox, linePx, rectPx, split, textPx, type Box } from '../../modern/frame';
import { wavelengthRGB } from '../../wave2d/field';
import {
  HC_EV_NM,
  H_OVER_E,
  METALS,
  MAX_POINTS,
  QE,
  addPoint,
  classicalDelay,
  current,
  currentClassical,
  emptyPoints,
  fitLines,
  frequency,
  iSat,
  kMax,
  metalIndex,
  photonEnergy,
  photonRate,
  pointValues,
  readPoints,
  thresholdNm,
  vStop,
  vStopClassical,
  type Fit,
} from './physics';

export type P = { lam: number; V: number; metal: string; power: number; classical: boolean; D: number[] };

interface Photon {
  /** Progress along the beam, 0 (source) to 1 (emitter face). */
  s: number;
  /** Hit point along the emitter face, 0 (top) to 1 (bottom). */
  y: number;
  nm: number;
}

interface Electron {
  /** Position across the gap, 0 (emitter) to 1 (collector). */
  x: number;
  y: number;
  /** Velocity [gaps/s]. */
  v: number;
  age: number;
}

export interface S {
  t: number;
  rng: Rng;
  photons: Photon[];
  electrons: Electron[];
  /** Absorption marks on the emitter face. */
  hits: { y: number; nm: number; age: number }[];
}

// ------------------------------------------------------------------ constants

const LAM: [number, number] = [180, 750];
const V_RANGE: [number, number] = [-5, 3];
/** Display photon rate [1/s] per (µW · 400 nm): proportional to the real photon rate P/(hf). */
const PHOTONS_PER_S = 7;
/** Beam flight time [s]. */
const T_FLIGHT = 0.45;
/** Electron display speed [gaps/s] per √eV; acceleration follows from energy conservation. */
const S0 = 0.9;
const LIFE = 8;
const HIT_LIFE = 0.3;
/** Warm start [s], so the paused first picture already shows the steady state. */
const WARM = 2.5;

const UV_GREY = '#8a8a8a';
const ELECTRON = '#0072B2';
const K_COLOR = '#56B4E9';
const INK = '#1a1a1a';
const CLASSICAL = '#8c8c8c';
const GLASS = '#aab4bb';
/** Per-metal colour and marker (shape varies too, never colour alone). */
const METAL_STYLE: { color: string; shape: Shape }[] = [
  { color: '#0072B2', shape: 'circle' },
  { color: '#D55E00', shape: 'square' },
  { color: '#009E73', shape: 'triangle' },
  { color: '#CC79A7', shape: 'diamond' },
  { color: '#E69F00', shape: 'down' },
];
type Shape = 'circle' | 'square' | 'triangle' | 'diamond' | 'down';

/** V_stop–f plot axes: f [10¹⁴ Hz], V [V]. */
const F_AX: [number, number] = [0, 17];
const VS_AX: [number, number] = [-6, 5];
/** Energy gauge range [eV]. */
const E_GAUGE = 7;

const photonColor = (nm: number): string => {
  if (nm < 380) return UV_GREY;
  const [r, g, b] = wavelengthRGB(nm);
  return `rgb(${r}, ${g}, ${b})`;
};

const phiOf = (p: P) => METALS[metalIndex(p.metal)].phi;

// ------------------------------------------------------------------ parameters

const params: ParamSchema<P> = {
  lam: {
    kind: 'number',
    label: 'pe.p.lam',
    desc: 'pe.d.lam',
    group: 'main',
    live: true,
    control: 'slider',
    min: LAM[0],
    max: LAM[1],
    step: 1,
    default: 400,
    unit: 'nm',
  },
  V: {
    kind: 'number',
    label: 'pe.p.V',
    desc: 'pe.d.V',
    group: 'main',
    live: true,
    control: 'slider',
    min: V_RANGE[0],
    max: V_RANGE[1],
    step: 0.05,
    default: 0,
    unit: 'V',
  },
  metal: {
    kind: 'select',
    label: 'pe.p.metal',
    desc: 'pe.d.metal',
    group: 'advanced',
    live: true,
    default: 'Na',
    options: METALS.map((m) => ({ value: m.id, label: `pe.metal.${m.id}` })),
  },
  power: {
    kind: 'number',
    label: 'pe.p.power',
    desc: 'pe.d.power',
    group: 'advanced',
    live: true,
    control: 'slider',
    min: 0.1,
    max: 2,
    step: 0.1,
    default: 1,
    unit: 'µW',
  },
  classical: { kind: 'toggle', label: 'pe.p.classical', desc: 'pe.d.classical', group: 'advanced', live: true, default: false },
  D: { kind: 'array', label: 'pe.p.D', group: 'hidden', live: true, default: emptyPoints(), min: 0, max: 1000 },
};

// ------------------------------------------------------------------ dynamics (display only; the ammeter uses the model)

function step(s: S, h: number, p: P): void {
  s.t += h;
  const phi = phiOf(p);
  // Photons arrive at random (Poisson) at a display rate ∝ P/(hf).
  const rate = PHOTONS_PER_S * p.power * (p.lam / 400);
  if (s.rng.next() < rate * h) s.photons.push({ s: 0, y: 0.1 + 0.8 * s.rng.next(), nm: p.lam });
  for (const ph of s.photons) ph.s += h / T_FLIGHT;
  for (const ph of s.photons) {
    if (ph.s < 1) continue;
    s.hits.push({ y: ph.y, nm: ph.nm, age: 0 });
    const km = kMax(ph.nm, phi);
    // One electron per photon above threshold, K uniform on [0, K_max].
    if (km > 0) s.electrons.push({ x: 0, y: ph.y, v: S0 * Math.sqrt(km * s.rng.next()), age: 0 });
  }
  s.photons = s.photons.filter((ph) => ph.s < 1);
  // ½mv² = K + eV x (x in gaps): a = S0² V / 2 in display units.
  const a = (S0 * S0 * p.V) / 2;
  for (const e of s.electrons) {
    e.x += e.v * h + 0.5 * a * h * h;
    e.v += a * h;
    e.age += h;
  }
  s.electrons = s.electrons.filter((e) => e.x < 1 && !(e.x <= 0 && e.v <= 0) && e.age < LIFE);
  for (const q of s.hits) q.age += h;
  s.hits = s.hits.filter((q) => q.age < HIT_LIFE);
}

const H_STEP = 1 / 60;

// ------------------------------------------------------------------ layout

interface Layout {
  wide: boolean;
  tube: Box;
  vf: Box;
  iv: Box;
}

function layout(g: Draw): Layout {
  const o = canvasBox(g, 10);
  const w = o.r - o.l;
  const h = o.b - o.t;
  const wide = w >= 620 && w > 1.1 * h;
  if (wide) {
    const [tube, right] = split(o, true, 0.5, 26);
    const [vf, iv] = split(right, false, 0.58, 16);
    return { wide, tube, vf, iv };
  }
  const [tube, rest] = split(o, false, 0.42, 8);
  const [vf, iv] = split(rest, false, 0.56, 10);
  return { wide, tube, vf, iv };
}

/** Plot frame inside a region: room for tick labels (left, bottom) and a header row (top). */
const plotBox = (r: Box, header: number): Box => ({ l: r.l + 40, r: r.r - 8, t: r.t + header, b: r.b - 22 });

interface Btn {
  box: Box;
  c: Vec2;
}
/** Button positions [world] from the last frame, for the stage handles. */
let lastBtn: { measure: Btn | null; clear: Btn | null } = { measure: null, clear: null };

// ------------------------------------------------------------------ tube

interface Tube {
  plateTop: number;
  plateBot: number;
  /** Emitter face and collector face x [px]. */
  xe: number;
  xc: number;
  /** Beam direction (unit, px, pointing towards the emitter). */
  d: [number, number];
  /** Beam start offset: hit point minus d · len. */
  len: number;
}

function tubeGeom(T: Box): { env: Box; tube: Tube; gauge: Box } {
  const tw = T.r - T.l;
  const th = T.b - T.t;
  const gw = Math.min(72, Math.max(64, tw * 0.14));
  const gauge: Box = { l: T.l, r: T.l + gw, t: T.t + 0.2 * th, b: T.t + 0.7 * th };
  const env: Box = { l: T.l + gw + 12, r: T.r - 6, t: T.t + 0.2 * th, b: T.t + 0.72 * th };
  const ew = env.r - env.l;
  const eh = env.b - env.t;
  const plateTop = env.t + 0.12 * eh;
  const plateBot = env.b - 0.2 * eh;
  const xe = env.l + 0.12 * ew + 8;
  const xc = env.r - 0.12 * ew - 6;
  // Beam from the upper right, steep enough to reach the face from above the tube.
  const dx = -0.42;
  const dy = 1;
  const n = Math.hypot(dx, dy);
  const len = (plateBot - (T.t + 6)) / (dy / n);
  return { env, gauge, tube: { plateTop, plateBot, xe, xc, d: [dx / n, dy / n], len } };
}

function roundRect(g: Draw, b: Box, r: number, st: { color?: string; width?: number; fill?: string; dash?: number[] }): void {
  const { ctx } = g;
  ctx.save();
  ctx.beginPath();
  ctx.roundRect(b.l, b.t, b.r - b.l, b.b - b.t, r);
  if (st.fill) {
    ctx.fillStyle = st.fill;
    ctx.fill();
  }
  if (st.color) {
    ctx.strokeStyle = st.color;
    ctx.lineWidth = st.width ?? 1.5;
    ctx.setLineDash(st.dash ?? []);
    ctx.stroke();
  }
  ctx.restore();
}

/** Photon glyph: a short wave train along the direction of travel, centred at (x, y). */
function photonGlyph(g: Draw, x: number, y: number, d: [number, number], col: string): void {
  const L = 16;
  const A = 3;
  const pts: Vec2[] = [];
  for (let i = 0; i <= 16; i++) {
    const u = i / 16 - 0.5;
    const w = A * Math.sin(u * 4 * Math.PI) * Math.cos(u * Math.PI);
    pts.push(W(g, x + d[0] * u * L - d[1] * w, y + d[1] * u * L + d[0] * w));
  }
  g.polyline(pts, { color: col, width: 1.75 });
}

function drawTube(g: Draw, T: Box, s: S, p: P): void {
  const { env, tube, gauge } = tubeGeom(T);
  const { plateTop, plateBot, xe, xc, d, len } = tube;
  const phi = phiOf(p);
  const col = photonColor(p.lam);
  const yAt = (y: number) => plateTop + y * (plateBot - plateTop);

  // Glass envelope.
  roundRect(g, env, 14, { color: GLASS, width: 1.5, fill: '#f6f8f9' });

  // Beam band (the light even when paused) and the photons in flight.
  const hitTop = yAt(0.1);
  const hitBot = yAt(0.9);
  const sx = (y: number) => [xe - d[0] * len, y - d[1] * len] as const;
  const [ax, ay] = sx(hitTop);
  const [bx, by] = sx(hitBot);
  // The light comes in from beyond the top of the tube box.
  g.ctx.save();
  g.ctx.beginPath();
  g.ctx.rect(T.l, T.t, T.r - T.l, T.b - T.t);
  g.ctx.clip();
  g.polygon([W(g, xe, hitTop), W(g, xe, hitBot), W(g, bx, by), W(g, ax, ay)], { fill: col, fillAlpha: 0.1 });
  for (const ph of s.photons) {
    const y0 = yAt(ph.y);
    const k = (1 - ph.s) * len;
    photonGlyph(g, xe - d[0] * k, y0 - d[1] * k, d, photonColor(ph.nm));
  }
  g.ctx.restore();
  if (p.lam < 380) {
    const yl = T.t + 12;
    textPx(g, xe + (hitTop - yl) * (-d[0] / d[1]) + 10, yl, 'UV', { size: 11, color: UV_GREY, align: 'left', baseline: 'middle' });
  }

  // Electrodes: emitter (metal) and collector.
  rectPx(g, { l: xe - 8, r: xe, t: plateTop, b: plateBot }, { fill: '#a7a7a7', color: '#6b6b6b', width: 1 });
  rectPx(g, { l: xc, r: xc + 6, t: plateTop, b: plateBot }, { fill: '#6b6b6b', color: '#4a4a4a', width: 1 });
  // Metal name left of the emitter, clear of the lead wire below it and of the light on its right.
  textPx(g, xe - 13, plateTop + 8, METALS[metalIndex(p.metal)].id, { size: 12, color: INK, align: 'right', baseline: 'middle' });

  for (const q of s.hits) {
    g.circle(W(g, xe + 1, yAt(q.y)), 3 + 6 * (q.age / HIT_LIFE), { color: photonColor(q.nm), width: 1.25, alpha: 1 - q.age / HIT_LIFE });
  }
  for (const e of s.electrons) {
    const a = e.age > LIFE - 1 ? LIFE - e.age : 1;
    g.circle(W(g, xe + 3 + e.x * (xc - xe - 5), yAt(e.y)), 2.6, { fill: ELECTRON, alpha: a });
  }

  // Circuit: leads from both plates down to a source of voltage V and an ammeter.
  const yw = Math.min(T.b - 30, env.b + Math.min(64, 0.45 * (T.b - env.b)));
  const wire = { color: '#4a4a4a', width: 1.5 };
  linePx(g, xe - 4, plateBot, xe - 4, yw, wire);
  linePx(g, xc + 3, plateBot, xc + 3, yw, wire);
  const xb = xe + 0.32 * (xc - xe);
  const xa = xe + 0.7 * (xc - xe);
  const ra = 11;
  linePx(g, xe - 4, yw, xb - 4, yw, wire);
  linePx(g, xb + 4, yw, xa - ra, yw, wire);
  linePx(g, xa + ra, yw, xc + 3, yw, wire);
  // Source: long plate = + terminal, on the collector side for V ≥ 0.
  const plus = p.V >= 0 ? xb + 4 : xb - 4;
  const minus = p.V >= 0 ? xb - 4 : xb + 4;
  linePx(g, plus, yw - 12, plus, yw + 12, { color: INK, width: 1.5 });
  linePx(g, minus, yw - 6, minus, yw + 6, { color: INK, width: 3 });
  g.circle(W(g, xa, yw), ra, { color: INK, width: 1.5, fill: '#ffffff' });
  textPx(g, xa, yw + 0.5, 'A', { size: 12, color: INK, align: 'center', baseline: 'middle' });
  const I = current(p.V, p.power, p.lam, phi);
  // Same decimals as the slider (step 0.05 V).
  const vTxt = `${p.V > 0 ? '+' : ''}${(Math.abs(p.V) < 0.005 ? 0 : p.V).toFixed(2).replace('-', '−')}`;
  textPx(g, xb, yw + 30, `*V* = ${vTxt} V`, { size: 12, color: INK, align: 'center' });
  textPx(g, xa, yw + 30, `${fmt(I, 3, 1e-6)} nA`, { size: 12, color: INK, align: 'center' });

  drawGauge(g, gauge, p);
}

/** Energy gauge: a bar of height hf against the work function line; the part above Φ is K_max. */
function drawGauge(g: Draw, b: Box, p: P): void {
  const phi = phiOf(p);
  const E = photonEnergy(p.lam);
  const Y = (e: number) => b.b - (Math.min(e, E_GAUGE) / E_GAUGE) * (b.b - b.t);
  const xl = b.l + 18;
  const xr = xl + 12;
  linePx(g, b.l + 12, b.b, b.r - 4, b.b, { color: '#5c5c5c', width: 1 });
  rectPx(g, { l: xl, r: xr, t: Y(Math.min(E, phi)), b: b.b }, { fill: photonColor(p.lam) });
  if (E > phi) rectPx(g, { l: xl, r: xr, t: Y(E), b: Y(phi) }, { fill: K_COLOR, color: INK, width: 1 });
  // Φ line just past the bar, so the labels to its right never cross it.
  linePx(g, b.l + 10, Y(phi), xr + 4, Y(phi), { color: INK, width: 1.25, dash: [4, 3] });
  textPx(g, b.l + 7, Y(phi), 'Φ', { size: 12, color: INK, align: 'right', baseline: 'middle' });
  textPx(g, xr + 6, Y(E), '*hf*', { size: 12, color: INK, align: 'left', baseline: 'middle' });
  if (E > phi && Y(phi) - Y(E) >= 34) textPx(g, xr + 6, (Y(E) + Y(phi)) / 2, '*K*_{max}', { size: 11, color: INK, align: 'left', baseline: 'middle' });
}

// ------------------------------------------------------------------ plots

function marker(g: Draw, x: number, y: number, shape: Shape, col: string, filled: boolean, r = 4.5): void {
  const st = { color: col, width: 1.5, fill: filled ? col : '#ffffff' };
  if (shape === 'circle') {
    g.circle(W(g, x, y), r, st);
    return;
  }
  const pts: [number, number][] =
    shape === 'square'
      ? [
          [-r, -r],
          [r, -r],
          [r, r],
          [-r, r],
        ]
      : shape === 'diamond'
        ? [
            [0, -r * 1.3],
            [r * 1.3, 0],
            [0, r * 1.3],
            [-r * 1.3, 0],
          ]
        : shape === 'triangle'
          ? [
              [0, -r * 1.25],
              [r * 1.15, r * 0.85],
              [-r * 1.15, r * 0.85],
            ]
          : [
              [0, r * 1.25],
              [r * 1.15, -r * 0.85],
              [-r * 1.15, -r * 0.85],
            ];
  g.polygon(
    pts.map(([dx, dy]) => W(g, x + dx, y + dy)),
    { color: col, width: 1.5, fill: filled ? col : '#ffffff' },
  );
}

function button(g: Draw, x: number, y: number, label: string, alignRight: boolean, enabled: boolean): Btn {
  const w = measureRich(g.ctx, label, { size: 12 }) + 18;
  const hgt = 24;
  const box: Box = alignRight ? { l: x - w, r: x, t: y, b: y + hgt } : { l: x, r: x + w, t: y, b: y + hgt };
  roundRect(g, box, 5, { color: enabled ? '#5c5c5c' : '#c8c8c8', width: 1.25, fill: '#ffffff' });
  textPx(g, (box.l + box.r) / 2, (box.t + box.b) / 2 + 0.5, label, { size: 12, color: enabled ? INK : '#9a9a9a', align: 'center', baseline: 'middle' });
  return { box, c: W(g, (box.l + box.r) / 2, (box.t + box.b) / 2) };
}

/** Fit of the stored points, or null below two points of one metal. */
export function fitOf(p: P): Fit | null {
  return fitLines(pointValues(readPoints(p.D)));
}

function drawVf(g: Draw, R: Box, p: P): void {
  // Right margin for the metal labels of the fitted lines.
  const box = { ...plotBox(R, 30), r: R.r - 24 };
  const fr = new Frame(g, box, F_AX, VS_AX);
  const F = (hz: number) => hz / 1e14;
  fr.axes({ xLabel: '*f* (10^{14} Hz)', yLabel: '*V*_{stop} (V)', xTicks: [0, 5, 10, 15], yTicks: [-6, -4, -2, 0, 2, 4] });
  fr.line(F_AX[0], 0, F_AX[1], 0, { color: '#c8c8c8', width: 1 });
  const pts = pointValues(readPoints(p.D));
  const fit = fitLines(pts);
  const m0 = metalIndex(p.metal);

  fr.clip(() => {
    if (p.classical) fr.line(F_AX[0], vStopClassical(p.power), F_AX[1], vStopClassical(p.power), { color: CLASSICAL, width: 2, dash: [7, 5] });
    if (fit) {
      for (let m = 0; m < METALS.length; m++) {
        if (!fit.fitted[m]) continue;
        const fs = pts.filter((q) => q.m === m).map((q) => F(q.f));
        const lo = Math.min(...fs);
        const hi = Math.max(...fs);
        const v = (x: number) => fit.slope * x * 1e14 + fit.intercept[m];
        const st = METAL_STYLE[m];
        // Solid over the measured range, dashed extrapolation to f = 0 (intercept −Φ/e) and to the edge.
        fr.line(0, v(0), lo, v(lo), { color: st.color, width: 1.25, dash: [4, 4] });
        fr.line(lo, v(lo), hi, v(hi), { color: st.color, width: 2 });
        fr.line(hi, v(hi), F_AX[1], v(F_AX[1]), { color: st.color, width: 1.25, dash: [4, 4] });
      }
    }
  }, 1);
  // Where a measurement now would land (hollow); a measured point drawn after it fills it.
  if (kMax(p.lam, phiOf(p)) > 0) {
    const st = METAL_STYLE[m0];
    marker(g, fr.X(F(frequency(p.lam))), fr.Y(vStop(p.lam, phiOf(p))), st.shape, st.color, false, 5.5);
  }
  for (const q of pts) {
    const st = METAL_STYLE[q.m];
    marker(g, fr.X(F(q.f)), fr.Y(q.v), st.shape, st.color, true);
  }
  // Metal labels in the right margin where each fitted line leaves the plot, pushed apart vertically.
  if (fit) {
    const labels: { y: number; m: number }[] = [];
    for (let m = 0; m < METALS.length; m++) {
      if (fit.fitted[m]) labels.push({ y: fr.Y(fit.slope * F_AX[1] * 1e14 + fit.intercept[m]), m });
    }
    labels.sort((a, b) => a.y - b.y);
    const gap = 12;
    for (let i = 0; i < labels.length; i++) labels[i].y = Math.max(labels[i].y, box.t + 6, i ? labels[i - 1].y + gap : -Infinity);
    for (let i = labels.length - 1; i >= 0; i--) labels[i].y = Math.min(labels[i].y, i < labels.length - 1 ? labels[i + 1].y - gap : box.b - 6);
    for (const l of labels) textPx(g, box.r + 4, l.y, METALS[l.m].id, { size: 11, color: METAL_STYLE[l.m].color, align: 'left', baseline: 'middle', weight: 600 });
  }
  if (p.classical) {
    // Above the dashed line, or below it when the y-axis label is in the way.
    const yc = fr.Y(vStopClassical(p.power));
    textPx(g, fr.X(0.4), yc - 16 < box.t + 18 ? yc + 14 : yc - 5, t('pe.classical'), { size: 11, color: CLASSICAL, align: 'left' });
  }

  // Buttons in the header row, right-aligned.
  const canMeasure = kMax(p.lam, phiOf(p)) > 0;
  const clear = pts.length ? button(g, R.r - 8, R.t + 1, t('pe.clear'), true, true) : null;
  const measure = button(g, clear ? clear.box.l - 8 : R.r - 8, R.t + 1, t('pe.measure'), true, canMeasure);
  const n = pts.length;
  if (n) textPx(g, measure.box.l - 8, R.t + 13.5, `${n}/${MAX_POINTS}`, { size: 11, color: TICK, align: 'right', baseline: 'middle' });
  lastBtn = { measure, clear };
}

/** I–V axis top [nA]: a nice value above the largest saturation current (at the longest wavelength that still ejects). */
export function iAxisMax(power: number): number {
  const lamMax = Math.min(LAM[1], thresholdNm(Math.min(...METALS.map((m) => m.phi))));
  const top = photonRate(power, lamMax) * QE * 1e9 * 1.05;
  const e = 10 ** Math.floor(Math.log10(top));
  const m = [1, 1.5, 2, 3, 4, 5, 6, 8, 10].find((k) => k >= top / e - 1e-9) ?? 10;
  return m * e;
}

function drawIv(g: Draw, R: Box, p: P): void {
  const box = plotBox(R, 6);
  const phi = phiOf(p);
  const top = iAxisMax(p.power);
  const fr = new Frame(g, box, V_RANGE, [0, top]);
  fr.axes({ xLabel: '*V* (V)', yLabel: '*I* (nA)', xTicks: [-4, -2, 0, 2], yTicks: [0, top / 2, top] });
  fr.line(0, 0, 0, top, { color: '#c8c8c8', width: 1 });
  const curve = (fn: (V: number) => number): [number, number][] => {
    const out: [number, number][] = [];
    for (let i = 0; i <= 160; i++) {
      const V = V_RANGE[0] + ((V_RANGE[1] - V_RANGE[0]) * i) / 160;
      out.push([V, fn(V)]);
    }
    // Exact corner at the cutoff.
    return out;
  };
  const vs = vStop(p.lam, phi);
  fr.clip(() => {
    if (p.classical) fr.polyline(curve((V) => currentClassical(V, p.power, p.lam)), { color: CLASSICAL, width: 2, dash: [7, 5] });
    const pts = curve((V) => current(V, p.power, p.lam, phi));
    if (vs > 0) pts.push([-vs, 0], [0, iSat(p.power, p.lam, phi)]);
    pts.sort((a, b) => a[0] - b[0]);
    fr.polyline(pts, { color: INK, width: 2 });
  }, 2);
  const I = current(p.V, p.power, p.lam, phi);
  if (vs > 0) {
    // Cutoff label left of the cutoff, on the I = 0 stretch, and left of the operating point when that
    // sits there; left out when the y axis leaves no room.
    const lbl = '−*V*_{stop}';
    const w = measureRich(g.ctx, lbl, { size: 11 });
    let x = fr.X(-vs) - 4;
    const xd = fr.X(p.V);
    if (I === 0 && xd > x - w - 8 && xd < x + 10) x = xd - 9;
    if (x - w > box.l + 4) textPx(g, x, box.b - 7, lbl, { size: 11, color: INK, align: 'right' });
  }
  g.circle(fr.P(p.V, I), 4.5, { fill: INK });
}

// ------------------------------------------------------------------ measure / clear

function measure(ctx: SceneCtx<P>): void {
  const D = addPoint(ctx.params.D, ctx.params.lam, metalIndex(ctx.params.metal));
  if (D) ctx.set('D', D);
}

function clearAll(ctx: SceneCtx<P>): void {
  if (readPoints(ctx.params.D).length) ctx.set('D', emptyPoints());
}

/** Stage buttons: a single click or tap acts (Handle.onTap); dragging does nothing. */
const buttonHandle = (which: 'measure' | 'clear', act: (ctx: SceneCtx<P>) => void): Handle<S, P> => ({
  radiusPx: 20,
  when: (p: P) => which === 'measure' || readPoints(p.D).length > 0,
  pos: () => lastBtn[which]?.c ?? { x: -1e6, y: -1e6 },
  onDrag: () => {},
  onTap: (ctx: SceneCtx<P>) => act(ctx),
});

// ------------------------------------------------------------------ TeX helpers

/** TeX number: fixed decimals, ASCII minus. */
const tf = (v: number, d: number) => (Math.abs(v) < 0.5 * 10 ** -d ? 0 : v).toFixed(d);

/** TeX scientific notation with `sig` significant figures. */
export function tsci(v: number, sig: number): string {
  if (v === 0 || !Number.isFinite(v)) return '0';
  let e = Math.floor(Math.log10(Math.abs(v)));
  let m = v / 10 ** e;
  if (Math.abs(Number(m.toFixed(sig - 1))) >= 10) {
    e += 1;
    m /= 10;
  }
  return `${m.toFixed(sig - 1)}\\times10^{${e}}`;
}

export function formulaLines(p: P): string[] {
  const phi = phiOf(p);
  const E = photonEnergy(p.lam);
  const km = kMax(p.lam, phi);
  const lines = [
    `hf = \\frac{hc}{\\lambda} = \\frac{${HC_EV_NM.toFixed(1)}\\ \\mathrm{eV\\,nm}}{${p.lam}\\ \\mathrm{nm}} = ${tf(E, 2)}\\ \\mathrm{eV}`,
    km > 0
      ? `K_\\text{max} = hf - \\Phi = ${tf(E, 2)} - ${tf(phi, 2)} = ${tf(km, 2)}\\ \\mathrm{eV}`
      : `K_\\text{max} = 0\\ \\ (hf < \\Phi = ${tf(phi, 2)}\\ \\mathrm{eV},\\ \\lambda > \\lambda_0 = ${Math.round(thresholdNm(phi))}\\ \\mathrm{nm})`,
    `V_\\text{stop} = K_\\text{max}/e = ${tf(km, 2)}\\ \\mathrm{V}`,
  ];
  const fit = fitOf(p);
  const he = `h/e = ${tsci(H_OVER_E, 4)}\\ \\mathrm{V\\,s}`;
  lines.push(fit ? `\\Delta V_\\text{stop}/\\Delta f = ${tsci(fit.slope, 4)}\\ \\mathrm{V\\,s}\\ \\ (${he})` : he);
  const m = metalIndex(p.metal);
  if (fit?.fitted[m]) lines.push(`V_\\text{stop}(f{=}0) = ${tf(fit.intercept[m], 2)}\\ \\mathrm{V}\\ \\ (-\\Phi/e = ${tf(-phi, 2)}\\ \\mathrm{V})`);
  if (p.classical) lines.push(`t_\\text{cl} = \\Phi/(S A) = ${tsci(classicalDelay(p.power, phi), 2)}\\ \\mathrm{s}`);
  return lines;
}

// ------------------------------------------------------------------ scene

export const photoelectric: Scene<P, S> = {
  id: 'photoelectric',
  title: 'pe.scene',
  params,
  world: PX_WORLD,
  time: { h: H_STEP, recordEvery: 6, frameStep: 0.1, unit: '' },

  init: (p, rng) => {
    const s: S = { t: 0, rng, photons: [], electrons: [], hits: [] };
    for (let i = 0; i < WARM / H_STEP; i++) step(s, H_STEP, p);
    s.t = 0;
    return s;
  },
  step,

  draw: (g, s, p) => {
    const L = layout(g);
    drawTube(g, L.tube, s, p);
    drawVf(g, L.vf, p);
    drawIv(g, L.iv, p);
  },

  handles: [buttonHandle('measure', measure), buttonHandle('clear', clearAll)],

  readouts: [
    { label: 'hf', unit: 'eV', value: (_s, p) => photonEnergy(p.lam) },
    { label: 'V_\\text{stop}', unit: 'V', value: (_s, p) => vStop(p.lam, phiOf(p)) },
    { label: 'I', unit: 'nA', value: (_s, p) => current(p.V, p.power, p.lam, phiOf(p)), zeroTol: 1e-6 },
  ],

  formula: (_s, p) => formulaLines(p),

  info: {
    goals: ['pe.goal.photon', 'pe.goal.h'],
    observe: ['pe.obs.threshold', 'pe.obs.stop', 'pe.obs.power', 'pe.obs.measure', 'pe.obs.classical'],
    equations: [
      'hf = \\frac{hc}{\\lambda}, \\qquad K_\\text{max} = hf - \\Phi = e\\,V_\\text{stop}',
      'V_\\text{stop} = \\frac{h}{e}\\,f - \\frac{\\Phi}{e}',
      'I_\\text{sat} = \\frac{eP}{hf}, \\qquad I = I_\\text{sat}\\left(1 - \\frac{e\\lvert V\\rvert}{K_\\text{max}}\\right)',
    ],
    assumptions: ['pe.as.yield', 'pe.as.dist', 'pe.as.phi', 'pe.as.ideal', 'pe.as.data', 'pe.as.classical', 'pe.as.uv', 'pe.as.display'],
  },
};
