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
 * Field lines of point or line charges. Lines start on the sources of the dominant sign
 * (count ∝ |s|, `perUnit` per unit strength) and run until they reach a source of the other
 * sign or leave the bounds.
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
  const lines: number[][] = [];
  for (const c of seeds) {
    const n = Math.max(1, Math.round(perUnit * Math.abs(c.s)));
    for (let i = 0; i < n; i++) {
      const a = (2 * Math.PI * i) / n;
      const line = trace(f, c.x + r0 * Math.cos(a), c.y + r0 * Math.sin(a), {
        h,
        maxSteps: Math.ceil((3 * span) / h),
        bounds,
        dir: fromPos ? 1 : -1,
        stop: (x, y) => sinks.some((d) => Math.hypot(x - d.x, y - d.y) < r0) || seeds.some((d) => d !== c && Math.hypot(x - d.x, y - d.y) < r0 * 0.5),
      });
      line.unshift(c.x, c.y);
      lines.push(line);
    }
  }
  return lines;
}

// ------------------------------------------------------------------ contours

/**
 * Marching squares on an nx × ny grid (row-major, vals[j * nx + i]). Segments are chained into
 * polylines. Coordinates are in grid units (i, j).
 */
export function contour(vals: Float64Array, nx: number, ny: number, level: number): number[][] {
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
  for (let j = 0; j < ny - 1; j++) {
    for (let i = 0; i < nx - 1; i++) {
      const c = j * nx + i;
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
