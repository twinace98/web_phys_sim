// Ch 40: atoms flying through a chain of Stern-Gerlach devices. Shared by the sequential and
// angle scenes: geometry in normalised coordinates (x ∈ [0, 1] along the beam, y ∈ [−1, 1]),
// atom bookkeeping, and drawing.
import { fmt } from '../../core/format';
import type { Rng } from '../../core/rng';
import type { Draw } from '../../draw/draw';
import { ROLE_COLOR } from '../../draw/theme';
import { Frame, TICK, linePx, textPx, type Box } from '../modern/frame';
import { DEG, runChain, type Device, type Fate } from './physics';

/** Flight time from the source to the detectors [s]. */
export const FLIGHT = 1.6;
const X_SRC = 0.03;
const X_DET = 0.94;
const EXIT = 0.13;
const DET_Y = 0.55;
const STOP = 0.22;

export interface Atom {
  te: number;
  fate: Fate;
  /** Arrival time at its end point. */
  ta: number;
}

export interface ChainState {
  t: number;
  n: number;
  rng: Rng;
  emitted: number;
  flying: Atom[];
  /** counts[device][0 = +, 1 = −]: atoms that ended at that exit (blocked or detected). */
  counts: number[][];
}

export interface Geometry {
  x0: number[];
  w: number;
  /** Polyline of an atom with this fate, ending at its stop point. */
  path: (f: Fate) => [number, number][];
}

/** Device positions and atom paths for a chain; passed exits follow the chain's settings. */
export function chainGeometry(devices: Device[]): Geometry {
  const n = devices.length;
  const s = (0.84 - 0.12) / n;
  const w = 0.42 * s;
  const x0 = Array.from({ length: n }, (_, i) => 0.12 + i * s);
  const passSign = devices.map((d) => (d.pass === '-' ? -1 : 1));
  const path = (f: Fate): [number, number][] => {
    const pts: [number, number][] = [[X_SRC, 0]];
    for (let i = 0; i <= f.device; i++) {
      pts.push([x0[i], 0]);
      if (i < f.device) {
        pts.push([x0[i] + w, passSign[i] * EXIT]);
        continue;
      }
      const sy = f.up ? 1 : -1;
      pts.push([x0[i] + w, sy * EXIT]);
      pts.push(f.detected ? [X_DET, sy * DET_Y] : [x0[i] + w + 0.35 * (s - w), sy * STOP]);
    }
    return pts;
  };
  return { x0, w, path };
}

/** x-extent of a path → travel time at constant speed along the beam. */
const travel = (pts: [number, number][]) => ((pts[pts.length - 1][0] - X_SRC) / (X_DET - X_SRC)) * FLIGHT;

export function initChain(devices: Device[], rng: Rng): ChainState {
  return { t: 0, n: 0, rng, emitted: 0, flying: [], counts: devices.map(() => [0, 0]) };
}

/** Advance to time t: emit atoms at `rate` per second (up to `total`) and land arrived ones. */
export function stepChain(s: ChainState, t: number, devices: Device[], geo: Geometry, rate: number, total: number): void {
  s.t = t;
  while (s.emitted < total && s.emitted / rate <= t) {
    const te = s.emitted / rate;
    const fate = runChain(devices, s.rng);
    s.flying.push({ te, fate, ta: te + travel(geo.path(fate)) });
    s.emitted++;
  }
  const still: Atom[] = [];
  for (const a of s.flying) {
    if (a.ta <= t) s.counts[a.fate.device][a.fate.up ? 0 : 1]++;
    else still.push(a);
  }
  s.flying = still;
}

export const chainEnd = (total: number, rate: number) => (total - 1) / rate + FLIGHT + 0.05;

/** Point at x along a polyline that is monotone in x. */
function along(pts: [number, number][], x: number): [number, number] {
  for (let i = 1; i < pts.length; i++) {
    const [xa, ya] = pts[i - 1];
    const [xb, yb] = pts[i];
    if (x <= xb || i === pts.length - 1) {
      const u = xb > xa ? Math.min(1, Math.max(0, (x - xa) / (xb - xa))) : 1;
      return [x, ya + u * (yb - ya)];
    }
  }
  return pts[pts.length - 1];
}

const BEAM = '#c8c8c8';
const DEVICE_FILL = '#eef1f4';
const DEVICE_EDGE = '#8c8c8c';
const ATOM = '#1a1a1a';
export const UP_COLOR = ROLE_COLOR.position;
export const DOWN_COLOR = ROLE_COLOR.velocity;

/** Name of an axis: z, x, or the angle. */
export const axisName = (theta: number) => (Math.abs(theta) < 1e-9 ? '*z*' : Math.abs(theta - 90 * DEG) < 1e-9 ? '*x*' : `${Math.round(theta / DEG)}°`);

/** Chain drawing: beams, devices with axis icons, blockers, detectors with counts, atoms. */
export function drawChain(g: Draw, box: Box, devices: Device[], geo: Geometry, s: ChainState, probs: [number, number]): Frame {
  const f = new Frame(g, box, [0, 1], [-1, 1]);
  const n = devices.length;
  const sy = (b: boolean) => (b ? 1 : -1);
  // Beams.
  const last = n - 1;
  for (let i = 0; i < n; i++) {
    const x0 = geo.x0[i];
    const xin = i === 0 ? X_SRC : geo.x0[i - 1] + geo.w;
    const yin = i === 0 ? 0 : (devices[i - 1].pass === '-' ? -1 : 1) * EXIT;
    f.line(xin, yin, x0, 0, { color: BEAM, width: 2 });
    for (const up of [true, false]) {
      f.line(x0, 0, x0 + geo.w, sy(up) * EXIT, { color: BEAM, width: 2 });
      if (i === last) f.line(x0 + geo.w, sy(up) * EXIT, X_DET, sy(up) * DET_Y, { color: BEAM, width: 2 });
    }
  }
  // Devices.
  devices.forEach((d, i) => {
    const x0 = geo.x0[i];
    f.polygon(
      [
        [x0, -0.22],
        [x0 + geo.w, -0.22],
        [x0 + geo.w, 0.22],
        [x0, 0.22],
      ],
      { fill: DEVICE_FILL, color: DEVICE_EDGE, width: 1.25 },
    );
    const cx = f.X(x0 + geo.w / 2);
    textPx(g, cx, f.Y(0.22) - 10, `SG-${axisName(d.theta)}`, { size: 13, color: '#1a1a1a', align: 'center' });
    // Axis icon: the measuring direction in the zx plane (z up, x right).
    const cy = f.Y(-0.22) + 26;
    const r = 13;
    g.circle(W2(g, cx, cy), r, { color: '#b5b5b5', width: 1 });
    const ux = Math.sin(d.theta);
    const uz = Math.cos(d.theta);
    g.arrow(W2(g, cx - ux * r * 0.9, cy + uz * r * 0.9), { x: g.px(2 * ux * r * 0.9), y: g.px(2 * uz * r * 0.9) }, { color: '#5c5c5c', width: 1.5 });
    // Exit signs.
    for (const up of [true, false]) {
      const ex = f.X(x0 + geo.w) + 4;
      const ey = f.Y(sy(up) * EXIT) + (up ? -8 : 10);
      textPx(g, ex, ey, up ? '+' : '−', { size: 12, color: up ? UP_COLOR : DOWN_COLOR, baseline: 'middle' });
    }
    // Blocked exit.
    if (i < last) {
      // The exit not passed on is blocked.
      const by = d.pass === '+' ? -1 : 1;
      const s2 = (0.84 - 0.12) / n;
      const xb = x0 + geo.w + 0.35 * (s2 - geo.w);
      f.line(x0 + geo.w, by * EXIT, xb, by * STOP, { color: BEAM, width: 2 });
      linePx(g, f.X(xb) - 1, f.Y(by * STOP) - 9, f.X(xb) + 1, f.Y(by * STOP) + 9, { color: '#1a1a1a', width: 4 });
      const c = s.counts[i][by > 0 ? 0 : 1];
      textPx(g, f.X(xb) + 8, f.Y(by * STOP), String(c), { size: 11, color: TICK, baseline: 'middle' });
    }
  });
  // Source.
  linePx(g, f.X(X_SRC) - 14, f.Y(0) - 10, f.X(X_SRC) - 14, f.Y(0) + 10, { color: '#5c5c5c', width: 6 });
  // Detectors with counts and the measured fraction against the prediction.
  const cl = s.counts[last];
  const tot = cl[0] + cl[1];
  for (const up of [true, false]) {
    const px = f.X(X_DET);
    const py = f.Y(sy(up) * DET_Y);
    linePx(g, px, py - 12, px, py + 12, { color: up ? UP_COLOR : DOWN_COLOR, width: 6 });
    textPx(g, px + 10, py, String(cl[up ? 0 : 1]), { size: 14, color: up ? UP_COLOR : DOWN_COLOR, baseline: 'middle' });
  }
  // Fraction bar between the detectors: + part blue, − part orange; tick = prediction.
  const pin = probs[0] + probs[1];
  if (pin > 0) {
    const bx = f.X(X_DET) + 4;
    const bt = f.Y(DET_Y) + 26;
    const bb = f.Y(-DET_Y) - 26;
    const frac = tot ? cl[0] / tot : 0;
    const split = bt + frac * (bb - bt);
    if (tot) {
      linePx(g, bx, bt, bx, split, { color: UP_COLOR, width: 8 });
      linePx(g, bx, split, bx, bb, { color: DOWN_COLOR, width: 8 });
    } else linePx(g, bx, bt, bx, bb, { color: '#e3e3e3', width: 8 });
    const yt = bt + (probs[0] / pin) * (bb - bt);
    linePx(g, bx - 9, yt, bx + 9, yt, { color: '#1a1a1a', width: 2 });
    textPx(g, bx + 13, yt, fmt(probs[0] / pin, 2), { size: 11, color: '#1a1a1a', baseline: 'middle' });
  }
  // Atoms in flight.
  for (const a of s.flying) {
    const x = X_SRC + ((s.t - a.te) / FLIGHT) * (X_DET - X_SRC);
    if (x < X_SRC) continue;
    const [px, py] = along(geo.path(a.fate), x);
    g.circle(f.P(px, py), 2.5, { fill: ATOM });
  }
  return f;
}

function W2(g: Draw, x: number, y: number) {
  const [a, b] = g.vp.toWorld(x, y);
  return { x: a, y: b };
}
