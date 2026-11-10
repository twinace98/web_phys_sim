// Ch 3 scenes: components of a vector (with rotatable axes) and the parallelogram sum.
import { fmt, fmtTick } from '../../core/format';
import type { ParamSchema, Role, Scene, SelectParam, Vec2, WorldSpec } from '../../core/types';
import type { Draw } from '../../draw/draw';
import { add, axes, clampWithPartner, components, placeTip, type V2 } from './physics';

const DEG = Math.PI / 180;
const L = 5.8; // axis half-length
const LIM = 5.5; // max |component| of a tip
const GRID = 12; // grid half-extent: covers the stage at any axis rotation
const GREY = '#5c5c5c';
const DASH = '#9a9a9a';
const GRID_COLOR = '#ececec';

const world = (): WorldSpec => ({ x: [-6.3, 6.3], y: [-6.3, 6.3], aspect: 'contain', padPx: 12 });
const P = (v: V2, k = 1): Vec2 => ({ x: v[0] * k, y: v[1] * k });
const plus = (a: Vec2, b: Vec2): Vec2 => ({ x: a.x + b.x, y: a.y + b.y });
const O: Vec2 = { x: 0, y: 0 };
const sign = (v: number) => (v < 0 ? -1 : 1);

/** Unit-spaced grid aligned with the (possibly rotated) axes. */
function drawGrid(g: Draw, phi: number): void {
  const { ex, ey } = axes(phi);
  for (let k = -GRID; k <= GRID; k++) {
    if (k === 0) continue;
    g.line(plus(P(ex, k), P(ey, -GRID)), plus(P(ex, k), P(ey, GRID)), { color: GRID_COLOR, width: 1 });
    g.line(plus(P(ey, k), P(ex, -GRID)), plus(P(ey, k), P(ex, GRID)), { color: GRID_COLOR, width: 1 });
  }
}

function drawAxes(g: Draw, phi: number, tickLabels: boolean): void {
  const { ex, ey } = axes(phi);
  const list: [V2, V2, string][] = [
    [ex, ey, '*x*'],
    [ey, ex, '*y*'],
  ];
  for (const [e, n, name] of list) {
    g.arrow(P(e, -L), P(e, 2 * L), { role: 'axis', width: 1.25 });
    g.text(P(e, L + g.px(14)), name, { size: 15, color: GREY, align: 'center', baseline: 'middle' });
    for (let k = -5; k <= 5; k++) {
      if (k === 0) continue;
      const base = P(e, k);
      g.line(plus(base, P(n, -g.px(3))), plus(base, P(n, g.px(3))), { role: 'axis', width: 1 });
      if (tickLabels && k % 2 === 0) {
        g.text(plus(base, P(n, -g.px(13))), fmtTick(k), { size: 10, color: DASH, align: 'center', baseline: 'middle' });
      }
    }
  }
}

/** Text placed `d` px from `at` along unit direction `dir`, growing away from `at`. */
function sideText(g: Draw, at: Vec2, dir: Vec2, d: number, text: string, role: Role): void {
  const align = dir.x > 0.35 ? 'left' : dir.x < -0.35 ? 'right' : 'center';
  g.text({ x: at.x + dir.x * g.px(d), y: at.y + dir.y * g.px(d) }, text, { size: 15, role, align, baseline: 'middle' });
}

/** Label at the middle of the arrow from `from` along `vec`, on the side away from `away`. */
function midLabel(g: Draw, from: Vec2, vec: Vec2, text: string, role: Role, away: Vec2): void {
  const len = Math.hypot(vec.x, vec.y);
  if (len < 1e-9) return;
  const m = { x: from.x + vec.x / 2, y: from.y + vec.y / 2 };
  let n = { x: -vec.y / len, y: vec.x / len };
  if ((m.x - away.x) * n.x + (m.y - away.y) * n.y < 0) n = { x: -n.x, y: -n.y };
  sideText(g, m, n, 12, text, role);
}

/** Faint disc marking a draggable tip; drawn under the arrow so it never hides the head. */
const halo = (g: Draw, at: Vec2, role: Role) => g.circle(at, 14, { fill: role, alpha: 0.13 });

const dragParam: SelectParam = {
  kind: 'select',
  label: 'ch03.p.drag',
  group: 'main',
  live: true,
  default: 'smooth',
  options: [
    { value: 'smooth', label: 'ch03.drag.smooth' },
    { value: 'snap', label: 'ch03.drag.snap' },
  ],
};

// ------------------------------------------------------------------ components

type PC = { phi: number; drag: string; A: number[] };

const componentsParams: ParamSchema<PC> = {
  phi: {
    kind: 'number',
    label: 'ch03.p.phi',
    group: 'main',
    live: true,
    control: 'select',
    choices: [0, 15, 30, 45, 60],
    default: 0,
    unit: '°',
  },
  drag: dragParam,
  A: { kind: 'array', label: 'ch03.p.A', group: 'hidden', live: true, default: [4, 3], min: -LIM, max: LIM },
};

export const componentsScene: Scene<PC, { t: number }> = {
  id: 'components',
  title: 'ch03.scene.components',
  params: componentsParams,
  world,
  init: () => ({ t: 0 }),

  draw: (g, _s, p) => {
    const phi = p.phi * DEG;
    const a: V2 = [p.A[0], p.A[1]];
    const c = components(a, phi);
    const { ex, ey } = axes(phi);
    const tip = P(a);
    drawGrid(g, phi);
    drawAxes(g, phi, true);
    halo(g, tip, 'position');
    if (c.mag < 1e-9) return;

    const fx = P(ex, c.ax);
    const fy = P(ey, c.ay);
    g.polygon([O, fx, tip], { fill: 'position', fillAlpha: 0.07 });
    g.line(tip, fx, { color: DASH, width: 1, dash: [4, 4] });
    g.line(tip, fy, { color: DASH, width: 1, dash: [4, 4] });
    if (Math.abs(c.ax) > 0.3 && Math.abs(c.ay) > 0.3) {
      const d = g.px(8);
      const u = P(ex, -sign(c.ax) * d);
      const w = P(ey, sign(c.ay) * d);
      g.polyline([plus(fx, u), plus(plus(fx, u), w), plus(fx, w)], { color: DASH, width: 1 });
    }

    g.arrow(O, fx, { role: 'position', width: 2 });
    g.arrow(O, fy, { role: 'position', width: 2 });
    if (Math.abs(c.ax) > 0.2) sideText(g, P(ex, c.ax / 2), P(ey, -sign(c.ay)), 26, `*A*_{*x*} = ${fmt(c.ax)}`, 'position');
    if (Math.abs(c.ay) > 0.2) sideText(g, P(ey, c.ay / 2), P(ex, -sign(c.ax)), 22, `*A*_{*y*} = ${fmt(c.ay)}`, 'position');

    g.arc(O, 30, phi, phi + c.theta, { color: GREY, width: 1.25 });
    // Inside the wedge when it is wide enough. A narrow wedge has no room, so the label goes
    // to the middle of the neighbouring quadrant (between A and the next axis), farther out.
    const label = `*θ* = ${fmt(c.theta / DEG)}°`;
    if (Math.abs(c.theta) > 30 * DEG) {
      const mid = phi + c.theta / 2;
      g.text({ x: Math.cos(mid) * g.px(38), y: Math.sin(mid) * g.px(38) }, label, {
        size: 13,
        color: GREY,
        align: Math.cos(mid) >= 0 ? 'left' : 'right',
        baseline: 'middle',
      });
    } else {
      const mid = phi + (c.theta + sign(c.theta) * 90 * DEG) / 2;
      g.text({ x: Math.cos(mid) * g.px(72), y: Math.sin(mid) * g.px(72) }, label, { size: 13, color: GREY, align: 'center', baseline: 'middle' });
    }

    g.arrow(O, tip, { role: 'position', width: 3 });
    midLabel(g, O, tip, `*A* = ${fmt(c.mag)}`, 'position', { x: (fx.x + tip.x) / 3, y: (fx.y + tip.y) / 3 });
  },

  handles: [
    {
      pos: (_s, p) => P([p.A[0], p.A[1]]),
      radiusPx: 18,
      onDrag: (ctx, _s, w) => {
        const next = placeTip([w.x, w.y], ctx.params.phi * DEG, ctx.params.drag === 'snap', LIM);
        if (next[0] !== ctx.params.A[0] || next[1] !== ctx.params.A[1]) ctx.set('A', next);
      },
    },
  ],

  info: {
    goals: ['ch03.c.goal.proj', 'ch03.c.goal.axes'],
    observe: ['ch03.c.obs.drag', 'ch03.c.obs.neg', 'ch03.c.obs.rot', 'ch03.c.obs.incline'],
    equations: ['A_x = A\\cos\\theta, \\quad A_y = A\\sin\\theta', 'A = \\sqrt{A_x^2 + A_y^2}, \\quad \\tan\\theta = \\frac{A_y}{A_x}'],
  },
};

// ------------------------------------------------------------------ sum (parallelogram)

type PS = { drag: string; A: number[]; B: number[] };

const sumParams: ParamSchema<PS> = {
  drag: dragParam,
  A: { kind: 'array', label: 'ch03.p.A', group: 'hidden', live: true, default: [4, 1], min: -LIM, max: LIM },
  B: { kind: 'array', label: 'ch03.p.B', group: 'hidden', live: true, default: [-1, 3], min: -LIM, max: LIM },
};

/** Component bars beside an axis, one row each: A from 0, B starting where A ends, C = A + B from 0. */
function componentBars(g: Draw, a: V2, b: V2, axis: 0 | 1): void {
  const s = add(a, b);
  const at = (v: number, off: number): Vec2 => (axis === 0 ? { x: v, y: -g.px(off) } : { x: -g.px(off), y: v });
  const dir = (v: number): Vec2 => (axis === 0 ? { x: v, y: 0 } : { x: 0, y: v });
  g.arrow(at(0, 11), dir(a[axis]), { role: 'position', width: 2.25 });
  g.arrow(at(a[axis], 21), dir(b[axis]), { role: 'energyU', width: 2.25 });
  g.arrow(at(0, 31), dir(s[axis]), { role: 'fg', width: 2.25 });
}

/** Drag one vector of the pair; keeps it and the sum inside the view. */
function dragOne(ctx: { params: PS; set: (k: 'A' | 'B', v: number[]) => void }, key: 'A' | 'B', w: Vec2): void {
  const other = key === 'A' ? ctx.params.B : ctx.params.A;
  const next = clampWithPartner(placeTip([w.x, w.y], 0, ctx.params.drag === 'snap', LIM), [other[0], other[1]], LIM);
  if (next[0] !== ctx.params[key][0] || next[1] !== ctx.params[key][1]) ctx.set(key, next);
}

export const sumScene: Scene<PS, { t: number }> = {
  id: 'sum',
  title: 'ch03.scene.sum',
  params: sumParams,
  world,
  init: () => ({ t: 0 }),

  draw: (g, _s, p) => {
    const a: V2 = [p.A[0], p.A[1]];
    const b: V2 = [p.B[0], p.B[1]];
    const s = add(a, b);
    const centre = P(s, 0.5);
    drawGrid(g, 0);
    drawAxes(g, 0, false);
    componentBars(g, a, b, 0);
    componentBars(g, a, b, 1);
    halo(g, P(a), 'position');
    halo(g, P(b), 'energyU');

    // Parallelogram: a copy of B at A's tip and a copy of A at B's tip meet at A + B.
    g.polygon([O, P(a), P(s), P(b)], { fill: 'fg', fillAlpha: 0.04 });
    g.line(P(a), P(s), { role: 'energyU', width: 1.25, dash: [5, 4] });
    g.line(P(b), P(s), { role: 'position', width: 1.25, dash: [5, 4] });

    g.arrow(O, P(s), { role: 'fg', width: 3 });
    g.arrow(O, P(a), { role: 'position', width: 2.5 });
    g.arrow(O, P(b), { role: 'energyU', width: 2.5 });
    midLabel(g, O, P(a), '*A*', 'position', centre);
    midLabel(g, O, P(b), '*B*', 'energyU', centre);
    const len = Math.hypot(s[0], s[1]);
    if (len > 1e-9) sideText(g, P(s), { x: s[0] / len, y: s[1] / len }, 14, '*C* = *A* + *B*', 'fg');
  },

  handles: [
    { pos: (_s, p) => P([p.A[0], p.A[1]]), radiusPx: 18, onDrag: (ctx, _s, w) => dragOne(ctx, 'A', w) },
    { pos: (_s, p) => P([p.B[0], p.B[1]]), radiusPx: 18, onDrag: (ctx, _s, w) => dragOne(ctx, 'B', w) },
  ],

  readouts: [
    { label: 'C_x', unit: '', value: (_s, p) => p.A[0] + p.B[0] },
    { label: 'C_y', unit: '', value: (_s, p) => p.A[1] + p.B[1] },
    { label: 'C', unit: '', value: (_s, p) => Math.hypot(p.A[0] + p.B[0], p.A[1] + p.B[1]) },
  ],

  info: {
    goals: ['ch03.s.goal.para', 'ch03.s.goal'],
    observe: ['ch03.s.obs.para', 'ch03.s.obs.bars', 'ch03.s.obs.cancel', 'ch03.s.obs.drag'],
    equations: ['\\vec C = \\vec A + \\vec B', 'C_x = A_x + B_x, \\quad C_y = A_y + B_y'],
  },
};
