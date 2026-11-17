// Photon drawing shared by the review pages hydrogen (102) and welljump (103): spectral region,
// line colour, a log-λ spectrum strip and a wavy photon. Pixel-space (PX_WORLD) helpers.
import type { Draw } from '../../../draw/draw';
import { arrowPx } from '../../../draw/draw';
import { measureRich } from '../../../draw/text';
import { theme } from '../../../draw/theme';
import { Frame, TICK, W, linePx, textPx } from '../../modern/frame';
import { wavelengthRGB } from '../../wave2d/field';

export type Region = 'xray' | 'uv' | 'vis' | 'ir';

/** Visible band [nm] (conventional limits; Halliday quotes roughly 400–700 nm). */
export const VIS: [number, number] = [380, 750];
/** Below this [nm]: X-rays. */
export const XRAY_MAX = 10;

export function region(nm: number): Region {
  if (nm < XRAY_MAX) return 'xray';
  if (nm < VIS[0]) return 'uv';
  if (nm <= VIS[1]) return 'vis';
  return 'ir';
}

/** Neutral colour of a photon outside the visible band. */
export const NEUTRAL = '#6b6b6b';

const css = ([r, g, b]: [number, number, number]) => `rgb(${r}, ${g}, ${b})`;

/** Photon / line colour on white: the spectral colour in the visible band, neutral grey outside. */
export const photonColor = (nm: number): string => (region(nm) === 'vis' ? css(wavelengthRGB(nm)) : NEUTRAL);

/** Spectral colour lifted for a dark background (wavelengthRGB is darkened for white). */
function bright(nm: number, k = 1 / 0.82): string {
  const [r, g, b] = wavelengthRGB(nm);
  return css([Math.min(255, Math.round(r * k)), Math.min(255, Math.round(g * k)), Math.min(255, Math.round(b * k))]);
}

export interface SpecLine {
  lambda: number;
  /** The current transition: thicker, with a pointer under the strip. */
  current?: boolean;
  /** A line of the highlighted series not yet produced: thin and faint. */
  ghost?: boolean;
}

export interface SpectrumOpts {
  /** λ range of the log axis [nm]. */
  range: [number, number];
  /** emission: bright lines on a dark strip; absorption: dark lines on a continuum. */
  mode: 'emission' | 'absorption';
  lines: SpecLine[];
  /** Short region names (i18n'd): X-ray, UV, IR. */
  names: { xray?: string; uv: string; ir: string };
  xLabel: string;
  /** Series limit [nm]: dashed line. */
  limit?: number;
  /** Bracket under the strip from `from` to `to` [nm] with a name (the highlighted series). */
  bracket?: { from: number; to: number; text: string };
}

const STRIP = (narrow: boolean) => (narrow ? 26 : 34);
const ROW = 16;

/** Height [px] of the spectrum block for the options. */
export const spectrumHeight = (narrow: boolean, bracket: boolean) => ROW + STRIP(narrow) + 26 + (bracket ? 22 : 0);

/** Candidate tick values 1, 2, 5 × 10ⁿ inside the range, decades first. */
function tickValues(r: [number, number]): number[] {
  const out: number[] = [];
  for (const m of [1, 2, 5])
    for (let e = Math.floor(Math.log10(r[0])); e <= Math.ceil(Math.log10(r[1])); e++) {
      const v = m * 10 ** e;
      if (v >= r[0] && v <= r[1]) out.push(v);
    }
  return out;
}

/**
 * Spectrum strip with a logarithmic λ axis, box spanning l…r with its top at t. Lines outside
 * the range are drawn as a small triangle at the strip end.
 */
export function drawSpectrum(g: Draw, box: { l: number; r: number; t: number }, o: SpectrumOpts): void {
  const narrow = g.vp.w < 640;
  const sh = STRIP(narrow);
  const y0 = box.t + ROW;
  const y1 = y0 + sh;
  const f = new Frame(g, { l: box.l, r: box.r, t: y0, b: y1 }, o.range, [0, 1], { x: true });
  const { ctx } = g;
  const X = (nm: number) => f.X(Math.min(Math.max(nm, o.range[0]), o.range[1]));
  const emis = o.mode === 'emission';

  // Region row: names of the invisible regions, a thin colour bar over the visible band.
  ctx.save();
  for (let px = Math.ceil(X(VIS[0])); px < X(VIS[1]); px++) {
    ctx.fillStyle = css(wavelengthRGB(f.xAt(px + 0.5)));
    ctx.fillRect(px, box.t + 6, 1, 5);
  }
  ctx.restore();
  const name = (s: string | undefined, a: number, b: number) => {
    if (!s) return;
    const xa = X(Math.max(a, o.range[0]));
    const xb = X(Math.min(b, o.range[1]));
    if (xb - xa < measureRich(ctx, s, { size: 11 }) + 6) return;
    textPx(g, (xa + xb) / 2, box.t + 8.5, s, { size: 11, color: TICK, align: 'center', baseline: 'middle' });
  };
  if (o.names.xray) name(o.names.xray, o.range[0], XRAY_MAX);
  name(o.names.uv, o.names.xray ? XRAY_MAX : o.range[0], VIS[0]);
  name(o.names.ir, VIS[1], o.range[1]);

  // Strip background.
  ctx.save();
  if (emis) {
    ctx.fillStyle = '#1d1d1d';
    ctx.fillRect(box.l, y0, box.r - box.l, sh);
  } else {
    for (let px = Math.floor(box.l); px < box.r; px++) {
      const nm = f.xAt(px + 0.5);
      ctx.fillStyle = region(nm) === 'vis' ? bright(nm, 1.1) : '#e2e2e2';
      ctx.fillRect(px, y0, 1, sh);
    }
  }
  ctx.restore();

  // Lines: ghosts first, then produced lines, the current one last.
  const order = [...o.lines].sort((a, b) => Number(!!b.ghost) - Number(!!a.ghost) || Number(!!a.current) - Number(!!b.current));
  for (const ln of order) {
    const vis = region(ln.lambda) === 'vis';
    const col = emis ? (vis ? bright(ln.lambda) : '#cfcfcf') : '#111111';
    const off = ln.lambda < o.range[0] ? -1 : ln.lambda > o.range[1] ? 1 : 0;
    if (off) {
      // Off the axis: triangle at the strip end pointing outwards.
      const x = off > 0 ? box.r - 3 : box.l + 3;
      const ym = (y0 + y1) / 2;
      g.polygon([W(g, x, ym), W(g, x - 7 * off, ym - 6), W(g, x - 7 * off, ym + 6)], { fill: col, fillAlpha: ln.ghost ? 0.4 : 1 });
      continue;
    }
    const x = X(ln.lambda);
    const width = ln.ghost ? 1 : ln.current ? 3.5 : 2;
    linePx(g, x, y0 + 1, x, y1 - 1, { color: col, width, alpha: ln.ghost ? 0.45 : 1, dash: vis || ln.ghost ? undefined : [3, 2] });
  }
  if (o.limit !== undefined && o.limit >= o.range[0] && o.limit <= o.range[1]) {
    const x = X(o.limit);
    linePx(g, x, y0 - 3, x, y1 + 3, { color: emis ? '#8c8c8c' : '#333333', width: 1.25, dash: [2, 3] });
  }
  // Frame around the strip.
  linePx(g, box.l, y0, box.r, y0, { color: TICK, width: 1 });
  linePx(g, box.l, y1, box.r, y1, { color: TICK, width: 1 });
  linePx(g, box.l, y0, box.l, y1, { color: TICK, width: 1 });
  linePx(g, box.r, y0, box.r, y1, { color: TICK, width: 1 });

  // Pointer under the current line.
  const cur = o.lines.find((l) => l.current);
  if (cur && Number.isFinite(cur.lambda)) {
    const x = cur.lambda > o.range[1] ? box.r - 3 : cur.lambda < o.range[0] ? box.l + 3 : X(cur.lambda);
    g.polygon([W(g, x, y1 + 2), W(g, x - 5, y1 + 9), W(g, x + 5, y1 + 9)], { fill: photonColor(cur.lambda) });
  }

  // Tick labels: decades first, then 2 and 5 where they fit; the axis name at the right end.
  const ty = y1 + 20;
  const xl = measureRich(ctx, o.xLabel, { size: 12 });
  textPx(g, box.r, ty, o.xLabel, { size: 12, color: TICK, align: 'right' });
  const taken: [number, number][] = [[box.r - xl - 6, box.r + 1]];
  for (const v of tickValues(o.range)) {
    const x = X(v);
    const s = String(v);
    const w = measureRich(ctx, s, { size: 11 }) / 2 + 4;
    if (taken.some(([a, b]) => x + w > a && x - w < b)) continue;
    taken.push([x - w, x + w]);
    linePx(g, x, y1, x, y1 + 4, { color: TICK, width: 1 });
    textPx(g, x, ty, s, { size: 11, color: TICK, align: 'center' });
  }

  if (o.bracket) {
    const a = X(Math.min(o.bracket.from, o.bracket.to));
    const b = X(Math.max(o.bracket.from, o.bracket.to));
    const by = ty + 10;
    linePx(g, a, by - 4, a, by, { color: '#1a1a1a', width: 1 });
    linePx(g, b, by - 4, b, by, { color: '#1a1a1a', width: 1 });
    linePx(g, a, by, b, by, { color: '#1a1a1a', width: 1 });
    const tw = measureRich(ctx, o.bracket.text, { size: 12 });
    const cx = Math.min(Math.max((a + b) / 2, box.l + tw / 2), box.r - tw / 2);
    textPx(g, cx, by + 13, o.bracket.text, { size: 12, color: '#1a1a1a', align: 'center' });
  }
}

/**
 * Wavy photon from (xa, ya) to (xb, yb) with an arrowhead at the end, coloured by λ. The wiggle
 * period grows with λ (log scale), so a bluer photon wiggles faster. Outside the visible band:
 * neutral grey and a short region mark beside the tip.
 */
export function drawPhoton(g: Draw, xa: number, ya: number, xb: number, yb: number, lambda: number, mark?: string): void {
  const col = photonColor(lambda);
  const len = Math.hypot(xb - xa, yb - ya);
  if (len < 14) return;
  const ux = (xb - xa) / len;
  const uy = (yb - ya) / len;
  const head = 9 * theme.scale;
  const lw = Math.log10(Math.min(Math.max(lambda, 5), 5000));
  const period = 4 + (6 * (lw - Math.log10(5))) / 3; // 4 px (5 nm) … 10 px (5 µm)
  const amp = 4;
  const body = len - head - 2;
  const pts = [];
  const N = Math.max(8, Math.ceil(body));
  for (let i = 0; i <= N; i++) {
    const s = (body * i) / N;
    const d = amp * Math.min(1, s / 6, (body - s) / 6) * Math.sin((2 * Math.PI * s) / period);
    pts.push(W(g, xa + ux * s - uy * d, ya + uy * s + ux * d));
  }
  g.polyline(pts, { color: col, width: 1.75 });
  arrowPx(g.ctx, xa + ux * body, ya + uy * body, xb, yb, { color: col, width: 1.75 });
  if (mark) textPx(g, xb - ux * 2, Math.min(ya, yb) - 10, mark, { size: 11, color: NEUTRAL, align: ux >= 0 ? 'right' : 'left' });
}

/**
 * Height for a horizontal photon beside a transition arrow from ya to yb [px]: the middle of the
 * largest gap between the level lines (ys) the arrow crosses, so the wave never lies on a level.
 * Returns that height and the gap.
 */
export function photonRow(ya: number, yb: number, ys: number[]): { y: number; gap: number } {
  const lo = Math.min(ya, yb);
  const hi = Math.max(ya, yb);
  const pts = [lo, hi, ...ys.filter((y) => y > lo && y < hi)].sort((a, b) => a - b);
  let best = { y: (lo + hi) / 2, gap: 0 };
  for (let i = 1; i < pts.length; i++) if (pts[i] - pts[i - 1] > best.gap) best = { y: (pts[i] + pts[i - 1]) / 2, gap: pts[i] - pts[i - 1] };
  return best;
}

/** Room above a photon for its region mark [px]. */
export const MARK_ROOM = 30;
