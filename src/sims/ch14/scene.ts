// Ch 14 scene: Venturi tube. Tracers spread out in the throat (continuity), the standpipe
// column drops there (Bernoulli), and a table under each tap lists every term.
import { fmt } from '../../core/format';
import { t } from '../../core/i18n';
import type { ParamSchema, Scene, Vec2 } from '../../core/types';
import type { Draw } from '../../draw/draw';
import { TAPS, TUBE, TravelTime, axisY, radiusAt, taps, type Tap, type Venturi } from './physics';

type P = { ratio: number; Q: number; dy: number };

const A1 = 0.01; // wide cross-section: 100 cm²
const SPACING = 0.08; // tracer column spacing in the wide part [m]
const ROWS = [-0.7, -0.35, 0, 0.35, 0.7]; // tracer rows as fractions of the local radius
const W_PIPE = 0.012; // standpipe inner half-width [m]
const WALL = '#5c5c5c';
const WATER = '#dcebf6';
const TRACER = '#0072B2';
const LABEL = '#6b6b6b';
const ROW_PX = 19;

const venturiOf = (p: P): Venturi => ({ A1, ratio: p.ratio, Q: p.Q / 1000, dy: p.dy / 100 });

let memoKey = '';
let memo: { v: Venturi; tt: TravelTime; tp: Tap[]; top: number } | null = null;
function model(p: P) {
  const key = `${p.ratio}|${p.Q}|${p.dy}`;
  if (key !== memoKey || !memo) {
    const v = venturiOf(p);
    const tp = taps(v);
    memo = { v, tt: new TravelTime(v), tp, top: Math.max(...tp.map((q) => q.level)) + 0.06 };
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
    live: false,
    control: 'select',
    choices: [0.4, 0.5, 0.7, 1],
    default: 0.5,
  },
  Q: {
    kind: 'number',
    label: 'ch14.p.Q',
    desc: 'ch14.d.Q',
    group: 'main',
    live: false,
    control: 'select',
    choices: [5, 10, 15],
    default: 10,
    unit: 'L/s',
  },
  dy: {
    kind: 'number',
    label: 'ch14.p.dy',
    desc: 'ch14.d.dy',
    group: 'advanced',
    live: false,
    control: 'select',
    choices: [0, 10, 20],
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

function drawTable(g: Draw, tp: Tap[], yTop: number): void {
  const rows: [string, string, (q: Tap) => string][] = [
    ['*A*', 'cm²', (q) => fmt(q.A * 1e4, 3)],
    ['*v*', 'm/s', (q) => fmt(q.v, 3)],
    ['*Av*', 'L/s', (q) => fmt(q.flow * 1000, 3)],
    ['*p*', 'kPa', (q) => f2(q.p / 1000)],
    ['½*ρv*^{2}', 'kPa', (q) => f2(q.dyn / 1000)],
    ['*ρgy*', 'kPa', (q) => f2(q.grav / 1000)],
    [t('ch14.sum'), 'kPa', (q) => f2(q.sum / 1000)],
  ];
  const head = { size: 12, color: LABEL, baseline: 'middle' as const };
  const x0 = -0.07;
  const xu = TAPS[2] + 0.13;
  TAPS.forEach((x, i) => g.text({ x, y: yTop }, String(i + 1), { size: 13, color: '#1a1a1a', align: 'center', baseline: 'middle', weight: 600 }));
  rows.forEach(([label, unit, val], r) => {
    const dy = ROW_PX * (r + 1);
    g.text({ x: x0, y: yTop }, label, { ...head, dy });
    g.text({ x: xu, y: yTop }, unit, { ...head, dy });
    TAPS.forEach((x, i) => g.text({ x, y: yTop }, val(tp[i]), { size: 12, color: '#1a1a1a', align: 'center', baseline: 'middle', dy }));
  });
  // Rule under the section numbers.
  const yr = yTop - g.px(ROW_PX / 2);
  g.line({ x: x0, y: yr }, { x: xu + 0.06, y: yr }, { color: '#d0d0d0', width: 1 });
}

export const venturi: Scene<P, { t: number }> = {
  id: 'venturi',
  title: 'ch14.scene',
  params,
  time: { h: 1 / 120, recordEvery: 4, frameStep: 0.05, scale: 0.25 },

  world: (p) => {
    const { top } = model(p);
    const r1 = Math.sqrt(A1 / Math.PI);
    return { x: [-0.08, TUBE.L + 0.06], y: [-r1 - 0.42, top + 0.02], aspect: 'contain', padPx: 16 };
  },

  init: () => ({ t: 0 }),
  step: (s, h) => {
    s.t += h;
  },

  draw: (g, s, p) => {
    const { v, tt, tp, top } = model(p);
    const upper = wall(v, 1);
    const lower = wall(v, -1);
    g.polygon([...upper, ...lower.slice().reverse()], { fill: WATER });

    // Standpipes: water column from the top wall up to the level p/(ρg) above the axis.
    TAPS.forEach((x, i) => {
      const yw = axisY(v, x) + radiusAt(v, x);
      const lvl = tp[i].level;
      const yTop = top - 0.02;
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
      g.line({ x: x - W_PIPE, y: yw }, { x: x - W_PIPE, y: yTop }, { color: WALL, width: 1.5 });
      g.line({ x: x + W_PIPE, y: yw }, { x: x + W_PIPE, y: yTop }, { color: WALL, width: 1.5 });
    });
    // Inlet level carried across, so the drop at the throat reads at a glance.
    g.line({ x: TAPS[0] + W_PIPE, y: tp[0].level }, { x: TAPS[2] + 0.1, y: tp[0].level }, { color: LABEL, width: 1, dash: [4, 4] });

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
    const kMin = Math.ceil((s.t - tt.total) / dt);
    const kMax = Math.floor(s.t / dt);
    for (let k = kMin; k <= kMax; k++) {
      const x = tt.xAt(s.t - k * dt);
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

  info: {
    goals: ['ch14.goal.cont', 'ch14.goal.bern'],
    observe: ['ch14.obs.tracer', 'ch14.obs.column', 'ch14.obs.table', 'ch14.obs.ratio', 'ch14.obs.tilt'],
    equations: ['A_1 v_1 = A_2 v_2 = Q', 'p + \\tfrac{1}{2}\\rho v^2 + \\rho g y = \\text{const}'],
    assumptions: ['ch14.assume.flow', 'ch14.assume.p', 'ch14.assume.slow'],
  },
};

