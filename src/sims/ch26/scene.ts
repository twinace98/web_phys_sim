// Ch 26 scene: electrons scattering in a lattice drift against E. Counting the net charge
// through a cross-section measures I; the I-V chart below collects the measurements.
import { fmtTick, niceTicks } from '../../core/format';
import type { Rng } from '../../core/rng';
import type { NumberParam, ParamSchema, Scene, Vec2, WorldSpec } from '../../core/types';
import type { Viewport } from '../../core/viewport';
import type { Draw } from '../../draw/draw';
import { t as tr } from '../../core/i18n';
import { measureRich } from '../../draw/text';
import { theme } from '../../draw/theme';
import { fmtMeas, slider, texOf, tn, tnScale, u } from '../../core/tex';
import { DENSITY, H_PER_MM2, Q_E, REF, SAMPLE, TAU_300, V_TH, accelOf, currentOf, driftSpeed, heightOf, makeGas, resistanceOf, stepGas, tauOf, type Gas, type Wire } from './physics';

type P = { V: number; T: number; L: number; A: number };

interface S {
  t: number;
  n: number;
  gas: Gas;
  rng: Rng;
  /** Trail of the tracer electron (NaN breaks the line at a wrap). */
  trail: number[];
  /** Net count and time when counting for Ī began (NaN before COUNT_FROM). */
  c0: number;
  t0: number;
}

const RATE = 120;
const LMAX = 6;
const TRAIL = 2.5 * RATE;
const ION = '#b9b9b9';
const WIRE_FILL = '#f6f6f6';
const TICK = '#6b6b6b';
// I-V chart, in world units below the wire (full layout).
const CH = { x0: 0.6, x1: 5.9, y0: -5.2, y1: -2.4, vMax: 1.6 };
/** World of the full layout: wire on top, I-V chart below. */
const WORLD: WorldSpec = { x: [-0.7, LMAX + 0.5], y: [CH.y0 - 0.9, 2.1], aspect: 'contain', padPx: 14 };

const wireOf = (p: P): Wire => ({ L: p.L, A: p.A, T: p.T });
/** Drawn v_d arrow length per unit drift speed [cm per cm/s]. */
const V_D_DRAW = 1.6;

/** Measured currents [mA] by wire (L|A|T) and voltage, kept across runs to build the I-V chart. */
const measured = new Map<string, Map<number, number>>();
const keyOf = (p: P) => `${p.L}|${p.A}|${p.T}`;

/**
 * Counting for Ī starts after this many mean free times. The drift builds up as
 * v_d (1 − e^{−t/τ}), so Q/t counted from t = 0 lags I by the fraction (τ/t)(1 − e^{−t/τ})
 * (−8 % at 3 s, 300 K). From 4τ on the drift is within e^{−4} ≈ 2 % of v_d and the remaining
 * bias of ΔQ/Δt is below 0.5 % at the first reading.
 */
export const COUNT_FROM = 4;
/** Start of counting [s]: 1 s at 300 K, 1.5 s at 200 K. */
export const countStart = (T: number) => COUNT_FROM * tauOf(T);
/** The Ī graph starts after 1 s of counting (noise bound in range). */
export const PLOT_AFTER = 1;
/** The readout and the I-V point wait for 2 s of counting (3 s in all at 300 K). */
export const READ_AFTER = 2;
/** Average current [mA] ΔQ/Δt since counting began, once `after` seconds have been counted. */
const runningI = (s: S, after: number) => (s.t - s.t0 >= after - 1e-9 ? ((s.gas.count - s.c0) * Q_E * 1e3) / (s.t - s.t0) : NaN);
const measuredI = (s: S) => runningI(s, READ_AFTER);
/**
 * Upper bound on the thermal counting noise of Q/t [mA] after t seconds: crossings of the
 * section in both directions at rate n h ⟨|v_x|⟩, each ±1, treated as independent (back-and-forth
 * crossings of one electron cancel, so the real spread is smaller).
 */
export const noiseI = (p: P, t: number) => {
  const rate = DENSITY * SAMPLE * heightOf(p.A) * ((2 * V_TH) / Math.PI);
  return (Q_E * 1e3 * Math.sqrt(rate * t)) / t;
};
/**
 * Scatter (one standard deviation) of Ī [mA] after t seconds of counting, from 40 seeds per wire:
 * about half the bound at small drift (0.45–0.67 of noiseI at V = 0 and the defaults), growing
 * with the drift (1.0–1.3 of noiseI at 1.5 V, 200 K, 2 cm, 3 mm², v_d/v_th ≈ 0.85). Ī and V/Ī
 * print to this scatter (policy D, R4).
 */
export const scatterI = (p: P, t: number) => 0.5 * noiseI(p, t) * (1 + (1.5 * driftSpeed(wireOf(p), p.V)) / V_TH);
/** End of the run [s]: Δt prints with the decimals of this scale (R7a). */
const RUN_END = 30;

const params: ParamSchema<P> = {
  V: {
    kind: 'number',
    label: 'ch26.p.V',
    desc: 'ch26.d.V',
    group: 'main',
    live: false,
    control: 'slider',
    min: 0,
    max: 1.5,
    step: 0.1,
    default: 1,
    unit: 'V',
  },
  T: {
    kind: 'number',
    label: 'ch26.p.T',
    desc: 'ch26.d.T',
    group: 'main',
    live: false,
    control: 'slider',
    min: 200,
    max: 450,
    step: 10,
    default: 300,
    unit: 'K',
  },
  L: {
    kind: 'number',
    label: 'ch26.p.L',
    desc: 'ch26.d.L',
    group: 'advanced',
    live: false,
    control: 'slider',
    min: 2,
    max: 6,
    step: 0.5,
    default: 4,
    unit: 'cm',
  },
  A: {
    kind: 'number',
    label: 'ch26.p.A',
    desc: 'ch26.d.A',
    group: 'advanced',
    live: false,
    control: 'slider',
    min: 1,
    max: 3,
    step: 0.1,
    default: 2,
    unit: 'mm²',
  },
};

type Box = { x0: number; x1: number; y0: number; y1: number };

function drawChart(g: Draw, p: P, s: S, box: Box): void {
  const X = (v: number) => box.x0 + (v / CH.vMax) * (box.x1 - box.x0);
  // Current axis: at least 400 mA, extended in 200 mA steps so the present wire's line fits.
  const iMax = Math.max(400, Math.ceil((currentOf(wireOf(p), CH.vMax) * 1e3 * 1.05) / 200) * 200);
  const Y = (i: number) => box.y0 + (i / iMax) * (box.y1 - box.y0);
  const axis = { role: 'axis' as const, width: 1.25 };
  g.line({ x: X(0), y: Y(0) }, { x: X(CH.vMax), y: Y(0) }, axis);
  g.line({ x: X(0), y: Y(0) }, { x: X(0), y: Y(iMax) }, axis);
  for (const v of [0.5, 1, 1.5]) {
    g.line({ x: X(v), y: Y(0) }, { x: X(v), y: Y(0) - g.px(4) }, { role: 'axis', width: 1 });
    g.text({ x: X(v), y: Y(0) }, fmtTick(v), { size: 11, color: TICK, align: 'center', dy: 16 });
  }
  for (const i of niceTicks(0, iMax, 4)) {
    g.line({ x: X(0), y: Y(i) }, { x: X(0) - g.px(4), y: Y(i) }, { role: 'axis', width: 1 });
    g.text({ x: X(0), y: Y(i) }, fmtTick(i), { size: 11, color: TICK, align: 'right', baseline: 'middle', dx: -7 });
  }
  g.text({ x: X(CH.vMax), y: Y(0) }, '*V* (V)', { size: 12, color: TICK, align: 'right', dy: 32 });
  g.text({ x: X(0), y: Y(iMax) }, '*I* (mA)', { size: 12, color: TICK, align: 'left', dx: 8, dy: 4 });

  /** Line I = V / R clipped to the chart. */
  const line = (w: Wire, st: Parameters<Draw['line']>[2]) => {
    const k = (currentOf(w, 1) * 1e3) as number;
    const vEnd = Math.min(CH.vMax, iMax / k);
    g.line({ x: X(0), y: Y(0) }, { x: X(vEnd), y: Y(k * vEnd) }, st);
  };
  const cur = keyOf(p);
  // Grey lines for the last few wires measured before (sliders allow many).
  for (const [key, pts] of [...measured].slice(-6)) {
    if (key === cur || pts.size === 0) continue;
    const [L, A, T] = key.split('|').map(Number);
    line({ L, A, T }, { color: '#d0d0d0', width: 1.25 });
  }
  line(wireOf(p), { role: 'fg', width: 1.5 });
  for (const [V, I] of measured.get(cur) ?? []) {
    if (V === p.V) continue;
    g.circle({ x: X(V), y: Y(Math.min(I, iMax)) }, 4.5, { fill: '#ffffff', role: 'velocity', width: 2 });
  }
  if (Number.isFinite(measuredI(s))) g.circle({ x: X(p.V), y: Y(Math.max(0, Math.min(measuredI(s), iMax))) }, 5, { fill: 'velocity' });
}

/** Tiny key at the top right of the stage (of the wire panel when compact): grey dot = lattice ion, blue dot = electron. */
function particleKey(g: Draw, rIon: number, rEl: number, right: number): void {
  const k = theme.scale;
  const size = 12;
  const y = 14 * k;
  let x = right;
  const at = (px: number): Vec2 => {
    const [wx, wy] = g.vp.toWorld(px, y);
    return { x: wx, y: wy };
  };
  // Same dots as on the stage, but never below 2.5 px so the colour reads on a phone.
  for (const [label, r, fill] of [
    [tr('ch26.key.electron'), Math.max(2.5, rEl), 'negative'],
    [tr('ch26.key.ion'), Math.max(2.5, rIon), ION],
  ] as const) {
    g.text(at(x), label, { size, color: TICK, align: 'right', baseline: 'middle' });
    x -= measureRich(g.ctx, label, { size }) + (5 + r) * k;
    g.circle(at(x), r, { fill });
    x -= (r + 14) * k;
  }
}

// ------------------------------------------------------------------ stage layout

/** Drawn scale [px per cm] of the full layout on a stage of w × h CSS px (as the shell fits WORLD). */
export const fullScale = (w: number, h: number): number => {
  const pad = WORLD.padPx ?? 16;
  return Math.min((w - 2 * pad) / (WORLD.x[1] - WORLD.x[0]), (h - 2 * pad) / (WORLD.y[1] - WORLD.y[0]));
};
/** Desktop scale [px per cm] (768 × 642 stage); dot sizes are set for it. */
const DESK_SCALE = 75;
/**
 * Below this full-layout scale the stage switches to the compact layout: a phone's stage
 * (390 × 253 at 390 × 844) would draw the wire at 27 px per cm, about 110 × 50 px.
 */
export const COMPACT_BELOW = 45;
/** Smallest drawn electron radius in the compact layout [px]. */
export const R_EL_COMPACT = 2.2;

export interface Layout {
  compact: boolean;
  /** Drawn scale of the wire [px per cm]. */
  scale: number;
  /** Compact only: stage px of the wire centre (L/2, 0), half-width of the wire window [px], chart plot box [px], key right edge [px]. */
  cx: number;
  cy: number;
  halfW: number;
  chart: Box;
  keyRight: number;
}

/**
 * Compact layout (short, wide stages): the wire panel on the left at the largest scale at which
 * the default 4 cm wire fits whole and the thickest wire (A = 3 mm²) fits with its arrows; a tall,
 * narrow I-V chart on the right. A longer wire shows the window around the counting section,
 * with cut (wavy) ends.
 */
export function layoutOf(w: number, h: number, k = theme.scale): Layout {
  const full = fullScale(w, h);
  if (full >= COMPACT_BELOW) return { compact: false, scale: full, cx: NaN, cy: NaN, halfW: Infinity, chart: CH, keyRight: w - 8 * k };
  const pad = 8 * k;
  const chartW = 118 * k;
  const gap = 8 * k;
  const term = 22 * k; // room for the + and − signs beside the wire ends
  const keyRow = 18 * k;
  const rows = 64 * k; // E arrow above, v_d arrow below, with their labels
  const panelR = w - pad - chartW - gap;
  const inner = panelR - pad - 2 * term;
  const scale = Math.min(DESK_SCALE, inner / REF.L, (h - 2 * pad - keyRow - rows) / (3 * H_PER_MM2));
  const chartX0 = panelR + gap;
  return {
    compact: true,
    scale,
    cx: (pad + panelR) / 2,
    cy: (pad + keyRow + h - pad) / 2,
    halfW: inner / 2,
    // Plot box inside the chart column: tick labels on the left, the V ticks and label below.
    chart: { x0: chartX0 + 30 * k, x1: w - pad - 10 * k, y0: h - pad - 38 * k, y1: pad + 6 * k },
    keyRight: panelR,
  };
}

/** Make the viewport draw world (wx, wy) at stage px (px, py) with `scale` px per world unit. */
function place(vp: Viewport, scale: number, wx: number, wy: number, px: number, py: number): void {
  const { w, h } = vp;
  const xc = wx + (w / 2 - px) / scale;
  const yc = wy - (h / 2 - py) / scale;
  vp.fit({ x: [xc - w / (2 * scale), xc + w / (2 * scale)], y: [yc, yc], aspect: 'fit-x', padPx: 0 }, w, h);
}

/** Wire end from bottom to top at x: straight, or a wavy cut line where the window crops the wire. */
function wireEnd(g: Draw, x: number, bot: number, top: number, cut: boolean, up: boolean): Vec2[] {
  if (!cut) return up ? [{ x, y: bot }, { x, y: top }] : [{ x, y: top }, { x, y: bot }];
  const a = g.px(3);
  const lam = g.px(14);
  const n = Math.max(4, Math.ceil((top - bot) / g.px(1.5)));
  const pts: Vec2[] = [];
  for (let i = 0; i <= n; i++) {
    const y = bot + ((top - bot) * i) / n;
    pts.push({ x: x + a * Math.sin((2 * Math.PI * (y - bot)) / lam), y });
  }
  return up ? pts : pts.reverse();
}

/** Readouts: measured Ī [mA], V/Ī [Ω] (NaN until there is a reading). */
export const readI = (s: S) => measuredI(s);
export const readVI = (s: S, p: P) => (p.V > 0 && measuredI(s) > 0 ? (p.V / measuredI(s)) * 1e3 : NaN);
/** Scatter of Ī [mA] and of V/Ī [Ω] at the current reading (NaN before it). */
export const scatterOf = (s: S, p: P) => {
  const sI = scatterI(p, s.t - s.t0);
  return { I: sI, VI: (readVI(s, p) * sI) / readI(s) };
};
/** Ī and V/Ī as the readouts and the Σ panel print them: to their scatter (R4, R8). */
export const fmtI = (s: S, p: P) => fmtMeas(readI(s), scatterOf(s, p).I);
export const fmtVI = (s: S, p: P) => fmtMeas(readVI(s, p), scatterOf(s, p).VI);

/**
 * Σ panel: τ(T), v_d = aτ, R = ρL/A scaled from the reference wire, the predicted V/R and, once
 * counted, the measured Ī = ΔQ/Δt and V/Ī. Policy D: sliders as their labels, derived values with
 * 3 figures, the counted ΔQ with 3 figures, Δt with the decimals of the 30 s run (R7a), Ī and V/Ī
 * to their scatter (R4) as in the readouts.
 */
export function formulaLines(s: S, p: P): string[] {
  const w = wireOf(p);
  const tau = tauOf(p.T);
  const R = resistanceOf(w);
  const sl = (k: 'V' | 'T' | 'L' | 'A') => slider(params[k] as NumberParam, p[k]);
  const lines = [`\\tau = \\tau_{300}\\,\\frac{300\\ \\mathrm{K}}{T} = (${TAU_300}\\ \\mathrm{s})\\,\\frac{300}{${sl('T')}} = ${tn(tau)}${u('s')}`];
  lines.push(
    p.V > 0 ? `v_d = a\\tau = (${tn(accelOf(w, p.V))}\\ \\mathrm{cm/s^2})(${tn(tau)}\\ \\mathrm{s}) = ${tn(driftSpeed(w, p.V))}${u('cm/s')}` : `v_d = 0\\ \\ (V = 0)`,
  );
  lines.push(
    `R = \\rho\\,\\frac{L}{A} = (${REF.R}\\ \\Omega)\\,\\frac{${sl('L')}}{${REF.L}}\\cdot\\frac{${REF.A}}{${sl('A')}}\\cdot\\frac{${sl('T')}}{${REF.T}} = ${tn(R)}${u('\\Omega')}`,
  );
  // The prediction: not the measured Ī of the readout, so not written as I.
  lines.push(`\\frac{V}{R} = \\frac{${sl('V')}\\ \\mathrm{V}}{${tn(R)}\\ \\Omega} = ${tn(currentOf(w, p.V) * 1e3)}${u('mA')}`);
  const I = readI(s);
  if (Number.isFinite(I)) {
    const dQ = (s.gas.count - s.c0) * Q_E;
    const It = texOf(fmtI(s, p));
    lines.push(`\\bar I = \\frac{\\Delta Q}{\\Delta t} = \\frac{${tn(dQ)}\\ \\mathrm{C}}{${tnScale(s.t - s.t0, RUN_END)}\\ \\mathrm{s}} = ${It}${u('mA')}`);
    if (Number.isFinite(readVI(s, p))) lines.push(`V/\\bar I = \\frac{${sl('V')}\\ \\mathrm{V}}{${It}\\ \\mathrm{mA}} = ${texOf(fmtVI(s, p))}${u('\\Omega')}`);
  }
  return lines;
}

export const conduction: Scene<P, S> = {
  id: 'drift',
  title: 'ch26.scene',
  params,
  time: { h: 1 / RATE, recordEvery: 6, frameStep: 0.1, tEnd: RUN_END },
  world: () => WORLD,

  init: (p, rng) => ({ t: 0, n: 0, gas: makeGas(wireOf(p), rng), rng, trail: [], c0: NaN, t0: NaN }),

  step: (s, h, p) => {
    const w = wireOf(p);
    const x0 = s.gas.x[0];
    stepGas(s.gas, w, p.V, h, s.rng);
    if (Math.abs(s.gas.x[0] - x0) > 0.3) s.trail.push(NaN, NaN);
    s.trail.push(s.gas.x[0], s.gas.y[0]);
    if (s.trail.length > 2 * TRAIL) s.trail.splice(0, s.trail.length - 2 * TRAIL);
    s.n += 1;
    s.t = s.n / RATE;
    if (Number.isNaN(s.c0) && s.t >= countStart(p.T) - 1e-9) {
      s.c0 = s.gas.count;
      s.t0 = s.t;
    }
  },

  record: (s) => ({ t: s.t, q: s.gas.count * Q_E, i: runningI(s, PLOT_AFTER) }),

  draw: (g, s, p) => {
    const w = wireOf(p);
    const h = heightOf(p.A);
    const top = h / 2;
    const bot = -h / 2;
    if (s.t >= 5) {
      if (!measured.has(keyOf(p))) measured.set(keyOf(p), new Map());
      measured.get(keyOf(p))!.set(p.V, measuredI(s));
    }

    const lay = layoutOf(g.vp.w, g.vp.h);
    // Compact: draw the wire at the layout's scale, its centre at the panel centre.
    if (lay.compact) place(g.vp, lay.scale, w.L / 2, 0, lay.cx, lay.cy);
    // Visible stretch of the wire: all of it, or the window around the counting section.
    const half = lay.halfW / g.vp.scale;
    const x0 = Math.max(0, w.L / 2 - half);
    const x1 = Math.min(w.L, w.L / 2 + half);
    const cut = x0 > 0;

    // Dot sizes follow the drawn scale (75 px per cm on a desktop stage); the compact layout keeps
    // electrons at least R_EL_COMPACT so they read on a phone.
    const zoom = Math.min(1, g.vp.scale / theme.scale / DESK_SCALE);
    const rIon = lay.compact ? Math.max((R_EL_COMPACT * 3.2) / 2.6, 3.2 * zoom) : Math.max(1.2, 3.2 * zoom);
    const rEl = lay.compact ? Math.max(R_EL_COMPACT, 2.6 * zoom) : Math.max(1.1, 2.6 * zoom);
    const outline = [...wireEnd(g, x0, bot, top, cut, false), ...wireEnd(g, x1, bot, top, cut, true)];
    g.polygon(outline, { fill: WIRE_FILL, color: '#8a8a8a', width: 1.25 });
    // A cropped wire clips its contents at the cut ends.
    if (cut) {
      const { ctx } = g;
      ctx.save();
      ctx.beginPath();
      outline.forEach((q, i) => {
        const [px, py] = g.vp.toPx(q.x, q.y);
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      });
      ctx.closePath();
      ctx.clip();
    }
    const near = (x: number) => x > x0 - g.px(6) && x < x1 + g.px(6);

    // Ions vibrate more at higher temperature (drawing only).
    const amp = 0.025 * Math.sqrt(p.T / 300);
    const d = 0.3;
    let k = 0;
    for (let x = d / 2; x < w.L; x += d) {
      for (let y = bot + d / 2; y < top; y += d) {
        k += 1;
        if (!near(x)) continue;
        const ph = k * 2.399;
        g.circle({ x: x + amp * Math.sin(37 * s.t + ph), y: y + amp * Math.cos(41 * s.t + 1.7 * ph) }, rIon, { fill: ION });
      }
    }

    const gas = s.gas;
    // Every SAMPLE-th electron is drawn (positions are random, so this is a fair subset).
    // Kept inside the outline by the dot radius.
    const inY = (y: number) => Math.min(top - g.px(rEl), Math.max(bot + g.px(rEl), y));
    const inX = (x: number) => Math.min(w.L - g.px(rEl), Math.max(g.px(rEl), x));
    for (let i = SAMPLE; i < gas.n; i += SAMPLE) if (near(gas.x[i])) g.circle({ x: inX(gas.x[i]), y: inY(gas.y[i]) }, rEl, { fill: 'negative' });

    // Tracer electron and its path: straight-ish arcs between collisions.
    const tr = s.trail;
    let seg: Vec2[] = [];
    for (let i = 0; i < tr.length; i += 2) {
      if (Number.isNaN(tr[i])) {
        g.polyline(seg, { color: '#1a1a1a', width: 1.1, alpha: 0.6 });
        seg = [];
      } else seg.push({ x: tr[i], y: tr[i + 1] });
    }
    g.polyline(seg, { color: '#1a1a1a', width: 1.1, alpha: 0.6 });
    const rTracer = lay.compact ? Math.max(3.5, 4.5 * zoom) : Math.max(3, 4.5 * zoom);
    g.circle({ x: inX(gas.x[0]), y: inY(gas.y[0]) }, rTracer, { fill: 'negative', color: '#1a1a1a', width: 1.5 });
    if (cut) g.ctx.restore();

    // Cross-section where charge is counted.
    g.line({ x: w.L / 2, y: bot - 0.25 }, { x: w.L / 2, y: top + 0.25 }, { role: 'surface', width: 1.75, dash: [5, 4] });

    // Terminals and the field. Compact: arrows at a fixed px distance from the wire.
    const off = lay.compact ? g.px(22) : 0.55;
    const lbl = { size: 16, align: 'center' as const, baseline: 'middle' as const, weight: 700 };
    g.text({ x: x0, y: 0 }, '+', { ...lbl, role: 'positive', dx: -14 });
    g.text({ x: x1, y: 0 }, '−', { ...lbl, role: 'negative', dx: 14 });
    if (p.V > 0) {
      const ya = top + off;
      const span = x1 - x0;
      g.arrow({ x: x0 + span * 0.2, y: ya }, { x: span * 0.22, y: 0 }, { role: 'field', width: 2 });
      g.text({ x: x0 + span * 0.42, y: ya }, '*E*', { size: 14, role: 'field', align: 'left', baseline: 'middle', dx: 8 });
      const vd = driftSpeed(w, p.V);
      // Drift velocity below the wire, pointing against E, centred on the cross-section. Length
      // ∝ v_d: 0.6 cm at the defaults, 2.7 cm at the largest drift (1.5 V, 200 K, 2 cm).
      const yb = bot - off;
      const len = vd * V_D_DRAW;
      const xa = w.L / 2 + len / 2;
      g.arrow({ x: xa, y: yb }, { x: -len, y: 0 }, { role: 'velocity', width: 2 });
      g.text({ x: xa, y: yb }, '*v*_{d}', { size: 14, role: 'velocity', align: 'left', baseline: 'middle', dx: 8 });
    }

    let box: Box = CH;
    if (lay.compact) {
      const [bx0, by0] = g.vp.toWorld(lay.chart.x0, lay.chart.y0);
      const [bx1, by1] = g.vp.toWorld(lay.chart.x1, lay.chart.y1);
      box = { x0: bx0, x1: bx1, y0: by0, y1: by1 };
    }
    drawChart(g, p, s, box);
    particleKey(g, rIon, rEl, lay.keyRight);
    // Hand the shell's viewport back as it fitted it.
    if (lay.compact) g.vp.fit(WORLD, g.vp.w, g.vp.h);
  },

  plots: [
    {
      id: 'q',
      label: 'Q\\,(\\mathrm{C})',
      traces: [{ channel: 'q', role: 'position' }],
      yRange: (p) => {
        // At low voltage the thermal counting noise dominates: keep three (bounding) standard
        // deviations at the end of the run in view.
        const n3 = (3 * noiseI(p, 30) * 30) / 1e3;
        if (p.V === 0) return [-Math.max(0.25, n3), Math.max(0.25, n3)];
        const m = Math.max(0.3, currentOf(wireOf(p), p.V) * 30 * 1.1);
        return [Math.min(-0.1 * m, -n3), m];
      },
    },
    {
      id: 'i',
      label: '\\bar I = \\Delta Q/\\Delta t\\,(\\mathrm{mA})',
      traces: [{ channel: 'i', role: 'velocity' }],
      yRange: (p) => {
        // Prediction plus four (bounding) standard deviations of the noise at the first reading
        // (about 2.8 at the start of the graph, after PLOT_AFTER of counting).
        const I = currentOf(wireOf(p), p.V) * 1e3;
        const n4 = 4 * noiseI(p, READ_AFTER);
        const hi = Math.max(1.6 * I, I + n4, 20);
        return [Math.min(-0.25 * hi, I - n4), hi];
      },
    },
  ],

  drawPlot: (id, pd, p) => {
    const I = currentOf(wireOf(p), p.V);
    const dash = { color: '#7a7a7a', width: 1.25, dash: [5, 4] };
    if (id === 'q') pd.polyline([[0, 0], [1000, I * 1000]], dash);
    else pd.polyline([[0, I * 1e3], [1000, I * 1e3]], dash);
  },

  readouts: [
    { label: '\\bar I', unit: 'mA', value: (s) => readI(s), format: (v, s, p) => fmtMeas(v, scatterOf(s, p).I) },
    { label: 'V/\\bar I', unit: 'Ω', value: (s, p) => readVI(s, p), format: (v, s, p) => fmtMeas(v, scatterOf(s, p).VI) },
    { label: '\\rho L/A', unit: 'Ω', value: (_s, p) => resistanceOf(wireOf(p)) },
  ],

  formula: (s, p) => formulaLines(s, p),

  info: {
    goals: ['ch26.goal.drift', 'ch26.goal.R'],
    observe: ['ch26.obs.zero', 'ch26.obs.drift', 'ch26.obs.count', 'ch26.obs.ohm', 'ch26.obs.LA', 'ch26.obs.T'],
    equations: ['v_d = \\frac{eE}{m}\\tau, \\quad J = n e v_d', 'I = \\frac{V}{R}, \\quad R = \\rho\\frac{L}{A}', '\\rho = \\frac{m}{e^2 n \\tau}'],
    assumptions: ['ch26.assume.speed', 'ch26.assume.model', 'ch26.assume.units', 'ch26.assume.digits'],
  },
};
