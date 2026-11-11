// Ch 10 scene: parallel-axis theorem. Drag the rotation axis away from the centre of mass;
// I(d) = I_cm + M d² traces a parabola whose curvature M is the same for every shape.
import { fmt, fmtTick, niceTicks } from '../../core/format';
import type { ParamSchema, Scene, Vec2 } from '../../core/types';
import type { Draw } from '../../draw/draw';
import { ROLE_COLOR } from '../../draw/theme';
import { inertiaCm, parallelAxis, type Shape } from './physics';

type P = { shape: string; d: number };

const M = 2; // kg
const R = 0.5; // m
// I(d) graph to the right of the body: d ∈ [0, R] → x ∈ [GX, GX + R·SX], I → y = GY + I·SY.
const GX = 0.95;
const SX = 2.4;
const GY = -0.55;
const SY = 0.95;
const I_TOP = 1.15; // kg·m²
const BODY = ROLE_COLOR.position;
const GREY = '#9a9a9a';
const TICK = '#6b6b6b';

const params: ParamSchema<P> = {
  shape: {
    kind: 'select',
    label: 'ch10.p.shape',
    desc: 'ch10.d.shape',
    group: 'main',
    live: true,
    default: 'disk',
    options: [
      { value: 'ring', label: 'ch10.shape.ring' },
      { value: 'disk', label: 'ch10.shape.disk' },
      { value: 'rod', label: 'ch10.shape.rod' },
    ],
  },
  d: { kind: 'number', label: 'ch10.p.d', group: 'hidden', live: true, control: 'slider', min: -R, max: R, default: 0.3 },
};

const gx = (d: number) => GX + Math.abs(d) * SX;
const gy = (I: number) => GY + I * SY;

function body(g: Draw, shape: Shape): void {
  const ring: Vec2[] = [];
  for (let i = 0; i < 96; i++) ring.push({ x: R * Math.cos((i / 96) * 2 * Math.PI), y: R * Math.sin((i / 96) * 2 * Math.PI) });
  if (shape === 'disk') g.polygon(ring, { fill: BODY, fillAlpha: 0.25, color: BODY, width: 1.5 });
  else if (shape === 'ring') g.polygon(ring, { color: BODY, width: 6 });
  else {
    const h = 0.04;
    g.polygon(
      [
        { x: -R, y: -h },
        { x: R, y: -h },
        { x: R, y: h },
        { x: -R, y: h },
      ],
      { fill: BODY, fillAlpha: 0.85 },
    );
  }
}

/** Axis perpendicular to the page: circle with a dot, plus a faint rotation arrow. */
function axis(g: Draw, c: Vec2): void {
  g.circle(c, 16, { fill: '#000000', alpha: 0.06 });
  g.arc(c, 20, 0.15 * Math.PI, 0.85 * Math.PI, { color: '#1a1a1a', width: 1.25 });
  const a1 = 0.85 * Math.PI;
  const tip = { x: c.x + g.px(20) * Math.cos(a1), y: c.y + g.px(20) * Math.sin(a1) };
  const tan = { x: -Math.sin(a1) * g.px(6), y: Math.cos(a1) * g.px(6) };
  g.arrow({ x: tip.x - tan.x, y: tip.y - tan.y }, tan, { color: '#1a1a1a', width: 1.25 });
  g.circle(c, 6, { fill: '#ffffff', color: '#1a1a1a', width: 1.75 });
  g.circle(c, 1.75, { fill: '#1a1a1a' });
}

function cmMark(g: Draw, c: Vec2): void {
  const r = g.px(6);
  const quad = (a0: number): Vec2[] => {
    const pts: Vec2[] = [c];
    for (let i = 0; i <= 8; i++) pts.push({ x: c.x + r * Math.cos(a0 + (i / 8) * (Math.PI / 2)), y: c.y + r * Math.sin(a0 + (i / 8) * (Math.PI / 2)) });
    return pts;
  };
  g.circle(c, 6, { fill: '#ffffff', color: '#1a1a1a', width: 1.25 });
  g.polygon(quad(0), { fill: '#1a1a1a' });
  g.polygon(quad(Math.PI), { fill: '#1a1a1a' });
}

function graph(g: Draw, Icm: number, d: number): void {
  const x1 = gx(R);
  g.line({ x: GX, y: GY }, { x: x1 + 0.1, y: GY }, { role: 'axis', width: 1.25 });
  g.line({ x: GX, y: GY }, { x: GX, y: gy(I_TOP) }, { role: 'axis', width: 1.25 });
  for (const v of niceTicks(0, R, 5)) {
    g.line({ x: gx(v), y: GY }, { x: gx(v), y: GY - g.px(4) }, { role: 'axis', width: 1 });
    g.text({ x: gx(v), y: GY }, fmtTick(v), { size: 11, color: TICK, align: 'center', dy: 16 });
  }
  for (const v of niceTicks(0, 1, 4)) {
    g.line({ x: GX, y: gy(v) }, { x: GX - g.px(4), y: gy(v) }, { role: 'axis', width: 1 });
    g.text({ x: GX, y: gy(v) }, fmtTick(v), { size: 11, color: TICK, align: 'right', baseline: 'middle', dx: -7 });
  }
  g.text({ x: x1 + 0.1, y: GY }, '*d* (m)', { size: 12, color: TICK, align: 'right', dy: 32 });
  g.text({ x: GX, y: gy(I_TOP) }, '*I* (kg·m²)', { size: 12, color: TICK, align: 'center', dy: -10 });

  // I_cm level, parabola, and the current point with its M d² part.
  g.line({ x: GX, y: gy(Icm) }, { x: x1, y: gy(Icm) }, { color: GREY, width: 1, dash: [4, 4] });
  const pts: Vec2[] = [];
  for (let i = 0; i <= 60; i++) {
    const dd = (i / 60) * R;
    pts.push({ x: gx(dd), y: gy(parallelAxis(Icm, M, dd)) });
  }
  g.polyline(pts, { color: '#1a1a1a', width: 2 });
  const I = parallelAxis(Icm, M, d);
  const X = gx(d);
  g.line({ x: X, y: GY }, { x: X, y: gy(Icm) }, { color: BODY, width: 3 });
  g.line({ x: X, y: gy(Icm) }, { x: X, y: gy(I) }, { role: 'energyU', width: 3 });
  g.circle({ x: X, y: gy(I) }, 5, { fill: '#1a1a1a' });
  // Labels right of the bar, under the rising curve; left of it only near the end of the axis.
  const left = Math.abs(d) > 0.4;
  const st = { size: 13, align: left ? ('right' as const) : ('left' as const), baseline: 'middle' as const, dx: left ? -8 : 8 };
  g.text({ x: X, y: (GY + gy(Icm)) / 2 }, '*I*_{cm}', { ...st, role: 'position' });
  if (gy(I) - gy(Icm) > g.px(16)) g.text({ x: X, y: (gy(Icm) + gy(I)) / 2 }, '*Md*^{2}', { ...st, role: 'energyU' });
}

export const parallelScene: Scene<P, { t: number }> = {
  id: 'parallel',
  title: 'ch10.pa.scene',
  params,
  world: () => ({ x: [-R - 0.25, gx(R) + 0.2], y: [GY - 0.25, gy(I_TOP) + 0.15], aspect: 'contain', padPx: 16 }),
  init: () => ({ t: 0 }),

  draw: (g, _s, p) => {
    const shape = p.shape as Shape;
    const Icm = inertiaCm(shape, M, R);
    body(g, shape);
    const C: Vec2 = { x: 0, y: 0 };
    const A: Vec2 = { x: p.d, y: 0 };
    if (Math.abs(p.d) > 1e-6) {
      g.line(C, A, { color: '#1a1a1a', width: 1, dash: [3, 3] });
      g.text({ x: p.d / 2, y: 0 }, `*d* = ${fmt(Math.abs(p.d), 2)} m`, { size: 13, color: '#1a1a1a', align: 'center', dy: 30 });
    }
    cmMark(g, C);
    axis(g, A);
    graph(g, Icm, p.d);
  },

  handles: [
    {
      pos: (_s, p) => ({ x: p.d, y: 0 }),
      radiusPx: 18,
      onDrag: (ctx, _s, w) => {
        const d = Math.round(Math.min(R, Math.max(-R, w.x)) * 100) / 100;
        if (d !== ctx.params.d) ctx.set('d', d);
      },
    },
  ],

  readouts: [
    { label: 'I_\\mathrm{cm}', unit: 'kg·m²', value: (_s, p) => inertiaCm(p.shape as Shape, M, R) },
    { label: 'Md^2', unit: 'kg·m²', value: (_s, p) => M * p.d * p.d },
    { label: 'I', unit: 'kg·m²', value: (_s, p) => parallelAxis(inertiaCm(p.shape as Shape, M, R), M, p.d) },
  ],

  info: {
    goals: ['ch10.pa.goal.theorem', 'ch10.pa.goal.shape'],
    observe: ['ch10.pa.obs.drag', 'ch10.pa.obs.min', 'ch10.pa.obs.same', 'ch10.pa.obs.order'],
    equations: ['I = I_\\mathrm{cm} + M d^2'],
    assumptions: ['ch10.pa.assume'],
  },
};
