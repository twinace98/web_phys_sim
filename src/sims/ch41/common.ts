// Shared drawing for the Ch 41 band diagrams: bands as boxes, electrons and holes as dots.
import type { Draw } from '../../draw/draw';
import { ROLE_COLOR } from '../../draw/theme';
import type { Frame } from '../modern/frame';

export const BAND = '#eef1f4';
export const BAND_EDGE = '#9a9a9a';
export const ELECTRON = ROLE_COLOR.negative;
export const HOLE = ROLE_COLOR.positive;

/** Deterministic scatter in [0, 1) (golden-ratio sequence), so dots never jump between frames. */
export const scatter = (i: number) => (i * 0.6180339887 + 0.137) % 1;

export function bandBox(f: Frame, x0: number, x1: number, e0: number, e1: number): void {
  f.polygon(
    [
      [x0, e0],
      [x1, e0],
      [x1, e1],
      [x0, e1],
    ],
    { fill: BAND, color: BAND_EDGE, width: 1 },
  );
}

export const electron = (g: Draw, f: Frame, x: number, E: number) => g.circle(f.P(x, E), 4, { fill: ELECTRON });

/** Hole: empty state in a filled band, drawn as an open vermilion ring. */
export const hole = (g: Draw, f: Frame, x: number, E: number) => g.circle(f.P(x, E), 4, { fill: '#ffffff', color: HOLE, width: 1.75 });

/**
 * Positions for k carriers near a band edge: spread across [x0, x1] in a row `rowPx` from the
 * edge (CB: above the bottom edge; VB: below the top edge), wrapping to a second row.
 */
export function edgeSlots(f: Frame, k: number, x0: number, x1: number, edge: number, up: boolean): [number, number][] {
  const out: [number, number][] = [];
  const per = 8;
  const dE = Math.abs(f.yAt(0) - f.yAt(11));
  for (let i = 0; i < k; i++) {
    const row = Math.floor(i / per);
    const col = i % per;
    const x = x0 + ((col + 0.5 + 0.35 * (scatter(i + 3 * row) - 0.5)) / per) * (x1 - x0);
    const E = edge + (up ? 1 : -1) * dE * (row + 0.75);
    out.push([x, E]);
  }
  return out;
}
