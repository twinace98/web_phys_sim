// Block on a vertical spring with a dashpot (vane in a liquid, Halliday Fig. 15-16), laid out in
// canvas px. The support is a fixed ceiling or, for the driven oscillator, a slotted yoke moved by
// a pin on a turning disk (Scotch yoke), so the support moves exactly as d cos θ.
import type { Vec2 } from '../../../core/types';
import type { Draw } from '../../../draw/draw';
import { W } from '../../modern/frame';

const STEEL = '#5c5c5c';
const GREY = '#9a9a9a';
const LIQUID = '#d7e7f2';

export interface Mech {
  cx: number;
  /** Support line at rest (ceiling, or yoke centre) [px]. */
  ySup: number;
  /** Block centre at x = 0 [px]. */
  yEq: number;
  /** px per metre. */
  sc: number;
  block: number;
  rod: number;
  cylTop: number;
  cylBot: number;
  cylW: number;
  /** Drive disk radius [px]; 0 for a fixed ceiling. */
  disk: number;
  /** Largest block displacement that fits [px]. */
  travel: number;
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/**
 * Layout in the column at cx between top and bottom [px] for block displacements up to xMax [m]
 * and support displacements up to dMax [m] (0: fixed ceiling).
 */
export function mechLayout(cx: number, top: number, bottom: number, xMax: number, dMax = 0): Mech {
  const H = bottom - top;
  const block = clamp(0.1 * H, 18, 44);
  const gap = clamp(0.07 * H, 12, 30);
  // top + topH + (travel + gap + dPx) + block + (2 travel + 14) + travel + 8 = bottom, dPx = travel dMax/xMax
  const fit = (topH: number) => Math.max(4, (H - topH - gap - block - 22) / (4 + dMax / xMax));
  let disk = dMax > 0 ? clamp(0.05 * H, 8, 16) : 0;
  let travel = fit(dMax > 0 ? disk + 2 : 12);
  if (dMax > 0) {
    // The pin (radius d) sits inside the disk.
    disk = Math.max(disk, (travel * dMax) / xMax + 6);
    travel = fit(disk + 2);
  }
  const topH = dMax > 0 ? disk + 2 : 12;
  const sc = travel / xMax;
  const ySup = top + topH;
  const yEq = ySup + travel + gap + dMax * sc + block / 2;
  const rod = 2 * travel + 14;
  const piston = yEq + block / 2 + rod;
  return { cx, ySup, yEq, sc, block, rod, cylTop: piston - travel - 8, cylBot: piston + travel + 8, cylW: block * 0.95, disk, travel };
}

function zigzag(g: Draw, cx: number, y0: number, y1: number, w: number): void {
  const n = 12;
  const lead = Math.min(6, (y1 - y0) * 0.1);
  const pts: Vec2[] = [W(g, cx, y0), W(g, cx, y0 + lead)];
  const span = y1 - y0 - 2 * lead;
  for (let i = 0; i < n; i++) pts.push(W(g, cx + (i % 2 ? -w : w), y0 + lead + (span * (i + 0.5)) / n));
  pts.push(W(g, cx, y1 - lead), W(g, cx, y1));
  g.polyline(pts, { color: STEEL, width: 1.5 });
}

const rect = (g: Draw, l: number, t: number, r: number, b: number): Vec2[] => [W(g, l, t), W(g, r, t), W(g, r, b), W(g, l, b)];

function hatch(g: Draw, x0: number, x1: number, y: number, up: boolean): void {
  g.line(W(g, x0, y), W(g, x1, y), { color: STEEL, width: 2 });
  for (let x = x0 + 2; x < x1 - 2; x += 7) g.line(W(g, x, y), W(g, x + 5, y + (up ? -5 : 5)), { color: GREY, width: 1 });
}

/**
 * Draw the oscillator with block displacement x [m] (up positive). drive: support amplitude d [m] and
 * drive angle θ (pin at the top for θ = 0), support at d cos θ. Returns the block's right edge and centre [px].
 */
export function drawMech(g: Draw, M: Mech, x: number, drive?: { d: number; theta: number }): { right: number; y: number } {
  const { cx, block, sc } = M;
  const yb = M.yEq - x * sc;
  let ySpring = M.ySup;
  if (M.disk > 0 && drive) {
    // Disk with a spoke (shows the rotation) and a pin at radius d; the yoke passes through the pin.
    const { d, theta } = drive;
    const r = d * sc;
    g.circle(W(g, cx, M.ySup), M.disk, { fill: '#f1f1f1', color: GREY, width: 1.25 });
    g.line(W(g, cx, M.ySup), W(g, cx + M.disk * Math.sin(theta), M.ySup - M.disk * Math.cos(theta)), { color: GREY, width: 1.25 });
    const yy = M.ySup - r * Math.cos(theta);
    const half = M.disk * 1.6;
    g.polygon(rect(g, cx - half, yy - 2.5, cx + half, yy + 2.5), { fill: STEEL });
    g.circle(W(g, cx + r * Math.sin(theta), yy), 2.5, { fill: '#1a1a1a' });
    ySpring = yy + 2.5;
  } else {
    hatch(g, cx - block, cx + block, M.ySup, true);
  }
  zigzag(g, cx, ySpring, yb - block / 2, Math.min(12, Math.max(6, block * 0.3)));
  // Rod and vane (piston) in the liquid.
  const piston = yb + block / 2 + M.rod;
  g.line(W(g, cx, yb + block / 2), W(g, cx, piston), { color: STEEL, width: 2 });
  const hw = M.cylW / 2;
  g.polygon(rect(g, cx - hw, M.cylTop + 6, cx + hw, M.cylBot), { fill: LIQUID });
  g.polyline([W(g, cx - hw, M.cylTop), W(g, cx - hw, M.cylBot), W(g, cx + hw, M.cylBot), W(g, cx + hw, M.cylTop)], { color: STEEL, width: 1.75 });
  g.polygon(rect(g, cx - hw + 3, piston - 2, cx + hw - 3, piston + 2), { fill: STEEL });
  hatch(g, cx - block, cx + block, M.cylBot + 1, false);
  // Block.
  g.polygon(rect(g, cx - block / 2, yb - block / 2, cx + block / 2, yb + block / 2), { fill: 'position', fillAlpha: 0.9 });
  g.text(W(g, cx, yb), '*m*', { size: Math.min(15, block * 0.45), color: '#ffffff', align: 'center', baseline: 'middle' });
  return { right: cx + block / 2, y: yb };
}
