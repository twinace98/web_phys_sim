// Ch 20 scene: Carnot cycle on p–V and T–S diagrams. Heat Q_H enters at T_H, Q_C leaves at
// T_C, with Q_C/Q_H = T_C/T_H because the two isotherms span the same entropy change. The
// efficiency W/Q_H = 1 − T_C/T_H is the upper limit for any engine between the two reservoirs.
import type { ParamSchema, Scene, Vec2 } from '../../core/types';
import type { Draw } from '../../draw/draw';
import { bar, chart, split, stageRect, type Rect } from '../ch18/panels';
import { cycle, eint, entropy, heatSplit, legAt, legWork, pathAt, pathPoints, temp, type Cycle, type Leg } from '../ch18/physics';
import { dofOf } from '../ch18/process';
import { QC, WC, drawPV, isWide } from '../ch18/view';

type P = { tc: number; gas: string };

const DUR = 8;
const TH = 600;
const QC_OUT = '#56B4E9';
const NAMES = ['A', 'B', 'C', 'D'];

let memoKey = '';
let memo: { c: Cycle; Vmax: number; pmax: number; qin: number; qout: number; W: number; top: number } | null = null;
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
      top: barTop(c, f),
    };
    memoKey = key;
  }
  return memo;
}

const sOf = (t: number) => Math.min(t / DUR, 1);

/** Bar scale: the largest of Q_H, W, Q_C anywhere in the cycle (W peaks after the adiabatic expansion). */
function barTop(c: Cycle, f: number): number {
  let m = 0;
  for (let i = 0; i <= 200; i++) {
    const h = heatsAt(c.legs, i / 200, f);
    m = Math.max(m, h.qh, h.W, h.qc);
  }
  return 1.2 * m;
}

/** Heat in on the hot isotherm and heat out on the cold one, so far [J]. */
function heatsAt(legs: Leg[], s: number, f: number): { qh: number; qc: number; W: number } {
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
  return { qh, qc, W: pt.W };
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

function drawHeatBars(g: Draw, r0: Rect, s: number, p: P): void {
  const f = dofOf(p.gas);
  const m = model(p);
  const h = heatsAt(m.c.legs, s, f);
  const hh = Math.min(r0.h, Math.max(240, 1.4 * r0.w));
  const r = { ...r0, y: r0.y + (r0.h - hh) / 2, h: hh };
  const top = m.top;
  chart(g, r, [-0.6, 2.6], [-0.08 * top, top], { l: 8, r: 8, t: 30, b: 26 }, (ch) => {
    ch.d.line(ch.P(-0.6, 0), ch.P(2.6, 0), { role: 'axis', width: 1.25 });
    const half = Math.min(20, (ch.R - ch.L) * 0.07);
    const items: [number, string, string][] = [
      [h.qh, QC, '*Q*_{H}'],
      [h.W, WC, '*W*'],
      [h.qc, QC_OUT, '*Q*_{C}'],
    ];
    items.forEach(([v, col, lbl], k) => bar(ch, k, half, v, col, `${Math.abs(v) < 0.5 ? '0' : Math.round(v)} J`, lbl));
    ch.d.text({ x: (ch.L + ch.R) / 2, y: ch.T }, '*W* = *Q*_{H} − *Q*_{C}', { size: 14, color: '#1a1a1a', align: 'center', dy: -12 });
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
      const [top, bottom] = split(full, 'col', [1.3, 1], 4);
      [pv, ts] = split(top, 'row', [1, 1], 4);
      bars = bottom;
    }
    const mv = c.corners.reduce((a, q) => a + q.V, 0) / 4;
    const mp = c.corners.reduce((a, q) => a + q.p, 0) / 4;
    drawPV(g, pv, {
      Vmax,
      pmax,
      traces: [{ legs: c.legs, s, shade: true }],
      isotherms: [TH, p.tc],
      points: c.corners.map((q, i) => {
        const dx = (q.V - mv) / Vmax;
        const dy = (q.p - mp) / pmax;
        const n = Math.hypot(dx, dy) || 1;
        return { st: q, name: NAMES[i], dx: (dx / n) * 14, dy: (-dy / n) * 14 };
      }),
    });
    drawTS(g, ts, s, p);
    drawHeatBars(g, bars, s, p);
  },

  readouts: [
    { label: 'W/Q_\\text{H}', unit: '', value: (_s, p) => model(p).W / model(p).qin },
    { label: '1 - T_\\text{C}/T_\\text{H}', unit: '', value: (_s, p) => 1 - p.tc / TH },
  ],

  info: {
    goals: ['ch20.c.goal.limit', 'ch20.c.goal.ts'],
    observe: ['ch20.c.obs.legs', 'ch20.c.obs.ratio', 'ch20.c.obs.tc', 'ch20.c.obs.gas'],
    equations: [
      'Q_\\text{H} = nRT_\\text{H}\\ln\\frac{V_\\text{B}}{V_\\text{A}}, \\quad Q_\\text{C} = nRT_\\text{C}\\ln\\frac{V_\\text{C}}{V_\\text{D}}',
      '\\frac{Q_\\text{H}}{T_\\text{H}} = \\frac{Q_\\text{C}}{T_\\text{C}} \\;\\Rightarrow\\; \\Delta S_\\text{cycle} = 0',
      'e = \\frac{W}{Q_\\text{H}} = 1 - \\frac{T_\\text{C}}{T_\\text{H}}',
    ],
    assumptions: ['ch20.c.assume.ideal', 'ch20.c.assume'],
  },
};
