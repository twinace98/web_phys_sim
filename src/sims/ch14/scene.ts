// Ch 14 scene: Venturi tube. Tracers spread out in the throat (continuity), the standpipe
// column drops there (Bernoulli), ½ρv² stacks on each column up to one head line, and a table
// under the tube lists A, v and A v.
import { fmt } from '../../core/format';
import { t } from '../../core/i18n';
import { num, tn, u } from '../../core/tex';
import type { ParamSchema, Scene, Vec2 } from '../../core/types';
import type { Draw } from '../../draw/draw';
import { sigFit } from '../ch07/sigfit';
import { G, RHO, TAPS, TUBE, TravelTime, axisY, radiusAt, taps, type Tap, type Venturi } from './physics';

type P = { ratio: number; Q: number; dy: number };

const A1 = 0.01; // wide cross-section: 100 cm²
const SPACING = 0.08; // tracer column spacing in the wide part [m]
const ROWS = [-0.7, -0.35, 0, 0.35, 0.7]; // tracer rows as fractions of the local radius
const W_PIPE = 0.012; // standpipe inner half-width [m]
const WALL = '#5c5c5c';
const WATER = '#dcebf6';
const TRACER = '#0072B2';
const LABEL = '#6b6b6b';
const ROW_PX = 24;
/** ½ρv² (orange) and ρgh (blue) in the labels above the standpipes and in the bars. */
export const DYN = '#D55E00';
export const STAT = '#0072B2';
/** World room above the standpipes for the two term labels [m]. */
const LABEL_ROOM = 0.09;

const venturiOf = (p: P): Venturi => ({ A1, ratio: p.ratio, Q: p.Q / 1000, dy: p.dy / 100 });

let memoKey = '';
let memo: { v: Venturi; tt: TravelTime; tp: Tap[]; head: number; top: number } | null = null;
function model(p: P) {
  const key = `${p.ratio}|${p.Q}|${p.dy}`;
  if (key !== memoKey || !memo) {
    const v = venturiOf(p);
    const tp = taps(v);
    // Total head: every water level plus its v²/2g bar reaches this line (Bernoulli).
    const head = tp[0].level + tp[0].v ** 2 / (2 * G);
    memo = { v, tt: new TravelTime(v), tp, head, top: head + 0.04 };
    memoKey = key;
  }
  return memo;
}

const params: ParamSchema<P> = {
  ratio: {
    kind: 'number',
    label: 'ch14.p.ratio',
    desc: 'ch14.d.ratio',
    group: 'main',
    live: true,
    control: 'slider',
    min: 0.4,
    max: 1,
    step: 0.05,
    default: 0.5,
  },
  Q: {
    kind: 'number',
    label: 'ch14.p.Q',
    desc: 'ch14.d.Q',
    group: 'main',
    live: true,
    control: 'slider',
    min: 5,
    max: 15,
    step: 0.5,
    default: 10,
    unit: 'L/s',
  },
  dy: {
    kind: 'number',
    label: 'ch14.p.dy',
    desc: 'ch14.d.dy',
    group: 'advanced',
    live: true,
    control: 'slider',
    min: 0,
    max: 20,
    step: 1,
    default: 0,
    unit: 'cm',
  },
};

/** Fixed two decimals with a true minus sign. */
const f2 = (x: number) => {
  const s = (Math.abs(x) < 0.005 ? 0 : x).toFixed(2);
  return s.startsWith('-') ? `−${s.slice(1)}` : s;
};

function wall(v: Venturi, side: 1 | -1, n = 160): Vec2[] {
  const pts: Vec2[] = [];
  for (let i = 0; i <= n; i++) {
    const x = (TUBE.L * i) / n;
    pts.push({ x, y: axisY(v, x) + side * radiusAt(v, x) });
  }
  return pts;
}

/** Orange 45° hatching in the box [x0, x1] × [y0, y1] (world), with an orange outline. */
function hatchBar(g: Draw, x0: number, x1: number, y0: number, y1: number): void {
  if (!(y1 > y0)) return;
  const st = g.px(5);
  const w = x1 - x0;
  for (let c = y0 - w; c < y1; c += st) {
    // Line y = c + (x − x0), clipped to the box.
    const a = { x: x0 + Math.max(0, y0 - c), y: Math.max(c, y0) };
    const b = { x: x0 + Math.min(w, y1 - c), y: Math.min(c + w, y1) };
    if (b.x > a.x) g.line(a, b, { color: DYN, width: 1 });
  }
  g.polyline(
    [
      { x: x0, y: y0 },
      { x: x0, y: y1 },
      { x: x1, y: y1 },
      { x: x1, y: y0 },
    ],
    { color: DYN, width: 1.25 },
  );
}

/** Three rows under the tube: area, speed, and their product, the same flow rate at every section. */
function drawTable(g: Draw, tp: Tap[], yTop: number): void {
  const rows: [string, string, (q: Tap) => string, boolean][] = [
    [t('ch14.row.A'), 'cm²', (q) => fmt(q.A * 1e4, 3), false],
    [t('ch14.row.v'), 'm/s', (q) => fmt(q.v, 3), false],
    [t('ch14.row.Q'), 'L/s', (q) => fmt(q.flow * 1000, 3), true],
  ];
  const head = { size: 14, color: LABEL, baseline: 'middle' as const };
  const x0 = -0.07;
  const xu = TAPS[2] + 0.12;
  // A narrow stage has no room for the row names beside the first column: each name gets its own
  // line above its values.
  const stacked = (TAPS[0] - x0) / g.px(1) < 90;
  const step = stacked ? 20 : ROW_PX;
  TAPS.forEach((x, i) => g.text({ x, y: yTop }, String(i + 1), { size: 14, color: '#1a1a1a', align: 'center', baseline: 'middle', weight: 600 }));
  let dy = 0;
  const rules: number[] = [step / 2];
  rows.forEach(([label, unit, val, strong], r) => {
    if (r === 2) rules.push(dy + step / 2);
    dy += step;
    if (stacked) {
      g.text({ x: x0, y: yTop }, label, { ...head, size: 13, dy });
      dy += step;
    } else g.text({ x: x0, y: yTop }, label, { ...head, dy });
    g.text({ x: xu, y: yTop }, unit, { ...head, dy });
    TAPS.forEach((x, i) => g.text({ x, y: yTop }, val(tp[i]), { size: 15, color: '#1a1a1a', align: 'center', baseline: 'middle', dy, weight: strong ? 600 : undefined }));
  });
  // Rules under the section numbers and above the flow row (the product of the two rows above).
  for (const k of rules) {
    const yr = yTop - g.px(k);
    g.line({ x: x0, y: yr }, { x: xu + 0.06, y: yr }, { color: '#d0d0d0', width: 1 });
  }
}

/** Above each standpipe: ½ρv² (orange) over ρgh (blue), in kPa. */
function drawTerms(g: Draw, tp: Tap[], yTop: number): void {
  TAPS.forEach((x, i) => {
    const q = tp[i];
    const st = { size: 13, align: 'center' as const, baseline: 'middle' as const };
    g.text({ x, y: yTop }, `½*ρv*^{2} = ${f2(q.dyn / 1000)} kPa`, { ...st, color: DYN, dy: -32 });
    g.text({ x, y: yTop }, `*ρgh* = ${f2((q.p + q.grav) / 1000)} kPa`, { ...st, color: STAT, dy: -14 });
  });
}

/**
 * Σ panel: continuity v = Q / A at the inlet and the throat, then Bernoulli between them,
 * p₁ − p₂ = ½ρ(v₂² − v₁²) + ρ g y₂ (heights from the inlet axis; the last term only on a tilted tube).
 */
export function formulaLines(p: P): string[] {
  const [t1, t2] = model(p).tp;
  const Q = tn(p.Q / 1000);
  const dp = (t1.p - t2.p) / 1000;
  const tilt = Math.abs(t2.y) > 1e-12;
  // v₁ = Q / A₁ and y₂ = Δy / 2 are exact at three figures; v₂ gets the digits the difference needs.
  const [v1, y2] = [Number(t1.v.toPrecision(3)), Number(t2.y.toPrecision(3))];
  const sg = sigFit([t2.v], (b) => (0.5 * RHO * (b * b - v1 * v1) + RHO * G * y2) / 1000, dp);
  const grav = tilt ? ` + (${num(RHO)})(${num(G)})(${tn(t2.y)})` : '';
  return [
    `v_1 = \\frac{Q}{A_1} = \\frac{${Q}\\ \\mathrm{m^3/s}}{${tn(t1.A)}\\ \\mathrm{m^2}} = ${tn(t1.v)}${u('m/s')}`,
    `v_2 = \\frac{Q}{A_2} = \\frac{${Q}\\ \\mathrm{m^3/s}}{${tn(t2.A)}\\ \\mathrm{m^2}} = ${tn(t2.v)}${u('m/s')}`,
    `p_1 - p_2 = \\tfrac12\\rho(v_2^2 - v_1^2)${tilt ? ' + \\rho g y_2' : ''}`,
    `= \\tfrac12(${num(RHO)})[(${tn(t2.v, sg)})^2 - (${tn(t1.v)})^2]${grav}\\ \\mathrm{Pa}`,
    `= ${tn(dp)}${u('kPa')}`,
  ];
}

export const venturi: Scene<P, { t: number }> = {
  id: 'venturi',
  title: 'ch14.scene',
  params,
  time: { h: 1 / 120, recordEvery: 4, frameStep: 0.05, scale: 0.25 },

  world: (p) => {
    const { top } = model(p);
    const r1 = Math.sqrt(A1 / Math.PI);
    return { x: [-0.08, TUBE.L + 0.06], y: [-r1 - 0.42, top + LABEL_ROOM], aspect: 'contain', padPx: 16 };
  },

  init: () => ({ t: 0 }),
  step: (s, h) => {
    s.t += h;
  },

  draw: (g, s, p, ui) => {
    const { v, tt, tp, head, top } = model(p);
    // Tracer positions are analytic in t: drawn at the frame's own time (h is half a frame here).
    const tNow = ui?.tFrame ?? s.t;
    const upper = wall(v, 1);
    const lower = wall(v, -1);
    g.polygon([...upper, ...lower.slice().reverse()], { fill: WATER });

    // Standpipes: water column from the top wall up to the level p/(ρg) above the axis.
    TAPS.forEach((x, i) => {
      const yw = axisY(v, x) + radiusAt(v, x);
      const lvl = tp[i].level;
      const yTop = top;
      g.polygon(
        [
          { x: x - W_PIPE, y: yw - 0.002 },
          { x: x + W_PIPE, y: yw - 0.002 },
          { x: x + W_PIPE, y: lvl },
          { x: x - W_PIPE, y: lvl },
        ],
        { fill: WATER },
      );
      g.line({ x: x - W_PIPE, y: lvl }, { x: x + W_PIPE, y: lvl }, { color: TRACER, width: 2 });
      // ½ρv² as a height v²/2g stacked on the water column, hatched: not water, a measure of the
      // kinetic term. Every stack ends at the same height.
      hatchBar(g, x - W_PIPE, x + W_PIPE, lvl, head);
      g.line({ x: x - W_PIPE, y: yw }, { x: x - W_PIPE, y: yTop }, { color: WALL, width: 1.5 });
      g.line({ x: x + W_PIPE, y: yw }, { x: x + W_PIPE, y: yTop }, { color: WALL, width: 1.5 });
    });
    // Inlet water level carried across (dashed, blue: real water), so the drop at the throat reads.
    g.line({ x: TAPS[0] + W_PIPE, y: tp[0].level }, { x: TAPS[2] + 0.06, y: tp[0].level }, { color: STAT, width: 1, dash: [4, 4], alpha: 0.7 });
    // The common top of the hatched stacks: p + ½ρv² + ρgy is the same at every section.
    g.line({ x: TAPS[0] - 0.06, y: head }, { x: TAPS[2] + 0.06, y: head }, { color: DYN, width: 1, alpha: 0.6 });
    drawTerms(g, tp, top);

    // Walls, with gaps where the standpipes join.
    const gapped = (pts: Vec2[]) => {
      let seg: Vec2[] = [];
      for (const q of pts) {
        if (TAPS.some((x) => Math.abs(q.x - x) < W_PIPE)) {
          g.polyline(seg, { color: WALL, width: 2 });
          seg = [];
        } else seg.push(q);
      }
      g.polyline(seg, { color: WALL, width: 2 });
    };
    gapped(wall(v, 1, 640));
    g.polyline(lower, { color: WALL, width: 2 });

    // Tracer columns released every SPACING / v1 seconds; each sits where τ(x) equals its age.
    const v1 = tp[0].v;
    const dt = SPACING / v1;
    // Dots shrink with the drawing so a small stage is not crowded.
    const dotR = Math.min(2.4, Math.max(1.2, (0.06 * Math.sqrt(A1 / Math.PI)) / g.px(1)));
    const kMin = Math.ceil((tNow - tt.total) / dt);
    const kMax = Math.floor(tNow / dt);
    for (let k = kMin; k <= kMax; k++) {
      const x = tt.xAt(tNow - k * dt);
      if (!Number.isFinite(x)) continue;
      const yc = axisY(v, x);
      const r = radiusAt(v, x);
      for (const f of ROWS) g.circle({ x, y: yc + f * r }, dotR, { fill: TRACER });
    }

    const r1 = Math.sqrt(A1 / Math.PI);
    drawTable(g, tp, -r1 - g.px(22));
  },

  readouts: [
    { label: 'v_1', unit: 'm/s', value: (_s, p) => model(p).tp[0].v },
    { label: 'v_2', unit: 'm/s', value: (_s, p) => model(p).tp[1].v },
    { label: 'p_1 - p_2', unit: 'kPa', value: (_s, p) => (model(p).tp[0].p - model(p).tp[1].p) / 1000 },
  ],

  formula: (_s, p) => formulaLines(p),

  info: {
    goals: ['ch14.goal.cont', 'ch14.goal.bern'],
    observe: ['ch14.obs.tracer', 'ch14.obs.column', 'ch14.obs.table', 'ch14.obs.terms', 'ch14.obs.ratio', 'ch14.obs.tilt'],
    equations: ['A_1 v_1 = A_2 v_2 = Q', 'p + \\tfrac{1}{2}\\rho v^2 + \\rho g y = \\text{const}'],
    assumptions: ['ch14.assume.flow', 'ch14.assume.p', 'ch14.assume.slow'],
  },
};

