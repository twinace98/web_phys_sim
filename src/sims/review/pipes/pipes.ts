// Standing sound waves in a pipe. Stacked and sharing one x axis: the pipe with columns of air
// particles moving back and forth, the displacement s(x, t) and the pressure Δp(x, t) with their
// envelopes and nodes (N) and antinodes (A). The animation is slowed to one cycle every 2 s.
import type { ParamSchema, Scene, Vec2 } from '../../../core/types';
import type { Draw } from '../../../draw/draw';
import { color, withAlpha } from '../../../draw/theme';
import { W, linePx, textPx } from '../../modern/frame';
import { soundTick } from '../../ch17/audio';
import {
  V_SOUND,
  displacementAntinodes,
  displacementNodes,
  displacementShape,
  frequency,
  pressureShape,
  wavelength,
  waveNumber,
  type PipeType,
} from './physics';
import { tn, u } from './tex';

type P = { type: PipeType; nOpen: number; nClosed: number; L: number; sound: boolean };
type S = { t: number };

/** Shown cycles per second of the slowed animation. */
export const F_SHOW = 0.5;
const STEEL = '#5c5c5c';
const DOT = '#a0a0a0';
const LABEL = '#6b6b6b';
const ENV = '#9a9a9a';
const GUIDE = '#dadada';

export const harmonicOf = (p: P) => (p.type === 'open' ? p.nOpen : p.nClosed);

const params: ParamSchema<P> = {
  type: {
    kind: 'select',
    label: 'pipes.p.type',
    desc: 'pipes.d.type',
    group: 'main',
    live: true,
    default: 'open',
    options: [
      { value: 'open', label: 'pipes.type.open' },
      { value: 'closed', label: 'pipes.type.closed' },
    ],
  },
  nOpen: {
    kind: 'number',
    label: 'pipes.p.n',
    desc: 'pipes.d.nOpen',
    group: 'main',
    live: true,
    control: 'stepper',
    min: 1,
    max: 8,
    step: 1,
    default: 1,
    visibleIf: (p) => p.type === 'open',
  },
  nClosed: {
    kind: 'number',
    label: 'pipes.p.n',
    desc: 'pipes.d.nClosed',
    group: 'main',
    live: true,
    control: 'stepper',
    min: 1,
    max: 15,
    step: 2,
    default: 1,
    visibleIf: (p) => p.type === 'closed',
  },
  L: {
    kind: 'number',
    label: 'pipes.p.L',
    desc: 'pipes.d.L',
    group: 'advanced',
    live: true,
    control: 'slider',
    min: 0.25,
    max: 2,
    step: 0.01,
    default: 1,
    unit: 'm',
  },
  sound: { kind: 'toggle', label: 'pipes.p.sound', desc: 'pipes.d.sound', group: 'advanced', live: true, default: false },
};

export interface Rows {
  /** Pipe from x = 0 to L spans [xl, xr] px. */
  xl: number;
  xr: number;
  pipe: [number, number];
  disp: [number, number];
  pres: [number, number];
}

/** Stacked rows in px: pipe, displacement, pressure (each with a row of N/A letters below the graphs). */
export function rows(w: number, h: number): Rows {
  const pad = 12;
  const xl = 44;
  const xr = w - 26;
  const letters = 18;
  const gap = Math.max(10, h * 0.04);
  const avail = h - 2 * pad - 2 * letters - 2 * gap;
  const ph = Math.min(avail * 0.3, 150);
  const gh = (avail - ph) / 2;
  const t0 = pad;
  const pipe: [number, number] = [t0, t0 + ph];
  const disp: [number, number] = [pipe[1] + gap, pipe[1] + gap + gh];
  const pres: [number, number] = [disp[1] + letters + gap, disp[1] + letters + gap + gh];
  return { xl, xr, pipe, disp, pres };
}

function graph(
  g: Draw,
  R: Rows,
  [top, bot]: [number, number],
  shape: (x: number) => number,
  phase: number,
  role: 'position' | 'force',
  label: string,
  nodes: number[],
  antinodes: number[],
  L: number,
): void {
  const ym = (top + bot) / 2;
  const amp = (bot - top) / 2 - 4;
  const X = (x: number) => R.xl + ((R.xr - R.xl) * x) / L;
  linePx(g, R.xl, ym, R.xr, ym, { role: 'axis', width: 1 });
  linePx(g, R.xl, top, R.xl, bot, { role: 'axis', width: 1 });
  const N = 240;
  const env: Vec2[][] = [[], []];
  const cur: Vec2[] = [];
  for (let i = 0; i <= N; i++) {
    const x = (L * i) / N;
    const a = shape(x);
    env[0].push(W(g, X(x), ym - amp * Math.abs(a)));
    env[1].push(W(g, X(x), ym + amp * Math.abs(a)));
    cur.push(W(g, X(x), ym - amp * a * Math.cos(phase)));
  }
  for (const e of env) g.polyline(e, { color: ENV, width: 1.25, dash: [5, 4] });
  g.polyline(cur, { role, width: 2.25 });
  textPx(g, R.xl - 12, ym, label, { size: 15, color: role, align: 'right', baseline: 'middle' });
  const lt = { size: 12, color: LABEL, align: 'center' as const, baseline: 'middle' as const };
  for (const x of nodes) textPx(g, X(x), bot + 11, 'N', lt);
  for (const x of antinodes) textPx(g, X(x), bot + 11, 'A', lt);
}

export const pipesScene: Scene<P, S> = {
  id: 'pipes',
  title: 'pipes.scene',
  params,
  time: { h: 1 / 120, recordEvery: 1, frameStep: 0.05, unit: '' },
  world: () => ({ x: [0, 1], y: [0, 1], aspect: 'contain', padPx: 0 }),
  init: () => ({ t: 0 }),
  step: (s, h) => {
    s.t += h;
  },
  snapshot: (s) => ({ ...s }),

  draw: (g, s, p, ui) => {
    const n = harmonicOf(p);
    const L = p.L;
    soundTick(p.sound, frequency(p.type, L, n), frequency(p.type, L, n));
    const R = rows(g.vp.w, g.vp.h);
    const phase = 2 * Math.PI * F_SHOW * (ui?.tFrame ?? s.t);
    const X = (x: number) => R.xl + ((R.xr - R.xl) * x) / L;
    const nodes = displacementNodes(p.type, L, n);
    const anti = displacementAntinodes(p.type, L, n);

    // Guides through the displacement nodes (= pressure antinodes), pipe to pressure graph.
    for (const x of nodes) linePx(g, X(x), R.pipe[0], X(x), R.pres[1], { color: GUIDE, width: 1, dash: [2, 3] });

    // Pipe: walls, closed end, particles.
    const [pt, pb] = R.pipe;
    const pw = R.xr - R.xl;
    const lam = (wavelength(p.type, L, n) / L) * pw; // px
    // Shown displacement: a strain s k of at most 0.6 (columns never cross), and at most 15 % of the pipe.
    const sPx = Math.min((0.6 * lam) / (2 * Math.PI), 0.15 * pw);
    const k = waveNumber(p.type, L, n);
    const cols = Math.max(16, Math.round(pw / 9));
    const every = Math.max(5, Math.round(cols / 8));
    // Columns continue past an open end (air moving in and out); everything is clipped to the pipe.
    const ext = Math.ceil(sPx / (pw / cols)) + 1;
    const j1 = p.type === 'closed' ? cols : cols + ext;
    const nRow = Math.max(3, Math.min(9, Math.round((pb - pt) / 13)));
    const ctx = g.ctx;
    // Compressions (Δp > 0) tinted in the pressure colour.
    ctx.save();
    const strip = 3;
    for (let xp = R.xl; xp < R.xr; xp += strip) {
      const dp = pressureShape(p.type, L, n, ((xp + strip / 2 - R.xl) / pw) * L) * Math.cos(phase);
      if (dp <= 0.02) continue;
      ctx.fillStyle = withAlpha(color('force'), 0.3 * dp);
      ctx.fillRect(xp, pt, Math.min(strip, R.xr - xp), pb - pt);
    }
    ctx.restore();
    ctx.save();
    ctx.beginPath();
    ctx.rect(R.xl, pt + 3, pw, pb - pt - 6);
    ctx.clip();
    for (let j = -ext; j < j1; j++) {
      const x0 = (L * (j + 0.5)) / cols;
      const xd = X(x0) + sPx * Math.cos(k * x0) * Math.cos(phase);
      const tracer = j >= 0 && j < cols && j % every === Math.floor(every / 2);
      for (let r = 0; r < nRow; r++) {
        const y = pt + ((pb - pt) * (r + 0.5)) / nRow;
        g.circle(W(g, xd, y), tracer ? 2.6 : 1.9, { fill: tracer ? 'position' : DOT });
      }
    }
    ctx.restore();
    const wall = { color: STEEL, width: 3 };
    linePx(g, R.xl, pt, R.xr, pt, wall);
    linePx(g, R.xl, pb, R.xr, pb, wall);
    if (p.type === 'closed') linePx(g, R.xr, pt - 1.5, R.xr, pb + 1.5, { color: STEEL, width: 5 });

    graph(g, R, R.disp, (x) => displacementShape(p.type, L, n, x), phase, 'position', '*s*', nodes, anti, L);
    graph(g, R, R.pres, (x) => pressureShape(p.type, L, n, x), phase, 'force', 'Δ*p*', anti, nodes, L);
  },

  readouts: [
    { label: 'f_n', unit: 'Hz', sig: 4, value: (_s, p) => frequency(p.type, p.L, harmonicOf(p)) },
    { label: '\\lambda_n', unit: 'm', value: (_s, p) => wavelength(p.type, p.L, harmonicOf(p)) },
  ],

  formula: (_s, p) => {
    const n = harmonicOf(p);
    const L = p.L.toFixed(2);
    const lam = wavelength(p.type, p.L, n);
    const f = frequency(p.type, p.L, n);
    const f1 = frequency(p.type, p.L, 1);
    const open = p.type === 'open';
    const c = open ? 2 : 4;
    return [
      `\\lambda_n = \\frac{${c}L}{n} = \\frac{${c} \\times ${L}}{${n}} = ${tn(lam)}${u('m')}`,
      `f_n = \\frac{v}{\\lambda_n} = \\frac{nv}{${c}L} = \\frac{${n} \\times ${V_SOUND}}{${c} \\times ${L}} = ${tn(f, 4)}${u('Hz')}`,
      `n = ${open ? '1, 2, 3' : '1, 3, 5'}, \\dots,\\quad f_n = n f_1,\\ f_1 = ${tn(f1, 4)}${u('Hz')}`,
    ];
  },

  info: {
    goals: ['pipes.goal.ends', 'pipes.goal.harm'],
    observe: ['pipes.obs.open1', 'pipes.obs.dots', 'pipes.obs.np', 'pipes.obs.closed', 'pipes.obs.L', 'pipes.obs.sound'],
    equations: [
      '\\Delta p = -B\\frac{\\partial s}{\\partial x}',
      '\\lambda = \\frac{2L}{n},\\ f = \\frac{nv}{2L} \\quad (n = 1, 2, 3, \\dots)',
      '\\lambda = \\frac{4L}{n},\\ f = \\frac{nv}{4L} \\quad (n = 1, 3, 5, \\dots)',
    ],
    assumptions: ['pipes.assume.v', 'pipes.assume.end', 'pipes.assume.graph', 'pipes.assume.slow'],
  },
};
