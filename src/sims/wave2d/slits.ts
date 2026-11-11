// Shared pieces of the slit scenes (Ch 35 double slit, Ch 36 single slit): field cache,
// screen intensity accumulation, barrier, screen strip and the intensity graph.
import type { Vec2 } from '../../core/types';
import type { Draw } from '../../draw/draw';
import { Inset, TICK, boxText } from '../inset/inset';
import { C_LIGHT, WaveField, type Aperture } from './field';
import { css } from './view';

/** Plane-wave front at t = 0, field half-height, screen samples [μm]. */
export const XL = -4;
export const Y0 = -12;
export const Y1 = 12;
export const SCREEN_N = 241;
/** Barrier thickness and the smallest drawn opening [μm]. */
export const WALL = 0.35;
const MIN_GAP = 0.3;
/** Screen strip width, gap to the graph and graph width [μm]. */
export const STRIP = 0.6;
const GAP = 2.8;
export const GRAPH_W = 6.5;
/** Fixed physics step [fs] and time-average length after the wave reaches the screen. */
export const H_FS = 0.1;
const AVG_PERIODS = 24;

let memoKey = '';
let memo: WaveField | null = null;

export function fieldFor(lambdaNm: number, apertures: Aperture[], D: number): WaveField {
  const key = `${lambdaNm}|${D}|${apertures.map((a) => `${a.yc},${a.w}`).join(';')}`;
  if (key !== memoKey || !memo) {
    memo = new WaveField({ lambda: lambdaNm / 1000, apertures, xL: XL, x1: D, y0: Y0, y1: Y1, screenX: D, screenN: SCREEN_N });
    memoKey = key;
  }
  return memo;
}

export interface SlitState {
  t: number;
  /** ∫ ψ² dt at each screen sample. */
  acc: Float64Array;
  psi: Float64Array;
}

export const initSlit = (): SlitState => ({ t: 0, acc: new Float64Array(SCREEN_N), psi: new Float64Array(SCREEN_N) });

export function stepSlit(s: SlitState, h: number, f: WaveField): void {
  s.t += h;
  f.screenPsi(s.t, s.psi);
  for (let i = 0; i < SCREEN_N; i++) s.acc[i] += s.psi[i] * s.psi[i] * h;
}

/** Run ends after the wave has covered the whole screen and been averaged for a while. */
export function slitEnd(f: WaveField, D: number): number {
  const far = Math.hypot(D, Math.max(-Y0, Y1));
  return f.tb + far / C_LIGHT + AVG_PERIODS * f.period;
}

/** Time-averaged screen intensity so far, relative to the steady maximum. */
export function relIntensity(s: SlitState, f: WaveField): Float64Array {
  const steady = f.screenSteady();
  let max = 0;
  for (const v of steady) max = Math.max(max, v);
  const span = Math.max(s.t - f.screenArrival(), f.period);
  const out = new Float64Array(SCREEN_N);
  for (let i = 0; i < SCREEN_N; i++) out[i] = s.acc[i] / (max * span);
  return out;
}

export function worldOf(D: number) {
  return { x: [XL - 0.4, D + STRIP + GAP + GRAPH_W + 3.4] as [number, number], y: [Y0 - 2.6, Y1 + 1.4] as [number, number], aspect: 'contain' as const, padPx: 12 };
}

/** Opaque wall at x ∈ [0, WALL] with the openings cut out. */
export function drawBarrier(g: Draw, aps: Aperture[]): void {
  const gaps = aps.map((a) => [a.yc - Math.max(a.w, MIN_GAP) / 2, a.yc + Math.max(a.w, MIN_GAP) / 2]).sort((p, q) => p[0] - q[0]);
  let y = Y0;
  const wall = (ya: number, yb: number) =>
    yb > ya &&
    g.polygon(
      [
        { x: 0, y: ya },
        { x: WALL, y: ya },
        { x: WALL, y: yb },
        { x: 0, y: yb },
      ],
      { fill: '#5c5c5c' },
    );
  for (const [a, b] of gaps) {
    wall(y, a);
    y = b;
  }
  wall(y, Y1);
}

/** Dark screen strip with bright bands, then the intensity graph to its right. */
export function drawScreen(g: Draw, D: number, f: WaveField, I: Float64Array, rgb: [number, number, number]): Inset {
  const ctx = g.ctx;
  const [ax, ay] = g.vp.toPx(D, Y1);
  const [bx, by] = g.vp.toPx(D + STRIP, Y0);
  ctx.save();
  ctx.fillStyle = '#1f1f1f';
  ctx.fillRect(ax, ay, bx - ax, by - ay);
  const n = I.length;
  const hpx = (by - ay) / n;
  for (let i = 0; i < n; i++) {
    const v = Math.min(1, Math.max(0, I[i])) ** 0.7;
    if (v < 0.01) continue;
    ctx.fillStyle = css(rgb, v);
    // Sample i sits at y = Y0 + (i + 0.5) h: row counted from the bottom.
    ctx.fillRect(ax, by - (i + 1) * hpx - 0.5, bx - ax, hpx + 1);
  }
  ctx.restore();

  const x0 = D + STRIP + GAP;
  const inset = new Inset(g, { x0, y0: Y0, x1: x0 + GRAPH_W, y1: Y1 }, [0, 1.15], [Y0, Y1]);
  inset.frame({ yTicks: [-10, -5, 0, 5, 10], xLabel: '*I*', yLabel: '*y* (μm)' });
  const pts: [number, number][] = [];
  for (let i = 0; i < n; i++) pts.push([Math.max(0, I[i]), f.screenY[i]]);
  inset.curve(pts, { role: 'fg', width: 1.75 });
  return inset;
}

/** Dimension line with end ticks and a label beside its middle. */
export function dimLine(g: Draw, a: Vec2, b: Vec2, label: string, dx: number, dy: number): void {
  const len = Math.hypot(b.x - a.x, b.y - a.y);
  if (len <= 0) return;
  const n = { x: -(b.y - a.y) / len, y: (b.x - a.x) / len };
  const t = g.px(4);
  g.line(a, b, { color: TICK, width: 1.25 });
  for (const p of [a, b]) g.line({ x: p.x - n.x * t, y: p.y - n.y * t }, { x: p.x + n.x * t, y: p.y + n.y * t }, { color: TICK, width: 1.25 });
  boxText(g, { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }, label, { size: 14, color: TICK, align: 'center', dx, dy });
}

/** Draggable point on the screen. */
export function drawMarker(g: Draw, D: number, y: number): void {
  g.circle({ x: D + STRIP / 2, y }, 7, { fill: '#ffffff', color: '#1a1a1a', width: 2 });
}

/** Clamp a marker height into the screen. */
export const clampY = (y: number) => Math.round(Math.min(Y1 - 0.5, Math.max(Y0 + 0.5, y)) * 20) / 20;
