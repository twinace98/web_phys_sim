// Ch 34 scenes: thin lens and spherical / plane mirror. Drag the object; the three principal
// rays, the image and 1/p + 1/i = 1/f follow.
import { t } from '../../core/i18n';
import type { ParamSchema, Scene, Vec2 } from '../../core/types';
import type { Draw } from '../../draw/draw';
import { ROLE_COLOR } from '../../draw/theme';
import { TICK, boxText } from '../inset/inset';
import { imageDistance, magnification, principalRays, type Ray } from './physics';

type P = { kind: string; f: number; p: number; h: number };
type Element = 'lens' | 'mirror';

const XW = 60;
const YW = 20;
/** Drawn half-height of the lens or mirror. */
const AP = 13;
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
      control: 'select',
      choices: [10, 15, 20],
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

/** TeX number for the panel: one decimal, ∞ for an image at infinity or a plane mirror. */
const tn = (v: number) => (Number.isFinite(v) ? v.toFixed(1) : '\\infty');

function panel(p: P): string {
  const f = fOf(p);
  const i = imageDistance(p.p, f);
  const m = magnification(p.p, i);
  const row = `\\dfrac{1}{${tn(p.p)}} + \\dfrac{1}{${tn(i)}} = \\dfrac{1}{${tn(f)}}`;
  const mm = Number.isFinite(m) ? m.toFixed(2) : '\\infty';
  return `\\begin{array}{l} \\dfrac{1}{p} + \\dfrac{1}{i} = \\dfrac{1}{f} \\\\[8pt] ${row} \\\\[8pt] m = -\\dfrac{i}{p} = ${mm} \\end{array}`;
}

/** Real-space x of a point on the outgoing ray, a distance d along the axis past the element. */
const outX = (el: Element, d: number) => (el === 'lens' ? d : -d);

function drawElement(g: Draw, el: Element, p: P): void {
  const f = fOf(p);
  // The element plane, extended so rays far from the axis still meet it (paraxial model).
  g.line({ x: 0, y: -YW }, { x: 0, y: YW }, { color: '#c8c8c8', width: 1, dash: [3, 4] });
  g.line({ x: 0, y: -AP }, { x: 0, y: AP }, { color: '#5c5c5c', width: 1 });
  if (el === 'lens') {
    const conv = f > 0;
    const pts: Vec2[] = [];
    const bulge = 1.6;
    for (let k = 0; k <= 24; k++) {
      const y = -AP + (2 * AP * k) / 24;
      const w = bulge * (1 - (y / AP) ** 2);
      pts.push({ x: conv ? w : 0.5 + bulge - w, y });
    }
    for (let k = 24; k >= 0; k--) {
      const y = -AP + (2 * AP * k) / 24;
      const w = bulge * (1 - (y / AP) ** 2);
      pts.push({ x: conv ? -w : -0.5 - bulge + w, y });
    }
    g.polygon(pts, { fill: OBJ, fillAlpha: 0.1, color: '#5c5c5c', width: 1.25 });
  } else {
    // Curve drawn with a reduced sag; rays reflect at the vertex plane (paraxial).
    const sag = Number.isFinite(f) ? 0.4 / f : 0;
    const pts: Vec2[] = [];
    for (let k = 0; k <= 32; k++) {
      const y = -AP + (2 * AP * k) / 32;
      pts.push({ x: -sag * y * y * 0.5, y });
    }
    g.polyline(pts, { color: '#1a1a1a', width: 3 });
    // Hatching on the back side.
    for (let k = 0; k <= 13; k++) {
      const y = -AP + (2 * AP * k) / 13;
      const x = -sag * y * y * 0.5;
      g.line({ x, y }, { x: x + 1.2, y: y - 1.2 }, { color: '#5c5c5c', width: 1 });
    }
  }
}

/** Focal points (dots, under the rays) and their labels (after the rays, placed clear of them). */
function focalMarks(g: Draw, el: Element, p: P, labels: boolean): void {
  const f = fOf(p);
  if (!Number.isFinite(f)) return;
  const mark = (x: number, s: string, dx: number, dy: number, align: 'left' | 'center' | 'right') => {
    if (Math.abs(x) > XW) return;
    if (!labels) g.circle({ x, y: 0 }, 3.5, { fill: '#1a1a1a' });
    else if (el === 'lens') g.text({ x, y: 0 }, s, { size: 13, color: TICK, align, baseline: 'middle', dx, dy });
    else boxText(g, { x, y: 0 }, s, { size: 13, color: TICK, align: 'center', dy: 18 });
  };
  if (el === 'lens') {
    // Rays cross F1 from upper left to lower right and leave F2 toward lower right.
    mark(-Math.abs(f), '*F*_{1}', -7, 12, 'right');
    mark(Math.abs(f), '*F*_{2}', 7, -12, 'left');
  } else {
    // Concave: F and C in front (x < 0); convex: behind the mirror.
    mark(-f, '*F*', 0, 0, 'center');
    mark(-2 * f, '*C*', 0, 0, 'center');
  }
}

function drawRays(g: Draw, el: Element, p: P, i: number): void {
  const f = fOf(p);
  const rays = principalRays(p.p, p.h, f);
  const far = 2 * XW;
  const [ax, ay] = g.vp.toPx(-XW - 2, YW + 2);
  const [bx, by] = g.vp.toPx(XW + 2, -YW - 2);
  g.ctx.save();
  g.ctx.beginPath();
  g.ctx.rect(ax, ay, bx - ax, by - ay);
  g.ctx.clip();
  rays.forEach((r: Ray, k) => {
    const col = RAY_COLORS[k];
    g.line({ x: -p.p, y: p.h }, { x: 0, y: r.y }, { color: col, width: 1.75 });
    g.line({ x: 0, y: r.y }, { x: outX(el, far), y: r.y + r.sOut * far }, { color: col, width: 1.75 });
    // Virtual image: extend the outgoing ray backwards to it.
    if (Number.isFinite(i) && i < 0) g.line({ x: 0, y: r.y }, { x: outX(el, i), y: r.y + r.sOut * i }, { color: col, width: 1.25, dash: [5, 4], alpha: 0.8 });
  });
  g.ctx.restore();
}

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

function makeScene(el: Element): Scene<P, { t: number }> {
  return {
    id: el,
    title: `ch34.scene.${el}`,
    params: params(el),
    world: () => ({ x: [-XW, XW], y: [-YW, YW], aspect: 'contain', padPx: 12 }),
    init: () => ({ t: 0 }),

    draw: (g, _s, p) => {
      const f = fOf(p);
      const i = imageDistance(p.p, f);
      const m = magnification(p.p, i);
      g.line({ x: -XW, y: 0 }, { x: XW, y: 0 }, { color: AXIS, width: 1 });
      drawElement(g, el, p);
      focalMarks(g, el, p, false);
      drawRays(g, el, p, i);
      focalMarks(g, el, p, true);
      upright(g, { x: -p.p, y: 0 }, p.h, OBJ, false);
      if (Number.isFinite(i)) {
        const xi = outX(el, i);
        const hi = m * p.h;
        if (Math.abs(xi) <= XW + 2) {
          const [ax, ay] = g.vp.toPx(-XW - 2, YW + 2);
          const [bx, by] = g.vp.toPx(XW + 2, -YW - 2);
          g.ctx.save();
          g.ctx.beginPath();
          g.ctx.rect(ax, ay, bx - ax, by - ay);
          g.ctx.clip();
          upright(g, { x: xi, y: 0 }, hi, IMG, i < 0);
          g.ctx.restore();
          // Real/virtual and upright/inverted on the far side of the axis from the image.
          const label = `${t(i > 0 ? 'ch34.real' : 'ch34.virtual')} · ${t(hi > 0 ? 'ch34.upright' : 'ch34.inverted')}`;
          g.text({ x: xi, y: 0 }, label, { size: 13, color: IMG, align: 'center', dy: hi > 0 ? 36 : -28 });
        }
      }
    },

    handles: [
      {
        pos: (_s, p) => ({ x: -p.p, y: p.h }),
        radiusPx: 16,
        onDrag: (ctx, _s, w) => {
          const pp = Math.round(Math.min(55, Math.max(2, -w.x)) * 2) / 2;
          const hh = Math.round(Math.min(8, Math.max(2, w.y)) * 2) / 2;
          if (pp !== ctx.params.p) ctx.set('p', pp);
          if (hh !== ctx.params.h) ctx.set('h', hh);
        },
      },
    ],

    overlay: (_s, p) => panel(p),

    readouts: [
      { label: 'p', unit: 'cm', value: (_s, p) => p.p },
      { label: 'i', unit: 'cm', value: (_s, p) => imageDistance(p.p, fOf(p)) },
      { label: 'm', unit: '', value: (_s, p) => magnification(p.p, imageDistance(p.p, fOf(p))) },
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
