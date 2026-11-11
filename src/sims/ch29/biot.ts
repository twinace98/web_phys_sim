// Ch 29 scene: Biot-Savart law as a sum. Current elements of a straight wire or a circular
// loop are added one at a time; each dB at the observation point P is ⊥ page.
import { fmt } from '../../core/format';
import type { ParamSchema, Scene, Vec2 } from '../../core/types';
import { drawRich } from '../../draw/text';
import { theme } from '../../draw/theme';
import { Memo, wireGlyph } from '../field/render';
import { HALF, R_LOOP, dBz, distToWire, elements, infiniteWire, loopCentre, type Element } from './physics';

type P = { wire: string; n: number; Ps: number[]; Pl: number[] };
type S = { t: number };

const T_END = 4;
const WIRE = '#5c5c5c';
const DONE = '#1a1a1a';
const DL = '#0072B2';
const R_COL = '#9a9a9a';
const D_MIN = 0.06;
const BOX: [number, number, number, number] = [-1.15, -0.62, 1.15, 0.62];

const params: ParamSchema<P> = {
  wire: {
    kind: 'select',
    label: 'ch29.b.p.wire',
    desc: 'ch29.b.d.wire',
    group: 'main',
    live: false,
    default: 'straight',
    options: [
      { value: 'straight', label: 'ch29.b.wire.straight' },
      { value: 'loop', label: 'ch29.b.wire.loop' },
    ],
  },
  n: { kind: 'number', label: 'ch29.b.p.n', desc: 'ch29.b.d.n', group: 'main', live: false, control: 'select', choices: [12, 24, 48], default: 24 },
  Ps: { kind: 'array', label: 'ch29.b.p.P', group: 'hidden', live: false, default: [0.15, 0.3], min: -2, max: 2 },
  Pl: { kind: 'array', label: 'ch29.b.p.P', group: 'hidden', live: false, default: [0, 0], min: -2, max: 2 },
};

const wireOf = (p: P) => (p.wire === 'loop' ? 'loop' : 'straight');
const obs = (p: P): Vec2 => {
  const a = p.wire === 'loop' ? p.Pl : p.Ps;
  return { x: a[0], y: a[1] };
};

interface Model {
  els: Element[];
  dB: number[];
  cum: number[];
  ref: number;
}
const memo = new Memo<Model>();
function model(p: P): Model {
  const P0 = obs(p);
  return memo.get(`${p.wire}|${p.n}|${P0.x},${P0.y}`, () => {
    const els = elements(wireOf(p), p.n);
    const dB = els.map((e) => dBz(e, P0.x, P0.y));
    const cum: number[] = [];
    dB.reduce((a, v, i) => (cum[i] = a + v), 0);
    const ref = p.wire === 'loop' ? loopCentre() : Math.sign(P0.y || 1) * infiniteWire(Math.abs(P0.y));
    return { els, dB, cum, ref };
  });
}

/** Number of elements summed by time t (at least one). */
const summed = (p: P, t: number) => Math.min(p.n, 1 + Math.floor((t * p.n) / T_END + 1e-9));

function pad([lo, hi]: [number, number]): [number, number] {
  lo = Math.min(lo, 0);
  hi = Math.max(hi, 0);
  const m = 0.15 * (hi - lo || 1);
  return [lo - m, hi + m];
}

export const biot: Scene<P, S> = {
  id: 'biot',
  title: 'ch29.b.scene',
  layout: 'side',
  params,
  time: { h: 1 / 120, recordEvery: 1, frameStep: T_END / 48, tEnd: T_END },
  world: () => ({ x: [-1.25, 1.25], y: [-0.7, 0.7], aspect: 'contain', padPx: 10 }),
  init: () => ({ t: 0 }),
  step: (s, h) => {
    s.t = Math.min(T_END, s.t + h);
  },
  record: (s, p) => {
    const m = model(p);
    const k = summed(p, s.t);
    return { t: s.t, dB: m.dB[k - 1], B: m.cum[k - 1] };
  },
  snapshot: (s) => ({ ...s }),

  draw: (g, s, p) => {
    const m = model(p);
    const k = summed(p, s.t);
    const P0 = obs(p);
    const loop = p.wire === 'loop';

    // Wire: elements already summed in black, the rest grey; tick marks between elements.
    for (let i = 0; i < m.els.length; i++) {
      const e = m.els[i];
      const a = { x: e.x - e.dx / 2, y: e.y - e.dy / 2 };
      const b = { x: e.x + e.dx / 2, y: e.y + e.dy / 2 };
      if (loop) {
        const a0 = Math.atan2(a.y, a.x);
        const a1 = a0 + (2 * Math.PI) / m.els.length;
        const pts: Vec2[] = [];
        for (let j = 0; j <= 8; j++) {
          const u = a0 + ((a1 - a0) * j) / 8;
          pts.push({ x: R_LOOP * Math.cos(u), y: R_LOOP * Math.sin(u) });
        }
        g.polyline(pts, { color: i < k ? DONE : WIRE, width: i < k ? 3.5 : 2.5, alpha: i < k ? 1 : 0.45 });
      } else g.line(a, b, { color: i < k ? DONE : WIRE, width: i < k ? 3.5 : 2.5, alpha: i < k ? 1 : 0.45 });
      const n = Math.hypot(e.dx, e.dy);
      const nx = -e.dy / n;
      const ny = e.dx / n;
      g.line({ x: a.x - nx * g.px(4), y: a.y - ny * g.px(4) }, { x: a.x + nx * g.px(4), y: a.y + ny * g.px(4) }, { color: WIRE, width: 1 });
    }
    // Current direction.
    if (loop) {
      // Arrowhead on the loop at 125°, pointing counter-clockwise.
      const a = 2.18;
      const at = { x: R_LOOP * Math.cos(a), y: R_LOOP * Math.sin(a) };
      g.arrow({ x: at.x + Math.sin(a) * 0.05, y: at.y - Math.cos(a) * 0.05 }, { x: -Math.sin(a) * 0.1, y: Math.cos(a) * 0.1 }, { color: WIRE, width: 2 });
      g.text(at, '*I*', { size: 14, color: WIRE, align: 'right', baseline: 'middle', dx: -12, dy: -10 });
    } else {
      g.arrow({ x: HALF - 0.08, y: 0 }, { x: 0.06, y: 0 }, { color: WIRE, width: 2 });
      g.text({ x: HALF - 0.04, y: 0 }, '*I*', { size: 14, color: WIRE, align: 'center', dy: -12 });
    }

    // Current element: dl and r to P, with its dB (small) at the middle of r.
    const e = m.els[k - 1];
    g.line({ x: e.x, y: e.y }, P0, { color: R_COL, width: 1.25, dash: [4, 4] });
    const len = Math.hypot(e.dx, e.dy);
    const sc = Math.max(g.px(26), len) / len;
    g.arrow({ x: e.x - (e.dx * sc) / 2, y: e.y - (e.dy * sc) / 2 }, { x: e.dx * sc, y: e.dy * sc }, { color: DL, width: 2.5 });
    const mid = { x: (e.x + P0.x) / 2, y: (e.y + P0.y) / 2 };
    g.text(mid, '*r*', { size: 13, color: R_COL, align: 'left', baseline: 'middle', dx: 7, dy: -9 });
    const lx = e.x + (e.dx * sc) / 2;
    const ly = e.y + (e.dy * sc) / 2;
    g.text({ x: lx, y: ly }, 'd*l*', { size: 13, color: DL, align: 'left', baseline: 'middle', dx: 4, dy: loop ? 0 : 12 });
    // At P: this element's dB (small, blue) and the running sum B (black); ⊙ out, ⊗ in.
    const dBv = m.dB[k - 1];
    const q = { x: P0.x - g.px(26), y: P0.y + g.px(14) };
    if (Math.abs(dBv) > 1e-12) {
      wireGlyph(g, q, dBv, 1, 7, DL);
      g.text(q, 'd*B*', { size: 12, color: DL, align: 'right', baseline: 'middle', dx: -10 });
    }
    const B = m.cum[k - 1];
    if (Math.abs(B) > 1e-12) wireGlyph(g, P0, B, 1, 10, DONE);
    else g.circle(P0, 4, { fill: DONE });
    g.text(P0, '*P*', { size: 14, color: DONE, align: 'left', baseline: 'middle', dx: 14, dy: -12 });
  },

  plots: [
    {
      id: 'dB',
      label: 'dB\\,(\\mu\\mathrm{T})',
      traces: [{ channel: 'dB', role: 'position' }],
      yRange: (p) => {
        const d = model(p).dB;
        return pad([Math.min(...d), Math.max(...d)]);
      },
    },
    {
      id: 'B',
      label: 'B = \\sum dB\\,(\\mu\\mathrm{T})',
      traces: [{ channel: 'B', role: 'fg' }],
      yRange: (p) => {
        const m = model(p);
        const all = [...m.cum, m.ref].filter(Number.isFinite);
        return pad([Math.min(...all), Math.max(...all)]);
      },
    },
  ],

  drawPlot: (id, pd, p) => {
    if (id !== 'B') return;
    const m = model(p);
    pd.polyline(
      [
        [0, m.ref],
        [T_END, m.ref],
      ],
      { color: '#9a9a9a', width: 1.25, dash: [5, 4] },
    );
    // Left end, below the line when it is positive (the running sum starts near 0 there).
    const [x, y] = pd.toPx(T_END * 0.02, m.ref);
    const label = p.wire === 'loop' ? `μ_{0}*I*/2*R* = ${fmt(m.ref)} μT` : `μ_{0}*I*/2π*d* = ${fmt(m.ref)} μT`;
    drawRich(pd.ctx, label, x, y + (m.ref >= 0 ? 15 : -6) * theme.scale, { size: 11, color: '#6b6b6b' });
  },

  readouts: [
    { label: 'B', unit: 'μT', value: (s, p) => model(p).cum[summed(p, s.t) - 1] },
    { label: 'd', unit: 'm', value: (_s, p) => (p.wire === 'loop' ? Math.hypot(obs(p).x, obs(p).y) : Math.abs(obs(p).y)), sig: 2 },
  ],

  handles: [
    {
      radiusPx: 16,
      pos: (_s, p) => obs(p),
      onDrag: (ctx, _s, w) => {
        let x = Math.min(BOX[2], Math.max(BOX[0], w.x));
        let y = Math.min(BOX[3], Math.max(BOX[1], w.y));
        const wire = wireOf(ctx.params);
        if (distToWire(wire, x, y) < D_MIN) {
          if (wire === 'straight') y = (y >= 0 ? 1 : -1) * D_MIN;
          else {
            const r = Math.hypot(x, y) || 1e-9;
            const target = r < R_LOOP ? R_LOOP - D_MIN : R_LOOP + D_MIN;
            x = (x / r) * target;
            y = (y / r) * target;
          }
        }
        const v = [Math.round(x * 100) / 100, Math.round(y * 100) / 100];
        const key = wire === 'loop' ? 'Pl' : 'Ps';
        const cur = ctx.params[key];
        if (v[0] !== cur[0] || v[1] !== cur[1]) ctx.set(key, v);
      },
    },
  ],

  info: {
    goals: ['ch29.b.goal.sum', 'ch29.b.goal.dir'],
    observe: ['ch29.b.obs.play', 'ch29.b.obs.far', 'ch29.b.obs.r', 'ch29.b.obs.loop', 'ch29.b.obs.inside', 'ch29.b.obs.n'],
    equations: [
      'd\\vec B = \\frac{\\mu_0}{4\\pi}\\,\\frac{I\\,d\\vec l\\times\\hat r}{r^2}, \\quad B = \\sum dB',
      '\\text{long wire: } B = \\frac{\\mu_0 I}{2\\pi d}, \\qquad \\text{loop centre: } B = \\frac{\\mu_0 I}{2R}',
    ],
    assumptions: ['ch29.b.as.units', 'ch29.b.as.plane', 'ch29.b.as.mid', 'ch29.b.as.ref'],
  },
};
