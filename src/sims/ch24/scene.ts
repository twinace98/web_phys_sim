// Ch 24 scene: equipotential lines (or a potential map) over the charges of Ch 22, and the
// work done by the field on a test charge dragged along any path.
import { RESIDUE, paren, tn, u } from '../../core/tex';
import type { ParamSchema, Scene, Vec2 } from '../../core/types';
import { BOX, KQ, POINT_POOL, V, clearOf, layoutParam, pointCoords, pointSources, pointWorld, presetParam, presetTag } from '../field/charges';
import { FieldLayers, palette } from '../field/layers';
import { chargeGlyph, freeSpot, Memo, SURFACE, srcKey, type Tray } from '../field/render';
import { slotHandles } from '../field/slots';
import { extendPath, segDist, thinPath, workAlong } from './physics';

/** Relative difference below which V and V_A are the same potential (the same point): ΔV = 0. */
const SAME = 1e-6;
/** Closest approach of A, the path and the test charge to a source charge [m]. */
const CLEAR = 0.05;

type P = { preset: string; view: string; lines: boolean; dV: number; Q: number[] };
type S = {
  t: number;
  tray?: Tray;
  A: Vec2;
  path: number[];
  /** Sources the path was last kept clear of (srcKey), and a count of the reroutes. */
  clear?: string;
  rev?: number;
};

const START: Vec2 = { x: -0.15, y: 0.58 };
/** Path length that triggers thinning of its older half. */
const MAX_PTS = 6000;

const params: ParamSchema<P> = {
  preset: presetParam('ch24'),
  view: {
    kind: 'select',
    label: 'ch24.p.view',
    desc: 'ch24.d.view',
    group: 'main',
    live: true,
    default: 'eq',
    options: [
      { value: 'eq', label: 'ch24.view.eq' },
      { value: 'heat', label: 'ch24.view.heat' },
      { value: 'both', label: 'ch24.view.both' },
    ],
  },
  lines: { kind: 'toggle', label: 'ch24.p.lines', desc: 'ch24.d.lines', group: 'advanced', live: true, default: true },
  dV: { kind: 'number', label: 'ch24.p.dV', desc: 'ch24.d.dV', group: 'advanced', live: true, control: 'slider', min: 1, max: 10, step: 1, default: 5, unit: 'V' },
  Q: layoutParam('ch24'),
};

const layers = new FieldLayers('point');
const work = new Memo<{ w: number; scale: number }>();

/**
 * A source charge dropped on A, on the path or on the test charge (QA 2026-11-24: V_A = 8.99×10⁶ V,
 * W 26 times −q0 ΔV) pushes them aside: A moves to CLEAR from every source and the path is redrawn
 * through its old points, going round each source at CLEAR (extendPath), so W = −q0 ΔV holds for
 * any arrangement. Runs once per arrangement of the sources, before anything reads the state.
 */
export function keepClear(s: S, p: P): void {
  const src = pointSources(p);
  const key = srcKey(src);
  if (s.clear === key) return;
  s.clear = key;
  const close = (x: number, y: number) => src.some((c) => Math.hypot(x - c.x, y - c.y) < 0.95 * CLEAR);
  let hit = close(s.A.x, s.A.y);
  for (let k = 2; !hit && k < s.path.length; k += 2) hit = src.some((c) => segDist(s.path[k - 2], s.path[k - 1], s.path[k], s.path[k + 1], c.x, c.y) < 0.95 * CLEAR);
  if (!hit) return;
  const old = s.path;
  const [ax, ay] = clearOf(src, s.A.x, s.A.y, CLEAR);
  s.A = { x: ax, y: ay };
  s.path = [ax, ay];
  for (let k = 2; k < old.length; k += 2) extendPath(src, s.path, old[k], old[k + 1], CLEAR);
  thinPath(src, s.path, MAX_PTS, CLEAR);
  s.rev = (s.rev ?? 0) + 1;
}

const end = (s: S): Vec2 => ({ x: s.path[s.path.length - 2], y: s.path[s.path.length - 1] });
/**
 * W = q0 ∫ E·ds [nJ] along the path and its run scale: the largest |V − V_A| [V] over the path's
 * points, so the largest |q0 ΔV| [nJ] the drag reached (policy D, R7a).
 */
const W = (s: S, p: P) => {
  keepClear(s, p);
  const src = pointSources(p);
  return work.get(`${srcKey(src)}|${s.rev ?? 0}|${s.path.length}|${s.path[0]},${s.path[1]}|${s.path[s.path.length - 2]},${s.path[s.path.length - 1]}`, () => {
    const a = V(src, s.A.x, s.A.y);
    let scale = 0;
    for (let k = 0; k < s.path.length; k += 2) scale = Math.max(scale, Math.abs(V(src, s.path[k], s.path[k + 1]) - a));
    return { w: workAlong(src, s.path, 1), scale };
  });
};

/** V [V] at the test charge, ΔV = V − V_A [V] (the readouts). */
export const Vq = (s: S, p: P) => {
  keepClear(s, p);
  return V(pointSources(p), end(s).x, end(s).y);
};
export const VA = (s: S, p: P) => {
  keepClear(s, p);
  return V(pointSources(p), s.A.x, s.A.y);
};

/**
 * ΔV = V − V_A [V], with the test charge back on A (the same point, or a closed path) as an exact 0:
 * a difference below 10⁻⁶ of the potentials, or below 10⁻³ of the run scale (the largest |V − V_A|
 * along the path), is a residue (R7a).
 */
export const deltaV = (s: S, p: P) => {
  const v = Vq(s, p);
  const a = VA(s, p);
  const d = v - a;
  return Math.abs(d) < SAME * Math.max(Math.abs(v), Math.abs(a)) || Math.abs(d) < RESIDUE * W(s, p).scale ? 0 : d;
};

/**
 * W [nJ] as the readouts and Σ use it. Back at A's potential (ΔV printed 0, a closed path) the
 * integral leaves a residue of the numerical integration (1.69×10⁻⁵ nJ, QA 2026-11-24): below 10⁻³
 * of the run scale it is an exact 0 like ΔV (R7a). The factor 2 keeps W = 0 next to ΔV = 0 when ΔV
 * itself sits just under its threshold.
 */
export const workNJ = (s: S, p: P) => {
  const { w, scale } = W(s, p);
  return deltaV(s, p) === 0 && Math.abs(w) < 2 * RESIDUE * scale ? 0 : w;
};
/** ΔV and W as the readouts and the Σ panel print them: an exact 0 as "0", else 3 figures (R7a, R8). */
const fmtZero = (v: number) => (v === 0 ? '0' : undefined);
const tz = (v: number) => (v === 0 ? '0' : tn(v));

/**
 * Σ panel: V at the test charge and at A, ΔV, the path integral W and −q0 ΔV. The subtraction is
 * shown with the 3-figure potentials when they give the 3-figure ΔV; for two nearly equal
 * potentials (R5) ΔV is computed directly from the unrounded values and the terms are not printed.
 */
export function formulaLines(s: S, p: P): string[] {
  const v = Vq(s, p);
  const a = VA(s, p);
  const dV = deltaV(s, p);
  const r3 = (x: number) => Number(x.toPrecision(3));
  const shown = Math.abs(r3(v) - r3(a) - dV) <= 0.01 * Math.abs(dV);
  return [
    `V = \\sum_i k\\,\\frac{q_i}{r_i} = ${tn(v)}${u('V')},\\quad V_A = ${tn(a)}${u('V')}`,
    dV === 0
      ? `\\Delta V = V - V_A = 0`
      : `\\Delta V = V - V_A = ${shown ? `${tn(v)} - ${paren(tn(a))} = ` : ''}${tn(dV)}${u('V')}`,
    `W = q_0\\!\\int_A^B \\vec E\\cdot d\\vec s = ${tz(workNJ(s, p))}${u('nJ')}`,
    `-q_0\\,\\Delta V = -(1\\ \\mathrm{nC})(${tz(dV)}${u('V')}) = ${tz(-dV)}${u('nJ')}`,
  ];
}

export const potential: Scene<P, S> = {
  id: 'potential',
  title: 'ch24.scene',
  params,
  world: pointWorld,
  init: () => ({ t: 0, A: { ...START }, path: [START.x, START.y] }),

  draw: (g, s, p, ui) => {
    keepClear(s, p);
    const src = pointSources(p);
    if (p.view !== 'eq') layers.heatmap(g, src, 25 / KQ, 600 / KQ);
    if (p.lines) layers.lines(g, src, '#c4c4c4', 1);
    // Heat map alone still shows the V = 0 level as a dashed line.
    layers.equipotentials(g, src, KQ, p.dV, p.view === 'heat' ? 0 : undefined);

    if (s.path.length >= 4) {
      const pts: Vec2[] = [];
      for (let k = 0; k < s.path.length; k += 2) pts.push({ x: s.path[k], y: s.path[k + 1] });
      g.polyline(pts, { color: SURFACE, width: 2.5, dash: [6, 4] });
    }
    for (const c of src) chargeGlyph(g, c, c.s);

    // Labels A (above left) and q0 (below right) move to a free diagonal when a charge is closer.
    const q = end(s);
    const charges: Vec2[] = src.map((c) => ({ x: c.x, y: c.y }));
    const a = freeSpot(g, s.A, [...charges, q], 2, 11, 12);
    const q0 = freeSpot(g, q, [...charges, s.A, a.at], 1, 11, 11);
    g.circle(s.A, 5, { fill: '#1a1a1a' });
    g.text(a.at, 'A', { size: 13, color: '#1a1a1a', align: a.align, baseline: 'middle' });
    g.circle(q, 7, { fill: '#ffffff', color: '#1a1a1a', width: 1.5 });
    g.text(q, '+', { size: 12, color: '#1a1a1a', align: 'center', baseline: 'middle', dy: 0.5 });
    g.text(q0.at, '*q*_{0}', { size: 13, color: '#1a1a1a', align: q0.align, baseline: 'middle' });
    palette(g, s, POINT_POOL, pointCoords(p), chargeGlyph, ui);
  },

  handles: [
    {
      // Test charge: dragging extends the path.
      radiusPx: 14,
      pos: (s) => end(s),
      onDrag: (_ctx, s, w) => {
        const src = pointSources(_ctx.params);
        const x = Math.min(BOX[2], Math.max(BOX[0], w.x));
        const y = Math.min(BOX[3], Math.max(BOX[1], w.y));
        const q = end(s);
        if (Math.hypot(x - q.x, y - q.y) < 0.002) return;
        // Fast drags may jump across a charge: the path goes round it, never through it.
        extendPath(src, s.path, x, y, 0.05);
        // A long path keeps following the pointer: its older points are thinned.
        thinPath(src, s.path, MAX_PTS, 0.05);
      },
    },
    {
      // Start point A: moving it starts a new path.
      radiusPx: 12,
      pos: (s) => s.A,
      onDrag: (ctx, s, w) => {
        const [x, y] = clearOf(pointSources(ctx.params), Math.min(BOX[2], Math.max(BOX[0], w.x)), Math.min(BOX[3], Math.max(BOX[1], w.y)));
        s.A = { x, y };
        s.path = [x, y];
      },
    },
    ...slotHandles<P, S>({ pool: POINT_POOL, coords: pointCoords, tag: presetTag, key: 'Q', box: BOX, tray: (s) => s.tray }),
  ],

  readouts: [
    { label: 'V', unit: 'V', value: (s, p) => Vq(s, p) },
    { label: '\\Delta V', unit: 'V', value: (s, p) => deltaV(s, p), format: fmtZero },
    { label: 'W', unit: 'nJ', value: (s, p) => workNJ(s, p), format: fmtZero },
  ],

  formula: (s, p) => formulaLines(s, p),

  info: {
    goals: ['ch24.goal.V', 'ch24.goal.perp'],
    observe: ['ch24.obs.along', 'ch24.obs.cross', 'ch24.obs.path', 'ch24.obs.spacing', 'ch24.obs.heat', 'ch24.obs.edit'],
    equations: ['V = \\sum_i k\\,\\frac{q_i}{r_i}', 'W = q_0\\!\\int_A^B \\vec E\\cdot d\\vec s = -q_0\\,\\Delta V', '\\vec E = -\\nabla V, \\quad E \\approx \\frac{\\Delta V}{\\Delta s}'],
    assumptions: ['ch24.as.sym', 'ch24.as.units', 'ch24.as.ref', 'ch24.as.levels', 'ch24.as.num', 'ch24.as.clear'],
  },
};
