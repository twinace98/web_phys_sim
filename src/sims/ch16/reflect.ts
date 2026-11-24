// Ch 16 scene: a pulse or a continuous wave reflects at a fixed or free end. Incident (blue
// dashed) + reflected (orange dashed) = string (black). The scene is about reflection: node
// markers and the envelope of the standing wave belong to the resonance tab.
import type { ParamSchema, Scene, Vec2 } from '../../core/types';
import type { Draw } from '../../draw/draw';
import { num, paren, slider, tn, tnScale, u } from '../../core/tex';
import { reflectAt, type End, type Mode, type Reflect } from './physics';

type P = { mode: string; end: string; lambda: number; parts: boolean };

const L = 4;
const V = 2;
const TAU = 0.5; // pulse duration: 1 m long on the string
const X_LEFT = -0.3;

export function cfg(p: P): Reflect {
  const pulse = p.mode === 'pulse';
  // The pulse starts fully on the string (from x = 0.2 m to 1.2 m); the wave's front starts at x = 0.
  return { L, v: V, A: pulse ? 0.3 : 0.2, mode: p.mode as Mode, end: p.end as End, lambda: p.lambda, tau: TAU, t0: pulse ? 1.2 / V : 0 };
}

const params: ParamSchema<P> = {
  mode: {
    kind: 'select',
    label: 'ch16.p.mode',
    desc: 'ch16.d.mode',
    group: 'main',
    live: false,
    default: 'pulse',
    options: [
      { value: 'pulse', label: 'ch16.mode.pulse' },
      { value: 'wave', label: 'ch16.mode.wave' },
    ],
  },
  end: {
    kind: 'select',
    label: 'ch16.p.end',
    desc: 'ch16.d.end',
    group: 'main',
    live: false,
    default: 'fixed',
    options: [
      { value: 'fixed', label: 'ch16.end.fixed' },
      { value: 'free', label: 'ch16.end.free' },
    ],
  },
  lambda: {
    kind: 'number',
    label: 'ch16.p.lambda',
    desc: 'ch16.d.lambda',
    group: 'advanced',
    live: false,
    control: 'slider',
    min: 0.4,
    max: 2.4,
    step: 0.1,
    default: 1.6,
    unit: 'm',
    visibleIf: (p) => p.mode === 'wave',
  },
  parts: { kind: 'toggle', label: 'ch16.p.parts', desc: 'ch16.d.parts', group: 'advanced', live: true, default: true },
};

/**
 * Standing wave of the continuous mode where the reflected wave has arrived (t ≥ (2L − x)/v). The
 * incident wave y₁ = y_m sin(ωt − kx) starts at x = 0 at t = 0, so it reaches the end with phase kL;
 * with x' = L − x the sum is [2y_m sin kx'] cos(ωt − kL) (fixed) or [2y_m cos kx'] sin(ωt − kL) (free).
 */
export const STANDING_FIXED = "y = [2y_m \\sin kx']\\cos(\\omega t - kL)";
export const STANDING_FREE = "y = [2y_m \\cos kx']\\sin(\\omega t - kL)";

/** The standing-wave formulas above, evaluated (y_m = A of cfg): checked against reflectAt in the tests. */
export function standingAt(r: Reflect, x: number, t: number): number {
  const k = (2 * Math.PI) / r.lambda;
  const w = k * r.v;
  const xp = r.L - x;
  const ph = w * t - k * r.L;
  return r.end === 'fixed' ? 2 * r.A * Math.sin(k * xp) * Math.cos(ph) : 2 * r.A * Math.cos(k * xp) * Math.sin(ph);
}

/** Opacity of the incident and reflected dashed waves under the string (user request 2026-11-19). */
export const PARTS_ALPHA = 0.4;

function curve(g: Draw, fn: (x: number) => number, x0: number, x1: number, st: Parameters<Draw['polyline']>[1], skipZero = false): void {
  const n = 480;
  const xs = Array.from({ length: n + 1 }, (_, i) => x0 + ((x1 - x0) * i) / n);
  const ys = xs.map(fn);
  // skipZero: leave out stretches where the wave has not arrived, so idle parts do not clutter the axis.
  const on = ys.map((y, i) => !skipZero || Math.abs(y) > 1e-9 || Math.abs(ys[i - 1] ?? 0) > 1e-9 || Math.abs(ys[i + 1] ?? 0) > 1e-9);
  let seg: Vec2[] = [];
  for (let i = 0; i <= n; i++) {
    if (on[i]) seg.push({ x: xs[i], y: ys[i] });
    else {
      g.polyline(seg, st);
      seg = [];
    }
  }
  g.polyline(seg, st);
}

/** Wall with hatching (fixed end) or a ring on a frictionless rod (free end). */
export function drawEnd(g: Draw, end: End, x: number, y: number, yc: number, h: number): void {
  if (end === 'fixed') {
    g.line({ x, y: yc - h }, { x, y: yc + h }, { color: '#5c5c5c', width: 2.5 });
    for (let k = 0; k <= 10; k++) {
      const yy = yc - h + (2 * h * k) / 10;
      g.line({ x, y: yy }, { x: x + g.px(8), y: yy + g.px(8) }, { color: '#9a9a9a', width: 1 });
    }
  } else {
    g.line({ x, y: yc - h }, { x, y: yc + h }, { color: '#9a9a9a', width: 2 });
    g.circle({ x, y }, 6, { color: '#1a1a1a', width: 2, fill: '#ffffff' });
  }
}

export const reflect: Scene<P, { t: number }> = {
  id: 'reflect',
  title: 'ch16.scene',
  params,
  time: {
    h: 1 / 240,
    recordEvery: 4,
    frameStep: 0.05,
    // Pulse: stop when the reflected pulse has come back to the left edge.
    tEnd: (p) => (p.mode === 'pulse' ? (2 * L - X_LEFT) / V + TAU - 1.2 / V : undefined) as number,
  },
  world: () => ({ x: [X_LEFT, L + 0.35], y: [-0.62, 0.62], aspect: 'contain', padPx: 16 }),
  init: () => ({ t: 0 }),
  step: (s, h) => {
    s.t += h;
  },

  draw: (g, s, p) => {
    const r = cfg(p);
    const t = s.t;
    g.line({ x: X_LEFT, y: 0 }, { x: L, y: 0 }, { color: '#e0e0e0', width: 1 });

    // String first; the two waves dashed on top so they stay visible where they coincide with it,
    // but faint (PARTS_ALPHA) so the real string (solid) stays the main line.
    curve(g, (x) => reflectAt(r, x, t).y, X_LEFT, L, { role: 'fg', width: 2.5 });
    if (p.parts) {
      curve(g, (x) => reflectAt(r, x, t).inc, X_LEFT, L, { role: 'position', width: 1.5, dash: [6, 4], alpha: PARTS_ALPHA }, true);
      curve(g, (x) => reflectAt(r, x, t).ref, X_LEFT, L, { role: 'energyU', width: 1.5, dash: [6, 4], alpha: PARTS_ALPHA }, true);
    }
    drawEnd(g, r.end, L, reflectAt(r, L, t).y, 0, 0.6);
  },

  readouts: [
    { label: 'v', unit: 'm/s', value: () => V },
    // The end's displacement now, as the last Σ line prints it (R7a run scale: the incident amplitude).
    { label: 'y(L)', unit: 'm', value: (s, p) => reflectAt(cfg(p), L, s.t).y, scale: (p) => cfg(p).A },
  ],

  formula: (s, p) => formulaLines(s.t, p),

  info: {
    goals: ['ch16.goal.reflect', 'ch16.goal.standing'],
    observe: ['ch16.obs.fixed', 'ch16.obs.free', 'ch16.obs.sum', 'ch16.obs.wave', 'ch16.obs.waveEnd'],
    equations: [
      "y = h(t - x/v) \\mp h\\big(t - (2L - x)/v\\big)",
      // Continuous wave, where both waves are present: fixed end (sin kx', y(L) = 0), then free end (cos kx').
      STANDING_FIXED,
      STANDING_FREE,
      'v = f\\lambda',
    ],
    assumptions: ['ch16.assume.ideal', 'ch16.assume.left', 'ch16.assume.h', 'ch16.assume.standing', 'ch16.assume.tL'],
  },
};

/**
 * Σ panel: when the front reaches the end, the wave's f = v/λ and its node positions x' = L − x,
 * and the displacement at the end now: incident ∓ reflected (0 at a fixed end, 2h at a free end).
 */
export function formulaLines(t: number, p: P): string[] {
  const r = cfg(p);
  const x0 = r.v * r.t0;
  const lines: string[] = [];
  if (r.mode === 'pulse') lines.push(`t_L = (L - x_0)/v = (${L} - ${num(x0)})/${V} = ${tn((L - x0) / V)}${u('s')}`);
  else {
    lines.push(`t_L = L/v = ${L}/${V} = ${tn(L / V)}${u('s')}`);
    lines.push(`f = v/\\lambda = ${V}/${slider(params.lambda, p.lambda)} = ${tn(V / r.lambda)}${u('Hz')}`);
    const half = `${tn(r.lambda / 2)}${u('m')}`;
    // m = 0, 1, 2, …: the node's number counted from the end (ⓘ).
    const ms = '\\quad (m = 0, 1, 2, \\dots)';
    lines.push(r.end === 'fixed' ? `x' = m\\lambda/2 = m \\times ${half}${ms}` : `x' = (m + \\tfrac{1}{2})\\lambda/2 = (m + \\tfrac{1}{2}) \\times ${half}${ms}`);
  }
  // Displacements to 3 figures (policy D, R3). Below 10⁻³ of the amplitude a value is a numerical
  // residue and prints as an exact 0 (R7a): before the wave arrives, and y(L) = h − h at a fixed end.
  const { inc, y } = reflectAt(r, L, t);
  const d = (v: number) => tnScale(v, r.A);
  const h = paren(d(inc));
  lines.push(`h(t - L/v) = ${d(inc)}${u('m')}`);
  lines.push(r.end === 'fixed' ? `y(L) = h - h = ${h} - ${h} = ${d(y)}${u('m')}` : `y(L) = h + h = 2 \\times ${h} = ${d(y)}${u('m')}`);
  return lines;
}
