// Ch 10 scene: the same torque spins up two rotors whose masses sit at different distances
// from the axis. I = Σ m r², so doubling r makes I four times larger and α four times smaller.
import { fmt } from '../../core/format';
import type { ParamSchema, Scene, Vec2 } from '../../core/types';
import type { Draw } from '../../draw/draw';
import { ROLE_COLOR } from '../../draw/theme';
import { pointInertia, spinUp } from './physics';

type P = { rA: number; rB: number; m: number; tau: number };

const ROD = 1.05; // half-length of the light rod [m]
const CX = 1.45; // rotor centres at x = ∓CX
const BAR_Y = -1.65; // inertia bars
const CA = ROLE_COLOR.position;
const CB = ROLE_COLOR.energyU;
const GREY = '#9a9a9a';
const LABEL = '#6b6b6b';

const params: ParamSchema<P> = {
  rA: { kind: 'number', label: 'ch10.p.rA', desc: 'ch10.d.rA', group: 'main', live: false, control: 'select', choices: [0.25, 0.5, 0.75, 1], default: 0.5, unit: 'm' },
  rB: { kind: 'number', label: 'ch10.p.rB', desc: 'ch10.d.rB', group: 'main', live: false, control: 'select', choices: [0.25, 0.5, 0.75, 1], default: 1, unit: 'm' },
  m: { kind: 'number', label: 'ch10.p.m', desc: 'ch10.d.m', group: 'advanced', live: false, control: 'select', choices: [0.5, 1, 2], default: 1, unit: 'kg' },
  tau: { kind: 'number', label: 'ch10.p.tau', desc: 'ch10.d.tau', group: 'advanced', live: false, control: 'select', choices: [0.25, 0.5, 1], default: 0.5, unit: 'N·m' },
};

/** Run length: 6 s, shorter if the faster rotor would pass 15 rad/s. */
export const runTime = (p: P) => Math.min(6, 15 / (p.tau / inertia(p.m, Math.min(p.rA, p.rB))));

/** Two equal masses at ±r. */
const inertia = (m: number, r: number) =>
  pointInertia([
    { m, r },
    { m, r },
  ]);

function rotor(g: Draw, c: Vec2, theta: number, r: number, m: number, color: string, name: string): void {
  const u = { x: Math.cos(theta), y: Math.sin(theta) };
  const at = (s: number): Vec2 => ({ x: c.x + u.x * s, y: c.y + u.y * s });
  g.line(at(-ROD), at(ROD), { color: '#c4c4c4', width: 3 });
  for (const s of [-1, -0.75, -0.5, -0.25, 0.25, 0.5, 0.75, 1]) {
    const q = at(s);
    const n = { x: -u.y * g.px(3), y: u.x * g.px(3) };
    g.line({ x: q.x - n.x, y: q.y - n.y }, { x: q.x + n.x, y: q.y + n.y }, { color: GREY, width: 1 });
  }
  const rad = 9 * Math.cbrt(m);
  g.circle(at(-r), rad, { fill: color });
  g.circle(at(r), rad, { fill: color });
  g.circle(c, 5, { fill: '#ffffff', color: '#1a1a1a', width: 1.5 });
  g.circle(c, 1.5, { fill: '#1a1a1a' });
  g.text({ x: c.x, y: c.y + ROD }, name, { size: 15, color, align: 'center', dy: -14, weight: 600 });
}

/** Counter-clockwise torque symbol around the axis. */
function torque(g: Draw, c: Vec2): void {
  const r = 24;
  const a0 = -0.35 * Math.PI;
  const a1 = 0.55 * Math.PI;
  g.arc(c, r, a0, a1, { role: 'force', width: 2 });
  const R = g.px(r);
  const tip = { x: c.x + R * Math.cos(a1), y: c.y + R * Math.sin(a1) };
  const tan = { x: -Math.sin(a1) * g.px(7), y: Math.cos(a1) * g.px(7) };
  g.arrow({ x: tip.x - tan.x, y: tip.y - tan.y }, tan, { role: 'force', width: 2 });
  g.text({ x: c.x + R * Math.cos(a0), y: c.y + R * Math.sin(a0) }, '*τ*', { size: 14, role: 'force', align: 'left', baseline: 'middle', dx: 6, dy: 4 });
}

/** I = m r² + m r² as a two-segment bar, labelled with its total. ki: world m per kg·m². */
function inertiaBar(g: Draw, x0: number, m: number, r: number, ki: number, color: string, sym: string): void {
  const seg = m * r * r * ki;
  const h = g.px(14);
  for (let i = 0; i < 2; i++) {
    const xa = x0 + i * seg;
    g.polygon(
      [
        { x: xa, y: BAR_Y },
        { x: xa + seg, y: BAR_Y },
        { x: xa + seg, y: BAR_Y + h },
        { x: xa, y: BAR_Y + h },
      ],
      { fill: color, fillAlpha: i ? 0.55 : 0.85, color: '#ffffff', width: 1 },
    );
  }
  g.text({ x: x0, y: BAR_Y + h }, `${sym} = ${fmt(2 * m * r * r)} kg·m²`, { size: 13, color, align: 'left', dy: -7 });
}

export const rotorScene: Scene<P, { t: number; n: number }> = {
  id: 'rotor',
  title: 'ch10.r.scene',
  params,
  time: { h: 1 / 240, recordEvery: 2, frameStep: 0.05, tEnd: (p) => runTime(p as P) },
  world: () => ({ x: [-CX - 1.3, CX + 1.3], y: [BAR_Y - 0.25, ROD + 0.45], aspect: 'contain', padPx: 16 }),
  init: () => ({ t: 0, n: 0 }),
  step: (s, _h, p) => {
    s.n += 1;
    s.t = Math.min(s.n / 240, runTime(p));
  },
  record: (s, p) => {
    const a = spinUp(p.tau, inertia(p.m, p.rA), s.t);
    const b = spinUp(p.tau, inertia(p.m, p.rB), s.t);
    return { t: s.t, wA: a.omega, wB: b.omega, thA: a.theta, thB: b.theta };
  },
  snapshot: (s) => ({ ...s }),

  draw: (g, s, p) => {
    const IA = inertia(p.m, p.rA);
    const IB = inertia(p.m, p.rB);
    const A: Vec2 = { x: -CX, y: 0 };
    const B: Vec2 = { x: CX, y: 0 };
    rotor(g, A, spinUp(p.tau, IA, s.t).theta, p.rA, p.m, CA, 'A');
    rotor(g, B, spinUp(p.tau, IB, s.t).theta, p.rB, p.m, CB, 'B');
    torque(g, A);
    torque(g, B);
    // The larger I spans the rod; the other bar is to the same scale.
    const ki = (2 * ROD) / Math.max(IA, IB);
    inertiaBar(g, A.x - ROD, p.m, p.rA, ki, CA, '*I*_{A}');
    inertiaBar(g, B.x - ROD, p.m, p.rB, ki, CB, '*I*_{B}');
    g.line({ x: A.x - ROD, y: BAR_Y - g.px(4) }, { x: A.x - ROD, y: BAR_Y + g.px(18) }, { color: LABEL, width: 1 });
    g.line({ x: B.x - ROD, y: BAR_Y - g.px(4) }, { x: B.x - ROD, y: BAR_Y + g.px(18) }, { color: LABEL, width: 1 });
  },

  plots: [
    {
      id: 'w',
      label: `\\textcolor{${CA}}{\\omega_A},\\ \\textcolor{${CB}}{\\omega_B}\\,(\\mathrm{rad/s})`,
      traces: [
        { channel: 'wA', role: 'position' },
        { channel: 'wB', role: 'energyU' },
      ],
      yRange: (p) => {
        const top = (p.tau / inertia(p.m, Math.min(p.rA, p.rB))) * runTime(p);
        return [-0.05 * top, 1.1 * top];
      },
    },
    {
      id: 'th',
      label: `\\textcolor{${CA}}{\\theta_A},\\ \\textcolor{${CB}}{\\theta_B}\\,(\\mathrm{rad})`,
      traces: [
        { channel: 'thA', role: 'position' },
        { channel: 'thB', role: 'energyU' },
      ],
      yRange: (p) => {
        const top = 0.5 * (p.tau / inertia(p.m, Math.min(p.rA, p.rB))) * runTime(p) ** 2;
        return [-0.05 * top, 1.1 * top];
      },
    },
  ],

  readouts: [
    { label: '\\alpha_A', unit: 'rad/s²', value: (_s, p) => p.tau / inertia(p.m, p.rA) },
    { label: '\\alpha_B', unit: 'rad/s²', value: (_s, p) => p.tau / inertia(p.m, p.rB) },
  ],

  info: {
    goals: ['ch10.r.goal.I', 'ch10.r.goal.alpha'],
    observe: ['ch10.r.obs.four', 'ch10.r.obs.slope', 'ch10.r.obs.same', 'ch10.r.obs.mass'],
    equations: ['I = \\sum_i m_i r_i^2', '\\alpha = \\frac{\\tau}{I}, \\quad \\omega = \\alpha t, \\quad \\theta = \\tfrac{1}{2}\\alpha t^2'],
    assumptions: ['ch10.r.assume'],
  },
};
