// Ch 20 scene: Carnot cycle on p–V and T–S diagrams. Heat Q_H enters at T_H, Q_C leaves at
// T_C, with Q_C/Q_H = T_C/T_H because the two isotherms span the same entropy change. The
// efficiency W/Q_H = 1 − T_C/T_H is the upper limit for any engine between the two reservoirs.
import { num, slider, tn, u } from '../../core/tex';
import type { ParamSchema, Scene, Vec2 } from '../../core/types';
import type { Draw } from '../../draw/draw';
import { fmtJ, pJ, tJ } from '../ch18/formula';
import { bar, chart, split, stageRect, type Rect } from '../ch18/panels';
import { NR, cycle, eint, entropy, heatSplit, legAt, legWork, pathAt, pathPoints, temp, type Cycle, type Leg } from '../ch18/physics';
import { dofOf } from '../ch18/process';
import { EC, QC, WC, barRange, drawPV, isWide } from '../ch18/view';

type P = { tc: number; gas: string };

const DUR = 8;
const TH = 600;
const QC_OUT = '#56B4E9';
const NAMES = ['A', 'B', 'C', 'D'];

let memoKey = '';
let memo: { c: Cycle; Vmax: number; pmax: number; qin: number; qout: number; W: number; yr: [number, number] } | null = null;
function model(p: P) {
  const key = `${p.tc}|${p.gas}`;
  if (key !== memoKey || !memo) {
    const f = dofOf(p.gas);
    const c = cycle('carnot', true, f, p.tc);
    const { qin, qout } = heatSplit(c.legs, f);
    memo = {
      c,
      Vmax: 1.1 * Math.max(...c.corners.map((q) => q.V)),
      pmax: 1.15 * Math.max(...c.corners.map((q) => q.p)),
      qin,
      qout,
      W: qin - qout,
      yr: barYRange(c, f),
    };
    memoKey = key;
  }
  return memo;
}

const sOf = (t: number) => Math.min(t / DUR, 1);

/** Bar scale: every value of Q_H, Q_C, ΔE_int and W anywhere in the cycle (W peaks after the adiabatic expansion, ΔE_int dips there). */
function barYRange(c: Cycle, f: number): [number, number] {
  const vals: number[] = [];
  for (let i = 0; i <= 200; i++) {
    const h = heatsAt(c.legs, i / 200, f);
    vals.push(h.qh, h.qc, h.dE, h.W);
  }
  return barRange(vals);
}

/**
 * Heat in on the hot isotherm and heat out on the cold one so far, the change of internal energy
 * since A and the work done by the gas so far [J]. First law: W = Q_H − Q_C − ΔE_int at every
 * point; ΔE_int = 0 only when the loop closes.
 */
export function heatsAt(legs: Leg[], s: number, f: number): { qh: number; qc: number; dE: number; W: number } {
  const pt = pathAt(legs, s, f);
  let qh = 0;
  let qc = 0;
  for (let i = 0; i <= pt.leg; i++) {
    const l = legs[i];
    const u = i < pt.leg ? 1 : pt.u;
    const q = eint(legAt(l, u), f) - eint(l.a, f) + legWork(l, u);
    if (l.kind !== 'isothermal') continue;
    if (q > 0) qh += q;
    else qc -= q;
  }
  return { qh, qc, dE: pt.dE, W: pt.W };
}

const params: ParamSchema<P> = {
  tc: {
    kind: 'number',
    label: 'ch20.c.p.tc',
    desc: 'ch20.c.d.tc',
    group: 'main',
    live: false,
    control: 'slider',
    min: 150,
    max: 500,
    step: 10,
    default: 300,
    unit: 'K',
  },
  gas: {
    kind: 'select',
    label: 'ch20.c.p.gas',
    desc: 'ch20.c.d.gas',
    group: 'advanced',
    live: false,
    default: 'mono',
    options: [
      { value: 'mono', label: 'ch20.c.gas.mono' },
      { value: 'di', label: 'ch20.c.gas.di' },
    ],
  },
};

/** T–S diagram: the Carnot cycle is a rectangle; area under the path = heat. */
function drawTS(g: Draw, r: Rect, s: number, p: P): void {
  const f = dofOf(p.gas);
  const { c } = model(p);
  const A = c.corners[0];
  const toTS = (q: { V: number; p: number }) => ({ x: entropy(q, A, f), y: temp(q) });
  const dS = entropy(c.corners[1], A, f);
  chart(g, r, [-0.25 * dS, 1.35 * dS], [0, 1.18 * TH], { l: 46, r: 14, t: 22, b: 36 }, (ch) => {
    ch.axes({ xLabel: 'Δ*S* (J/K)', yLabel: '*T* (K)', xTicks: 4 });
    ch.clip(() => {
      const n = c.legs.length;
      for (let i = 0; i < n; i++) {
        const hi = Math.min(s * n - i, 1);
        if (hi <= 0) break;
        const l = c.legs[i];
        if (l.kind !== 'isothermal') continue;
        const pts: Vec2[] = [];
        for (let k = 0; k <= 24; k++) pts.push(toTS(legAt(l, (hi * k) / 24)));
        const out = pts[pts.length - 1].x < pts[0].x;
        ch.area(pts, out ? QC_OUT : QC, out, 0.2);
      }
      ch.d.polyline(
        pathPoints(c.legs, 0, 1).map((q) => {
          const v = toTS(q);
          return ch.P(v.x, v.y);
        }),
        { color: '#c8c8c8', width: 1.5 },
      );
      ch.d.polyline(
        pathPoints(c.legs, 0, s).map((q) => {
          const v = toTS(q);
          return ch.P(v.x, v.y);
        }),
        { color: '#1a1a1a', width: 2.5 },
      );
    });
    c.corners.forEach((q, i) => {
      const v = toTS(q);
      const left = i === 0 || i === 3;
      const upper = i < 2;
      ch.d.circle(ch.P(v.x, v.y), 3.5, { fill: '#ffffff', color: '#1a1a1a', width: 1.5 });
      ch.d.text(ch.P(v.x, v.y), NAMES[i], { size: 13, color: '#1a1a1a', align: 'center', baseline: 'middle', dx: left ? -12 : 12, dy: upper ? -12 : 12 });
    });
    const cur = toTS(pathAt(c.legs, s, f).st);
    ch.d.circle(ch.P(cur.x, cur.y), 5.5, { fill: '#1a1a1a' });
  });
}

/** Title over the bars: the first law, true at every point of the cycle. */
export const BAR_TITLE = '*W* = *Q*_{H} − *Q*_{C} − Δ*E*_{int}  (J)';

/** Bars [value J, colour, symbol] in the order of the title, at cycle fraction s. */
export function barItems(p: P, s: number): [number, string, string][] {
  const h = heatsAt(model(p).c.legs, s, dofOf(p.gas));
  return [
    [h.W, WC, '*W*'],
    [h.qh, QC, '*Q*_{H}'],
    [h.qc, QC_OUT, '*Q*_{C}'],
    [h.dE, EC, 'Δ*E*_{int}'],
  ];
}

function drawHeatBars(g: Draw, r0: Rect, s: number, p: P): void {
  const m = model(p);
  const hh = Math.min(r0.h, Math.max(240, 1.4 * r0.w));
  const r = { ...r0, y: r0.y + (r0.h - hh) / 2, h: hh };
  chart(g, r, [-0.6, 3.6], m.yr, { l: 8, r: 8, t: 30, b: 26 }, (ch) => {
    ch.d.line(ch.P(-0.6, 0), ch.P(3.6, 0), { role: 'axis', width: 1.25 });
    const half = Math.min(16, (ch.R - ch.L) * 0.055);
    barItems(p, s).forEach(([v, col, lbl], k) => bar(ch, k, half, v, col, fmtJ(v), lbl));
    ch.d.text({ x: (ch.L + ch.R) / 2, y: ch.T }, BAR_TITLE, { size: 13, color: '#1a1a1a', align: 'center', dy: -12 });
  });
}

export const carnotScene: Scene<P, { t: number }> = {
  id: 'carnot',
  title: 'ch20.scene.carnot',
  params,
  time: { h: 1 / 120, recordEvery: 4, frameStep: 0.1, tEnd: DUR },
  world: () => ({ x: [0, 1], y: [0, 1], aspect: 'contain' }),
  init: () => ({ t: 0 }),
  step: (s, h) => {
    s.t += h;
  },

  draw: (g, st, p) => {
    const s = sOf(st.t);
    const { c, Vmax, pmax } = model(p);
    const full = stageRect(g);
    let pv, ts, bars;
    if (isWide(full)) [pv, ts, bars] = split(full, 'row', [1.25, 1.1, 0.75], 8);
    else {
      // Narrow stage: the p–V diagram gets the full width (its labels need the room).
      const [top, bottom] = split(full, 'col', [1.1, 1], 4);
      pv = top;
      [ts, bars] = split(bottom, 'row', [1.15, 1], 4);
    }
    drawPV(g, pv, {
      Vmax,
      pmax,
      traces: [{ legs: c.legs, s, shade: true }],
      loop: c.legs,
      isotherms: [TH, p.tc],
      points: c.corners.map((q, i) => ({ st: q, name: NAMES[i], dx: 0, dy: 0 })),
    });
    drawTS(g, ts, s, p);
    drawHeatBars(g, bars, s, p);
  },

  readouts: [
    { label: 'W/Q_\\text{H}', unit: '', value: (_s, p) => model(p).W / model(p).qin },
    { label: '1 - T_\\text{C}/T_\\text{H}', unit: '', value: (_s, p) => 1 - p.tc / TH },
  ],

  formula: (s, p) => formulaLines(s.t, p),

  info: {
    goals: ['ch20.c.goal.limit', 'ch20.c.goal.ts'],
    observe: ['ch20.c.obs.legs', 'ch20.c.obs.first', 'ch20.c.obs.ratio', 'ch20.c.obs.tc', 'ch20.c.obs.gas'],
    equations: [
      'Q_\\text{H} = nRT_\\text{H}\\ln\\frac{V_\\text{B}}{V_\\text{A}}, \\quad Q_\\text{C} = nRT_\\text{C}\\ln\\frac{V_\\text{C}}{V_\\text{D}}',
      '\\frac{Q_\\text{H}}{T_\\text{H}} = \\frac{Q_\\text{C}}{T_\\text{C}} \\;\\Rightarrow\\; \\Delta S_\\text{cycle} = 0',
      'e = \\frac{W}{Q_\\text{H}} = 1 - \\frac{T_\\text{C}}{T_\\text{H}}',
    ],
    assumptions: ['ch20.c.assume.ideal', 'ch20.c.assume'],
  },
};

/**
 * Σ panel: Q_H and Q_C on the isotherms, the equal entropy changes Q_H/T_H = Q_C/T_C, the
 * efficiency W/Q_H = 1 − Q_C/Q_H against 1 − T_C/T_H, and the first law of the bars at time t.
 */
export function formulaLines(time: number, p: P): string[] {
  const m = model(p);
  const [A, B, C, D] = m.c.corners;
  // Policy D: nR and the volumes to 3 figures (R3), T_C as its slider label (R1), energies in whole
  // joules as on the bars (R7a, R8; ch18/formula.ts).
  const nR = tn(NR);
  const tc = slider(params.tc, p.tc);
  const qh = tJ(m.qin);
  const qc = tJ(m.qout);
  const h = heatsAt(m.c.legs, sOf(time), dofOf(p.gas));
  const J = u('J');
  return [
    `Q_\\text{H} = nRT_\\text{H}\\ln\\frac{V_\\text{B}}{V_\\text{A}} = ${nR} \\times ${TH}\\ln\\frac{${num(B.V)}}{${num(A.V)}} = ${qh}${J}`,
    `Q_\\text{C} = nRT_\\text{C}\\ln\\frac{V_\\text{C}}{V_\\text{D}} = ${nR} \\times ${tc}\\ln\\frac{${tn(C.V)}}{${tn(D.V)}} = ${qc}${J}`,
    `\\frac{Q_\\text{H}}{T_\\text{H}} = \\frac{${qh}}{${TH}} = \\frac{${qc}}{${tc}} = \\frac{Q_\\text{C}}{T_\\text{C}} = ${tn(m.qin / TH)}${u('J/K')}`,
    `\\frac{W}{Q_\\text{H}} = 1 - \\frac{Q_\\text{C}}{Q_\\text{H}} = 1 - \\frac{${qc}}{${qh}} = ${tn(m.W / m.qin)}`,
    `1 - \\frac{T_\\text{C}}{T_\\text{H}} = 1 - \\frac{${tc}}{${TH}} = ${tn(1 - p.tc / TH)}`,
    `W = Q_\\text{H} - Q_\\text{C} - \\Delta E_\\text{int} = ${pJ(h.qh)} - ${pJ(h.qc)} - ${pJ(h.dE)} = ${tJ(h.W)}${J}`,
  ];
}
