// Gravitational field of draggable point masses (real G, Earth masses, 10⁵ km): one mass by
// default, more from the tray (M1 … M4, a new mass takes the lowest free number), each with its
// own mass slider. Field as grid arrows and/or field lines, equipotentials (dashed, equal ΔΦ),
// every point where g = 0 (×) with the equipotential through it (thick), and a draggable test
// mass with its field vectors. Reuses the 2D field engine and the charge tray of Ch 22/24.
import type { Handle, ParamSchema, Params, Scene, SceneCtx, UiState, Vec2 } from '../../../core/types';
import type { Draw } from '../../../draw/draw';
import { theme } from '../../../draw/theme';
import { clearOf } from '../../field/charges';
import { FieldLayers } from '../../field/layers';
import { Memo, drawPxLines, drawTray, freeSpot, gridContours, inRect, layoutTray, linesPx, scalarGrid, srcKey, texNum, viewRect, vpKey, type PxLines, type Tray } from '../../field/render';
import { PARK, Pool, slotHandles, type Placed } from '../../field/slots';
import { G, L, M_EARTH, MOON, PHI_UNIT, gField, gParts, nullPoint, nullPoints, phi, phiStep, sources, type Mass, type NullPt } from './physics';

/** Most masses on the stage. */
export const N_MAX = 4;
const KEYS = ['M1', 'M2', 'M3', 'M4'] as const;
type MKey = (typeof KEYS)[number];
type P = { M1: number; M2: number; M3: number; M4: number; view: string; eq: boolean; X: number[]; T: number[] };
type S = { t: number; tray?: Tray };
/** A mass on the stage and its number (M1 … M4 = slot 1 … 4). */
export type Body = Mass & { n: number };

const ACC = '#009E73';
const EQ = '#E69F00';
const BODY = '#5c5c5c';
const INK = '#1a1a1a';
/** Draggable area [L]. */
const BOX: [number, number, number, number] = [-2.85, -1.8, 2.85, 1.8];
/** Closest approach of two masses, and of the test mass to a mass [L]. */
const MIN_SEP = 0.3;
const PROBE_GAP = 0.15;
/** Field lines on the heaviest mass; the others get lines in proportion (at least 1). */
const LINES_MAX = 24;

/** Slots of one kind; the tray chip is always the lowest-numbered free slot. */
const POOL = new Pool([-1], [N_MAX]);
/** Default layout: M1 alone at the centre. */
const START: Placed[] = [[0, 0, 0]];
const TAG = 0;

/** Slot coordinates [x1, y1, x2, y2, …]; a parked (absent) mass has x = PARK. */
export const coords = (p: { X: number[] }): number[] => POOL.coords(p.X, TAG, START);
/** Is mass M(i+1) on the stage? */
export const present = (p: { X: number[] }, i: number): boolean => coords(p)[2 * i] < PARK / 2;

const massParam = (i: number, def: number) =>
  ({
    kind: 'number',
    label: `gravfield.p.${KEYS[i]}`,
    desc: `gravfield.d.${KEYS[i]}`,
    group: 'main',
    live: true,
    control: 'slider',
    log: true,
    sig: 3,
    min: 0.01,
    max: 10,
    default: def,
    unit: 'M⊕',
    // Shown only while that mass is on the stage.
    visibleIf: (p: Params) => present(p as P, i),
  }) as const;

const params: ParamSchema<P> = {
  M1: massParam(0, 1),
  M2: massParam(1, MOON),
  M3: massParam(2, 0.5),
  M4: massParam(3, 0.25),
  view: {
    kind: 'select',
    label: 'gravfield.p.view',
    desc: 'gravfield.d.view',
    group: 'advanced',
    live: true,
    default: 'vectors',
    options: [
      { value: 'vectors', label: 'gravfield.view.vectors' },
      { value: 'lines', label: 'gravfield.view.lines' },
      { value: 'both', label: 'gravfield.view.both' },
    ],
  },
  eq: { kind: 'toggle', label: 'gravfield.p.eq', desc: 'gravfield.d.eq', group: 'advanced', live: true, default: true },
  X: { kind: 'array', label: 'gravfield.p.X', group: 'hidden', live: true, default: [TAG, ...POOL.fromPreset(START)], min: -99, max: 99 },
  T: { kind: 'array', label: 'gravfield.p.T', group: 'hidden', live: true, default: [1.25, 0.6], min: -3, max: 3 },
};

/** Masses on the stage, in slot order. */
export const masses = (p: P): Body[] => POOL.sources(coords(p)).map((c) => ({ x: c.x, y: c.y, m: p[KEYS[c.i] as MKey], n: c.i + 1 }));

/** Test mass position, kept clear of the masses. */
export const probe = (p: P): Vec2 => {
  const [x, y] = clearOf(sources(masses(p)), p.T[0], p.T[1], PROBE_GAP);
  return { x, y };
};

const clampBox = (v: number, i: 0 | 1) => Math.round(Math.min(BOX[i + 2], Math.max(BOX[i], v)) * 1000) / 1000;

/** Disc radius [px]: grows with the cube root of the mass (not to scale). */
const bodyR = (m: number) => Math.min(18, Math.max(7, 6 + 6 * Math.cbrt(m)));

// ------------------------------------------------------------------ g = 0 points

const nullMemo = new Memo<NullPt[]>();
/** All g = 0 points of the masses, memoised on the layout. */
export const nulls = (ms: readonly Mass[]): NullPt[] => nullMemo.get(srcKey(ms.map((b) => ({ x: b.x, y: b.y, s: b.m }))), () => nullPoints(ms));

// ------------------------------------------------------------------ probe arrows

/** g_i (if several masses) and g at the probe as world vectors; the largest is 90 px. */
function probeArrows(g: Draw, p: P): { parts: Vec2[]; net: Vec2 } {
  const ms = masses(p);
  const at = probe(p);
  const parts = gParts(ms, at.x, at.y);
  const net = gField(ms, at.x, at.y);
  const big = Math.max(Math.hypot(net[0], net[1]), ...parts.map((v) => Math.hypot(v[0], v[1])), 1e-30);
  const k = g.px(90) / big;
  const w = (v: number[]): Vec2 => ({ x: v[0] * k, y: v[1] * k });
  return { parts: ms.length > 1 ? parts.map(w) : [], net: w(net) };
}

/** Grid arrows keep clear of the probe arrows and their labels. */
function avoidList(g: Draw, p: P): { x: number; y: number; s: number }[] {
  const at = probe(p);
  const { parts, net } = probeArrows(g, p);
  const out = [{ ...at, s: 0 }];
  for (const v of [...parts, net]) {
    const n = Math.ceil(Math.hypot(v.x, v.y) / g.px(10));
    for (let i = 1; i <= n; i++) out.push({ x: at.x + (v.x * i) / n, y: at.y + (v.y * i) / n, s: 0 });
    const l = Math.hypot(v.x, v.y) || 1;
    out.push({ x: at.x + v.x + (v.x / l) * g.px(14), y: at.y + v.y + (v.y / l) * g.px(14), s: 0 });
  }
  return out;
}

// ------------------------------------------------------------------ equipotentials

const layers = new FieldLayers('point', 1);
const eqMemo = new Memo<{ lines: PxLines; crit: PxLines | null }>();

/**
 * Number of equipotential levels Φ = −k ΔΦ (k = 1 … K). Near mass i the depth in steps is
 * a_i/r + B_i (a_i = G M_i/(ΔΦ L), B_i from the other masses), so its rings are r = a_i/(k − B_i),
 * spaced a_i/(k − B_i)²: K stops where that falls under 7 px. At least one level below every
 * g = 0 saddle, so the thick line there sits among the dashed ones.
 */
function levelCount(g: Draw, ms: readonly Mass[], dPhi: number, critDepth: number): number {
  let K = 3;
  for (const b of ms) {
    const a = (PHI_UNIT * b.m) / dPhi;
    let B = 0;
    for (const o of ms) if (o !== b) B += (PHI_UNIT * o.m) / dPhi / Math.max(Math.hypot(o.x - b.x, o.y - b.y), 1e-9);
    K = Math.max(K, Math.floor(B + Math.sqrt(a / g.px(1) / 7)));
  }
  return Math.min(60, Math.max(K, Math.ceil(critDepth) + 1));
}

/** Dashed: Φ = −k ΔΦ. Thick: the equipotential through each g = 0 saddle (crosses itself there). */
function equipotentials(g: Draw, ms: readonly Mass[], nul: readonly NullPt[]): void {
  const dPhi = phiStep(ms);
  const crit = nul.filter((q) => q.kind === 'saddle').map((q) => phi(ms, q.x, q.y) / dPhi);
  const K = levelCount(g, ms, dPhi, Math.max(0, ...crit.map((c) => -c)));
  const key = `${vpKey(g)}|${srcKey(sources(ms))}|${K}`;
  const E = eqMemo.get(key, () => {
    // Φ in units of ΔΦ, capped below the deepest level drawn.
    const rMin = g.px(2);
    const gr = scalarGrid(
      g,
      (x, y) => {
        let v = 0;
        for (const b of ms) v -= b.m / Math.max(Math.hypot(x - b.x, y - b.y), rMin);
        return (PHI_UNIT * v) / dPhi;
      },
      5,
      K + 1,
    );
    const levels: number[] = [];
    for (let k = 1; k <= K; k++) levels.push(-k);
    const lines = linesPx(g, gridContours(g, gr, levels).flatMap((c) => c.lines), null);
    const cl = crit.filter((c) => c > -K - 1);
    const critLines = cl.length ? linesPx(g, gridContours(g, gr, cl).flatMap((c) => c.lines), null) : null;
    return { lines, crit: critLines };
  });
  drawPxLines(g, E.lines, EQ, 1.1, [5, 4]);
  if (E.crit) drawPxLines(g, E.crit, EQ, 2.25);
}

// ------------------------------------------------------------------ glyphs

function nullMark(g: Draw, at: Vec2): void {
  const d = g.px(5);
  g.line({ x: at.x - d, y: at.y - d }, { x: at.x + d, y: at.y + d }, { color: INK, width: 2 });
  g.line({ x: at.x - d, y: at.y + d }, { x: at.x + d, y: at.y - d }, { color: INK, width: 2 });
}

/** 10⁵ km scale bar at the lower right of the draggable area. */
function scaleBar(g: Draw): void {
  const y = BOX[1] + 0.02;
  const x1 = BOX[2] - 0.05;
  const x0 = x1 - 1;
  const t = g.px(4);
  g.line({ x: x0, y }, { x: x1, y }, { color: INK, width: 1.5 });
  g.line({ x: x0, y: y - t }, { x: x0, y: y + t }, { color: INK, width: 1.5 });
  g.line({ x: x1, y: y - t }, { x: x1, y: y + t }, { color: INK, width: 1.5 });
  g.text({ x: (x0 + x1) / 2, y }, '10^{5} km', { size: 12, color: INK, align: 'center', baseline: 'bottom', dy: -5 });
}

/**
 * Legend at the top left: a dashed sample "ΔΦ = …" (equal steps) and, when there is a g = 0
 * point, a thick sample through a × "g = 0" (the equipotential through that point).
 */
function legend(g: Draw, ms: readonly Mass[], hasNull: boolean, eq: boolean): void {
  if (!eq && !hasNull) return;
  const k = theme.scale;
  const { ctx } = g;
  const rows: ('dash' | 'crit')[] = [];
  if (eq) rows.push('dash');
  if (hasNull) rows.push('crit');
  const step = phiStep(ms);
  // ΔΦ is a 1-2-5 number: one significant figure.
  const dTxt = step >= 1e5 ? `${+(step / 1e6).toPrecision(1)} MJ/kg` : `${+(step / 1e3).toPrecision(1)} kJ/kg`;
  const label = (r: 'dash' | 'crit') => (r === 'dash' ? `Δ*Φ* = ${dTxt}` : '*g* = 0');
  const x0 = 10 * k;
  const y0 = 10 * k;
  const rowH = 20 * k;
  const sample = 28 * k;
  ctx.save();
  ctx.font = `${13 * k}px sans-serif`;
  const tw = Math.max(...rows.map((r) => ctx.measureText(label(r).replace(/\*/g, '')).width));
  const w = 8 * k + sample + 8 * k + tw + 10 * k;
  const h = rows.length * rowH + 6 * k;
  ctx.fillStyle = 'rgba(255,255,255,0.9)';
  ctx.strokeStyle = '#d0d0d0';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.roundRect(x0, y0, w, h, 5 * k);
  ctx.fill();
  ctx.stroke();
  ctx.restore();
  const W = (x: number, y: number): Vec2 => {
    const [a, b] = g.vp.toWorld(x, y);
    return { x: a, y: b };
  };
  rows.forEach((r, i) => {
    const y = y0 + 3 * k + rowH * (i + 0.5);
    const a = x0 + 8 * k;
    const b = a + sample;
    if (r === 'dash') g.line(W(a, y), W(b, y), { color: EQ, width: 1.1, dash: [5, 4] });
    else {
      if (eq) g.line(W(a, y), W(b, y), { color: EQ, width: 2.25 });
      nullMark(g, W((a + b) / 2, y));
    }
    g.text(W(b + 8 * k, y), label(r), { size: 13, color: INK, align: 'left', baseline: 'middle' });
  });
}

/** Tray at the bottom left: one chip (the next free mass, named) and the bin. */
function tray(g: Draw, s: S, p: P, ui?: UiState): void {
  const tr = layoutTray(g, 1);
  s.tray = tr;
  const n = masses(p).length;
  const d = ui?.drag;
  // Hot (drop removes) only while a placed mass is held over it and another one stays.
  drawTray(g, tr, !!d && n > 1 && !inRect(tr.rect, d.w0) && inRect(tr.rect, d.w));
  const free = KEYS.findIndex((_k, i) => !present(p, i));
  const at = tr.chips[0];
  g.circle(at, 9, { fill: BODY, alpha: free >= 0 ? 1 : 0.22 });
  if (free >= 0) g.text(at, `*M*_{${free + 1}}`, { size: 12, color: INK, align: 'left', baseline: 'top', dx: 7, dy: 4 });
}

// ------------------------------------------------------------------ formula panel

const kg = (m: number) => texNum(m * M_EARTH, 3);
const meters = (r: number) => texNum(r * L, 3);
const n3 = (v: number) => texNum(v, 3);

export function formulaLines(p: P): string[] {
  const ms = masses(p);
  const at = probe(p);
  const parts = gParts(ms, at.x, at.y);
  const net = gField(ms, at.x, at.y);
  const out: string[] = [];
  const mag = (v: number[]) => Math.hypot(v[0], v[1]);
  if (ms.length <= 2) {
    ms.forEach((b, i) => {
      const r = Math.hypot(at.x - b.x, at.y - b.y);
      out.push(`g_${b.n} = \\frac{GM_${b.n}}{r_${b.n}^2} = \\frac{(${texNum(G, 4, 0)})(${kg(b.m)})}{(${meters(r)})^2} = ${n3(mag(parts[i]))}\\ \\mathrm{m/s^2}`);
    });
  } else {
    // Three or four masses: the values of g_i = GM_i/r_i², two per line.
    const vals = ms.map((b, i) => `g_${b.n} = ${n3(mag(parts[i]))}`);
    for (let k = 0; k < vals.length; k += 2) out.push(`${k ? '' : '\\frac{GM_i}{r_i^2}:\\ '}${vals.slice(k, k + 2).join(',\\ ')}\\ \\mathrm{m/s^2}`);
  }
  const few = ms.length <= 2;
  const vec = `(${n3(net[0])},\\ ${n3(net[1])})\\ \\mathrm{m/s^2}`;
  out.push(ms.length === 1 ? `\\vec g = ${vec}` : few ? `\\vec g = ${ms.map((b) => `\\vec g_${b.n}`).join(' + ')} = ${vec}` : `\\vec g = \\sum_i \\vec g_i = ${vec}`);
  const terms = ms.map((b) => (G * b.m * M_EARTH) / (Math.hypot(at.x - b.x, at.y - b.y) * L) / 1e6);
  const sym = few ? `-${ms.map((b) => `\\frac{GM_${b.n}}{r_${b.n}}`).join(' - ')}` : '-\\sum_i \\frac{GM_i}{r_i}';
  const sum = phi(ms, at.x, at.y) / 1e6;
  const mid = ms.length > 1 ? `${terms.map((v, i) => (i ? `- ${n3(v)}` : `-${n3(v)}`)).join(' ')} = ` : '';
  out.push(`\\Phi = ${sym} = ${mid}${n3(sum)}\\ \\mathrm{MJ/kg}`);
  if (ms.length === 2) {
    const [a, b] = ms;
    const nul = nullPoint(a, b);
    out.push(`g = 0:\\ \\frac{r_${a.n}}{r_${b.n}} = \\sqrt{\\frac{M_${a.n}}{M_${b.n}}} = ${n3(Math.sqrt(a.m / b.m))} \\;\\Rightarrow\\; r_${a.n} = ${meters(nul.r1)}\\ \\mathrm{m}`);
  }
  return out;
}

// ------------------------------------------------------------------ handles

/** Keep a dragged mass MIN_SEP from the others: push it out along the line from each. */
function keepApart(p: P, w: Vec2, i: number): Vec2 {
  let { x, y } = w;
  for (let pass = 0; pass < 3; pass++)
    for (const b of masses(p)) {
      if (b.n === i + 1) continue;
      const d = Math.hypot(x - b.x, y - b.y);
      if (d >= MIN_SEP) continue;
      const ux = d > 1e-9 ? (x - b.x) / d : 1;
      const uy = d > 1e-9 ? (y - b.y) / d : 0;
      x = clampBox(b.x + ux * MIN_SEP, 0);
      y = clampBox(b.y + uy * MIN_SEP, 1);
    }
  return { x, y };
}

/** A layout with no mass left is refused: the last mass stays (drop on the tray, double tap). */
function keepOne(ctx: SceneCtx<P>): SceneCtx<P> {
  return {
    get params() {
      return ctx.params;
    },
    set(key, value) {
      if (key === 'X' && masses({ ...ctx.params, X: value as number[] }).length === 0) return;
      ctx.set(key, value);
    },
  };
}

const massHandles: Handle<S, P>[] = slotHandles<P, S>({ pool: POOL, coords, tag: () => TAG, key: 'X', box: BOX, tray: (s) => s.tray, adjust: keepApart }).map((h) => ({
  ...h,
  onDrag: (ctx, s, w) => h.onDrag(keepOne(ctx), s, w),
  onDoubleTap: h.onDoubleTap && ((ctx, s) => h.onDoubleTap!(keepOne(ctx), s)),
}));

// ------------------------------------------------------------------ scene

export const gravfield: Scene<P, S> = {
  id: 'gravfield',
  title: 'gravfield.scene',
  params,
  world: () => ({ x: [-3, 3], y: [-1.95, 1.95], aspect: 'contain', padPx: 8 }),
  init: () => ({ t: 0 }),

  draw: (g, s, p, ui) => {
    const ms = masses(p);
    const src = sources(ms);
    const mMax = Math.max(...ms.map((b) => b.m));
    const [vx0, vy0, vx1, vy1] = viewRect(g);
    const allNull = nulls(ms);
    const shown = allNull.filter((q) => q.x > vx0 && q.x < vx1 && q.y > vy0 && q.y < vy1);
    if (p.eq) equipotentials(g, ms, allNull);
    if (p.view !== 'vectors') {
      // Line count ∝ mass: LINES_MAX on the heaviest.
      const scaled = ms.map((b) => ({ x: b.x, y: b.y, s: (-LINES_MAX * b.m) / mMax }));
      layers.lines(g, scaled);
    }
    if (p.view !== 'lines') layers.vectors(g, src, avoidList(g, p));

    const at = probe(p);
    for (const q of shown) nullMark(g, q);

    // Probe arrows: thin g_i, thick g.
    const { parts, net } = probeArrows(g, p);
    // A part gets its label only where its tip stands clear of the other tips (no stacked labels).
    const tips = [net, ...parts];
    parts.forEach((v, i) => {
      if (Math.hypot(v.x, v.y) < g.px(3)) return;
      const clear = Math.hypot(v.x, v.y) > g.px(24) && tips.every((u) => u === v || Math.hypot(u.x - v.x, u.y - v.y) > g.px(20));
      g.arrow(at, v, { color: ACC, width: 1.5, alpha: 0.65, label: clear ? `*g*_{${ms[i].n}}` : undefined });
    });
    g.arrow(at, net, { color: ACC, width: 3, label: '*g*' });

    for (const b of ms) g.circle(b, bodyR(b.m), { fill: BODY });
    g.circle(at, 6, { fill: '#ffffff', color: INK, width: 1.5 });

    // Labels: M_n beside each mass, m beside the probe, each on a free diagonal.
    const arrowPts: Vec2[] = [];
    for (const v of [...parts, net]) for (let i = 1; i <= 6; i++) arrowPts.push({ x: at.x + (v.x * i) / 6, y: at.y + (v.y * i) / 6 });
    const pts: Vec2[] = [...ms.map((b) => ({ x: b.x, y: b.y })), at, ...shown, ...arrowPts];
    ms.forEach((b, i) => {
      const r = bodyR(b.m);
      const sp = freeSpot(g, b, pts.filter((q) => q !== pts[i]), 2, r * 0.75 + 6, r * 0.75 + 6);
      g.text(sp.at, `*M*_{${b.n}}`, { size: 14, color: INK, align: sp.align, baseline: 'middle' });
    });
    const mp = freeSpot(g, at, [...pts.filter((q) => q !== at)], 0, 10, 10);
    g.text(mp.at, '*m*', { size: 14, color: INK, align: mp.align, baseline: 'middle' });
    scaleBar(g);
    legend(g, ms, shown.length > 0, p.eq);
    tray(g, s, p, ui);
  },

  handles: [
    {
      radiusPx: 14,
      pos: (_s, p) => probe(p),
      onDrag: (ctx, _s, w) => {
        const x = clampBox(w.x, 0);
        const y = clampBox(w.y, 1);
        if (x !== ctx.params.T[0] || y !== ctx.params.T[1]) ctx.set('T', [x, y]);
      },
    },
    ...massHandles,
  ],

  readouts: [
    {
      label: 'g',
      unit: 'm/s²',
      value: (_s, p) => {
        const at = probe(p);
        const [gx, gy] = gField(masses(p), at.x, at.y);
        return Math.hypot(gx, gy);
      },
    },
    { label: '\\Phi', unit: 'MJ/kg', value: (_s, p) => phi(masses(p), probe(p).x, probe(p).y) / 1e6 },
  ],

  formula: (_s, p) => formulaLines(p),

  info: {
    goals: ['gravfield.goal.field', 'gravfield.goal.phi'],
    observe: ['gravfield.obs.tray', 'gravfield.obs.drag', 'gravfield.obs.null', 'gravfield.obs.lines', 'gravfield.obs.eight', 'gravfield.obs.three', 'gravfield.obs.perp', 'gravfield.obs.single', 'gravfield.obs.analogy'],
    equations: [
      '\\vec g = \\frac{\\vec F}{m} = -\\sum_i \\frac{GM_i}{r_i^2}\\,\\hat r_i',
      '\\Phi = -\\sum_i \\frac{GM_i}{r_i}, \\quad \\vec g = -\\nabla \\Phi',
      'g = 0:\\ \\frac{r_1}{r_2} = \\sqrt{\\frac{M_1}{M_2}}',
    ],
    assumptions: ['gravfield.as.units', 'gravfield.as.point', 'gravfield.as.plane', 'gravfield.as.arrows', 'gravfield.as.eq', 'gravfield.as.null'],
  },
};
