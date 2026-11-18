// Shared 2D field engine (docs/curriculum.md §1 E2): superposed sources, closed-path
// integrals, streamlines and contours. Pure functions, no DOM.
//
// Kernels (strength s, r from the source to the field point):
//   point: f = s r̂ / r²   (point charge in the plane, 3D Coulomb)   potential  s / r
//   line : f = s r̂ / r    (line charge ⊥ page)                       potential −s ln r
//   wire : f = s ẑ × r̂ / r (line current ⊥ page, s > 0 out of page)  stream fn −s ln r
// Physical prefactors (k, 2k, μ0/2π) are applied by the chapters.

export type Kernel = 'point' | 'line' | 'wire';
export type V2 = [number, number];
export type FieldFn = (x: number, y: number) => V2;

export interface Src {
  x: number;
  y: number;
  s: number;
}

export const K_E = 8.9875517923e9; // Coulomb constant [N m²/C²]
export const EPS0 = 8.8541878128e-12; // [C²/(N m²)]
export const MU0 = 1.25663706212e-6; // [T m/A]

const R2MIN = 1e-12;

export function fieldAt(src: readonly Src[], k: Kernel, x: number, y: number): V2 {
  let fx = 0;
  let fy = 0;
  for (const c of src) {
    const dx = x - c.x;
    const dy = y - c.y;
    const r2 = Math.max(dx * dx + dy * dy, R2MIN);
    if (k === 'point') {
      const w = c.s / (r2 * Math.sqrt(r2));
      fx += w * dx;
      fy += w * dy;
    } else if (k === 'line') {
      const w = c.s / r2;
      fx += w * dx;
      fy += w * dy;
    } else {
      const w = c.s / r2;
      fx -= w * dy;
      fy += w * dx;
    }
  }
  return [fx, fy];
}

/** Potential (point, line) or stream function (wire; field lines are its contours). */
export function potentialAt(src: readonly Src[], k: Kernel, x: number, y: number, rMin = 1e-6): number {
  let v = 0;
  for (const c of src) {
    const r = Math.max(Math.hypot(x - c.x, y - c.y), rMin);
    v += k === 'point' ? c.s / r : -c.s * Math.log(r);
  }
  return v;
}

export const fieldFn =
  (src: readonly Src[], k: Kernel): FieldFn =>
  (x, y) =>
    fieldAt(src, k, x, y);

// ------------------------------------------------------------------ integration

/** ∫_a^b g by adaptive Simpson with absolute tolerance tol. */
export function adaptiveSimpson(g: (s: number) => number, a: number, b: number, tol: number, maxDepth = 22): number {
  const fa = g(a);
  const fb = g(b);
  const m = (a + b) / 2;
  const fm = g(m);
  const whole = ((b - a) / 6) * (fa + 4 * fm + fb);
  const rec = (a: number, b: number, fa: number, fm: number, fb: number, whole: number, tol: number, depth: number): number => {
    const m = (a + b) / 2;
    const lm = (a + m) / 2;
    const rm = (m + b) / 2;
    const flm = g(lm);
    const frm = g(rm);
    const left = ((m - a) / 6) * (fa + 4 * flm + fm);
    const right = ((b - m) / 6) * (fm + 4 * frm + fb);
    const err = left + right - whole;
    if (depth <= 0 || Math.abs(err) <= 15 * tol) return left + right + err / 15;
    return rec(a, m, fa, flm, fm, left, tol / 2, depth - 1) + rec(m, b, fm, frm, fb, right, tol / 2, depth - 1);
  };
  return rec(a, b, fa, fm, fb, whole, tol, maxDepth);
}

/**
 * Per-edge integrals over a closed polygon (last vertex joins the first).
 * mode 'flux': ∮ F·n̂ dl with n̂ = (dy, −dx)/dl (outward for a counter-clockwise polygon).
 * mode 'circ': ∮ F·dl.
 */
export function edgeIntegrals(f: FieldFn, poly: readonly V2[], mode: 'flux' | 'circ', tol = 1e-7): number[] {
  const n = poly.length;
  const out: number[] = [];
  for (let i = 0; i < n; i++) {
    const [ax, ay] = poly[i];
    const [bx, by] = poly[(i + 1) % n];
    const dx = bx - ax;
    const dy = by - ay;
    const g =
      mode === 'flux'
        ? (s: number) => {
            const [fx, fy] = f(ax + s * dx, ay + s * dy);
            return fx * dy - fy * dx;
          }
        : (s: number) => {
            const [fx, fy] = f(ax + s * dx, ay + s * dy);
            return fx * dx + fy * dy;
          };
    out.push(adaptiveSimpson(g, 0, 1, tol));
  }
  return out;
}

export const closedFlux = (f: FieldFn, poly: readonly V2[], tol?: number) => sum(edgeIntegrals(f, poly, 'flux', tol));
export const closedCirc = (f: FieldFn, poly: readonly V2[], tol?: number) => sum(edgeIntegrals(f, poly, 'circ', tol));

const sum = (a: number[]) => a.reduce((s, v) => s + v, 0);

// ------------------------------------------------------------------ polygons and curves

/** Signed area: positive for counter-clockwise. */
export function signedArea(poly: readonly V2[]): number {
  let a = 0;
  for (let i = 0, n = poly.length; i < n; i++) {
    const [x0, y0] = poly[i];
    const [x1, y1] = poly[(i + 1) % n];
    a += x0 * y1 - x1 * y0;
  }
  return a / 2;
}

/** Same polygon, counter-clockwise. */
export const ccw = (poly: V2[]): V2[] => (signedArea(poly) < 0 ? [...poly].reverse() : poly);

/** Winding number of a closed polygon around (x, y). */
export function winding(poly: readonly V2[], x: number, y: number): number {
  let w = 0;
  for (let i = 0, n = poly.length; i < n; i++) {
    const [x0, y0] = poly[i];
    const [x1, y1] = poly[(i + 1) % n];
    const cross = (x1 - x0) * (y - y0) - (x - x0) * (y1 - y0);
    if (y0 <= y) {
      if (y1 > y && cross > 0) w += 1;
    } else if (y1 <= y && cross < 0) w -= 1;
  }
  return w;
}

/**
 * True if two non-adjacent edges of the closed polygon cross or touch. A self-intersecting
 * curve (a figure 8) does not bound a region: its winding number is −1 in one lobe.
 */
export function selfIntersects(poly: readonly V2[]): boolean {
  const n = poly.length;
  const orient = (a: V2, b: V2, c: V2) => (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
  const onSeg = (a: V2, b: V2, c: V2) =>
    Math.min(a[0], b[0]) <= c[0] && c[0] <= Math.max(a[0], b[0]) && Math.min(a[1], b[1]) <= c[1] && c[1] <= Math.max(a[1], b[1]);
  for (let i = 0; i < n; i++) {
    const a = poly[i];
    const b = poly[(i + 1) % n];
    const x0 = Math.min(a[0], b[0]);
    const x1 = Math.max(a[0], b[0]);
    const y0 = Math.min(a[1], b[1]);
    const y1 = Math.max(a[1], b[1]);
    for (let j = i + 2; j < n; j++) {
      if (i === 0 && j === n - 1) continue; // adjacent across the closing edge
      const c = poly[j];
      const d = poly[(j + 1) % n];
      if (Math.max(c[0], d[0]) < x0 || Math.min(c[0], d[0]) > x1 || Math.max(c[1], d[1]) < y0 || Math.min(c[1], d[1]) > y1) continue;
      const o1 = orient(a, b, c);
      const o2 = orient(a, b, d);
      const o3 = orient(c, d, a);
      const o4 = orient(c, d, b);
      if (((o1 > 0 && o2 < 0) || (o1 < 0 && o2 > 0)) && ((o3 > 0 && o4 < 0) || (o3 < 0 && o4 > 0))) return true;
      if ((o1 === 0 && onSeg(a, b, c)) || (o2 === 0 && onSeg(a, b, d)) || (o3 === 0 && onSeg(c, d, a)) || (o4 === 0 && onSeg(c, d, b))) return true;
    }
  }
  return false;
}

/** Sum of strengths weighted by the winding number of the path around each source. */
export const enclosed = (src: readonly Src[], poly: readonly V2[]) => src.reduce((a, c) => a + c.s * winding(poly, c.x, c.y), 0);

export function distToSeg(x: number, y: number, ax: number, ay: number, bx: number, by: number): number {
  const dx = bx - ax;
  const dy = by - ay;
  const l2 = dx * dx + dy * dy;
  const u = l2 > 0 ? Math.min(1, Math.max(0, ((x - ax) * dx + (y - ay) * dy) / l2)) : 0;
  return Math.hypot(x - ax - u * dx, y - ay - u * dy);
}

export function distToPoly(poly: readonly V2[], x: number, y: number): number {
  let d = Infinity;
  for (let i = 0, n = poly.length; i < n; i++) {
    const [ax, ay] = poly[i];
    const [bx, by] = poly[(i + 1) % n];
    d = Math.min(d, distToSeg(x, y, ax, ay, bx, by));
  }
  return d;
}

export function circlePoly(cx: number, cy: number, r: number, n = 120): V2[] {
  const out: V2[] = [];
  for (let i = 0; i < n; i++) {
    const a = (2 * Math.PI * i) / n;
    out.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]);
  }
  return out;
}

/** Square of half-side h, counter-clockwise from the lower-left corner. */
export const squarePoly = (cx: number, cy: number, h: number): V2[] => [
  [cx - h, cy - h],
  [cx + h, cy - h],
  [cx + h, cy + h],
  [cx - h, cy + h],
];

/** Closed Catmull-Rom curve through the control points, `per` samples per span. */
export function splinePoly(ctrl: readonly V2[], per = 16): V2[] {
  const n = ctrl.length;
  const out: V2[] = [];
  for (let i = 0; i < n; i++) {
    const p0 = ctrl[(i - 1 + n) % n];
    const p1 = ctrl[i];
    const p2 = ctrl[(i + 1) % n];
    const p3 = ctrl[(i + 2) % n];
    for (let k = 0; k < per; k++) {
      const t = k / per;
      const t2 = t * t;
      const t3 = t2 * t;
      const c = (a: number, b: number, c: number, d: number) =>
        0.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3);
      out.push([c(p0[0], p1[0], p2[0], p3[0]), c(p0[1], p1[1], p2[1], p3[1])]);
    }
  }
  return out;
}

/** Points spaced `step` apart along a closed polygon, with unit tangents. */
export function resample(poly: readonly V2[], step: number): { p: V2; t: V2 }[] {
  const out: { p: V2; t: V2 }[] = [];
  let carry = step / 2;
  for (let i = 0, n = poly.length; i < n; i++) {
    const [ax, ay] = poly[i];
    const [bx, by] = poly[(i + 1) % n];
    const len = Math.hypot(bx - ax, by - ay);
    if (len === 0) continue;
    const tx = (bx - ax) / len;
    const ty = (by - ay) / len;
    let s = carry;
    while (s < len) {
      out.push({ p: [ax + tx * s, ay + ty * s], t: [tx, ty] });
      s += step;
    }
    carry = s - len;
  }
  return out;
}

export function perimeter(poly: readonly V2[]): number {
  let l = 0;
  for (let i = 0, n = poly.length; i < n; i++) {
    const [ax, ay] = poly[i];
    const [bx, by] = poly[(i + 1) % n];
    l += Math.hypot(bx - ax, by - ay);
  }
  return l;
}

/** Area of the intersection of two discs (radii r1, r2, centre distance d). */
export function discOverlap(r1: number, r2: number, d: number): number {
  if (d >= r1 + r2) return 0;
  const rs = Math.min(r1, r2);
  if (d <= Math.abs(r1 - r2)) return Math.PI * rs * rs;
  const a1 = Math.acos((d * d + r1 * r1 - r2 * r2) / (2 * d * r1));
  const a2 = Math.acos((d * d + r2 * r2 - r1 * r1) / (2 * d * r2));
  return r1 * r1 * a1 + r2 * r2 * a2 - 0.5 * Math.sqrt((-d + r1 + r2) * (d + r1 - r2) * (d - r1 + r2) * (d + r1 + r2));
}

// ------------------------------------------------------------------ streamlines

export interface TraceOpts {
  /** Step length (world). */
  h: number;
  maxSteps: number;
  /** [x0, y0, x1, y1]: stop when leaving. */
  bounds: [number, number, number, number];
  /** +1 along the field, −1 against it. */
  dir: 1 | -1;
  /** Stop condition (e.g. reaching a sink). */
  stop?: (x: number, y: number) => boolean;
}

/** RK4 streamline of the unit field from (x, y). Returns flat [x0, y0, x1, y1, ...]. */
export function trace(f: FieldFn, x: number, y: number, o: TraceOpts): number[] {
  const pts = [x, y];
  const unit = (px: number, py: number): V2 | null => {
    const [fx, fy] = f(px, py);
    const m = Math.hypot(fx, fy);
    return m > 1e-30 && Number.isFinite(m) ? [(o.dir * fx) / m, (o.dir * fy) / m] : null;
  };
  const [bx0, by0, bx1, by1] = o.bounds;
  const h = o.h;
  for (let i = 0; i < o.maxSteps; i++) {
    const k1 = unit(x, y);
    if (!k1) break;
    const k2 = unit(x + (h / 2) * k1[0], y + (h / 2) * k1[1]);
    if (!k2) break;
    const k3 = unit(x + (h / 2) * k2[0], y + (h / 2) * k2[1]);
    if (!k3) break;
    const k4 = unit(x + h * k3[0], y + h * k3[1]);
    if (!k4) break;
    const nx = x + (h / 6) * (k1[0] + 2 * k2[0] + 2 * k3[0] + k4[0]);
    const ny = y + (h / 6) * (k1[1] + 2 * k2[1] + 2 * k3[1] + k4[1]);
    // A step that turns back on itself means a null point: stop there.
    if (k1[0] * k4[0] + k1[1] * k4[1] < -0.5) break;
    x = nx;
    y = ny;
    pts.push(x, y);
    if (x < bx0 || x > bx1 || y < by0 || y > by1) break;
    if (o.stop?.(x, y)) break;
  }
  return pts;
}

/**
 * Field lines of point or line charges, `perUnit` lines per unit strength. Every source seeds its
 * lines at fixed, evenly spaced angles, so the picture changes continuously while a charge is
 * dragged. Sources of the dominant sign trace along the field until they reach a source of the
 * other sign or leave the bounds. Sources of the other sign trace backwards from their own seeds;
 * a backward line that reaches a dominant-sign source repeats a line already drawn and is dropped,
 * the ones that leave (lines from infinity) are kept, except where an arriving line already passes
 * within half a spacing of the seed direction. So every charge shows about its own count, and
 * while dragging a line only appears or vanishes one at a time, instead of the whole fan around a
 * charge being redistributed.
 */
export function chargeLines(src: readonly Src[], k: 'point' | 'line', perUnit: number, r0: number, h: number, bounds: TraceOpts['bounds']): number[][] {
  const pos = src.filter((c) => c.s > 0);
  const neg = src.filter((c) => c.s < 0);
  const qp = pos.reduce((a, c) => a + c.s, 0);
  const qn = -neg.reduce((a, c) => a + c.s, 0);
  const fromPos = qp >= qn;
  const seeds = fromPos ? pos : neg;
  const sinks = fromPos ? neg : pos;
  const f = fieldFn(src, k);
  const span = Math.hypot(bounds[2] - bounds[0], bounds[3] - bounds[1]);
  const near = (list: readonly Src[], x: number, y: number, r: number, skip?: Src) => list.some((d) => d !== skip && Math.hypot(x - d.x, y - d.y) < r);
  const lines: number[][] = [];
  const fan = (c: Src, dir: 1 | -1, ends: readonly Src[], others: readonly Src[], dropAtEnd: boolean, taken: readonly number[] = []) => {
    const n = Math.max(1, Math.round(perUnit * Math.abs(c.s)));
    for (let i = 0; i < n; i++) {
      const a = (2 * Math.PI * i) / n;
      // A seed whose direction already has an arriving line within half a spacing is covered.
      if (taken.some((b) => Math.abs(((a - b + 3 * Math.PI) % (2 * Math.PI)) - Math.PI) < Math.PI / n)) continue;
      let ended = false;
      const line = trace(f, c.x + r0 * Math.cos(a), c.y + r0 * Math.sin(a), {
        h,
        maxSteps: Math.ceil((3 * span) / h),
        bounds,
        dir,
        stop: (x, y) => {
          if (near(ends, x, y, r0)) {
            ended = true;
            return true;
          }
          return near(others, x, y, r0 * 0.5, c);
        },
      });
      if (dropAtEnd && ended) continue;
      line.unshift(c.x, c.y);
      lines.push(line);
    }
  };
  for (const c of seeds) fan(c, fromPos ? 1 : -1, sinks, seeds, false);
  const main = lines.length;
  for (const d of sinks) {
    // Directions in which the dominant sign's lines arrive at d.
    const taken: number[] = [];
    for (let j = 0; j < main; j++) {
      const L = lines[j];
      const x = L[L.length - 2];
      const y = L[L.length - 1];
      if (Math.hypot(x - d.x, y - d.y) < 1.05 * r0) taken.push(Math.atan2(y - d.y, x - d.x));
    }
    fan(d, fromPos ? -1 : 1, seeds, sinks, true, taken);
  }
  return lines;
}

// ------------------------------------------------------------------ contours

/**
 * Equally spaced contour levels k·step (|k| ≤ kMax) and, for each, the grid cells to march, so
 * that lines stop where they would be drawn closer than `minGap` grid cells apart (spacing
 * step / |∇v|, with the gradient estimated per cell). Near a point charge the levels crowd
 * without bound; this keeps every level whose lines are still distinguishable, however many,
 * instead of a fixed number of levels. The zero level is kept everywhere. Work is
 * ∝ cells + segments, not cells × levels.
 */
export function levelCells(vals: Float64Array, nx: number, ny: number, step: number, kMax: number, minGap: number): Map<number, number[]> {
  const out = new Map<number, number[]>();
  const gMax = step / minGap; // largest |∇v| per cell that keeps the gap
  for (let j = 0; j < ny - 1; j++) {
    for (let i = 0; i < nx - 1; i++) {
      const c = j * nx + i;
      const v00 = vals[c];
      const v10 = vals[c + 1];
      const v11 = vals[c + nx + 1];
      const v01 = vals[c + nx];
      const gx = (v10 - v00 + v11 - v01) / 2;
      const gy = (v01 - v00 + v11 - v10) / 2;
      // The zero level (drawn dashed, on its own) is never cut.
      const wide = gx * gx + gy * gy <= gMax * gMax;
      const lo = Math.max(-kMax, Math.ceil(Math.min(v00, v10, v11, v01) / step));
      const hi = Math.min(kMax, Math.floor(Math.max(v00, v10, v11, v01) / step));
      for (let k = lo; k <= hi; k++) {
        if (!wide && k !== 0) continue;
        const l = out.get(k);
        if (l) l.push(c);
        else out.set(k, [c]);
      }
    }
  }
  return out;
}

/**
 * Marching squares on an nx × ny grid (row-major, vals[j * nx + i]). Segments are chained into
 * polylines. Coordinates are in grid units (i, j). `cells` (lower-left node indices j·nx + i)
 * limits the march to those cells; by default every cell is visited.
 */
export function contour(vals: Float64Array, nx: number, ny: number, level: number, cells?: ArrayLike<number>): number[][] {
  // Crossing point of each grid edge, keyed by edge id: 2(j nx + i) horizontal, +1 vertical.
  const pt = new Map<number, V2>();
  const at = (id: number): number => {
    if (!pt.has(id)) {
      const cell = id >> 1;
      const i = cell % nx;
      const j = (cell - i) / nx;
      const a = vals[cell];
      const b = id & 1 ? vals[cell + nx] : vals[cell + 1];
      const u = (level - a) / (b - a);
      pt.set(id, id & 1 ? [i, j + u] : [i + u, j]);
    }
    return id;
  };
  const segs: [number, number][] = [];
  const nc = cells ? cells.length : (nx - 1) * (ny - 1);
  for (let m = 0; m < nc; m++) {
    const c = cells ? cells[m] : Math.floor(m / (nx - 1)) * nx + (m % (nx - 1));
    const v00 = vals[c];
    const v10 = vals[c + 1];
    const v11 = vals[c + nx + 1];
    const v01 = vals[c + nx];
    const idx = (v00 >= level ? 1 : 0) | (v10 >= level ? 2 : 0) | (v11 >= level ? 4 : 0) | (v01 >= level ? 8 : 0);
    if (idx === 0 || idx === 15) continue;
    const B = 2 * c; // bottom (i,j)-(i+1,j)
    const T = 2 * (c + nx); // top
    const Lf = 2 * c + 1; // left (i,j)-(i,j+1)
    const R = 2 * (c + 1) + 1; // right
    const add = (a: number, b: number) => segs.push([at(a), at(b)]);
    switch (idx) {
      case 1:
      case 14:
        add(Lf, B);
        break;
      case 2:
      case 13:
        add(B, R);
        break;
      case 3:
      case 12:
        add(Lf, R);
        break;
      case 4:
      case 11:
        add(R, T);
        break;
      case 6:
      case 9:
        add(B, T);
        break;
      case 7:
      case 8:
        add(Lf, T);
        break;
      case 5:
      case 10: {
        const centre = (v00 + v10 + v11 + v01) / 4 >= level;
        // idx 5: corners 00 and 11 high.
        if ((idx === 5) === centre) {
          add(Lf, T);
          add(B, R);
        } else {
          add(Lf, B);
          add(R, T);
        }
        break;
      }
    }
  }
  // Chain segments sharing an edge point.
  const by = new Map<number, number[]>();
  segs.forEach(([a, b], k) => {
    for (const e of [a, b]) {
      const l = by.get(e);
      if (l) l.push(k);
      else by.set(e, [k]);
    }
  });
  const used = new Uint8Array(segs.length);
  const lines: number[][] = [];
  const walk = (start: number, from: number, out: number[]) => {
    let e = start;
    let k = from;
    for (;;) {
      const next = (by.get(e) ?? []).find((s) => s !== k && !used[s]);
      if (next === undefined) return;
      used[next] = 1;
      const [a, b] = segs[next];
      e = a === e ? b : a;
      k = next;
      out.push(e);
    }
  };
  for (let k = 0; k < segs.length; k++) {
    if (used[k]) continue;
    used[k] = 1;
    const [a, b] = segs[k];
    const fwd: number[] = [a, b];
    walk(b, k, fwd);
    const back: number[] = [];
    walk(a, k, back);
    const ids = [...back.reverse(), ...fwd];
    const flat: number[] = [];
    for (const id of ids) {
      const p = pt.get(id)!;
      flat.push(p[0], p[1]);
    }
    lines.push(flat);
  }
  return lines;
}
