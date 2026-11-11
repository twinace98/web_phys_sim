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
const GAP_K = 4; // drawn gap per mm (world units)
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
    control: 'select',
    choices: [50, 100, 200],
    default: 100,
    unit: 'cm²',
  },
  d: {
    kind: 'number',
    label: 'ch25.p.d',
    desc: 'ch25.d.d',
    group: 'advanced',
    live: true,
    control: 'select',
    choices: [0.5, 1, 2],
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
  world: () => ({ x: [-9, 13], y: [-8.5, 8], aspect: 'contain', padPx: 16 }),
  init: () => ({ t: 0 }),

  draw: (g, _s, p) => {
    const st = stateOf(p);
    const ref = refState();
    const w = Math.sqrt(p.A); // drawn plate width [cm]
    const gap = p.d * GAP_K;
    const x0 = -w / 2;
    const x1 = w / 2;
    const yt = gap / 2;
    const yb = -gap / 2;
    const th = 0.45; // plate thickness
    const xb = 9; // battery x

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

    // Counts: free charge ∝ Q, field lines ∝ E · width; induced charge = free − lines (Gauss).
    const maxN = Math.max(4, Math.floor(w / g.px(15)));
    const nFree = Math.min(maxN, Math.round((N_REF * st.Q) / ref.Q));
    const nLines = Math.min(maxN, Math.round(((N_REF * st.E) / ref.E) * (w / Math.sqrt(A_REF))));
    const nBound = p.dielectric === 'air' ? 0 : Math.max(0, nFree - nLines);

    // Free charge sits on the inner faces of the plates, induced charge on the faces of the slab.
    const inset = 0.3;
    charges(g, nFree, x0 + inset, x1 - inset, yt, 1, true);
    charges(g, nFree, x0 + inset, x1 - inset, yb, -1, true);
    if (nBound > 0) {
      charges(g, nBound, x0 + inset, x1 - inset, yt - g.px(17), -1, false);
      charges(g, nBound, x0 + inset, x1 - inset, yb + g.px(17), 1, false);
    }

    // Field lines from the + plate to the − plate, between the induced layers.
    const yA = yt - g.px(nBound > 0 ? 28 : 11);
    const yB = yb + g.px(nBound > 0 ? 28 : 11);
    if (yA - yB > g.px(12)) {
      for (const x of spread(nLines, x0 + inset, x1 - inset)) g.arrow({ x, y: yA }, { x: 0, y: yB - yA }, { role: 'field', width: 1.5 });
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
