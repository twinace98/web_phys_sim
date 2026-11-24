// Ch 41 scene: filling the bands. Band diagram with electrons and holes beside the Fermi-Dirac
// occupation f(E); metal, two semiconductors and an insulator, at a chosen temperature.
import { fmtTick } from '../../core/format';
import { CONST, num, slider, texOf, tn, u } from '../../core/tex';
import type { ParamSchema, Scene } from '../../core/types';
import { Frame, PX_WORLD, TICK, canvasBox, linePx, pow10, split, textPx } from '../modern/frame';
import { BAND, ELECTRON, bandBox, electron, hole, scatter, tz, tzExp } from './common';
import { KB, MATERIALS, N_METAL, Nc, Nv, fermi, intrinsicMu, lnNi, ni, shownPairs, type MaterialId } from './physics';

type P = { mat: string; T: number; scale: string };

const Y: [number, number] = [-4, 4];
const F_MIN = 1e-30;
/** Metal: one band holding the Fermi level, and the next band above. */
const METAL_BANDS: [number, number][] = [
  [-3.2, 1.3],
  [2.6, 5],
];
const BAND_DEPTH = 2.6;

const params: ParamSchema<P> = {
  mat: {
    kind: 'select',
    label: 'ch41.f.p.mat',
    desc: 'ch41.f.d.mat',
    group: 'main',
    live: true,
    default: 'si',
    options: [
      { value: 'metal', label: 'ch41.mat.metal' },
      { value: 'ge', label: 'ch41.mat.ge' },
      { value: 'si', label: 'ch41.mat.si' },
      { value: 'diamond', label: 'ch41.mat.diamond' },
    ],
  },
  T: {
    kind: 'number',
    label: 'ch41.p.T',
    desc: 'ch41.d.T',
    group: 'main',
    live: true,
    control: 'slider',
    min: 0,
    max: 600,
    step: 10,
    default: 300,
    unit: 'K',
  },
  scale: {
    kind: 'select',
    label: 'ch41.f.p.scale',
    desc: 'ch41.f.d.scale',
    group: 'advanced',
    live: true,
    default: 'log',
    options: [
      { value: 'log', label: 'ch41.scale.log' },
      { value: 'lin', label: 'ch41.scale.lin' },
    ],
  },
};

interface Layout {
  bands: [number, number][];
  /** Chemical potential (Fermi level) [eV]. */
  mu: number;
  Ec?: number;
  Ev?: number;
  /** Carrier density [cm⁻³]: conduction electrons. */
  n: number;
  pairs: number;
}

export function layout(mat: MaterialId, T: number): Layout {
  if (mat === 'metal') return { bands: METAL_BANDS, mu: 0, n: N_METAL, pairs: 0 };
  const m = MATERIALS[mat];
  const Ev = -m.Eg / 2;
  const Ec = m.Eg / 2;
  const n = ni(m, T);
  return {
    bands: [
      [Ev - BAND_DEPTH, Ev],
      [Ec, Ec + BAND_DEPTH],
    ],
    mu: intrinsicMu(m, T),
    Ec,
    Ev,
    n,
    pairs: shownPairs(n),
  };
}

/** Slot grid inside a band: rows from the edge given by `fromTop`. */
function slots(f: Frame, x0: number, x1: number, e0: number, e1: number, fromTop: boolean): [number, number][][] {
  const rowPx = 12;
  const colPx = 13;
  const nRows = Math.max(1, Math.floor((f.Y(e0) - f.Y(e1)) / rowPx));
  const nCols = Math.max(1, Math.floor((f.X(x1) - f.X(x0)) / colPx));
  const rows: [number, number][][] = [];
  for (let r = 0; r < nRows; r++) {
    const py = fromTop ? f.Y(e1) + (r + 0.5) * rowPx : f.Y(e0) - (r + 0.5) * rowPx;
    const row: [number, number][] = [];
    for (let c = 0; c < nCols; c++) row.push([f.xAt(f.X(x0) + (c + 0.5) * ((f.X(x1) - f.X(x0)) / nCols)), f.yAt(py)]);
    rows.push(row);
  }
  return rows;
}

/** Order in which carriers take the slots of a row: scattered, the same every frame. */
const order = (n: number) =>
  Array.from({ length: n }, (_, i) => i).sort((a, b) => scatter(a + 7) - scatter(b + 7));

/** kT [eV] with k_B from the constant table and T as its slider prints it (R1): 0.0259 eV at 300 K. */
export const kTLine = (T: number) => `kT = (${CONST.kBeV.tex}\\ \\mathrm{eV/K})(${slider(params.T, T)}\\ \\mathrm{K}) = ${T === 0 ? '0' : tn(KB * T)}${u('eV')}`;

/**
 * An exponent x in e^{±x}, to 2 decimals (R5): its absolute error is the relative error of the
 * exponential, so 21.66 (not 21.7, which is 4 % off in e^{−x}).
 */
export const expTex = (x: number) => texOf(x.toFixed(2));

/**
 * Carrier density readout (R7b): 0 only at T = 0 (exactly none), "< 1" below one carrier per cm³
 * (diamond at 300 K: 1.13×10⁻²⁷ cm⁻³ in the Σ panel; at 30 K the value underflows to 0 in double
 * precision but still reads "< 1"), else 3 figures.
 */
export const densityText = (v: number, T: number): string | undefined => (T <= 0 ? '0' : v < 1 ? '< 1' : undefined);

/**
 * Formula panel: kT, then n_i from √(N_c N_v) e^{−E_g/2kT}, the intrinsic Fermi level and the
 * occupation at the conduction-band edge (the dot on the f(E) plot). Metal: n and f(E_F + kT).
 */
export function fillingLines(p: P): string[] {
  const mat = p.mat as MaterialId;
  const L = layout(mat, p.T);
  const kT = KB * p.T;
  const lines = [kTLine(p.T)];
  if (mat === 'metal') {
    lines.push(`n = ${tz(L.n)}${u('cm^{-3}')}`);
    if (p.T > 0) lines.push(`f(E_\\text{F} + kT) = \\frac{1}{e^{1} + 1} = ${tn(fermi(L.mu + kT, L.mu, p.T))}`);
    return lines;
  }
  const m = MATERIALS[mat];
  if (p.T <= 0) {
    lines.push(`n_i = \\sqrt{N_\\text{c}N_\\text{v}}\\,e^{-E_\\text{g}/2kT} = 0`, `f(E_\\text{c}) = 0`);
    return lines;
  }
  const x = m.Eg / (2 * kT);
  const xc = (L.Ec! - L.mu) / kT;
  // From the logarithms (R7b): e^{−x} underflows to an exact 0 for diamond below about 40 K.
  const lnF = -xc - Math.log1p(Math.exp(-xc));
  lines.push(
    `\\frac{E_\\text{g}}{2kT} = \\frac{${num(m.Eg)}\\ \\mathrm{eV}}{2 \\times ${tn(kT)}\\ \\mathrm{eV}} = ${expTex(x)}`,
    // n_i over two lines: one line would shrink to about 0.64 × in the docked panel. Diamond: no
    // 0.00 for 1.13×10⁻²⁷ cm⁻³ (R7b).
    `n_i = \\sqrt{N_\\text{c}N_\\text{v}}\\,e^{-E_\\text{g}/2kT}`,
    `= (${tz(Math.sqrt(Nc(m, p.T) * Nv(m, p.T)))}\\ \\mathrm{cm^{-3}})\\,e^{-${expTex(x)}} = ${tzExp(lnNi(m, p.T))}${u('cm^{-3}')}`,
    `E_\\text{F} = \\tfrac12 kT\\ln(N_\\text{v}/N_\\text{c}) = ${Math.abs(L.mu) < 1e-12 ? '0' : tn(L.mu)}${u('eV')}`,
    `f(E_\\text{c}) = \\frac{1}{e^{(E_\\text{c} - E_\\text{F})/kT} + 1} = \\frac{1}{e^{${expTex(xc)}} + 1} = ${tzExp(lnF)}`,
  );
  return lines;
}

export const filling: Scene<P, { t: number }> = {
  id: 'filling',
  title: 'ch41.f.scene',
  params,
  world: PX_WORLD,
  init: () => ({ t: 0 }),

  draw: (g, _s, p) => {
    const mat = p.mat as MaterialId;
    const L = layout(mat, p.T);
    const wide = g.vp.w > g.vp.h * 1.1;
    const outer = canvasBox(g);
    const inner = { l: outer.l + 48, t: outer.t + 30, r: outer.r - 40, b: outer.b - 36 };
    const [boxA, boxB] = split(inner, true, wide ? 0.5 : 0.48, wide ? 60 : 30);
    const f = new Frame(g, boxA, [0, 1], Y);
    const x0 = 0.08;
    const x1 = 0.92;

    f.clip(() => {
      for (const [e0, e1] of L.bands) bandBox(f, x0, x1, e0, Math.min(e1, Y[1] + 1));
    });
    // Electrons and holes.
    f.clip(() => {
      if (mat === 'metal') {
        let i = 0;
        for (const [e0, e1] of L.bands) {
          for (const row of slots(f, x0, x1, e0, Math.min(e1, Y[1]), false)) {
            for (const [x, E] of row) {
              if (fermi(E, L.mu, p.T) > scatter(i++)) electron(g, f, x, E);
            }
          }
        }
        return;
      }
      const [vb, cb] = L.bands;
      const vRows = slots(f, x0, x1, vb[0], vb[1], true);
      const holeAt = new Set<string>();
      const cols = vRows[0].length;
      const ord = order(cols);
      for (let k = 0; k < L.pairs; k++) holeAt.add(`${Math.floor(k / cols)}|${ord[k % cols]}`);
      vRows.forEach((row, r) =>
        row.forEach(([x, E], c) => {
          if (holeAt.has(`${r}|${c}`)) hole(g, f, x, E);
          else electron(g, f, x, E);
        }),
      );
      const cRows = slots(f, x0, x1, cb[0], cb[1], false);
      const ordC = order(cRows[0].length);
      for (let k = 0; k < L.pairs; k++) {
        const r = Math.floor(k / ordC.length);
        const [x, E] = cRows[r][ordC[(k + 3) % ordC.length]];
        electron(g, f, x, E);
      }
    });
    // Band gap bracket, left of the bands.
    if (L.Ec !== undefined && L.Ev !== undefined) {
      const xg = f.X(0.04);
      const y0 = f.Y(L.Ev);
      const y1 = f.Y(L.Ec);
      linePx(g, xg, y0, xg, y1, { color: TICK, width: 1.25 });
      linePx(g, xg - 4, y0, xg + 4, y0, { color: TICK, width: 1.25 });
      linePx(g, xg - 4, y1, xg + 4, y1, { color: TICK, width: 1.25 });
      if (y0 - y1 > 18) textPx(g, xg + 6, (y0 + y1) / 2 + (Math.abs((y0 + y1) / 2 - f.Y(L.mu)) < 10 ? -12 : 0), '*E*_{g}', { size: 13, color: TICK, baseline: 'middle' });
    }
    // Axis names outside the frames: inside, E (eV) sat on the conduction band of diamond and the
    // metal (it reaches the top), and f(E) on the f = 1 edge the curve runs down (390 px).
    f.axes({ xTicks: false });
    textPx(g, f.box.l, f.box.t - 8, '*E* (eV)', { size: 12, color: TICK, align: 'left' });

    // Fermi-Dirac occupation, same energy axis.
    const log = p.scale === 'log';
    const fr = new Frame(g, boxB, log ? [F_MIN, 1] : [0, 1], Y, { x: log });
    fr.clip(() => {
      for (const [e0, e1] of L.bands) fr.polygon([[fr.xr[0], e0], [1, e0], [1, e1], [fr.xr[0], e1]], { fill: BAND });
      const pts: [number, number][] = [];
      for (let i = 0; i <= 600; i++) {
        const E = Y[0] + ((Y[1] - Y[0]) * i) / 600;
        const v = fermi(E, L.mu, p.T);
        pts.push([log ? Math.max(v, F_MIN * 0.5) : v, E]);
      }
      fr.polyline(pts, { color: ELECTRON, width: 2 });
      if (L.Ec !== undefined) {
        const fc = fermi(L.Ec, L.mu, p.T);
        if (!log || fc >= F_MIN) g.circle(fr.P(fc, L.Ec), 4.5, { fill: ELECTRON });
      }
    });
    fr.axes({
      xTicks: log ? [1e-30, 1e-20, 1e-10, 1] : [0, 0.5, 1],
      xFmt: log ? (v) => pow10(Math.round(Math.log10(v))) : undefined,
      yTicks: false,
    });
    textPx(g, fr.box.r, fr.box.b + 30, '*f*(*E*)', { size: 12, color: TICK, align: 'right' });

    // Fermi level across both panels.
    const yF = f.Y(L.mu);
    linePx(g, boxA.l, yF, boxB.r, yF, { color: '#1a1a1a', width: 1.25, dash: [6, 4] });
    textPx(g, boxB.r + 4, yF, '*E*_{F}', { size: 13, color: TICK, baseline: 'middle' });
  },

  readouts: [
    // The table value as its dropdown option and the Σ panel print it (R1, R8): Ge 0.66 eV, not 0.660.
    {
      label: 'E_\\text{g}',
      unit: 'eV',
      value: (_s, p) => (p.mat === 'metal' ? NaN : MATERIALS[p.mat as Exclude<MaterialId, 'metal'>].Eg),
      format: (v) => (Number.isFinite(v) ? fmtTick(v) : undefined),
    },
    { label: 'n', unit: 'cm⁻³', value: (_s, p) => layout(p.mat as MaterialId, p.T).n, zeroTol: 0, format: (v, _s, p) => densityText(v, p.T) },
  ],

  formula: (_s, p) => fillingLines(p),

  info: {
    goals: ['ch41.f.goal.class', 'ch41.f.goal.T'],
    observe: ['ch41.f.obs.metal', 'ch41.f.obs.semi', 'ch41.f.obs.ins', 'ch41.f.obs.log', 'ch41.f.obs.zero'],
    equations: ['f(E) = \\frac{1}{e^{(E - E_\\text{F})/kT} + 1}', 'n_i = \\sqrt{N_c N_v}\\, e^{-E_\\text{g}/2kT}'],
    assumptions: ['ch41.f.assume.dots', 'ch41.f.assume.param', 'ch41.f.assume.metal', 'ch41.f.assume.zero'],
  },
};
