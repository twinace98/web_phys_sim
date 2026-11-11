// Ch 34 scenes: thin lens and spherical / plane mirror. Drag the object; the three principal
// rays, the image and 1/p + 1/i = 1/f follow.
import { fmt } from '../../core/format';
import { t } from '../../core/i18n';
import type { ParamSchema, Scene, Vec2, WorldSpec } from '../../core/types';
import type { Draw } from '../../draw/draw';
import { measureRich } from '../../draw/text';
import { ROLE_COLOR, theme } from '../../draw/theme';
import { Obstacles, TICK, boxText } from '../inset/inset';
import { imageDistance, magnification, principalRays, type Ray } from './physics';

type P = { kind: string; f: number; p: number; h: number };
type Element = 'lens' | 'mirror';

/** Half-width of the drawn axis for short focal lengths [cm]. */
const XW0 = 60;
const OBJ = ROLE_COLOR.position;
const IMG = ROLE_COLOR.velocity;
const RAY_COLORS = ['#009E73', '#CC79A7', '#E69F00'];
const AXIS = '#9a9a9a';

/** Signed focal length for the selected element; Infinity for a plane mirror. */
export function focal(kind: string, f: number): number {
  if (kind === 'plane') return Infinity;
  return kind === 'diverging' || kind === 'convex' ? -f : f;
}

const fOf = (p: P) => focal(p.kind, p.f);

/**
 * Half-width of the drawn axis: 60 cm, or 3.2 f for a long converging focal length, so the real
 * image of the farthest object and a virtual image up to m ≈ 4 stay on the stage. It depends on
 * f only, never on p: dragging the object must not rescale the stage under the pointer.
 */
export function halfWidth(kind: string, f: number): number {
  const ff = focal(kind, f);
  return Number.isFinite(ff) && ff > 0 ? Math.max(XW0, 3.2 * ff) : XW0;
}

const narrow = () => typeof window !== 'undefined' && window.matchMedia('(max-width: 767px)').matches;

/**
 * Vertical exaggeration: on a narrow (portrait) stage the axis-long diagram would fill only a
 * thin strip, so heights are drawn 2.5 times larger there. Straight lines stay straight and
 * every ray still meets the image, so the construction is unchanged.
 */
export const stretchOf = (isNarrow: boolean) => (isNarrow ? 2.5 : 1);

/** Frame geometry: axis half-width xw and half-height yw [cm], vertical stretch k, unit u = xw / 60. */
interface Geo {
  xw: number;
  yw: number;
  k: number;
  u: number;
}

const geoOf = (p: P, k: number): Geo => {
  const xw = halfWidth(p.kind, p.f);
  return { xw, yw: xw / 3, k, u: xw / XW0 };
};

/** World box; on a narrow stage with room above the diagram for the formula panel. */
export function worldOf(p: P, isNarrow: boolean): WorldSpec {
  const { xw, yw } = geoOf(p, 1);
  const k = stretchOf(isNarrow);
  return isNarrow
    ? { x: [-xw, xw], y: [-k * yw - 0.1 * yw, k * yw + 2.5 * yw], aspect: 'contain', padPx: 12 }
    : { x: [-xw, xw], y: [-yw, yw], aspect: 'contain', padPx: 12 };
}

function params(el: Element): ParamSchema<P> {
  const opts =
    el === 'lens'
      ? [
          { value: 'converging', label: 'ch34.k.converging' },
          { value: 'diverging', label: 'ch34.k.diverging' },
        ]
      : [
          { value: 'concave', label: 'ch34.k.concave' },
          { value: 'convex', label: 'ch34.k.convex' },
          { value: 'plane', label: 'ch34.k.plane' },
        ];
  return {
    kind: { kind: 'select', label: `ch34.p.${el}`, desc: `ch34.d.${el}`, group: 'main', live: true, default: opts[0].value, options: opts },
    f: {
      kind: 'number',
      label: 'ch34.p.f',
      desc: 'ch34.d.f',
      group: 'main',
      live: true,
      control: 'slider',
      min: 5,
      max: 30,
      step: 1,
      default: 15,
      unit: 'cm',
      visibleIf: (p) => p.kind !== 'plane',
    },
    p: {
      kind: 'number',
      label: 'ch34.p.p',
      desc: 'ch34.d.p',
      group: 'advanced',
      live: true,
      control: 'slider',
      min: 2,
      max: 55,
      step: 0.5,
      default: 25,
      unit: 'cm',
    },
    h: { kind: 'number', label: 'ch34.p.h', desc: 'ch34.d.h', group: 'hidden', live: true, control: 'slider', min: 2, max: 8, step: 0.5, default: 5 },
  };
}

/** Significant figures of i and m, shared by the panel and the readouts so both print the same digits. */
const SIG = 3;
/** TeX number: the readout formatting (true minus → ASCII for TeX). */
const tex = (v: number) => fmt(v, SIG).replace('−', '-');
/** Inputs p and f (0.5 cm steps): one decimal; f = ∞ for the plane mirror. */
const tin = (v: number) => (Number.isFinite(v) ? v.toFixed(1) : '\\infty');

/**
 * Formula panel. At p = f there is no image (i → ∞): the readouts print "–", so the panel
 * writes 1/i = 0 and m = – instead of an ∞ that the readouts do not show.
 */
export function panel(p: P): string {
  const f = fOf(p);
  const i = imageDistance(p.p, f);
  const m = magnification(p.p, i);
  const inv = Number.isFinite(i) ? `\\dfrac{1}{${tex(i)}}` : '0';
  const row = `\\dfrac{1}{${tin(p.p)}} + ${inv} = \\dfrac{1}{${tin(f)}}`;
  const mm = Number.isFinite(m) ? tex(m) : '\\text{–}';
  return `\\begin{array}{l} \\dfrac{1}{p} + \\dfrac{1}{i} = \\dfrac{1}{f} \\\\[8pt] ${row} \\\\[8pt] m = -\\dfrac{i}{p} = ${mm} \\end{array}`;
}

/** Real-space x of a point on the outgoing ray, a distance d along the axis past the element. */
const outX = (el: Element, d: number) => (el === 'lens' ? d : -d);

/** Display point: heights drawn k times larger (k = 1 on a wide stage). */
const D = (G: Geo, x: number, y: number): Vec2 => ({ x, y: G.k * y });

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/**
 * Drawn half-height of the element: 0.65 yw, or for a mirror tall enough that every principal
 * ray reflects on it (a ray toward F from an object near F meets the vertex plane far from the
 * axis), up to just past the frame.
 */
export function apertureOf(el: Element, p: P): number {
  const { yw } = geoOf(p, 1);
  const ap = 0.65 * yw;
  if (el === 'lens') return ap;
  let y = 0;
  for (const r of principalRays(p.p, p.h, fOf(p))) y = Math.max(y, Math.abs(r.y));
  return Math.min(yw + 2, Math.max(ap, y + 1));
}

/** Drawn mirror profile x = −sag y²/2: reduced sag, at most 2.5 u cm at the rim; 0 for a plane mirror. */
const sagOf = (f: number, ap: number, u: number) => (Number.isFinite(f) ? Math.sign(f) * Math.min(Math.abs(0.4 / f), (5 * u) / (ap * ap)) : 0);

/**
 * Where a ray from the object tip meets the drawn mirror curve (fixed-point iteration; the sag
 * is small). The plane crossing r.y for a lens, a plane mirror or a ray beyond the mirror.
 */
export function mirrorHit(el: Element, p: P, r: Ray): Vec2 {
  const ap = apertureOf(el, p);
  const sag = el === 'mirror' ? sagOf(fOf(p), ap, geoOf(p, 1).u) : 0;
  if (sag === 0 || Math.abs(r.y) > ap) return { x: 0, y: r.y };
  let x = 0;
  for (let k = 0; k < 12; k++) {
    const y = p.h + r.sIn * (x + p.p);
    x = -sag * y * y * 0.5;
  }
  return { x, y: p.h + r.sIn * (x + p.p) };
}

/** Visible part of the stage in real-space cm (heights divided by k), inset by m px. */
function visible(g: Draw, G: Geo, m: number): { x0: number; x1: number; y0: number; y1: number } {
  const [x0, y1] = g.vp.toWorld(m, m);
  const [x1, y0] = g.vp.toWorld(g.vp.w - m, g.vp.h - m);
  return { x0, x1, y0: y0 / G.k, y1: y1 / G.k };
}

// ------------------------------------------------------------------ drawing

function drawElement(g: Draw, el: Element, p: P, G: Geo, obs: Obstacles): void {
  const f = fOf(p);
  const ap = apertureOf(el, p);
  const vis = visible(g, G, 0);
  // The element plane, extended so rays far from the axis still meet it (paraxial model).
  g.line(D(G, 0, vis.y0), D(G, 0, vis.y1), { color: '#c8c8c8', width: 1, dash: [3, 4] });
  obs.seg(D(G, 0, vis.y0), D(G, 0, vis.y1), 0.2);
  if (el === 'lens') {
    const conv = f > 0;
    const pts: Vec2[] = [];
    const bulge = 1.6 * G.u;
    for (let k = 0; k <= 24; k++) {
      const y = -ap + (2 * ap * k) / 24;
      const w = bulge * (1 - (y / ap) ** 2);
      pts.push(D(G, conv ? w : 0.5 * G.u + bulge - w, y));
    }
    for (let k = 24; k >= 0; k--) {
      const y = -ap + (2 * ap * k) / 24;
      const w = bulge * (1 - (y / ap) ** 2);
      pts.push(D(G, conv ? -w : -0.5 * G.u - bulge + w, y));
    }
    g.line(D(G, 0, -ap), D(G, 0, ap), { color: '#5c5c5c', width: 1 });
    g.polygon(pts, { fill: OBJ, fillAlpha: 0.1, color: '#5c5c5c', width: 1.25 });
    obs.seg(D(G, 0, -ap), D(G, 0, ap), 2);
  } else {
    // Curve drawn with a reduced sag (at most 2.5 u cm at the rim); rays reflect at the vertex plane (paraxial).
    const sag = sagOf(f, ap, G.u);
    const pts: Vec2[] = [];
    for (let k = 0; k <= 32; k++) {
      const y = -ap + (2 * ap * k) / 32;
      pts.push(D(G, -sag * y * y * 0.5, y));
    }
    g.polyline(pts, { color: '#1a1a1a', width: 3 });
    // Hatching on the back side, about every 10 px.
    const [, top] = g.vp.toPx(0, G.k * ap);
    const [, bot] = g.vp.toPx(0, -G.k * ap);
    const nh = Math.max(8, Math.round((bot - top) / (10 * theme.scale)));
    const hx = g.px(9);
    for (let k = 0; k <= nh; k++) {
      const y = -ap + (2 * ap * k) / nh;
      const q = D(G, -sag * y * y * 0.5, y);
      g.line(q, { x: q.x + hx, y: q.y - hx }, { color: '#5c5c5c', width: 1 });
    }
    for (let k = 1; k < pts.length; k++) obs.seg(pts[k - 1], pts[k], 2);
  }
}

/** Focal points (dots, under the rays) and their labels (after the rays, placed clear of them). */
function focalMarks(g: Draw, el: Element, p: P, G: Geo, labels: boolean, obs: Obstacles): void {
  const f = fOf(p);
  if (!Number.isFinite(f)) return;
  const sc = theme.scale;
  const mark = (x: number, s: string, dx: number, dy: number, align: 'left' | 'center' | 'right') => {
    if (Math.abs(x) > G.xw) return;
    const [px, py] = g.vp.toPx(x, 0);
    if (!labels) {
      g.circle({ x, y: 0 }, 3.5, { fill: '#1a1a1a' });
      obs.box(px - 5 * sc, py - 5 * sc, px + 5 * sc, py + 5 * sc, 2);
      return;
    }
    // The given offset, its mirror image across the axis or a slightly shifted one, whichever covers fewest rays.
    const w = measureRich(g.ctx, s, { size: 13 });
    const [plane] = g.vp.toPx(0, 0);
    const spots: (Spot & { d: number })[] = [];
    for (const oy of [dy, -dy, 1.7 * dy, -1.7 * dy])
      for (const ox of [dx, dx + 14, dx - 14]) spots.push({ x: px + ox * sc, y: py + oy * sc, align, d: Math.abs(ox - dx) + Math.abs(oy - dy) });
    const at = bestSpot(g, spots, w, obs, plane, 0);
    const l = at.align === 'right' ? at.x - w : at.align === 'center' ? at.x - w / 2 : at.x;
    obs.box(l - 3, at.y - 10 * sc, l + w + 3, at.y + 10 * sc, 2);
    const [wx, wy] = g.vp.toWorld(at.x, at.y);
    if (el === 'lens') g.text({ x: wx, y: wy }, s, { size: 13, color: TICK, align: at.align, baseline: 'middle' });
    else boxText(g, { x: wx, y: wy }, s, { size: 13, color: TICK, align: 'center' });
  };
  if (el === 'lens') {
    // Rays cross F1 from upper left to lower right and leave F2 toward lower right.
    mark(-Math.abs(f), '*F*_{1}', -7, 12, 'right');
    mark(Math.abs(f), '*F*_{2}', 7, -12, 'left');
  } else {
    // Concave: F and C in front (x < 0); convex: behind the mirror.
    mark(-f, '*F*', 0, 18, 'center');
    mark(-2 * f, '*C*', 0, 18, 'center');
  }
}

function drawRays(g: Draw, el: Element, p: P, i: number, G: Geo, obs: Obstacles): void {
  const f = fOf(p);
  const rays = principalRays(p.p, p.h, f);
  const far = 4 * G.xw;
  const img: Vec2 | null = Number.isFinite(i) ? { x: outX(el, i), y: magnification(p.p, i) * p.h } : null;
  rays.forEach((r: Ray, k) => {
    const col = RAY_COLORS[k];
    // A curved mirror reflects each ray where it meets the drawn curve, aimed at (or away from)
    // the paraxial image, so the rays still meet there. Lens and plane mirror: the vertex plane.
    const hit = mirrorHit(el, p, r);
    let slope = r.sOut;
    if (img && hit.x !== 0) slope = ((img.y - hit.y) / Math.abs(img.x - hit.x)) * (i > 0 ? 1 : -1);
    const a = D(G, -p.p, p.h);
    const h = D(G, hit.x, hit.y);
    const e = D(G, hit.x + outX(el, far), hit.y + slope * far);
    g.line(a, h, { color: col, width: 1.75 });
    g.line(h, e, { color: col, width: 1.75 });
    obs.seg(a, h);
    obs.seg(h, e);
    // Virtual image: extend the outgoing ray backwards to it.
    if (img && i < 0) {
      const v = D(G, img.x, img.y);
      g.line(h, v, { color: col, width: 1.25, dash: [5, 4], alpha: 0.8 });
      obs.seg(h, v);
    }
  });
}

/** Upright arrow from base to base + h (display units); dashed for a virtual image. */
function upright(g: Draw, base: Vec2, h: number, color: string, dashed: boolean): void {
  if (Math.abs(h) < 1e-6) return;
  if (dashed) {
    g.line(base, { x: base.x, y: base.y + h }, { color, width: 3, dash: [5, 4] });
    const hd = Math.sign(h) * Math.min(g.px(10), Math.abs(h));
    g.polygon(
      [
        { x: base.x, y: base.y + h },
        { x: base.x - g.px(5), y: base.y + h - hd },
        { x: base.x + g.px(5), y: base.y + h - hd },
      ],
      { color, width: 1.5 },
    );
  } else g.arrow(base, { x: 0, y: h }, { color, width: 3.5 });
}

/** Double chevron centred near canvas px (cx, cy), pointing along the unit px vector (dx, dy). */
function chevrons(g: Draw, cx: number, cy: number, dx: number, dy: number, color: string): void {
  const sc = theme.scale;
  for (const o of [-3, 3]) {
    const pts: Vec2[] = [];
    for (const [a, b] of [
      [-3, 5],
      [2, 0],
      [-3, -5],
    ]) {
      // a along the direction, b across it.
      const [wx, wy] = g.vp.toWorld(cx + ((a + o) * dx - b * dy) * sc, cy + ((a + o) * dy + b * dx) * sc);
      pts.push({ x: wx, y: wy });
    }
    g.polyline(pts, { color, width: 2 });
  }
}

type Spot = { x: number; y: number; align: 'left' | 'center' | 'right' };

/**
 * Best of a set of label spots (canvas px, text centred vertically on y): the one that covers the
 * least (weighted), then the nearest (d). A spot off the stage, or across the element plane
 * (px) from the side given (−1 front, +1 behind, 0 either), is ruled out.
 */
export function bestSpot(g: Draw, cands: (Spot & { d: number })[], w: number, obs: Obstacles, plane: number, side: number): Spot {
  const hh = 11 * theme.scale;
  let best: Spot = cands[0];
  let bestScore = Infinity;
  for (const c of cands) {
    const l = c.align === 'left' ? c.x - 4 : c.align === 'right' ? c.x - w - 4 : c.x - w / 2 - 4;
    const r = l + w + 8;
    let score = 10 * obs.cost(l, c.y - hh, r, c.y + hh) + c.d / 40;
    if (l < 2 || r > g.vp.w - 2 || c.y - hh < 2 || c.y + hh > g.vp.h - 2) score += 1000;
    if ((side < 0 && r > plane - 3) || (side > 0 && l < plane + 3)) score += 500;
    if (score < bestScore - 1e-9) {
      best = c;
      bestScore = score;
    }
  }
  return best;
}

/**
 * Where the image label goes (canvas px): a grid of spots beside the image arrow (base to tip,
 * display units), past its tip and across the axis from it, on the image's side of the element.
 */
function placeLabel(g: Draw, base: Vec2, tip: Vec2, w: number, obs: Obstacles): Spot {
  const sc = theme.scale;
  const [bx, by] = g.vp.toPx(base.x, base.y);
  const [, ty] = g.vp.toPx(tip.x, tip.y);
  const [plane] = g.vp.toPx(0, 0);
  const up = ty < by ? -1 : 1; // px direction from base to tip
  const my = (by + ty) / 2;
  const ys = [my, ty, ...[22, 46, 72, 100].map((d) => ty + up * d * sc), ...[22, 46, 72, 100].map((d) => by - up * d * sc)];
  const cands: (Spot & { d: number })[] = [];
  for (const y of ys)
    for (const dx of [0, 12, -12, 40, -40, 72, -72, 110, -110]) {
      const align = dx === 0 ? 'center' : dx > 0 ? 'left' : 'right';
      cands.push({ x: bx + dx * sc, y, align, d: Math.abs(dx) * sc + Math.abs(y - my) });
    }
  return bestSpot(g, cands, w, obs, plane, bx < plane ? -1 : 1);
}

/**
 * Image arrow and its label. An image beyond the stage (|i| or the image height too large) is
 * drawn at the stage edge with a double chevron pointing to where it lies.
 */
function drawImage(g: Draw, el: Element, p: P, i: number, G: Geo, obs: Obstacles): void {
  const m = magnification(p.p, i);
  const xi = outX(el, i);
  const hi = m * p.h;
  const sc = theme.scale;
  const vis = visible(g, G, 28 * sc);
  const xe = clamp(xi, vis.x0, vis.x1);
  const he = clamp(hi, vis.y0, vis.y1);
  const base = D(G, xe, 0);
  const tip = D(G, xe, he);
  upright(g, base, tip.y, IMG, i < 0);
  obs.seg(base, tip, 3);
  const [bx, by] = g.vp.toPx(base.x, base.y);
  const [, ty] = g.vp.toPx(tip.x, tip.y);
  if (xe !== xi) {
    const s = Math.sign(xi);
    const cy = (by + ty) / 2;
    chevrons(g, bx + s * 13 * sc, cy, s, 0, IMG);
    obs.box(bx + s * 13 * sc - 10 * sc, cy - 8 * sc, bx + s * 13 * sc + 10 * sc, cy + 8 * sc, 3);
  }
  if (he !== hi) {
    const s = ty < by ? -1 : 1;
    chevrons(g, bx, ty + s * 13 * sc, 0, s, IMG);
    obs.box(bx - 8 * sc, ty + s * 13 * sc - 10 * sc, bx + 8 * sc, ty + s * 13 * sc + 10 * sc, 3);
  }
  const label = `${t(i > 0 ? 'ch34.real' : 'ch34.virtual')} · ${t(hi > 0 ? 'ch34.upright' : 'ch34.inverted')}`;
  const w = measureRich(g.ctx, label, { size: 13 });
  const at = placeLabel(g, base, tip, w, obs);
  const [wx, wy] = g.vp.toWorld(at.x, at.y);
  boxText(g, { x: wx, y: wy }, label, { size: 13, color: IMG, align: at.align });
}

function makeScene(el: Element): Scene<P, { t: number }> {
  return {
    id: el,
    title: `ch34.scene.${el}`,
    params: params(el),
    world: (p) => worldOf(p, narrow()),
    init: () => ({ t: 0 }),

    draw: (g, _s, p) => {
      const G = geoOf(p, stretchOf(narrow()));
      const i = imageDistance(p.p, fOf(p));
      const obs = new Obstacles(g);
      // The formula panel at the top left of the stage.
      obs.box(0, 0, 232 * theme.scale, 168 * theme.scale, 1.5);
      const vis = visible(g, G, 0);
      g.line({ x: vis.x0, y: 0 }, { x: vis.x1, y: 0 }, { color: AXIS, width: 1 });
      obs.seg({ x: vis.x0, y: 0 }, { x: vis.x1, y: 0 }, 0.3);
      drawElement(g, el, p, G, obs);
      focalMarks(g, el, p, G, false, obs);
      drawRays(g, el, p, i, G, obs);
      focalMarks(g, el, p, G, true, obs);
      upright(g, D(G, -p.p, 0), G.k * p.h, OBJ, false);
      obs.seg(D(G, -p.p, 0), D(G, -p.p, p.h), 3);
      if (Number.isFinite(i)) drawImage(g, el, p, i, G, obs);
    },

    handles: [
      {
        pos: (_s, p) => ({ x: -p.p, y: stretchOf(narrow()) * p.h }),
        radiusPx: 16,
        onDrag: (ctx, _s, w) => {
          const pp = Math.round(Math.min(55, Math.max(2, -w.x)) * 2) / 2;
          const hh = Math.round(Math.min(8, Math.max(2, w.y / stretchOf(narrow()))) * 2) / 2;
          if (pp !== ctx.params.p) ctx.set('p', pp);
          if (hh !== ctx.params.h) ctx.set('h', hh);
        },
      },
    ],

    overlay: (_s, p) => panel(p),

    readouts: [
      { label: 'i', unit: 'cm', value: (_s, p) => imageDistance(p.p, fOf(p)), sig: SIG },
      { label: 'm', unit: '', value: (_s, p) => magnification(p.p, imageDistance(p.p, fOf(p))), sig: SIG },
    ],

    info:
      el === 'lens'
        ? {
            goals: ['ch34.l.goal.rays', 'ch34.l.goal.sign'],
            observe: ['ch34.l.obs.drag', 'ch34.l.obs.2f', 'ch34.l.obs.f', 'ch34.l.obs.inside', 'ch34.l.obs.div'],
            equations: ['\\frac{1}{p} + \\frac{1}{i} = \\frac{1}{f}', 'm = -\\frac{i}{p}'],
            assumptions: ['ch34.assume.thin', 'ch34.l.assume.sign'],
          }
        : {
            goals: ['ch34.m.goal.rays', 'ch34.m.goal.sign'],
            observe: ['ch34.m.obs.drag', 'ch34.m.obs.inside', 'ch34.m.obs.convex', 'ch34.m.obs.plane'],
            equations: ['\\frac{1}{p} + \\frac{1}{i} = \\frac{1}{f}, \\quad f = \\frac{r}{2}', 'm = -\\frac{i}{p}'],
            assumptions: ['ch34.assume.thin', 'ch34.m.assume.sign'],
          },
  };
}

export const lensScene = makeScene('lens');
export const mirrorScene = makeScene('mirror');
