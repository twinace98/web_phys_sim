// Ch 18 drawing pieces: piston-cylinder, p–V diagram, and Q / W / ΔE_int bars.
import { fmt } from '../../core/format';
import type { Rng } from '../../core/rng';
import type { Vec2 } from '../../core/types';
import type { Draw } from '../../draw/draw';
import { bar, chart, inPanel, TICK, type Chart, type Rect } from './panels';
import { NR, legAt, pathPoints, type Leg, type St } from './physics';

/** Heat, work and internal energy keep these colours in every Part II chapter. */
export const QC = '#D55E00';
export const WC = '#0072B2';
export const EC = '#009E73';
const WALL = '#5c5c5c';
const PISTON = '#8c8c8c';
const GAS = '#f3f3f3';
const ISO = '#b5b5b5';

// ------------------------------------------------------------------ molecules (visual only)

const MOL = 36;

/** Flat [x, y, vx, vy] per molecule: x ∈ [−1, 1] (cylinder width), y ∈ [0, 1] (fraction of gas height). */
export function initMolecules(rng: Rng): number[] {
  const m: number[] = [];
  for (let i = 0; i < MOL; i++) {
    const a = 2 * Math.PI * rng.next();
    m.push(-0.9 + 1.8 * rng.next(), 0.05 + 0.9 * rng.next(), Math.cos(a), Math.sin(a));
  }
  return m;
}

/** Move molecules for dt at a speed ∝ √T; the gas height h rescales the vertical motion. */
export function stepMolecules(m: number[], dt: number, T: number, h: number): void {
  const k = 0.9 * Math.sqrt(T / 300) * dt;
  for (let i = 0; i < m.length; i += 4) {
    m[i] += m[i + 2] * k;
    m[i + 1] += (m[i + 3] * k) / Math.max(h, 0.2);
    if (m[i] > 0.92) {
      m[i] = 1.84 - m[i];
      m[i + 2] = -Math.abs(m[i + 2]);
    } else if (m[i] < -0.92) {
      m[i] = -1.84 - m[i];
      m[i + 2] = Math.abs(m[i + 2]);
    }
    if (m[i + 1] > 0.97) {
      m[i + 1] = 1.94 - m[i + 1];
      m[i + 3] = -Math.abs(m[i + 3]);
    } else if (m[i + 1] < 0.03) {
      m[i + 1] = 0.06 - m[i + 1];
      m[i + 3] = Math.abs(m[i + 3]);
    }
  }
}

/** Gas height in the cylinder panel for volume V. */
export const gasHeight = (V: number, Vmax: number) => (2.6 * V) / Vmax;

// ------------------------------------------------------------------ cylinder

export interface CylView {
  V: number;
  Vmax: number;
  mol: number[];
  /** Sign of the heat flow on the current leg (+1 in, −1 out, 0 none). */
  heat: number;
  /** Sign of dV on the current leg. */
  work: number;
  insulated: boolean;
  locked: boolean;
  /** Reservoir temperature label (isothermal legs). */
  reservoir?: number;
}

export function drawCylinder(g: Draw, r: Rect, c: CylView): void {
  inPanel(g, r, { x: [-1.7, 1.7], y: [-0.95, 3.7], aspect: 'contain', padPx: 10 }, (d) => {
    const h = gasHeight(c.V, c.Vmax);
    const gas: Vec2[] = [
      { x: -1, y: 0 },
      { x: 1, y: 0 },
      { x: 1, y: h },
      { x: -1, y: h },
    ];
    d.polygon(gas, { fill: GAS });
    for (let i = 0; i < c.mol.length; i += 4) d.circle({ x: c.mol[i], y: c.mol[i + 1] * h }, 2.6, { fill: '#7a7a7a' });

    // Base: heat reservoir or insulation.
    const base: Vec2[] = [
      { x: -1.3, y: -0.85 },
      { x: 1.3, y: -0.85 },
      { x: 1.3, y: -0.12 },
      { x: -1.3, y: -0.12 },
    ];
    if (c.insulated) {
      d.polygon(base, { fill: '#e6e6e6', color: '#9a9a9a', width: 1 });
      const { ctx, vp } = d;
      ctx.save();
      const [x0, y0] = vp.toPx(-1.3, -0.12);
      const [x1, y1] = vp.toPx(1.3, -0.85);
      ctx.beginPath();
      ctx.rect(x0, y0, x1 - x0, y1 - y0);
      ctx.clip();
      ctx.strokeStyle = '#b0b0b0';
      ctx.lineWidth = 1;
      for (let x = x0 - (y1 - y0); x < x1; x += 7) {
        ctx.beginPath();
        ctx.moveTo(x, y1);
        ctx.lineTo(x + (y1 - y0), y0);
        ctx.stroke();
      }
      ctx.restore();
    } else {
      d.polygon(base, { fill: c.heat > 0 ? '#fbe3d4' : c.heat < 0 ? '#dcebf5' : '#f3f3f3', color: '#b5b5b5', width: 1 });
      if (c.reservoir !== undefined) {
        d.text({ x: -1.18, y: -0.485 }, `${fmt(c.reservoir)} K`, { size: 12, color: TICK, align: 'left', baseline: 'middle' });
      }
      if (c.heat !== 0) {
        const from = c.heat > 0 ? { x: 0.55, y: -0.75 } : { x: 0.55, y: -0.2 };
        d.arrow(from, { x: 0, y: c.heat > 0 ? 0.55 : -0.55 }, { color: QC, width: 2.5 });
        d.text({ x: 0.72, y: -0.485 }, '*Q*', { size: 14, color: QC, align: 'left', baseline: 'middle' });
      }
    }

    // Walls, piston and stops.
    d.polyline(
      [
        { x: -1, y: 3.05 },
        { x: -1, y: 0 },
        { x: 1, y: 0 },
        { x: 1, y: 3.05 },
      ],
      { color: WALL, width: 3 },
    );
    d.polygon(
      [
        { x: -0.97, y: h },
        { x: 0.97, y: h },
        { x: 0.97, y: h + 0.2 },
        { x: -0.97, y: h + 0.2 },
      ],
      { fill: PISTON },
    );
    if (c.locked) {
      for (const sx of [-1, 1]) {
        d.polygon(
          [
            { x: sx * 0.97, y: h + 0.2 },
            { x: sx * 0.8, y: h + 0.2 },
            { x: sx * 0.8, y: h + 0.34 },
            { x: sx * 0.97, y: h + 0.34 },
          ],
          { fill: WALL },
        );
      }
    }
    if (c.work !== 0) {
      const top = h + 0.25;
      if (c.work > 0) d.arrow({ x: 0, y: top }, { x: 0, y: 0.5 }, { color: WC, width: 2.5 });
      else d.arrow({ x: 0, y: top + 0.5 }, { x: 0, y: -0.5 }, { color: WC, width: 2.5 });
      d.text({ x: 0.16, y: top + 0.25 }, '*W*', { size: 14, color: WC, align: 'left', baseline: 'middle' });
    }
  });
}

// ------------------------------------------------------------------ p–V diagram

export interface PVTrace {
  legs: Leg[];
  /** Progress along the path, 0..1. */
  s: number;
  dash?: number[];
  /** Shade the area under the traversed part (blue, hatched where V decreases). */
  shade?: boolean;
  /** Put a W label in the shaded area. */
  wLabel?: boolean;
}

export interface PVView {
  Vmax: number;
  pmax: number;
  traces: PVTrace[];
  /** Reference isotherms [K], drawn dashed and labelled at the right edge. */
  isotherms: number[];
  /** Named states with the label offset direction (px). */
  points: { st: St; name: string; dx: number; dy: number }[];
}

export function drawPV(g: Draw, r: Rect, v: PVView): void {
  chart(g, r, [0, v.Vmax], [0, v.pmax], { l: 48, r: 14, t: 22, b: 36 }, (c) => {
    c.axes({ xLabel: '*V* (L)', yLabel: '*p* (kPa)' });
    c.clip(() => {
      for (const T of v.isotherms) {
        const pts: Vec2[] = [];
        const V0 = Math.max((NR * T) / v.pmax, v.Vmax * 0.02);
        for (let i = 0; i <= 80; i++) {
          const V = V0 + ((v.Vmax - V0) * i) / 80;
          pts.push(c.P(V, (NR * T) / V));
        }
        c.d.polyline(pts, { color: ISO, width: 1, dash: [4, 4] });
      }
      for (const tr of v.traces) {
        if (tr.shade) shadeWork(c, tr.legs, tr.s);
      }
      for (const tr of v.traces) {
        const all = pathPoints(tr.legs, 0, 1).map((q) => c.P(q.V, q.p));
        c.d.polyline(all, { color: '#c8c8c8', width: 1.5, dash: tr.dash });
        const done = pathPoints(tr.legs, 0, tr.s).map((q) => c.P(q.V, q.p));
        c.d.polyline(done, { color: '#1a1a1a', width: 2.5, dash: tr.dash });
      }
    });
    // Isotherm labels sit just inside the right edge, above their curve.
    for (const T of v.isotherms) {
      const p = (NR * T) / v.Vmax;
      if (p < v.pmax * 0.97) c.d.text(c.P(v.Vmax, p), `${fmt(T)} K`, { size: 11, color: TICK, align: 'right', dy: -5 });
    }
    for (const q of v.points) {
      c.d.circle(c.P(q.st.V, q.st.p), 3.5, { fill: '#ffffff', color: '#1a1a1a', width: 1.5 });
      c.d.text(c.P(q.st.V, q.st.p), q.name, { size: 13, color: '#1a1a1a', align: 'center', baseline: 'middle', dx: q.dx, dy: q.dy });
    }
    for (const tr of v.traces) {
      const cur = pathPoints(tr.legs, 0, tr.s);
      const st = cur[cur.length - 1] ?? tr.legs[0].a;
      c.d.circle(c.P(st.V, st.p), 5.5, { fill: '#1a1a1a' });
      if (tr.wLabel) {
        // Label the work area at the middle of the traversed V range, low in the shading.
        const V0 = tr.legs[0].a.V;
        if (Math.abs(c.X(st.V) - c.X(V0)) > 34) {
          const Vm = (V0 + st.V) / 2;
          const pm = Math.min(...[V0, Vm, st.V].map((V) => pAtV(tr.legs, V, tr.s)));
          c.d.text(c.P(Vm, pm * 0.4), '*W*', { size: 15, color: WC, align: 'center', baseline: 'middle' });
        }
      }
    }
  });
}

/** Pressure of the traversed path at volume V (first match), for label placement. */
function pAtV(legs: Leg[], V: number, s: number): number {
  const pts = pathPoints(legs, 0, s);
  let best = pts[0];
  for (const q of pts) if (Math.abs(q.V - V) < Math.abs(best.V - V)) best = q;
  return best.p;
}

function shadeWork(c: Chart, legs: Leg[], s: number): void {
  const n = legs.length;
  for (let i = 0; i < n; i++) {
    const hi = Math.min(s * n - i, 1);
    if (hi <= 0) break;
    const l = legs[i];
    if (l.kind === 'isochoric' || l.a.V === l.b.V) continue;
    const pts: Vec2[] = [];
    for (let k = 0; k <= 48; k++) {
      const q = legAt(l, (hi * k) / 48);
      pts.push({ x: q.V, y: q.p });
    }
    c.area(pts, WC, l.b.V < l.a.V, 0.2);
  }
}

// ------------------------------------------------------------------ energy bars

export interface BarGroup {
  name?: string;
  Q: number;
  W: number;
  dE: number;
}

/** Fixed bar scale covering every value (and zero) with a margin. */
export function barRange(values: number[]): [number, number] {
  const lo = Math.min(0, ...values);
  const hi = Math.max(0, ...values);
  const m = 0.18 * Math.max(hi - lo, 1);
  return [lo < -1e-6 ? lo - m : 0, hi > 1e-6 ? hi + m : 0];
}

/** Q, W, ΔE_int bars (one group, or several side by side) on a fixed scale. */
export function drawBars(g: Draw, r0: Rect, groups: BarGroup[], yr: [number, number], title = true): void {
  const n = groups.length;
  // Tall, narrow panels get a shorter chart, centred, so the bars stay readable.
  const hh = Math.min(r0.h, Math.max(240, 1.4 * r0.w));
  const r = { ...r0, y: r0.y + (r0.h - hh) / 2, h: hh };
  // Bottom margin: bar symbols under the zero line, then group names.
  chart(g, r, [-0.6, n - 0.4], yr, { l: 8, r: 8, t: title ? 30 : 12, b: n > 1 ? 46 : 26 }, (c) => {
    c.d.line(c.P(-0.6, 0), c.P(n - 0.4, 0), { role: 'axis', width: 1.25 });
    const half = Math.min(18, ((c.R - c.L) / n) * 0.11);
    const off = n > 1 ? 0.27 : 0.3;
    groups.forEach((gr, i) => {
      const items: [number, string, string][] = [
        [gr.Q, QC, '*Q*'],
        [gr.W, WC, '*W*'],
        [gr.dE, EC, 'Δ*E*_{int}'],
      ];
      items.forEach(([v, col, lbl], k) => bar(c, i + (k - 1) * off, half, v, col, n === 1 ? `${fmtE(v)} J` : fmtE(v), lbl));
      if (gr.name) c.d.text({ x: c.X(i), y: c.B }, gr.name, { size: 13, color: '#1a1a1a', align: 'center', dy: 40 });
    });
    if (title) c.d.text({ x: (c.L + c.R) / 2, y: c.T }, n === 1 ? 'Δ*E*_{int} = *Q* − *W*' : 'Δ*E*_{int} = *Q* − *W*  (J)', { size: 14, color: '#1a1a1a', align: 'center', dy: -12 });
  });
}

/** Energy value: whole joules below 10⁵, and 0 without decimals. */
const fmtE = (v: number) => (Math.abs(v) < 0.5 ? '0' : fmt(v));

/** Wide stage: panels side by side; narrow: stacked. */
export const isWide = (r: Rect) => r.w >= 1.25 * r.h;
