// Static equilibrium (target Ch 12): a ladder against a frictionless wall on a rough floor with a
// person on it. All forces on the ladder at their points of application, the lever arms about
// the foot as dimension lines, and a gauge of the friction used, f / μs N. Past the limit the
// friction arrow stops at μs N and the missing part is dashed: no equilibrium, the foot slips.
import { fmt } from '../../../core/format';
import { LabelLayout } from '../../ch03/labels';
import type { ParamSchema, Scene, Vec2, WorldSpec } from '../../../core/types';
import type { Draw } from '../../../draw/draw';
import { theme } from '../../../draw/theme';
import { G, criticalAngle, criticalPosition, equilibrium, type LadderInput } from './physics';

const DEG = Math.PI / 180;
/** Ladder length [m]. */
export const L = 5;
const TH_MIN = 20;
const TH_MAX = 85;
/** Longest force arrow [m]; shorter scale (1 m per 400 N) when everything fits. */
const ARROW_MAX = 2.2;
const K0 = 1 / 400;

const WEIGHT = '#CC79A7';
const NORMAL = '#9E4F80';
const FRICTION = '#CC79A7';
const LADDER = '#5c5c5c';
const PERSON = '#8a8a8a';
const DIM = '#5c5c5c';
const GHOST = '#9a9a9a';
const GROUND = '#f2f2f2';

type P = { theta: number; d: number; m: number; M: number; mu: number; crit: boolean };

export const input = (p: P): LadderInput => ({ theta: p.theta * DEG, L, d: p.d, m: p.m, M: p.M, mu: p.mu });

const params: ParamSchema<P> = {
  theta: { kind: 'number', label: 'ladder.p.theta', desc: 'ladder.d.theta', group: 'main', live: true, control: 'slider', min: TH_MIN, max: TH_MAX, step: 1, default: 60, unit: '°' },
  d: { kind: 'number', label: 'ladder.p.d', desc: 'ladder.d.d', group: 'main', live: true, control: 'slider', min: 0, max: L, step: 0.05, default: 2.5, unit: 'm' },
  m: { kind: 'number', label: 'ladder.p.m', desc: 'ladder.d.m', group: 'advanced', live: true, control: 'slider', min: 1, max: 40, step: 1, default: 10, unit: 'kg' },
  M: { kind: 'number', label: 'ladder.p.M', desc: 'ladder.d.M', group: 'advanced', live: true, control: 'slider', min: 0, max: 150, step: 1, default: 70, unit: 'kg' },
  mu: { kind: 'number', label: 'ladder.p.mu', desc: 'ladder.d.mu', group: 'advanced', live: true, control: 'slider', min: 0, max: 1, step: 0.01, default: 0.4 },
  crit: { kind: 'toggle', label: 'ladder.p.crit', desc: 'ladder.d.crit', group: 'advanced', live: true, default: true },
};

const world = (): WorldSpec => ({ x: [-6.5, 1.0], y: [-1.35, 7.75], aspect: 'contain', padPx: 12 });

type Align = 'left' | 'right' | 'center';

const add = (a: Vec2, b: Vec2, k = 1): Vec2 => ({ x: a.x + b.x * k, y: a.y + b.y * k });

interface Geo {
  c: number;
  s: number;
  u: Vec2;
  n: Vec2;
  A: Vec2;
  T: Vec2;
  C: Vec2;
  Pp: Vec2;
}

function geo(p: P): Geo {
  const th = p.theta * DEG;
  const c = Math.cos(th);
  const s = Math.sin(th);
  const A = { x: -L * c, y: 0 };
  const u = { x: c, y: s };
  return { c, s, u, n: { x: -s, y: c }, A, T: { x: 0, y: L * s }, C: add(A, u, L / 2), Pp: add(A, u, p.d) };
}

/** Horizontal dimension line from x0 to x1 at height y, end ticks, label under it. */
function dimH(g: Draw, lay: LabelLayout, x0: number, x1: number, y: number, label: string): void {
  if (Math.abs(x1 - x0) < g.px(3)) return;
  const t = g.px(4);
  g.line({ x: x0, y }, { x: x1, y }, { color: DIM, width: 1 });
  g.line({ x: x0, y: y - t }, { x: x0, y: y + t }, { color: DIM, width: 1 });
  g.line({ x: x1, y: y - t }, { x: x1, y: y + t }, { color: DIM, width: 1 });
  lay.seg({ x: x0, y }, { x: x1, y });
  const [px, py] = lay.px({ x: (x0 + x1) / 2, y });
  lay.place([{ x: px, y: py + 11 * theme.scale, align: 'center' }], label, DIM, 12);
}

/** Vertical dimension line from y0 to y1 at x, label to its left. */
function dimV(g: Draw, lay: LabelLayout, x: number, y0: number, y1: number, label: string): void {
  const t = g.px(4);
  g.line({ x, y: y0 }, { x, y: y1 }, { color: DIM, width: 1 });
  g.line({ x: x - t, y: y0 }, { x: x + t, y: y0 }, { color: DIM, width: 1 });
  g.line({ x: x - t, y: y1 }, { x: x + t, y: y1 }, { color: DIM, width: 1 });
  lay.seg({ x, y: y0 }, { x, y: y1 });
  const [px, py] = lay.px({ x, y: (y0 + y1) / 2 });
  lay.place([{ x: px - 7 * theme.scale, y: py, align: 'right' }], label, DIM, 12);
}

function drawLadder(g: Draw, A: Vec2, u: Vec2, n: Vec2, col: string, alpha = 1): void {
  const w = 0.09;
  for (const side of [1, -1]) g.line(add(A, n, side * w), add(add(A, u, L), n, side * w), { color: col, width: 2, alpha });
  for (let t = 0.35; t < L - 0.1; t += 0.4) g.line(add(add(A, u, t), n, w), add(add(A, u, t), n, -w), { color: col, width: 1.25, alpha });
}

/**
 * Stick figure standing on the rung at P, facing the wall, hips a little behind the feet and
 * hands on the rails higher up. Returns its strokes (obstacles for labels).
 */
function drawPerson(g: Draw, A: Vec2, u: Vec2, d: number): [Vec2, Vec2][] {
  const P0 = add(A, u, d);
  const st = { color: PERSON, width: 2.25 };
  const knee = add(P0, { x: 0.02, y: 0.42 });
  const hip = add(P0, { x: -0.24, y: 0.76 });
  const shoulder = add(P0, { x: -0.16, y: 1.3 });
  const head = add(P0, { x: -0.12, y: 1.5 });
  const hand = add(A, u, Math.min(d + 1.15, L - 0.05));
  const elbow = { x: (shoulder.x + hand.x) / 2 - 0.02, y: (shoulder.y + hand.y) / 2 - 0.1 };
  const strokes: [Vec2, Vec2][] = [
    [P0, knee],
    [knee, hip],
    [hip, shoulder],
    [shoulder, elbow],
    [elbow, hand],
  ];
  for (const [a, b] of strokes) g.line(a, b, st);
  g.circle(head, 0.15 / g.px(1), { color: PERSON, width: 2.25, fill: '#ffffff' });
  strokes.push([add(head, { x: -0.15, y: 0 }), add(head, { x: 0.15, y: 0 })]);
  return strokes;
}

/** Gauge of the friction used, f / μs N; overflow past 100 % drawn hatched-dashed. */
function drawGauge(g: Draw, lay: LabelLayout, ratio: number): void {
  const x0 = -6.15;
  const w = 2.4;
  const y0 = 6.95;
  const h = 0.26;
  const box = (a: number, b: number): Vec2[] => [
    { x: x0 + a * w, y: y0 },
    { x: x0 + b * w, y: y0 },
    { x: x0 + b * w, y: y0 + h },
    { x: x0 + a * w, y: y0 + h },
  ];
  const r = Number.isFinite(ratio) ? ratio : Infinity;
  const fill = Math.min(1, r);
  if (fill > 0) g.polygon(box(0, fill), { fill: FRICTION, fillAlpha: 0.55 });
  g.polygon(box(0, 1), { color: DIM, width: 1.25 });
  if (r > 1) {
    const over = Math.min(r, 1.3);
    g.polygon(box(1, over), { fill: FRICTION, fillAlpha: 0.18, color: FRICTION, width: 1.25, dash: [3, 3] });
  }
  for (const f of [0.25, 0.5, 0.75]) g.line({ x: x0 + f * w, y: y0 }, { x: x0 + f * w, y: y0 + g.px(4) }, { color: DIM, width: 1 });
  g.text({ x: x0, y: y0 + h }, '*f* / *μ*_{s}*N*', { size: 13, color: DIM, align: 'left', baseline: 'bottom', dy: -5 });
  lay.seg({ x: x0, y: y0 + h / 2 }, { x: x0 + 1.3 * w, y: y0 + h / 2 });
  const txt = Number.isFinite(r) ? `${fmt(r * 100, 3)} %` : '∞';
  const xEnd = x0 + Math.max(1, Math.min(r, 1.3)) * w;
  g.text({ x: xEnd, y: y0 + h / 2 }, txt, { size: 13, color: r > 1 ? FRICTION : '#1a1a1a', align: 'left', baseline: 'middle', dx: 8, weight: r > 1 ? 600 : 400 });
}

export const ladderScene: Scene<P, { t: number }> = {
  id: 'ladder',
  title: 'ladder.scene.ladder',
  params,
  world,
  init: () => ({ t: 0 }),

  draw: (g, _s, p) => {
    const q = input(p);
    const e = equilibrium(q);
    const { u, n, A, T, C, Pp } = geo(p);
    const k = Math.min(K0, ARROW_MAX / Math.max(e.N, e.Fw, 1));

    // Ground and wall.
    g.polygon(
      [
        { x: -6.5, y: 0 },
        { x: 0, y: 0 },
        { x: 0, y: -1.35 },
        { x: -6.5, y: -1.35 },
      ],
      { fill: GROUND },
    );
    g.polygon(
      [
        { x: 0, y: -1.35 },
        { x: 0.45, y: -1.35 },
        { x: 0.45, y: 7.75 },
        { x: 0, y: 7.75 },
      ],
      { fill: GROUND },
    );
    g.line({ x: -6.5, y: 0 }, { x: 0, y: 0 }, { color: LADDER, width: 1.5 });
    g.line({ x: 0, y: 0 }, { x: 0, y: 7.75 }, { color: LADDER, width: 1.5 });

    // Lines of action and lever arms about the foot (labels placed with the others below).
    const lay = new LabelLayout(g);
    const seg = (p0: Vec2, p1: Vec2) => lay.seg(p0, p1);
    const yMg = -0.42;
    const yP = -0.88;
    const xW = A.x - 0.42;
    const ext = (p0: Vec2, p1: Vec2) => {
      g.line(p0, p1, { color: GHOST, width: 1, dash: [3, 3] });
      seg(p0, p1);
    };
    ext(C, { x: C.x, y: yMg - g.px(6) });
    ext(A, { x: A.x, y: yP - g.px(6) });
    if (p.M > 0) ext(Pp, { x: Pp.x, y: yP - g.px(6) });
    ext(T, { x: xW - g.px(6), y: T.y });
    dimH(g, lay, A.x, C.x, yMg, '(*L*/2) cos *θ*');
    if (p.M > 0) dimH(g, lay, A.x, Pp.x, yP, '*d* cos *θ*');
    dimV(g, lay, xW, 0, T.y, '*L* sin *θ*');
    seg({ x: -6.5, y: 0 }, { x: 0, y: 0 });
    seg({ x: 0, y: 0 }, { x: 0, y: 7.75 });

    // Critical state: the ladder at θc (same d).
    const thc = criticalAngle(q);
    let ghost: [Vec2, Vec2] | null = null;
    if (p.crit && thc > TH_MIN * DEG * 0.5 && thc < 89 * DEG && Math.abs(thc - q.theta) > 0.5 * DEG) {
      ghost = [{ x: -L * Math.cos(thc), y: 0 }, { x: 0, y: L * Math.sin(thc) }];
      g.line(ghost[0], ghost[1], { color: GHOST, width: 1.25, dash: [7, 5] });
      seg(ghost[0], ghost[1]);
    }

    drawLadder(g, A, u, n, LADDER);
    for (const side of [1, -1]) seg(add(A, n, side * 0.09), add(T, n, side * 0.09));
    g.arc(A, 30, 0, q.theta, { color: DIM, width: 1.25 });

    // Highest safe position of the person.
    let dcAt: Vec2 | null = null;
    if (p.crit && p.M > 0) {
      const dc = criticalPosition({ theta: q.theta, L, m: p.m, M: p.M, mu: p.mu });
      if (dc >= 0 && dc <= L) {
        dcAt = add(A, u, dc);
        g.line(add(dcAt, n, 0.24), add(dcAt, n, -0.24), { color: '#1a1a1a', width: 2 });
        seg(add(dcAt, n, 0.24), add(dcAt, n, -0.24));
      }
    }

    if (p.M > 0) for (const [p0, p1] of drawPerson(g, A, u, p.d)) seg(p0, p1);

    // Forces on the ladder at their points of application.
    const arrow = (from: Vec2, vec: Vec2, col: string) => {
      g.arrow(from, vec, { color: col, width: 2.5 });
      seg(from, add(from, vec));
    };
    const mgTip = add(C, { x: 0, y: -p.m * G * k });
    arrow(C, { x: 0, y: -p.m * G * k }, WEIGHT);
    const MgTail = add(Pp, { x: 0, y: p.M * G * k });
    // The person presses on the ladder at P: that arrow ends at its point of application.
    if (p.M > 0) arrow(MgTail, { x: 0, y: -p.M * G * k }, WEIGHT);
    const Ntip = add(A, { x: 0, y: e.N * k });
    arrow(A, { x: 0, y: e.N * k }, NORMAL);
    const Fwtip = add(T, { x: -e.Fw * k, y: 0 });
    arrow(T, { x: -e.Fw * k, y: 0 }, NORMAL);
    const fAct = Math.min(e.f, e.fmax);
    if (fAct * k > g.px(2)) arrow(A, { x: fAct * k, y: 0 }, FRICTION);
    if (e.slips) {
      // Friction needed beyond μs N: dashed, the part the floor cannot supply.
      const from = add(A, { x: fAct * k, y: 0 });
      g.line(from, add(A, { x: e.f * k, y: 0 }), { color: FRICTION, width: 1.75, dash: [4, 4] });
      seg(from, add(A, { x: e.f * k, y: 0 }));
    }
    drawGauge(g, lay, e.ratio);

    // Labels: each at the first candidate spot clear of the drawing and the labels before it.
    const at = (w: Vec2, offs: [number, number, Align][]) => {
      const [x, y] = lay.px(w);
      return offs.map(([dx, dy, align]) => ({ x: x + dx * theme.scale, y: y + dy * theme.scale, align }));
    };
    lay.place(at(Ntip, [[0, -12, 'center'], [-8, -4, 'right'], [8, -4, 'left']]), '*N*', NORMAL, 14);
    lay.place(at(Fwtip, [[-9, 0, 'right'], [0, -12, 'center'], [0, 13, 'center'], [-9, -12, 'right'], [-9, 12, 'right'], [24, -12, 'center'], [24, 13, 'center'], [-30, -12, 'right']]), '*F*_{w}', NORMAL, 14);
    const fMid = add(A, { x: Math.max(fAct * k, g.px(10)) / 2, y: 0 });
    lay.place(at(fMid, [[0, 13, 'center'], [0, -11, 'center'], [10, 13, 'center']]), '*f*', FRICTION, 14);
    lay.place(at(mgTip, [[7, -4, 'left'], [-7, -4, 'right'], [0, 12, 'center'], [7, 8, 'left'], [-7, 8, 'right'], [-16, 2, 'right'], [16, 2, 'left'], [0, 24, 'center']]), '*m**g*', WEIGHT, 14);
    if (p.M > 0) lay.place(at(MgTail, [[7, 4, 'left'], [0, -11, 'center'], [-7, 4, 'right'], [7, 16, 'left'], [-7, 16, 'right']]), '*M**g*', WEIGHT, 14);
    const mid = q.theta / 2;
    lay.place(
      [42, 52, 64].flatMap((r) => at(A, [[r * Math.cos(mid), -r * Math.sin(mid), 'center']])),
      '*θ*',
      DIM,
      13,
    );
    if (ghost) {
      const [g0, g1] = ghost;
      const nc = { x: -(g1.y - g0.y), y: g1.x - g0.x };
      const nl = Math.hypot(nc.x, nc.y);
      const cands = [0.62, 0.75, 0.5, 0.86, 0.38].flatMap((f) => {
        const q0 = { x: g0.x + (g1.x - g0.x) * f, y: g0.y + (g1.y - g0.y) * f };
        return [1, -1].flatMap((side) => at(q0, [[(side * 12 * nc.x) / nl, (-side * 12 * nc.y) / nl, side > 0 ? 'right' : 'left']]));
      });
      lay.place(cands, '*θ*_{c}', GHOST, 13);
    }
    if (dcAt) {
      const e0 = add(dcAt, n, -0.24);
      const e1 = add(dcAt, n, 0.24);
      lay.place([...at(e0, [[6, 6, 'left'], [6, -2, 'left'], [0, 12, 'center']]), ...at(e1, [[-6, -6, 'right'], [0, -11, 'center']])], '*d*_{c}', '#1a1a1a', 13);
    }
  },

  handles: [
    {
      // The person: dragged along the ladder.
      pos: (_s, p) => add(geo(p).Pp, { x: 0, y: 0.8 }),
      radiusPx: 20,
      when: (p) => p.M > 0,
      onDrag: (ctx, _s, w) => {
        const { A, u } = geo(ctx.params);
        const t = (w.x - A.x) * u.x + (w.y - 0.8 - A.y) * u.y;
        const d = Math.round(Math.min(L, Math.max(0, t)) / 0.05) * 0.05;
        const v = Number(d.toFixed(2));
        if (v !== ctx.params.d) ctx.set('d', v);
      },
    },
    {
      // The top: slides along the wall and sets the angle.
      pos: (_s, p) => geo(p).T,
      radiusPx: 16,
      onDrag: (ctx, _s, w) => {
        const sin = Math.min(Math.sin(TH_MAX * DEG), Math.max(Math.sin(TH_MIN * DEG), w.y / L));
        const th = Math.round(Math.asin(sin) / DEG);
        if (th !== ctx.params.theta) ctx.set('theta', th);
      },
    },
  ],

  readouts: [
    { label: 'F_w', unit: 'N', value: (_s, p) => equilibrium(input(p)).Fw },
    { label: 'f/\\mu_s N', unit: '%', value: (_s, p) => equilibrium(input(p)).ratio * 100 },
    { label: '\\theta_c', unit: '°', value: (_s, p) => criticalAngle(input(p)) / DEG },
  ],

  formula: (_s, p) => {
    const q = input(p);
    const e = equilibrium(q);
    const n = (v: number, sig = 3) => fmt(v, sig).replace('−', '-');
    const thc = criticalAngle(q);
    const lines = [
      `\\sum\\tau_\\text{foot}:\\ F_w L\\sin\\theta = mg\\tfrac{L}{2}\\cos\\theta + Mg\\,d\\cos\\theta`,
      `F_w = \\frac{(${n(p.m * G)})(${n(e.armMg)}) + (${n(p.M * G)})(${n(e.armPerson)})}{${n(e.armWall)}} = ${n(e.Fw)}\\ \\text{N}`,
      `N = (m+M)g = (${n(p.m + p.M)})(9.8) = ${n(e.N)}\\ \\text{N}`,
      `f = F_w = ${n(e.f)}\\ \\text{N} ${e.slips ? '>' : '\\le'} \\mu_s N = ${n(e.fmax)}\\ \\text{N}`,
      `\\tan\\theta_c = \\frac{m/2 + Md/L}{\\mu_s(m+M)} = \\frac{${n(p.m / 2 + (p.M * p.d) / L)}}{${n(p.mu * (p.m + p.M))}},\\ \\theta_c = ${n(thc / DEG)}^\\circ`,
    ];
    return lines;
  },

  info: {
    goals: ['ladder.goal.cond', 'ladder.goal.pivot', 'ladder.goal.limit'],
    observe: ['ladder.obs.drag', 'ladder.obs.climb', 'ladder.obs.angle', 'ladder.obs.crit', 'ladder.obs.slip', 'ladder.obs.arms'],
    equations: [
      '\\textstyle\\sum F_x = f - F_w = 0, \\quad \\sum F_y = N - (m+M)g = 0',
      '\\textstyle\\sum\\tau_\\text{foot} = F_w L\\sin\\theta - mg\\,\\tfrac{L}{2}\\cos\\theta - Mg\\,d\\cos\\theta = 0',
      'f \\le \\mu_s N \\iff \\tan\\theta \\ge \\frac{m/2 + Md/L}{\\mu_s(m+M)} = \\tan\\theta_c',
    ],
    assumptions: ['ladder.asm.wall', 'ladder.asm.body', 'ladder.asm.slip', 'ladder.asm.scale'],
  },
};
