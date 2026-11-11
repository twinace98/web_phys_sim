// Ch 36 scene: phasor chain. N Huygens sources across the slit, rays at angle θ, and the
// head-to-tail sum of their phasors. At a sin θ = λ the chain closes into a circle: I = 0.
import type { ParamSchema, Scene, Vec2 } from '../../core/types';
import type { Draw } from '../../draw/draw';
import { ROLE_COLOR } from '../../draw/theme';
import { Inset, TICK } from '../inset/inset';
import { edgePhase, firstMin, phasorChain, sourcesIntensity } from './physics';

type P = { theta: number; a: number; lambda: number; N: number };

const DEG = Math.PI / 180;
const TH_MAX = 40;
/** Slit drawing: wall at x = SX, opening of drawn height SH (not to scale). */
const SX = 1.6;
const SH = 7;
const RAY = 5.2;
/** Phasor chain: origin and total length when straight. */
const CX = 9.2;
const CHAIN = 16;
const PLOT = { x0: 29, y0: -4.5, x1: 37.5, y1: 4.5 };

const params: ParamSchema<P> = {
  theta: {
    kind: 'number',
    label: 'ch36.p.theta',
    desc: 'ch36.d.theta',
    group: 'main',
    live: true,
    control: 'slider',
    min: -TH_MAX,
    max: TH_MAX,
    step: 0.1,
    default: 14.5,
    unit: '°',
  },
  a: {
    kind: 'number',
    label: 'ch36.p.a',
    desc: 'ch36.d.a',
    group: 'main',
    live: true,
    control: 'slider',
    min: 0.5,
    max: 4,
    step: 0.1,
    default: 2,
    unit: 'μm',
  },
  lambda: {
    kind: 'number',
    label: 'ch36.p.lambda',
    desc: 'ch36.d.lambda',
    group: 'advanced',
    live: true,
    control: 'slider',
    min: 400,
    max: 700,
    step: 10,
    default: 500,
    unit: 'nm',
  },
  N: {
    kind: 'number',
    label: 'ch36.p.N',
    desc: 'ch36.d.N',
    group: 'advanced',
    live: true,
    control: 'slider',
    min: 2,
    max: 20,
    step: 1,
    default: 10,
  },
};

const phiOf = (p: P, th = p.theta) => edgePhase(p.a, p.lambda / 1000, th * DEG);
/** Phase step between neighbouring sources is φ/N; N sources spaced a/N give φ_N = φ across the slit. */
const intensity = (p: P, th = p.theta) => sourcesIntensity(p.N, phiOf(p, th));

const plot = (g: Draw) => new Inset(g, PLOT, [-TH_MAX, TH_MAX], [0, 1.1]);

function drawSlit(g: Draw, p: P): void {
  const N = p.N;
  const ys = Array.from({ length: N }, (_, i) => SH / 2 - ((i + 0.5) * SH) / N);
  const wall = (ya: number, yb: number) =>
    g.polygon(
      [
        { x: SX - 0.3, y: ya },
        { x: SX, y: ya },
        { x: SX, y: yb },
        { x: SX - 0.3, y: yb },
      ],
      { fill: '#5c5c5c' },
    );
  wall(SH / 2, 8.5);
  wall(-8.5, -SH / 2);
  const th = p.theta * DEG;
  const u = { x: Math.cos(th), y: Math.sin(th) };
  // Rays end on a common wavefront (perpendicular to u) that the top ray reaches after RAY.
  const c = SX * u.x + ys[0] * u.y + RAY;
  ys.forEach((y, i) => {
    const L = c - (SX * u.x + y * u.y);
    const col = i < N / 2 ? ROLE_COLOR.position : ROLE_COLOR.energyU;
    g.line({ x: SX, y }, { x: SX + L * u.x, y: y + L * u.y }, { color: col, width: 1.25, alpha: 0.75 });
  });
  const top: Vec2 = { x: SX + RAY * u.x, y: ys[0] + RAY * u.y };
  const n = { x: -u.y, y: u.x };
  const span = SH + 1.2;
  g.line({ x: top.x + n.x, y: top.y + n.y }, { x: top.x - n.x * span, y: top.y - n.y * span }, { color: TICK, width: 1, dash: [4, 4] });
  // Extra path a sin θ, on the ray that travels farther (bottom for θ > 0, top for θ < 0).
  const extra = Math.abs((ys[0] - ys[N - 1]) * u.y);
  if (extra > g.px(3)) {
    const from: Vec2 = { x: SX, y: th > 0 ? ys[N - 1] : ys[0] };
    const sg = Math.sign(th);
    const nrm = { x: sg * u.y, y: -sg * u.x };
    g.line(from, { x: from.x + extra * u.x, y: from.y + extra * u.y }, { role: 'fg', width: 3.5 });
    const mid = { x: from.x + (extra * u.x) / 2 + nrm.x * g.px(16), y: from.y + (extra * u.y) / 2 + nrm.y * g.px(16) };
    g.text(mid, 'Δ*L*', { size: 13, align: 'center', baseline: 'middle' });
  }
  // Angle θ from the straight-through direction, at the source without the ΔL mark.
  const T0: Vec2 = { x: SX, y: th >= 0 ? ys[0] : ys[N - 1] };
  g.line(T0, { x: SX + 2.6, y: T0.y }, { color: TICK, width: 1, dash: [3, 4] });
  if (Math.abs(th) > 0.5 * DEG) {
    g.arc(T0, 46, 0, th, { color: TICK, width: 1.25 });
    g.text({ x: SX + Math.cos(th / 2) * g.px(58), y: T0.y + Math.sin(th / 2) * g.px(58) }, '*θ*', { size: 13, color: TICK, align: 'left', baseline: 'middle' });
  }
  ys.forEach((y, i) => g.circle({ x: SX, y }, 4, { fill: i < N / 2 ? 'position' : 'energyU', color: '#ffffff', width: 1 }));
  g.text({ x: SX - 0.3, y: 0 }, '*a*', { size: 14, color: TICK, align: 'right', baseline: 'middle', dx: -8 });
}

function drawChain(g: Draw, p: P): void {
  const N = p.N;
  const len = CHAIN / N;
  const pts = phasorChain(N, phiOf(p), len);
  const O = { x: CX, y: 0 };
  const at = ([x, y]: [number, number]): Vec2 => ({ x: CX + x, y });
  g.line(O, { x: CX + CHAIN, y: 0 }, { color: '#c8c8c8', width: 1, dash: [3, 4] });
  g.text({ x: CX + CHAIN, y: 0 }, '*E*_{m}', { size: 13, color: TICK, align: 'left', baseline: 'middle', dx: 8 });
  for (let k = 0; k < N; k++) {
    const a = at(pts[k]);
    const b = at(pts[k + 1]);
    g.arrow(a, { x: b.x - a.x, y: b.y - a.y }, { role: k < N / 2 ? 'position' : 'energyU', width: 2 });
  }
  const end = at(pts[N]);
  const R = { x: end.x - O.x, y: end.y - O.y };
  if (Math.hypot(R.x, R.y) > g.px(6)) g.arrow(O, R, { role: 'fg', width: 3 });
  g.circle(O, 3, { fill: 'fg' });
  // Label the resultant beside its middle, on the side away from the chain's centre.
  let cx = 0;
  let cy = 0;
  for (const q of pts) {
    cx += q[0] / pts.length;
    cy += q[1] / pts.length;
  }
  const C = { x: CX + cx, y: cy };
  const mid = { x: O.x + R.x / 2, y: O.y + R.y / 2 };
  const rl = Math.hypot(R.x, R.y);
  let n = rl > g.px(24) ? { x: -R.y / rl, y: R.x / rl } : { x: O.x - C.x, y: O.y - C.y };
  const nl = Math.hypot(n.x, n.y) || 1;
  n = { x: n.x / nl, y: n.y / nl };
  if ((mid.x - C.x) * n.x + (mid.y - C.y) * n.y < 0) n = { x: -n.x, y: -n.y };
  const lp = rl > g.px(24) ? mid : O;
  g.text({ x: lp.x + n.x * g.px(20), y: lp.y + n.y * g.px(20) }, '*E*_{*θ*}', { size: 14, align: 'center', baseline: 'middle' });
}

function drawPlot(g: Draw, p: P): void {
  const ins = plot(g);
  ins.frame({ xTicks: [-30, 0, 30], yTicks: [0, 1], xLabel: '*θ* (°)', yLabel: '*I*/*I*_{m}' });
  const pts: [number, number][] = [];
  for (let i = 0; i <= 400; i++) {
    const th = -TH_MAX + (2 * TH_MAX * i) / 400;
    pts.push([th, intensity(p, th)]);
  }
  ins.curve(pts, { role: 'fg', width: 1.75 });
  const t1 = firstMin(p.lambda / 1000, p.a) / DEG;
  for (const s of [-1, 1]) {
    if (!(t1 < TH_MAX)) continue;
    const q = ins.P(s * t1, 0);
    g.line(q, { x: q.x, y: q.y + g.px(6) }, { color: TICK, width: 1.25 });
  }
  ins.dot(p.theta, intensity(p), '#1a1a1a', 5.5);
}

export const phasor: Scene<P, { t: number }> = {
  id: 'phasor',
  title: 'ch36.ph.scene',
  params,
  world: () => ({ x: [-0.4, 38.5], y: [-9, 9], aspect: 'contain', padPx: 16 }),
  init: () => ({ t: 0 }),

  draw: (g, _s, p) => {
    drawSlit(g, p);
    drawChain(g, p);
    drawPlot(g, p);
  },

  handles: [
    {
      pos: (_s, p) => ({
        x: PLOT.x0 + ((p.theta + TH_MAX) / (2 * TH_MAX)) * (PLOT.x1 - PLOT.x0),
        y: PLOT.y0 + (intensity(p) / 1.1) * (PLOT.y1 - PLOT.y0),
      }),
      radiusPx: 14,
      onDrag: (ctx, _s, w) => {
        const raw = -TH_MAX + ((w.x - PLOT.x0) / (PLOT.x1 - PLOT.x0)) * 2 * TH_MAX;
        const th = Math.round(Math.min(TH_MAX, Math.max(-TH_MAX, raw)) * 10) / 10;
        if (th !== ctx.params.theta) ctx.set('theta', th);
      },
    },
  ],

  readouts: [
    { label: '\\phi', unit: '°', value: (_s, p) => phiOf(p) / DEG },
    { label: 'I/I_m', unit: '', value: (_s, p) => intensity(p) },
  ],

  info: {
    goals: ['ch36.ph.goal.chain', 'ch36.ph.goal.min'],
    observe: ['ch36.ph.obs.zero', 'ch36.ph.obs.min', 'ch36.ph.obs.second', 'ch36.ph.obs.a', 'ch36.ph.obs.N'],
    equations: ['\\phi = \\frac{2\\pi}{\\lambda}\\,a\\sin\\theta', 'E_\\theta = E_m\\,\\frac{\\sin(\\phi/2)}{\\phi/2}, \\quad I = I_m\\left(\\frac{\\sin\\alpha}{\\alpha}\\right)^2, \\; \\alpha = \\frac{\\phi}{2}'],
    assumptions: ['ch36.ph.assume.far', 'ch36.ph.assume.draw'],
  },
};
