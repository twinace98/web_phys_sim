// Ch 13 scene: launch a probe from a given altitude with a speed set as a fraction of the local
// escape speed, and drag its direction. The sign of E = K + U decides: ellipse, parabola or
// hyperbola. The dashed circle around the probe is the escape speed at its current distance.
import { t as tr } from '../../core/i18n';
import type { ParamSchema, Scene, Vec2 } from '../../core/types';
import type { Draw } from '../../draw/draw';
import { ROLE_COLOR } from '../../draw/theme';
import { GM, R_EARTH, classify, elements, energy, escapeSpeed, radius, speed, yoshida, type Body, type OrbitKind, type V2 } from './physics';

type P = { speed: string; alt: number; dir: number; predict: boolean; areas: boolean; ueff: boolean };

interface S {
  t: number;
  n: number;
}

const H = 20; // physics step [s]
const SUB = 8; // Yoshida substeps per physics step (2.5 s)
const MASS = 1000; // probe mass [kg], for K, U, E in GJ
const MM = 1e6; // world unit: 10³ km
const DEG = Math.PI / 180;
const FRACTION: Record<string, number> = { '0.5': 0.5, '0.6': 0.6, circ: Math.SQRT1_2, '0.85': 0.85, esc: 1, '1.2': 1.2 };
const EARTH_FILL = '#dce8f2';
const EARTH_LINE = '#8fb3cf';
const SECTOR_FILL = ['#E69F00', '#56B4E9'];

const fraction = (p: P) => FRACTION[p.speed] ?? 0.85;
const r0Of = (p: P) => R_EARTH + p.alt * 1e3;

/** Launch on the left of the Earth; dir = angle from the counter-clockwise tangent towards outward radial. */
function launch(p: P): Body {
  const r0 = r0Of(p);
  const v = fraction(p) * escapeSpeed(r0);
  const d = p.dir * DEG;
  // At (−r0, 0): tangent (0, −1), outward radial (−1, 0).
  return { x: [-r0, 0], v: [-Math.sin(d) * v, -Math.cos(d) * v] };
}

/** View half-size: covers every orbit with this energy whatever the direction, so dragging never rescales. */
const GAUGE = 0.6; // escape-speed circle at launch, as a fraction of r0

/**
 * View box [m]: the orbit of a horizontal launch, the Earth and the launch gauge. It depends on
 * speed and altitude only, never on the dragged direction, so dragging never rescales the view.
 */
function viewBox(p: P): { x: [number, number]; y: [number, number] } {
  const r0 = r0Of(p);
  const f = fraction(p);
  const g0 = GAUGE * r0;
  if (f >= 1) return { x: [-r0 - g0, 2.4 * r0], y: [-2.6 * r0, 1.2 * r0] };
  // Horizontal launch: the launch point is one apsis, the other is at r0 f²/(1 − f²).
  const r1 = (r0 * f * f) / (1 - f * f);
  const b = Math.sqrt(r0 * r1);
  const x0 = -r0 - g0;
  const x1 = Math.max(r1, R_EARTH);
  const y = Math.max(b, R_EARTH, g0);
  const mx = 0.08 * (x1 - x0);
  return { x: [x0 - mx, x1 + mx], y: [-y - mx, y + mx] };
}

/** An escaping probe is stopped just before it leaves the view box. */
function outside(p: P, x: V2): boolean {
  const v = viewBox(p);
  const m = -0.02 * (v.x[1] - v.x[0]);
  return x[0] < v.x[0] - m || x[0] > v.x[1] + m || x[1] < v.y[0] - m || x[1] > v.y[1] + m;
}

interface Model {
  b0: Body;
  kind: OrbitKind;
  /** Positions [m] and velocities [m/s] at every physics step. */
  xs: Float64Array;
  vs: Float64Array;
  N: number;
  crashed: boolean;
  period: number;
  sectorDt: number;
  rMax: number;
  /** Largest speed and escape speed reached [m/s]. */
  vMax: number;
  /** Plot range of the specific energies [J/kg]. */
  eMin: number;
  eMax: number;
}

let memoKey = '';
let memo: Model | null = null;
function model(p: P): Model {
  const key = `${p.speed}|${p.alt}|${p.dir}`;
  if (key === memoKey && memo) return memo;
  const b0 = launch(p);
  const kind = p.speed === 'esc' ? 'parabola' : classify(b0);
  const el = elements(b0);
  const r0 = r0Of(p);
  const tCirc = 2 * Math.PI * Math.sqrt(r0 ** 3 / GM);
  const tMax = kind === 'ellipse' ? 3 * el.period : 4 * tCirc;
  const nMax = Math.ceil(tMax / H);
  const xs = new Float64Array(2 * (nMax + 1));
  const vs = new Float64Array(2 * (nMax + 1));
  const b: Body = { x: [...b0.x], v: [...b0.v] };
  xs.set(b.x, 0);
  vs.set(b.v, 0);
  let N = nMax;
  let crashed = false;
  let rMax = radius(b);
  let rMin = radius(b);
  let vMax = speed(b);
  for (let n = 1; n <= nMax; n++) {
    for (let k = 0; k < SUB; k++) yoshida(b, H / SUB);
    const r = radius(b);
    if (r <= R_EARTH) {
      // Stop on the surface along the last direction.
      b.x = [(b.x[0] * R_EARTH) / r, (b.x[1] * R_EARTH) / r];
      crashed = true;
    }
    xs.set(b.x, 2 * n);
    vs.set(b.v, 2 * n);
    rMax = Math.max(rMax, radius(b));
    rMin = Math.min(rMin, radius(b));
    vMax = Math.max(vMax, speed(b));
    if (crashed || (kind !== 'ellipse' && outside(p, b.x))) {
      N = n;
      break;
    }
  }
  const E = energy(b0);
  memo = {
    b0,
    kind,
    xs,
    vs,
    N,
    crashed,
    period: el.period,
    sectorDt: (kind === 'ellipse' ? el.period : tCirc) / 12,
    rMax,
    vMax: Math.max(vMax, escapeSpeed(rMin)),
    eMin: Math.min(-GM / rMin, E),
    eMax: Math.max(0.5 * vMax * vMax, E, 0),
  };
  memoKey = key;
  return memo;
}

function bodyAt(p: P, n: number): Body {
  const m = model(p);
  const i = 2 * Math.min(n, m.N);
  return { x: [m.xs[i], m.xs[i + 1]], v: [m.vs[i], m.vs[i + 1]] };
}

const w = (x: number[] | Float64Array, i: number): Vec2 => ({ x: x[i] / MM, y: x[i + 1] / MM });

const params: ParamSchema<P> = {
  speed: {
    kind: 'select',
    label: 'ch13.p.speed',
    desc: 'ch13.d.speed',
    group: 'main',
    live: false,
    default: '0.85',
    options: [
      { value: '0.5', label: 'ch13.speed.05' },
      { value: '0.6', label: 'ch13.speed.06' },
      { value: 'circ', label: 'ch13.speed.circ' },
      { value: '0.85', label: 'ch13.speed.085' },
      { value: 'esc', label: 'ch13.speed.esc' },
      { value: '1.2', label: 'ch13.speed.12' },
    ],
  },
  alt: { kind: 'number', label: 'ch13.p.alt', desc: 'ch13.d.alt', group: 'main', live: false, control: 'select', choices: [2000, 6000, 12000], default: 6000, unit: 'km' },
  dir: { kind: 'number', label: 'ch13.p.dir', group: 'hidden', live: false, control: 'slider', min: -90, max: 90, default: 0 },
  predict: { kind: 'toggle', label: 'ch13.p.predict', desc: 'ch13.d.predict', group: 'advanced', live: true, default: true },
  areas: { kind: 'toggle', label: 'ch13.p.areas', desc: 'ch13.d.areas', group: 'advanced', live: true, default: false },
  ueff: { kind: 'toggle', label: 'ch13.p.ueff', desc: 'ch13.d.ueff', group: 'advanced', live: true, default: false },
};

/**
 * Energy diagram in the lower-right corner of the stage (screen px): effective potential
 * U_eff(r) = −GMm/r + L²/(2mr²), the level E, and the current r. Where E meets U_eff the probe
 * turns around (periapsis, apoapsis); the gap E − U_eff is the radial kinetic energy.
 */
function effectivePotential(g: Draw, p: P, rNow: number): void {
  const m = model(p);
  const h = m.b0.x[0] * m.b0.v[1] - m.b0.x[1] * m.b0.v[0];
  const E = energy(m.b0);
  const U = (r: number) => -GM / r + (h * h) / (2 * r * r);
  const r0 = R_EARTH;
  const r1 = Math.max(m.rMax, 2 * r0Of(p)) * 1.15;
  let uMin = 0;
  for (let i = 0; i <= 100; i++) uMin = Math.min(uMin, U(r0 + ((r1 - r0) * i) / 100));
  const y0 = Math.min(uMin, E) * 1.15;
  const y1 = Math.max(E, 0) + 0.35 * Math.abs(y0);
  const ctx = g.ctx;
  const W = 210;
  const Hh = 130;
  const bx = g.vp.w - W - 12;
  const by = g.vp.h - Hh - 12;
  const X = (r: number) => bx + 10 + ((r - r0) / (r1 - r0)) * (W - 20);
  const Y = (u: number) => by + 22 + ((y1 - u) / (y1 - y0)) * (Hh - 32);
  ctx.save();
  ctx.fillStyle = 'rgba(255,255,255,0.92)';
  ctx.strokeStyle = '#d0d0d0';
  ctx.lineWidth = 1;
  ctx.fillRect(bx, by, W, Hh);
  ctx.strokeRect(bx + 0.5, by + 0.5, W, Hh);
  // r axis at U = 0.
  ctx.strokeStyle = '#c4c4c4';
  ctx.beginPath();
  ctx.moveTo(X(r0), Y(0));
  ctx.lineTo(X(r1), Y(0));
  ctx.stroke();
  ctx.beginPath();
  ctx.rect(bx + 1, by + 1, W - 2, Hh - 2);
  ctx.clip();
  ctx.strokeStyle = ROLE_COLOR.energyU;
  ctx.lineWidth = 2;
  ctx.setLineDash([5, 3]);
  ctx.beginPath();
  for (let i = 0; i <= 120; i++) {
    const r = r0 + ((r1 - r0) * i) / 120;
    if (i) ctx.lineTo(X(r), Y(U(r)));
    else ctx.moveTo(X(r), Y(U(r)));
  }
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.strokeStyle = ROLE_COLOR.energyE;
  ctx.beginPath();
  ctx.moveTo(X(r0), Y(E));
  ctx.lineTo(X(r1), Y(E));
  ctx.stroke();
  // Current r: from U_eff(r) up to E is the radial kinetic energy.
  const xr = X(Math.min(rNow, r1));
  ctx.strokeStyle = ROLE_COLOR.energyK;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(xr, Y(U(rNow)));
  ctx.lineTo(xr, Y(E));
  ctx.stroke();
  ctx.fillStyle = ROLE_COLOR.position;
  ctx.beginPath();
  ctx.arc(xr, Y(E), 4, 0, 2 * Math.PI);
  ctx.fill();
  ctx.restore();
  const at = (x: number, y: number): Vec2 => {
    const [wx, wy] = g.vp.toWorld(x, y);
    return { x: wx, y: wy };
  };
  // Labels at the right end: E on the side of its line away from the U_eff tail, U_eff on the
  // side of the tail away from E.
  const tailAbove = U(r1) > E;
  const clampY = (y: number) => Math.min(Math.max(y, by + 14), by + Hh - 5);
  g.text(at(bx + W - 8, clampY(Y(U(r1)) + (tailAbove ? -6 : 15))), '*U*_{eff}', { size: 12, role: 'energyU', align: 'right' });
  g.text(at(bx + W - 8, clampY(Y(E) + (tailAbove ? 15 : -6))), '*E*', { size: 12, color: '#1a1a1a', align: 'right' });
  g.text(at(bx + W - 8, Y(0) - 5), '*r*', { size: 12, color: '#6b6b6b', align: 'right' });
}

/** World length per m/s of velocity: the escape-speed circle at launch is GAUGE r0. */
const kv = (p: P) => (GAUGE * r0Of(p)) / MM / escapeSpeed(r0Of(p));

function sectors(g: Draw, p: P, n: number): void {
  const m = model(p);
  const at = (k: number) => Math.round((k * m.sectorDt) / H);
  const nEnd = Math.min(n, m.kind === 'ellipse' ? at(12) : m.N);
  for (let k = 0; at(k + 1) <= nEnd; k++) {
    const pts: Vec2[] = [{ x: 0, y: 0 }];
    for (let i = at(k); i <= at(k + 1); i++) pts.push(w(m.xs, 2 * i));
    g.polygon(pts, { fill: SECTOR_FILL[k % 2], fillAlpha: 0.25 });
  }
}

export const orbitScene: Scene<P, S> = {
  id: 'orbit',
  title: 'ch13.o.scene',
  params,
  time: { h: H, recordEvery: 2, frameStep: 200, scale: 4000, tEnd: (p) => model(p as P).N * H },

  world: (p) => {
    const v = viewBox(p);
    return { x: [v.x[0] / MM, v.x[1] / MM], y: [v.y[0] / MM, v.y[1] / MM], aspect: 'contain', padPx: 12 };
  },

  init: () => ({ t: 0, n: 0 }),
  step: (s, _h, p) => {
    s.n = Math.min(s.n + 1, model(p).N);
    s.t = s.n * H;
  },

  record: (s, p) => {
    const b = bodyAt(p, s.n);
    const r = radius(b);
    const v = speed(b);
    const K = (0.5 * MASS * v * v) / 1e9;
    const U = (-GM * MASS) / r / 1e9;
    return { t: s.t, r: r / MM, v: v / 1e3, vesc: escapeSpeed(r) / 1e3, K, U, E: K + U };
  },
  snapshot: (s) => ({ ...s }),

  draw: (g, s, p) => {
    const m = model(p);
    const O: Vec2 = { x: 0, y: 0 };
    if (p.areas) sectors(g, p, s.n);

    // Earth.
    const earth: Vec2[] = [];
    for (let i = 0; i < 96; i++) earth.push({ x: (R_EARTH / MM) * Math.cos((i / 96) * 2 * Math.PI), y: (R_EARTH / MM) * Math.sin((i / 96) * 2 * Math.PI) });
    g.polygon(earth, { fill: EARTH_FILL, color: EARTH_LINE, width: 1.25 });
    g.circle(O, 2, { fill: EARTH_LINE });

    // Predicted path (dotted) and path flown so far (solid).
    if (p.predict) {
      const pts: Vec2[] = [];
      const step = Math.max(1, Math.floor(m.N / 1500));
      for (let i = 0; i <= m.N; i += step) pts.push(w(m.xs, 2 * i));
      pts.push(w(m.xs, 2 * m.N));
      g.polyline(pts, { color: '#8c8c8c', width: 1.5, dash: [3, 5] });
    }
    const flown: Vec2[] = [];
    const step = Math.max(1, Math.floor(s.n / 1500));
    for (let i = 0; i < s.n; i += step) flown.push(w(m.xs, 2 * i));
    flown.push(w(m.xs, 2 * s.n));
    g.polyline(flown, { role: 'position', width: 1.75, alpha: 0.7 });

    const k = kv(p);
    const L0 = w(m.b0.x, 0);
    if (s.n > 0) {
      // Launch point and launch velocity stay draggable while the probe flies.
      g.arrow(L0, { x: m.b0.v[0] * k, y: m.b0.v[1] * k }, { role: 'velocity', width: 1.25, alpha: 0.4 });
      g.circle(L0, 3.5, { fill: '#ffffff', role: 'position', width: 1.25 });
    } else {
      g.circle({ x: L0.x + m.b0.v[0] * k, y: L0.y + m.b0.v[1] * k }, 14, { fill: 'velocity', alpha: 0.12 });
    }

    const b = bodyAt(p, s.n);
    const P0 = w(b.x, 0);
    const r = radius(b);
    // Escape-speed gauge: velocity arrow inside the circle ⇔ bound.
    const rg = escapeSpeed(r) * k;
    const ring: Vec2[] = [];
    for (let i = 0; i <= 72; i++) ring.push({ x: P0.x + rg * Math.cos((i / 72) * 2 * Math.PI), y: P0.y + rg * Math.sin((i / 72) * 2 * Math.PI) });
    g.polyline(ring, { role: 'velocity', width: 1, dash: [4, 4], alpha: 0.55 });
    // Gauge label beside the circle, perpendicular to v on the side away from the Earth:
    // clear of both the velocity arrow and the path, which curves towards the Earth.
    const sp = speed(b) || 1;
    let ux = -b.v[1] / sp;
    let uy = b.v[0] / sp;
    if (ux * b.x[0] + uy * b.x[1] < 0) {
      ux = -ux;
      uy = -uy;
    }
    // Near the edge of the stage, use the other side.
    const [lx, ly] = g.vp.toPx(P0.x + ux * (rg + g.px(10)), P0.y + uy * (rg + g.px(10)));
    if (lx < 30 || lx > g.vp.w - 30 || ly < 30 || ly > g.vp.h - 12) {
      ux = -ux;
      uy = -uy;
    }
    g.text({ x: P0.x + ux * (rg + g.px(10)), y: P0.y + uy * (rg + g.px(10)) }, '*v*_{esc}', {
      size: 12,
      role: 'velocity',
      align: ux > 0.4 ? 'left' : ux < -0.4 ? 'right' : 'center',
      baseline: 'middle',
    });

    if (m.crashed && s.n >= m.N) {
      const d = g.px(6);
      g.line({ x: P0.x - d, y: P0.y - d }, { x: P0.x + d, y: P0.y + d }, { color: '#1a1a1a', width: 2.5 });
      g.line({ x: P0.x - d, y: P0.y + d }, { x: P0.x + d, y: P0.y - d }, { color: '#1a1a1a', width: 2.5 });
    } else {
      g.arrow(P0, { x: b.v[0] * k, y: b.v[1] * k }, { role: 'velocity', width: 2.5, label: '*v*' });
      g.circle(P0, 6, { fill: 'position' });
    }

    // Orbit type from the sign of E.
    const name = tr(`ch13.kind.${m.kind}`) + (m.crashed ? ` · ${tr('ch13.kind.crash')}` : '');
    g.screenText(14, 22, name, { size: 13, color: '#1a1a1a' });

    if (p.ueff) effectivePotential(g, p, r);
  },

  handles: [
    {
      pos: (_s, p) => {
        const m = model(p);
        const k = kv(p);
        const L0 = w(m.b0.x, 0);
        return { x: L0.x + m.b0.v[0] * k, y: L0.y + m.b0.v[1] * k };
      },
      radiusPx: 16,
      onDrag: (ctx, _s, q) => {
        const L0 = { x: -r0Of(ctx.params) / MM, y: 0 };
        // Angle from the tangent (0, −1) towards the outward radial (−1, 0).
        const dx = q.x - L0.x;
        const dy = q.y - L0.y;
        let dir = Math.round(Math.atan2(-dx, -dy) / DEG);
        dir = Math.max(-90, Math.min(90, dir));
        if (dir !== ctx.params.dir) ctx.set('dir', dir);
      },
    },
  ],

  plots: [
    { id: 'r', label: 'r\\,(10^3\\,\\mathrm{km})', traces: [{ channel: 'r', role: 'position' }], yRange: (p) => [0, (model(p).rMax / MM) * 1.1] },
    {
      id: 'v',
      label: `\\textcolor{${ROLE_COLOR.velocity}}{v},\\ \\textcolor{${ROLE_COLOR.muted}}{v_\\mathrm{esc}}\\,(\\mathrm{km/s})`,
      traces: [
        { channel: 'vesc', role: 'muted' },
        { channel: 'v', role: 'velocity' },
      ],
      yRange: (p) => [0, (model(p).vMax / 1e3) * 1.08],
    },
    {
      id: 'E',
      label: `\\textcolor{${ROLE_COLOR.energyK}}{K},\\ \\textcolor{${ROLE_COLOR.energyU}}{U},\\ E\\,(\\mathrm{GJ})`,
      traces: [
        { channel: 'K', role: 'energyK' },
        { channel: 'U', role: 'energyU' },
        { channel: 'E', role: 'energyE' },
      ],
      yRange: (p) => {
        const m = model(p);
        const lo = (MASS * m.eMin) / 1e9;
        const hi = (MASS * m.eMax) / 1e9;
        const pad = 0.08 * (hi - lo);
        return [lo - pad, hi + pad];
      },
    },
  ],

  readouts: [
    { label: 'v', unit: 'km/s', value: (s, p) => speed(bodyAt(p, s.n)) / 1e3 },
    { label: 'v_\\mathrm{esc}', unit: 'km/s', value: (s, p) => escapeSpeed(radius(bodyAt(p, s.n))) / 1e3 },
    { label: 'E', unit: 'GJ', value: (_s, p) => (MASS * energy(model(p).b0)) / 1e9 },
  ],

  info: {
    goals: ['ch13.o.goal.law', 'ch13.o.goal.E', 'ch13.o.goal.esc'],
    observe: ['ch13.o.obs.dir', 'ch13.o.obs.circ', 'ch13.o.obs.gauge', 'ch13.o.obs.energy', 'ch13.o.obs.crash', 'ch13.o.obs.kepler'],
    equations: [
      'F = \\frac{GMm}{r^2}, \\quad U = -\\frac{GMm}{r}',
      'E = K + U = \\tfrac{1}{2}mv^2 - \\frac{GMm}{r}',
      'v_\\mathrm{esc} = \\sqrt{\\frac{2GM}{r}}, \\quad v_\\mathrm{circ} = \\sqrt{\\frac{GM}{r}} = \\frac{v_\\mathrm{esc}}{\\sqrt 2}',
    ],
    assumptions: ['ch13.o.assume', 'ch13.o.assume.num'],
  },
};

