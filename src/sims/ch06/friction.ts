// Ch 6 scene: static and kinetic friction. A pull that grows steadily (or a board that tilts
// steadily) meets static friction that matches it up to μs N; then the block slips and the
// friction drops to μk N.
import type { ParamSchema, Scene, Vec2 } from '../../core/types';
import type { Draw, PlotDraw } from '../../draw/draw';
import { drawRich } from '../../draw/text';
import { color, theme } from '../../draw/theme';
import { G, MATERIALS, pullAt, slideAccel, slipTimePull, slipTimeTilt, tiltAt, type FrictionState, type Pull, type Tilt } from './physics';

type P = { mode: string; mat: string };
type S = FrictionState & { t: number; n: number };

const RATE = 240;
const DEG = Math.PI / 180;
const M = 2; // kg
const K = 4; // N/s, growth rate of the pull
const W = 6 * DEG; // rad/s, tilting rate
const AFTER = 1.2; // s of pulling after the slip
const BOARD = 4.2; // m
const S0 = 3.5; // m, block position along the board from the hinge
// m, sliding distance shown on the board: the block stops 1.9 m from the hinge, clear of the θ label
const SLIDE = 1.6;
const B = 0.5; // m, block size
const KF = 0.8 / (M * G); // world m per N: mg is 0.8 m long
const REF = '#8c8c8c';
const BODY = '#5c5c5c';

const pullOf = (p: P): Pull => ({ m: M, k: K, mat: MATERIALS[p.mat] ?? MATERIALS.wood });
const tiltOf = (p: P): Tilt => ({ m: M, w: W, mat: MATERIALS[p.mat] ?? MATERIALS.wood });
const incline = (p: P) => p.mode === 'incline';

function tEnd(p: P): number {
  if (!incline(p)) return slipTimePull(pullOf(p)) + AFTER;
  return slipTimeTilt(tiltOf(p)) + Math.sqrt((2 * SLIDE) / slideAccel(tiltOf(p)));
}

const stateAt = (p: P, t: number): FrictionState => (incline(p) ? tiltAt(tiltOf(p), t) : pullAt(pullOf(p), t));

/** Largest static friction μs N at time t (N changes with the tilt). */
const fsMax = (p: P, s: FrictionState) => (MATERIALS[p.mat] ?? MATERIALS.wood).mus * s.N;

const params: ParamSchema<P> = {
  mode: {
    kind: 'select',
    label: 'ch06.f.p.mode',
    desc: 'ch06.f.d.mode',
    group: 'main',
    live: false,
    default: 'pull',
    options: [
      { value: 'pull', label: 'ch06.f.mode.pull' },
      { value: 'incline', label: 'ch06.f.mode.incline' },
    ],
  },
  mat: {
    kind: 'select',
    label: 'ch06.f.p.mat',
    desc: 'ch06.f.d.mat',
    group: 'main',
    live: false,
    default: 'wood',
    options: [
      { value: 'wood', label: 'ch06.f.mat.wood' },
      { value: 'steel', label: 'ch06.f.mat.steel' },
      { value: 'rubber', label: 'ch06.f.mat.rubber' },
      { value: 'ice', label: 'ch06.f.mat.ice' },
    ],
  },
};

const add = (a: Vec2, b: Vec2, k = 1): Vec2 => ({ x: a.x + b.x * k, y: a.y + b.y * k });

/** Square block standing on the surface at base centre c, along unit u with normal n. */
function block(g: Draw, c: Vec2, u: Vec2, n: Vec2): void {
  const h = B / 2;
  g.polygon([add(c, u, -h), add(c, u, h), add(add(c, u, h), n, B), add(add(c, u, -h), n, B)], { fill: 'position', fillAlpha: 0.9 });
}

const fLabel = (s: FrictionState) => (s.sliding ? '*f*_{k}' : '*f*_{s}');

function drawPull(g: Draw, s: FrictionState): void {
  g.line({ x: -0.5, y: 0 }, { x: 4.3, y: 0 }, { color: BODY, width: 2 });
  const c: Vec2 = { x: 0.4 + B / 2 + s.x, y: 0 };
  const mid: Vec2 = { x: c.x, y: B / 2 };
  block(g, c, { x: 1, y: 0 }, { x: 0, y: 1 });
  g.arrow(mid, { x: 0, y: -M * G * KF }, { role: 'force', width: 2, label: '*m**g*' });
  g.arrow(mid, { x: 0, y: s.N * KF }, { role: 'force', width: 2, label: '*N*' });
  if (s.F > 0) g.arrow({ x: c.x + B / 2, y: B / 2 }, { x: s.F * KF, y: 0 }, { role: 'force', width: 2, label: '*F*' });
  if (s.f > 0) {
    g.arrow({ x: c.x - B / 2, y: 0.02 }, { x: -s.f * KF, y: 0 }, { role: 'force', width: 2.5 });
    g.text({ x: c.x - B / 2 - s.f * KF, y: 0 }, fLabel(s), { size: 13, role: 'force', align: 'center', dy: -12 });
  }
}

function drawTilt(g: Draw, s: FrictionState): void {
  const th = s.theta;
  const u: Vec2 = { x: Math.cos(th), y: Math.sin(th) };
  const n: Vec2 = { x: -Math.sin(th), y: Math.cos(th) };
  const O: Vec2 = { x: 0, y: 0 };
  g.line({ x: -1.25, y: 0 }, { x: 4.8, y: 0 }, { color: BODY, width: 2 });
  g.polygon([O, add(O, u, BOARD), { x: BOARD * u.x, y: 0 }], { fill: '#f1f1f1' });
  g.line(O, add(O, u, BOARD), { color: BODY, width: 3 });
  g.circle(O, 3.5, { fill: BODY });

  // Angle arc at the hinge; its label just left of the hinge, above the ground, where neither
  // the block nor its force arrows ever go (they stay right of the hinge).
  if (th > 0.5 * DEG) g.arc(O, 44, 0, th, { color: BODY, width: 1.25 });
  g.text(O, `*θ* = ${(th / DEG).toFixed(1)}°`, { size: 13, color: BODY, align: 'right', baseline: 'middle', dx: -10, dy: -13 });

  const c = add(O, u, S0 - s.x);
  const mid = add(c, n, B / 2);
  block(g, c, u, n);
  g.arrow(mid, { x: 0, y: -M * G * KF }, { role: 'force', width: 2, label: '*m**g*' });
  g.arrow(mid, { x: n.x * s.N * KF, y: n.y * s.N * KF }, { role: 'force', width: 2, label: '*N*' });
  if (s.f > 0) {
    // Friction runs along the board: label above the tip, off the board line.
    const from = add(add(c, u, B / 2), n, 0.02);
    const vec = { x: u.x * s.f * KF, y: u.y * s.f * KF };
    g.arrow(from, vec, { role: 'force', width: 2.5 });
    g.text(add(add(from, vec), n, g.px(13)), fLabel(s), { size: 13, role: 'force', align: 'center', baseline: 'middle' });
  }
}

/** Text in plot coordinates, offset in px. */
function plotText(pd: PlotDraw, txt: string, t: number, y: number, dx: number, dy: number, col: string, align: CanvasTextAlign): void {
  const [x, py] = pd.toPx(t, y);
  const k = theme.scale;
  drawRich(pd.ctx, txt, x + dx * k, py + dy * k, { size: 12, color: col, align, baseline: 'middle' });
}

export const friction: Scene<P, S> = {
  id: 'friction',
  title: 'ch06.f.scene',
  layout: 'side',
  params,
  time: { h: 1 / RATE, recordEvery: 1, frameStep: 0.1, tEnd: (p) => tEnd(p as P) },

  world: (p) => (incline(p) ? { x: [-1.3, 4.9], y: [-0.7, 3.5], aspect: 'contain', padPx: 16 } : { x: [-0.5, 4.3], y: [-1.1, 1.5], aspect: 'contain', padPx: 16 }),

  init: (p) => ({ t: 0, n: 0, ...stateAt(p, 0) }),

  step: (s, _h, p) => {
    s.n += 1;
    s.t = Math.min(s.n / RATE, tEnd(p));
    Object.assign(s, stateAt(p, s.t));
  },

  record: (s) => ({ t: s.t, f: s.f, v: s.v }),
  snapshot: (s) => ({ ...s }),

  draw: (g, s, p) => (incline(p) ? drawTilt(g, s) : drawPull(g, s)),

  plots: [
    {
      id: 'f',
      label: 'f\\,(\\mathrm{N})',
      traces: [{ channel: 'f', role: 'force' }],
      yRange: (p) => {
        const top = incline(p) ? fsMax(p, stateAt(p, 0)) : K * tEnd(p);
        return [0, top * 1.15];
      },
    },
    {
      id: 'v',
      label: 'v\\,(\\mathrm{m/s})',
      traces: [{ channel: 'v', role: 'velocity' }],
      yRange: (p) => [0, Math.max(stateAt(p, tEnd(p)).v, 0.5) * 1.15],
    },
  ],

  // Reference curves under the friction trace: μs N and μk N, and the applied pull F (dashed).
  drawPlot: (id, pd, p) => {
    if (id !== 'f') return;
    const mat = MATERIALS[p.mat] ?? MATERIALS.wood;
    const T = tEnd(p);
    const N = 200;
    const curve = (mu: number): [number, number][] =>
      Array.from({ length: N + 1 }, (_, i) => {
        const t = (T * i) / N;
        return [t, mu * stateAt(p, t).N];
      });
    pd.polyline(curve(mat.mus), { color: REF, width: 1.25, dash: [2, 3] });
    pd.polyline(curve(mat.muk), { color: REF, width: 1.25, dash: [2, 3] });
    const tl = 0.2 * T;
    plotText(pd, '*μ*_{s}*N*', tl, mat.mus * stateAt(p, tl).N, 0, -9, REF, 'center');
    plotText(pd, '*μ*_{k}*N*', tl, mat.muk * stateAt(p, tl).N, 0, 10, REF, 'center');
    if (!incline(p)) {
      pd.polyline(
        [
          [0, 0],
          [T, K * T],
        ],
        { role: 'force', width: 1.5, dash: [6, 4], alpha: 0.7 },
      );
      plotText(pd, '*F*', 0.95 * T, K * 0.95 * T, -6, -4, color('force'), 'right');
    }
  },

  readouts: [
    { label: 'f', unit: 'N', value: (s) => s.f },
    { label: '\\mu_s N', unit: 'N', value: (s, p) => fsMax(p, s) },
    { label: 'v', unit: 'm/s', value: (s) => s.v },
  ],

  info: {
    goals: ['ch06.f.goal.static', 'ch06.f.goal.kinetic'],
    observe: ['ch06.f.obs.match', 'ch06.f.obs.drop', 'ch06.f.obs.angle', 'ch06.f.obs.mat'],
    equations: ['f_s \\le \\mu_s N, \\quad f_k = \\mu_k N', '\\tan\\theta_c = \\mu_s'],
    assumptions: ['ch06.f.assume'],
  },
};
