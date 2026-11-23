// Ch 37 scenes (c = 1: lengths in light-seconds, times in seconds). Each of the first two tabs
// shows the same situation from S (ground) and from S' (ship) side by side; the third is a
// spacetime diagram with both sets of axes, on which time dilation, length contraction and the
// order of two events are read off; the fourth is the train-flash experiment.
import { fmt } from '../../core/format';
import { t } from '../../core/i18n';
import { paren, slider, tn, u } from '../../core/tex';
import type { NumberParam, ParamSchema, Scene, Vec2 } from '../../core/types';
import type { Draw } from '../../draw/draw';
import { ROLE_COLOR, theme } from '../../draw/theme';
import { measureRich } from '../../draw/text';
import { Frame, PX_WORLD, TICK, W, canvasBox, linePx, split, textPx, type Box } from '../modern/frame';
import { bounce, contracted, dilationEvents, fromS, fromSp, gamma, interval, movingPeriod, restPeriod, rodEvents, ticks, trainEvents, type Event2 } from './physics';

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
const D_CLOCK = 1;
const W_VIEW = 8;

function drawClock(g: Draw, f: Frame, x: number, yb: number, colour: string, tLight: number, period: number, n: number): void {
  const w = 0.35;
  f.line(x - w, yb, x + w, yb, { color: colour, width: 4 });
  f.line(x - w, yb + D_CLOCK, x + w, yb + D_CLOCK, { color: colour, width: 4 });
  g.circle(f.P(x, yb + bounce(tLight, period, D_CLOCK)), 4.5, { fill: LIGHT });
  f.text(x, yb + D_CLOCK, String(n), { size: 14, color: colour, align: 'center', dy: -12, weight: 600 });
}

/** One view of the two clocks: own clock at rest (top), the other moving at ±β (bottom). */
function clockView(g: Draw, box: Box, time: number, beta: number, own: string, other: string, dir: 1 | -1): void {
  const f = isoFrame(g, box, -0.6, W_VIEW + 0.6, 0.2);
  const yTop = 0.5;
  const yBot = -1.9;
  for (const y of [yTop, yBot]) f.line(-0.6, y - 0.12, W_VIEW + 0.6, y - 0.12, { color: GROUND, width: 1 });
  const P0 = restPeriod(D_CLOCK);
  drawClock(g, f, 1.5, yTop, own, time, P0, ticks(time, P0));
  // Moving clock: light zigzags; it wraps around the view.
  const P = movingPeriod(D_CLOCK, beta);
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
    seg.push([x, yBot + bounce(tt, P, D_CLOCK)]);
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
    { label: '\\Delta t_0', unit: 's', value: () => restPeriod(D_CLOCK) },
    { label: '\\Delta t', unit: 's', value: (_s, p) => movingPeriod(D_CLOCK, p.beta) },
  ],
  formula: (s, p) => clockLines(s.t, p.beta),
  info: {
    goals: ['ch37.c.goal.dilate', 'ch37.c.goal.mutual'],
    observe: ['ch37.c.obs.zigzag', 'ch37.c.obs.count', 'ch37.c.obs.both', 'ch37.c.obs.beta'],
    equations: ['\\Delta t = \\gamma\\,\\Delta t_0, \\quad \\gamma = \\frac{1}{\\sqrt{1 - \\beta^2}}', '(c\\Delta t/2)^2 = D^2 + (v\\Delta t/2)^2'],
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
  formula: (_s, p) => rodLines(p.beta),
  info: {
    goals: ['ch37.l.goal.contract', 'ch37.l.goal.mutual'],
    observe: ['ch37.l.obs.short', 'ch37.l.obs.both', 'ch37.l.obs.beta'],
    equations: ['L = \\frac{L_0}{\\gamma} = L_0\\sqrt{1 - \\beta^2}'],
    assumptions: ['ch37.assume.units', 'ch37.l.assume.rod'],
  },
};

// ------------------------------------------------------------------ spacetime diagram

type PD = { mode: string; beta: number; grid: boolean; B: number[] };

const X_HALF = 4;
const CT_LO = -1;
const CT_HI = 7;
/** Proper time of the marked tick: one tick of the light clock of tab 1 (Δt₀ = 2 s). */
export const TAU_TICK = restPeriod(D_CLOCK);
/** Rod at rest in S' between x' = −3.5 and x' = −0.5 (L₀ = 3 ls), cut at ct' = 2.5. */
export const ROD_L0 = 3;
const ROD_FRONT = -0.5;
const ROD_TP = 2.5;

const diagramParams: ParamSchema<PD> = {
  mode: {
    kind: 'select',
    label: 'ch37.d.p.mode',
    desc: 'ch37.d.d.mode',
    group: 'main',
    live: true,
    default: 'dilate',
    options: [
      { value: 'dilate', label: 'ch37.d.mode.dilate' },
      { value: 'contract', label: 'ch37.d.mode.contract' },
      { value: 'order', label: 'ch37.d.mode.order' },
    ],
  },
  beta: betaParam(0.6, 0, 0.8, true),
  grid: { kind: 'toggle', label: 'ch37.d.p.grid', desc: 'ch37.d.d.grid', group: 'advanced', live: true, default: true },
  B: { kind: 'array', label: 'ch37.d.p.B', group: 'hidden', live: true, default: [3, 1], min: -X_HALF, max: CT_HI },
};

const r1 = (v: number) => Math.round(v * 10) / 10;
const clampEv = (w: Vec2): number[] => [r1(Math.max(-X_HALF + 0.2, Math.min(X_HALF - 0.2, w.x))), r1(Math.max(CT_LO + 0.2, Math.min(CT_HI - 0.2, w.y)))];

/** Events shown in each reading, in table order. */
export function diagramEvents(p: PD): [string, Event2][] {
  if (p.mode === 'contract') {
    const r = rodEvents(ROD_L0, ROD_FRONT, ROD_TP, p.beta);
    return [
      ['F', r.F],
      ['R', r.R],
      ["R'", r.Rp],
    ];
  }
  if (p.mode === 'order') {
    return [
      ['A', fromS(0, 0, p.beta)],
      ['B', fromS(p.B[0], p.B[1], p.beta)],
    ];
  }
  return [
    ['O', fromS(0, 0, p.beta)],
    ['E', dilationEvents(TAU_TICK, p.beta).E],
  ];
}

export const n2 = (v: number) => (Math.abs(v) < 0.005 ? '0.00' : v.toFixed(2));

/** TeX panel: the events in both frames, then the quantity read off the diagram. */
export function eventTable(p: PD): string {
  const S = (v: string) => `\\textcolor{${S_COLOR}}{${v}}`;
  const Sp = (v: string) => `\\textcolor{${SP_COLOR}}{${v}}`;
  const rows = diagramEvents(p)
    .map(([name, e]) => `${name} & ${S(`(${n2(e.x)},\\ ${n2(e.t)})`)} & ${Sp(`(${n2(e.xp)},\\ ${n2(e.tp)})`)}`)
    .join(' \\\\ ');
  const table = `\\begin{array}{lcc} & ${S('(x,\\ ct)')} & ${Sp("(x',\\ ct')")} \\\\ ${rows} \\end{array}`;
  return `\\begin{array}{l} ${table} \\\\ ${diagramResult(p)} \\end{array}`;
}

/** The reading: Δt = γΔt₀, L = L₀/γ, or the two time differences of A and B. */
export function diagramResult(p: PD): string {
  const g = gamma(p.beta);
  if (p.mode === 'contract') return `L = L_0/\\gamma = ${n2(ROD_L0)}/${n2(g)} = ${n2(ROD_L0 / g)}\\ \\text{ls}`;
  if (p.mode === 'order') {
    const [, B] = diagramEvents(p)[1];
    return `\\Delta t = ${n2(B.t)}\\ \\text{s}, \\quad \\Delta t' = ${n2(B.tp)}\\ \\text{s}`;
  }
  return `\\Delta t = \\gamma\\,\\Delta t_0 = ${n2(g)} \\times ${n2(TAU_TICK)} = ${n2(g * TAU_TICK)}\\ \\text{s}`;
}

const P = (x: number, y: number): Vec2 => ({ x, y });
const EVENT = '#1a1a1a';

/** Dot with a label; dx, dy in px. */
function eventDot(g: Draw, e: Event2, name: string, dx: number, dy: number, align: 'left' | 'right' = 'left'): void {
  g.circle(P(e.x, e.t), 4.5, { fill: EVENT });
  g.text(P(e.x, e.t), name, { size: 14, color: EVENT, dx, dy, weight: 600, align });
}

/** A label of about 20 × 14 px: half extents in x and y [px]. */
const LABEL_HALF = [10, 7] as const;

/**
 * Where to put a segment's name: the first point along the segment, on the first side that works
 * (1: below on screen, −1: above), where the label clears (by 12 px, else 3 px) every line given as
 * (point, direction) in world coordinates. Returns the anchor and the px offset for g.text.
 */
export function segmentSpot(g: Draw, a: Event2, b: Event2, sides: (1 | -1)[], lines: [Vec2, Vec2][]): { at: Vec2; dx: number; dy: number } {
  const [ax, ay] = g.vp.toPx(a.x, a.t);
  const [bx, by] = g.vp.toPx(b.x, b.t);
  const len = Math.hypot(bx - ax, by - ay);
  // Unit normal pointing down the screen.
  let nx = len > 1 ? -(by - ay) / len : 0;
  let ny = len > 1 ? (bx - ax) / len : 1;
  if (ny < 0) [nx, ny] = [-nx, -ny];
  const off = LABEL_HALF[0] * Math.abs(nx) + LABEL_HALF[1] * Math.abs(ny) + 6;
  const spot = (f: number, side: number) => ({ at: P(a.x + f * (b.x - a.x), a.t + f * (b.t - a.t)), dx: side * nx * off, dy: side * ny * off + 5 });
  for (const gap of [12, 3])
    for (const side of sides)
      for (const f of [0.5, 0.35, 0.65, 0.25, 0.75]) {
        const s = spot(f, side);
        const [px, py] = g.vp.toPx(s.at.x, s.at.y);
        const cx = px + s.dx;
        const cy = py + s.dy - 5;
        const clear = lines.every(([p0, d]) => {
          const [x0, y0] = g.vp.toPx(p0.x, p0.y);
          const [x1, y1] = g.vp.toPx(p0.x + d.x, p0.y + d.y);
          const ux = x1 - x0;
          const uy = y1 - y0;
          const l = Math.hypot(ux, uy);
          // Distance from the label's centre to the line, less the label's half extent along the normal.
          return (Math.abs((cx - x0) * uy - (cy - y0) * ux) - LABEL_HALF[0] * Math.abs(uy) - LABEL_HALF[1] * Math.abs(ux)) / l >= gap;
        });
        if (clear) return s;
      }
  return spot(0.5, sides[0]);
}

/** Line of simultaneity through an event (horizontal in S, slope β in S'), from x0 to x1. */
function simLine(g: Draw, e: Event2, beta: number, frame: 'S' | 'Sp', x0 = -X_HALF - 1, x1 = X_HALF + 1): void {
  const k = frame === 'S' ? 0 : beta;
  g.line(P(x0, e.t + k * (x0 - e.x)), P(x1, e.t + k * (x1 - e.x)), { color: frame === 'S' ? S_COLOR : SP_COLOR, width: 1.25, dash: [6, 4], alpha: 0.9 });
}

/** Clock ticks: ct ticks on the ct axis (labels left), ct' ticks on the ct' axis (labels right, E at Δt₀). */
function drawTicks(g: Draw, beta: number): void {
  const gm = gamma(beta);
  for (let k = 1; k < CT_HI; k++) {
    g.line(P(-0.1, k), P(0.1, k), { color: S_COLOR, width: 1.5 });
    g.text(P(0, k), String(k), { size: 12, color: S_COLOR, dx: -9, align: 'right', baseline: 'middle' });
  }
  // A tick on the ct' axis is a short piece of the line of constant ct' (slope β).
  const h = 0.1;
  for (let k = 1; gm * k <= CT_HI - 0.3 && beta * gm * k <= X_HALF - 0.3; k++) {
    const e = fromSp(0, k, beta);
    const d = h / Math.sqrt(1 + beta * beta);
    g.line(P(e.x - d, e.t - beta * d), P(e.x + d, e.t + beta * d), { color: SP_COLOR, width: 1.5 });
    const isE = Math.abs(k - TAU_TICK) < 1e-9;
    if (isE) g.circle(P(e.x, e.t), 4.5, { fill: EVENT });
    g.text(P(e.x, e.t), isE ? 'E' : String(k), { size: isE ? 14 : 12, color: isE ? EVENT : SP_COLOR, dx: 10, baseline: 'middle', weight: isE ? 600 : 400 });
  }
}

export const spacetime: Scene<PD, { t: number }> = {
  id: 'spacetime',
  title: 'ch37.d.scene',
  params: diagramParams,
  world: () => ({ x: [-X_HALF - 0.3, X_HALF + 0.3], y: [CT_LO - 0.3, CT_HI + 0.3], aspect: 'contain', padPx: 24 }),
  init: () => ({ t: 0 }),

  draw: (g, _s, p) => {
    const b = p.beta;
    const gm = gamma(b);
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
        for (let k = -12; k <= 12; k++) {
          // x' = k: x = βct + k/γ ; ct' = k: ct = βx + k/γ
          g.line(P(b * (CT_LO - 2) + k / gm, CT_LO - 2), P(b * (CT_HI + 2) + k / gm, CT_HI + 2), { color: SP_COLOR, width: 1, alpha: 0.22 });
          g.line(P(-X_HALF - 2, b * (-X_HALF - 2) + k / gm), P(X_HALF + 2, b * (X_HALF + 2) + k / gm), { color: SP_COLOR, width: 1, alpha: 0.22 });
        }
      }
    }
    if (p.mode === 'order' && b > 0) {
      // Between the x and x' axes the order of an event relative to A (the origin) differs in S and S'.
      for (const s of [1, -1]) g.polygon([P(0, 0), P(s * (X_HALF + 1), 0), P(s * (X_HALF + 1), s * b * (X_HALF + 1))], { fill: '#9a9a9a', fillAlpha: 0.16 });
    }
    if (p.mode === 'contract') {
      // World strip of the rod (at rest in S'): its two ends move along lines of constant x'.
      const xs = (xp: number, t: number) => xp / gm + b * t;
      const rear = ROD_FRONT - ROD_L0;
      const t0 = CT_LO - 2;
      const t1 = CT_HI + 2;
      g.polygon([P(xs(rear, t0), t0), P(xs(ROD_FRONT, t0), t0), P(xs(ROD_FRONT, t1), t1), P(xs(rear, t1), t1)], { fill: SP_COLOR, fillAlpha: 0.12 });
      for (const xp of [rear, ROD_FRONT]) g.line(P(xs(xp, t0), t0), P(xs(xp, t1), t1), { color: SP_COLOR, width: 2 });
    }
    // Light cone through the origin.
    g.line(P(-8, -8), P(8, 8), { color: '#9a9a9a', width: 1.25, dash: [5, 4] });
    g.line(P(8, -8), P(-8, 8), { color: '#9a9a9a', width: 1.25, dash: [5, 4] });
    // Lines of simultaneity of the readings: E to the S clock; the rod cuts a little past their ends.
    const RUN = 0.8;
    if (p.mode === 'dilate') {
      const E = dilationEvents(TAU_TICK, b).E;
      simLine(g, E, b, 'S', 0, E.x);
    }
    if (p.mode === 'contract') {
      const r = rodEvents(ROD_L0, ROD_FRONT, ROD_TP, b);
      simLine(g, r.F, b, 'S', r.R.x - RUN, r.F.x + RUN);
      simLine(g, r.F, b, 'Sp', r.Rp.x - RUN, r.F.x + RUN);
    }
    if (p.mode === 'order') {
      const e = fromS(p.B[0], p.B[1], b);
      simLine(g, e, b, 'S');
      simLine(g, e, b, 'Sp');
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

    if (p.mode === 'dilate') {
      // The S' clock (at x' = 0, on the ct' axis) and the S clock (at x = 0, on the ct axis).
      drawTicks(g, b);
      const { S } = dilationEvents(TAU_TICK, b);
      g.circle(P(S.x, S.t), 4.5, { fill: S_COLOR });
    } else if (p.mode === 'contract') {
      const r = rodEvents(ROD_L0, ROD_FRONT, ROD_TP, b);
      g.line(P(r.Rp.x, r.Rp.t), P(r.F.x, r.F.t), { color: SP_COLOR, width: 4 });
      g.line(P(r.R.x, r.R.t), P(r.F.x, r.F.t), { color: S_COLOR, width: 4 });
      // Segment names placed where they clear the axes, the light cone and the rod's worldlines.
      const xs = (xp: number, t: number) => xp / gm + b * t;
      const lines: [Vec2, Vec2][] = [
        [P(0, 0), P(0, 1)],
        [P(0, 0), P(1, 0)],
        [P(0, 0), P(b, 1)],
        [P(0, 0), P(1, b)],
        [P(0, 0), P(1, 1)],
        [P(0, 0), P(-1, 1)],
        [P(xs(ROD_FRONT, 0), 0), P(b, 1)],
        [P(xs(ROD_FRONT - ROD_L0, 0), 0), P(b, 1)],
      ];
      const sL = segmentSpot(g, r.R, r.F, [-1], [...lines, [P(r.F.x, r.F.t), P(1, b)]]);
      g.text(sL.at, '*L*', { size: 14, color: S_COLOR, dx: sL.dx, dy: sL.dy, align: 'center' });
      const sL0 = segmentSpot(g, r.Rp, r.F, [1, -1], [...lines, [P(r.F.x, r.F.t), P(1, 0)]]);
      g.text(sL0.at, '*L*_{0}', { size: 14, color: SP_COLOR, dx: sL0.dx, dy: sL0.dy, align: 'center' });
      eventDot(g, r.F, 'F', 10, 18);
      eventDot(g, r.R, 'R', -10, -8, 'right');
      eventDot(g, r.Rp, 'R′', 8, 18);
    } else {
      const A = fromS(0, 0, b);
      const B = fromS(p.B[0], p.B[1], b);
      g.circle(P(B.x, B.t), 13, { fill: EVENT, alpha: 0.08 });
      eventDot(g, A, 'A', -20, -4, 'right');
      eventDot(g, B, 'B', 10, 16);
    }
  },

  overlay: (_s, p) => eventTable(p),

  handles: [
    {
      pos: (_s, p) => ({ x: p.B[0], y: p.B[1] }),
      radiusPx: 16,
      when: (p) => p.mode === 'order',
      onDrag: (ctx, _s, w) => {
        const v = clampEv(w);
        if (v[0] !== ctx.params.B[0] || v[1] !== ctx.params.B[1]) ctx.set('B', v);
      },
    },
  ],

  readouts: [{ label: '\\gamma', unit: '', value: (_s, p) => gamma(p.beta) }],

  formula: (_s, p) => diagramLines(p),

  info: {
    goals: ['ch37.d.goal.axes', 'ch37.d.goal.read', 'ch37.d.goal.order'],
    observe: ['ch37.d.obs.dilate', 'ch37.d.obs.ticks', 'ch37.d.obs.contract', 'ch37.d.obs.order', 'ch37.d.obs.light'],
    equations: [
      "x' = \\gamma(x - \\beta\\,ct), \\quad ct' = \\gamma(ct - \\beta x)",
      '\\Delta t = \\gamma\\,\\Delta t_0, \\quad L = \\frac{L_0}{\\gamma}',
      "\\Delta t' = \\gamma\\left(\\Delta t - \\frac{v\\,\\Delta x}{c^2}\\right)",
    ],
    assumptions: ['ch37.d.assume.terms', 'ch37.assume.units', 'ch37.d.assume.origin', 'ch37.d.assume.objects'],
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
    // Zero by construction (both flashes reach the ends at L₀/2c in S'): an exact 0 (R7a), as in the Σ panel.
    { label: "\\Delta t'", unit: 's', value: () => 0, format: () => '0' },
  ],
  formula: (_s, p) => trainLines(p.beta),
  info: {
    goals: ['ch37.s.goal.relative', 'ch37.s.goal.c'],
    observe: ['ch37.s.obs.train', 'ch37.s.obs.ground', 'ch37.s.obs.dt', 'ch37.s.obs.diagram'],
    equations: ["\\Delta t = \\gamma\\,\\frac{v L_0}{c^2} \\quad (\\Delta t' = 0)"],
    assumptions: ['ch37.assume.units', 'ch37.s.assume.train'],
  },
};

// ------------------------------------------------------------------ formula panel

/** β as its slider prints it (R1); every β slider of the chapter has step 0.01. */
const bTex = (beta: number) => slider(betaParam(0, 0, 1), beta);

const gammaLine = (beta: number) => `\\gamma = \\frac{1}{\\sqrt{1 - \\beta^2}} = \\frac{1}{\\sqrt{1 - (${bTex(beta)})^2}} = ${tn(gamma(beta))}`;

/** Light clocks: γ, the two tick periods and the ticks counted so far. */
export function clockLines(time: number, beta: number): string[] {
  const P0 = restPeriod(D_CLOCK);
  const P = movingPeriod(D_CLOCK, beta);
  return [
    gammaLine(beta),
    `\\Delta t_0 = \\frac{2D}{c} = \\frac{2 \\times ${D_CLOCK}\\ \\mathrm{ls}}{c} = ${tn(P0)}${u('s')}`,
    `\\Delta t = \\gamma\\,\\Delta t_0 = ${tn(gamma(beta))} \\times ${tn(P0)} = ${tn(P)}${u('s')}`,
    `n_0 = \\lfloor t/\\Delta t_0 \\rfloor = \\lfloor ${tn(time)}/${tn(P0)} \\rfloor = ${ticks(time, P0)}`,
    `n = \\lfloor t/\\Delta t \\rfloor = \\lfloor ${tn(time)}/${tn(P)} \\rfloor = ${ticks(time, P)}`,
  ];
}

/** Rods: γ and the contracted length. */
export function rodLines(beta: number): string[] {
  return [
    gammaLine(beta),
    `L = \\frac{L_0}{\\gamma} = \\frac{${tn(L_ROD)}\\ \\mathrm{ls}}{${tn(gamma(beta))}} = ${tn(contracted(L_ROD, beta))}${u('ls')}`,
  ];
}

/** Spacetime diagram: the Lorentz transformation of the events read off in each mode (rounded as in the table). */
export function diagramLines(p: PD): string[] {
  const b = p.beta;
  const g = gamma(b);
  const G = tn(g);
  const B = bTex(b);
  const lines = [gammaLine(b)];
  if (p.mode === 'contract') {
    const r = rodEvents(ROD_L0, ROD_FRONT, ROD_TP, b);
    lines.push(`L = x_\\mathrm{F} - x_\\mathrm{R} = ${n2(r.F.x)} - ${paren(n2(r.R.x))} = ${n2(r.F.x - r.R.x)}${u('ls')}`);
    lines.push(`L_0 = x'_\\mathrm{F} - x'_\\mathrm{R'} = ${n2(r.F.xp)} - ${paren(n2(r.Rp.xp))} = ${n2(r.F.xp - r.Rp.xp)}${u('ls')}`);
    lines.push(`L = \\frac{L_0}{\\gamma} = \\frac{${n2(ROD_L0)}}{${G}} = ${n2(ROD_L0 / g)}${u('ls')}`);
    return lines;
  }
  if (p.mode === 'order') {
    const E = fromS(p.B[0], p.B[1], b);
    const x = n2(p.B[0]);
    const t = n2(p.B[1]);
    lines.push(`x'_\\mathrm{B} = \\gamma(x - \\beta\\,ct) = ${G}\\,(${x} - ${B} \\times ${paren(t)}) = ${n2(E.xp)}${u('ls')}`);
    // Over two lines: one line would shrink to about 0.68 × in the docked panel.
    lines.push(`\\Delta t' = \\gamma(\\Delta t - v\\Delta x/c^2)`, `= ${G}\\,(${t} - ${B} \\times ${paren(x)}) = ${n2(E.tp)}${u('s')}`);
    lines.push(`(c\\Delta t)^2 - \\Delta x^2 = (${t})^2 - (${x})^2 = ${n2(interval(p.B[0], p.B[1]))}${u('ls^2')}`);
    return lines;
  }
  const { E } = dilationEvents(TAU_TICK, b);
  const tau = n2(TAU_TICK);
  lines.push(`x_\\mathrm{E} = \\gamma(x' + \\beta\\,ct') = ${G}\\,(0 + ${B} \\times ${tau}) = ${n2(E.x)}${u('ls')}`);
  lines.push(`ct_\\mathrm{E} = \\gamma(ct' + \\beta x') = ${G}\\,(${tau} + ${B} \\times 0) = ${n2(E.t)}${u('ls')}`);
  lines.push(`\\Delta t = \\gamma\\,\\Delta t_0 = ${G} \\times ${tau} = ${n2(g * TAU_TICK)}${u('s')}`);
  return lines;
}

/** Train flash: arrival times at the rear and the front in S, their difference, and Δt' = 0 in S'. */
export function trainLines(beta: number): string[] {
  const g = gamma(beta);
  const ev = trainEvents(L_TRAIN, beta);
  const half = L_TRAIN / (2 * g);
  const B = bTex(beta);
  return [
    gammaLine(beta),
    `\\frac{L}{2} = \\frac{L_0}{2\\gamma} = \\frac{${tn(L_TRAIN)}\\ \\mathrm{ls}}{2 \\times ${tn(g)}} = ${tn(half)}${u('ls')}`,
    `t_\\mathrm{R} = \\frac{L/2}{c + v} = \\frac{${tn(half)}\\ \\mathrm{ls}}{(1 + ${B})\\,c} = ${tn(ev.rearS)}${u('s')}`,
    `t_\\mathrm{F} = \\frac{L/2}{c - v} = \\frac{${tn(half)}\\ \\mathrm{ls}}{(1 - ${B})\\,c} = ${tn(ev.frontS)}${u('s')}`,
    // The difference directly (R5): t_F − t_R = γβL₀/c, not a subtraction of two rounded times.
    `\\Delta t = t_\\mathrm{F} - t_\\mathrm{R} = \\gamma\\beta\\,\\frac{L_0}{c} = (${tn(g)})(${B})(${tn(L_TRAIN)}\\ \\mathrm{s}) = ${tn(ev.frontS - ev.rearS)}${u('s')}`,
    `t'_\\mathrm{R} = t'_\\mathrm{F} = \\frac{L_0}{2c} = ${tn(ev.rearSp)}${u('s')},\\quad \\Delta t' = 0`,
  ];
}
