// Ch 22 scene: draggable point charges, their field (grid arrows or field lines) and the
// Coulomb forces on a test charge.
import { CONST, RESIDUE, tn, tp, u } from '../../core/tex';
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

/** Closest distance from point c to the segment a→b. */
function segDist(a: Vec2, b: Vec2, c: Vec2): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const l2 = dx * dx + dy * dy;
  const u = l2 > 0 ? Math.max(0, Math.min(1, ((c.x - a.x) * dx + (c.y - a.y) * dy) / l2)) : 0;
  return Math.hypot(a.x + u * dx - c.x, a.y + u * dy - c.y);
}

/**
 * Force arrows on the test charge [world vectors]: the individual forces (if few) and the net, on
 * one linear scale (90 px for the largest). On a small stage a 90 px arrow toward a nearby charge
 * would end on top of it: the common scale shrinks (to 35 %, with the F label; to 15 % without)
 * until every arrow stays clear of every charge glyph it does not start inside.
 */
function forceArrows(g: Draw, p: P): { parts: Vec2[]; net: Vec2 } {
  const src = pointSources(p);
  const at = testPos(p);
  const { parts, net } = coulombForces(src, at.x, at.y, 1);
  const big = Math.max(Math.hypot(net[0], net[1]), ...parts.map((f) => Math.hypot(f[0], f[1])), 1e-30);
  const k0 = g.px(90) / big;
  const vecs = [net, ...(src.length <= MAX_PARTS ? parts : [])];
  // Glyph radius (10 or 13 px) plus a 4 px gap; charges the test charge already overlaps are skipped.
  const keep = src.map((c) => ({ c: { x: c.x, y: c.y }, r: g.px((Math.abs(c.s) > 1.5 ? 13 : 10) + 4) })).filter(({ c, r }) => Math.hypot(c.x - at.x, c.y - at.y) > r);
  // The net arrow also keeps its "F" label (about 16 px beyond the tip) off the charges.
  const ext = (f: number[], k: number, i: number) => {
    const m = Math.hypot(f[0], f[1]) * k || 1;
    const e = i === 0 ? g.px(16) / m : 0;
    return { x: at.x + f[0] * k * (1 + e), y: at.y + f[1] * k * (1 + e) };
  };
  const clear = (k: number, label: boolean) => vecs.every((f, i) => keep.every(({ c, r }) => segDist(at, label ? ext(f, k, i) : { x: at.x + f[0] * k, y: at.y + f[1] * k }, c) >= r));
  let k = k0;
  while (k > 0.35 * k0 && !clear(k, true)) k *= 0.9;
  // Right next to a charge there may be no room for the label: then the arrows alone stay clear,
  // down to 15 % (14 px, still an arrow with its head).
  if (!clear(k, true)) for (k = k0; k > 0.15 * k0 && !clear(k, false); ) k *= 0.9;
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

/** Index of the source nearest to the test charge: q₁ of the Σ line F₁ (−1 without sources). */
function nearest(p: P): number {
  const src = pointSources(p);
  const at = testPos(p);
  let i1 = -1;
  for (let i = 0; i < src.length; i++) if (i1 < 0 || Math.hypot(at.x - src[i].x, at.y - src[i].y) < Math.hypot(at.x - src[i1].x, at.y - src[i1].y)) i1 = i;
  return i1;
}

/** q₁ label spot beside the nearest charge, away from the other charges, the test charge and the arrows. */
function q1Spot(g: Draw, p: P): Spot | null {
  const i1 = nearest(p);
  if (i1 < 0) return null;
  const src = pointSources(p);
  const at = testPos(p);
  const c = src[i1];
  const blockers: Vec2[] = src.filter((_, i) => i !== i1).map((q) => ({ x: q.x, y: q.y }));
  blockers.push(at);
  const { parts, net } = forceArrows(g, p);
  for (const v of [...parts, net]) for (let i = 1; i <= 6; i++) blockers.push({ x: at.x + (v.x * i) / 6, y: at.y + (v.y * i) / 6 });
  const r = Math.abs(c.s) > 1.5 ? 15 : 13;
  return freeSpot(g, { x: c.x, y: c.y }, blockers, 2, r, r);
}

/** Points the grid arrows must keep clear of: along every force arrow, and the three labels. */
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
  const q1 = q1Spot(g, p);
  if (q1) out.push({ x: q1.at.x + (q1.align === 'left' ? 1 : -1) * g.px(8), y: q1.at.y, s: 0 });
  return out;
}

function drawForces(g: Draw, p: P): void {
  const at = testPos(p);
  const { parts, net } = forceArrows(g, p);
  for (const f of parts) g.arrow(at, f, { color: FORCE, width: 1.5, alpha: 0.6 });
  g.arrow(at, net, { color: FORCE, width: 3, label: '*F*' });
}

/** E [N/C] at the test charge (the readout). */
export const fieldAtTest = (p: P) => {
  const at = testPos(p);
  return E(pointSources(p), at.x, at.y);
};
/** Net force [nN] on q0 = +1 nC (the readout). */
export const forceOnTest = (p: P) => {
  const at = testPos(p);
  const { net } = coulombForces(pointSources(p), at.x, at.y, 1);
  return Math.hypot(net[0], net[1]) * 1e9;
};

/** Σ panel: Coulomb force of the nearest charge, the superposed E, and F = q0 E at the test charge. */
export function formulaLines(p: P): string[] {
  const src = pointSources(p);
  const sum = src.reduce((a, c) => a + c.s, 0);
  if (!p.test || !src.length) return [`k = \\frac{1}{4\\pi\\varepsilon_0} = ${CONST.k.tex}${u(CONST.k.unit)}`, `\\sum_i q_i = ${sum}${u('nC')}`];
  const at = testPos(p);
  const { parts } = coulombForces(src, at.x, at.y, 1);
  const dist = (i: number) => Math.hypot(at.x - src[i].x, at.y - src[i].y);
  // q_1: the source nearest to the test charge (labelled q₁ on the stage).
  const i1 = nearest(p);
  const F1 = Math.hypot(parts[i1][0], parts[i1][1]) * 1e9;
  const [ex, ey] = fieldAtTest(p);
  const Em = Math.hypot(ex, ey);
  // A component that vanishes by symmetry (below 10⁻³ of E) is an exact 0 (policy D, R7a).
  const comp = (c: number) => (Math.abs(c) < RESIDUE * Em ? '0' : tp(c));
  return [
    // Symbolic form, then the substituted numbers on their own row.
    `F_1 = k\\,\\frac{\\lvert q_1\\rvert q_0}{r_1^2}`,
    `= \\frac{(${CONST.k.tex})(${Math.abs(src[i1].s)})(1)\\times 10^{-18}}{(${tn(dist(i1))})^2}\\ \\mathrm{N} = ${tn(F1)}${u('nN')}`,
    `\\vec E = \\sum_i k\\,\\frac{q_i}{r_i^2}\\,\\hat r_i = (${comp(ex).replace(/^\((.*)\)$/, '$1')},\\ ${comp(ey).replace(/^\((.*)\)$/, '$1')})${u('N/C')}`,
    `E = \\sqrt{E_x^2 + E_y^2}`,
    `= \\sqrt{${comp(ex)}^2 + ${comp(ey)}^2} = ${tn(Em)}${u('N/C')}`,
    `F = q_0 E = (1\\ \\mathrm{nC})(${tn(Em)}\\ \\mathrm{N/C}) = ${tn(forceOnTest(p))}${u('nN')}`,
  ];
}

export const field: Scene<P, S> = {
  id: 'field',
  title: 'ch22.scene',
  params,
  world: pointWorld,
  init: () => ({ t: 0 }),

  draw: (g, s, p, ui) => {
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
      // q₁: the charge whose force F₁ the Σ panel writes out (the nearest one).
      const q1 = q1Spot(g, p);
      if (q1) g.text(q1.at, '*q*_{1}', { size: 13, color: '#1a1a1a', align: q1.align, baseline: 'middle' });
    }
    palette(g, s, POINT_POOL, pointCoords(p), chargeGlyph, ui);
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
        const [ex, ey] = fieldAtTest(p);
        return Math.hypot(ex, ey);
      },
    },
    { label: 'F', unit: 'nN', value: (_s, p) => (p.test ? forceOnTest(p) : NaN) },
  ],

  formula: (_s, p) => formulaLines(p),

  info: {
    goals: ['ch22.goal.field', 'ch22.goal.super'],
    observe: ['ch22.obs.drag', 'ch22.obs.tray', 'ch22.obs.dipole', 'ch22.obs.like', 'ch22.obs.plates', 'ch22.obs.test'],
    equations: ['\\vec F = k\\,\\frac{q\\,q_0}{r^2}\\,\\hat r, \\quad k = \\frac{1}{4\\pi\\varepsilon_0}', '\\vec E = \\frac{\\vec F}{q_0} = \\sum_i k\\,\\frac{q_i}{r_i^2}\\,\\hat r_i'],
    assumptions: ['ch22.as.sym', 'ch22.as.units', 'ch22.as.test', 'ch22.as.log', 'ch22.as.force', 'ch22.as.plates'],
  },
};
