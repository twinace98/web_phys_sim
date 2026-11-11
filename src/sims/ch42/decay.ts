// Ch 42 scene: a grid of N0 nuclei, each decaying at its own random moment. The count left,
// N(t), is a staircase that follows N0 e^{−λt} more closely the larger N0 is; it halves every T½.
import type { ParamSchema, Scene } from '../../core/types';
import type { Draw } from '../../draw/draw';
import { drawRich, measureRich } from '../../draw/text';
import { ROLE_COLOR, theme } from '../../draw/theme';
import { ISOTOPES, decayTimes, expected, isotope, remaining } from './physics';

type P = { iso: string; N0: number };
interface S {
  t: number;
  /** Decay time of each nucleus, in grid order (never mutated, so snapshots share it). */
  times: Float64Array;
  sorted: Float64Array;
}

const PARENT = ROLE_COLOR.position;
const DAUGHTER = '#dadada';
const FRESH = ROLE_COLOR.energyU;
const TICK = '#6b6b6b';
/** Half-lives shown on the time axis. */
const SPAN = 5;

const tEndOf = (p: P) => SPAN * isotope(p.iso).half;

const params: ParamSchema<P> = {
  iso: {
    kind: 'select',
    label: 'ch42.p.iso',
    desc: 'ch42.d.iso',
    group: 'main',
    live: false,
    default: 'c14',
    options: ISOTOPES.map((i) => ({ value: i.id, label: `ch42.iso.${i.id}` })),
  },
  N0: {
    kind: 'number',
    label: 'ch42.p.N0',
    desc: 'ch42.d.N0',
    group: 'main',
    live: false,
    control: 'select',
    choices: [10, 100, 1000, 10000],
    default: 1000,
  },
};

function drawGrid(g: Draw, s: S, p: P): void {
  const { ctx } = g;
  const sc = theme.scale;
  const W = g.vp.w;
  const H = g.vp.h;
  const iso = isotope(p.iso);
  const N = s.times.length;

  // Legend: parent and daughter.
  const ly = 22 * sc;
  let lx = 18 * sc;
  for (const [col, name] of [
    [PARENT, iso.parent],
    [DAUGHTER, iso.daughter],
  ] as const) {
    ctx.beginPath();
    ctx.arc(lx + 6 * sc, ly - 4 * sc, 6 * sc, 0, 2 * Math.PI);
    ctx.fillStyle = col;
    ctx.fill();
    lx += 18 * sc;
    lx += drawRich(ctx, name, lx, ly, { size: 14, color: '#1a1a1a' }) + 22 * sc;
  }

  const top = 40 * sc;
  const pad = 16 * sc;
  const aw = Math.max(10, W - 2 * pad);
  const ah = Math.max(10, H - top - pad);
  const cols = Math.max(1, Math.min(N, Math.round(Math.sqrt((N * aw) / ah))));
  const rows = Math.ceil(N / cols);
  const cell = Math.min(aw / cols, ah / rows, 64 * sc);
  const x0 = pad + (aw - cell * cols) / 2;
  const y0 = top + (ah - cell * rows) / 2;
  const fresh = 0.06 * iso.half;
  const kind = (i: number) => (s.times[i] > s.t ? 0 : s.t - s.times[i] < fresh ? 2 : 1);
  ctx.save();
  if (N <= 1000) {
    // Discs, one path per colour.
    const paths = [new Path2D(), new Path2D(), new Path2D()];
    const r = cell * 0.4;
    for (let i = 0; i < N; i++) {
      const cx = x0 + (i % cols) * cell + cell / 2;
      const cy = y0 + Math.floor(i / cols) * cell + cell / 2;
      const k = kind(i);
      paths[k].moveTo(cx + r, cy);
      paths[k].arc(cx, cy, r, 0, 2 * Math.PI);
    }
    [PARENT, DAUGHTER, FRESH].forEach((c, k) => {
      ctx.fillStyle = c;
      ctx.fill(paths[k]);
    });
  } else {
    // Many nuclei: plain squares (a single path with thousands of arcs rasterises slowly).
    const sq = cell * 0.82;
    [PARENT, DAUGHTER, FRESH].forEach((c, k) => {
      ctx.fillStyle = c;
      for (let i = 0; i < N; i++) {
        if (kind(i) !== k) continue;
        ctx.fillRect(x0 + (i % cols) * cell + (cell - sq) / 2, y0 + Math.floor(i / cols) * cell + (cell - sq) / 2, sq, sq);
      }
    });
  }
  ctx.restore();
}

export const decayScene: Scene<P, S> = {
  id: 'decay',
  title: 'ch42.scene',
  params,
  time: { h: 0.01, recordEvery: 2, frameStep: 0.1, tEnd: (p) => tEndOf(p as P), scale: 2, unit: (p) => isotope(String(p.iso)).unit },
  world: () => ({ x: [0, 1], y: [0, 1], aspect: 'contain' }),
  init: (p, rng) => {
    const times = decayTimes(p.N0, isotope(p.iso).half, rng);
    return { t: 0, times, sorted: Float64Array.from(times).sort() };
  },
  step: (s, h) => {
    s.t += h;
  },
  record: (s, p) => ({ t: s.t, N: remaining(s.sorted, s.t), Nexp: expected(p.N0, isotope(p.iso).half, s.t) }),
  snapshot: (s) => ({ ...s }),

  draw: (g, s, p) => drawGrid(g, s, p),

  plots: [
    {
      id: 'N',
      label: 'N',
      traces: [{ channel: 'N', role: 'position' }],
      yRange: (p) => [0, p.N0 * 1.08],
    },
  ],

  // N0 e^{−λt} (dashed) and the half-life marks: N0/2, N0/4, ... at T½, 2T½, ...
  drawPlot: (_id, pd, p) => {
    const half = isotope(p.iso).half;
    const tEnd = tEndOf(p);
    const pts: [number, number][] = [];
    for (let i = 0; i <= 200; i++) {
      const t = (tEnd * i) / 200;
      pts.push([t, expected(p.N0, half, t)]);
    }
    const guide = { color: '#9a9a9a', width: 1, dash: [3, 4] };
    const { ctx } = pd;
    const sc = theme.scale;
    // Labels: kT½ in a row along the top of the plot, where neither the expected curve nor the
    // count (both ≤ N0/2 for t ≥ T½) can reach them; each vertical guide runs up to its label.
    // N0/2^k under each level line, ending just before its kT½ guide: left of kT½ both the expected
    // curve and the count lie above that level. Skipped where the next level is too close.
    const baseY = pd.toPx(0, 0)[1];
    const topY = pd.toPx(0, p.N0 * 1.08)[1];
    for (let k = 1; k <= 3; k++) {
      const t = k * half;
      const n = p.N0 / 2 ** k;
      pd.polyline([[0, n], [t, n]], guide);
      const [x, y] = pd.toPx(t, n);
      const lbl = k === 1 ? '*T*_{1/2}' : `${k}*T*_{1/2}`;
      const lw = measureRich(ctx, lbl, { size: 11 });
      const ly = topY + 12 * sc;
      const yGuide = (p.N0 * 1.08 * (baseY - (ly + 4 * sc))) / (baseY - topY);
      pd.polyline([[t, 0], [t, yGuide]], guide);
      drawRich(ctx, lbl, x - lw / 2, ly, { size: 11, color: TICK });
      const [x0] = pd.toPx(0, n);
      const txt = `*N*_{0}/${2 ** k}`;
      const w = measureRich(ctx, txt, { size: 11 });
      const gapBelow = pd.toPx(0, n / 2)[1] - y;
      const lx = Math.max(x0 + 4 * sc, x - w - 5 * sc);
      if (gapBelow >= 15 * sc && x - x0 > w + 9 * sc) drawRich(ctx, txt, lx, y + 3 * sc, { size: 11, color: TICK, baseline: 'top' });
    }
    pd.polyline(pts, { color: '#1a1a1a', width: 1.5, dash: [6, 4] });
  },

  readouts: [
    { label: 'N', unit: '', value: (s) => remaining(s.sorted, s.t), sig: 1 },
    { label: 'N/N_0', unit: '', value: (s, p) => remaining(s.sorted, s.t) / p.N0 },
    { label: 't/T_{1/2}', unit: '', value: (s, p) => s.t / isotope(p.iso).half },
  ],

  info: {
    goals: ['ch42.goal.random', 'ch42.goal.half'],
    observe: ['ch42.obs.single', 'ch42.obs.half', 'ch42.obs.small', 'ch42.obs.large', 'ch42.obs.iso'],
    equations: ['N(t) = N_0\\,e^{-\\lambda t} = N_0 \\left(\\tfrac{1}{2}\\right)^{t/T_{1/2}}', 'T_{1/2} = \\frac{\\ln 2}{\\lambda}', 'R = -\\frac{dN}{dt} = \\lambda N'],
    assumptions: ['ch42.assume.indep', 'ch42.assume.daughter'],
  },
};
