// Ch 31 scene: series RLC driven by ε = εm sin(ωd t), steady state. v_R is in phase with i,
// v_L = L di/dt leads by 90° (slope of i), v_C = q/C lags by 90° (area under i).
// Stage: rotating phasors (projections = instantaneous values) and the resonance curve.
import { fmtTick, niceTicks } from '../../core/format';
import type { Overlay, ParamSchema, Role, Scene, Vec2 } from '../../core/types';
import type { Draw } from '../../draw/draw';
import { ROLE_COLOR } from '../../draw/theme';
import { acAt, currentAmp, impedance, omega0, phase, reactanceC, reactanceL, type Drive, type RLC } from './physics';

type P = { ratio: number; mode: string; R: number };

interface S {
  t: number;
  n: number;
}

const L_H = 10e-3;
const C_F = 10e-6;
const EM = 10; // peak emf [V]
const CYCLES = 3; // driving periods per run
const WALL_PER_CYCLE = 2.5; // wall seconds per driving period at 1×
const TICK = '#6b6b6b';
const DEG = 180 / Math.PI;

const rlcOf = (p: P): RLC => ({ R: p.R, L: L_H, C: C_F });
const W0 = omega0({ R: 0, L: L_H, C: C_F });
const driveOf = (p: P): Drive => ({ em: EM, wd: p.ratio * W0 });
/** Driving period [ms]. */
const periodMs = (p: P) => ((2 * Math.PI) / driveOf(p).wd) * 1e3;
const stateAt = (p: P, tMs: number) => acAt(rlcOf(p), driveOf(p), tMs * 1e-3);

/** Voltage amplitudes [V]. */
function amps(p: P) {
  const c = rlcOf(p);
  const wd = driveOf(p).wd;
  const I = currentAmp(c, driveOf(p));
  return { I, VR: I * c.R, VL: I * reactanceL(c, wd), VC: I * reactanceC(c, wd) };
}

const params: ParamSchema<P> = {
  ratio: {
    kind: 'number',
    label: 'ch31.a.p.ratio',
    desc: 'ch31.a.d.ratio',
    group: 'main',
    live: false,
    control: 'slider',
    min: 0.3,
    max: 2.5,
    step: 0.01,
    default: 0.8,
  },
  mode: {
    kind: 'select',
    label: 'ch31.a.p.mode',
    desc: 'ch31.a.d.mode',
    group: 'main',
    live: true,
    default: 'slope',
    options: [
      { value: 'none', label: 'ch31.a.mode.none' },
      { value: 'slope', label: 'ch31.a.mode.slope' },
      { value: 'area', label: 'ch31.a.mode.area' },
    ],
  },
  R: {
    kind: 'number',
    label: 'ch31.a.p.R',
    desc: 'ch31.a.d.R',
    group: 'advanced',
    live: false,
    control: 'slider',
    min: 10,
    max: 50,
    step: 1,
    default: 20,
    unit: 'Ω',
  },
};

// ------------------------------------------------------------------ phasors

const PC: Vec2 = { x: 4, y: 4.2 };
const PR = 3.2;

function phasors(g: Draw, p: P, tMs: number): void {
  const a = amps(p);
  const wd = driveOf(p).wd;
  const th = wd * tMs * 1e-3;
  const phi = phase(rlcOf(p), wd);
  const k = PR / Math.max(EM, a.VR, a.VL, a.VC);
  const guide = { color: '#d6d6d6', width: 1 };
  g.line({ x: PC.x - PR - 0.3, y: PC.y }, { x: PC.x + PR + 0.3, y: PC.y }, guide);
  g.line({ x: PC.x, y: PC.y - PR - 0.3 }, { x: PC.x, y: PC.y + PR + 0.3 }, { color: '#9a9a9a', width: 1.25 });

  // ℰ first (thickest), so V_R stays visible on top of it at resonance.
  const list: [number, number, Role | string, string, number][] = [
    [EM, th, 'fg', '*ℰ*', 3],
    [a.VR, th - phi, 'force', '*V*_{R}', 2],
    [a.VL, th - phi + Math.PI / 2, 'acceleration', '*V*_{L}', 2.25],
    [a.VC, th - phi - Math.PI / 2, 'position', '*V*_{C}', 2.25],
  ];
  // Labels avoid every arrow, projection line, the axes and each other: each label takes the
  // first candidate spot (beyond the tip, then sideways, then further out) with enough room.
  type Seg = [Vec2, Vec2];
  const segs: Seg[] = [
    [{ x: PC.x - PR - 0.3, y: PC.y }, { x: PC.x + PR + 0.3, y: PC.y }],
    [{ x: PC.x, y: PC.y - PR - 0.3 }, { x: PC.x, y: PC.y + PR + 0.3 }],
  ];
  const placed: Vec2[] = [];
  const segDist = (q: Vec2, [a, b]: Seg) => {
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const l2 = dx * dx + dy * dy;
    const u = l2 > 0 ? Math.max(0, Math.min(1, ((q.x - a.x) * dx + (q.y - a.y) * dy) / l2)) : 0;
    return Math.hypot(a.x + u * dx - q.x, a.y + u * dy - q.y);
  };
  /** Free room around q [px]: distance to the nearest line, or to a placed label minus its size. */
  const room = (q: Vec2) => {
    let r = Infinity;
    for (const sg of segs) r = Math.min(r, segDist(q, sg));
    for (const o of placed) r = Math.min(r, Math.hypot(o.x - q.x, o.y - q.y) - g.px(14));
    return r / g.px(1);
  };
  const place = (tip: Vec2, d: Vec2): Vec2 => {
    let best = tip;
    let bestRoom = -Infinity;
    for (const out of [15, 26, 38]) {
      for (const side of [0, 1, -1, 1.8, -1.8]) {
        const q = { x: tip.x + d.x * g.px(out) - d.y * g.px(16 * side), y: tip.y + d.y * g.px(out) + d.x * g.px(16 * side) };
        const r = room(q);
        if (r >= 11) return q;
        if (r > bestRoom) {
          bestRoom = r;
          best = q;
        }
      }
    }
    return best;
  };

  const vecs = list.map(([amp, ang]) => ({ x: amp * k * Math.cos(ang), y: amp * k * Math.sin(ang) }));
  // Current phasor: direction only (separate scale), drawn thin along V_R.
  const iLen = 0.42 * PR;
  const u = { x: Math.cos(th - phi), y: Math.sin(th - phi) };
  const iTip = { x: PC.x + u.x * iLen, y: PC.y + u.y * iLen };
  vecs.forEach((v) => {
    segs.push([PC, { x: PC.x + v.x, y: PC.y + v.y }], [{ x: PC.x + v.x, y: PC.y + v.y }, { x: PC.x, y: PC.y + v.y }]);
  });
  segs.push([PC, iTip]);

  list.forEach(([, , role, , w], n) => {
    const v = vecs[n];
    g.arrow(PC, v, { color: role, width: w });
    // Projection on the vertical axis = instantaneous value.
    g.line({ x: PC.x + v.x, y: PC.y + v.y }, { x: PC.x, y: PC.y + v.y }, { color: role, width: 1, dash: [2, 3], alpha: 0.6 });
    g.circle({ x: PC.x, y: PC.y + v.y }, 3.5, { fill: role });
  });
  g.arrow(PC, { x: u.x * iLen, y: u.y * iLen }, { role: 'velocity', width: 1.75 });

  // Labels last, in order of importance; the longest phasors first get the spot beyond the tip.
  const order = list.map((_, n) => n).sort((a, b) => Math.hypot(vecs[b].x, vecs[b].y) - Math.hypot(vecs[a].x, vecs[a].y));
  for (const n of order) {
    const [, ang, role, label] = list[n];
    const v = vecs[n];
    const at = place({ x: PC.x + v.x, y: PC.y + v.y }, { x: Math.cos(ang), y: Math.sin(ang) });
    placed.push(at);
    g.text(at, label, { size: 14, color: role, align: 'center', baseline: 'middle' });
  }
  const iAt = place(iTip, u);
  placed.push(iAt);
  g.text(iAt, '*I*', { size: 14, role: 'velocity', align: 'center', baseline: 'middle' });
}

// ------------------------------------------------------------------ resonance curve

const RC = { x0: 9.6, x1: 15.6, y0: 1.4, y1: 7.0, wMax: 2.5 };

function resonance(g: Draw, p: P): void {
  const c = rlcOf(p);
  const iMax = (EM / c.R) * 1e3 * 1.08;
  const X = (r: number) => RC.x0 + (r / RC.wMax) * (RC.x1 - RC.x0);
  const Y = (i: number) => RC.y0 + (i / iMax) * (RC.y1 - RC.y0);
  const axis = { role: 'axis' as const, width: 1.25 };
  g.line({ x: X(0), y: Y(0) }, { x: X(RC.wMax), y: Y(0) }, axis);
  g.line({ x: X(0), y: Y(0) }, { x: X(0), y: Y(iMax) }, axis);
  for (const r of [0.5, 1, 1.5, 2, 2.5]) {
    g.line({ x: X(r), y: Y(0) }, { x: X(r), y: Y(0) - g.px(4) }, { role: 'axis', width: 1 });
    g.text({ x: X(r), y: Y(0) }, fmtTick(r), { size: 11, color: TICK, align: 'center', dy: 16 });
  }
  for (const i of niceTicks(0, iMax, 4)) {
    if (i === 0) continue;
    g.line({ x: X(0), y: Y(i) }, { x: X(0) - g.px(4), y: Y(i) }, { role: 'axis', width: 1 });
    g.text({ x: X(0), y: Y(i) }, fmtTick(i), { size: 11, color: TICK, align: 'right', baseline: 'middle', dx: -7 });
  }
  g.text({ x: X(RC.wMax), y: Y(0) }, '*ω*_{d} / *ω*_{0}', { size: 12, color: TICK, align: 'right', dy: 32 });
  g.text({ x: X(0), y: Y(iMax) }, '*I* (mA)', { size: 12, color: TICK, align: 'left', dx: 8, dy: 4 });
  g.line({ x: X(1), y: Y(0) }, { x: X(1), y: Y(iMax) }, { color: '#c4c4c4', width: 1, dash: [4, 4] });

  const pts: Vec2[] = [];
  for (let k = 1; k <= 200; k++) {
    const r = (k / 200) * RC.wMax;
    pts.push({ x: X(r), y: Y((EM / impedance(c, r * W0)) * 1e3) });
  }
  g.polyline(pts, { role: 'velocity', width: 2 });
  g.circle({ x: X(p.ratio), y: Y(amps(p).I * 1e3) }, 5.5, { fill: 'velocity', color: '#ffffff', width: 1.5 });
}

// ------------------------------------------------------------------ scene

function overlays(p: P): Overlay[] {
  if (p.mode === 'slope') {
    return [{ kind: 'tangent', channel: 'i', slopeChannel: 'didt', role: 'acceleration', unit: 'A/s', target: { plot: 'v', channel: 'vL' } }];
  }
  if (p.mode === 'area') {
    return [
      {
        kind: 'area',
        channel: 'i',
        role: 'position',
        unit: 'μC',
        symbol: 'Δ*q*',
        area: (pp, t0, t1) => (stateAt(pp as P, t1).q - stateAt(pp as P, t0).q) * 1e6,
        target: { plot: 'v', channel: 'vC' },
      },
    ];
  }
  return [];
}

const vLabel =
  `\\textcolor{${ROLE_COLOR.force}}{v_R}\\;\\textcolor{${ROLE_COLOR.acceleration}}{v_L}\\;` + `\\textcolor{${ROLE_COLOR.position}}{v_C}\\,(\\mathrm{V})`;

export const acScene: Scene<P, S> = {
  id: 'ac',
  title: 'ch31.a.scene',
  params,
  time: { h: 1 / 240, recordEvery: 1, frameStep: 0.05, unit: 'ms', tEnd: (p) => CYCLES * periodMs(p as P) },
  world: () => ({ x: [0.3, 16.2], y: [0.4, 7.8], aspect: 'contain', padPx: 14 }),

  init: () => ({ t: 0, n: 0 }),
  step: (s, h, p) => {
    s.n += 1;
    s.t = Math.min((s.n * h * periodMs(p)) / WALL_PER_CYCLE, CYCLES * periodMs(p));
  },
  record: (s, p) => {
    const k = stateAt(p, s.t);
    // i in mA and t in ms: di/dt in mA/ms equals A/s.
    return { t: s.t, i: k.i * 1e3, didt: k.didt, vR: k.vR, vL: k.vL, vC: k.vC };
  },
  snapshot: (s) => ({ ...s }),

  draw: (g, s, p) => {
    phasors(g, p, s.t);
    resonance(g, p);
  },

  plots: [
    {
      id: 'i',
      label: 'i\\,(\\mathrm{mA})',
      traces: [{ channel: 'i', role: 'velocity' }],
      yRange: (p) => {
        const m = amps(p).I * 1e3 * 1.25;
        return [-m, m];
      },
      overlays,
    },
    {
      id: 'v',
      label: vLabel,
      traces: [
        { channel: 'vR', role: 'force' },
        { channel: 'vL', role: 'acceleration' },
        { channel: 'vC', role: 'position' },
      ],
      yRange: (p) => {
        const a = amps(p);
        const m = Math.max(a.VR, a.VL, a.VC) * 1.18;
        return [-m, m];
      },
    },
  ],

  readouts: [
    { label: 'I', unit: 'mA', value: (_s, p) => amps(p).I * 1e3 },
    { label: '\\phi', unit: '°', value: (_s, p) => phase(rlcOf(p), driveOf(p).wd) * DEG },
    { label: 'Z', unit: 'Ω', value: (_s, p) => impedance(rlcOf(p), driveOf(p).wd) },
  ],

  info: {
    goals: ['ch31.a.goal.phase', 'ch31.a.goal.res'],
    observe: ['ch31.a.obs.R', 'ch31.a.obs.L', 'ch31.a.obs.C', 'ch31.a.obs.phasor', 'ch31.a.obs.res', 'ch31.a.obs.sweep'],
    equations: [
      'v_R = iR, \\quad v_L = L\\frac{di}{dt}',
      'v_C = \\frac{q}{C} = \\frac{1}{C}\\int i\\,dt',
      'I = \\frac{\\mathcal{E}_m}{\\sqrt{R^2 + (X_L - X_C)^2}}',
      '\\tan\\phi = \\frac{X_L - X_C}{R}, \\quad \\omega_0 = \\frac{1}{\\sqrt{LC}}',
      'X_L = \\omega_d L, \\quad X_C = \\frac{1}{\\omega_d C}',
    ],
    assumptions: ['ch31.a.assume'],
  },
};
