// Ch 3 scenes: components of a vector (with rotatable axes) and componentwise addition.
import { fmt, fmtTick } from '../../core/format';
import type { ParamSchema, Scene, Vec2, WorldSpec } from '../../core/types';
import type { Draw } from '../../draw/draw';
import { add, axes, components, placeTip, sub, type V2 } from './physics';

const DEG = Math.PI / 180;
const L = 5.8; // axis half-length
const LIM = 5.5; // max |component| of a tip
const GREY = '#5c5c5c';
const DASH = '#9a9a9a';

const world = (): WorldSpec => ({ x: [-6.3, 6.3], y: [-6.3, 6.3], aspect: 'contain', padPx: 12 });
const P = (v: V2, k = 1): Vec2 => ({ x: v[0] * k, y: v[1] * k });
const plus = (a: Vec2, b: Vec2): Vec2 => ({ x: a.x + b.x, y: a.y + b.y });
const O: Vec2 = { x: 0, y: 0 };
const sign = (v: number) => (v < 0 ? -1 : 1);

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

/**
 * Label at the middle of the arrow from `from` along `vec`, pushed sideways away from `away`
 * (e.g. a triangle's centroid) so it sits outside the figure.
 */
function midLabel(g: Draw, from: Vec2, vec: Vec2, text: string, role: 'position' | 'energyU' | 'fg', away: Vec2): void {
  const len = Math.hypot(vec.x, vec.y);
  if (len < 1e-9) return;
  const m = { x: from.x + vec.x / 2, y: from.y + vec.y / 2 };
  let n = { x: -vec.y / len, y: vec.x / len };
  if ((m.x - away.x) * n.x + (m.y - away.y) * n.y < 0) n = { x: -n.x, y: -n.y };
  const d = g.px(12);
  // Grow the text away from the arrow so long labels never cross it.
  const align = n.x > 0.35 ? 'left' : n.x < -0.35 ? 'right' : 'center';
  g.text({ x: m.x + n.x * d, y: m.y + n.y * d }, text, { size: 15, role, align, baseline: 'middle' });
}

/** Faint disc marking a draggable tip; drawn under the arrow so it never hides the head. */
const halo = (g: Draw, at: Vec2, role: 'position' | 'energyU') => g.circle(at, 14, { fill: role, alpha: 0.13 });

// ------------------------------------------------------------------ components

type PC = { phi: number; A: number[]; snap: boolean };

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
  A: { kind: 'array', label: 'ch03.p.A', group: 'hidden', live: true, default: [4, 3], min: -LIM, max: LIM },
  snap: { kind: 'toggle', label: 'ch03.p.snap', group: 'advanced', live: true, default: true },
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
    const lbl = { size: 15, role: 'position' as const, align: 'center' as const, baseline: 'middle' as const };
    if (Math.abs(c.ax) > 0.2) g.text(plus(P(ex, c.ax / 2), P(ey, -sign(c.ay) * g.px(27))), '*A*_{*x*}', lbl);
    if (Math.abs(c.ay) > 0.2) g.text(plus(P(ey, c.ay / 2), P(ex, -sign(c.ax) * g.px(30))), '*A*_{*y*}', lbl);

    g.arc(O, 30, phi, phi + c.theta, { color: GREY, width: 1.25 });
    const mid = phi + c.theta / 2;
    g.text({ x: Math.cos(mid) * g.px(38), y: Math.sin(mid) * g.px(38) }, `*θ* = ${fmt(c.theta / DEG)}°`, {
      size: 13,
      color: GREY,
      align: Math.cos(mid) >= 0 ? 'left' : 'right',
      baseline: 'middle',
    });

    g.arrow(O, tip, { role: 'position', width: 3 });
    midLabel(g, O, tip, '*A*', 'position', { x: (fx.x + tip.x) / 3, y: (fx.y + tip.y) / 3 });
  },

  handles: [
    {
      pos: (_s, p) => P([p.A[0], p.A[1]]),
      radiusPx: 18,
      onDrag: (ctx, _s, w) => {
        const next = placeTip([w.x, w.y], ctx.params.phi * DEG, ctx.params.snap, LIM);
        if (next[0] !== ctx.params.A[0] || next[1] !== ctx.params.A[1]) ctx.set('A', next);
      },
    },
  ],

  readouts: [
    { label: 'A_x', unit: '', value: (_s, p) => components([p.A[0], p.A[1]], p.phi * DEG).ax },
    { label: 'A_y', unit: '', value: (_s, p) => components([p.A[0], p.A[1]], p.phi * DEG).ay },
    { label: 'A', unit: '', value: (_s, p) => Math.hypot(p.A[0], p.A[1]) },
  ],

  info: {
    goals: ['ch03.c.goal.proj', 'ch03.c.goal.axes'],
    observe: ['ch03.c.obs.drag', 'ch03.c.obs.neg', 'ch03.c.obs.rot', 'ch03.c.obs.incline'],
    equations: ['A_x = A\\cos\\theta, \\quad A_y = A\\sin\\theta', 'A = \\sqrt{A_x^2 + A_y^2}, \\quad \\tan\\theta = \\frac{A_y}{A_x}'],
  },
};

// ------------------------------------------------------------------ sum

type PS = { A: number[]; B: number[]; snap: boolean };

const sumParams: ParamSchema<PS> = {
  A: { kind: 'array', label: 'ch03.p.A', group: 'hidden', live: true, default: [4, 1], min: -LIM, max: LIM },
  B: { kind: 'array', label: 'ch03.p.B', group: 'hidden', live: true, default: [-1, 3], min: -2 * LIM, max: 2 * LIM },
  snap: { kind: 'toggle', label: 'ch03.p.snap', group: 'advanced', live: true, default: true },
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
    drawAxes(g, 0, false);
    halo(g, P(a), 'position');
    halo(g, P(s), 'energyU');
    componentBars(g, a, b, 0);
    componentBars(g, a, b, 1);
    const G = { x: (a[0] + s[0]) / 3, y: (a[1] + s[1]) / 3 };
    g.arrow(O, P(s), { role: 'fg', width: 3 });
    g.arrow(O, P(a), { role: 'position', width: 2.5 });
    g.arrow(P(a), P(b), { role: 'energyU', width: 2.5 });
    midLabel(g, O, P(s), '*C* = *A* + *B*', 'fg', G);
    midLabel(g, O, P(a), '*A*', 'position', G);
    midLabel(g, P(a), P(b), '*B*', 'energyU', G);
  },

  handles: [
    {
      pos: (_s, p) => P(add([p.A[0], p.A[1]], [p.B[0], p.B[1]])),
      radiusPx: 18,
      onDrag: (ctx, _s, w) => {
        const a: V2 = [ctx.params.A[0], ctx.params.A[1]];
        const tip = placeTip([w.x, w.y], 0, ctx.params.snap, LIM);
        const b = sub(tip, a).map((v) => Math.round(v * 100) / 100);
        if (b[0] !== ctx.params.B[0] || b[1] !== ctx.params.B[1]) ctx.set('B', b);
      },
    },
    {
      pos: (_s, p) => P([p.A[0], p.A[1]]),
      radiusPx: 18,
      onDrag: (ctx, _s, w) => {
        const next = placeTip([w.x, w.y], 0, ctx.params.snap, LIM);
        if (next[0] !== ctx.params.A[0] || next[1] !== ctx.params.A[1]) ctx.set('A', next);
      },
    },
  ],

  readouts: [
    { label: 'C_x', unit: '', value: (_s, p) => p.A[0] + p.B[0] },
    { label: 'C_y', unit: '', value: (_s, p) => p.A[1] + p.B[1] },
    { label: 'C', unit: '', value: (_s, p) => Math.hypot(p.A[0] + p.B[0], p.A[1] + p.B[1]) },
  ],

  info: {
    goals: ['ch03.s.goal'],
    observe: ['ch03.s.obs.bars', 'ch03.s.obs.cancel', 'ch03.s.obs.drag'],
    equations: ['\\vec C = \\vec A + \\vec B', 'C_x = A_x + B_x, \\quad C_y = A_y + B_y'],
  },
};
