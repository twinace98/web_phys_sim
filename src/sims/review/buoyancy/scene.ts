// Buoyancy: a cube in a tank of fluid. Drag it, release it, and it bobs and settles at the depth
// where F_b = F_g (lightly damped), or sinks to the floor. Forces at their points of application,
// the displaced volume hatched, the level rising, and the face pressures that make F_b.
import type { ParamSchema, Scene, Vec2 } from '../../../core/types';
import { t } from '../../../core/i18n';
import { UI_FONT, theme } from '../../../draw/theme';
import type { Draw } from '../../../draw/draw';
import { paren, tn } from '../../../core/tex';
import { sigFit } from '../../ch07/sigfit';
import { printed } from '../../ch31/fit';
import { texNum } from '../../field/render';
import {
  GRAV,
  TANK,
  blockArea,
  blockVolume,
  buoyancy,
  drag,
  faces,
  levelAt,
  normal,
  step,
  viewTop,
  weight,
  yMax,
  type Block,
  type Fluid,
  type Motion,
} from './physics';

type P = { rhoO: number; rhoF: number; a: number; press: boolean };
type S = Motion & { t: number; held: boolean };

/** Named fluids [kg/m³]; water is the default and the reference. */
export const FLUIDS: Record<string, number> = { water: 1000, sea: 1025, oil: 920, glycerin: 1260, mercury: 13600 };
/** A fluid is named on the stage when ρ_f is within this fraction of its density. */
export const NAME_TOL = 0.01;

/** The listed fluid whose density ρ_f matches (within 1 %), or null. */
export function fluidName(rho: number): string | null {
  for (const [k, v] of Object.entries(FLUIDS)) if (Math.abs(rho - v) <= NAME_TOL * v) return k;
  return null;
}
const FLUID_FILL: Record<string, string> = { oil: '#f4ecc8', mercury: '#d9dcdf', glycerin: '#e6eef4' };
const WATER = '#dcebf6';
const FORCE = '#CC79A7';
const WALL = '#5c5c5c';
const INK = '#1a1a1a';
const HATCH = '#0072B2';
const PRESS = '#6b6b6b';
const LABEL = '#5c5c5c';
/** World bottom [m]: room below the floor for long weight arrows of a block resting there. */
const Y0 = -0.1;

const params: ParamSchema<P> = {
  rhoO: {
    kind: 'number',
    label: 'buoyancy.p.rhoO',
    desc: 'buoyancy.d.rhoO',
    group: 'main',
    live: true,
    control: 'slider',
    log: true,
    sig: 3,
    min: 50,
    max: 20000,
    default: 600,
    unit: 'kg/m³',
  },
  rhoF: {
    kind: 'number',
    label: 'buoyancy.p.rhoF',
    desc: 'buoyancy.d.rhoF',
    group: 'main',
    live: true,
    control: 'slider',
    log: true,
    sig: 3,
    min: 500,
    max: 15000,
    // Water.
    default: FLUIDS.water,
    unit: 'kg/m³',
  },
  a: { kind: 'number', label: 'buoyancy.p.a', desc: 'buoyancy.d.a', group: 'advanced', live: false, control: 'slider', min: 0.1, max: 0.4, step: 0.01, default: 0.2, unit: 'm' },
  press: { kind: 'toggle', label: 'buoyancy.p.press', desc: 'buoyancy.d.press', group: 'advanced', live: true, default: true },
};

export const blockOf = (p: P): Block => ({ a: p.a, rho: p.rhoO });
export const fluidOf = (p: P): Fluid => ({ rho: p.rhoF });

/** Grey of the block: darker for denser material (log scale 50 → 20000 kg/m³). */
function blockFill(rho: number): string {
  const u = Math.min(1, Math.max(0, Math.log(rho / 50) / Math.log(400)));
  const c = Math.round(235 - 85 * u);
  return `rgb(${c},${c},${c})`;
}

const rect = (x0: number, y0: number, x1: number, y1: number): Vec2[] => [
  { x: x0, y: y0 },
  { x: x1, y: y0 },
  { x: x1, y: y1 },
  { x: x0, y: y1 },
];

/** Diagonal hatching of a world rectangle (the displaced fluid volume). */
function hatch(g: Draw, x0: number, y0: number, x1: number, y1: number): void {
  const { ctx } = g;
  const [ax, ay] = g.vp.toPx(x0, y1);
  const [bx, by] = g.vp.toPx(x1, y0);
  if (by - ay < 0.5) return;
  ctx.save();
  ctx.beginPath();
  ctx.rect(ax, ay, bx - ax, by - ay);
  ctx.clip();
  ctx.fillStyle = 'rgba(0,114,178,0.14)';
  ctx.fillRect(ax, ay, bx - ax, by - ay);
  ctx.strokeStyle = HATCH;
  ctx.globalAlpha = 0.55;
  ctx.lineWidth = 1;
  const sp = 7;
  ctx.beginPath();
  for (let x = ax - (by - ay); x < bx; x += sp) {
    ctx.moveTo(x, by);
    ctx.lineTo(x + (by - ay), ay);
  }
  ctx.stroke();
  ctx.restore();
}

/** Forces on the block now [N]. */
export function forcesOf(s: Motion, p: P) {
  const b = blockOf(p);
  const f = fluidOf(p);
  const Fb = buoyancy(b, f, s.y);
  const Fg = weight(b);
  const Fd = drag(b, f, s.y, s.v);
  const N = normal(b, f, s);
  return { Fb, Fg, Fd, N, net: Fb + Fd + N - Fg };
}

export function formulaLines(s: Motion & { held?: boolean }, p: P): string[] {
  const b = blockOf(p);
  const f = fluidOf(p);
  const { s: sub } = levelAt(b, s.y);
  const A = blockArea(b);
  const V = blockVolume(b);
  const Vsub = A * sub;
  const { Fb, Fg, Fd, N, net } = forcesOf(s, p);
  const fc = faces(b, f, s.y);
  const n = (v: number, sig = 3) => texNum(v, sig);
  // Each line's inputs with the figures its arithmetic needs to give the printed result.
  const s1 = sigFit([f.rho, Vsub], (r, v) => r * v * GRAV, Fb);
  const s2 = sigFit([b.rho, V], (r, v) => r * v * GRAV, Fg);
  // Gauge pressures (p − p0 = ρ_f g d; p0 cancels) on the bottom and top faces, in Pa: Pa·m² = N.
  const s3 = sigFit([fc.pBot, fc.pTop, A], (pb, pt, a) => (pb - pt) * a, fc.F);
  const pa = (v: number) => (v === 0 ? '0' : n(v, s3));
  const out = [
    `F_b = \\rho_f V_\\text{sub}\\, g = (${n(f.rho, s1)})(${n(Vsub, s1)})(${GRAV}) = ${n(Fb)}\\ \\mathrm{N}`,
    `F_g = \\rho_\\text{obj} V g = (${n(b.rho, s2)})(${n(V, s2)})(${GRAV}) = ${n(Fg)}\\ \\mathrm{N}`,
    `F_b = (p_\\text{bot} - p_\\text{top})A = (${pa(fc.pBot)} - ${pa(fc.pTop)})\\ \\mathrm{Pa} \\times ${n(A, s3)}\\ \\mathrm{m^2} = ${n(fc.F)}\\ \\mathrm{N}`,
  ];
  const ratio = b.rho / f.rho;
  const sr = sigFit([b.rho, f.rho], (o, fl) => o / fl, ratio);
  out.push(
    ratio < 1
      ? `\\frac{V_\\text{sub}}{V}\\Big|_\\text{eq} = \\frac{\\rho_\\text{obj}}{\\rho_f} = \\frac{${n(b.rho, sr)}}{${n(f.rho, sr)}} = ${n(ratio)}`
      : `\\frac{\\rho_\\text{obj}}{\\rho_f} = \\frac{${n(b.rho, sr)}}{${n(f.rho, sr)}} = ${n(ratio)} ${ratio > 1 ? '> 1' : '= 1'}`,
  );
  // Held by the pointer: the hand supplies whatever balances the other forces, so F_net = 0.
  const withHand = !!s.held && Math.abs(net) > 1e-6 * Fg;
  const hand = withHand ? -net : 0;
  // Below 5 mN the net force prints as 0 (the terms then sum to under 0.005 N).
  const total = withHand || Math.abs(net) < 0.005 ? 0 : net;
  const hasD = Math.abs(Fd) > 1e-9;
  const hasN = N > 0;
  const xs = [Fb, Fg, Fd, N, hand];
  const sumOf = (...v: number[]) => v[0] - v[1] + v[2] + v[3] + v[4];
  // A result on a decimal tie (147.15 − 196.20 = −49.05) gets a fourth figure.
  let rs = 3;
  let sn = sigFit(xs, sumOf, total, rs);
  const shows = (k: number) => tn(sumOf(...xs.map((x) => printed(x, k))), rs) === tn(total, rs);
  while (total !== 0 && rs < 5 && !shows(sn)) sn = sigFit(xs, sumOf, total, ++rs);
  const terms = [`F_b - F_g`, hasD ? '+ F_d' : '', hasN ? '+ N' : '', withHand ? `+ F_\\text{${t('buoyancy.hand')}}` : ''].join(' ');
  const vals = [
    `${n(Fb, sn)} - ${n(Fg, sn)}`,
    hasD ? `${Fd < 0 ? '-' : '+'} ${n(Math.abs(Fd), sn)}` : '',
    hasN ? `+ ${n(N, sn)}` : '',
    withHand ? `+ ${paren(n(hand, sn))}` : '',
  ].join(' ');
  out.push(`F_\\text{net} = ${terms.replace(/ +/g, ' ').trim()} = ${vals.replace(/ +/g, ' ').trim()} = ${n(total, rs)}\\ \\mathrm{N}`);
  return out;
}

export const buoyancyScene: Scene<P, S> = {
  id: 'buoyancy',
  title: 'buoyancy.scene',
  params,
  world: (p) => ({ x: [-0.47, 0.53], y: [Y0, viewTop(p.a)], aspect: 'contain', padPx: 8 }),
  time: { h: 0.0005, recordEvery: 20, frameStep: 0.02, window: 10 },
  init: () => ({ t: 0, y: TANK.h0, v: 0, held: false }),

  step: (s, h, p) => {
    s.t += h;
    if (s.held) {
      s.v = 0;
      return;
    }
    step(blockOf(p), fluidOf(p), s, h);
  },

  record: (s, p) => {
    const b = blockOf(p);
    return { t: s.t, f: levelAt(b, s.y).s / b.a };
  },

  plots: [{ id: 'frac', label: 'V_\\text{sub}/V', traces: [{ channel: 'f', role: 'position' }], yRange: () => [0, 1.05] }],

  drawPlot: (id, pd, p, ui) => {
    if (id !== 'frac') return;
    const r = blockOf(p).rho / fluidOf(p).rho;
    if (r >= 1) return;
    const t1 = Math.max(ui.t, 10);
    pd.polyline(
      [
        [Math.max(0, t1 - 10), r],
        [t1, r],
      ],
      { color: INK, width: 1.25, dash: [5, 4] },
    );
  },

  draw: (g, s, p, ui) => {
    // A block held by the pointer does not move under the forces; released, it does.
    s.held = !!ui.drag;
    const b = blockOf(p);
    const f = fluidOf(p);
    const { L, s: sub } = levelAt(b, s.y);
    const hw = TANK.W / 2;
    const half = b.a / 2;

    // Fluid, the level without the block (dashed), the tank.
    const name = fluidName(f.rho);
    g.polygon(rect(-hw, 0, hw, L), { fill: (name && FLUID_FILL[name]) || (f.rho >= 5000 ? FLUID_FILL.mercury : WATER) });
    // Name of the fluid (water by default) in the lower left corner of the tank; under the floor
    // instead where a large block low in the tank would cover it (narrow screens).
    if (name) {
      const txt = t(`buoyancy.fluid.${name}`);
      g.ctx.save();
      g.ctx.font = `${13 * theme.scale}px ${UI_FONT}`;
      const wPx = g.ctx.measureText(txt).width / theme.scale;
      g.ctx.restore();
      const clash = -hw + g.px(8 + wPx + 4) > -half && s.y < g.px(26);
      const at = clash ? { x: -hw, y: -g.px(6) } : { x: -hw + g.px(8), y: g.px(8) };
      g.text(at, txt, { size: 13, color: LABEL, align: 'left', baseline: clash ? 'top' : 'bottom' });
    }
    g.line({ x: -hw, y: L }, { x: hw, y: L }, { color: HATCH, width: 1.5 });
    g.line({ x: hw, y: TANK.h0 }, { x: hw + 0.05, y: TANK.h0 }, { color: WALL, width: 1.25, dash: [4, 3] });
    g.text({ x: hw + 0.055, y: TANK.h0 }, '*h*_{0}', { size: 13, color: INK, align: 'left', baseline: 'middle' });
    g.polyline(
      [
        { x: -hw, y: TANK.H },
        { x: -hw, y: 0 },
        { x: hw, y: 0 },
        { x: hw, y: TANK.H },
      ],
      { color: WALL, width: 3 },
    );

    // Block, its submerged part hatched, centre of mass (dot) and centre of buoyancy (ring).
    g.polygon(rect(-half, s.y, half, s.y + b.a), { fill: blockFill(b.rho), color: WALL, width: 1.5 });
    if (sub > 0) hatch(g, -half, s.y, half, s.y + sub);
    g.polygon(rect(-half, s.y, half, s.y + b.a), { color: WALL, width: 1.5 });
    const com = { x: 0, y: s.y + half };
    const cob = { x: 0, y: s.y + sub / 2 };

    // Face pressures (gauge): arrows pushing on the top and bottom faces, length ∝ ρ_f g d.
    if (p.press) {
      const pMax = f.rho * GRAV * (TANK.h0 + b.a ** 3 / (TANK.W * TANK.W));
      const fc = faces(b, f, s.y);
      for (const x of [-0.4 * b.a, 0.4 * b.a]) {
        const lb = g.px(46) * (fc.pBot / pMax);
        const lt = g.px(46) * (fc.pTop / pMax);
        if (lb > g.px(4)) g.arrow({ x, y: s.y - lb }, { x: 0, y: lb }, { color: PRESS, width: 1.25 });
        if (lt > g.px(4)) g.arrow({ x, y: s.y + b.a + lt }, { x: 0, y: -lt }, { color: PRESS, width: 1.25 });
      }
    }

    // Forces at their points of application, a shared linear scale; drawn 7 px either side of
    // the centre line so that F_b and F_g do not cover each other.
    // Scale: 100 px for the larger of F_g and the largest F_b of free bobbing (≤ 2 F_g, ≤ ρ_f V g);
    // a light block pushed deep has F_b beyond that, cut at 1.8 times the scale (stated in ⓘ).
    const { Fb: FbNow, Fg, N } = forcesOf(s, p);
    const fMax = Math.max(Fg, Math.min(f.rho * GRAV * blockVolume(b), 2 * Fg));
    const Fb = Math.min(FbNow, 1.8 * fMax);
    const room = com.y - Y0 - g.px(22);
    // At most 100 px, and in proportion to the block on a small stage (1.5 a, not under 40 px).
    const len = Math.min(g.px(100), Math.max(g.px(40), 1.5 * b.a));
    const k = Math.max(0, Math.min(len, room)) / fMax;
    const dx = g.px(7);
    // Labels sit beside the arrow tips (F_g, F_b to the right, N to the left), so they stay apart.
    const label = (x: number, y: number, s: string, side: 1 | -1) =>
      g.text({ x: x + side * g.px(5), y }, s, { size: 13, color: FORCE, align: side > 0 ? 'left' : 'right', baseline: 'middle' });
    // Weight (a force at a distance) dashed, contact forces solid, as in every free-body diagram.
    g.arrow({ x: com.x - dx, y: com.y }, { x: 0, y: -Fg * k }, { color: FORCE, width: 2.5, dash: [5, 3] });
    // Where the two tips meet (a light block floating high), F_g goes to the left of its arrow.
    const yG = com.y - Fg * k + g.px(4);
    const yB = cob.y + Fb * k - g.px(4);
    label(com.x - dx, yG, '*F*_{g}', Fb * k > g.px(2) && Math.abs(yG - yB) < g.px(16) ? -1 : 1);
    if (Fb * k > g.px(2)) {
      g.arrow({ x: cob.x + dx, y: cob.y }, { x: 0, y: Fb * k }, { color: FORCE, width: 2.5 });
      label(cob.x + dx, cob.y + Fb * k - g.px(4), '*F*_{b}', 1);
    }
    if (N * k > g.px(2)) {
      g.arrow({ x: -0.25 * b.a, y: s.y }, { x: 0, y: N * k }, { color: FORCE, width: 2.5 });
      label(-0.25 * b.a, s.y + (N * k) / 2, '*N*', -1);
    }
    g.circle(com, 3.5, { fill: INK });
    if (sub > 0) g.circle(cob, 3.5, { fill: '#ffffff', color: HATCH, width: 1.75 });
  },

  handles: [
    {
      radiusPx: 30,
      pos: (s, p) => ({ x: 0, y: s.y + p.a / 2 }),
      onDrag: (_ctx, s, w) => {
        const b = blockOf(_ctx.params);
        s.y = Math.min(yMax(b), Math.max(0, w.y - b.a / 2));
        s.v = 0;
        s.held = true;
      },
    },
  ],

  readouts: [
    { label: 'V_\\text{sub}/V', unit: '', value: (s, p) => levelAt(blockOf(p), s.y).s / p.a, sig: 3 },
    { label: 'F_b', unit: 'N', value: (s, p) => buoyancy(blockOf(p), fluidOf(p), s.y) },
    { label: 'F_g', unit: 'N', value: (_s, p) => weight(blockOf(p)) },
  ],

  formula: (s, p) => formulaLines(s, p),

  info: {
    goals: ['buoyancy.goal.arch', 'buoyancy.goal.float'],
    observe: ['buoyancy.obs.drag', 'buoyancy.obs.frac', 'buoyancy.obs.sink', 'buoyancy.obs.jump', 'buoyancy.obs.press', 'buoyancy.obs.level', 'buoyancy.obs.fluid', 'buoyancy.obs.period'],
    equations: [
      'F_b = \\rho_f V_\\text{sub}\\, g, \\quad F_g = \\rho_\\text{obj} V g',
      'p = p_0 + \\rho_f g d, \\quad F_b = (p_\\text{bot} - p_\\text{top})A',
      '\\frac{V_\\text{sub}}{V} = \\frac{\\rho_\\text{obj}}{\\rho_f}\\ \\ (\\rho_\\text{obj} < \\rho_f)',
      'T = 2\\pi\\sqrt{\\frac{m}{k}}, \\quad k = \\rho_f g A \\frac{A_t}{A_t - A}',
    ],
    assumptions: ['buoyancy.as.fluidname', 'buoyancy.as.tank', 'buoyancy.as.damp', 'buoyancy.as.fluid', 'buoyancy.as.floor', 'buoyancy.as.arrows'],
  },
};
