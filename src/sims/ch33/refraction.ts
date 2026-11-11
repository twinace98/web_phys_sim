// Ch 33 scenes: refraction and total internal reflection at a flat boundary, and an optical
// fibre that guides light by repeated total internal reflection. Ray widths follow intensity.
import { t } from '../../core/i18n';
import type { ParamSchema, Scene, Vec2 } from '../../core/types';
import type { Draw } from '../../draw/draw';
import { TICK } from '../inset/inset';
import { MEDIA, acceptance, coreAngle, criticalAngle, reflectance, snell, wallIncidence, type Fibre } from './physics';

const DEG = Math.PI / 180;
const RAY = '#D55E00';
const MEDIUM = '#56B4E9';

/** Line width for a ray of relative intensity I. */
const widthOf = (I: number) => 0.8 + 4.2 * I;

/** Ray segment with an arrowhead in its middle. */
function ray(g: Draw, a: Vec2, b: Vec2, I: number): void {
  if (I < 0.004) return;
  const w = widthOf(I);
  g.line(a, b, { color: RAY, width: w });
  const len = Math.hypot(b.x - a.x, b.y - a.y);
  if (len < 1e-9) return;
  const m = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
  const u = { x: (b.x - a.x) / len, y: (b.y - a.y) / len };
  const k = g.px(4 + w);
  g.arrow({ x: m.x - u.x * k, y: m.y - u.y * k }, { x: u.x * 2 * k, y: u.y * 2 * k }, { color: RAY, width: w });
}

const rect = (x0: number, y0: number, x1: number, y1: number): Vec2[] => [
  { x: x0, y: y0 },
  { x: x1, y: y0 },
  { x: x1, y: y1 },
  { x: x0, y: y1 },
];

/** Fill tint grows with the refractive index (air: none). */
const tint = (n: number) => Math.min(0.42, (n - 1) * 0.28);

/** Run fn clipped to a world box, so rays stop at its edge. */
function clipped(g: Draw, x0: number, y0: number, x1: number, y1: number, fn: () => void): void {
  const [ax, ay] = g.vp.toPx(x0, y1);
  const [bx, by] = g.vp.toPx(x1, y0);
  g.ctx.save();
  g.ctx.beginPath();
  g.ctx.rect(ax, ay, bx - ax, by - ay);
  g.ctx.clip();
  fn();
  g.ctx.restore();
}

// ------------------------------------------------------------------ refraction

type PR = { n1: string; n2: string; theta: number };

const mediumOptions = ['air', 'water', 'glass', 'diamond'].map((m) => ({ value: m, label: `ch33.m.${m}` }));

const refrParams: ParamSchema<PR> = {
  n1: { kind: 'select', label: 'ch33.p.n1', desc: 'ch33.d.n1', group: 'main', live: true, default: 'glass', options: mediumOptions },
  n2: { kind: 'select', label: 'ch33.p.n2', desc: 'ch33.d.n2', group: 'main', live: true, default: 'air', options: mediumOptions },
  theta: {
    kind: 'number',
    label: 'ch33.p.theta1',
    desc: 'ch33.d.theta1',
    group: 'advanced',
    live: true,
    control: 'slider',
    min: 0,
    max: 89,
    step: 1,
    default: 35,
    unit: '°',
  },
};

const XR = 10;
const YR = 7;
const LR = 6.2; // drawn ray length

function angleLabel(g: Draw, a0: number, a1: number, rPx: number, s: string): void {
  if (Math.abs(a1 - a0) < 1.5 * DEG) return;
  g.arc({ x: 0, y: 0 }, rPx, a0, a1, { color: TICK, width: 1.25 });
  const m = (a0 + a1) / 2;
  g.text({ x: Math.cos(m) * g.px(rPx + 16), y: Math.sin(m) * g.px(rPx + 16) }, s, { size: 13, color: TICK, align: 'center', baseline: 'middle' });
}

export const refraction: Scene<PR, { t: number }> = {
  id: 'refraction',
  title: 'ch33.scene.refraction',
  params: refrParams,
  world: () => ({ x: [-XR, XR], y: [-YR, YR], aspect: 'contain', padPx: 12 }),
  init: () => ({ t: 0 }),

  draw: (g, _s, p) => {
    const n1 = MEDIA[p.n1];
    const n2 = MEDIA[p.n2];
    const th1 = p.theta * DEG;
    const th2 = snell(n1, n2, th1);
    const R = reflectance(n1, n2, th1);
    const tc = criticalAngle(n1, n2);
    g.polygon(rect(-XR, 0, XR, YR), { fill: MEDIUM, fillAlpha: tint(n1) });
    g.polygon(rect(-XR, -YR, XR, 0), { fill: MEDIUM, fillAlpha: tint(n2) });
    g.line({ x: -XR, y: 0 }, { x: XR, y: 0 }, { color: '#5c5c5c', width: 1.5 });
    g.line({ x: 0, y: -YR }, { x: 0, y: YR }, { color: TICK, width: 1, dash: [4, 4] });
    const name = (m: string, n: number) => `${t(`ch33.m.${m}`)}  *n* = ${n.toFixed(2)}`;
    g.text({ x: -XR, y: YR }, name(p.n1, n1), { size: 14, align: 'left', dx: 10, dy: 22 });
    g.text({ x: -XR, y: -YR }, name(p.n2, n2), { size: 14, align: 'left', dx: 10, dy: -12 });

    if (Number.isFinite(tc)) {
      const c = { x: -LR * Math.sin(tc), y: LR * Math.cos(tc) };
      g.line({ x: 0, y: 0 }, c, { color: TICK, width: 1, dash: [2, 4] });
      g.text(c, '*θ*_{c}', { size: 13, color: TICK, align: 'right', baseline: 'middle', dx: -6, dy: -6 });
    }

    const S = { x: -LR * Math.sin(th1), y: LR * Math.cos(th1) };
    ray(g, S, { x: 0, y: 0 }, 1);
    ray(g, { x: 0, y: 0 }, { x: LR * Math.sin(th1), y: LR * Math.cos(th1) }, R);
    if (!Number.isNaN(th2)) ray(g, { x: 0, y: 0 }, { x: LR * Math.sin(th2), y: -LR * Math.cos(th2) }, 1 - R);
    g.circle(S, 9, { fill: '#ffffff', color: RAY, width: 2 });

    angleLabel(g, Math.PI / 2, Math.PI / 2 + th1, 46, '*θ*_{1}');
    if (!Number.isNaN(th2)) angleLabel(g, -Math.PI / 2, -Math.PI / 2 + th2, 46, '*θ*_{2}');
  },

  handles: [
    {
      pos: (_s, p) => ({ x: -LR * Math.sin(p.theta * DEG), y: LR * Math.cos(p.theta * DEG) }),
      radiusPx: 16,
      onDrag: (ctx, _s, w) => {
        const a = Math.round(Math.min(89, Math.max(0, Math.atan2(-w.x, w.y) / DEG)));
        if (a !== ctx.params.theta) ctx.set('theta', a);
      },
    },
  ],

  readouts: [
    { label: '\\theta_2', unit: '°', value: (_s, p) => snell(MEDIA[p.n1], MEDIA[p.n2], p.theta * DEG) / DEG },
    { label: '\\theta_c', unit: '°', value: (_s, p) => criticalAngle(MEDIA[p.n1], MEDIA[p.n2]) / DEG },
    { label: 'R', unit: '%', value: (_s, p) => 100 * reflectance(MEDIA[p.n1], MEDIA[p.n2], p.theta * DEG) },
  ],

  info: {
    goals: ['ch33.r.goal.snell', 'ch33.r.goal.tir'],
    observe: ['ch33.r.obs.drag', 'ch33.r.obs.bend', 'ch33.r.obs.crit', 'ch33.r.obs.media', 'ch33.r.obs.width'],
    equations: ['n_1\\sin\\theta_1 = n_2\\sin\\theta_2', '\\sin\\theta_c = \\frac{n_2}{n_1} \\quad (n_1 > n_2)'],
    assumptions: ['ch33.r.assume.fresnel'],
  },
};

// ------------------------------------------------------------------ optical fibre

type PF = { alpha: number; clad: string };

const N_CORE = 1.5;
const X0 = 6; // entry face
const XF = 31;
const CR = 1.3; // core half-width
const CL = 3.2; // cladding half-width
const LIN = 5;
const FX = 30;
const FY = 6.2;

const fibreOf = (p: PF): Fibre => ({ n1: N_CORE, n2: Number(p.clad), n0: 1 });

const fibreParams: ParamSchema<PF> = {
  alpha: {
    kind: 'number',
    label: 'ch33.p.alpha',
    desc: 'ch33.d.alpha',
    group: 'main',
    live: true,
    control: 'slider',
    min: 0,
    max: 80,
    step: 1,
    default: 15,
    unit: '°',
  },
  clad: {
    kind: 'select',
    label: 'ch33.p.clad',
    desc: 'ch33.d.clad',
    group: 'main',
    live: true,
    default: '1.46',
    options: [
      { value: '1.46', label: 'ch33.clad.glass' },
      { value: '1.33', label: 'ch33.clad.water' },
      { value: '1', label: 'ch33.clad.air' },
    ],
  },
};

export type Layer = 'core' | 'clad' | 'out';

export interface Seg {
  a: Vec2;
  b: Vec2;
  I: number;
  /** Medium the segment runs in. */
  layer: Layer;
}

/** A boundary hit: where, the incidence angle from the normal, both media, and the refraction angle. */
export interface Hit {
  at: Vec2;
  inc: number;
  from: Layer;
  to: Layer;
  nFrom: number;
  nTo: number;
  /** Refraction angle, NaN under total internal reflection (then only the reflected branch). */
  out: number;
}

const MAX_SEGS = 1200;
const I_MIN = 0.004;

/**
 * Ray tree in a straight fibre: core |y| < CR (n1), cladding CR < |y| < CL (n2), outside (n0).
 * Every boundary splits a ray into a Fresnel-reflected branch and a Snell-refracted one (only the
 * reflected one under total internal reflection), so n·cos(angle to the axis) is the same in
 * every layer. A ray ends at the far end XF or, outside the fibre, at the stage edge. Branches
 * weaker than the line-drawing threshold are dropped; the strongest are traced first.
 */
export function traceRays(f: Fibre, alpha: number): { segs: Seg[]; hits: Hit[] } {
  const nOf = (L: Layer) => (L === 'core' ? f.n1 : L === 'clad' ? f.n2 : f.n0);
  const beta = coreAngle(f, alpha);
  type Ray = { p: Vec2; ux: number; uy: number; I: number; L: Layer };
  const queue: Ray[] = [{ p: { x: X0, y: 0 }, ux: Math.cos(beta), uy: Math.sin(beta), I: 1 - reflectance(f.n0, f.n1, alpha), L: 'core' }];
  const segs: Seg[] = [];
  const hits: Hit[] = [];
  while (queue.length && segs.length < MAX_SEGS) {
    let k = 0;
    for (let i = 1; i < queue.length; i++) if (queue[i].I > queue[k].I) k = i;
    const { p, ux, uy, I, L } = queue.splice(k, 1)[0];
    if (L === 'out') {
      // Straight on to the stage edge.
      const tx = (FX - p.x) / ux;
      const ty = Math.abs(uy) < 1e-12 ? Infinity : (Math.sign(uy) * FY - p.y) / uy;
      const t = Math.max(0, Math.min(tx, ty));
      segs.push({ a: p, b: { x: p.x + ux * t, y: p.y + uy * t }, I, layer: L });
      continue;
    }
    // Next boundary along the ray: the core wall, or the inner or outer cladding edge.
    const s = Math.sign(uy);
    let yB = NaN;
    let to: Layer = L;
    if (s !== 0 && L === 'core') {
      yB = s * CR;
      to = 'clad';
    } else if (s !== 0) {
      const outward = Math.sign(p.y) === s;
      yB = outward ? s * CL : -s * CR;
      to = outward ? 'out' : 'core';
    }
    const xB = Number.isNaN(yB) ? Infinity : p.x + ((yB - p.y) / uy) * ux;
    if (xB >= XF) {
      segs.push({ a: p, b: { x: XF, y: p.y + ((XF - p.x) / ux) * uy }, I, layer: L });
      continue;
    }
    const at = { x: xB, y: yB };
    segs.push({ a: p, b: at, I, layer: L });
    const nFrom = nOf(L);
    const nTo = nOf(to);
    const inc = Math.acos(Math.min(1, Math.abs(uy)));
    const out = snell(nFrom, nTo, inc);
    const R = reflectance(nFrom, nTo, inc);
    hits.push({ at, inc, from: L, to, nFrom, nTo, out });
    if (I * R > I_MIN) queue.push({ p: at, ux, uy: -uy, I: I * R, L });
    if (!Number.isNaN(out) && I * (1 - R) > I_MIN) queue.push({ p: at, ux: Math.sin(out), uy: s * Math.cos(out), I: I * (1 - R), L: to });
  }
  return { segs, hits };
}

/** The scene's ray tree split into core segments and those that left the core. */
export function traceFibre(p: PF): { guided: Seg[]; escaped: Seg[]; hits: Hit[] } {
  const { segs, hits } = traceRays(fibreOf(p), p.alpha * DEG);
  return { guided: segs.filter((s) => s.layer === 'core'), escaped: segs.filter((s) => s.layer !== 'core'), hits };
}

/**
 * n1 and n2 left of the entry face, beside the core and the cladding. On a small stage the
 * core is too thin for a label beside it, clear of the input ray and its knob: the labels
 * then stack above the fibre, each with a leader into its layer (near the face, where no ray
 * or leaking branch passes).
 */
export function indexLabels(g: Draw, f: Fibre): 'beside' | 'leader' {
  const n1 = `*n*_{1} = ${f.n1.toFixed(2)}`;
  const n2 = `*n*_{2} = ${f.n2.toFixed(2)}`;
  if (CR / g.px(1) >= 24) {
    g.text({ x: X0, y: CR / 2 }, n1, { size: 13, align: 'right', baseline: 'middle', dx: -8 });
    g.text({ x: X0, y: (CR + CL) / 2 }, n2, { size: 13, align: 'right', baseline: 'middle', dx: -8 });
    return 'beside';
  }
  const lead = { color: TICK, width: 1 };
  const rows: [string, number, number, number][] = [
    // label, row height above the fibre [px], leader x past the face [px], leader end y
    [n1, 14, 4, 0.75 * CR],
    [n2, 34, 10, (CR + CL) / 2],
  ];
  for (const [s, dy, dx, yEnd] of rows) {
    const y = CL + g.px(dy);
    const xl = X0 + g.px(dx);
    g.polyline(
      [
        { x: X0 - g.px(6), y },
        { x: xl, y },
        { x: xl, y: yEnd },
      ],
      lead,
    );
    g.circle({ x: xl, y: yEnd }, 2, { fill: TICK });
    g.text({ x: X0, y }, s, { size: 13, align: 'right', baseline: 'middle', dx: -9 });
  }
  return 'leader';
}

export const fibre: Scene<PF, { t: number }> = {
  id: 'fibre',
  title: 'ch33.scene.fibre',
  params: fibreParams,
  world: () => ({ x: [0, FX], y: [-FY, FY], aspect: 'contain', padPx: 12 }),
  init: () => ({ t: 0 }),

  draw: (g, _s, p) => {
    const f = fibreOf(p);
    g.polygon(rect(X0, -CL, XF, CL), { fill: MEDIUM, fillAlpha: tint(f.n2), color: '#9a9a9a', width: 1 });
    g.polygon(rect(X0, -CR, XF, CR), { fill: MEDIUM, fillAlpha: tint(f.n1), color: '#5c5c5c', width: 1.25 });
    indexLabels(g, f);

    const a = p.alpha * DEG;
    const S = { x: X0 - LIN * Math.cos(a), y: -LIN * Math.sin(a) };
    g.line({ x: X0 - LIN, y: 0 }, { x: X0, y: 0 }, { color: TICK, width: 1, dash: [4, 4] });
    const { guided, escaped } = traceFibre(p);
    clipped(g, 0, -FY, FX, FY, () => {
      for (const sg of escaped) ray(g, sg.a, sg.b, sg.I);
      ray(g, S, { x: X0, y: 0 }, 1);
      for (const sg of guided) ray(g, sg.a, sg.b, sg.I);
    });
    g.circle(S, 9, { fill: '#ffffff', color: RAY, width: 2 });
    // Angle arc and label well inside the handle's radius LIN, so the knob never covers them.
    const lin = LIN / g.px(1);
    const arcR = Math.min(40, 0.4 * lin);
    const labR = Math.min(56, 0.58 * lin);
    if (a > 1.5 * DEG) {
      g.arc({ x: X0, y: 0 }, arcR, Math.PI, Math.PI + a, { color: TICK, width: 1.25 });
      // Inside the wedge when it is wide enough for the glyph, otherwise just below the ray.
      const la = 2 * labR * Math.sin(a / 2) >= 24 ? a / 2 : a + 20 * DEG;
      g.text({ x: X0 - Math.cos(la) * g.px(labR), y: -Math.sin(la) * g.px(labR) }, '*α*', { size: 13, color: TICK, align: 'center', baseline: 'middle' });
    }
  },

  handles: [
    {
      pos: (_s, p) => ({ x: X0 - LIN * Math.cos(p.alpha * DEG), y: -LIN * Math.sin(p.alpha * DEG) }),
      radiusPx: 16,
      onDrag: (ctx, _s, w) => {
        const a = Math.round(Math.min(80, Math.max(0, Math.atan2(-w.y, X0 - w.x) / DEG)));
        if (a !== ctx.params.alpha) ctx.set('alpha', a);
      },
    },
  ],

  readouts: [
    { label: '\\theta', unit: '°', value: (_s, p) => wallIncidence(fibreOf(p), p.alpha * DEG) / DEG },
    { label: '\\theta_c', unit: '°', value: (_s, p) => criticalAngle(N_CORE, Number(p.clad)) / DEG },
    { label: '\\alpha_\\text{max}', unit: '°', value: (_s, p) => acceptance(fibreOf(p)) / DEG },
  ],

  info: {
    goals: ['ch33.f.goal.tir', 'ch33.f.goal.accept'],
    observe: ['ch33.f.obs.guided', 'ch33.f.obs.leak', 'ch33.f.obs.clad'],
    equations: ['\\sin\\theta_c = \\frac{n_2}{n_1}', '\\sin\\alpha_\\text{max} = \\sqrt{n_1^2 - n_2^2}'],
    assumptions: ['ch33.f.assume.flat', 'ch33.r.assume.fresnel'],
  },
};
