// Ch 16 scene: a pulse or a continuous wave reflects at a fixed or free end. Incident (blue
// dashed) + reflected (orange dashed) = string (black). A continuous wave becomes a standing wave.
import type { ParamSchema, Scene, Vec2 } from '../../core/types';
import type { Draw } from '../../draw/draw';
import { envelope, nodes, reflectAt, type End, type Mode, type Reflect } from './physics';

type P = { mode: string; end: string; lambda: number; parts: boolean };

const L = 4;
const V = 2;
const TAU = 0.5; // pulse duration: 1 m long on the string
const X_LEFT = -0.3;
const ENV = '#8c8c8c';

function cfg(p: P): Reflect {
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
    control: 'select',
    choices: [0.8, 1.6, 2.4],
    default: 1.6,
    unit: 'm',
    visibleIf: (p) => p.mode === 'wave',
  },
  parts: { kind: 'toggle', label: 'ch16.p.parts', desc: 'ch16.d.parts', group: 'advanced', live: true, default: true },
};

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

    // Standing-wave region: where the reflected wave has already arrived.
    if (r.mode === 'wave') {
      const xs = Math.max(X_LEFT, 2 * L - V * (t + r.t0));
      if (xs < L) {
        curve(g, (x) => envelope(r, x), xs, L, { color: ENV, width: 1, dash: [2, 3] });
        curve(g, (x) => -envelope(r, x), xs, L, { color: ENV, width: 1, dash: [2, 3] });
        for (const xn of nodes(r)) if (xn >= xs) g.circle({ x: xn, y: 0 }, 4, { fill: '#1a1a1a' });
      }
    }

    // String first; the two waves dashed on top so they stay visible where they coincide with it.
    curve(g, (x) => reflectAt(r, x, t).y, X_LEFT, L, { role: 'fg', width: 2.5 });
    if (p.parts) {
      curve(g, (x) => reflectAt(r, x, t).inc, X_LEFT, L, { role: 'position', width: 1.75, dash: [6, 4] }, true);
      curve(g, (x) => reflectAt(r, x, t).ref, X_LEFT, L, { role: 'energyU', width: 1.75, dash: [6, 4] }, true);
    }
    drawEnd(g, r.end, L, reflectAt(r, L, t).y, 0, 0.6);
  },

  readouts: [{ label: 'v', unit: 'm/s', value: () => V }],

  info: {
    goals: ['ch16.goal.reflect', 'ch16.goal.standing'],
    observe: ['ch16.obs.fixed', 'ch16.obs.free', 'ch16.obs.sum', 'ch16.obs.nodes', 'ch16.obs.freeNodes'],
    equations: [
      "y = h(t - x/v) \\mp h\\big(t - (2L - x)/v\\big)",
      "y = [2y_m \\sin kx']\\cos\\omega t, \\quad x' = L - x",
      'v = f\\lambda',
    ],
    assumptions: ['ch16.assume.ideal', 'ch16.assume.left'],
  },
};
