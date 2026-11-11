// Ch 17 scene: beats. Two waves of nearby frequency (y₁ blue, y₂ orange) and their sum (black)
// with its envelope. The strip above shows the two amplitudes as arrows in a frame turning at
// the mean frequency: they drift apart at f₂ − f₁, so the sum swells and fades.
import type { ParamSchema, Role, Scene, UiState, Vec2 } from '../../core/types';
import type { Draw, PlotDraw } from '../../draw/draw';
import { color, withAlpha } from '../../draw/theme';
import { soundTick } from './audio';
import { beatEnvelope, beatFrequency, wave } from './physics';

type P = { f1: number; df: number; sound: boolean };
type S = { t: number; y1: number; y2: number };

const A = 1;
const RATE = 4440; // ≥ 10 samples per period of the highest tone (444 Hz)
const ENV = '#8c8c8c';
/** Below this many px per carrier cycle the waveform is drawn as its envelope (a filled band). */
export const MIN_PX_PER_CYCLE = 6;

const f2Of = (p: P) => p.f1 + p.df;

const params: ParamSchema<P> = {
  f1: {
    kind: 'number',
    label: 'ch17.b.p.f1',
    desc: 'ch17.b.d.f1',
    group: 'main',
    live: false,
    control: 'slider',
    min: 20,
    max: 440,
    step: 1,
    default: 20,
    unit: 'Hz',
  },
  df: {
    kind: 'number',
    label: 'ch17.b.p.df',
    desc: 'ch17.b.d.df',
    group: 'main',
    live: false,
    control: 'slider',
    min: 1,
    max: 4,
    step: 0.1,
    default: 2,
    unit: 'Hz',
  },
  sound: { kind: 'toggle', label: 'ch17.b.p.sound', desc: 'ch17.b.d.sound', group: 'advanced', live: true, default: false },
};

const sample = (p: P, t: number): S => ({ t, y1: wave(A, p.f1, t), y2: wave(A, f2Of(p), t) });

export const beats: Scene<P, S> = {
  id: 'beats',
  title: 'ch17.b.scene',
  layout: 'stack',
  params,
  // Two beat periods, shown at 1/4 speed.
  time: { h: 1 / RATE, recordEvery: 1, frameStep: 0.01, scale: 0.25, tEnd: (p) => 2 / (p as P).df },
  world: () => ({ x: [-6, 6], y: [-2.35, 2.35], aspect: 'contain', padPx: 10 }),

  init: (p) => sample(p, 0),
  step: (s, h, p) => {
    Object.assign(s, sample(p, s.t + h));
  },
  record: (s) => ({ t: s.t, y1: s.y1, y2: s.y2, y: s.y1 + s.y2 }),
  snapshot: (s) => ({ ...s }),

  draw: (g, s, p) => {
    soundTick(p.sound, p.f1, f2Of(p));
    // Arrows of length A turning at ∓π(f₂ − f₁) relative to the mean frequency; their sum stays vertical.
    const ph = Math.PI * p.df * s.t;
    const O: Vec2 = { x: 0, y: 0 };
    const a1: Vec2 = { x: A * Math.sin(ph), y: A * Math.cos(ph) };
    const a2: Vec2 = { x: -A * Math.sin(ph), y: A * Math.cos(ph) };
    const ring: Vec2[] = [];
    for (let i = 0; i <= 96; i++) ring.push({ x: 2 * A * Math.cos((i / 96) * 2 * Math.PI), y: 2 * A * Math.sin((i / 96) * 2 * Math.PI) });
    g.polyline(ring, { color: '#d8d8d8', width: 1, dash: [3, 4] });
    g.line({ x: 0, y: -2 * A }, { x: 0, y: 2 * A }, { color: '#e6e6e6', width: 1 });
    const sum: Vec2 = { x: a1.x + a2.x, y: a1.y + a2.y };
    g.arrow(O, a1, { role: 'position', width: 2.25 });
    g.arrow(a1, a2, { role: 'energyU', width: 2.25 });
    g.arrow(O, sum, { role: 'fg', width: 2.5 });
    phasorLabels(g, a1, sum);
    g.circle(O, 3, { fill: '#5c5c5c' });
  },

  // Traces are drawn analytically in drawPlot: as waveforms while the carrier is resolved, else as envelopes.
  plots: [
    { id: 'y1', label: 'y_1', traces: [], yRange: () => [-1.3 * A, 1.3 * A] },
    { id: 'y2', label: 'y_2', traces: [], yRange: () => [-1.3 * A, 1.3 * A] },
    { id: 'y', label: 'y = y_1 + y_2', traces: [], yRange: () => [-2.5 * A, 2.5 * A] },
  ],

  drawPlot: (id, pd, p, ui) => drawWave(id, pd, p, ui),

  readouts: [
    { label: 'f_2', unit: 'Hz', value: (_s, p) => f2Of(p) },
    { label: 'f_\\text{beat}', unit: 'Hz', value: (_s, p) => beatFrequency(p.f1, f2Of(p)) },
    { label: 'T_\\text{beat}', unit: 's', value: (_s, p) => 1 / beatFrequency(p.f1, f2Of(p)) },
  ],

  info: {
    goals: ['ch17.b.goal.sum', 'ch17.b.goal.fbeat'],
    observe: ['ch17.b.obs.phase', 'ch17.b.obs.env', 'ch17.b.obs.df', 'ch17.b.obs.arrows', 'ch17.b.obs.sound'],
    equations: [
      'y = 2A\\cos\\!\\big(2\\pi \\tfrac{f_2 - f_1}{2} t\\big)\\cos\\!\\big(2\\pi \\tfrac{f_1 + f_2}{2} t\\big)',
      'f_\\text{beat} = \\lvert f_1 - f_2 \\rvert',
    ],
    assumptions: ['ch17.b.assume.amp', 'ch17.b.assume.slow', 'ch17.b.assume.arrows', 'ch17.b.assume.env'],
  },
};

/**
 * Labels y₁, y₂ beside the middle of their arrows, on the outside of the triangle O → a₁ → sum,
 * so they never sit on the other arrow or on the sum. Degenerate triangles fall back to fixed sides.
 */
function phasorLabels(g: Draw, a1: Vec2, sum: Vec2): void {
  const put = (from: Vec2, to: Vec2, other: Vec2, txt: string, role: Role, fallback: Vec2) => {
    const d = { x: to.x - from.x, y: to.y - from.y };
    const len = Math.hypot(d.x, d.y) || 1;
    let n = { x: d.y / len, y: -d.x / len };
    const mid = { x: (from.x + to.x) / 2, y: (from.y + to.y) / 2 };
    const side = n.x * (other.x - mid.x) + n.y * (other.y - mid.y);
    if (Math.abs(side) < 0.08 * A) n = fallback;
    else if (side > 0) n = { x: -n.x, y: -n.y };
    // Wider offset sideways than up or down: the label is wider than it is tall.
    const off = g.px(11 + 5 * Math.abs(n.x));
    g.text({ x: mid.x + n.x * off, y: mid.y + n.y * off }, txt, { size: 14, color: color(role), align: 'center', baseline: 'middle' });
  };
  // Collinear (all on the vertical axis): both to the right, at different heights, as just before.
  // Folded back (a₂ retraces a₁ along the horizontal): y₁ below, y₂ above, as just before.
  const folded = Math.abs(sum.y) < 0.08 * A;
  put({ x: 0, y: 0 }, a1, sum, '*y*_{1}', 'position', folded ? { x: 0, y: -1 } : { x: 1, y: 0 });
  put(a1, sum, { x: 0, y: 0 }, '*y*_{2}', 'energyU', folded ? { x: 0, y: 1 } : { x: 1, y: 0 });
}

/** Waveform (or, when too dense to resolve, its envelope band) of plot `id` from 0 to the current time. */
function drawWave(id: string, pd: PlotDraw, p: P, ui: UiState): void {
  const f1 = p.f1;
  const f2 = f2Of(p);
  const tEnd = ui.t;
  if (tEnd <= 0) return;
  const role: Role = id === 'y1' ? 'position' : id === 'y2' ? 'energyU' : 'fg';
  const env = (t: number) => (id === 'y' ? beatEnvelope(A, f1, f2, t) : A);
  const val = (t: number) => (id === 'y1' ? wave(A, f1, t) : id === 'y2' ? wave(A, f2, t) : wave(A, f1, t) + wave(A, f2, t));
  const pxPerCycle = pd.toPx(2 / (f1 + f2), 0)[0] - pd.toPx(0, 0)[0];
  const resolved = pxPerCycle >= MIN_PX_PER_CYCLE;
  const envelopeLines = (st: { color: string; width: number; dash?: number[] }) => {
    const n = 400;
    for (const sg of [-1, 1]) {
      const pts: [number, number][] = [];
      for (let i = 0; i <= n; i++) {
        const t = (tEnd * i) / n;
        pts.push([t, sg * env(t)]);
      }
      pd.polyline(pts, st);
    }
  };
  if (resolved) {
    // 24 samples per cycle of the faster tone.
    const n = Math.max(2, Math.ceil(tEnd * Math.max(f1, f2) * 24));
    const pts: [number, number][] = [];
    for (let i = 0; i <= n; i++) {
      const t = (tEnd * i) / n;
      pts.push([t, val(t)]);
    }
    if (id === 'y') envelopeLines({ color: ENV, width: 1.5, dash: [5, 4] });
    pd.polyline(pts, { role, width: 2 });
    return;
  }
  // Envelope band: light fill between ±envelope, solid edges.
  const n = 400;
  const ctx = pd.ctx;
  ctx.save();
  ctx.beginPath();
  for (let i = 0; i <= n; i++) {
    const t = (tEnd * i) / n;
    const [x, y] = pd.toPx(t, env(t));
    if (i) ctx.lineTo(x, y);
    else ctx.moveTo(x, y);
  }
  for (let i = n; i >= 0; i--) {
    const t = (tEnd * i) / n;
    const [x, y] = pd.toPx(t, -env(t));
    ctx.lineTo(x, y);
  }
  ctx.closePath();
  ctx.fillStyle = withAlpha(color(role), 0.22);
  ctx.fill();
  ctx.restore();
  envelopeLines({ color: color(role), width: 1.5 });
}
