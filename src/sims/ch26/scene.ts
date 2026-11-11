// Ch 26 scene: electrons scattering in a lattice drift against E. Counting the net charge
// through a cross-section measures I; the I-V chart below collects the measurements.
import { fmtTick, niceTicks } from '../../core/format';
import type { Rng } from '../../core/rng';
import type { ParamSchema, Scene, Vec2 } from '../../core/types';
import type { Draw } from '../../draw/draw';
import { Q_E, currentOf, driftSpeed, heightOf, makeGas, resistanceOf, stepGas, type Gas, type Wire } from './physics';

type P = { V: number; T: number; L: number; A: number };

interface S {
  t: number;
  n: number;
  gas: Gas;
  rng: Rng;
  /** Trail of the tracer electron (NaN breaks the line at a wrap). */
  trail: number[];
}

const RATE = 120;
const LMAX = 6;
const TRAIL = 2.5 * RATE;
const ION = '#b9b9b9';
const WIRE_FILL = '#f6f6f6';
const TICK = '#6b6b6b';
// I-V chart, in world units below the wire.
const CH = { x0: 0.6, x1: 5.9, y0: -5.2, y1: -2.4, vMax: 1.6 };

const wireOf = (p: P): Wire => ({ L: p.L, A: p.A, T: p.T });

/** Measured currents [mA] by wire (L|A|T) and voltage, kept across runs to build the I-V chart. */
const measured = new Map<string, Map<number, number>>();
const keyOf = (p: P) => `${p.L}|${p.A}|${p.T}`;

/** Average current [mA] since t = 0, from the net count through the cross-section. */
const measuredI = (s: S) => (s.t > 0 ? (s.gas.count * Q_E * 1e3) / s.t : 0);

const params: ParamSchema<P> = {
  V: {
    kind: 'number',
    label: 'ch26.p.V',
    desc: 'ch26.d.V',
    group: 'main',
    live: false,
    control: 'select',
    choices: [0, 0.5, 1, 1.5],
    default: 1,
    unit: 'V',
  },
  T: {
    kind: 'number',
    label: 'ch26.p.T',
    desc: 'ch26.d.T',
    group: 'main',
    live: false,
    control: 'select',
    choices: [200, 300, 450],
    default: 300,
    unit: 'K',
  },
  L: {
    kind: 'number',
    label: 'ch26.p.L',
    desc: 'ch26.d.L',
    group: 'advanced',
    live: false,
    control: 'select',
    choices: [2, 4, 6],
    default: 4,
    unit: 'cm',
  },
  A: {
    kind: 'number',
    label: 'ch26.p.A',
    desc: 'ch26.d.A',
    group: 'advanced',
    live: false,
    control: 'select',
    choices: [1, 2, 3],
    default: 2,
    unit: 'mm²',
  },
};

function drawChart(g: Draw, p: P, s: S): void {
  const X = (v: number) => CH.x0 + (v / CH.vMax) * (CH.x1 - CH.x0);
  // Current axis: at least 400 mA, extended in 200 mA steps so the present wire's line fits.
  const iMax = Math.max(400, Math.ceil((currentOf(wireOf(p), CH.vMax) * 1e3 * 1.05) / 200) * 200);
  const Y = (i: number) => CH.y0 + (i / iMax) * (CH.y1 - CH.y0);
  const axis = { role: 'axis' as const, width: 1.25 };
  g.line({ x: X(0), y: Y(0) }, { x: X(CH.vMax), y: Y(0) }, axis);
  g.line({ x: X(0), y: Y(0) }, { x: X(0), y: Y(iMax) }, axis);
  for (const v of [0.5, 1, 1.5]) {
    g.line({ x: X(v), y: Y(0) }, { x: X(v), y: Y(0) - g.px(4) }, { role: 'axis', width: 1 });
    g.text({ x: X(v), y: Y(0) }, fmtTick(v), { size: 11, color: TICK, align: 'center', dy: 16 });
  }
  for (const i of niceTicks(0, iMax, 4)) {
    g.line({ x: X(0), y: Y(i) }, { x: X(0) - g.px(4), y: Y(i) }, { role: 'axis', width: 1 });
    g.text({ x: X(0), y: Y(i) }, fmtTick(i), { size: 11, color: TICK, align: 'right', baseline: 'middle', dx: -7 });
  }
  g.text({ x: X(CH.vMax), y: Y(0) }, '*V* (V)', { size: 12, color: TICK, align: 'right', dy: 32 });
  g.text({ x: X(0), y: Y(iMax) }, '*I* (mA)', { size: 12, color: TICK, align: 'left', dx: 8, dy: 4 });

  /** Line I = V / R clipped to the chart. */
  const line = (w: Wire, st: Parameters<Draw['line']>[2]) => {
    const k = (currentOf(w, 1) * 1e3) as number;
    const vEnd = Math.min(CH.vMax, iMax / k);
    g.line({ x: X(0), y: Y(0) }, { x: X(vEnd), y: Y(k * vEnd) }, st);
  };
  const cur = keyOf(p);
  for (const [key, pts] of measured) {
    if (key === cur || pts.size === 0) continue;
    const [L, A, T] = key.split('|').map(Number);
    line({ L, A, T }, { color: '#d0d0d0', width: 1.25 });
  }
  line(wireOf(p), { role: 'fg', width: 1.5 });
  for (const [V, I] of measured.get(cur) ?? []) {
    if (V === p.V) continue;
    g.circle({ x: X(V), y: Y(Math.min(I, iMax)) }, 4.5, { fill: '#ffffff', role: 'velocity', width: 2 });
  }
  if (s.t > 0.5) g.circle({ x: X(p.V), y: Y(Math.max(0, Math.min(measuredI(s), iMax))) }, 5, { fill: 'velocity' });
}

export const conduction: Scene<P, S> = {
  id: 'drift',
  title: 'ch26.scene',
  params,
  time: { h: 1 / RATE, recordEvery: 6, frameStep: 0.1, tEnd: 30 },
  world: () => ({ x: [-0.7, LMAX + 0.5], y: [CH.y0 - 0.9, 2.1], aspect: 'contain', padPx: 14 }),

  init: (p, rng) => ({ t: 0, n: 0, gas: makeGas(wireOf(p), rng), rng, trail: [] }),

  step: (s, h, p) => {
    const w = wireOf(p);
    const x0 = s.gas.x[0];
    stepGas(s.gas, w, p.V, h, s.rng);
    if (Math.abs(s.gas.x[0] - x0) > 0.3) s.trail.push(NaN, NaN);
    s.trail.push(s.gas.x[0], s.gas.y[0]);
    if (s.trail.length > 2 * TRAIL) s.trail.splice(0, s.trail.length - 2 * TRAIL);
    s.n += 1;
    s.t = s.n / RATE;
  },

  record: (s) => ({ t: s.t, q: s.gas.count * Q_E, i: measuredI(s) }),

  draw: (g, s, p) => {
    const w = wireOf(p);
    const h = heightOf(p.A);
    const top = h / 2;
    const bot = -h / 2;
    if (s.t >= 5) {
      if (!measured.has(keyOf(p))) measured.set(keyOf(p), new Map());
      measured.get(keyOf(p))!.set(p.V, measuredI(s));
    }

    g.polygon(
      [
        { x: 0, y: bot },
        { x: w.L, y: bot },
        { x: w.L, y: top },
        { x: 0, y: top },
      ],
      { fill: WIRE_FILL, color: '#8a8a8a', width: 1.25 },
    );

    // Ions vibrate more at higher temperature (drawing only).
    const amp = 0.025 * Math.sqrt(p.T / 300);
    const d = 0.3;
    let k = 0;
    for (let x = d / 2; x < w.L; x += d) {
      for (let y = bot + d / 2; y < top; y += d) {
        k += 1;
        const ph = k * 2.399;
        g.circle({ x: x + amp * Math.sin(37 * s.t + ph), y: y + amp * Math.cos(41 * s.t + 1.7 * ph) }, 3.2, { fill: ION });
      }
    }

    const gas = s.gas;
    for (let i = 1; i < gas.n; i++) g.circle({ x: gas.x[i], y: gas.y[i] }, 2.6, { fill: 'negative' });

    // Tracer electron and its path: straight-ish arcs between collisions.
    const tr = s.trail;
    let seg: Vec2[] = [];
    for (let i = 0; i < tr.length; i += 2) {
      if (Number.isNaN(tr[i])) {
        g.polyline(seg, { color: '#1a1a1a', width: 1.1, alpha: 0.6 });
        seg = [];
      } else seg.push({ x: tr[i], y: tr[i + 1] });
    }
    g.polyline(seg, { color: '#1a1a1a', width: 1.1, alpha: 0.6 });
    g.circle({ x: gas.x[0], y: gas.y[0] }, 4.5, { fill: 'negative', color: '#1a1a1a', width: 1.5 });

    // Cross-section where charge is counted.
    g.line({ x: w.L / 2, y: bot - 0.25 }, { x: w.L / 2, y: top + 0.25 }, { role: 'surface', width: 1.75, dash: [5, 4] });

    // Terminals and the field.
    const lbl = { size: 16, align: 'center' as const, baseline: 'middle' as const, weight: 700 };
    g.text({ x: 0, y: 0 }, '+', { ...lbl, role: 'positive', dx: -14 });
    g.text({ x: w.L, y: 0 }, '−', { ...lbl, role: 'negative', dx: 14 });
    if (p.V > 0) {
      const ya = top + 0.55;
      g.arrow({ x: w.L * 0.2, y: ya }, { x: w.L * 0.22, y: 0 }, { role: 'field', width: 2 });
      g.text({ x: w.L * 0.42, y: ya }, '*E*', { size: 14, role: 'field', align: 'left', baseline: 'middle', dx: 8 });
      const vd = driftSpeed(w, p.V);
      // Drift velocity below the wire, pointing against E.
      const yb = bot - 0.55;
      const xa = w.L * 0.55;
      g.arrow({ x: xa, y: yb }, { x: -vd * 0.6, y: 0 }, { role: 'velocity', width: 2 });
      g.text({ x: xa - vd * 0.6, y: yb }, '*v*_{d}', { size: 14, role: 'velocity', align: 'right', baseline: 'middle', dx: -8 });
    }

    drawChart(g, p, s);
  },

  plots: [
    {
      id: 'q',
      label: 'Q\\,(\\mathrm{C})',
      traces: [{ channel: 'q', role: 'position' }],
      yRange: (p) => {
        if (p.V === 0) return [-0.25, 0.25];
        const m = currentOf(wireOf(p), p.V) * 30 * 1.1;
        return [-0.1 * m, m];
      },
    },
    {
      id: 'i',
      label: '\\bar I = Q/t\\,(\\mathrm{mA})',
      traces: [{ channel: 'i', role: 'velocity' }],
      yRange: (p) => {
        if (p.V === 0) return [-50, 50];
        const m = currentOf(wireOf(p), p.V) * 1e3 * 1.6;
        return [-0.25 * m, m];
      },
    },
  ],

  drawPlot: (id, pd, p) => {
    const I = currentOf(wireOf(p), p.V);
    const dash = { color: '#7a7a7a', width: 1.25, dash: [5, 4] };
    if (id === 'q') pd.polyline([[0, 0], [1000, I * 1000]], dash);
    else pd.polyline([[0, I * 1e3], [1000, I * 1e3]], dash);
  },

  readouts: [
    { label: 'I', unit: 'mA', value: (s) => measuredI(s) },
    { label: 'V/I', unit: 'Ω', value: (s, p) => (p.V > 0 && measuredI(s) > 0 ? (p.V / measuredI(s)) * 1e3 : NaN) },
    { label: '\\rho L/A', unit: 'Ω', value: (_s, p) => resistanceOf(wireOf(p)) },
  ],

  info: {
    goals: ['ch26.goal.drift', 'ch26.goal.R'],
    observe: ['ch26.obs.zero', 'ch26.obs.drift', 'ch26.obs.count', 'ch26.obs.ohm', 'ch26.obs.LA', 'ch26.obs.T'],
    equations: ['v_d = \\frac{eE}{m}\\tau, \\quad J = n e v_d', 'I = \\frac{V}{R}, \\quad R = \\rho\\frac{L}{A}', '\\rho = \\frac{m}{e^2 n \\tau}'],
    assumptions: ['ch26.assume.speed', 'ch26.assume.model', 'ch26.assume.units'],
  },
};
