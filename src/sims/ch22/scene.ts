// Ch 22 scene: draggable point charges, their field (grid arrows or field lines) and the
// Coulomb forces on a test charge.
import type { ParamSchema, Scene, Vec2 } from '../../core/types';
import type { Draw } from '../../draw/draw';
import { BOX, E, POINT_POOL, layoutParam, pointCoords, pointSources, pointWorld, presetParam, presetTag, clearOf } from '../field/charges';
import { FieldLayers, palette } from '../field/layers';
import { chargeGlyph, freeSpot, type Spot, type Tray } from '../field/render';
import { slotHandles } from '../field/slots';
import { coulombForces } from './physics';

type P = { preset: string; view: string; test: boolean; Q: number[]; T: number[] };
type S = { t: number; tray?: Tray };

const FORCE = '#CC79A7';
/** Individual forces are drawn up to this many charges; beyond it only the net force. */
const MAX_PARTS = 6;

const params: ParamSchema<P> = {
  preset: presetParam('ch22'),
  view: {
    kind: 'select',
    label: 'ch22.p.view',
    desc: 'ch22.d.view',
    group: 'main',
    live: true,
    default: 'vectors',
    options: [
      { value: 'vectors', label: 'ch22.view.vectors' },
      { value: 'lines', label: 'ch22.view.lines' },
      { value: 'both', label: 'ch22.view.both' },
    ],
  },
  test: { kind: 'toggle', label: 'ch22.p.test', desc: 'ch22.d.test', group: 'advanced', live: true, default: true },
  Q: layoutParam('ch22'),
  T: { kind: 'array', label: 'ch22.p.T', group: 'hidden', live: true, default: [0, 0.55], min: BOX[0], max: BOX[2] },
};

const layers = new FieldLayers('point');

/** Test charge position, kept clear of every source. */
const testPos = (p: P): Vec2 => {
  const [x, y] = clearOf(pointSources(p), p.T[0], p.T[1]);
  return { x, y };
};

/** Force arrows on the test charge [world vectors]: the individual forces (if few) and the net. */
function forceArrows(g: Draw, p: P): { parts: Vec2[]; net: Vec2 } {
  const src = pointSources(p);
  const at = testPos(p);
  const { parts, net } = coulombForces(src, at.x, at.y, 1);
  const big = Math.max(Math.hypot(net[0], net[1]), ...parts.map((f) => Math.hypot(f[0], f[1])), 1e-30);
  const k = g.px(90) / big;
  return { parts: src.length <= MAX_PARTS ? parts.map((f) => ({ x: f[0] * k, y: f[1] * k })) : [], net: { x: net[0] * k, y: net[1] * k } };
}

/** q0 label spot: below left of the test charge unless a charge or a force arrow is closer there. */
function q0Spot(g: Draw, p: P): Spot {
  const at = testPos(p);
  const blockers: Vec2[] = pointSources(p).map((c) => ({ x: c.x, y: c.y }));
  if (blockers.length) {
    const { parts, net } = forceArrows(g, p);
    for (const v of [...parts, net]) for (let i = 1; i <= 6; i++) blockers.push({ x: at.x + (v.x * i) / 6, y: at.y + (v.y * i) / 6 });
  }
  return freeSpot(g, at, blockers, 0, 12, 12);
}

/** Points the grid arrows must keep clear of: along every force arrow, and the two labels. */
function forceAvoid(g: Draw, p: P): { x: number; y: number; s: number }[] {
  const at = testPos(p);
  const { parts, net } = forceArrows(g, p);
  const out: { x: number; y: number; s: number }[] = [{ ...at, s: 0 }];
  for (const v of [...parts, net]) {
    const n = Math.ceil(Math.hypot(v.x, v.y) / g.px(10));
    for (let i = 1; i <= n; i++) out.push({ x: at.x + (v.x * i) / n, y: at.y + (v.y * i) / n, s: 0 });
  }
  // F label just beyond the net-force tip, q0 label beside the charge.
  const nl = Math.hypot(net.x, net.y) || 1;
  out.push({ x: at.x + net.x + (net.x / nl) * g.px(14), y: at.y + net.y + (net.y / nl) * g.px(14), s: 0 });
  const q0 = q0Spot(g, p);
  out.push({ x: q0.at.x + (q0.align === 'left' ? 1 : -1) * g.px(8), y: q0.at.y, s: 0 });
  return out;
}

function drawForces(g: Draw, p: P): void {
  const at = testPos(p);
  const { parts, net } = forceArrows(g, p);
  for (const f of parts) g.arrow(at, f, { color: FORCE, width: 1.5, alpha: 0.6 });
  g.arrow(at, net, { color: FORCE, width: 3, label: '*F*' });
}

export const field: Scene<P, S> = {
  id: 'field',
  title: 'ch22.scene',
  params,
  world: pointWorld,
  init: () => ({ t: 0 }),

  draw: (g, s, p) => {
    const src = pointSources(p);
    const at = testPos(p);
    // Grid arrows leave room for the test charge, its force arrows and their labels.
    const avoid = p.test ? (src.length ? forceAvoid(g, p) : [{ ...at, s: 0 }]) : [];
    if (p.view !== 'vectors') layers.lines(g, src);
    if (p.view !== 'lines') layers.vectors(g, src, avoid);
    if (p.test && src.length) drawForces(g, p);
    for (const c of src) chargeGlyph(g, c, c.s);
    if (p.test) {
      g.circle(at, 7, { fill: '#ffffff', color: '#1a1a1a', width: 1.5 });
      g.text(at, '+', { size: 12, color: '#1a1a1a', align: 'center', baseline: 'middle', dy: 0.5 });
      const q0 = q0Spot(g, p);
      g.text(q0.at, '*q*_{0}', { size: 13, color: '#1a1a1a', align: q0.align, baseline: 'middle' });
    }
    palette(g, s, POINT_POOL, pointCoords(p), chargeGlyph);
  },

  handles: [
    {
      radiusPx: 14,
      when: (p) => p.test,
      pos: (_s, p) => testPos(p),
      onDrag: (ctx, _s, w) => {
        const x = Math.round(Math.min(BOX[2], Math.max(BOX[0], w.x)) * 1000) / 1000;
        const y = Math.round(Math.min(BOX[3], Math.max(BOX[1], w.y)) * 1000) / 1000;
        if (x !== ctx.params.T[0] || y !== ctx.params.T[1]) ctx.set('T', [x, y]);
      },
    },
    ...slotHandles<P, S>({ pool: POINT_POOL, coords: pointCoords, tag: presetTag, key: 'Q', box: BOX, tray: (s) => s.tray }),
  ],

  readouts: [
    {
      label: 'E',
      unit: 'N/C',
      value: (_s, p) => {
        if (!p.test) return NaN;
        const at = testPos(p);
        const [ex, ey] = E(pointSources(p), at.x, at.y);
        return Math.hypot(ex, ey);
      },
    },
    {
      label: 'F',
      unit: 'nN',
      value: (_s, p) => {
        if (!p.test) return NaN;
        const at = testPos(p);
        const { net } = coulombForces(pointSources(p), at.x, at.y, 1);
        return Math.hypot(net[0], net[1]) * 1e9;
      },
    },
  ],

  info: {
    goals: ['ch22.goal.field', 'ch22.goal.super'],
    observe: ['ch22.obs.drag', 'ch22.obs.tray', 'ch22.obs.dipole', 'ch22.obs.like', 'ch22.obs.plates', 'ch22.obs.test'],
    equations: ['\\vec F = k\\,\\frac{q\\,q_0}{r^2}\\,\\hat r, \\quad k = \\frac{1}{4\\pi\\varepsilon_0}', '\\vec E = \\frac{\\vec F}{q_0} = \\sum_i k\\,\\frac{q_i}{r_i^2}\\,\\hat r_i'],
    assumptions: ['ch22.as.units', 'ch22.as.test', 'ch22.as.log', 'ch22.as.force', 'ch22.as.plates'],
  },
};
