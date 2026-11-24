// Narrow (portrait) layout of the slit scenes (Ch 35, Ch 36 tab 1). The shared layout of
// wave2d/slits puts the intensity graph right of the screen: on a phone the stage then fills
// about 45 % of its height and the graph is about 50 px wide (QA 2026-11-20). Here the graph sits
// under the wave field instead, as wide as the field and as tall as the screen, at the same scale.
import type { Draw } from '../../draw/draw';
import { Inset } from '../inset/inset';
import type { WaveField } from '../wave2d/field';
import { STRIP, XL, Y0, Y1, drawScreen, worldOf } from '../wave2d/slits';
import { css } from '../wave2d/view';

/** Narrow (portrait) stage: the media query of the shell's bottom-sheet layout. */
export const narrowStage = () => typeof window !== 'undefined' && window.matchMedia('(max-width: 767px)').matches;

/** Gap from the field's lower edge to the graph [μm]: the D dimension line and the graph's y label. */
const DROP = 5.8;

/** Graph rectangle under the field on a narrow stage [μm]: room for the tick labels left, Δy / y₁ right. */
export function graphRectNarrow(D: number): { x0: number; y0: number; x1: number; y1: number } {
  const y1 = Y0 - DROP;
  return { x0: XL + 3, y0: y1 - (Y1 - Y0), x1: D + STRIP - 2.6, y1 };
}

/** World box: the shared one on wide stages; field over graph on narrow ones. */
export function slitWorld(D: number, narrow = narrowStage()) {
  if (!narrow) return worldOf(D);
  const r = graphRectNarrow(D);
  return { x: [XL - 0.4, D + STRIP + 1.4] as [number, number], y: [r.y0 - 2.6, Y1 + 1.4] as [number, number], aspect: 'contain' as const, padPx: 12 };
}

/**
 * Screen strip with its bright bands and the intensity graph: the shared drawScreen on wide stages,
 * the same strip and graph with the graph under the field on narrow ones.
 */
export function drawSlitScreen(g: Draw, D: number, f: WaveField, I: Float64Array, rgb: [number, number, number], narrow = narrowStage()): Inset {
  if (!narrow) return drawScreen(g, D, f, I, rgb);
  const ctx = g.ctx;
  const [ax, ay] = g.vp.toPx(D, Y1);
  const [bx, by] = g.vp.toPx(D + STRIP, Y0);
  ctx.save();
  ctx.fillStyle = '#1f1f1f';
  ctx.fillRect(ax, ay, bx - ax, by - ay);
  const n = I.length;
  const hpx = (by - ay) / n;
  for (let i = 0; i < n; i++) {
    const v = Math.min(1, Math.max(0, I[i])) ** 0.7;
    if (v < 0.01) continue;
    ctx.fillStyle = css(rgb, v);
    ctx.fillRect(ax, by - (i + 1) * hpx - 0.5, bx - ax, hpx + 1);
  }
  ctx.restore();
  const inset = new Inset(g, graphRectNarrow(D), [0, 1.15], [Y0, Y1]);
  inset.frame({ yTicks: [-10, -5, 0, 5, 10], xLabel: '*I*', yLabel: '*y* (μm)' });
  const pts: [number, number][] = [];
  for (let i = 0; i < n; i++) pts.push([Math.max(0, I[i]), f.screenY[i]]);
  inset.curve(pts, { role: 'fg', width: 1.75 });
  return inset;
}
