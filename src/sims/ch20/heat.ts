// Ch 20 scene: two Einstein solids exchanging energy quanta at random. The total number of
// microstates Ω_A Ω_B grows, so energy flows from the hotter solid to the colder one until
// ∂S_A/∂E_A = ∂S_B/∂E_B, i.e. equal temperatures (1/T = ∂S/∂E).
import type { Rng } from '../../core/rng';
import type { ParamSchema, Scene, Vec2 } from '../../core/types';
import type { Draw } from '../../draw/draw';
import { ROLE_COLOR } from '../../draw/theme';
import { chart, inPanel, split, stageRect, type Chart, type Rect } from '../ch18/panels';
import { QC } from '../ch18/view';
import { exchange, fillUniform, kTeps, lnOmega, sumRange } from './physics';

type P = { na: number; q: number; start: string };
interface S {
  t: number;
  osc: Int32Array;
  qA: number;
  /** The run's seeded generator: random moves stay reproducible. */
  rng: Rng;
}

const A_COL = ROLE_COLOR.position;
const B_COL = ROLE_COLOR.energyU;
/** Oscillators in both solids together. */
const N_TOT = 100;
const MOVES = 6;
const ROWS = 5;

const sizes = (p: P): [number, number] => [p.na, N_TOT - p.na];
const ent = (p: P, qA: number) => {
  const [NA, NB] = sizes(p);
  const a = lnOmega(NA, qA);
  const b = lnOmega(NB, p.q - qA);
  return { a, b, tot: a + b };
};

let memoKey = '';
let memoSmax = 1;
function sTotMax(p: P): number {
  const key = `${p.na}|${p.q}`;
  if (key !== memoKey) {
    memoKey = key;
    memoSmax = 0;
    for (let qa = 0; qa <= p.q; qa++) memoSmax = Math.max(memoSmax, ent(p, qa).tot);
  }
  return memoSmax;
}

const params: ParamSchema<P> = {
  na: {
    kind: 'number',
    label: 'ch20.h.p.na',
    desc: 'ch20.h.d.na',
    group: 'main',
    live: false,
    control: 'slider',
    min: 10,
    max: 90,
    step: 1,
    default: 30,
  },
  q: {
    kind: 'number',
    label: 'ch20.h.p.q',
    desc: 'ch20.h.d.q',
    group: 'main',
    live: false,
    control: 'slider',
    min: 20,
    max: 200,
    step: 10,
    default: 100,
  },
  start: {
    kind: 'select',
    label: 'ch20.h.p.start',
    desc: 'ch20.h.d.start',
    group: 'advanced',
    live: false,
    default: 'A',
    options: [
      { value: 'A', label: 'ch20.h.start.A' },
      { value: 'B', label: 'ch20.h.start.B' },
    ],
  },
};

/** Oscillator grids: quanta as dots (numbers above 9), heat arrow from hot to cold. */
function drawSolids(g: Draw, r: Rect, s: S, p: P): void {
  const [NA, NB] = sizes(p);
  const cA = Math.ceil(NA / ROWS);
  const cB = Math.ceil(NB / ROWS);
  const gapC = 2.2;
  const top = 26;
  const cs = Math.min(38, (r.w - 16) / (cA + cB + gapC), (r.h - top - 8) / ROWS);
  const W = cs * (cA + cB + gapC);
  inPanel(g, r, { x: [0, r.w], y: [0, r.h], aspect: 'contain', padPx: 0 }, (d) => {
    const x0 = (r.w - W) / 2;
    const yTop = r.h - top - Math.max(0, (r.h - top - 8 - cs * ROWS) / 2);
    const grid = (from: number, n: number, cols: number, gx: number, col: string) => {
      for (let k = 0; k < n; k++) {
        const cx = gx + (k % cols) * cs;
        const cy = yTop - Math.floor(k / cols) * cs;
        const pad = cs * 0.06;
        d.polygon(
          [
            { x: cx + pad, y: cy - pad },
            { x: cx + cs - pad, y: cy - pad },
            { x: cx + cs - pad, y: cy - cs + pad },
            { x: cx + pad, y: cy - cs + pad },
          ],
          { color: col, width: 1, alpha: 0.45 },
        );
        const q = s.osc[from + k];
        if (q > 9) {
          d.text({ x: cx + cs / 2, y: cy - cs / 2 }, String(q), { size: Math.max(8, cs * 0.38), color: col, align: 'center', baseline: 'middle', weight: 600 });
        } else {
          for (let m = 0; m < q; m++) {
            const px = cx + cs * (0.27 + 0.23 * (m % 3));
            const py = cy - cs * (0.27 + 0.23 * Math.floor(m / 3));
            d.circle({ x: px, y: py }, Math.max(1.2, cs * 0.075), { fill: col });
          }
        }
      }
    };
    const xA = x0;
    const xB = x0 + cs * (cA + gapC);
    grid(0, NA, cA, xA, A_COL);
    grid(NA, NB, cB, xB, B_COL);
    const qB = p.q - s.qA;
    d.text({ x: xA, y: yTop }, `A: *q*_{A} = ${s.qA}`, { size: 13, color: A_COL, align: 'left', dy: -8 });
    d.text({ x: xB, y: yTop }, `B: *q*_{B} = ${qB}`, { size: 13, color: B_COL, align: 'left', dy: -8 });
    const tA = kTeps(NA, s.qA);
    const tB = kTeps(NB, qB);
    if (Math.abs(tA - tB) > 0.12 * Math.max(tA, tB)) {
      const yc = yTop - (cs * ROWS) / 2;
      const xm = x0 + cs * (cA + gapC / 2);
      const len = cs * gapC * 0.7;
      const dir = tA > tB ? 1 : -1;
      d.arrow({ x: xm - (dir * len) / 2, y: yc }, { x: dir * len, y: 0 }, { color: QC, width: 2.5 });
      d.text({ x: xm, y: yc }, '*Q*', { size: 14, color: QC, align: 'center', dy: -12 });
    }
  });
}

/** Tangent of slope k at (x, y), fixed screen half-length. */
function tangent(c: Chart, x: number, y: number, k: number, col: string): void {
  const p0 = c.P(x, y);
  const p1 = c.P(x + 1, y + k);
  const dx = p1.x - p0.x;
  const dy = p1.y - p0.y;
  const n = Math.hypot(dx, dy) || 1;
  const h = 60;
  // A broad translucent band: visible even where the tangent hugs the curve.
  c.d.line({ x: p0.x - (dx / n) * h, y: p0.y - (dy / n) * h }, { x: p0.x + (dx / n) * h, y: p0.y + (dy / n) * h }, { color: col, width: 7, alpha: 0.3 });
}

/** S_A, S_B and S_tot against q_A, with the current state and the tangents of S_A and S_B. */
function drawCurves(g: Draw, r: Rect, s: S, p: P): void {
  const [NA, NB] = sizes(p);
  const yTop = 1.15 * sTotMax(p);
  chart(g, r, [0, p.q], [0, yTop], { l: 44, r: 16, t: 22, b: 36 }, (c) => {
    c.axes({ xLabel: '*q*_{A}', yLabel: '*S*/*k*' });
    const pa: Vec2[] = [];
    const pb: Vec2[] = [];
    const pt: Vec2[] = [];
    let peak = 0;
    for (let qa = 0; qa <= p.q; qa++) {
      const e = ent(p, qa);
      pa.push(c.P(qa, e.a));
      pb.push(c.P(qa, e.b));
      pt.push(c.P(qa, e.tot));
      if (e.tot > ent(p, peak).tot) peak = qa;
    }
    c.clip(() => {
      c.d.line(c.P(s.qA, 0), c.P(s.qA, yTop), { color: '#b5b5b5', width: 1, dash: [4, 4] });
      c.d.polyline(pa, { color: A_COL, width: 2 });
      c.d.polyline(pb, { color: B_COL, width: 2 });
      c.d.polyline(pt, { color: '#1a1a1a', width: 2.25 });
      const e = ent(p, s.qA);
      const qB = p.q - s.qA;
      if (s.qA > 0) tangent(c, s.qA, e.a, Math.log(1 + NA / s.qA), A_COL);
      if (qB > 0) tangent(c, s.qA, e.b, -Math.log(1 + NB / qB), B_COL);
      c.d.circle(c.P(s.qA, e.a), 4, { fill: A_COL });
      c.d.circle(c.P(s.qA, e.b), 4, { fill: B_COL });
      c.d.circle(c.P(s.qA, e.tot), 4.5, { fill: '#1a1a1a' });
    });
    const eq = ent(p, peak);
    c.d.text(c.P(peak, eq.tot), '*S*_{tot}', { size: 13, color: '#1a1a1a', align: 'center', dy: -10 });
    // S_A and S_B meet S_tot at the ends, so their labels go under the curves.
    c.d.text(c.P(p.q, ent(p, p.q).a), '*S*_{A}', { size: 13, color: A_COL, align: 'right', dy: 18 });
    c.d.text(c.P(0, ent(p, 0).b), '*S*_{B}', { size: 13, color: B_COL, align: 'left', dx: 6, dy: 18 });
  });
}

export const heatScene: Scene<P, S> = {
  id: 'heat',
  title: 'ch20.scene.heat',
  params,
  time: { h: 1 / 30, recordEvery: 1, frameStep: 0.2, window: 40 },
  world: () => ({ x: [0, 1], y: [0, 1], aspect: 'contain' }),
  init: (p, rng) => {
    const [NA, NB] = sizes(p);
    const osc = new Int32Array(NA + NB);
    if (p.start === 'B') fillUniform(osc, NA, NA + NB, p.q, rng);
    else fillUniform(osc, 0, NA, p.q, rng);
    return { t: 0, osc, qA: sumRange(osc, 0, NA), rng };
  },
  step: (s, h, p) => {
    s.t += h;
    for (let k = 0; k < MOVES; k++) exchange(s.osc, s.rng);
    s.qA = sumRange(s.osc, 0, sizes(p)[0]);
  },
  record: (s, p) => {
    const [NA, NB] = sizes(p);
    const e = ent(p, s.qA);
    return { t: s.t, SA: e.a, SB: e.b, St: e.tot, TA: kTeps(NA, s.qA), TB: kTeps(NB, p.q - s.qA) };
  },

  draw: (g, s, p) => {
    const full = stageRect(g);
    const [sol, cur] = full.w > 1.6 * full.h ? split(full, 'row', [1.1, 1], 10) : split(full, 'col', [0.85, 1], 6);
    drawSolids(g, sol, s, p);
    drawCurves(g, cur, s, p);
  },

  plots: [
    {
      id: 'S',
      label: 'S/k',
      traces: [
        { channel: 'SA', role: 'position' },
        { channel: 'SB', role: 'energyU' },
        { channel: 'St', role: 'fg' },
      ],
      yRange: (p) => [0, 1.15 * sTotMax(p)],
    },
    {
      id: 'T',
      label: 'kT/\\varepsilon',
      traces: [
        { channel: 'TA', role: 'position' },
        { channel: 'TB', role: 'energyU' },
      ],
      yRange: (p) => {
        const [NA, NB] = sizes(p);
        return [0, 1.15 * Math.max(kTeps(NA, p.q), kTeps(NB, p.q))];
      },
    },
  ],

  readouts: [
    { label: 'q_\\text{A}', unit: '', value: (s) => s.qA, sig: 1 },
    { label: 'kT_\\text{A}/\\varepsilon', unit: '', value: (s, p) => kTeps(sizes(p)[0], s.qA) },
    { label: 'kT_\\text{B}/\\varepsilon', unit: '', value: (s, p) => kTeps(sizes(p)[1], p.q - s.qA) },
  ],

  info: {
    goals: ['ch20.h.goal.flow', 'ch20.h.goal.T'],
    observe: ['ch20.h.obs.flow', 'ch20.h.obs.max', 'ch20.h.obs.slope', 'ch20.h.obs.size', 'ch20.h.obs.fluct'],
    equations: [
      '\\Omega(N, q) = \\binom{q + N - 1}{q}, \\quad S = k\\ln\\Omega',
      '\\Omega_\\text{tot} = \\Omega_\\text{A}\\,\\Omega_\\text{B}, \\quad S_\\text{tot} = S_\\text{A} + S_\\text{B}',
      '\\frac{1}{T} = \\frac{\\partial S}{\\partial E}, \\quad E = q\\,\\varepsilon',
    ],
    assumptions: ['ch20.h.assume.model', 'ch20.h.assume.T'],
  },
};
