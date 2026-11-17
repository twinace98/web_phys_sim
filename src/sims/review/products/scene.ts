// Dot and cross products (target Ch 3): two vectors with draggable tips (a blue, b orange, as in
// Ch 3), the projection or the parallelogram, and the product as a function of the angle φ in a
// small plot beside the plane (under it on narrow screens), whose point can be dragged too.
import { fmt, fmtTick } from '../../../core/format';
import type { ParamSchema, Role, Scene, SceneCtx, SelectParam, Vec2, WorldSpec } from '../../../core/types';
import type { Draw } from '../../../draw/draw';
import { theme } from '../../../draw/theme';
import { LabelLayout } from '../../ch03/labels';
import { Inset, type Rect } from '../../inset/inset';
import { angleBetween, crossZ, dot, mag, placeTip, project, rotateTo, signedAngle, type V2 } from './physics';

const DEG = Math.PI / 180;
const GREY = '#5c5c5c';
const DASH = '#9a9a9a';
const GRID_COLOR = '#ececec';
const PLOT_FG = '#1a1a1a';

const narrow = () => typeof window !== 'undefined' && window.matchMedia('(max-width: 767px)').matches;

/**
 * Plane of half-width `half` around the origin (axes to `axis`), plot beside it (desktop) or
 * under it (narrow), in world units of the plane.
 */
interface Layout {
  lim: number;
  axis: number;
  half: number;
}

const DOT: Layout = { lim: 5, axis: 5.6, half: 6.1 };
/** Cross product: both vectors and their sum (the far corner of the parallelogram) stay in view. */
const CROSS: Layout = { lim: 4.5, axis: 9.6, half: 10.1 };

function plotRect(L: Layout): Rect {
  const h = L.half;
  return narrow() ? { x0: -0.72 * h, y0: -2.05 * h, x1: 0.92 * h, y1: -1.3 * h } : { x0: 1.42 * h, y0: -0.62 * h, x1: 2.85 * h, y1: 0.62 * h };
}

function world(L: Layout): WorldSpec {
  const h = L.half;
  return narrow() ? { x: [-h, h], y: [-2.38 * h, h], aspect: 'contain', padPx: 10 } : { x: [-h, 3.0 * h], y: [-h, h], aspect: 'contain', padPx: 12 };
}

const P = (v: V2, k = 1): Vec2 => ({ x: v[0] * k, y: v[1] * k });
const O: Vec2 = { x: 0, y: 0 };
const vecOf = (p: number[]): V2 => [p[0], p[1]];

/** Unit grid and the x, y axes (Ch 3 style), inside the plane. */
function drawPlane(g: Draw, L: Layout): void {
  const n = Math.floor(L.axis);
  for (let k = -n; k <= n; k++) {
    g.line({ x: k, y: -L.axis }, { x: k, y: L.axis }, { color: GRID_COLOR, width: 1 });
    g.line({ x: -L.axis, y: k }, { x: L.axis, y: k }, { color: GRID_COLOR, width: 1 });
  }
  const step = L.axis > 7 ? 4 : 2;
  for (const [e, nrm, name] of [
    [{ x: 1, y: 0 }, { x: 0, y: 1 }, '*x*'],
    [{ x: 0, y: 1 }, { x: 1, y: 0 }, '*y*'],
  ] as const) {
    g.arrow({ x: -e.x * L.axis, y: -e.y * L.axis }, { x: 2 * e.x * L.axis, y: 2 * e.y * L.axis }, { role: 'axis', width: 1.25 });
    g.text({ x: e.x * (L.axis + g.px(14)), y: e.y * (L.axis + g.px(14)) }, name, { size: 15, color: GREY, align: 'center', baseline: 'middle' });
    for (let k = -n; k <= n; k++) {
      if (k === 0) continue;
      const b = { x: e.x * k, y: e.y * k };
      g.line({ x: b.x - nrm.x * g.px(3), y: b.y - nrm.y * g.px(3) }, { x: b.x + nrm.x * g.px(3), y: b.y + nrm.y * g.px(3) }, { role: 'axis', width: 1 });
      if (k % step === 0) g.text({ x: b.x - nrm.x * g.px(13), y: b.y - nrm.y * g.px(13) }, fmtTick(k), { size: 10, color: DASH, align: 'center', baseline: 'middle' });
    }
  }
}

/** Tick labels of the axes as obstacles for the label layout. */
function tickObstacles(lay: LabelLayout, g: Draw, L: Layout): void {
  const n = Math.floor(L.axis);
  const step = L.axis > 7 ? 4 : 2;
  for (let k = -n; k <= n; k++) {
    if (k === 0 || k % step !== 0) continue;
    for (const p of [
      { x: k, y: -g.px(13) },
      { x: -g.px(13), y: k },
    ]) {
      const [qx, qy] = lay.px(p);
      lay.boxes.push(lay.box(fmtTick(k), qx, qy, 'center', 10));
    }
  }
  lay.seg({ x: -L.axis, y: 0 }, { x: L.axis, y: 0 });
  lay.seg({ x: 0, y: -L.axis }, { x: 0, y: L.axis });
}

/** The full line through the origin along u, clipped to the axis square. */
function lineThrough(u: V2, L: Layout): [Vec2, Vec2] | null {
  const m = mag(u);
  if (m < 1e-9) return null;
  const ux = u[0] / m;
  const uy = u[1] / m;
  const t = Math.min(Math.abs(ux) > 1e-9 ? L.axis / Math.abs(ux) : Infinity, Math.abs(uy) > 1e-9 ? L.axis / Math.abs(uy) : Infinity);
  return [
    { x: -ux * t, y: -uy * t },
    { x: ux * t, y: uy * t },
  ];
}

/** Small right-angle mark at `at` between directions u and w (unit, world), `s` px. */
function rightAngle(g: Draw, at: Vec2, u: Vec2, w: Vec2, s = 8): void {
  const d = g.px(s);
  const p1 = { x: at.x + u.x * d, y: at.y + u.y * d };
  const p2 = { x: p1.x + w.x * d, y: p1.y + w.y * d };
  const p3 = { x: at.x + w.x * d, y: at.y + w.y * d };
  g.polyline([p1, p2, p3], { color: DASH, width: 1 });
}

const unit = (v: Vec2): Vec2 => {
  const m = Math.hypot(v.x, v.y);
  return m > 1e-12 ? { x: v.x / m, y: v.y / m } : { x: 0, y: 0 };
};

/**
 * Label beside the segment p→q (preferred side first, then the other), drawn only at a spot
 * that clears every obstacle: a secondary label is left out rather than crowd the others.
 */
function placeIfClear(g: Draw, lay: LabelLayout, p: Vec2, q: Vec2, prefer: Vec2, text: string, col: string, size = 14): void {
  const [x0, y0] = lay.px(p);
  const [x1, y1] = lay.px(q);
  const len = Math.hypot(x1 - x0, y1 - y0);
  if (len < 1e-6) return;
  let nx = -(y1 - y0) / len;
  let ny = (x1 - x0) / len;
  if (nx * prefer.x - ny * prefer.y < 0) {
    nx = -nx;
    ny = -ny;
  }
  for (const side of [1, -1])
    for (const d of [10, 18, 28])
      for (const f of [0.5, 0.35, 0.65]) {
        const x = x0 + (x1 - x0) * f + side * nx * d * theme.scale;
        const y = y0 + (y1 - y0) * f + side * ny * d * theme.scale;
        const ox = side * nx;
        const align = ox > 0.35 ? 'left' : ox < -0.35 ? 'right' : 'center';
        const b = lay.box(text, x, y, align, size);
        if (lay.cost(b) === 0) {
          lay.boxes.push(b);
          g.screenText(x / theme.scale, y / theme.scale, text, { size, color: col, align, baseline: 'middle' });
          return;
        }
      }
}

/** Faint disc marking a draggable tip; under the arrow so it never hides the head. */
const halo = (g: Draw, at: Vec2, role: Role) => g.circle(at, 14, { fill: role, alpha: 0.13 });

/** Arc of the angle from a to b (signed), arrowhead at b's end when `head`; φ label on the bisector. */
function angleArc(g: Draw, lay: LabelLayout, a: V2, phi: number, label: string, head: boolean): void {
  const th = Math.atan2(a[1], a[0]);
  const r = 30;
  g.arc(O, r, phi >= 0 ? th : th + phi, phi >= 0 ? th + phi : th, { color: GREY, width: 1.25 });
  if (head && Math.abs(phi) > 12 * DEG) {
    // Short arrow tangent to the arc, ending where the arc meets b.
    const e = th + phi;
    const tip = { x: Math.cos(e) * g.px(r), y: Math.sin(e) * g.px(r) };
    const s = Math.sign(phi);
    const tan = { x: -Math.sin(e) * s, y: Math.cos(e) * s };
    const back = g.px(7);
    g.arrow({ x: tip.x - tan.x * back, y: tip.y - tan.y * back }, { x: tan.x * back, y: tan.y * back }, { color: GREY, width: 1.25 });
  }
  // On the bisector when there is room; else just outside the wedge, beside a or beside b; else
  // farther out along the bisector.
  const mid = th + phi / 2;
  const sg = phi >= 0 ? 1 : -1;
  const near = Math.abs(phi) < 35 * DEG ? [58, 72] : [46, 58];
  const spots: [number, number][] = [
    ...near.map((d): [number, number] => [mid, d]),
    [th - sg * 22 * DEG, 46],
    [th + phi + sg * 22 * DEG, 46],
    [th - sg * 22 * DEG, 60],
    [th + phi + sg * 22 * DEG, 60],
    ...[90, 110, 130].map((d): [number, number] => [mid, d]),
  ];
  const [ox, oy] = lay.px(O);
  lay.place(
    spots.map(([ang, d]) => {
      const c = Math.cos(ang);
      return { x: ox + c * d * theme.scale, y: oy - Math.sin(ang) * d * theme.scale, align: c > 0.35 ? ('left' as const) : c < -0.35 ? ('right' as const) : ('center' as const) };
    }),
    label,
    GREY,
    13,
  );
}

const dragParam: SelectParam = {
  kind: 'select',
  label: 'products.p.drag',
  desc: 'products.d.drag',
  group: 'main',
  live: true,
  default: 'smooth',
  options: [
    { value: 'smooth', label: 'products.drag.smooth' },
    { value: 'snap', label: 'products.drag.snap' },
  ],
};

/** Degrees with one decimal for TeX. */
const deg = (r: number) => (r / DEG).toFixed(1);
/** TeX number, 3 significant figures, ASCII minus. */
const tx = (v: number, sig = 3) => fmt(v, sig).replace('−', '-');
/** Component as stored (at most 2 decimals, trailing zeros dropped), in parentheses (products written as juxtaposition). */
const cpt = (v: number) => `(${Number((Math.abs(v) < 0.005 ? 0 : v).toFixed(2))})`;
/** Magnitude, 3 significant figures, in parentheses. */
const mg = (v: number) => `(${tx(v)})`;

/** Plot frame: φ axis, product axis with a zero line, the curve and the current point. */
function drawProductPlot(g: Draw, ins: Inset, f: (phi: number) => number, phiNow: number, yNow: number, xt: number[], yLabel: string): void {
  const [y0, y1] = ins.yr;
  const yt = [y0, 0, y1];
  ins.frame({ xTicks: xt, yTicks: yt, xFmt: (v) => `${fmtTick(v)}°`, yFmt: (v) => fmtTick(v), xLabel: '*φ*', yLabel });
  g.line(ins.P(ins.xr[0], 0), ins.P(ins.xr[1], 0), { color: DASH, width: 1, dash: [3, 4] });
  for (const x of xt) if (x !== ins.xr[0]) g.line(ins.P(x, y0), ins.P(x, y1), { color: GRID_COLOR, width: 1 });
  const pts: [number, number][] = [];
  const N = 180;
  for (let i = 0; i <= N; i++) {
    const x = ins.xr[0] + ((ins.xr[1] - ins.xr[0]) * i) / N;
    pts.push([x, f(x * DEG)]);
  }
  ins.curve(pts, { color: PLOT_FG, width: 2 });
  g.line(ins.P(phiNow / DEG, 0), ins.P(phiNow / DEG, yNow), { color: DASH, width: 1, dash: [3, 3] });
  ins.dot(phiNow / DEG, yNow, PLOT_FG, 5.5);
}

/** Symmetric y range: a "nice" bound at or above ab (at least 1). */
function niceBound(ab: number): number {
  const v = Math.max(ab, 1) * 1.05;
  const p = 10 ** Math.floor(Math.log10(v));
  for (const m of [1, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10]) if (m * p >= v) return m * p;
  return 10 * p;
}

// ------------------------------------------------------------------ dot product

type PD = { proj: string; drag: string; A: number[]; B: number[] };

const dotParams: ParamSchema<PD> = {
  proj: {
    kind: 'select',
    label: 'products.p.proj',
    desc: 'products.d.proj',
    group: 'main',
    live: true,
    default: 'b',
    options: [
      { value: 'b', label: 'products.proj.b' },
      { value: 'a', label: 'products.proj.a' },
    ],
  },
  drag: dragParam,
  A: { kind: 'array', label: 'products.p.A', desc: 'products.d.A', group: 'hidden', live: true, default: [4, 1], min: -DOT.lim, max: DOT.lim },
  B: { kind: 'array', label: 'products.p.B', desc: 'products.d.B', group: 'hidden', live: true, default: [1, 3], min: -DOT.lim, max: DOT.lim },
};

const dotInset = (g: Draw, p: PD) => {
  const a = vecOf(p.A);
  const b = vecOf(p.B);
  const yb = niceBound(mag(a) * mag(b));
  return new Inset(g, plotRect(DOT), [0, 180], [-yb, yb]);
};

function setTip<Q extends { drag: string; A: number[]; B: number[] }>(ctx: SceneCtx<Q>, key: 'A' | 'B', w: Vec2, lim: number): void {
  const next = placeTip([w.x, w.y], ctx.params.drag === 'snap', lim);
  const cur = ctx.params[key];
  if (next[0] !== cur[0] || next[1] !== cur[1]) ctx.set(key, next as Q['A']);
}

export const dotScene: Scene<PD, { t: number }> = {
  id: 'dot',
  title: 'products.scene.dot',
  params: dotParams,
  world: () => world(DOT),
  init: () => ({ t: 0 }),

  draw: (g, _s, p) => {
    const a = vecOf(p.A);
    const b = vecOf(p.B);
    const la = mag(a);
    const lb = mag(b);
    const phi = signedAngle(a, b);
    drawPlane(g, DOT);
    const lay = new LabelLayout(g);
    tickObstacles(lay, g, DOT);

    // Projection: the shadow of one vector on the (extended) line of the other.
    const onA = p.proj !== 'a';
    const base = onA ? a : b;
    const other = onA ? b : a;
    const role: Role = onA ? 'energyU' : 'position';
    const line = lineThrough(base, DOT);
    if (line && mag(other) > 1e-9) {
      g.line(line[0], line[1], { color: DASH, width: 1, dash: [6, 5] });
      lay.seg(line[0], line[1]);
      const foot = P(project(other, base));
      const tipO = P(other);
      g.line(tipO, foot, { color: DASH, width: 1, dash: [4, 4] });
      lay.seg(tipO, foot);
      const fl = Math.hypot(foot.x, foot.y);
      const hl = Math.hypot(tipO.x - foot.x, tipO.y - foot.y);
      if (fl > g.px(10) && hl > g.px(10)) rightAngle(g, foot, unit({ x: -foot.x, y: -foot.y }), unit({ x: tipO.x - foot.x, y: tipO.y - foot.y }));
      if (fl > 1e-6) {
        g.line(O, foot, { role, width: 8, alpha: 0.35 });
        lay.seg(O, foot);
      }
    }
    halo(g, P(a), 'position');
    halo(g, P(b), 'energyU');
    g.arrow(O, P(a), { role: 'position', width: 2.5 });
    g.arrow(O, P(b), { role: 'energyU', width: 2.5 });
    lay.seg(O, P(a));
    lay.seg(O, P(b));

    if (la > 1e-9 && lb > 1e-9) angleArc(g, lay, a, phi, `*φ* = ${fmt(Math.abs(phi) / DEG, 3)}°`, false);
    const D = [12, 20, 30, 42, 56];
    // Each vector's label on the side away from the other vector.
    const away = (v: V2, w: V2): Vec2 => {
      const n = { x: -v[1], y: v[0] };
      return crossZ(v, w) >= 0 ? { x: -n.x, y: -n.y } : n;
    };
    if (la > 1e-9) lay.beside(O, P(a), away(a, b), `*a* = ${fmt(la)}`, 'position', D);
    if (lb > 1e-9) lay.beside(O, P(b), away(b, a), `*b* = ${fmt(lb)}`, 'energyU', D);
    if (line && mag(other) > 1e-9) {
      const foot = P(project(other, base));
      if (Math.hypot(foot.x, foot.y) > g.px(14)) {
        // Shadow label on the side of the line away from the projected vector's tip.
        const t = P(other);
        lay.beside(O, foot, { x: foot.x - t.x, y: foot.y - t.y }, onA ? '*b* cos *φ*' : '*a* cos *φ*', role, [12, 20, 30], [0.5, 0.3, 0.7]);
      }
    }

    const ins = dotInset(g, p);
    drawProductPlot(g, ins, (x) => la * lb * Math.cos(x), Math.abs(phi), dot(a, b), [0, 90, 180], '*a*·*b*');
  },

  handles: [
    { pos: (_s, p) => P(vecOf(p.A)), radiusPx: 18, onDrag: (ctx, _s, w) => setTip(ctx, 'A', w, DOT.lim) },
    { pos: (_s, p) => P(vecOf(p.B)), radiusPx: 18, onDrag: (ctx, _s, w) => setTip(ctx, 'B', w, DOT.lim) },
    {
      // The plot point: dragging it along φ turns b about the origin (length kept, same side of a).
      pos: (_s, p) => {
        const a = vecOf(p.A);
        const b = vecOf(p.B);
        const r = plotRect(DOT);
        const phi = angleBetween(a, b) / Math.PI;
        const ab = mag(a) * mag(b);
        const yb = niceBound(ab);
        return { x: r.x0 + phi * (r.x1 - r.x0), y: r.y0 + ((dot(a, b) + yb) / (2 * yb)) * (r.y1 - r.y0) };
      },
      radiusPx: 14,
      when: (p) => mag(vecOf(p.A)) > 1e-9 && mag(vecOf(p.B)) > 1e-9,
      onDrag: (ctx, _s, w) => {
        const a = vecOf(ctx.params.A);
        const b = vecOf(ctx.params.B);
        const r = plotRect(DOT);
        const f = Math.min(1, Math.max(0, (w.x - r.x0) / (r.x1 - r.x0)));
        const side = crossZ(a, b) < 0 ? -1 : 1;
        const next = rotateTo(a, b, side * f * Math.PI);
        if (next[0] !== b[0] || next[1] !== b[1]) ctx.set('B', next);
      },
    },
  ],

  readouts: [
    { label: '\\varphi', unit: '°', value: (_s, p) => angleBetween(vecOf(p.A), vecOf(p.B)) / DEG },
    { label: '\\vec a\\cdot\\vec b', unit: '', value: (_s, p) => dot(vecOf(p.A), vecOf(p.B)), zeroTol: 1e-9 },
  ],

  formula: (_s, p) => {
    const a = vecOf(p.A);
    const b = vecOf(p.B);
    const la = mag(a);
    const lb = mag(b);
    const phi = angleBetween(a, b);
    const d = dot(a, b);
    const onA = p.proj !== 'a';
    const proj = onA ? (la > 0 ? d / la : 0) : lb > 0 ? d / lb : 0;
    const pr = (x: number, y: number) => `${cpt(x)}${cpt(y)}`;
    const pm = (x: number, y: number) => `${mg(x)}${mg(y)}`;
    return [
      `\\vec a\\cdot\\vec b = ab\\cos\\varphi = a_x b_x + a_y b_y`,
      `ab\\cos\\varphi = ${pm(la, lb)}\\cos ${deg(phi)}^\\circ = ${tx(la * lb * Math.cos(phi))}`,
      `a_x b_x + a_y b_y = ${pr(a[0], b[0])} + ${pr(a[1], b[1])} = ${tx(d)}`,
      onA
        ? `b\\cos\\varphi = \\vec a\\cdot\\vec b\\,/\\,a = ${tx(d)}/${tx(la)} = ${tx(proj)}`
        : `a\\cos\\varphi = \\vec a\\cdot\\vec b\\,/\\,b = ${tx(d)}/${tx(lb)} = ${tx(proj)}`,
    ];
  },

  info: {
    goals: ['products.dot.goal.proj', 'products.dot.goal.comp'],
    observe: ['products.dot.obs.drag', 'products.dot.obs.sign', 'products.dot.obs.perp', 'products.dot.obs.plot', 'products.dot.obs.panel'],
    equations: ['\\vec a\\cdot\\vec b = ab\\cos\\varphi = a\\,(b\\cos\\varphi) = b\\,(a\\cos\\varphi)', '\\vec a\\cdot\\vec b = a_x b_x + a_y b_y'],
    assumptions: ['products.dot.asm.plane'],
  },
};

// ------------------------------------------------------------------ cross product

type PC = { drag: string; A: number[]; B: number[] };

const crossParams: ParamSchema<PC> = {
  drag: dragParam,
  A: { kind: 'array', label: 'products.p.A', desc: 'products.d.A', group: 'hidden', live: true, default: [4, 1], min: -CROSS.lim, max: CROSS.lim },
  B: { kind: 'array', label: 'products.p.B', desc: 'products.d.B', group: 'hidden', live: true, default: [1, 3], min: -CROSS.lim, max: CROSS.lim },
};

const crossInset = (g: Draw, p: PC) => {
  const yb = niceBound(mag(vecOf(p.A)) * mag(vecOf(p.B)));
  return new Inset(g, plotRect(CROSS), [-180, 180], [-yb, yb]);
};

/** ⊙ (out of the page) or ⊗ (into it), `r` px. */
function zSymbol(g: Draw, at: Vec2, out: boolean, r = 11): void {
  g.circle(at, r, { fill: '#ffffff', color: PLOT_FG, width: 1.75 });
  if (out) g.circle(at, r * 0.28, { fill: PLOT_FG, color: PLOT_FG, width: 1 });
  else {
    const d = g.px(r * 0.68);
    g.line({ x: at.x - d, y: at.y - d }, { x: at.x + d, y: at.y + d }, { color: PLOT_FG, width: 1.75 });
    g.line({ x: at.x - d, y: at.y + d }, { x: at.x + d, y: at.y - d }, { color: PLOT_FG, width: 1.75 });
  }
}

export const crossScene: Scene<PC, { t: number }> = {
  id: 'cross',
  title: 'products.scene.cross',
  params: crossParams,
  world: () => world(CROSS),
  init: () => ({ t: 0 }),

  draw: (g, _s, p) => {
    const a = vecOf(p.A);
    const b = vecOf(p.B);
    const la = mag(a);
    const lb = mag(b);
    const phi = signedAngle(a, b);
    const cz = crossZ(a, b);
    const s: V2 = [a[0] + b[0], a[1] + b[1]];
    drawPlane(g, CROSS);
    const lay = new LabelLayout(g);
    tickObstacles(lay, g, CROSS);

    // Parallelogram: area |a × b|; dashed sides are the copies of a and b.
    g.polygon([O, P(a), P(s), P(b)], { fill: 'fg', fillAlpha: 0.08 });
    g.line(P(a), P(s), { role: 'energyU', width: 1.25, dash: [5, 4] });
    g.line(P(b), P(s), { role: 'position', width: 1.25, dash: [5, 4] });
    lay.seg(P(a), P(s));
    lay.seg(P(b), P(s));

    // Height b sin φ: perpendicular from b's tip to the (extended) line of a.
    const line = lineThrough(a, CROSS);
    const foot = P(project(b, a));
    const tipB = P(b);
    const hl = Math.hypot(tipB.x - foot.x, tipB.y - foot.y);
    if (line && lb > 1e-9) {
      g.line(line[0], line[1], { color: DASH, width: 1, dash: [6, 5] });
      lay.seg(line[0], line[1]);
      if (hl > 1e-6) {
        g.line(tipB, foot, { color: GREY, width: 1.25, dash: [4, 3] });
        lay.seg(tipB, foot);
        const fl = Math.hypot(foot.x, foot.y);
        if (hl > g.px(10)) rightAngle(g, foot, fl > g.px(10) ? unit({ x: -foot.x, y: -foot.y }) : unit({ x: -a[0], y: -a[1] }), unit({ x: tipB.x - foot.x, y: tipB.y - foot.y }));
      }
    }

    halo(g, P(a), 'position');
    halo(g, P(b), 'energyU');
    g.arrow(O, P(a), { role: 'position', width: 2.5 });
    g.arrow(O, P(b), { role: 'energyU', width: 2.5 });
    lay.seg(O, P(a));
    lay.seg(O, P(b));

    // Direction of a × b (right-hand rule: curl from a to b) at the parallelogram's centre.
    const centre = P(s, 0.5);
    const big = Math.abs(cz) > 0.02 * Math.max(1e-9, la * lb) && Math.abs(cz) > 0.05;
    if (big) {
      zSymbol(g, centre, cz > 0);
      const [cx, cy] = lay.px(centre);
      const r = 13 * theme.scale;
      lay.boxes.push({ x0: cx - r, y0: cy - r, x1: cx + r, y1: cy + r });
    }

    if (la > 1e-9 && lb > 1e-9) angleArc(g, lay, a, phi, `*φ* = ${fmt(phi / DEG, 3)}°`, true);
    const D = [12, 20, 30, 42, 56];
    const away = (v: V2): Vec2 => {
      const m = P(v, 0.5);
      return { x: m.x - centre.x, y: m.y - centre.y };
    };
    if (la > 1e-9) lay.beside(O, P(a), away(a), `*a* = ${fmt(la)}`, 'position', D);
    if (lb > 1e-9) lay.beside(O, P(b), away(b), `*b* = ${fmt(lb)}`, 'energyU', D);
    if (line && hl > g.px(16)) {
      // Height label on the side of the height line away from the parallelogram (−a).
      placeIfClear(g, lay, foot, tipB, { x: -a[0], y: -a[1] }, '*b* sin *φ*', GREY);
    }

    const ins = crossInset(g, p);
    drawProductPlot(g, ins, (x) => la * lb * Math.sin(x), phi, cz, [-180, -90, 0, 90, 180], '(*a*×*b*)_{*z*}');
    // ⊙ inside the positive lobe (b counter-clockwise from a), ⊗ inside the negative one.
    const ab = la * lb;
    if (ab > 0.25 * ins.yr[1]) {
      zSymbol(g, ins.P(-90, -0.42 * ab), false, 7);
      zSymbol(g, ins.P(90, 0.42 * ab), true, 7);
    }
  },

  handles: [
    { pos: (_s, p) => P(vecOf(p.A)), radiusPx: 18, onDrag: (ctx, _s, w) => setTip(ctx, 'A', w, CROSS.lim) },
    { pos: (_s, p) => P(vecOf(p.B)), radiusPx: 18, onDrag: (ctx, _s, w) => setTip(ctx, 'B', w, CROSS.lim) },
    {
      // The plot point: dragging it along φ turns b about the origin, length kept.
      pos: (_s, p) => {
        const a = vecOf(p.A);
        const b = vecOf(p.B);
        const r = plotRect(CROSS);
        const yb = niceBound(mag(a) * mag(b));
        const f = (signedAngle(a, b) + Math.PI) / (2 * Math.PI);
        return { x: r.x0 + f * (r.x1 - r.x0), y: r.y0 + ((crossZ(a, b) + yb) / (2 * yb)) * (r.y1 - r.y0) };
      },
      radiusPx: 14,
      when: (p) => mag(vecOf(p.A)) > 1e-9 && mag(vecOf(p.B)) > 1e-9,
      onDrag: (ctx, _s, w) => {
        const a = vecOf(ctx.params.A);
        const b = vecOf(ctx.params.B);
        const r = plotRect(CROSS);
        const f = Math.min(1, Math.max(0, (w.x - r.x0) / (r.x1 - r.x0)));
        const next = rotateTo(a, b, (2 * f - 1) * Math.PI);
        if (next[0] !== b[0] || next[1] !== b[1]) ctx.set('B', next);
      },
    },
  ],

  readouts: [
    { label: '\\varphi', unit: '°', value: (_s, p) => signedAngle(vecOf(p.A), vecOf(p.B)) / DEG },
    { label: '(\\vec a\\times\\vec b)_z', unit: '', value: (_s, p) => crossZ(vecOf(p.A), vecOf(p.B)) },
  ],

  formula: (_s, p) => {
    const a = vecOf(p.A);
    const b = vecOf(p.B);
    const la = mag(a);
    const lb = mag(b);
    const phi = signedAngle(a, b);
    const cz = crossZ(a, b);
    const h = lb * Math.abs(Math.sin(phi));
    const dir = Math.abs(cz) < 0.005 ? '\\vec 0' : `${tx(Math.abs(cz))}\\,${cz > 0 ? '\\hat k\\ (\\odot)' : '(-\\hat k)\\ (\\otimes)'}`;
    const pr = (x: number, y: number) => `${cpt(x)}${cpt(y)}`;
    const pm = (x: number, y: number) => `${mg(x)}${mg(y)}`;
    return [
      `(\\vec a\\times\\vec b)_z = ab\\sin\\varphi = a_x b_y - a_y b_x`,
      `ab\\sin\\varphi = ${pm(la, lb)}\\sin(${deg(phi)}^\\circ) = ${tx(la * lb * Math.sin(phi))}`,
      `a_x b_y - a_y b_x = ${pr(a[0], b[1])} - ${pr(a[1], b[0])} = ${tx(cz)}`,
      `\\lvert\\vec a\\times\\vec b\\rvert = a\\,(b\\sin\\lvert\\varphi\\rvert) = ${pm(la, h)} = ${tx(la * h)}`,
      `\\vec a\\times\\vec b = ${dir}`,
    ];
  },

  info: {
    goals: ['products.cross.goal.area', 'products.cross.goal.dir'],
    observe: ['products.cross.obs.drag', 'products.cross.obs.rhr', 'products.cross.obs.par', 'products.cross.obs.anti', 'products.cross.obs.plot'],
    equations: ['(\\vec a\\times\\vec b)_z = ab\\sin\\varphi = a_x b_y - a_y b_x', '\\lvert\\vec a\\times\\vec b\\rvert = ab\\sin\\lvert\\varphi\\rvert = a\\,(b\\sin\\lvert\\varphi\\rvert)', '\\vec b\\times\\vec a = -\\,\\vec a\\times\\vec b'],
    assumptions: ['products.cross.asm.sign'],
  },
};
