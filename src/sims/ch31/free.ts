// Ch 31 scene: free LC / RLC oscillation. Energy moves between the capacitor (electric) and
// the inductor (magnetic); a block on a spring moving with x ∝ q shows the mechanical analogue.
import type { ParamSchema, Scene, Vec2 } from '../../core/types';
import type { Draw } from '../../draw/draw';
import { ROLE_COLOR } from '../../draw/theme';
import { energies, freeAt, omega0, type RLC } from './physics';

type P = { R: number; L: number; C: number; spring: boolean };

interface S {
  t: number;
  n: number;
}

const RATE = 240;
const V0 = 10; // initial capacitor voltage [V]
const WIRE = '#3a3a3a';
const MUTED = '#9a9a9a';

const rlcOf = (p: P): RLC => ({ R: p.R, L: p.L * 1e-3, C: p.C * 1e-6 });
const q0Of = (p: P) => p.C * 1e-6 * V0;
/** State at sim time t [ms]. */
const at = (p: P, tMs: number) => freeAt(rlcOf(p), q0Of(p), tMs * 1e-3);

const params: ParamSchema<P> = {
  R: {
    kind: 'number',
    label: 'ch31.f.p.R',
    desc: 'ch31.f.d.R',
    group: 'main',
    live: false,
    control: 'select',
    choices: [0, 5, 20, 100],
    default: 0,
    unit: 'Ω',
  },
  L: {
    kind: 'number',
    label: 'ch31.p.L',
    desc: 'ch31.d.L',
    group: 'advanced',
    live: false,
    control: 'select',
    choices: [5, 10, 20],
    default: 10,
    unit: 'mH',
  },
  C: {
    kind: 'number',
    label: 'ch31.p.C',
    desc: 'ch31.d.C',
    group: 'advanced',
    live: false,
    control: 'select',
    choices: [5, 10, 20],
    default: 10,
    unit: 'μF',
  },
  spring: { kind: 'toggle', label: 'ch31.f.p.spring', desc: 'ch31.f.d.spring', group: 'advanced', live: true, default: true },
};

/** Panel: LC circuit ↔ block on a spring (Ch 15). */
export function analogyPanel(): string {
  const E = (x: string) => `\\textcolor{${ROLE_COLOR.energyU}}{${x}}`;
  const B = (x: string) => `\\textcolor{${ROLE_COLOR.energyK}}{${x}}`;
  const rows = [
    ['q', 'x'],
    ['i', 'v'],
    ['L', 'm'],
    ['1/C', 'k'],
    ['R', 'b'],
    [E('q^2/2C'), E('kx^2/2')],
    [B('Li^2/2'), B('mv^2/2')],
  ];
  return `\\begin{array}{rcl} ${rows.map(([a, b]) => `${a} & \\leftrightarrow & ${b}`).join(' \\\\ ')} \\end{array}`;
}

// ------------------------------------------------------------------ drawing

const X0 = 5;
const X1 = 9.6;
const Y0 = 4.6;
const Y1 = 8;
const YC = (Y0 + Y1) / 2;
const CAP_T = YC + 0.22;
const CAP_B = YC - 0.22;
const COIL0 = YC - 0.9;
const COIL1 = YC + 0.9;

const loopPath = (() => {
  const pts: Vec2[] = [
    { x: X0, y: CAP_B },
    { x: X0, y: Y0 },
    { x: X1, y: Y0 },
    { x: X1, y: Y1 },
    { x: X0, y: Y1 },
    { x: X0, y: CAP_T },
  ];
  const len = [0];
  for (let i = 1; i < pts.length; i++) len.push(len[i - 1] + Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y));
  return { pts, len, total: len[len.length - 1] };
})();

function pointAt(d: number): Vec2 {
  const { pts, len } = loopPath;
  let i = 1;
  while (i < len.length - 1 && len[i] < d) i++;
  const f = (d - len[i - 1]) / (len[i] - len[i - 1] || 1);
  return { x: pts[i - 1].x + (pts[i].x - pts[i - 1].x) * f, y: pts[i - 1].y + (pts[i].y - pts[i - 1].y) * f };
}

function circuit(g: Draw, p: P, q: number): void {
  const w = { color: WIRE, width: 1.75 };
  g.polyline([{ x: X0, y: CAP_B }, { x: X0, y: Y0 }, { x: X1, y: Y0 }, { x: X1, y: COIL0 }], w);
  g.polyline([{ x: X1, y: COIL1 }, { x: X1, y: Y1 }, { x: X0, y: Y1 }, { x: X0, y: CAP_T }], w);
  // Capacitor.
  g.line({ x: X0 - 0.55, y: CAP_T }, { x: X0 + 0.55, y: CAP_T }, { color: WIRE, width: 3 });
  g.line({ x: X0 - 0.55, y: CAP_B }, { x: X0 + 0.55, y: CAP_B }, { color: WIRE, width: 3 });
  // Inductor: four loops along the right side.
  const coil: Vec2[] = [];
  const turns = 4;
  for (let k = 0; k <= 120; k++) {
    const u = k / 120;
    const a = u * turns * 2 * Math.PI;
    coil.push({ x: X1 + 0.25 * (1 - Math.cos(a)), y: COIL0 + (COIL1 - COIL0) * u - 0.16 * Math.sin(a) });
  }
  g.polyline(coil, { color: WIRE, width: 1.75 });
  // Resistor on the top wire when R > 0.
  if (p.R > 0) {
    const xa = (X0 + X1) / 2 - 0.8;
    const xb = (X0 + X1) / 2 + 0.8;
    g.line({ x: xa, y: Y1 }, { x: xb, y: Y1 }, { color: '#ffffff', width: 3 });
    const zz: Vec2[] = [{ x: xa, y: Y1 }];
    for (let i = 0; i < 6; i++) zz.push({ x: xa + ((i + 0.5) * (xb - xa)) / 6, y: Y1 + (i % 2 ? -0.22 : 0.22) });
    zz.push({ x: xb, y: Y1 });
    g.polyline(zz, { color: WIRE, width: 1.75 });
    g.text({ x: (xa + xb) / 2, y: Y1 }, '*R*', { size: 15, color: WIRE, align: 'center', dy: -20 });
  }
  const lbl = { size: 15, color: WIRE, baseline: 'middle' as const };
  g.text({ x: X0 - 0.55, y: YC }, '*C*', { ...lbl, align: 'right', dx: -8 });
  g.text({ x: X1 + 0.5, y: YC }, '*L*', { ...lbl, align: 'left', dx: 10 });

  // Plate charges.
  const q0 = q0Of(p);
  const n = Math.round((5 * Math.abs(q)) / q0);
  const top = q >= 0 ? 1 : -1;
  for (let k = 0; k < n; k++) {
    const x = X0 - 0.5 + ((k + 0.5) * 1.0) / n;
    for (const [y, sgn] of [
      [CAP_T + g.px(9), top],
      [CAP_B - g.px(9), -top],
    ] as const) {
      g.circle({ x, y }, 5.5, { fill: sgn > 0 ? 'positive' : 'negative' });
      g.text({ x, y }, sgn > 0 ? '+' : '−', { size: 11, color: '#ffffff', align: 'center', baseline: 'middle', weight: 700, dy: 0.5 });
    }
  }
}

function bars(g: Draw, UE: number, UB: number, U0: number): void {
  const H = Y1 - Y0;
  const base = Y0;
  const wBar = 0.5;
  const items: [number, number, 'energyU' | 'energyK' | 'energyE', string][] = [
    [11.0, UE, 'energyU', '*U*_{E}'],
    [11.75, UB, 'energyK', '*U*_{B}'],
    [12.5, UE + UB, 'energyE', '*U*'],
  ];
  for (const [x, u, role, label] of items) {
    const h = (u / U0) * H;
    g.polygon(
      [
        { x: x - wBar / 2, y: base },
        { x: x + wBar / 2, y: base },
        { x: x + wBar / 2, y: base + h },
        { x: x - wBar / 2, y: base + h },
      ],
      { fill: role },
    );
    g.text({ x, y: base }, label, { size: 13, role, align: 'center', dy: 18 });
  }
  g.line({ x: 10.55, y: base }, { x: 12.95, y: base }, { role: 'axis', width: 1.25 });
}

function spring(g: Draw, x: number, v: number): void {
  const y = 1.6;
  const wall = 0.8;
  const floor = 1.0;
  g.line({ x: wall, y: floor }, { x: 12.95, y: floor }, { color: MUTED, width: 1.5 });
  g.line({ x: wall, y: floor }, { x: wall, y: 2.4 }, { color: MUTED, width: 2 });
  for (let k = 0; k < 5; k++) g.line({ x: wall, y: floor + 0.25 + k * 0.28 }, { x: wall - 0.22, y: floor + 0.05 + k * 0.28 }, { color: MUTED, width: 1 });
  const xm = 7 + x;
  const coils = 12;
  const pts: Vec2[] = [{ x: wall, y }];
  const x0 = wall + 0.3;
  const x1 = xm - 0.5 - 0.3;
  pts.push({ x: x0, y });
  for (let k = 0; k < coils; k++) pts.push({ x: x0 + ((k + 0.5) * (x1 - x0)) / coils, y: y + (k % 2 ? -0.22 : 0.22) });
  pts.push({ x: x1, y }, { x: xm - 0.5, y });
  g.polyline(pts, { color: WIRE, width: 1.5 });
  g.line({ x: 7, y: floor - 0.15 }, { x: 7, y: 2.6 }, { color: MUTED, width: 1, dash: [3, 4] });
  g.polygon(
    [
      { x: xm - 0.5, y: floor },
      { x: xm + 0.5, y: floor },
      { x: xm + 0.5, y: floor + 1.2 },
      { x: xm - 0.5, y: floor + 1.2 },
    ],
    { fill: 'position', fillAlpha: 0.85 },
  );
  g.text({ x: xm, y: floor + 0.6 }, '*m*', { size: 14, color: '#ffffff', align: 'center', baseline: 'middle' });
  if (Math.abs(v) > 0.02) g.arrow({ x: xm, y: floor + 1.45 }, { x: v * 1.4, y: 0 }, { role: 'velocity', width: 2.25, label: '*v*' });
}

export const freeScene: Scene<P, S> = {
  id: 'free',
  title: 'ch31.f.scene',
  params,
  time: { h: 1 / RATE, recordEvery: 2, frameStep: 0.05, window: 10, unit: 'ms' },
  world: (p) => ({ x: [0.2, 13.2], y: [p.spring ? 0.6 : 3.6, 8.6], aspect: 'contain', padPx: 16 }),

  init: () => ({ t: 0, n: 0 }),
  step: (s, h) => {
    s.n += 1;
    s.t = s.n * h; // 1 ms of circuit time per wall second at 1×
  },
  record: (s, p) => {
    const k = at(p, s.t);
    const e = energies(rlcOf(p), k.q, k.i);
    return { t: s.t, q: k.q * 1e6, i: k.i * 1e3, UE: e.UE * 1e6, UB: e.UB * 1e6, U: (e.UE + e.UB) * 1e6 };
  },
  snapshot: (s) => ({ ...s }),

  draw: (g, s, p) => {
    const c = rlcOf(p);
    const q0 = q0Of(p);
    const k = at(p, s.t);
    const e = energies(c, k.q, k.i);
    const U0 = (q0 * q0) / (2 * c.C);
    circuit(g, p, k.q);
    // Dots: conventional current around the loop; displacement follows q.
    const gapD = 0.45;
    const shift = (k.q / q0) * 1.6;
    for (let d = (((shift % gapD) + gapD) % gapD) + 0.05; d < loopPath.total - 0.05; d += gapD) {
      const pt = pointAt(d);
      if (pt.x > X1 - 0.05 && pt.y > COIL0 && pt.y < COIL1) continue;
      g.circle(pt, 2.6, { fill: 'positive', alpha: 0.75 });
    }
    bars(g, e.UE, e.UB, U0);
    if (p.spring) spring(g, (k.q / q0) * 2.4, k.i / (q0 * omega0(c)));
  },

  overlay: () => analogyPanel(),

  plots: [
    {
      id: 'q',
      label: 'q\\,(\\mu\\mathrm{C})',
      traces: [{ channel: 'q', role: 'position' }],
      yRange: (p) => [-1.15 * q0Of(p) * 1e6, 1.15 * q0Of(p) * 1e6],
    },
    {
      id: 'i',
      label: 'i\\,(\\mathrm{mA})',
      traces: [{ channel: 'i', role: 'velocity' }],
      yRange: (p) => {
        const m = q0Of(p) * omega0(rlcOf(p)) * 1e3 * 1.15;
        return [-m, m];
      },
    },
    {
      id: 'U',
      label: `\\textcolor{${ROLE_COLOR.energyU}}{U_E}\\;\\textcolor{${ROLE_COLOR.energyK}}{U_B}\\;U\\,(\\mu\\mathrm{J})`,
      traces: [
        { channel: 'UE', role: 'energyU' },
        { channel: 'UB', role: 'energyK' },
        { channel: 'U', role: 'energyE' },
      ],
      yRange: (p) => {
        const U0 = (q0Of(p) ** 2 / (2 * p.C * 1e-6)) * 1e6;
        return [-0.08 * U0, 1.12 * U0];
      },
    },
  ],

  readouts: [
    { label: 'T', unit: 'ms', value: (_s, p) => ((2 * Math.PI) / omega0(rlcOf(p))) * 1e3 },
    {
      label: 'U',
      unit: 'μJ',
      value: (s, p) => {
        const k = at(p, s.t);
        const e = energies(rlcOf(p), k.q, k.i);
        return (e.UE + e.UB) * 1e6;
      },
    },
  ],

  info: {
    goals: ['ch31.f.goal.exchange', 'ch31.f.goal.damp'],
    observe: ['ch31.f.obs.exchange', 'ch31.f.obs.phase', 'ch31.f.obs.spring', 'ch31.f.obs.damp', 'ch31.f.obs.over'],
    equations: [
      'L\\frac{d^2q}{dt^2} + R\\frac{dq}{dt} + \\frac{q}{C} = 0',
      '\\omega_0 = \\frac{1}{\\sqrt{LC}}, \\quad q = Q e^{-Rt/2L}\\cos(\\omega\' t + \\phi)',
      'U = \\frac{q^2}{2C} + \\frac{1}{2}Li^2',
    ],
    assumptions: ['ch31.f.assume'],
  },
};
