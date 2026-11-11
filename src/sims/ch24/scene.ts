// Ch 24 scene: equipotential lines (or a potential map) over the charges of Ch 22, and the
// work done by the field on a test charge dragged along any path.
import type { ParamSchema, Scene, Vec2 } from '../../core/types';
import { BOX, KQ, POINT_POOL, V, clearOf, layoutParam, pointCoords, pointSources, pointWorld, presetParam, presetTag } from '../field/charges';
import { FieldLayers, palette } from '../field/layers';
import { chargeGlyph, freeSpot, Memo, SURFACE, srcKey, type Tray } from '../field/render';
import { slotHandles } from '../field/slots';
import { extendPath, workAlong } from './physics';

type P = { preset: string; view: string; lines: boolean; dV: number; Q: number[] };
type S = { t: number; tray?: Tray; A: Vec2; path: number[] };

const START: Vec2 = { x: -0.15, y: 0.58 };
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
const work = new Memo<number>();

const end = (s: S): Vec2 => ({ x: s.path[s.path.length - 2], y: s.path[s.path.length - 1] });
const W = (s: S, p: P) => work.get(`${srcKey(pointSources(p))}|${s.path.length}|${s.path[0]},${s.path[1]}`, () => workAlong(pointSources(p), s.path, 1));

export const potential: Scene<P, S> = {
  id: 'potential',
  title: 'ch24.scene',
  params,
  world: pointWorld,
  init: () => ({ t: 0, A: { ...START }, path: [START.x, START.y] }),

  draw: (g, s, p) => {
    const src = pointSources(p);
    if (p.view !== 'eq') layers.heatmap(g, src, 25 / KQ, 600 / KQ);
    if (p.lines) layers.lines(g, src, '#c4c4c4', 1);
    // Heat map alone still shows the V = 0 level as a dashed line.
    layers.equipotentials(g, src, KQ, p.dV, p.view === 'heat' ? 0 : 12);

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
    palette(g, s, POINT_POOL, pointCoords(p), chargeGlyph);
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
        extendPath(src, s.path, x, y, 0.05, MAX_PTS);
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
    { label: 'V', unit: 'V', value: (s, p) => V(pointSources(p), end(s).x, end(s).y) },
    { label: '\\Delta V', unit: 'V', value: (s, p) => V(pointSources(p), end(s).x, end(s).y) - V(pointSources(p), s.A.x, s.A.y) },
    { label: 'W', unit: 'nJ', value: (s, p) => W(s, p) },
  ],

  info: {
    goals: ['ch24.goal.V', 'ch24.goal.perp'],
    observe: ['ch24.obs.along', 'ch24.obs.cross', 'ch24.obs.path', 'ch24.obs.spacing', 'ch24.obs.heat', 'ch24.obs.edit'],
    equations: ['V = \\sum_i k\\,\\frac{q_i}{r_i}', 'W = q_0\\!\\int_A^B \\vec E\\cdot d\\vec s = -q_0\\,\\Delta V', '\\vec E = -\\nabla V, \\quad E \\approx \\frac{\\Delta V}{\\Delta s}'],
    assumptions: ['ch24.as.units', 'ch24.as.ref', 'ch24.as.levels', 'ch24.as.num'],
  },
};
