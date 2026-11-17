// Review page 102 (→ Ch 39): hydrogen energy levels, transitions and line spectra.
// Tab 1: pick a transition (stage handles or steppers n_i, n_f); the photon and its line, which
// accumulates in the spectrum strip. Tab 2: play a whole series converging to its limit.
// Energy diagram: linear in E, with a magnified inset of the top band (n ≥ 5) so every label reads.
import { fmt, fmtTick } from '../../../core/format';
import { t } from '../../../core/i18n';
import type { Handle, ParamSchema, Scene } from '../../../core/types';
import type { Draw } from '../../../draw/draw';
import { arrowPx } from '../../../draw/draw';
import { ROLE_COLOR, theme } from '../../../draw/theme';
import { texNum } from '../../field/render';
import { Frame, PX_WORLD, TICK, W, linePx, textPx, type Box } from '../../modern/frame';
import { HC_EVNM, R_H, SERIES, bohrRadius, energy, isEmission, lambdaVac, photonEnergy, seriesLimit, type SeriesId } from './physics';
import { MARK_ROOM, drawPhoton, drawSpectrum, photonRow, region, spectrumHeight, type SpecLine } from './spectrum';

/** Highest level the transition controls reach. */
export const N_PICK = 10;
/** Energy ranges [eV] of the full diagram and of the magnified inset (n ≥ 5 and the limit). */
export const MAIN_YR: [number, number] = [-14.6, 0.7];
export const ZOOM_YR: [number, number] = [-0.62, 0.06];
/** Levels labelled in the full diagram; the inset labels the rest. */
const MAIN_LABELLED = 4;
/** λ axis of the spectrum strip [nm]. */
export const SPEC_RANGE: [number, number] = [80, 5000];
/** Minimum vertical gap between level labels [px]. */
const GAP = 14;

const LEVEL = '#1a1a1a';
const FAINT = '#a6a6a6';
const BOX = '#9a9a9a';
const ELECTRON = ROLE_COLOR.position;

// ------------------------------------------------------------------ layout

interface Lay {
  narrow: boolean;
  main: Frame;
  zoom: Frame;
  /** Width of the label column right of each panel. */
  labW: number;
  bohr: Box | null;
  spec: { l: number; r: number; t: number };
}

function layout(g: Draw, opts: { bohr: boolean; bracket: boolean }): Lay {
  const Wd = g.vp.w;
  const H = g.vp.h;
  const narrow = Wd < 640;
  const specH = spectrumHeight(narrow, opts.bracket);
  const t = 26;
  const b = H - specH - (narrow ? 16 : 22);
  const gutL = narrow ? 46 : 58;
  const labW = narrow ? 26 : 56;
  const gutZ = narrow ? 46 : 58;
  const right = 10;
  const wantBohr = opts.bohr && Wd >= 900;
  const bohrW = wantBohr ? Math.min(b - t, Wd * 0.34) : 0;
  const avail = Wd - gutL - labW - gutZ - labW - right - (wantBohr ? bohrW + 28 : 0);
  const mainW = avail * 0.55;
  const ml = gutL;
  const mr = ml + mainW;
  const zl = mr + labW + gutZ;
  const zr = zl + avail * 0.45;
  const main = new Frame(g, { l: ml, r: mr, t, b }, [0, 1], MAIN_YR);
  const zoom = new Frame(g, { l: zl, r: zr, t, b }, [0, 1], ZOOM_YR);
  const bohr = wantBohr ? { l: Wd - right - bohrW, r: Wd - right, t: t + (b - t - bohrW) / 2, b: t + (b - t + bohrW) / 2 } : null;
  return { narrow, main, zoom, labW, bohr, spec: { l: gutL, r: Wd - right - 4, t: b + (narrow ? 12 : 18) } };
}

// ------------------------------------------------------------------ diagram pieces

/** Levels labelled in the inset: from n = 5 up while they stay GAP apart; the selected ones always. */
export function zoomLabels(Y: (E: number) => number, selected: number[], nMax = 40): number[] {
  const y0 = Y(0);
  const out: number[] = [];
  let last = Infinity;
  for (let n = MAIN_LABELLED + 1; n <= nMax; n++) {
    const y = Y(energy(n));
    if (last - y < GAP || y - y0 < GAP) break;
    out.push(n);
    last = y;
  }
  for (const s of selected) {
    if (s <= MAIN_LABELLED || out.includes(s)) continue;
    const ys = Y(energy(s));
    for (let i = out.length - 1; i >= 0; i--) if (Math.abs(Y(energy(out[i])) - ys) < GAP) out.splice(i, 1);
    out.push(s);
  }
  return out.sort((a, b) => a - b);
}

/** Tick text of a level energy: 3 significant figures, no trailing zeros (−3.4, −0.85). */
const tickE = (E: number) => (E === 0 ? '0' : fmtTick(Number(E.toPrecision(3))));

/** Vertical energy axis on the left of a panel with ticks at the given energies. */
function axisY(f: Frame, ticks: number[], hl: number[]): void {
  const g = f.g;
  const { l, t, b } = f.box;
  linePx(g, l, t, l, b, { color: '#5c5c5c', width: 1 });
  for (const E of ticks) {
    const y = f.Y(E);
    linePx(g, l - 4, y, l, y, { color: '#5c5c5c', width: 1 });
    const on = hl.some((h) => Math.abs(h - E) < 1e-12);
    textPx(g, l - 7, y, tickE(E), { size: 11, color: on ? LEVEL : TICK, align: 'right', baseline: 'middle', weight: on ? 600 : 400 });
  }
}

/** Level lines n = nFrom…nTo, the limit E = 0 (dashed) and the unbound region above it. */
function drawLevels(f: Frame, nFrom: number, nTo: number, strong: (n: number) => boolean, selected: number[]): void {
  const g = f.g;
  const { l, r, t } = f.box;
  f.clip(() => {
    const y0 = f.Y(0);
    g.polygon([W(g, l, t), W(g, r, t), W(g, r, y0), W(g, l, y0)], { fill: '#f1f1f1', fillAlpha: 1 });
    for (let n = nFrom; n <= nTo; n++) {
      const y = f.Y(energy(n));
      const sel = selected.includes(n);
      linePx(g, l, y, r, y, sel ? { color: LEVEL, width: 2.25 } : strong(n) ? { color: LEVEL, width: 1.25 } : { color: FAINT, width: 1 });
    }
    linePx(g, l, y0, r, y0, { color: LEVEL, width: 1.25, dash: [5, 4] });
  });
}

/** Labels right of a panel: "n = k" (narrow: "k" under an "n" header). */
function levelLabels(f: Frame, lay: Lay, ns: number[], selected: number[]): void {
  const g = f.g;
  const x = f.box.r + 6;
  for (const n of ns) {
    const sel = selected.includes(n);
    const s = lay.narrow ? String(n) : `*n* = ${n}`;
    textPx(g, x, f.Y(energy(n)), s, { size: 12, color: LEVEL, baseline: 'middle', weight: sel ? 700 : 400 });
  }
  textPx(g, x, f.Y(0), lay.narrow ? '∞' : '*n* = ∞', { size: 12, color: LEVEL, baseline: 'middle' });
  if (lay.narrow) textPx(g, x, f.box.t - 10, '*n*', { size: 12, color: TICK, baseline: 'middle' });
}

/** Both panels: levels, axes, labels, the inset outline and the box it magnifies. */
function drawDiagram(g: Draw, lay: Lay, selected: number[], strongLow: number[] = []): void {
  const { main, zoom } = lay;
  drawLevels(main, 1, 60, (n) => n <= MAIN_LABELLED || strongLow.includes(n), selected);
  axisY(main, [1, 2, 3, 4].map(energy).concat(0), selected.filter((n) => n <= MAIN_LABELLED).map(energy));
  levelLabels(main, lay, [1, 2, 3, 4], selected);
  textPx(g, main.box.l - 7, main.box.t - 12, '*E* (eV)', { size: 12, color: TICK, align: 'left', baseline: 'middle' });

  const zl = zoomLabels((E) => zoom.Y(E), selected);
  drawLevels(zoom, MAIN_LABELLED + 1, 200, (n) => zl.includes(n), selected);
  axisY(zoom, zl.map(energy).concat(0), selected.map(energy));
  levelLabels(zoom, lay, zl, selected);

  // The band the inset magnifies (dashed box in the full diagram) and the inset's own outline.
  const dash = { color: BOX, width: 1, dash: [4, 3] };
  const yT = main.Y(ZOOM_YR[1]);
  const yB = main.Y(ZOOM_YR[0]);
  for (const [x0, y0, x1, y1] of [
    [main.box.l + 1, yT, main.box.r - 1, yT],
    [main.box.l + 1, yB, main.box.r - 1, yB],
    [main.box.l + 1, yT, main.box.l + 1, yB],
    [main.box.r - 1, yT, main.box.r - 1, yB],
    [zoom.box.l, zoom.box.t, zoom.box.r, zoom.box.t],
    [zoom.box.l, zoom.box.b, zoom.box.r, zoom.box.b],
    [zoom.box.r, zoom.box.t, zoom.box.r, zoom.box.b],
  ] as const)
    linePx(g, x0, y0, x1, y1, dash);
}

/** Vertical transition arrow at panel fraction fx, clipped to the panel; returns its visible span [px]. */
function transitionArrow(f: Frame, fx: number, ni: number, nf: number, st: { color?: string; width?: number; alpha?: number; grow?: number } = {}): { x: number; ya: number; yb: number } {
  const x = f.box.l + fx * (f.box.r - f.box.l);
  const yi = f.Y(energy(ni));
  const yf0 = f.Y(energy(nf));
  const yf = yi + (yf0 - yi) * (st.grow ?? 1);
  if (Math.abs(yf - yi) >= 3)
    f.clip(() => arrowPx(f.g.ctx, x, yi, x, yf, { color: st.color ?? LEVEL, width: st.width ?? 2, alpha: st.alpha ?? 1 }), 1);
  const lo = Math.max(Math.min(yi, yf), f.box.t);
  const hi = Math.min(Math.max(yi, yf), f.box.b);
  return { x, ya: lo, yb: hi };
}

/** Pixel heights of the level lines n = 1…60 inside a panel. */
const levelYs = (f: Frame): number[] =>
  Array.from({ length: 60 }, (_, k) => f.Y(energy(k + 1))).filter((y) => y >= f.box.t && y <= f.box.b);

/** Region mark for an invisible photon: UV, IR (and X-ray for the well page). */
export const regionMark = (nm: number): string | undefined => {
  const r = region(nm);
  return r === 'vis' ? undefined : t(`hyd.region.${r}`);
};

const fmtLambda = (nm: number) => (nm >= 1e4 ? `${fmt(nm / 1000, 3)}\\ \\mu\\text{m}` : `${texNum(nm, 4)}\\ \\text{nm}`);

// ------------------------------------------------------------------ tab 1: transitions

type PT = { ni: number; nf: number; series: string; bohr: boolean };
interface ST {
  t: number;
  /** Lines produced so far: "lo-hi" → [lo, hi]. */
  seen: Map<string, [number, number]>;
  lay?: Lay;
}

const nParam = (key: 'ni' | 'nf', def: number) => ({
  kind: 'number' as const,
  label: `hyd.p.${key}`,
  desc: `hyd.d.${key}`,
  group: 'main' as const,
  live: true,
  control: 'stepper' as const,
  min: 1,
  max: N_PICK,
  step: 1,
  default: def,
});

const seriesOptions = (none: boolean) => [
  ...(none ? [{ value: 'none', label: 'hyd.series.none' }] : []),
  ...(['lyman', 'balmer', 'paschen', 'brackett'] as const).map((v) => ({ value: v, label: `hyd.series.${v}` })),
];

const transParams: ParamSchema<PT> = {
  ni: nParam('ni', 3),
  nf: nParam('nf', 2),
  series: { kind: 'select', label: 'hyd.p.series', desc: 'hyd.d.series', group: 'advanced', live: true, default: 'none', options: seriesOptions(true) },
  bohr: { kind: 'toggle', label: 'hyd.p.bohr', desc: 'hyd.d.bohr', group: 'advanced', live: true, default: true },
};

/** Arrow position (fraction of the panel width). */
const FX = 0.3;

/** Nearest level 1…N_PICK to a pointer height in a panel (energy from the panel's linear scale). */
export function nearestLevel(E: number): number {
  let best = 1;
  for (let n = 2; n <= N_PICK; n++) if (Math.abs(energy(n) - E) < Math.abs(energy(best) - E)) best = n;
  return best;
}

function levelHandle(which: 'ni' | 'nf', panel: 'main' | 'zoom'): Handle<ST, PT> {
  return {
    pos: (s, p) => {
      const f = s.lay?.[panel];
      if (!f) return { x: NaN, y: NaN };
      return W(f.g, f.box.l + FX * (f.box.r - f.box.l), f.Y(energy(p[which])));
    },
    radiusPx: 14,
    when: panel === 'zoom' ? (p) => p[which] > MAIN_LABELLED : undefined,
    onDrag: (ctx, s, w) => {
      const f = s.lay?.[panel];
      if (!f) return;
      const [, py] = f.g.vp.toPx(w.x, w.y);
      const n = nearestLevel(f.yAt(py));
      const other = which === 'ni' ? 'nf' : 'ni';
      if (n !== ctx.params[which] && n !== ctx.params[other]) ctx.set(which, n);
    },
    // Double tap on either end reverses the transition (emission ↔ absorption).
    onDoubleTap: (ctx) => {
      const { ni, nf } = ctx.params;
      if (ni === nf) return;
      ctx.set('ni', nf);
      ctx.set('nf', ni);
    },
  };
}

/** Bohr picture: orbits r_n = n² a₀ up to the higher selected level, the jump and the photon. */
function drawBohr(g: Draw, box: Box, ni: number, nf: number, lambda: number): void {
  const cx = (box.l + box.r) / 2;
  const cy = (box.t + box.b) / 2;
  const R = (box.r - box.l) / 2 - 58;
  const N = Math.max(ni, nf, 3);
  const rpx = (n: number) => (R * bohrRadius(n)) / bohrRadius(N);
  for (let n = 1; n <= N; n++) {
    const sel = n === ni || n === nf;
    g.arc(W(g, cx, cy), rpx(n), 0, 2 * Math.PI, sel ? { color: LEVEL, width: 1.5, dash: n === ni && ni !== nf ? [5, 4] : undefined } : { color: FAINT, width: 1 });
  }
  g.circle(W(g, cx, cy), 3.5, { fill: ROLE_COLOR.positive });
  const a = Math.PI / 5;
  const ux = Math.cos(a);
  const uy = -Math.sin(a);
  const ri = rpx(ni);
  const rf = rpx(nf);
  if (ni !== nf) {
    g.circle(W(g, cx + ri * ux, cy + ri * uy), 4.5, { color: ELECTRON, width: 1.5 });
    if (Math.abs(ri - rf) > 12) arrowPx(g.ctx, cx + (ri + Math.sign(rf - ri) * 6) * ux, cy + (ri + Math.sign(rf - ri) * 6) * uy, cx + (rf - Math.sign(rf - ri) * 6) * ux, cy + (rf - Math.sign(rf - ri) * 6) * uy, { color: LEVEL, width: 1.75 });
    // Photon leaves (emission) or arrives (absorption) radially, just past the outer orbit.
    const b = a + 0.22;
    const vx = Math.cos(b);
    const vy = -Math.sin(b);
    const r0 = Math.max(ri, rf) + 8;
    const r1 = r0 + 52;
    const [x0, y0, x1, y1] = [cx + r0 * vx, cy + r0 * vy, cx + r1 * vx, cy + r1 * vy];
    if (isEmission(ni, nf)) drawPhoton(g, x0, y0, x1, y1, lambda);
    else drawPhoton(g, x1, y1, x0, y0, lambda);
  }
  g.circle(W(g, cx + rf * ux, cy + rf * uy), 4.5, { fill: ELECTRON });
  // Orbit labels below the centre line, only where the two radii are far enough apart.
  const lab = (n: number) => textPx(g, cx, cy + rpx(n) + 6 + 8 * theme.scale, `*n* = ${n}`, { size: 12, color: LEVEL, align: 'center', baseline: 'middle' });
  lab(Math.max(ni, nf));
  if (ni !== nf && Math.abs(ri - rf) > 18) lab(Math.min(ni, nf));
}

const seriesLines = (id: string, count: number): number[] => {
  const nl = SERIES[id as SeriesId];
  return Array.from({ length: count }, (_, k) => lambdaVac(nl + 1 + k, nl));
};

export const transitions: Scene<PT, ST> = {
  id: 'transitions',
  title: 'hyd.scene.trans',
  params: transParams,
  world: PX_WORLD,
  init: () => ({ t: 0, seen: new Map() }),

  draw: (g, s, p) => {
    const series = p.series !== 'none' ? (p.series as SeriesId) : null;
    const lay = layout(g, { bohr: p.bohr, bracket: !!series });
    s.lay = lay;
    const { ni, nf } = p;
    const same = ni === nf;
    const lam = same ? Infinity : lambdaVac(ni, nf);
    if (!same) {
      const lo = Math.min(ni, nf);
      const hi = Math.max(ni, nf);
      s.seen.set(`${lo}-${hi}`, [lo, hi]);
    }
    drawDiagram(g, lay, [ni, nf], series ? [SERIES[series]] : []);

    // Transition arrow in both panels; the photon where the arrow is longer.
    const spans = [lay.main, lay.zoom].map((f) => ({ f, sp: same ? null : transitionArrow(f, FX, ni, nf) }));
    for (const { f } of spans) {
      const y = f.Y(energy(ni));
      if (y >= f.box.t && y <= f.box.b) {
        const x = f.box.l + FX * (f.box.r - f.box.l);
        g.circle(W(g, x, y), 11, { fill: ELECTRON, alpha: 0.1 });
        g.circle(W(g, x, y), 4.5, { fill: '#ffffff', color: ELECTRON, width: 1.75 });
      }
      const yf = f.Y(energy(nf));
      if (!same && yf >= f.box.t && yf <= f.box.b) g.circle(W(g, f.box.l + FX * (f.box.r - f.box.l), yf), 11, { fill: ELECTRON, alpha: 0.1 });
    }
    if (!same) {
      const best = spans.reduce((a, b) => ((b.sp!.yb - b.sp!.ya) > (a.sp!.yb - a.sp!.ya) ? b : a));
      const { f, sp } = best;
      const row = photonRow(sp!.ya, sp!.yb, levelYs(f));
      const ym = row.y;
      const mark = row.gap >= MARK_ROOM ? regionMark(lam) : undefined;
      const xa = sp!.x + 7;
      const xb = f.box.r - 4;
      if (isEmission(ni, nf)) drawPhoton(g, xa, ym, xb, ym, lam, mark);
      else drawPhoton(g, xb, ym, xa, ym, lam, mark);
    }

    if (lay.bohr) drawBohr(g, lay.bohr, ni, nf, lam);

    const lines: SpecLine[] = [...s.seen.values()].map(([lo, hi]) => ({ lambda: lambdaVac(hi, lo), current: !same && lo === Math.min(ni, nf) && hi === Math.max(ni, nf) }));
    let limit: number | undefined;
    let bracket;
    if (series) {
      const nl = SERIES[series];
      for (const l of seriesLines(series, 40)) lines.push({ lambda: l, ghost: true });
      limit = seriesLimit(nl);
      bracket = { from: limit, to: lambdaVac(nl + 1, nl), text: t(`hyd.series.${series}`) };
    }
    drawSpectrum(g, lay.spec, {
      range: SPEC_RANGE,
      mode: !same && !isEmission(ni, nf) ? 'absorption' : 'emission',
      lines,
      names: { uv: t('hyd.region.uv'), ir: t('hyd.region.ir') },
      xLabel: '*λ* (nm)',
      limit,
      bracket,
    });
  },

  handles: [levelHandle('ni', 'main'), levelHandle('nf', 'main'), levelHandle('ni', 'zoom'), levelHandle('nf', 'zoom')],

  readouts: [
    { label: '\\lambda', unit: 'nm', sig: 4, value: (_s, p) => (p.ni === p.nf ? NaN : lambdaVac(p.ni, p.nf)) },
    { label: '\\Delta E', unit: 'eV', sig: 4, value: (_s, p) => photonEnergy(p.ni, p.nf) },
  ],

  formula: (_s, p) => {
    const { ni, nf } = p;
    const lo = Math.min(ni, nf);
    const hi = Math.max(ni, nf);
    const lines = [`E_n = -\\frac{13.60\\ \\text{eV}}{n^2}:\\quad E_{${ni}} = ${texNum(energy(ni), 4)}\\ \\text{eV},\\quad E_{${nf}} = ${texNum(energy(nf), 4)}\\ \\text{eV}`];
    if (ni === nf) return [...lines, 'n_i = n_f:\\ \\Delta E = 0'];
    const dE = photonEnergy(ni, nf);
    const k = 1 / (lo * lo) - 1 / (hi * hi);
    return [
      ...lines,
      `\\Delta E = E_{${hi}} - E_{${lo}} = 13.60\\left(\\frac{1}{${lo}^2} - \\frac{1}{${hi}^2}\\right)\\ \\text{eV} = ${texNum(dE, 5)}\\ \\text{eV}`,
      `\\lambda = \\frac{hc}{\\Delta E} = \\frac{1239.8\\ \\text{eV}\\cdot\\text{nm}}{${texNum(dE, 5)}\\ \\text{eV}} = ${fmtLambda(HC_EVNM / dE)}`,
      `\\frac{1}{\\lambda} = R_\\text{H}\\left(\\frac{1}{${lo}^2} - \\frac{1}{${hi}^2}\\right) = ${texNum(R_H * k, 5)}\\ \\text{m}^{-1}`,
    ];
  },

  info: {
    goals: ['hyd.t.goal.levels', 'hyd.t.goal.photon'],
    observe: ['hyd.t.obs.crowd', 'hyd.t.obs.balmer', 'hyd.t.obs.lyman', 'hyd.t.obs.abs', 'hyd.t.obs.bohr'],
    equations: [
      'E_n = -\\frac{m e^4}{8\\varepsilon_0^2 h^2}\\frac{1}{n^2} = -\\frac{13.6\\ \\text{eV}}{n^2}',
      'hf = \\Delta E = E_\\text{high} - E_\\text{low}, \\quad \\lambda = \\frac{hc}{\\Delta E}',
      '\\frac{1}{\\lambda} = R\\left(\\frac{1}{n_\\text{low}^2} - \\frac{1}{n_\\text{high}^2}\\right)',
      'r_n = n^2 a_0, \\quad a_0 = 52.9\\ \\text{pm}',
    ],
    assumptions: ['hyd.assume.axis', 'hyd.assume.pick', 'hyd.assume.vacuum', 'hyd.assume.reduced', 'hyd.assume.log', 'hyd.assume.vis', 'hyd.assume.bohr'],
  },
};

// ------------------------------------------------------------------ tab 2: series

type PS = { series: string; mode: string };
interface SS {
  t: number;
  n: number;
  lay?: Lay;
}

/** Lines per series in the animation and seconds per line. */
export const SERIES_COUNT = 12;
export const SERIES_DT = 0.7;
const H_STEP = 0.02;

/** Index of the line being produced at time t (0 … SERIES_COUNT − 1). */
export const seriesIndex = (tt: number) => Math.min(SERIES_COUNT - 1, Math.max(0, Math.floor(tt / SERIES_DT + 1e-9)));

/** Arrow positions across the panel: one column per line, left to right. */
const seriesFx = (k: number) => 0.1 + (0.8 * k) / (SERIES_COUNT - 1);

const seriesParams: ParamSchema<PS> = {
  series: { kind: 'select', label: 'hyd.p.series', desc: 'hyd.d.series2', group: 'main', live: false, default: 'balmer', options: seriesOptions(false) },
  mode: {
    kind: 'select',
    label: 'hyd.p.mode',
    desc: 'hyd.d.mode',
    group: 'main',
    live: false,
    default: 'emission',
    options: [
      { value: 'emission', label: 'hyd.mode.emission' },
      { value: 'absorption', label: 'hyd.mode.absorption' },
    ],
  },
};

export const series: Scene<PS, SS> = {
  id: 'series',
  title: 'hyd.scene.series',
  params: seriesParams,
  world: PX_WORLD,
  time: { h: H_STEP, recordEvery: 5, frameStep: SERIES_DT, tEnd: SERIES_COUNT * SERIES_DT, unit: '' },
  init: () => ({ t: 0, n: 0 }),
  step: (s) => {
    s.n += 1;
    s.t = s.n * H_STEP;
  },
  snapshot: (s) => ({ t: s.t, n: s.n }),

  draw: (g, s, p, ui) => {
    const id = p.series as SeriesId;
    const nl = SERIES[id];
    const emis = p.mode === 'emission';
    const lay = layout(g, { bohr: false, bracket: true });
    s.lay = lay;
    const tt = ui?.tFrame ?? s.t;
    const k = seriesIndex(tt);
    const grow = Math.min(1, (tt - k * SERIES_DT) / (0.2 * SERIES_DT));
    const nu = nl + 1 + k;
    drawDiagram(g, lay, [nl, nu], [nl]);
    const [ni, nf] = emis ? [nu, nl] : [nl, nu];
    const lam = lambdaVac(nu, nl);
    for (const f of [lay.main, lay.zoom]) {
      for (let j = 0; j < k; j++) {
        const u = nl + 1 + j;
        transitionArrow(f, seriesFx(j), emis ? u : nl, emis ? nl : u, { color: LEVEL, width: 1.5, alpha: 0.35 });
      }
      transitionArrow(f, seriesFx(k), ni, nf, { grow: tt <= 0 ? 1 : Math.max(0.05, grow) });
    }
    // Photon of the current line where its arrow is longest, on the side with more room.
    if (grow >= 1 || tt <= 0) {
      const spans = [lay.main, lay.zoom].map((f) => {
        const x = f.box.l + seriesFx(k) * (f.box.r - f.box.l);
        const ya = Math.max(Math.min(f.Y(energy(ni)), f.Y(energy(nf))), f.box.t);
        const yb = Math.min(Math.max(f.Y(energy(ni)), f.Y(energy(nf))), f.box.b);
        return { f, x, ya, yb };
      });
      const best = spans.reduce((a, b) => (b.yb - b.ya > a.yb - a.ya ? b : a));
      const row = photonRow(best.ya, best.yb, levelYs(best.f));
      const ym = row.y;
      const mark = row.gap >= MARK_ROOM ? regionMark(lam) : undefined;
      const roomR = best.f.box.r - 4 - (best.x + 7);
      const roomL = best.x - 7 - (best.f.box.l + 4);
      const right = roomR >= Math.min(60, roomL);
      const x0 = right ? best.x + 7 : best.x - 7;
      const x1 = right ? Math.min(best.f.box.r - 4, x0 + 80) : Math.max(best.f.box.l + 4, x0 - 80);
      if (emis) drawPhoton(g, x0, ym, x1, ym, lam, mark);
      else drawPhoton(g, x1, ym, x0, ym, lam, mark);
    }

    const lines: SpecLine[] = seriesLines(id, k + 1).map((l, j) => ({ lambda: l, current: j === k }));
    const limit = seriesLimit(nl);
    drawSpectrum(g, lay.spec, {
      range: SPEC_RANGE,
      mode: emis ? 'emission' : 'absorption',
      lines,
      names: { uv: t('hyd.region.uv'), ir: t('hyd.region.ir') },
      xLabel: '*λ* (nm)',
      limit,
      bracket: { from: limit, to: lambdaVac(nl + 1, nl), text: t(`hyd.series.${id}`) },
    });
  },

  readouts: [
    { label: 'n', unit: '', sig: 1, value: (s, p) => SERIES[p.series as SeriesId] + 1 + seriesIndex(s.t) },
    { label: '\\lambda', unit: 'nm', sig: 4, value: (s, p) => lambdaVac(SERIES[p.series as SeriesId] + 1 + seriesIndex(s.t), SERIES[p.series as SeriesId]) },
    { label: '\\lambda_\\infty', unit: 'nm', sig: 4, value: (_s, p) => seriesLimit(SERIES[p.series as SeriesId]) },
  ],

  formula: (s, p) => {
    const nl = SERIES[p.series as SeriesId];
    const nu = nl + 1 + seriesIndex(s.t);
    const k = 1 / (nl * nl) - 1 / (nu * nu);
    return [
      `\\frac{1}{\\lambda} = R_\\text{H}\\left(\\frac{1}{${nl}^2} - \\frac{1}{n^2}\\right),\\quad n = ${nl + 1}, ${nl + 2}, ${nl + 3}, \\dots`,
      `n = ${nu}:\\quad \\frac{1}{\\lambda} = (${texNum(R_H, 5)}\\ \\text{m}^{-1})(${texNum(k, 5)}),\\quad \\lambda = ${fmtLambda(lambdaVac(nu, nl))}`,
      `\\lambda_\\infty = \\frac{${nl}^2}{R_\\text{H}} = ${fmtLambda(seriesLimit(nl))}`,
    ];
  },

  info: {
    goals: ['hyd.s.goal.series', 'hyd.s.goal.limit'],
    observe: ['hyd.s.obs.converge', 'hyd.s.obs.regions', 'hyd.s.obs.abs'],
    equations: ['\\frac{1}{\\lambda} = R\\left(\\frac{1}{n_\\text{low}^2} - \\frac{1}{n^2}\\right), \\quad n = n_\\text{low} + 1, n_\\text{low} + 2, \\dots', '\\lambda_\\infty = \\frac{n_\\text{low}^2}{R}'],
    assumptions: ['hyd.assume.axis', 'hyd.assume.vacuum', 'hyd.assume.reduced', 'hyd.assume.log', 'hyd.s.assume.count'],
  },
};
