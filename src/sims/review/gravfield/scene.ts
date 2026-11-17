// Gravitational field of one or two draggable point masses (Earth–Moon scale, real G): field
// as grid arrows and/or field lines, equipotentials, the point where g = 0, and a draggable
// test mass with its field vectors. Reuses the 2D field engine of Ch 22/24.
import type { Handle, ParamSchema, Scene, SceneCtx, Vec2 } from '../../../core/types';
import type { Draw } from '../../../draw/draw';
import { clearOf } from '../../field/charges';
import { FieldLayers } from '../../field/layers';
import { Memo, drawPxLines, freeSpot, gridContours, linesPx, scalarGrid, srcKey, texNum, vpKey, type PxLines } from '../../field/render';
import { D_MOON, G, L, MOON, M_EARTH, PHI_UNIT, gField, gParts, nullPoint, phi, phiStep, sources, type Mass } from './physics';

type P = { M1: number; M2: number; two: boolean; view: string; eq: boolean; X: number[]; T: number[] };

const ACC = '#009E73';
const EQ = '#E69F00';
const BODY = '#5c5c5c';
const INK = '#1a1a1a';
/** Draggable area [L]. */
const BOX: [number, number, number, number] = [-2.85, -1.8, 2.85, 1.8];
/** Closest approach of the two masses, and of the test mass to a mass [L]. */
const MIN_SEP = 0.3;
const PROBE_GAP = 0.15;
/** Field lines on the heavier mass; the lighter one gets lines in proportion (at least 1). */
const LINES_MAX = 24;

const massParam = (key: 'M1' | 'M2', def: number) =>
  ({
    kind: 'number',
    label: `gravfield.p.${key}`,
    desc: `gravfield.d.${key}`,
    group: 'main',
    live: true,
    control: 'slider',
    log: true,
    sig: 3,
    min: 0.01,
    max: 10,
    default: def,
    unit: 'M⊕',
  }) as const;

const params: ParamSchema<P> = {
  M1: massParam('M1', 1),
  M2: massParam('M2', MOON),
  two: { kind: 'toggle', label: 'gravfield.p.two', desc: 'gravfield.d.two', group: 'advanced', live: true, default: true },
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
  X: { kind: 'array', label: 'gravfield.p.X', group: 'hidden', live: true, default: [-D_MOON / 2, 0, D_MOON / 2, 0], min: -3, max: 3 },
  T: { kind: 'array', label: 'gravfield.p.T', group: 'hidden', live: true, default: [1.25, 0.6], min: -3, max: 3 },
};

export const masses = (p: P): Mass[] => {
  const out: Mass[] = [{ x: p.X[0], y: p.X[1], m: p.M1 }];
  if (p.two) out.push({ x: p.X[2], y: p.X[3], m: p.M2 });
  return out;
};

/** Test mass position, kept clear of the masses. */
export const probe = (p: P): Vec2 => {
  const [x, y] = clearOf(sources(masses(p)), p.T[0], p.T[1], PROBE_GAP);
  return { x, y };
};

const clampBox = (v: number, i: 0 | 1) => Math.round(Math.min(BOX[i + 2], Math.max(BOX[i], v)) * 1000) / 1000;

/** Disc radius [px]: grows with the cube root of the mass (not to scale). */
const bodyR = (m: number) => Math.min(18, Math.max(7, 6 + 6 * Math.cbrt(m)));

// ------------------------------------------------------------------ probe arrows

/** g_1, g_2 (if two masses) and g at the probe as world vectors; the largest is 90 px. */
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

/** Number of equipotential levels so that the rings near the heavier mass stay ≥ 7 px apart. */
function levelCount(g: Draw, ms: readonly Mass[], dPhi: number): number {
  const rPx = (PHI_UNIT * Math.max(...ms.map((b) => b.m))) / dPhi / g.px(1);
  return Math.min(30, Math.max(3, Math.floor(Math.sqrt(rPx / 7))));
}

function equipotentials(g: Draw, ms: readonly Mass[]): void {
  const dPhi = phiStep(ms);
  const K = levelCount(g, ms, dPhi);
  const nul = ms.length === 2 ? nullPoint(ms[0], ms[1]) : null;
  const crit = nul ? phi(ms, nul.x, nul.y) : NaN;
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
    const critLines = nul && crit / dPhi > -K - 1 ? linesPx(g, gridContours(g, gr, [crit / dPhi])[0].lines, null) : null;
    return { lines, crit: critLines };
  });
  drawPxLines(g, E.lines, EQ, 1.1, [5, 4]);
  if (E.crit) drawPxLines(g, E.crit, EQ, 2);
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
  ms.forEach((b, i) => {
    const r = Math.hypot(at.x - b.x, at.y - b.y);
    const gi = Math.hypot(parts[i][0], parts[i][1]);
    out.push(`g_${i + 1} = \\frac{GM_${i + 1}}{r_${i + 1}^2} = \\frac{(${texNum(G, 4, 0)})(${kg(b.m)})}{(${meters(r)})^2} = ${n3(gi)}\\ \\mathrm{m/s^2}`);
  });
  const vec = `(${n3(net[0])},\\ ${n3(net[1])})\\ \\mathrm{m/s^2}`;
  out.push(ms.length > 1 ? `\\vec g = \\vec g_1 + \\vec g_2 = ${vec}` : `\\vec g = ${vec}`);
  const terms = ms.map((b) => -(G * b.m * M_EARTH) / (Math.hypot(at.x - b.x, at.y - b.y) * L) / 1e6);
  const sym = ms.map((_b, i) => `\\frac{GM_${i + 1}}{r_${i + 1}}`).join(' - ');
  const sum = phi(ms, at.x, at.y) / 1e6;
  const mid = ms.length > 1 ? `${n3(terms[0])} - ${n3(-terms[1])} = ` : '';
  out.push(`\\Phi = -${sym} = ${mid}${n3(sum)}\\ \\mathrm{MJ/kg}`);
  if (ms.length > 1) {
    const nul = nullPoint(ms[0], ms[1]);
    out.push(`g = 0:\\ \\frac{r_1}{r_2} = \\sqrt{\\frac{M_1}{M_2}} = ${n3(Math.sqrt(ms[0].m / ms[1].m))} \\;\\Rightarrow\\; r_1 = ${meters(nul.r1)}\\ \\mathrm{m}`);
  }
  return out;
}

// ------------------------------------------------------------------ scene

export const gravfield: Scene<P, { t: number }> = {
  id: 'gravfield',
  title: 'gravfield.scene',
  params,
  world: () => ({ x: [-3, 3], y: [-1.95, 1.95], aspect: 'contain', padPx: 8 }),
  init: () => ({ t: 0 }),

  draw: (g, _s, p) => {
    const ms = masses(p);
    const src = sources(ms);
    const mMax = Math.max(...ms.map((b) => b.m));
    if (p.eq) equipotentials(g, ms);
    if (p.view !== 'vectors') {
      // Line count ∝ mass: LINES_MAX on the heavier mass.
      const scaled = ms.map((b) => ({ x: b.x, y: b.y, s: (-LINES_MAX * b.m) / mMax }));
      layers.lines(g, scaled);
    }
    if (p.view !== 'lines') layers.vectors(g, src, avoidList(g, p));

    const at = probe(p);
    const nul = ms.length === 2 ? nullPoint(ms[0], ms[1]) : null;
    if (nul) nullMark(g, nul);

    // Probe arrows: thin g_1, g_2, thick g.
    const { parts, net } = probeArrows(g, p);
    // A part gets its label only where its tip stands clear of the other tips (no stacked labels).
    const tips = [net, ...parts];
    parts.forEach((v, i) => {
      if (Math.hypot(v.x, v.y) < g.px(3)) return;
      const clear = Math.hypot(v.x, v.y) > g.px(24) && tips.every((u) => u === v || Math.hypot(u.x - v.x, u.y - v.y) > g.px(20));
      g.arrow(at, v, { color: ACC, width: 1.5, alpha: 0.65, label: clear ? `*g*_{${i + 1}}` : undefined });
    });
    g.arrow(at, net, { color: ACC, width: 3, label: '*g*' });

    for (const b of ms) g.circle(b, bodyR(b.m), { fill: BODY });
    g.circle(at, 6, { fill: '#ffffff', color: INK, width: 1.5 });

    // Labels: M_i beside each mass, m beside the probe, g = 0 beside the null point, each on a free diagonal.
    const arrowPts: Vec2[] = [];
    for (const v of [...parts, net]) for (let i = 1; i <= 6; i++) arrowPts.push({ x: at.x + (v.x * i) / 6, y: at.y + (v.y * i) / 6 });
    const pts: Vec2[] = [...ms.map((b) => ({ x: b.x, y: b.y })), at, ...(nul ? [nul] : []), ...arrowPts];
    ms.forEach((b, i) => {
      const r = bodyR(b.m);
      const sp = freeSpot(g, b, pts.filter((q) => q !== pts[i]), 2, r * 0.75 + 6, r * 0.75 + 6);
      g.text(sp.at, `*M*_{${i + 1}}`, { size: 14, color: INK, align: sp.align, baseline: 'middle' });
    });
    const mp = freeSpot(g, at, [...pts.filter((q) => q !== at)], 0, 10, 10);
    g.text(mp.at, '*m*', { size: 14, color: INK, align: mp.align, baseline: 'middle' });
    if (nul) {
      const sp = freeSpot(g, nul, pts.filter((q) => q !== nul), 3, 9, 11);
      g.text(sp.at, '*g* = 0', { size: 13, color: INK, align: sp.align, baseline: 'middle' });
    }
    scaleBar(g);
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
    ...([0, 1] as const).map(
      (i): Handle<{ t: number }, P> => ({
      radiusPx: 16,
      when: (p: P) => i === 0 || p.two,
      pos: (_s, p) => ({ x: p.X[2 * i], y: p.X[2 * i + 1] }),
      onDrag: (ctx: SceneCtx<P>, _s, w) => {
        const X = ctx.params.X;
        let x = clampBox(w.x, 0);
        let y = clampBox(w.y, 1);
        if (ctx.params.two) {
          // Keep the two masses apart: push the dragged one out along the line joining them.
          const ox = X[2 - 2 * i];
          const oy = X[3 - 2 * i];
          const d = Math.hypot(x - ox, y - oy);
          if (d < MIN_SEP) {
            const ux = d > 1e-9 ? (x - ox) / d : 1;
            const uy = d > 1e-9 ? (y - oy) / d : 0;
            x = clampBox(ox + ux * MIN_SEP, 0);
            y = clampBox(oy + uy * MIN_SEP, 1);
          }
        }
        const next = [...X];
        next[2 * i] = x;
        next[2 * i + 1] = y;
        if (next.some((v, k) => v !== X[k])) ctx.set('X', next);
      },
    })),
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
    observe: ['gravfield.obs.drag', 'gravfield.obs.null', 'gravfield.obs.eight', 'gravfield.obs.perp', 'gravfield.obs.single', 'gravfield.obs.analogy'],
    equations: [
      '\\vec g = \\frac{\\vec F}{m} = -\\sum_i \\frac{GM_i}{r_i^2}\\,\\hat r_i',
      '\\Phi = -\\sum_i \\frac{GM_i}{r_i}, \\quad \\vec g = -\\nabla \\Phi',
      'g = 0:\\ \\frac{r_1}{r_2} = \\sqrt{\\frac{M_1}{M_2}}',
    ],
    assumptions: ['gravfield.as.units', 'gravfield.as.point', 'gravfield.as.plane', 'gravfield.as.arrows', 'gravfield.as.eq'],
  },
};
