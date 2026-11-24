// Ch 36 scene: phasor chain. N Huygens sources across the slit, rays at angle θ, and the
// head-to-tail sum of their phasors. At a sin θ = λ the chain closes into a circle: I = 0.
import type { ParamSchema, Scene, Vec2 } from '../../core/types';
import type { Draw } from '../../draw/draw';
import { ROLE_COLOR, theme } from '../../draw/theme';
import { Inset, Obstacles, TICK } from '../inset/inset';
import { fmt } from '../../core/format';
import { num, slider, texOf, tn, tnCmp } from '../../core/tex';
import { edgePhase, firstMin, phasorChain, singleSlit, sourcesIntensity } from './physics';

type P = { theta: number; a: number; lambda: number; N: number };

const DEG = Math.PI / 180;
const TH_MAX = 40;
/** Slit drawing: wall at x = SX, opening of drawn height SH (not to scale). */
const SX = 1.6;
const SH = 7;
const RAY = 5.2;
/** Phasor chain: leftmost origin, total length when straight, and its least gap to the rays [units]. */
const CX = 9.2;
const CHAIN = 16;
const GAP = 1.1;
/**
 * Fewest sources: φ/2π reaches a sin 40° / λ = 6.43 at most, so with N ≥ 8 no principal
 * maximum of the N-source grating (φ = 2πN) falls in range and the minima a sin θ = mλ
 * are those of (sin α/α)².
 */
export const N_MIN = 8;

const narrow = () => typeof window !== 'undefined' && window.matchMedia('(max-width: 767px)').matches;
/** I(θ) graph right of the chain, or under the slit and chain on narrow screens. */
const plotRect = () => (narrow() ? { x0: 4.5, y0: -20, x1: 25, y1: -11.5 } : { x0: 32, y0: -4.5, x1: 40.5, y1: 4.5 });

const params: ParamSchema<P> = {
  theta: {
    kind: 'number',
    label: 'ch36.p.theta',
    desc: 'ch36.d.theta',
    group: 'main',
    live: true,
    control: 'slider',
    min: -TH_MAX,
    max: TH_MAX,
    step: 0.1,
    default: 14.5,
    unit: '°',
  },
  a: {
    kind: 'number',
    label: 'ch36.p.a',
    desc: 'ch36.d.a',
    group: 'main',
    live: true,
    control: 'slider',
    min: 0.5,
    max: 4,
    step: 0.1,
    default: 2,
    unit: 'μm',
  },
  lambda: {
    kind: 'number',
    label: 'ch36.p.lambda',
    desc: 'ch36.d.lambda',
    group: 'advanced',
    live: true,
    control: 'slider',
    min: 400,
    max: 700,
    step: 10,
    default: 500,
    unit: 'nm',
  },
  N: {
    kind: 'number',
    label: 'ch36.p.N',
    desc: 'ch36.d.N',
    group: 'advanced',
    live: true,
    control: 'stepper',
    min: N_MIN,
    max: 20,
    step: 1,
    default: 10,
  },
};

const phiOf = (p: P, th = p.theta) => edgePhase(p.a, p.lambda / 1000, th * DEG);
/** Phase step between neighbouring sources is φ/N; N sources spaced a/N give φ_N = φ across the slit. */
const intensity = (p: P, th = p.theta) => sourcesIntensity(p.N, phiOf(p, th));

const plot = (g: Draw) => new Inset(g, plotRect(), [-TH_MAX, TH_MAX], [0, 1.1]);

/** Source heights, ray direction, ray ends on the common wavefront, and the dashed wavefront line. */
export function slitGeometry(p: P) {
  const N = p.N;
  const ys = Array.from({ length: N }, (_, i) => SH / 2 - ((i + 0.5) * SH) / N);
  const th = p.theta * DEG;
  const u = { x: Math.cos(th), y: Math.sin(th) };
  // Rays end on a common wavefront (perpendicular to u) that the top ray reaches after RAY.
  const c = SX * u.x + ys[0] * u.y + RAY;
  const ends = ys.map((y): Vec2 => {
    const L = c - (SX * u.x + y * u.y);
    return { x: SX + L * u.x, y: y + L * u.y };
  });
  const top: Vec2 = { x: SX + RAY * u.x, y: ys[0] + RAY * u.y };
  const n = { x: -u.y, y: u.x };
  const span = SH + 1.2;
  const front: [Vec2, Vec2] = [
    { x: top.x + n.x, y: top.y + n.y },
    { x: top.x - n.x * span, y: top.y - n.y * span },
  ];
  return { ys, th, u, ends, front };
}

/**
 * x of the chain's origin: CX, or further right when the chain would reach back over the rays
 * and the wavefront (a near-closed chain at large θ), keeping a gap of GAP.
 */
export function chainOrigin(p: P): number {
  const { ends, front } = slitGeometry(p);
  const right = Math.max(...ends.map((e) => e.x), front[0].x, front[1].x);
  const left = Math.min(...phasorChain(p.N, phiOf(p), CHAIN / p.N).map((q) => q[0]));
  return Math.max(CX, right + GAP - left);
}

function drawSlit(g: Draw, p: P, obs: Obstacles): void {
  const N = p.N;
  const { ys, th, u, ends, front } = slitGeometry(p);
  const wall = (ya: number, yb: number) =>
    g.polygon(
      [
        { x: SX - 0.3, y: ya },
        { x: SX, y: ya },
        { x: SX, y: yb },
        { x: SX - 0.3, y: yb },
      ],
      { fill: '#5c5c5c' },
    );
  wall(SH / 2, 8.5);
  wall(-8.5, -SH / 2);
  ys.forEach((y, i) => {
    const col = i < N / 2 ? ROLE_COLOR.position : ROLE_COLOR.energyU;
    g.line({ x: SX, y }, ends[i], { color: col, width: 1.25, alpha: 0.75 });
    obs.seg({ x: SX, y }, ends[i]);
  });
  g.line(front[0], front[1], { color: TICK, width: 1, dash: [4, 4] });
  obs.seg(front[0], front[1]);
  // Extra path a sin θ, on the ray that travels farther (bottom for θ > 0, top for θ < 0).
  const extra = Math.abs((ys[0] - ys[N - 1]) * u.y);
  if (extra > g.px(3)) {
    const from: Vec2 = { x: SX, y: th > 0 ? ys[N - 1] : ys[0] };
    const sg = Math.sign(th);
    const nrm = { x: sg * u.y, y: -sg * u.x };
    g.line(from, { x: from.x + extra * u.x, y: from.y + extra * u.y }, { role: 'fg', width: 3.5 });
    const mid = { x: from.x + (extra * u.x) / 2 + nrm.x * g.px(16), y: from.y + (extra * u.y) / 2 + nrm.y * g.px(16) };
    g.text(mid, 'Δ*L*', { size: 13, align: 'center', baseline: 'middle' });
  }
  // Angle θ from the straight-through direction, at the source without the ΔL mark.
  const T0: Vec2 = { x: SX, y: th >= 0 ? ys[0] : ys[N - 1] };
  g.line(T0, { x: SX + 2.6, y: T0.y }, { color: TICK, width: 1, dash: [3, 4] });
  if (Math.abs(th) > 0.5 * DEG) {
    g.arc(T0, 46, 0, th, { color: TICK, width: 1.25 });
    g.text({ x: SX + Math.cos(th / 2) * g.px(58), y: T0.y + Math.sin(th / 2) * g.px(58) }, '*θ*', { size: 13, color: TICK, align: 'left', baseline: 'middle' });
  }
  ys.forEach((y, i) => g.circle({ x: SX, y }, 4, { fill: i < N / 2 ? 'position' : 'energyU', color: '#ffffff', width: 1 }));
  g.text({ x: SX - 0.3, y: 0 }, '*a*', { size: 14, color: TICK, align: 'right', baseline: 'middle', dx: -8 });
}

function drawChain(g: Draw, p: P, obs: Obstacles): void {
  const N = p.N;
  const len = CHAIN / N;
  const pts = phasorChain(N, phiOf(p), len);
  const cx0 = chainOrigin(p);
  const O = { x: cx0, y: 0 };
  const at = ([x, y]: [number, number]): Vec2 => ({ x: cx0 + x, y });
  g.line(O, { x: cx0 + CHAIN, y: 0 }, { color: '#c8c8c8', width: 1, dash: [3, 4] });
  obs.seg(O, { x: cx0 + CHAIN, y: 0 }, 0.3);
  // E_m after the end of the line, or above its end when the chain sits far right and the
  // label would reach the I(θ) plot (wide) or the stage edge (narrow).
  const limit = narrow() ? g.vp.toWorld(g.vp.w - 4, 0)[0] : plotRect().x0 - g.px(14);
  const after = cx0 + CHAIN + g.px(36) <= limit;
  const emAt = { x: cx0 + CHAIN, y: 0 };
  if (after) g.text(emAt, '*E*_{m}', { size: 13, color: TICK, align: 'left', baseline: 'middle', dx: 8 });
  else g.text(emAt, '*E*_{m}', { size: 13, color: TICK, align: 'right', baseline: 'middle', dy: -12 });
  const [ex, ey] = g.vp.toPx(emAt.x, emAt.y);
  if (after) obs.box(ex + 4, ey - 10, ex + 34, ey + 10, 2);
  else obs.box(ex - 30, ey - 22, ex + 2, ey - 2, 2);
  for (let k = 0; k < N; k++) {
    const a = at(pts[k]);
    const b = at(pts[k + 1]);
    g.arrow(a, { x: b.x - a.x, y: b.y - a.y }, { role: k < N / 2 ? 'position' : 'energyU', width: 2 });
    obs.seg(a, b, 2);
  }
  const end = at(pts[N]);
  const R = { x: end.x - O.x, y: end.y - O.y };
  if (Math.hypot(R.x, R.y) > g.px(6)) g.arrow(O, R, { role: 'fg', width: 3 });
  obs.seg(O, end, 2);
  g.circle(O, 3, { fill: 'fg' });
  // Label the resultant beside its middle (or beside O when it is short), on the side away from
  // the chain's centre if that is clear, otherwise at the nearest spot that covers nothing.
  let cx = 0;
  let cy = 0;
  for (const q of pts) {
    cx += q[0] / pts.length;
    cy += q[1] / pts.length;
  }
  const C = { x: cx0 + cx, y: cy };
  const mid = { x: O.x + R.x / 2, y: O.y + R.y / 2 };
  const rl = Math.hypot(R.x, R.y);
  let n = rl > g.px(24) ? { x: -R.y / rl, y: R.x / rl } : { x: O.x - C.x, y: O.y - C.y };
  const nl = Math.hypot(n.x, n.y) || 1;
  n = { x: n.x / nl, y: n.y / nl };
  if ((mid.x - C.x) * n.x + (mid.y - C.y) * n.y < 0) n = { x: -n.x, y: -n.y };
  const lp = rl > g.px(24) ? mid : O;
  const [lx, ly] = g.vp.toPx(lp.x, lp.y);
  const hw = 12;
  const hh = 11;
  let best: [number, number] = [lx + n.x * 20, ly - n.y * 20];
  let bestScore = Infinity;
  // Directions: the preferred normal first, then around the circle; distances 20 to 92 px.
  const a0 = Math.atan2(-n.y, n.x);
  for (const d of [20, 30, 44, 64, 92])
    for (let k = 0; k < 12; k++) {
      const a = a0 + (k % 2 ? 1 : -1) * Math.ceil(k / 2) * (Math.PI / 6);
      const x = lx + Math.cos(a) * d;
      const y = ly + Math.sin(a) * d;
      let score = 10 * obs.cost(x - hw, y - hh, x + hw, y + hh) + d / 20 + Math.ceil(k / 2) * 0.1;
      if (x - hw < 2 || x + hw > g.vp.w - 2 || y - hh < 2 || y + hh > g.vp.h - 2) score += 1000;
      if (score < bestScore) {
        bestScore = score;
        best = [x, y];
      }
    }
  const [wx, wy] = g.vp.toWorld(best[0], best[1]);
  g.text({ x: wx, y: wy }, '*E*_{*θ*}', { size: 14, align: 'center', baseline: 'middle' });
  obs.box(best[0] - hw, best[1] - hh, best[0] + hw, best[1] + hh, 2);
  loupe(g, p, cx0, obs);
}

/** Chain extent [px] below which it is also drawn magnified in a loupe (more than two turns on a phone, QA 2026-11-20). */
export const LOUPE_BELOW = 32;
/** Loupe radius [px]. */
const LOUPE_R = 54;

/** Bounding box of the chain points [world], with its centre. */
function chainBox(pts: [number, number][], cx0: number) {
  let x0 = Infinity;
  let x1 = -Infinity;
  let y0 = Infinity;
  let y1 = -Infinity;
  for (const [x, y] of pts) {
    x0 = Math.min(x0, cx0 + x);
    x1 = Math.max(x1, cx0 + x);
    y0 = Math.min(y0, y);
    y1 = Math.max(y1, y);
  }
  return { w: x1 - x0, h: y1 - y0, c: { x: (x0 + x1) / 2, y: (y0 + y1) / 2 } };
}

/**
 * Magnification of the loupe: 0 (no loupe) while the chain spans LOUPE_BELOW px or more, else
 * a whole number (2–12) that makes it about 1.5 loupe radii across.
 */
export function loupeZoom(extentPx: number, scale = 1): number {
  if (!(extentPx < LOUPE_BELOW * scale)) return 0;
  return Math.max(2, Math.min(12, Math.floor((1.5 * LOUPE_R * scale) / Math.max(extentPx, 1e-9))));
}

/**
 * A tightly curled chain (large φ: several turns of N short arrows) is a few pixels across. It is
 * then repeated, magnified z times, in a round loupe beside it, placed where it covers least; a grey
 * ring marks the original and "×z" the magnification. Ratios (E_θ/E_m) are read from the readout.
 */
function loupe(g: Draw, p: P, cx0: number, obs: Obstacles): void {
  const N = p.N;
  const pts = phasorChain(N, phiOf(p), CHAIN / N);
  const box = chainBox(pts, cx0);
  const sc = theme.scale;
  const ext = Math.max(box.w, box.h) * g.vp.scale;
  const z = loupeZoom(ext, sc);
  if (!z) return;
  const R = LOUPE_R * sc;
  const [cx, cy] = g.vp.toPx(box.c.x, box.c.y);
  const ring = ext / 2 + 5 * sc;
  const d = R + ring + 14 * sc;
  let best: [number, number] = [cx, cy - d];
  let bestScore = Infinity;
  for (let k = 0; k < 8; k++) {
    // Above first, then around the circle.
    const a = -Math.PI / 2 + (k % 2 ? 1 : -1) * Math.ceil(k / 2) * (Math.PI / 4);
    const x = cx + Math.cos(a) * d;
    const y = cy + Math.sin(a) * d;
    let score = obs.cost(x - R, y - R, x + R, y + R) + Math.ceil(k / 2) * 0.05;
    if (x - R < 2 || x + R > g.vp.w - 2 || y - R < 2 || y + R > g.vp.h - 2) score += 1000;
    if (score < bestScore) {
      bestScore = score;
      best = [x, y];
    }
  }
  const [lx, ly] = g.vp.toWorld(best[0], best[1]);
  const L = { x: lx, y: ly };
  const rW = R / g.vp.scale;
  const ringW = ring / g.vp.scale;
  const C = box.c;
  // Ring round the original and a connector from it to the loupe.
  const dx = L.x - C.x;
  const dy = L.y - C.y;
  const dl = Math.hypot(dx, dy) || 1;
  g.circle(C, ring / sc, { color: '#9a9a9a', width: 1 });
  g.line({ x: C.x + (dx / dl) * ringW, y: C.y + (dy / dl) * ringW }, { x: L.x - (dx / dl) * rW, y: L.y - (dy / dl) * rW }, { color: '#9a9a9a', width: 1 });
  g.circle(L, LOUPE_R, { fill: '#ffffff', color: '#9a9a9a', width: 1.25 });
  // The chain about its box centre, z times larger; the resultant from its start.
  const at = ([x, y]: [number, number]): Vec2 => ({ x: L.x + (cx0 + x - C.x) * z, y: L.y + (y - C.y) * z });
  for (let k = 0; k < N; k++) {
    const a = at(pts[k]);
    const b = at(pts[k + 1]);
    g.arrow(a, { x: b.x - a.x, y: b.y - a.y }, { role: k < N / 2 ? 'position' : 'energyU', width: 2 });
  }
  const O = at(pts[0]);
  const E = at(pts[N]);
  if (Math.hypot(E.x - O.x, E.y - O.y) > g.px(6)) g.arrow(O, { x: E.x - O.x, y: E.y - O.y }, { role: 'fg', width: 3 });
  g.circle(O, 3, { fill: 'fg' });
  g.text({ x: L.x, y: L.y - rW }, `×${z}`, { size: 12, color: TICK, align: 'center', baseline: 'bottom', dy: -3 });
  obs.box(best[0] - R, best[1] - R, best[0] + R, best[1] + R, 3);
}

function drawPlot(g: Draw, p: P): void {
  const ins = plot(g);
  ins.frame({ xTicks: [-30, 0, 30], yTicks: [0, 1], xLabel: '*θ* (°)', yLabel: '*I*/*I*_{m}' });
  const pts: [number, number][] = [];
  for (let i = 0; i <= 400; i++) {
    const th = -TH_MAX + (2 * TH_MAX * i) / 400;
    pts.push([th, intensity(p, th)]);
  }
  ins.curve(pts, { role: 'fg', width: 1.75 });
  const t1 = firstMin(p.lambda / 1000, p.a) / DEG;
  for (const s of [-1, 1]) {
    if (!(t1 < TH_MAX)) continue;
    const q = ins.P(s * t1, 0);
    g.line(q, { x: q.x, y: q.y + g.px(6) }, { color: TICK, width: 1.25 });
  }
  ins.dot(p.theta, intensity(p), '#1a1a1a', 5.5);
}

/**
 * Σ panel: the first minimum θ₁, the edge-to-edge phase φ, I/I_m of the N-source chain (the
 * readout) and the continuous slit (sin α/α)² it approaches for N → ∞.
 */
export function formulaLines(p: P): string[] {
  const lam = p.lambda / 1000;
  const lines: string[] = [];
  const t1 = firstMin(lam, p.a);
  const ratio = lam / p.a;
  const aa = slider(params.a, p.a);
  if (Number.isNaN(t1)) lines.push(`\\sin\\theta_1 = \\frac{\\lambda}{a} = \\frac{${num(lam)}}{${aa}} = ${tnCmp(ratio, 1)} \\ge 1`);
  else lines.push(`\\theta_1 = \\sin^{-1}\\frac{\\lambda}{a} = \\sin^{-1}\\frac{${num(lam)}}{${aa}} = ${tn(t1 / DEG)}^\\circ`);
  const phi = phiOf(p) / DEG;
  lines.push(`\\phi = \\frac{2\\pi}{\\lambda}\\,a\\sin\\theta = \\frac{360^\\circ}{${num(lam)}}(${aa})\\sin(${slider(params.theta, p.theta)}^\\circ) = ${tn(phi)}^\\circ`);
  const I = intensity(p);
  const h = phi / 2;
  if (Math.abs(h) < 1e-9) {
    lines.push(`\\phi = 0:\\ \\frac{I}{I_m} = ${iTex(I)}`);
    return lines;
  }
  // The chain's resultant E_θ/E_m (the drawn arrow), then I/I_m = (E_θ/E_m)². |sin(φ/2)| = |sin x|
  // with x = |φ/2| − m·180° (|x| ≤ 90°): near a minimum x is small and printed to 3 figures, so the
  // shown sine is not lost in the rounding of φ/2 (180.27° → 180° + 0.274°, R5).
  const H = Math.abs(h);
  const m = Math.round(H / 180);
  const x = Math.abs(H - 180 * m);
  const head = `\\frac{E_\\theta}{E_m} = \\left\\lvert\\frac{\\sin(\\phi/2)}{N\\sin(\\phi/2N)}\\right\\rvert`;
  // A closed chain (I an exact 0): φ/2 is a whole number of 180°, and E_θ = 0.
  const closed = iText(I) === '0';
  const E = closed ? 0 : Math.sqrt(I);
  const xs = closed ? '0' : tn(x);
  // sin(φ/2N) alike: past 90° (large φ, few sources) as sin(180° − φ/2N), so 145.3° is not printed as 145°.
  const y = H / p.N;
  const yr = y > 90 ? 180 - y : y;
  const sub = `= \\frac{\\sin(${xs}^\\circ)}{${p.N}\\sin(${tn(yr)}^\\circ)} = ${closed ? '0' : texOf(fmt(E, 3, 0))}`;
  const red: string[] = [];
  if (m > 0) {
    const turns = m === 1 ? '180^\\circ' : `${m} \\times 180^\\circ`;
    const lhs = h < 0 ? '\\frac{\\lvert\\phi\\rvert}{2}' : '\\frac{\\phi}{2}';
    red.push(`${lhs} = ${turns}${closed ? '' : ` ${H - 180 * m < 0 ? '-' : '+'} ${xs}^\\circ`}`);
  }
  if (y > 90) red.push(`${h < 0 ? '\\frac{\\lvert\\phi\\rvert}{2N}' : '\\frac{\\phi}{2N}'} = 180^\\circ - ${tn(yr)}^\\circ`);
  if (red.length === 1) lines.push(`${head},\\quad ${red[0]}`, sub);
  else lines.push(head, ...(red.length ? [red.join(',\\quad ')] : []), sub);
  // Squared without substituting the rounded E_θ/E_m: squaring doubles its rounding (up to 1 %).
  lines.push(`\\frac{I}{I_m} = \\left(\\frac{E_\\theta}{E_m}\\right)^2 = ${iTex(I)}`);
  lines.push(`N \\to \\infty:\\ \\left(\\frac{\\sin\\alpha}{\\alpha}\\right)^2 = ${iTex(singleSlit(p.a, lam, p.theta * DEG))},\\quad \\alpha = \\frac{\\phi}{2}`);
  return lines;
}

/**
 * I/I_m as printed (readout and Σ): 3 figures, a small value near a minimum in ×10ⁿ, never 0.00
 * (R7b). A closed chain (sin(φ/2) = 0 up to rounding, e.g. a = 1.0 μm, θ = 30.0°) is an exact 0.
 */
export const iText = (I: number) => (Math.abs(I) < 1e-20 ? '0' : fmt(I, 3, 0));
const iTex = (I: number) => texOf(iText(I));

export const phasor: Scene<P, { t: number }> = {
  id: 'phasor',
  title: 'ch36.ph.scene',
  params,
  world: () =>
    narrow() ? { x: [-0.4, 31.6], y: [-22.4, 9], aspect: 'contain', padPx: 12 } : { x: [-0.4, 41.5], y: [-9, 9], aspect: 'contain', padPx: 16 },
  init: () => ({ t: 0 }),

  draw: (g, _s, p) => {
    const obs = new Obstacles(g);
    // The I(θ) plot with its tick and axis labels, kept clear by the chain's labels and loupe.
    const pr = plotRect();
    const [pl, pt] = g.vp.toPx(pr.x0, pr.y1);
    const [prr, pb] = g.vp.toPx(pr.x1, pr.y0);
    obs.box(pl - 30 * theme.scale, pt - 22 * theme.scale, prr + 10 * theme.scale, pb + 36 * theme.scale, 3);
    drawSlit(g, p, obs);
    drawChain(g, p, obs);
    drawPlot(g, p);
  },

  handles: [
    {
      pos: (_s, p) => {
        const r = plotRect();
        return { x: r.x0 + ((p.theta + TH_MAX) / (2 * TH_MAX)) * (r.x1 - r.x0), y: r.y0 + (intensity(p) / 1.1) * (r.y1 - r.y0) };
      },
      radiusPx: 14,
      onDrag: (ctx, _s, w) => {
        const r = plotRect();
        const raw = -TH_MAX + ((w.x - r.x0) / (r.x1 - r.x0)) * 2 * TH_MAX;
        const th = Math.round(Math.min(TH_MAX, Math.max(-TH_MAX, raw)) * 10) / 10;
        if (th !== ctx.params.theta) ctx.set('theta', th);
      },
    },
  ],

  readouts: [
    { label: '\\phi', unit: '°', value: (_s, p) => phiOf(p) / DEG },
    { label: 'I/I_m', unit: '', value: (_s, p) => intensity(p), zeroTol: 0, format: (v) => (iText(v) === '0' ? '0' : undefined) },
  ],

  formula: (_s, p) => formulaLines(p),

  info: {
    goals: ['ch36.ph.goal.chain', 'ch36.ph.goal.min'],
    observe: ['ch36.ph.obs.zero', 'ch36.ph.obs.min', 'ch36.ph.obs.second', 'ch36.ph.obs.a', 'ch36.ph.obs.N'],
    equations: ['\\phi = \\frac{2\\pi}{\\lambda}\\,a\\sin\\theta', 'E_\\theta = E_m\\,\\frac{\\sin(\\phi/2)}{\\phi/2}, \\quad I = I_m\\left(\\frac{\\sin\\alpha}{\\alpha}\\right)^2, \\; \\alpha = \\frac{\\phi}{2}'],
    assumptions: ['ch36.ph.assume.far', 'ch36.ph.assume.draw'],
  },
};
