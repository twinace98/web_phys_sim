// Review page 103 (→ Ch 39): an electron in an infinite well; pick two levels for the photon.
// Left: the well with ψ_n or |ψ_n|² drawn on each level (Ch 39 style). Middle: the level ladder
// with the transition arrow and the photon. Bottom: the spectrum strip (log λ) with the lines
// picked so far at the current width (all shift together as L changes, λ ∝ L²).
import { fmt, fmtTick, niceTicks } from '../../../core/format';
import { t } from '../../../core/i18n';
import type { Handle, ParamSchema, Scene } from '../../../core/types';
import type { Draw } from '../../../draw/draw';
import { ROLE_COLOR } from '../../../draw/theme';
import { tn } from '../../../core/tex';
import { fitSig, printed } from '../../ch31/fit';
import { texNum } from '../../field/render';
import { Frame, PX_WORLD, TICK, W, linePx, textPx } from '../../modern/frame';
import { HC_EVNM } from '../hydrogen/physics';
import { MARK_ROOM, drawPhoton, drawSpectrum, photonRow, region, spectrumHeight, type SpecLine } from '../hydrogen/spectrum';
import { KNOB_HIT, OFF, clearLines, drawKnob, hasEarlierLines, knobArrow, knobDx, type StageBtn } from '../hydrogen/stage';
import { level, lambda, photonEnergy, psi } from './physics';

/** Levels shown and reachable by the controls. */
export const N_LEVELS = 5;
/** Top of the energy axis in units of E_1: room for ψ above the highest level. */
export const TOP = 27.5;
/** λ axis of the spectrum strip [nm]: soft X-ray to mid IR. */
export const SPEC_RANGE: [number, number] = [5, 5000];

const PSI = ROLE_COLOR.position;
const WALL = ROLE_COLOR.energyU;
const LEVEL = '#1a1a1a';

type P = { L: number; show: string; ni: number; nf: number };
interface S {
  t: number;
  /** Pairs picked so far: "lo-hi" → [lo, hi]. */
  seen: Map<string, [number, number]>;
  lay?: Lay;
  /** Clear button of the spectrum strip in the last frame (null: not shown). */
  btn?: StageBtn | null;
}

interface Lay {
  narrow: boolean;
  well: Frame;
  ladder: Frame;
  spec: { l: number; r: number; t: number };
}

function layout(g: Draw, L: number): Lay {
  const Wd = g.vp.w;
  const H = g.vp.h;
  const narrow = Wd < 640;
  const t0 = 26;
  const b = H - spectrumHeight(narrow, false) - (narrow ? 34 : 40);
  const gutL = narrow ? 40 : 58;
  const labW = narrow ? 62 : 128;
  const gap = narrow ? 14 : 36;
  const avail = Wd - gutL - gap - labW - 10;
  const wr = gutL + avail * (narrow ? 0.62 : 0.6);
  const yr: [number, number] = [0, TOP * level(1, L)];
  const xr: [number, number] = [-0.62 * L, 0.62 * L];
  return {
    narrow,
    well: new Frame(g, { l: gutL, r: wr, t: t0, b }, xr, yr),
    ladder: new Frame(g, { l: wr + gap, r: Wd - labW - 10, t: t0, b }, [0, 1], yr),
    spec: { l: gutL, r: Wd - 14, t: b + (narrow ? 34 : 40) },
  };
}

/** The well: shaded walls (U = ∞), levels and ψ_n or |ψ_n|² on each, selected states in front. */
function drawWell(f: Frame, p: P): void {
  const g = f.g;
  const { L } = p;
  const [x0, x1] = f.xr;
  const top = f.yr[1];
  const E1 = level(1, L);
  // Same height for every state, below the smallest spacing (3 E_1), as in Ch 39.
  const A = 0.42 * 3 * E1;
  const prob = p.show === 'prob';
  f.clip(() => {
    for (const [a, b] of [
      [x0, -L / 2],
      [L / 2, x1],
    ])
      f.polygon(
        [
          [a, 0],
          [b, 0],
          [b, top],
          [a, top],
        ],
        { fill: WALL, fillAlpha: 0.1 },
      );
    f.line(-L / 2, 0, -L / 2, top, { color: WALL, width: 3 });
    f.line(L / 2, 0, L / 2, top, { color: WALL, width: 3 });
    f.line(-L / 2, 0, L / 2, 0, { color: WALL, width: 2.25 });
    const order = Array.from({ length: N_LEVELS }, (_, k) => k + 1).sort((a, b) => Number(a === p.ni || a === p.nf) - Number(b === p.ni || b === p.nf));
    for (const n of order) {
      const E = level(n, L);
      const sel = n === p.ni || n === p.nf;
      f.line(-L / 2, E, L / 2, E, { color: LEVEL, width: sel ? 2 : 1, alpha: sel ? 1 : 0.6 });
      const pts: [number, number][] = [];
      const M = 160;
      const amax = Math.sqrt(2 / L);
      for (let i = 0; i <= M; i++) {
        const x = -L / 2 + (L * i) / M;
        const u = psi(n, x, L) / amax;
        pts.push([x, E + (prob ? 1.6 * A * u * u : A * u)]);
      }
      const st = { color: PSI, width: sel ? 2 : 1.25, alpha: sel ? 1 : 0.4 };
      if (prob) f.polygon([[-L / 2, E], ...pts, [L / 2, E]], { fill: PSI, fillAlpha: sel ? 0.22 : 0.08 });
      f.polyline(pts, st);
    }
  });
  const yt = niceTicks(0, top, 4);
  f.axes({ xTicks: [-L / 2, L / 2], xFmt: (v) => fmtTick(Number(v.toPrecision(3))), yTicks: yt });
  textPx(g, (f.box.l + f.box.r) / 2, f.box.b + 15, '*x* (nm)', { size: 12, color: TICK, align: 'center' });
  textPx(g, f.box.l - 7, f.box.t - 12, '*E* (eV)', { size: 12, color: TICK, align: 'left', baseline: 'middle' });
}

const FX = 0.32;

/** Level ladder: short level lines, labels, the arrow between the draggable knobs and the photon. */
function drawLadder(f: Frame, lay: Lay, p: P, dragged?: 'ni' | 'nf'): void {
  const g = f.g;
  const { L, ni, nf } = p;
  const same = ni === nf;
  for (let n = 1; n <= N_LEVELS; n++) {
    const y = f.Y(level(n, L));
    const sel = n === ni || n === nf;
    linePx(g, f.box.l, y, f.box.r, y, { color: LEVEL, width: sel ? 2.25 : 1.25 });
    const E = level(n, L);
    const s = lay.narrow ? `${fmt(E, 3)} eV` : `*E*_{${n}} = ${fmt(E, 3)} eV`;
    textPx(g, f.box.r + 6, y, s, { size: 12, color: LEVEL, baseline: 'middle', weight: sel ? 700 : 400 });
    if (lay.narrow) textPx(g, f.box.l - 4, y, String(n), { size: 11, color: TICK, align: 'right', baseline: 'middle' });
  }
  if (lay.narrow) textPx(g, f.box.l - 4, f.box.t - 12, '*n*', { size: 12, color: TICK, align: 'right', baseline: 'middle' });
  const x = f.box.l + FX * (f.box.r - f.box.l);
  const yi = f.Y(level(ni, L));
  const yf = f.Y(level(nf, L));
  if (!same) {
    knobArrow(g, x, yi, yf, { color: LEVEL, width: 2 });
    const lam = lambda(ni, nf, L);
    const row = photonRow(yi, yf, Array.from({ length: N_LEVELS }, (_, k) => f.Y(level(k + 1, L))));
    const ym = row.y;
    const xa = x + 7;
    const xb = f.box.r - 4;
    const r = region(lam);
    const mark = r === 'vis' || row.gap < MARK_ROOM ? undefined : t(`hyd.region.${r}`);
    if (ni > nf) drawPhoton(g, xa, ym, xb, ym, lam, mark);
    else drawPhoton(g, xb, ym, xa, ym, lam, mark);
    drawKnob(g, x + knobDx(yi, yf), yf, dragged === 'nf');
  }
  drawKnob(g, x + knobDx(yi, yf), yi, dragged === 'ni');
}

/** Nearest level 1…N_LEVELS to an energy. */
export function nearestLevel(E: number, L: number): number {
  let best = 1;
  for (let n = 2; n <= N_LEVELS; n++) if (Math.abs(level(n, L) - E) < Math.abs(level(best, L) - E)) best = n;
  return best;
}

function levelHandle(which: 'ni' | 'nf'): Handle<S, P> {
  return {
    pos: (s, p) => {
      const f = s.lay?.ladder;
      if (!f) return { x: NaN, y: NaN };
      const dx = knobDx(f.Y(level(p.ni, p.L)), f.Y(level(p.nf, p.L)));
      return W(f.g, f.box.l + FX * (f.box.r - f.box.l) + dx, f.Y(level(p[which], p.L)));
    },
    radiusPx: KNOB_HIT,
    onDrag: (ctx, s, w) => {
      const f = s.lay?.ladder;
      if (!f) return;
      const [, py] = f.g.vp.toPx(w.x, w.y);
      const n = nearestLevel(f.yAt(py), ctx.params.L);
      const other = which === 'ni' ? 'nf' : 'ni';
      if (n !== ctx.params[which] && n !== ctx.params[other]) ctx.set(which, n);
    },
    onDoubleTap: (ctx) => {
      const { ni, nf } = ctx.params;
      if (ni === nf) return;
      ctx.set('ni', nf);
      ctx.set('nf', ni);
    },
  };
}

const nParam = (key: 'ni' | 'nf', def: number) => ({
  kind: 'number' as const,
  label: `wj.p.${key}`,
  desc: `wj.d.${key}`,
  group: 'advanced' as const,
  live: true,
  control: 'stepper' as const,
  min: 1,
  max: N_LEVELS,
  step: 1,
  default: def,
});

const params: ParamSchema<P> = {
  L: { kind: 'number', label: 'wj.p.L', desc: 'wj.d.L', group: 'main', live: true, control: 'slider', log: true, sig: 2, min: 0.2, max: 2, default: 1, unit: 'nm' },
  show: {
    kind: 'select',
    label: 'wj.p.show',
    desc: 'wj.d.show',
    group: 'main',
    live: true,
    default: 'psi',
    options: [
      { value: 'psi', label: 'wj.show.psi' },
      { value: 'prob', label: 'wj.show.prob' },
    ],
  },
  ni: nParam('ni', 3),
  nf: nParam('nf', 2),
};

/** Printed hc [eV·nm] and mₑc² [keV]: the short pair first, more digits where E_1 needs them. */
const CONSTS: [string, string][] = [
  ['1239.84', '511.0'],
  ['1239.842', '510.999'],
  ['1239.84198', '510.99895'],
];

const fmtLambda = (nm: number, sig = 4) => (nm >= 1e4 ? `${texNum(nm / 1000, sig)}\\ \\mu\\text{m}` : `${texNum(nm, sig)}\\ \\text{nm}`);

export const welljump: Scene<P, S> = {
  id: 'welljump',
  title: 'wj.scene',
  params,
  world: PX_WORLD,
  init: () => ({ t: 0, seen: new Map() }),

  draw: (g, s, p, ui) => {
    const lay = layout(g, p.L);
    s.lay = lay;
    const { ni, nf, L } = p;
    const same = ni === nf;
    if (!same) s.seen.set(`${Math.min(ni, nf)}-${Math.max(ni, nf)}`, [Math.min(ni, nf), Math.max(ni, nf)]);
    drawWell(lay.well, p);
    drawLadder(lay.ladder, lay, p, ui?.drag ? (['ni', 'nf'] as const)[ui.drag.i] : undefined);
    const lines: SpecLine[] = [...s.seen.values()].map(([lo, hi]) => ({ lambda: lambda(hi, lo, L), current: !same && lo === Math.min(ni, nf) && hi === Math.max(ni, nf) }));
    s.btn = drawSpectrum(g, lay.spec, {
      range: SPEC_RANGE,
      mode: !same && ni < nf ? 'absorption' : 'emission',
      lines,
      names: { xray: t('hyd.region.xray'), uv: t('hyd.region.uv'), ir: t('hyd.region.ir') },
      xLabel: '*λ* (nm)',
      clear: { label: t('wj.clear'), show: hasEarlierLines(s, p) },
    });
  },

  handles: [
    levelHandle('ni'),
    levelHandle('nf'),
    // Clear button of the spectrum strip: a single tap or click; dragging does nothing.
    { pos: (s) => s.btn?.c ?? OFF, radiusPx: 20, onDrag: () => {}, onTap: (ctx, s) => clearLines(s, ctx.params) },
  ],

  readouts: [
    { label: 'E_1', unit: 'eV', sig: 3, value: (_s, p) => level(1, p.L) },
    { label: '\\Delta E', unit: 'eV', sig: 3, value: (_s, p) => photonEnergy(p.ni, p.nf, p.L) },
    { label: '\\lambda', unit: 'nm', sig: 3, value: (_s, p) => (p.ni === p.nf ? NaN : lambda(p.ni, p.nf, p.L)) },
  ],

  formula: (_s, p) => {
    const { ni, nf, L } = p;
    const E1 = level(1, L);
    const same = ni === nf;
    const hi = Math.max(ni, nf);
    const lo = Math.min(ni, nf);
    const dE = photonEnergy(ni, nf, L);
    const lam = HC_EVNM / dE;
    // Figures so that each line's arithmetic reproduces its printed result: ΔE for λ, then E_1 for
    // ΔE and E_n, then the constants for E_1. The short constants and λ at 4 figures first; a λ
    // close to a rounding tie (175.85005 nm) gets a fifth figure rather than a 9-figure E_1.
    let plan = { hcS: CONSTS[0][0], mcS: CONSTS[0][1], sL: 4, sD: 4, sE: 4 };
    search: for (const sL of [4, 5]) {
      for (const [hcS, mcS] of CONSTS) {
        const hc = Number(hcS);
        const mc2 = Number(mcS) * 1000;
        // ΔE: from the fewest figures that give λ up to 7 (a ΔE such as 1.88015 that E_1 hits
        // exactly is easier to reproduce than 1.8802).
        const lamS = tn(lam, sL);
        for (let sD = same ? 7 : fitSig((r) => tn(hc / r(dE), sL), lamS, 4, 8); sD <= 7; sD++) {
          if (!same && tn(hc / printed(dE, sD), sL) !== lamS) continue;
          const want = [tn(level(ni, L), 4), tn(level(nf, L), 4), same ? '' : tn(dE, sD)].join();
          const sE = fitSig((r) => [tn(ni * ni * r(E1), 4), tn(nf * nf * r(E1), 4), same ? '' : tn((hi * hi - lo * lo) * r(E1), sD)].join(), want, 4, 8);
          plan = { hcS, mcS, sL, sD: same ? 4 : sD, sE };
          if (sE < 7 && tn((hc * hc) / (8 * mc2 * L * L), sE) === tn(E1, sE)) break search;
        }
      }
    }
    const { hcS, mcS, sL, sD, sE } = plan;
    const lines = [
      `E_1 = \\frac{h^2}{8mL^2} = \\frac{(hc)^2}{8\\,mc^2L^2} = \\frac{(${hcS}\\ \\text{eV}\\cdot\\text{nm})^2}{8\\,(${mcS}\\ \\text{keV})\\,(${texNum(L, 3)}\\ \\text{nm})^2} = ${tn(E1, sE)}\\ \\text{eV}`,
      `E_n = n^2E_1:\\quad E_{${ni}} = ${texNum(level(ni, L), 4)}\\ \\text{eV},\\quad E_{${nf}} = ${texNum(level(nf, L), 4)}\\ \\text{eV}`,
    ];
    if (same) return [...lines, 'n_i = n_f:\\ \\Delta E = 0'];
    return [
      ...lines,
      `\\Delta E = E_{${hi}} - E_{${lo}} = (${hi}^2 - ${lo}^2)(${tn(E1, sE)}\\ \\text{eV}) = ${tn(dE, sD)}\\ \\text{eV}`,
      `\\lambda = \\frac{hc}{\\Delta E} = \\frac{${hcS}\\ \\text{eV}\\cdot\\text{nm}}{${tn(dE, sD)}\\ \\text{eV}} = ${fmtLambda(lam, sL)}`,
    ];
  },

  info: {
    goals: ['wj.goal.photon', 'wj.goal.width'],
    observe: ['wj.obs.n2', 'wj.obs.L2', 'wj.obs.region', 'wj.obs.abs', 'wj.obs.nodes'],
    equations: ['E_n = \\frac{h^2}{8mL^2}\\,n^2, \\quad n = 1, 2, 3, \\dots', 'hf = \\Delta E = E_\\text{high} - E_\\text{low}, \\quad \\lambda = \\frac{hc}{\\Delta E}', '\\lambda \\propto L^2'],
    assumptions: ['wj.assume.electron', 'wj.assume.scale', 'wj.assume.pick', 'wj.assume.amp', 'wj.assume.dipole', 'wj.assume.log'],
  },
};
