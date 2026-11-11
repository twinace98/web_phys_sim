// Ch 37 scenes (c = 1: lengths in light-seconds, times in seconds). Each of the first two tabs
// shows the same situation from S (ground) and from S' (ship) side by side; the third is a
// spacetime diagram with both sets of axes; the fourth is the train-flash experiment.
import { fmt } from '../../core/format';
import { t } from '../../core/i18n';
import type { NumberParam, ParamSchema, Scene, Vec2 } from '../../core/types';
import type { Draw } from '../../draw/draw';
import { ROLE_COLOR, theme } from '../../draw/theme';
import { measureRich } from '../../draw/text';
import { Frame, PX_WORLD, TICK, W, canvasBox, linePx, split, textPx, type Box } from '../modern/frame';
import { bounce, contracted, gamma, lorentz, movingPeriod, restPeriod, ticks, trainEvents } from './physics';

/** Frame colours: S blue, S' orange (as A and B in Ch 3). */
export const S_COLOR = ROLE_COLOR.position;
export const SP_COLOR = ROLE_COLOR.energyU;
const LIGHT = '#1a1a1a';
const TRAIL = '#9a9a9a';
const GROUND = '#c8c8c8';

const betaParam = (def: number, min: number, max: number, live = false): NumberParam => ({
  kind: 'number',
  label: 'ch37.p.beta',
  desc: 'ch37.d.beta',
  group: 'main',
  live,
  control: 'slider',
  min,
  max,
  step: 0.01,
  default: def,
});

/** Two views: side by side on wide screens, stacked on narrow ones. */
export function views(g: Draw): [Box, Box] {
  const o = canvasBox(g);
  const wide = g.vp.w > g.vp.h * 1.25;
  return split({ l: o.l + 16, t: o.t + 16, r: o.r - 16, b: o.b - 16 }, wide, 0.5, wide ? 28 : 20);
}

/** Frame with equal x and y scales: x range given, y range centred on 0 to fit the box. */
function isoFrame(g: Draw, box: Box, x0: number, x1: number, yc = 0): Frame {
  const sc = (box.r - box.l) / (x1 - x0);
  const half = (box.b - box.t) / sc / 2;
  return new Frame(g, box, [x0, x1], [yc - half, yc + half]);
}

function viewTitle(g: Draw, box: Box, key: string, colour: string): void {
  g.ctx.save();
  g.ctx.strokeStyle = '#e3e3e3';
  g.ctx.lineWidth = 1;
  g.ctx.strokeRect(box.l + 0.5, box.t + 0.5, box.r - box.l - 1, box.b - box.t - 1);
  g.ctx.restore();
  textPx(g, box.l + 10, box.t + 18, t(key), { size: 13, color: colour, weight: 600 });
}

/** x wrapped into [lo, hi). */
const wrapTo = (x: number, lo: number, hi: number) => lo + ((((x - lo) % (hi - lo)) + (hi - lo)) % (hi - lo));

/**
 * Tail x [CSS px] of a velocity arrow drawn from xPx in direction dir with length len, shifted so
 * the arrow and its label (about 18 px past the head) stay inside the box. Near the edge where
 * the object leaves the view, the arrow stays at the edge.
 */
export function arrowTail(box: Box, xPx: number, dir: 1 | -1, len: number): number {
  const room = 18 * theme.scale;
  const lo = box.l + 6 + (dir < 0 ? len + room : 0);
  const hi = box.r - 6 - (dir > 0 ? len + room : 0);
  return Math.min(hi, Math.max(lo, xPx));
}

/** Velocity arrow of a moving object at data x, kept inside the box with its label. */
function vArrow(g: Draw, f: Frame, x: number, y: number, dir: 1 | -1, beta: number): void {
  const len = (16 + 40 * beta) * theme.scale;
  const x0 = arrowTail(f.box, f.X(x), dir, len);
  g.arrow(W(g, x0, f.Y(y)), { x: dir * g.px(16 + 40 * beta), y: 0 }, { role: 'velocity', width: 2, label: '*v*' });
}

// ------------------------------------------------------------------ light clocks

type PB = { beta: number };
const L_CLOCK = 1;
const W_VIEW = 8;

function drawClock(g: Draw, f: Frame, x: number, yb: number, colour: string, tLight: number, period: number, n: number): void {
  const w = 0.35;
  f.line(x - w, yb, x + w, yb, { color: colour, width: 4 });
  f.line(x - w, yb + L_CLOCK, x + w, yb + L_CLOCK, { color: colour, width: 4 });
  g.circle(f.P(x, yb + bounce(tLight, period, L_CLOCK)), 4.5, { fill: LIGHT });
  f.text(x, yb + L_CLOCK, String(n), { size: 14, color: colour, align: 'center', dy: -12, weight: 600 });
}

/** One view of the two clocks: own clock at rest (top), the other moving at ±β (bottom). */
function clockView(g: Draw, box: Box, time: number, beta: number, own: string, other: string, dir: 1 | -1): void {
  const f = isoFrame(g, box, -0.6, W_VIEW + 0.6, 0.2);
  const yTop = 0.5;
  const yBot = -1.9;
  for (const y of [yTop, yBot]) f.line(-0.6, y - 0.12, W_VIEW + 0.6, y - 0.12, { color: GROUND, width: 1 });
  const P0 = restPeriod(L_CLOCK);
  drawClock(g, f, 1.5, yTop, own, time, P0, ticks(time, P0));
  // Moving clock: light zigzags; it wraps around the view.
  const P = movingPeriod(L_CLOCK, beta);
  const x0 = 1.5;
  const xAt = (tt: number) => wrapTo(x0 + dir * beta * tt, 0.2, W_VIEW - 0.2);
  // Trail of the light over the last two ticks, broken where the clock wraps.
  let seg: [number, number][] = [];
  const t0 = Math.max(0, time - 2 * P);
  const nPts = 160;
  let prevX = NaN;
  for (let i = 0; i <= nPts; i++) {
    const tt = t0 + ((time - t0) * i) / nPts;
    const x = xAt(tt);
    if (Math.abs(x - prevX) > 1) {
      f.polyline(seg, { color: TRAIL, width: 1.25 });
      seg = [];
    }
    seg.push([x, yBot + bounce(tt, P, L_CLOCK)]);
    prevX = x;
  }
  f.polyline(seg, { color: TRAIL, width: 1.25 });
  const xm = xAt(time);
  drawClock(g, f, xm, yBot, other, time, P, ticks(time, P));
  vArrow(g, f, xm, yBot - 0.45, dir, beta);
}

export const lightClocks: Scene<PB, { t: number; n: number }> = {
  id: 'clocks',
  title: 'ch37.c.scene',
  params: { beta: betaParam(0.8, 0, 0.99) },
  world: PX_WORLD,
  time: { h: 1 / 120, recordEvery: 4, frameStep: 0.1, tEnd: 40 },
  init: () => ({ t: 0, n: 0 }),
  step: (s) => {
    s.n += 1;
    s.t = s.n / 120;
  },
  draw: (g, s, p) => {
    const [a, b] = views(g);
    clockView(g, a, s.t, p.beta, S_COLOR, SP_COLOR, 1);
    clockView(g, b, s.t, p.beta, SP_COLOR, S_COLOR, -1);
    viewTitle(g, a, 'ch37.view.S', S_COLOR);
    viewTitle(g, b, 'ch37.view.Sp', SP_COLOR);
  },
  readouts: [
    { label: '\\gamma', unit: '', value: (_s, p) => gamma(p.beta) },
    { label: '\\Delta t_0', unit: 's', value: () => restPeriod(L_CLOCK) },
    { label: '\\Delta t', unit: 's', value: (_s, p) => movingPeriod(L_CLOCK, p.beta) },
  ],
  info: {
    goals: ['ch37.c.goal.dilate', 'ch37.c.goal.mutual'],
    observe: ['ch37.c.obs.zigzag', 'ch37.c.obs.count', 'ch37.c.obs.both', 'ch37.c.obs.beta'],
    equations: ['\\Delta t = \\gamma\\,\\Delta t_0, \\quad \\gamma = \\frac{1}{\\sqrt{1 - \\beta^2}}', '(c\\Delta t/2)^2 = L^2 + (v\\Delta t/2)^2'],
    assumptions: ['ch37.assume.units', 'ch37.c.assume.clock'],
  },
};

// ------------------------------------------------------------------ rods

const L_ROD = 4;

function drawRod(f: Frame, x: number, y: number, len: number, colour: string, spacing: number): void {
  f.polygon(
    [
      [x, y],
      [x + len, y],
      [x + len, y + 0.3],
      [x, y + 0.3],
    ],
    { fill: colour, fillAlpha: 0.25, color: colour, width: 1.5 },
  );
  for (let k = 0; k <= Math.round(len / spacing); k++) f.line(x + k * spacing, y, x + k * spacing, y + 0.3, { color: colour, width: 1 });
}

function rodView(g: Draw, box: Box, time: number, beta: number, own: string, other: string, dir: 1 | -1): void {
  const W = 10;
  const f = isoFrame(g, box, -0.5, W + 0.5, -0.3);
  const yTop = 0.6;
  const yBot = -1.4;
  for (const y of [yTop, yBot]) f.line(-0.5, y - 0.1, W + 0.5, y - 0.1, { color: GROUND, width: 1 });
  drawRod(f, 1, yTop, L_ROD, own, 1);
  const Lc = contracted(L_ROD, beta);
  const span = W + Lc + 1;
  const xs = wrapTo(1 + dir * beta * time, -Lc - 0.5, span - Lc - 0.5);
  f.clip(() => {
    drawRod(f, xs, yBot, Lc, other, Lc / L_ROD);
    drawRod(f, xs - span, yBot, Lc, other, Lc / L_ROD);
    drawRod(f, xs + span, yBot, Lc, other, Lc / L_ROD);
  });
  f.text(1, yTop + 0.3, `*L*_{0} = ${fmt(L_ROD, 3)} ls`, { size: 13, color: own, dy: -8 });
  f.text(-0.3, yBot - 0.1, `*L* = ${fmt(Lc, 3)} ls`, { size: 13, color: other, dy: 18 });
  const xm = wrapTo(xs + Lc / 2, -0.5, W + 0.5);
  vArrow(g, f, xm, yBot + 0.6, dir, beta);
}

export const rods: Scene<PB, { t: number; n: number }> = {
  id: 'rods',
  title: 'ch37.l.scene',
  params: { beta: betaParam(0.8, 0, 0.99) },
  world: PX_WORLD,
  time: { h: 1 / 120, recordEvery: 4, frameStep: 0.1, tEnd: 40 },
  init: () => ({ t: 0, n: 0 }),
  step: (s) => {
    s.n += 1;
    s.t = s.n / 120;
  },
  draw: (g, s, p) => {
    const [a, b] = views(g);
    rodView(g, a, s.t, p.beta, S_COLOR, SP_COLOR, 1);
    rodView(g, b, s.t, p.beta, SP_COLOR, S_COLOR, -1);
    viewTitle(g, a, 'ch37.view.S', S_COLOR);
    viewTitle(g, b, 'ch37.view.Sp', SP_COLOR);
  },
  readouts: [
    { label: '\\gamma', unit: '', value: (_s, p) => gamma(p.beta) },
    { label: 'L_0', unit: 'ls', value: () => L_ROD },
    { label: 'L', unit: 'ls', value: (_s, p) => contracted(L_ROD, p.beta) },
  ],
  info: {
    goals: ['ch37.l.goal.contract', 'ch37.l.goal.mutual'],
    observe: ['ch37.l.obs.short', 'ch37.l.obs.both', 'ch37.l.obs.beta'],
    equations: ['L = \\frac{L_0}{\\gamma} = L_0\\sqrt{1 - \\beta^2}'],
    assumptions: ['ch37.assume.units', 'ch37.l.assume.rod'],
  },
};

// ------------------------------------------------------------------ spacetime diagram

type PD = { beta: number; grid: boolean; A: number[]; B: number[] };

const X_HALF = 4;
const CT_LO = -1;
const CT_HI = 7;

const diagramParams: ParamSchema<PD> = {
  beta: betaParam(0.5, 0, 0.8, true),
  grid: { kind: 'toggle', label: 'ch37.d.p.grid', desc: 'ch37.d.d.grid', group: 'advanced', live: true, default: true },
  A: { kind: 'array', label: 'ch37.d.p.A', group: 'hidden', live: true, default: [-1.5, 3], min: -X_HALF, max: CT_HI },
  B: { kind: 'array', label: 'ch37.d.p.B', group: 'hidden', live: true, default: [1.5, 3], min: -X_HALF, max: CT_HI },
};

const r1 = (v: number) => Math.round(v * 10) / 10;
const clampEv = (w: Vec2): number[] => [r1(Math.max(-X_HALF + 0.2, Math.min(X_HALF - 0.2, w.x))), r1(Math.max(CT_LO + 0.2, Math.min(CT_HI - 0.2, w.y)))];

/** TeX table of both events in both frames. */
export function eventTable(p: PD): string {
  const row = (name: string, e: number[]) => {
    const [xp, tp] = lorentz(e[0], e[1], p.beta);
    const S = (v: string) => `\\textcolor{${S_COLOR}}{${v}}`;
    const Sp = (v: string) => `\\textcolor{${SP_COLOR}}{${v}}`;
    const n = (v: number) => (Math.abs(v) < 0.005 ? '0.00' : v.toFixed(2));
    return `${name} & ${S(`(${n(e[0])},\\ ${n(e[1])})`)} & ${Sp(`(${n(xp)},\\ ${n(tp)})`)}`;
  };
  return `\\begin{array}{lcc} & \\textcolor{${S_COLOR}}{(x,\\ ct)} & \\textcolor{${SP_COLOR}}{(x',\\ ct')} \\\\ ${row('A', p.A)} \\\\ ${row('B', p.B)} \\end{array}`;
}

export const spacetime: Scene<PD, { t: number }> = {
  id: 'spacetime',
  title: 'ch37.d.scene',
  params: diagramParams,
  world: () => ({ x: [-X_HALF - 0.3, X_HALF + 0.3], y: [CT_LO - 0.3, CT_HI + 0.3], aspect: 'contain', padPx: 24 }),
  init: () => ({ t: 0 }),

  draw: (g, _s, p) => {
    const b = p.beta;
    const P = (x: number, y: number): Vec2 => ({ x, y });
    const ctx = g.ctx;
    // Clip to the diagram square.
    const [cl, ct] = g.vp.toPx(-X_HALF, CT_HI);
    const [cr, cb] = g.vp.toPx(X_HALF, CT_LO);
    ctx.save();
    ctx.beginPath();
    ctx.rect(cl, ct, cr - cl, cb - ct);
    ctx.clip();
    if (p.grid) {
      for (let k = -8; k <= 8; k++) {
        g.line(P(k, CT_LO), P(k, CT_HI), { color: '#ececec', width: 1 });
        g.line(P(-X_HALF, k), P(X_HALF, k), { color: '#ececec', width: 1 });
      }
      if (b > 0) {
        // Lines of constant x' (slope 1/β) and constant ct' (slope β), spaced by one unit of S'.
        const gm = gamma(b);
        for (let k = -12; k <= 12; k++) {
          // x' = k: x = βct + k/γ ; ct' = k: ct = βx + k/γ
          g.line(P(b * (CT_LO - 2) + k / gm, CT_LO - 2), P(b * (CT_HI + 2) + k / gm, CT_HI + 2), { color: SP_COLOR, width: 1, alpha: 0.22 });
          g.line(P(-X_HALF - 2, b * (-X_HALF - 2) + k / gm), P(X_HALF + 2, b * (X_HALF + 2) + k / gm), { color: SP_COLOR, width: 1, alpha: 0.22 });
        }
      }
    }
    // Light cone through the origin.
    g.line(P(-8, -8), P(8, 8), { color: '#9a9a9a', width: 1.25, dash: [5, 4] });
    g.line(P(8, -8), P(-8, 8), { color: '#9a9a9a', width: 1.25, dash: [5, 4] });
    // Lines of simultaneity through each event: horizontal in S, slope β in S'.
    for (const e of [p.A, p.B]) {
      g.line(P(-X_HALF - 1, e[1]), P(X_HALF + 1, e[1]), { color: S_COLOR, width: 1.25, dash: [6, 4], alpha: 0.8 });
      const c = e[1] - b * e[0];
      g.line(P(-X_HALF - 1, c + b * (-X_HALF - 1)), P(X_HALF + 1, c + b * (X_HALF + 1)), { color: SP_COLOR, width: 1.25, dash: [6, 4], alpha: 0.9 });
    }
    ctx.restore();
    // Axes: S (x, ct) and S' (x', ct').
    g.arrow(P(-X_HALF, 0), P(2 * X_HALF, 0), { color: S_COLOR, width: 1.5 });
    g.arrow(P(0, CT_LO), P(0, CT_HI - CT_LO), { color: S_COLOR, width: 1.5 });
    g.text(P(X_HALF, 0), '*x*', { size: 14, color: S_COLOR, dx: 4, dy: 16, align: 'right' });
    g.text(P(0, CT_HI), '*ct*', { size: 14, color: S_COLOR, dx: -8, dy: 4, align: 'right' });
    if (b > 0) {
      const tEnd = Math.min(CT_HI, X_HALF / b);
      g.arrow(P(b * CT_LO, CT_LO), P(b * (tEnd - CT_LO), tEnd - CT_LO), { color: SP_COLOR, width: 1.5 });
      g.text(P(b * tEnd, tEnd), '*ct*′', { size: 14, color: SP_COLOR, dx: 10, dy: 4 });
      const xEnd = Math.min(X_HALF, CT_HI / b);
      const xStart = Math.max(-X_HALF, CT_LO / b);
      g.arrow(P(xStart, b * xStart), P(xEnd - xStart, b * (xEnd - xStart)), { color: SP_COLOR, width: 1.5 });
      g.text(P(xEnd, b * xEnd), '*x*′', { size: 14, color: SP_COLOR, dx: 2, dy: -10, align: 'right' });
    }
    for (const [name, e] of [
      ['A', p.A],
      ['B', p.B],
    ] as [string, number[]][]) {
      g.circle(P(e[0], e[1]), 13, { fill: '#1a1a1a', alpha: 0.08 });
      g.circle(P(e[0], e[1]), 5.5, { fill: '#1a1a1a' });
      g.text(P(e[0], e[1]), name, { size: 14, color: '#1a1a1a', dx: 10, dy: 16, weight: 600 });
    }
  },

  overlay: (_s, p) => eventTable(p),

  handles: [
    {
      pos: (_s, p) => ({ x: p.A[0], y: p.A[1] }),
      radiusPx: 16,
      onDrag: (ctx, _s, w) => {
        const v = clampEv(w);
        if (v[0] !== ctx.params.A[0] || v[1] !== ctx.params.A[1]) ctx.set('A', v);
      },
    },
    {
      pos: (_s, p) => ({ x: p.B[0], y: p.B[1] }),
      radiusPx: 16,
      onDrag: (ctx, _s, w) => {
        const v = clampEv(w);
        if (v[0] !== ctx.params.B[0] || v[1] !== ctx.params.B[1]) ctx.set('B', v);
      },
    },
  ],

  readouts: [
    { label: '\\gamma', unit: '', value: (_s, p) => gamma(p.beta) },
    { label: '\\Delta t', unit: 's', value: (_s, p) => p.B[1] - p.A[1] },
    { label: "\\Delta t'", unit: 's', value: (_s, p) => lorentz(p.B[0], p.B[1], p.beta)[1] - lorentz(p.A[0], p.A[1], p.beta)[1] },
  ],

  info: {
    goals: ['ch37.d.goal.axes', 'ch37.d.goal.simul'],
    observe: ['ch37.d.obs.drag', 'ch37.d.obs.simul', 'ch37.d.obs.order', 'ch37.d.obs.light'],
    equations: ["x' = \\gamma(x - \\beta\\,ct), \\quad ct' = \\gamma(ct - \\beta x)", "\\Delta t' = \\gamma\\left(\\Delta t - \\frac{v\\,\\Delta x}{c^2}\\right)"],
    assumptions: ['ch37.assume.units', 'ch37.d.assume.origin'],
  },
};

// ------------------------------------------------------------------ simultaneity (train)

type PT = { beta: number };
const L_TRAIN = 4;
const tEndTrain = (p: PT) => trainEvents(L_TRAIN, p.beta).frontS + 0.8;

/** Ground posts 1 ls apart in S (x = k). In S' at time t' they sit at x' = k/γ − βt'. */
export function groundPosts(xr: [number, number], time: number, beta: number, inS: boolean): number[] {
  const sp = inS ? 1 : 1 / gamma(beta);
  const shift = inS ? 0 : -beta * time;
  const out: number[] = [];
  for (let k = Math.floor((xr[0] - shift) / sp) - 1; k <= (xr[1] - shift) / sp + 1; k++) {
    const x = k * sp + shift;
    if (x >= xr[0] && x <= xr[1]) out.push(x);
  }
  return out;
}

function trainView(g: Draw, box: Box, time: number, p: PT, inS: boolean, xr: [number, number]): void {
  const f = isoFrame(g, box, xr[0], xr[1], 0.3);
  const b = p.beta;
  const len = inS ? contracted(L_TRAIN, b) : L_TRAIN;
  const xc = inS ? b * time : 0;
  const yG = -0.25;
  const ev = trainEvents(L_TRAIN, b);
  // Ground with posts; in the train frame they move left and their spacing is contracted.
  f.line(xr[0], yG, xr[1], yG, { color: '#8c8c8c', width: 1.5 });
  for (const x of groundPosts(xr, time, b, inS)) f.line(x, yG, x, yG - 0.15, { color: '#8c8c8c', width: 1 });
  // Flash point on the ground (fixed in S).
  const xFlash = inS ? 0 : -b * time;
  g.polygon([f.P(xFlash, yG), f.P(xFlash - 0.07, yG - 0.14), f.P(xFlash + 0.07, yG - 0.14)], { fill: '#8c8c8c' });
  // Train.
  const col = SP_COLOR;
  f.polygon(
    [
      [xc - len / 2, 0],
      [xc + len / 2, 0],
      [xc + len / 2, 0.7],
      [xc - len / 2, 0.7],
    ],
    { fill: col, fillAlpha: 0.18, color: col, width: 1.5 },
  );
  if (inS) g.arrow(f.P(xc, 1.05), { x: g.px(16 + 40 * b), y: 0 }, { role: 'velocity', width: 2, label: '*v*' });
  // Light: two pulses from the flash at t = 0, each stopping at its end of the train.
  const tR = inS ? ev.rearS : ev.rearSp;
  const tF = inS ? ev.frontS : ev.frontSp;
  const x0 = 0; // the flash is at x = 0 in both frames (centre of the train at t = 0)
  const xR = x0 - Math.min(time, tR);
  const xF = x0 + Math.min(time, tF);
  const yL = 0.35;
  if (time > 0) {
    f.line(xR, yL, xF, yL, { color: TRAIL, width: 1.25, dash: [4, 3] });
    g.circle(f.P(xR, yL), 4.5, { fill: LIGHT });
    g.circle(f.P(xF, yL), 4.5, { fill: LIGHT });
  }
  g.circle(f.P(x0 + (inS ? b * time : 0), 0.7), 4, { fill: '#F0E442', color: '#8c6d00', width: 1 });
  const tSym = inS ? '*t*' : '*t*′';
  // Arrival events: ringed, with their time below the ground line (kept inside the view).
  for (const [te, xe] of [
    [tR, xR],
    [tF, xF],
  ]) {
    if (time >= te) {
      g.circle(f.P(xe, yL), 10, { color: LIGHT, width: 1.5 });
      const label = `${tSym} = ${fmt(te, 3)} s`;
      const half = measureRich(g.ctx, label, { size: 13 }) / 2;
      const px = Math.min(Math.max(f.X(xe), box.l + half + 4), box.r - half - 4);
      linePx(g, f.X(xe), f.Y(yL) + 10, f.X(xe), f.Y(yG) + 18, { color: '#c8c8c8', width: 1, dash: [2, 3] });
      textPx(g, px, f.Y(yG) + 34, label, { size: 13, color: LIGHT, align: 'center' });
    }
  }
}

export const simultaneity: Scene<PT, { t: number; n: number }> = {
  id: 'simultaneity',
  title: 'ch37.s.scene',
  params: { beta: betaParam(0.6, 0.1, 0.8) },
  world: PX_WORLD,
  time: { h: 1 / 120, recordEvery: 4, frameStep: 0.1, tEnd: (p) => tEndTrain(p as PT) },
  init: () => ({ t: 0, n: 0 }),
  step: (s, _h, p) => {
    s.n += 1;
    s.t = Math.min(s.n / 120, tEndTrain(p));
  },
  draw: (g, s, p) => {
    const o = canvasBox(g);
    const [a, b] = split({ l: o.l + 16, t: o.t + 16, r: o.r - 16, b: o.b - 16 }, false, 0.5, 20);
    const ev = trainEvents(L_TRAIN, p.beta);
    const xr: [number, number] = [-L_TRAIN / 2 - 1.2, Math.max(L_TRAIN / 2, ev.frontS) + 1.6];
    trainView(g, a, s.t, p, true, xr);
    trainView(g, b, s.t, p, false, xr);
    viewTitle(g, a, 'ch37.view.S', S_COLOR);
    viewTitle(g, b, 'ch37.view.Strain', SP_COLOR);
    textPx(g, a.r - 10, a.t + 18, `*t* = ${s.t.toFixed(2)} s`, { size: 13, color: TICK, align: 'right' });
    textPx(g, b.r - 10, b.t + 18, `*t*′ = ${s.t.toFixed(2)} s`, { size: 13, color: TICK, align: 'right' });
  },
  readouts: [
    { label: '\\gamma', unit: '', value: (_s, p) => gamma(p.beta) },
    { label: '\\Delta t', unit: 's', value: (_s, p) => trainEvents(L_TRAIN, p.beta).frontS - trainEvents(L_TRAIN, p.beta).rearS },
    { label: "\\Delta t'", unit: 's', value: () => 0 },
  ],
  info: {
    goals: ['ch37.s.goal.relative', 'ch37.s.goal.c'],
    observe: ['ch37.s.obs.train', 'ch37.s.obs.ground', 'ch37.s.obs.dt', 'ch37.s.obs.diagram'],
    equations: ["\\Delta t = \\gamma\\,\\frac{v L_0}{c^2} \\quad (\\Delta t' = 0)"],
    assumptions: ['ch37.assume.units', 'ch37.s.assume.train'],
  },
};
