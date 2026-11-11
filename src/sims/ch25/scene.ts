// Ch 25 scene: parallel-plate capacitor, dielectric, battery connected or disconnected.
// Static: every quantity follows from the parameters; the panel lists C, Q, V, E, U and X/X0.
import { fmt } from '../../core/format';
import type { ParamSchema, Scene, Vec2 } from '../../core/types';
import type { Draw } from '../../draw/draw';
import { KAPPA, capState, type CapState, type Plates } from './physics';

type P = { dielectric: string; source: string; A: number; d: number };

const V0 = 12; // battery emf [V]
const A_REF = 100; // reference plate area [cm²]
const D_REF = 1; // reference separation [mm]
const GAP_K = 4.5; // drawn gap per mm (world units)
const N_REF = 5; // charges drawn per plate and field lines in the reference state
const SLAB = '#e9eef3';
const WIRE = '#3a3a3a';

const plates = (p: P): Plates => ({ A: p.A * 1e-4, d: p.d * 1e-3, kappa: KAPPA[p.dielectric] ?? 1 });
const REF: Plates = { A: A_REF * 1e-4, d: D_REF * 1e-3, kappa: 1 };

export const stateOf = (p: P): CapState => capState(plates(p), p.source === 'on', V0, REF);
export const refState = (): CapState => capState(REF, true, V0, REF);

const params: ParamSchema<P> = {
  dielectric: {
    kind: 'select',
    label: 'ch25.p.diel',
    desc: 'ch25.d.diel',
    group: 'main',
    live: true,
    default: 'glass',
    options: [
      { value: 'air', label: 'ch25.diel.air' },
      { value: 'paper', label: 'ch25.diel.paper' },
      { value: 'glass', label: 'ch25.diel.glass' },
      { value: 'water', label: 'ch25.diel.water' },
    ],
  },
  source: {
    kind: 'select',
    label: 'ch25.p.source',
    desc: 'ch25.d.source',
    group: 'main',
    live: true,
    default: 'on',
    options: [
      { value: 'on', label: 'ch25.source.on' },
      { value: 'off', label: 'ch25.source.off' },
    ],
  },
  A: {
    kind: 'number',
    label: 'ch25.p.A',
    desc: 'ch25.d.A',
    group: 'advanced',
    live: true,
    control: 'slider',
    min: 50,
    max: 200,
    step: 10,
    default: 100,
    unit: 'cm²',
  },
  d: {
    kind: 'number',
    label: 'ch25.p.d',
    desc: 'ch25.d.d',
    group: 'advanced',
    live: true,
    control: 'slider',
    min: 0.5,
    max: 2,
    step: 0.1,
    default: 1,
    unit: 'mm',
  },
};

const PREFIX: [number, string][] = [
  [1e3, 'k'],
  [1, ''],
  [1e-3, 'm'],
  [1e-6, '\\mu '],
  [1e-9, 'n'],
  [1e-12, 'p'],
];

/** Value with an SI prefix as TeX, e.g. 41.6\,\mathrm{pF}. */
export function siTex(v: number, unit: string): string {
  const a = Math.abs(v);
  const [f, pre] = PREFIX.find(([f]) => a >= f * 0.9995) ?? PREFIX[PREFIX.length - 1];
  return `${fmt(v / f).replace('−', '-')}\\,\\mathrm{${pre}${unit}}`;
}

/** Panel: C, Q, V, E, U with values and the ratio to the reference state. */
export function capPanel(p: P): string {
  const s = stateOf(p);
  const r = refState();
  const rows: [string, number, number, string][] = [
    ['C', s.C, r.C, 'F'],
    ['Q', s.Q, r.Q, 'C'],
    ['V', s.V, r.V, 'V'],
    ['E', s.E, r.E, 'V/m'],
    ['U', s.U, r.U, 'J'],
  ];
  const body = rows.map(([k, v, v0, u]) => `${k} & ${siTex(v, u)} & ${fmt(v / v0)}`).join(' \\\\ ');
  return `\\begin{array}{lrr} & & X/X_0 \\\\ \\hline ${body} \\end{array}`;
}

/** Allowed charges per symbol: 1-2-5 steps. */
const UNITS = [1, 2, 5, 10, 20, 50, 100, 200, 500, 1000];

export interface CapCounts {
  /** Unscaled field-line count: N_REF · (E/E0) · (w/w0). */
  rawLines: number;
  /** Field lines drawn (capped; 0 when rawLines < 0.5, then one short arrow is drawn). */
  lines: number;
  /** Unscaled free-charge count: N_REF · (σ/σ0) · (w/w0), so that rawLines = rawFree / κ. */
  rawFree: number;
  /** Reference charges per drawn symbol (1, 2, 5, 10, ...). */
  unit: number;
  /** Free-charge symbols per plate. */
  free: number;
  /** Induced-charge symbols per dielectric face: the fraction 1 − 1/κ of the free charge. */
  bound: number;
}

/**
 * Drawn counts for one cross-section of width w ∝ √A. Field lines follow E linearly on a fixed
 * scale (N_REF lines across the reference plate at E0). Free charge follows σ on the same scale
 * while it fits; beyond maxFree each symbol stands for `unit` charges, shown by a key. Induced
 * charge cancels the fraction 1 − 1/κ of the free charge, so with unit = 1, free − bound = lines.
 */
export function capCounts(p: P, maxFree: number, maxLines: number): CapCounts {
  const st = stateOf(p);
  const ref = refState();
  const kappa = KAPPA[p.dielectric] ?? 1;
  const wr = Math.sqrt(p.A / A_REF);
  const rawLines = ((N_REF * st.E) / ref.E) * wr;
  const rawFree = ((N_REF * st.sigma) / ref.sigma) * wr;
  const lines = rawLines >= 0.5 ? Math.min(maxLines, Math.max(1, Math.round(rawLines))) : 0;
  const unit = UNITS.find((u) => rawFree / u <= maxFree) ?? UNITS[UNITS.length - 1];
  const free = Math.max(1, Math.round(rawFree / unit));
  let bound = 0;
  if (p.dielectric !== 'air') {
    bound = unit === 1 ? Math.max(0, free - (rawLines >= 0.5 ? Math.round(rawLines) : 0)) : Math.round(free * (1 - 1 / kappa));
    bound = Math.min(bound, free);
  }
  return { rawLines, lines, rawFree, unit, free, bound };
}

/** n evenly spaced x positions across [x0, x1]. */
const spread = (n: number, x0: number, x1: number) => Array.from({ length: n }, (_, i) => x0 + ((i + 0.5) * (x1 - x0)) / n);

/** A row of charge markers: free charge filled, induced (bound) charge outlined. */
function charges(g: Draw, n: number, x0: number, x1: number, y: number, sign: 1 | -1, free: boolean): void {
  const role = sign > 0 ? 'positive' : 'negative';
  for (const x of spread(n, x0, x1)) {
    if (free) g.circle({ x, y }, 6, { fill: role });
    else g.circle({ x, y }, 5.5, { fill: '#ffffff', role, width: 1.25 });
    g.text({ x, y }, sign > 0 ? '+' : '−', { size: free ? 12 : 11, color: free ? '#ffffff' : undefined, role, align: 'center', baseline: 'middle', weight: 700, dy: 0.5 });
  }
}

/** Battery symbol between y0 (−) and y1 (+) at x, long plate positive. */
function battery(g: Draw, x: number, y0: number, y1: number): void {
  const m = (y0 + y1) / 2;
  const h = g.px(5);
  g.line({ x, y: y1 }, { x, y: m + h }, { color: WIRE, width: 1.75 });
  g.line({ x, y: y0 }, { x, y: m - h }, { color: WIRE, width: 1.75 });
  g.line({ x: x - g.px(15), y: m + h }, { x: x + g.px(15), y: m + h }, { color: WIRE, width: 2 });
  g.line({ x: x - g.px(8), y: m - h }, { x: x + g.px(8), y: m - h }, { color: WIRE, width: 4 });
  g.text({ x: x + g.px(20), y: m }, '*V*_{0}', { size: 14, color: WIRE, align: 'left', baseline: 'middle' });
}

export const capacitor: Scene<P, { t: number }> = {
  id: 'capacitor',
  title: 'ch25.scene',
  params,
  world: () => ({ x: [-8, 11.6], y: [-8.6, 8.2], aspect: 'contain', padPx: 16 }),
  init: () => ({ t: 0 }),

  draw: (g, _s, p) => {
    const w = Math.sqrt(p.A); // drawn plate width [cm]
    // Proportional to d, but never too thin for the charge rows and field lines on a small stage.
    const gap = Math.max(p.d * GAP_K, g.px(66));
    const x0 = -w / 2;
    const x1 = w / 2;
    const yt = gap / 2;
    const yb = -gap / 2;
    const th = 0.45; // plate thickness
    const xb = 8.6; // battery x

    // Wires and battery; when disconnected, the top wire is open at the switch.
    const on = p.source === 'on';
    const ytop = yt + th + 2.2;
    const ybot = yb - th - 2.2;
    g.line({ x: 0, y: yt + th }, { x: 0, y: ytop }, { color: WIRE, width: 1.75 });
    g.line({ x: 0, y: yb - th }, { x: 0, y: ybot }, { color: WIRE, width: 1.75 });
    g.polyline([{ x: 0, y: ybot }, { x: xb, y: ybot }, { x: xb, y: -1.4 }], { color: WIRE, width: 1.75 });
    const sw: Vec2 = { x: xb - 3.2, y: ytop };
    g.polyline([{ x: xb, y: 1.4 }, { x: xb, y: ytop }, { x: sw.x + 1.6, y: ytop }], { color: WIRE, width: 1.75 });
    g.line({ x: 0, y: ytop }, { x: sw.x, y: ytop }, { color: WIRE, width: 1.75 });
    const blade = on ? { x: sw.x + 1.6, y: ytop } : { x: sw.x + 1.6 * Math.cos(0.6), y: ytop + 1.6 * Math.sin(0.6) };
    g.line(sw, blade, { color: WIRE, width: 2.25 });
    g.circle(sw, 2.5, { fill: WIRE });
    g.circle({ x: sw.x + 1.6, y: ytop }, 2.5, { fill: '#ffffff', color: WIRE, width: 1.5 });
    battery(g, xb, -1.4, 1.4);

    // Dielectric slab fills the gap.
    if (p.dielectric !== 'air') {
      g.polygon(
        [
          { x: x0, y: yb },
          { x: x1, y: yb },
          { x: x1, y: yt },
          { x: x0, y: yt },
        ],
        { fill: SLAB, color: '#b8c4cf', width: 1 },
      );
    }

    // Plates.
    for (const [ya, yb2] of [
      [yt, yt + th],
      [yb - th, yb],
    ]) {
      g.polygon(
        [
          { x: x0, y: ya },
          { x: x1, y: ya },
          { x: x1, y: yb2 },
          { x: x0, y: yb2 },
        ],
        { fill: '#8a8a8a' },
      );
    }

    // Counts per drawn cross-section: lines ∝ E, free charge ∝ σ (see capCounts).
    const c = capCounts(p, Math.max(4, Math.floor(w / g.px(15))), Math.max(4, Math.floor(w / g.px(12))));

    // Free charge sits on the inner faces of the plates, induced charge on the faces of the slab.
    // On a small stage the induced rows move closer to the plates to leave room for field lines.
    const bOff = Math.min(g.px(17), 0.22 * gap);
    const inset = 0.3;
    charges(g, c.free, x0 + inset, x1 - inset, yt, 1, true);
    charges(g, c.free, x0 + inset, x1 - inset, yb, -1, true);
    if (c.bound > 0) {
      charges(g, c.bound, x0 + inset, x1 - inset, yt - bOff, -1, false);
      charges(g, c.bound, x0 + inset, x1 - inset, yb + bOff, 1, false);
    }
    // One charge symbol stands for c.unit reference charges: a compact key above the top plate.
    if (c.unit > 1) {
      const kp: Vec2 = { x: x0 + g.px(6), y: yt + th + g.px(14) };
      g.circle(kp, 6, { fill: 'positive' });
      g.text(kp, '+', { size: 12, color: '#ffffff', align: 'center', baseline: 'middle', weight: 700, dy: 0.5 });
      g.text({ x: kp.x + g.px(10), y: kp.y }, `× ${c.unit}`, { size: 13, color: WIRE, align: 'left', baseline: 'middle' });
    }

    // Field lines from the + plate to the − plate, between the induced layers. Below one line
    // per cross-section a single shorter arrow, its length ∝ E, keeps the mapping monotonic.
    const lOff = c.bound > 0 ? bOff + g.px(10) : g.px(11);
    const yA = yt - lOff;
    const yB = yb + lOff;
    if (yA - yB > g.px(8)) {
      if (c.lines >= 1) {
        for (const x of spread(c.lines, x0 + inset, x1 - inset)) g.arrow({ x, y: yA }, { x: 0, y: yB - yA }, { role: 'field', width: 1.5 });
      } else if (c.rawLines > 0) {
        const len = Math.max(g.px(10), c.rawLines * (yA - yB));
        g.arrow({ x: 0, y: len / 2 }, { x: 0, y: -len }, { role: 'field', width: 1.5 });
      }
    }
  },

  overlay: (_s, p) => capPanel(p),

  info: {
    goals: ['ch25.goal.C', 'ch25.goal.U'],
    observe: ['ch25.obs.on', 'ch25.obs.off', 'ch25.obs.gauss', 'ch25.obs.geom', 'ch25.obs.pull'],
    equations: ['C = \\frac{\\kappa \\varepsilon_0 A}{d}, \\quad Q = CV', 'E = \\frac{V}{d} = \\frac{Q}{\\kappa \\varepsilon_0 A}', 'U = \\frac{Q^2}{2C} = \\frac{1}{2} C V^2'],
    assumptions: ['ch25.assume.ref', 'ch25.assume.edge', 'ch25.assume.draw'],
  },
};
