// Shared drawing for the Ch 41 band diagrams: bands as boxes, electrons and holes as dots.
import { tn } from '../../core/tex';
import type { Draw } from '../../draw/draw';
import { ROLE_COLOR } from '../../draw/theme';
import type { Frame } from '../modern/frame';

/** Formula panel: figures for a and b so that "a − b" (or "a + b" with sign −1) reproduces the printed result. */
export function sumSig(a: number, b: number, sign = -1, res = 3): number {
  const r = (v: number, s: number) => Number(v.toPrecision(s));
  for (let s = Math.max(3, res); s < 8; s++) if (tn(r(a, s) + sign * r(b, s), res) === tn(a + sign * b, res)) return s;
  return 8;
}

/** tn() without its zero tolerance, for densities and occupations such as 10⁻³⁸ (readouts with zeroTol 0). */
export function tz(v: number, sig = 3): string {
  if (v === 0 || !Number.isFinite(v) || Math.abs(v) >= 1e-9) return tn(v, sig);
  let e = Math.floor(Math.log10(Math.abs(v)));
  let m = v / 10 ** e;
  if (Math.abs(Number(m.toFixed(sig - 1))) >= 10) {
    e += 1;
    m /= 10;
  }
  return `${m.toFixed(sig - 1)}\\times 10^{${e}}`;
}

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
