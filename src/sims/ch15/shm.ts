// Ch 15 scene: SHM as the projection of uniform circular motion. Reference circle (left) and
// mass on a spring (right) share one horizontal projection line. Free-body diagram of the hanging
// mass: spring force F_s = mg − kx (x from equilibrium, up +), weight mg and, with damping, F_d.
import { num, tn, tp, u } from '../../core/tex';
import type { ParamSchema, Scene, Vec2 } from '../../core/types';
import type { Draw } from '../../draw/draw';
import { drawFbd, fbdParam, fbdScale, type FbdForce } from '../../draw/fbd';
import { sigFit } from '../ch07/sigfit';
import { omega0, omegaD, oscAt, period, type OscState, type Oscillator } from './physics';

type P = { A: number; k: number; m: number; zeta: number; vectors: boolean; fbd: boolean };
type S = { t: number } & OscState;

const A_MAX = 0.3;
const CX = -0.55; // reference circle centre
const SX = 0; // spring column
/** Right edge of the drawing: the block's v and a arrows and their labels. */
const RIGHT = SX + 0.27;
const CEIL = 0.54;
const BOX = 0.11;
const GREY = '#9a9a9a';
const GUIDE = '#c8c8c8';
/** Free fall [m/s²]: gravity shifts the equilibrium by mg/k and appears only in the free-body diagram. */
export const SHM_G = 9.8;
/** Half-width of the spring's zigzag [m]. */
const ZIG = 0.045;

const oscOf = (p: P): Oscillator => ({ A: p.A, k: p.k, m: p.m, zeta: p.zeta });

const params: ParamSchema<P> = {
  A: {
    kind: 'number',
    label: 'ch15.p.A',
    desc: 'ch15.d.A',
    group: 'main',
    live: false,
    control: 'slider',
    min: 0.05,
    max: 0.3,
    step: 0.01,
    default: 0.2,
    unit: 'm',
  },
  k: {
    kind: 'number',
    label: 'ch15.p.k',
    desc: 'ch15.d.k',
    group: 'main',
    live: false,
    control: 'slider',
    min: 5,
    max: 40,
    step: 1,
    default: 20,
    unit: 'N/m',
  },
  m: {
    kind: 'number',
    label: 'ch15.p.m',
    desc: 'ch15.d.m',
    group: 'advanced',
    live: false,
    control: 'slider',
    min: 0.2,
    max: 2,
    step: 0.1,
    default: 1,
    unit: 'kg',
  },
  zeta: {
    kind: 'number',
    label: 'ch15.p.damp',
    desc: 'ch15.d.damp',
    group: 'advanced',
    live: false,
    control: 'slider',
    min: 0,
    max: 0.2,
    step: 0.01,
    default: 0,
  },
  fbd: fbdParam(),
  vectors: { kind: 'toggle', label: 'ch15.p.vectors', desc: 'ch15.d.vectors', group: 'advanced', live: true, default: true },
};

/**
 * Forces on the mass [N] (y up): the spring holds mg at equilibrium, so it pulls with mg − kx; the
 * damping force −bv with b = 2ζ√(km) = 2ζω₀m only when ζ > 0. Their sum is −kx − bv = ma.
 */
export function fbdForces(s: { x: number; v: number }, p: P): FbdForce[] {
  const W = p.m * SHM_G;
  const out: FbdForce[] = [
    { F: { x: 0, y: W - p.k * s.x }, label: '*F*_{s}' },
    { F: { x: 0, y: -W }, label: '*m**g*', field: true },
  ];
  if (p.zeta > 0) out.push({ F: { x: 0, y: -2 * p.zeta * omega0(oscOf(p)) * p.m * s.v }, label: '*F*_{d}' });
  return out;
}

/**
 * Px per newton for the run: the spring force at the lowest point, mg + kA, is the largest and gets
 * up to 56 px; shorter where the stage has no room for mg and its label below the lowest point.
 */
export const fbdPerN = (g: Draw, p: P) => {
  const W = p.m * SHM_G;
  const max = W + p.k * p.A;
  // Room below the mass at x = −A: to the world bottom plus the 18 px padding, less the label.
  const room = (A_MAX + 0.11 - p.A) / g.px(1) + 18 - 20;
  return fbdScale(max, Math.min(56, Math.max(24, (room * max) / W)));
};

/**
 * Column offsets [px] of the vertical forces F_s, mg, F_d: the spring force just left of the spring's
 * zigzag, the weight as far right, F_d (small) in the middle, so no arrow or label lies on another.
 */
export const fbdColumns = (g: Draw) => {
  const c = Math.max(16, ZIG / g.px(1) + 11);
  return [-c, c, 0];
};

function spring(g: Draw, x: number, y0: number, y1: number): void {
  const n = 10;
  const lead = 0.025;
  const pts: Vec2[] = [{ x, y: y0 }, { x, y: y0 - lead }];
  const span = y0 - y1 - 2 * lead;
  for (let i = 0; i < n; i++) pts.push({ x: x + (i % 2 ? -ZIG : ZIG), y: y0 - lead - (span * (i + 0.5)) / n });
  pts.push({ x, y: y1 + lead }, { x, y: y1 });
  g.polyline(pts, { color: '#5c5c5c', width: 1.5 });
}

/**
 * Σ panel. Undamped: ω, T, the live x = A cos ωt (phase in degrees, reduced to one turn), a = −ω²x
 * and E = K + U = ½kA². Damped: ω₀, ω = ω₀√(1 − ζ²), T = 2π/ω, a = −ω₀²x − 2ζω₀v and E = K + U
 * (which decays, so no ½kA²).
 */
export function formulaLines(s: S, p: P): string[] {
  const lines = oscLines(s, p);
  if (p.fbd) {
    // Net force from the drawn forces (y up): F_s − mg (+ F_d) = −kx (− bv) = ma.
    const [Fs, mg, Fd] = fbdForces(s, p).map((f, i) => (i === 1 ? -f.F.y : f.F.y));
    const net = Fs - mg + (Fd ?? 0);
    const sf = sigFit(Fd === undefined ? [Fs, mg] : [Fs, mg, Fd], (a, b, c = 0) => a - b + c, net);
    lines.push(
      Fd === undefined
        ? `\\Sigma F = F_s - mg = ${tn(Fs, sf)} - ${tn(mg, sf)} = ${tn(net)}${u('N')} = ma`
        : `\\Sigma F = F_s - mg + F_d = ${tn(Fs, sf)} - ${tn(mg, sf)} + ${tp(Fd, sf)} = ${tn(net)}${u('N')} = ma`,
    );
  }
  return lines;
}

function oscLines(s: S, p: P): string[] {
  const o = oscOf(p);
  const w0 = omega0(o);
  const w = omegaD(o);
  const T = period(o);
  const km = `\\sqrt{${num(p.k)}/${num(p.m)}}`;
  const se = sigFit([s.K, s.U], (a, b) => a + b, s.E);
  const energy = `E = K + U = ${tn(s.K, se)} + ${tn(s.U, se)} = ${tn(s.E)}${u('J')}`;
  if (p.zeta === 0) {
    const ph = (((w * s.t) / Math.PI) * 180) % 360;
    const sa = sigFit([w, s.x], (a, x) => -a * a * x, s.a);
    return [
      `\\omega = \\sqrt{k/m} = ${km} = ${tn(w)}${u('rad/s')}`,
      `T = 2\\pi\\sqrt{m/k} = 2\\pi\\sqrt{${num(p.m)}/${num(p.k)}} = ${tn(T)}${u('s')}`,
      `x = A\\cos\\omega t = (${num(p.A)})\\cos ${tn(ph, Math.max(4, sigFit([ph], (d) => p.A * Math.cos((d * Math.PI) / 180), s.x)))}^\\circ = ${tn(s.x)}${u('m')}`,
      `a = -\\omega^2 x = -(${tn(w, sa)})^2(${tn(s.x, sa)}) = ${tn(s.a)}${u('m/s^2')}`,
      energy,
      `= \\tfrac12 kA^2 = \\tfrac12(${num(p.k)})(${num(p.A)})^2 = ${tn(0.5 * p.k * p.A * p.A)}${u('J')}`,
    ];
  }
  const sw = sigFit([w0], (a) => a * Math.sqrt(1 - p.zeta * p.zeta), w);
  const sa = sigFit([w0, s.x, s.v], (a, x, v) => -a * a * x - 2 * p.zeta * a * v, s.a);
  return [
    `\\omega_0 = \\sqrt{k/m} = ${km} = ${tn(w0)}${u('rad/s')}`,
    `\\omega = \\omega_0\\sqrt{1 - \\zeta^2} = (${tn(w0, sw)})\\sqrt{1 - (${num(p.zeta)})^2} = ${tn(w)}${u('rad/s')}`,
    `T = \\frac{2\\pi}{\\omega} = \\frac{2\\pi}{${tn(w, sigFit([w], (a) => (2 * Math.PI) / a, T))}} = ${tn(T)}${u('s')}`,
    `a = -\\omega_0^2 x - 2\\zeta\\omega_0 v`,
    `= -(${tn(w0, sa)})^2(${tn(s.x, sa)}) - 2(${num(p.zeta)})(${tn(w0, sa)})(${tn(s.v, sa)}) = ${tn(s.a)}${u('m/s^2')}`,
    energy,
  ];
}

export const shm: Scene<P, S> = {
  id: 'shm',
  title: 'ch15.scene',
  layout: 'side',
  params,
  time: { h: 1 / 480, recordEvery: 4, frameStep: 0.05, window: 6 },
  world: () => ({ x: [CX - A_MAX - 0.08, RIGHT], y: [-A_MAX - 0.11, CEIL + 0.04], aspect: 'contain', padPx: 18 }),

  init: (p) => ({ t: 0, ...oscAt(oscOf(p), 0) }),
  step: (s, h, p) => {
    s.t += h;
    Object.assign(s, oscAt(oscOf(p), s.t));
  },
  record: (s) => ({ t: s.t, x: s.x, v: s.v, a: s.a, K: s.K, U: s.U, E: s.E }),
  snapshot: (s) => ({ ...s }),

  draw: (g, s, p) => {
    const o = oscOf(p);
    const w0 = omega0(o);
    const kv = 0.6 / w0; // world m per (m/s): v arrow on the circle has length 0.6 R, a arrow 0.5 R
    const ka = 0.5 / (w0 * w0);

    // Equilibrium line through both columns.
    g.line({ x: CX - A_MAX - 0.05, y: 0 }, { x: RIGHT - 0.02, y: 0 }, { color: GUIDE, width: 1, dash: [4, 4] });

    // Reference circle (spiral when damped: the circle of the current radius is drawn).
    const R = Math.hypot(s.px, s.py);
    const ring: Vec2[] = [];
    for (let i = 0; i <= 96; i++) ring.push({ x: CX + R * Math.cos((i / 96) * 2 * Math.PI), y: R * Math.sin((i / 96) * 2 * Math.PI) });
    g.polyline(ring, { color: GREY, width: 1.25 });
    g.circle({ x: CX, y: 0 }, 3, { fill: GREY });
    const P0: Vec2 = { x: CX + s.px, y: s.py };
    if (!p.vectors) g.line({ x: CX, y: 0 }, P0, { color: GUIDE, width: 1 });

    // Projection line: circle point → mass, both at height x.
    g.line(P0, { x: SX, y: s.x }, { color: GUIDE, width: 1, dash: [3, 4] });

    // Ceiling, spring, mass.
    g.line({ x: SX - 0.12, y: CEIL }, { x: SX + 0.12, y: CEIL }, { color: '#5c5c5c', width: 2 });
    for (let i = 0; i < 6; i++) {
      const x = SX - 0.11 + i * 0.045;
      g.line({ x, y: CEIL }, { x: x + 0.03, y: CEIL + 0.03 }, { color: GREY, width: 1 });
    }
    spring(g, SX, CEIL, s.x + BOX / 2);
    g.polygon(
      [
        { x: SX - BOX / 2, y: s.x - BOX / 2 },
        { x: SX + BOX / 2, y: s.x - BOX / 2 },
        { x: SX + BOX / 2, y: s.x + BOX / 2 },
        { x: SX - BOX / 2, y: s.x + BOX / 2 },
      ],
      { fill: 'position', fillAlpha: p.fbd ? 0.25 : 0.9 },
    );
    if (p.fbd) {
      // Vertical forces side by side, one column each, from the height of the mass's centre.
      const cols = fbdColumns(g);
      fbdForces(s, p).forEach((f, i) => drawFbd(g, { x: SX + g.px(cols[i]), y: s.x }, [f], fbdPerN(g, p)));
    }
    if (p.vectors) {
      // On the circle: full v (tangent) and a (towards the centre). On the mass: their vertical parts.
      // Labels only on arrows long enough to keep them clear of the dot and of each other.
      const lbl = (len: number, txt: string) => (len > g.px(18) ? txt : undefined);
      const vc = { x: s.pvx * kv, y: s.pvy * kv };
      const ac = { x: s.pax * ka, y: s.pay * ka };
      g.arrow(P0, vc, { role: 'velocity', width: 2.25, label: lbl(Math.hypot(vc.x, vc.y), '*v*') });
      g.arrow(P0, ac, { role: 'acceleration', width: 2.25, label: lbl(Math.hypot(ac.x, ac.y), '*a*') });
      // With the free-body diagram, v moves right of the mg column and its label.
      const side = Math.max(SX + BOX / 2 + 0.05, p.fbd ? SX + g.px(fbdColumns(g)[1] + 18) : 0);
      const vm = s.v * kv;
      const am = s.a * ka;
      if (Math.abs(vm) > g.px(3)) g.arrow({ x: side, y: s.x }, { x: 0, y: vm }, { role: 'velocity', width: 2.25, label: lbl(Math.abs(vm), '*v*') });
      // The mass's acceleration gives way to the free-body diagram (ΣF = ma in the Σ panel).
      if (!p.fbd && Math.abs(am) > g.px(3)) g.arrow({ x: side + 0.07, y: s.x }, { x: 0, y: am }, { role: 'acceleration', width: 2.25, label: lbl(Math.abs(am), '*a*') });
    }
    g.circle(P0, 7, { fill: 'position' });
  },

  plots: [
    { id: 'x', label: 'x\\,(\\mathrm{m})', traces: [{ channel: 'x', role: 'position' }], yRange: (p) => [-p.A * 1.2, p.A * 1.2] },
    {
      id: 'v',
      label: 'v\\,(\\mathrm{m/s})',
      traces: [{ channel: 'v', role: 'velocity' }],
      yRange: (p) => {
        const m = p.A * omega0(oscOf(p)) * 1.2;
        return [-m, m];
      },
    },
    {
      id: 'a',
      label: 'a\\,(\\mathrm{m/s^2})',
      traces: [{ channel: 'a', role: 'acceleration' }],
      yRange: (p) => {
        const m = p.A * omega0(oscOf(p)) ** 2 * 1.2;
        return [-m, m];
      },
    },
    {
      id: 'E',
      label: '\\textcolor{#56B4E9}{K},\\ \\textcolor{#E69F00}{U},\\ E\\,(\\mathrm{J})',
      traces: [
        { channel: 'K', role: 'energyK' },
        { channel: 'U', role: 'energyU' },
        { channel: 'E', role: 'energyE' },
      ],
      yRange: (p) => [0, 0.5 * p.k * p.A * p.A * 1.2],
    },
  ],

  readouts: [
    // With damping both show the damped oscillation: ω = ω_d and T = 2π/ω_d.
    { label: '\\omega', unit: 'rad/s', value: (_s, p) => omegaD(oscOf(p)) },
    { label: 'T', unit: 's', value: (_s, p) => period(oscOf(p)) },
    { label: 'E', unit: 'J', value: (s) => s.E },
  ],

  formula: (s, p) => formulaLines(s, p),

  info: {
    goals: ['ch15.goal.proj', 'ch15.goal.props'],
    observe: ['ch15.obs.phase', 'ch15.obs.a', 'ch15.obs.iso', 'ch15.obs.km', 'ch15.obs.energy', 'ch15.obs.damp'],
    equations: [
      'x = A\\cos\\omega t, \\quad v = -\\omega A \\sin\\omega t, \\quad a = -\\omega^2 x',
      '\\omega = \\sqrt{k/m}, \\quad T = 2\\pi\\sqrt{m/k}',
      'E = \\tfrac{1}{2}mv^2 + \\tfrac{1}{2}kx^2 = \\tfrac{1}{2}kA^2',
    ],
    assumptions: ['ch15.assume.spring', 'ch15.assume.scale', 'ch15.assume.zeta', 'ch15.assume.damp'],
  },
};
