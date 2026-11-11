// Ch 20 scene: free expansion. The partition is removed at t = 0; the macrostate n (particles in
// the left half) wanders towards N/2, where the number of microstates W = C(N, n) is largest.
import { fmtTick } from '../../core/format';
import type { ParamSchema, Scene, Vec2 } from '../../core/types';
import type { Draw } from '../../draw/draw';
import { drawRich } from '../../draw/text';
import { ROLE_COLOR, theme } from '../../draw/theme';
import { chart, inPanel, split, stageRect, TICK, type Rect } from '../ch18/panels';
import { entropyLR, initParticles, leftCount, lnBinom, moveParticles, type Particles } from './physics';

type P = { N: number };
interface S {
  t: number;
  part: Particles;
  n: number;
}

const BLUE = ROLE_COLOR.position;
const HL = ROLE_COLOR.velocity;
const WALL = '#5c5c5c';

const Smax = (N: number) => lnBinom(N, Math.floor(N / 2));

const params: ParamSchema<P> = {
  N: {
    kind: 'number',
    label: 'ch20.p.N',
    desc: 'ch20.d.N',
    group: 'main',
    live: false,
    control: 'select',
    choices: [4, 10, 100, 1000],
    default: 10,
  },
};

function drawBox(g: Draw, r: Rect, s: S, p: P): void {
  inPanel(g, r, { x: [-0.05, 2.05], y: [-0.05, 1.12], aspect: 'contain', padPx: 8 }, (d) => {
    const box: Vec2[] = [
      { x: 0, y: 0 },
      { x: 2, y: 0 },
      { x: 2, y: 1 },
      { x: 0, y: 1 },
      { x: 0, y: 0 },
    ];
    d.polyline(box, { color: WALL, width: 2.5 });
    if (s.t === 0) d.line({ x: 1, y: 0 }, { x: 1, y: 1 }, { color: WALL, width: 4 });
    else d.line({ x: 1, y: 0 }, { x: 1, y: 1 }, { color: '#c8c8c8', width: 1, dash: [4, 5] });
    const rPx = p.N <= 10 ? 7 : p.N <= 100 ? 4 : 2.2;
    const pt = s.part;
    for (let i = 0; i < pt.N; i++) d.circle({ x: pt.x[i], y: pt.y[i] }, rPx, { fill: BLUE });
    d.text({ x: 0.5, y: 1 }, `*n* = ${s.n}`, { size: 13, color: '#1a1a1a', align: 'center', dy: -8 });
    d.text({ x: 1.5, y: 1 }, `*N* − *n* = ${p.N - s.n}`, { size: 13, color: '#1a1a1a', align: 'center', dy: -8 });
  });
}

/** W(n) for every macrostate, the current one highlighted. */
function drawW(g: Draw, r: Rect, s: S, p: P): void {
  const N = p.N;
  const lm = Smax(N);
  const small = N <= 10;
  const yTop = small ? Math.exp(lm) * 1.18 : 1.12;
  const wOf = (n: number) => (small ? Math.exp(lnBinom(N, n)) : Math.exp(lnBinom(N, n) - lm));
  chart(g, r, [-0.6, N + 0.6], [0, yTop], { l: small ? 40 : 34, r: 14, t: 20, b: 36 }, (c) => {
    c.axes({
      xLabel: '*n*',
      yLabel: small ? '*W*' : '*W* / *W*_{max}',
      xTickList: N <= 10 ? Array.from({ length: N + 1 }, (_, k) => k) : undefined,
      yTicks: small ? 4 : 2,
    });
    const half = Math.max(0.5, Math.min(14, (c.X(1) - c.X(0)) * 0.36));
    const bar = (n: number, col: string, a: number) => {
      const h = wOf(n);
      if (c.Y(h) - c.Y(0) < 0.5) return;
      c.d.polygon(
        [
          { x: c.X(n) - half, y: c.Y(0) },
          { x: c.X(n) + half, y: c.Y(0) },
          { x: c.X(n) + half, y: c.Y(h) },
          { x: c.X(n) - half, y: c.Y(h) },
        ],
        { fill: col, fillAlpha: a },
      );
    };
    if (N <= 100) for (let n = 0; n <= N; n++) bar(n, BLUE, 0.35);
    else {
      const pts: Vec2[] = [c.P(0, 0)];
      for (let n = 0; n <= N; n++) pts.push(c.P(n, wOf(n)));
      pts.push(c.P(N, 0));
      c.d.polygon(pts, { fill: BLUE, fillAlpha: 0.35 });
    }
    if (small) {
      for (let n = 0; n <= N; n++) c.d.text(c.P(n, wOf(n)), fmtTick(wOf(n)), { size: 11, color: TICK, align: 'center', dy: -5 });
    }
    // Current macrostate: highlighted bar and a marker on the axis.
    const hn = Math.max(half, 1.5);
    const h = wOf(s.n);
    c.d.polygon(
      [
        { x: c.X(s.n) - hn, y: c.Y(0) },
        { x: c.X(s.n) + hn, y: c.Y(0) },
        { x: c.X(s.n) + hn, y: Math.max(c.Y(h), c.Y(0) + 2) },
        { x: c.X(s.n) - hn, y: Math.max(c.Y(h), c.Y(0) + 2) },
      ],
      { fill: HL, fillAlpha: 0.9 },
    );
    c.d.polygon(
      [
        { x: c.X(s.n), y: c.Y(0) - 1 },
        { x: c.X(s.n) - 5, y: c.Y(0) - 9 },
        { x: c.X(s.n) + 5, y: c.Y(0) - 9 },
      ],
      { fill: HL },
    );
  });
}

export const expansionScene: Scene<P, S> = {
  id: 'expansion',
  title: 'ch20.scene.expansion',
  params,
  time: { h: 1 / 60, recordEvery: 2, frameStep: 0.1, window: 30 },
  world: () => ({ x: [0, 1], y: [0, 1], aspect: 'contain' }),
  init: (p, rng) => {
    const part = initParticles(p.N, rng);
    return { t: 0, part, n: leftCount(part) };
  },
  step: (s, h) => {
    s.t += h;
    moveParticles(s.part, h);
    s.n = leftCount(s.part);
  },
  record: (s, p) => ({ t: s.t, n: s.n, S: entropyLR(p.N, s.n) }),

  draw: (g, s, p) => {
    const full = stageRect(g);
    const [box, w] = full.w > 1.9 * full.h ? split(full, 'row', [1.2, 1], 10) : split(full, 'col', [1, 1], 6);
    drawBox(g, box, s, p);
    drawW(g, w, s, p);
  },

  plots: [
    { id: 'n', label: 'n', traces: [{ channel: 'n', role: 'position' }], yRange: (p) => [0, p.N * 1.05] },
    { id: 'S', label: 'S/k = \\ln W', traces: [{ channel: 'S', role: 'fg' }], yRange: (p) => [0, Math.max(1, Smax(p.N) * 1.15)] },
  ],

  drawPlot: (id, pd, p) => {
    const y = id === 'n' ? p.N / 2 : Smax(p.N);
    const [x0] = pd.toPx(0, y);
    const st = { color: '#1a1a1a', width: 1, dash: [5, 4], alpha: 0.6 };
    pd.polyline([[-1e6, y], [1e6, y]], st);
    const [, py] = pd.toPx(0, y);
    const lbl = id === 'n' ? '*N*/2' : '*S*_{max}';
    drawRich(pd.ctx, lbl, x0 + 6 * theme.scale, py - 5 * theme.scale, { size: 11, color: TICK });
  },

  readouts: [
    { label: 'n', unit: '', value: (s) => s.n, sig: 1 },
    { label: 'W', unit: '', value: (s, p) => Math.exp(lnBinom(p.N, s.n)) },
    { label: 'S/k', unit: '', value: (s, p) => entropyLR(p.N, s.n) },
  ],

  info: {
    goals: ['ch20.e.goal.S', 'ch20.e.goal.irr'],
    observe: ['ch20.e.obs.peak', 'ch20.e.obs.small', 'ch20.e.obs.large', 'ch20.e.obs.S'],
    equations: ['W(n) = \\binom{N}{n} = \\frac{N!}{n!\\,(N-n)!}', 'S = k \\ln W', 'P(n = N) = \\frac{1}{2^N}'],
    assumptions: ['ch20.e.assume'],
  },
};
