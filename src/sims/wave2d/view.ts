// Draws a WaveField on the stage as wavefronts: the crest lines of ψ at time t, in the
// wavelength colour. Behind the barrier each crest segment fades with the local amplitude,
// so the lines break off along the nodal lines of the interference pattern.
import type { Draw } from '../../draw/draw';
import { theme } from '../../draw/theme';
import type { WaveField } from './field';

/** Opacity levels for crest segments (one stroke per level). */
const LEVELS = 6;

export function drawWave(g: Draw, f: WaveField, t: number, rgb: [number, number, number]): void {
  const { plane, segs } = f.crests(t);
  const ctx = g.ctx;
  const col = css(rgb);
  const [, yTop] = g.vp.toPx(0, f.s.y1);
  const [, yBot] = g.vp.toPx(0, f.s.y0);
  ctx.save();
  ctx.strokeStyle = col;
  ctx.lineCap = 'butt';
  ctx.lineWidth = 1.75 * theme.scale;
  // Incident plane wave: straight crests up to the front.
  ctx.beginPath();
  for (const x of plane) {
    const [px] = g.vp.toPx(x, 0);
    ctx.moveTo(px, yTop);
    ctx.lineTo(px, yBot);
  }
  ctx.stroke();
  // Behind the barrier: crest segments grouped by opacity. Opacity ramps from 0 at a fifth of
  // the full amplitude, so the lines end cleanly at the nodal lines (where the phase jumps by π)
  // while the side lobes of a single slit (about 0.2–0.5) still show.
  const paths: Path2D[] = Array.from({ length: LEVELS }, () => new Path2D());
  // The viewport is linear: px = ox + sx·x, py = oy + sy·y (no per-point allocation).
  const [ox, oy] = g.vp.toPx(0, 0);
  const [ux, uy] = g.vp.toPx(1, 1);
  const sx = ux - ox;
  const sy = uy - oy;
  for (let k = 0; k < segs.length; k += 5) {
    const a = Math.min(1, (segs[k + 4] - 0.12) / 0.55);
    if (a <= 0) continue;
    const p = paths[Math.min(LEVELS - 1, Math.floor(a * LEVELS))];
    p.moveTo(ox + sx * segs[k], oy + sy * segs[k + 1]);
    p.lineTo(ox + sx * segs[k + 2], oy + sy * segs[k + 3]);
  }
  paths.forEach((p, lv) => {
    ctx.globalAlpha = (lv + 1) / LEVELS;
    ctx.stroke(p);
  });
  ctx.restore();
}

/** CSS colour of an rgb triple. */
export const css = ([r, g, b]: [number, number, number], a = 1) => `rgba(${r}, ${g}, ${b}, ${a})`;
