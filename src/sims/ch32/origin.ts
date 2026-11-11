// Ch 32 scene: where atomic magnetism comes from. An orbiting electron is a current loop,
// hence a magnetic dipole μ (opposite to L, the electron is negative); the electron's spin
// carries its own moment μ_s, opposite to S.
import { t } from '../../core/i18n';
import type { ParamSchema, Scene, Vec2, WorldSpec } from '../../core/types';
import type { Draw } from '../../draw/draw';
import { TICK } from '../inset/inset';
import { A0, V1, orbit } from './physics';

type P = { dir: string; spin: string };

const ORB = orbit(A0, V1);
/** Orbital period in fs. */
const T_FS = ORB.T * 1e15;
const MU = '#009E73';
const GREY = '#8c8c8c';
const L_COL = '#5c5c5c';

const RX = 3.3;
const RY = 1.0;

const narrow = () => typeof window !== 'undefined' && window.matchMedia('(max-width: 767px)').matches;

/**
 * Orbit centre OC and spinning electron SC: side by side on a wide stage, stacked (orbit on
 * top) on a narrow one, where side by side would leave both figures small in a tall stage.
 */
export function layout(isNarrow: boolean): { OC: Vec2; SC: Vec2; world: WorldSpec } {
  return isNarrow
    ? { OC: { x: 0, y: 4.6 }, SC: { x: 0, y: -4.4 }, world: { x: [-4.9, 5.1], y: [-8.8, 8.2], aspect: 'contain', padPx: 12 } }
    : { OC: { x: -5, y: 0 }, SC: { x: 5.2, y: 0 }, world: { x: [-10, 10.2], y: [-4.4, 3.6], aspect: 'contain', padPx: 12 } };
}

const params: ParamSchema<P> = {
  dir: {
    kind: 'select',
    label: 'ch32.o.p.dir',
    desc: 'ch32.o.d.dir',
    group: 'main',
    live: true,
    default: 'ccw',
    options: [
      { value: 'ccw', label: 'ch32.o.dir.ccw' },
      { value: 'cw', label: 'ch32.o.dir.cw' },
    ],
  },
  spin: {
    kind: 'select',
    label: 'ch32.o.p.spin',
    desc: 'ch32.o.d.spin',
    group: 'main',
    live: true,
    default: 'up',
    options: [
      { value: 'up', label: 'ch32.o.spin.up' },
      { value: 'down', label: 'ch32.o.spin.down' },
    ],
  },
};

/** Point on a horizontal circle seen slightly from above (an ellipse); φ = −90° is nearest. */
const onEllipse = (c: Vec2, rx: number, ry: number, phi: number): Vec2 => ({ x: c.x + rx * Math.cos(phi), y: c.y + ry * Math.sin(phi) });

function ellipse(g: Draw, c: Vec2, rx: number, ry: number, from: number, to: number, st: Parameters<Draw['polyline']>[1]): void {
  const pts: Vec2[] = [];
  for (let k = 0; k <= 48; k++) pts.push(onEllipse(c, rx, ry, from + ((to - from) * k) / 48));
  g.polyline(pts, st);
}

/** Charge disc with its sign. */
function charge(g: Draw, p: Vec2, rPx: number, sign: 1 | -1): void {
  g.circle(p, rPx, { fill: sign > 0 ? 'positive' : 'negative' });
  g.text(p, sign > 0 ? '+' : '−', { size: rPx * 1.6, color: '#ffffff', align: 'center', baseline: 'middle', weight: 700 });
}

/** Dipole field lines r = k sin²θ in the vertical plane, θ from the moment direction m (±1). */
function dipoleLines(g: Draw, c: Vec2, m: number): void {
  for (const k of [2.4, 3.8]) {
    for (const side of [-1, 1]) {
      const pts: Vec2[] = [];
      for (let i = 0; i <= 60; i++) {
        const th = 0.32 + ((Math.PI - 0.64) * i) / 60;
        const r = k * Math.sin(th) ** 2;
        pts.push({ x: c.x + side * r * Math.sin(th), y: c.y + m * r * Math.cos(th) });
      }
      g.polyline(pts, { color: '#c4c4c4', width: 1.25 });
      // Outside the loop the field points opposite to μ.
      const eq = { x: c.x + side * k, y: c.y };
      g.arrow({ x: eq.x, y: eq.y + m * g.px(5) }, { x: 0, y: -m * g.px(10) }, { color: '#b0b0b0', width: 1.25 });
    }
  }
}

function vec(g: Draw, from: Vec2, dy: number, color: string, label: string, dashed: boolean): void {
  g.arrow(from, { x: 0, y: dy }, { color, width: dashed ? 2 : 3, dash: dashed ? [5, 4] : undefined });
  g.text({ x: from.x, y: from.y + dy }, label, { size: 15, color, align: 'left', baseline: 'middle', dx: 10, dy: dy > 0 ? 6 : -6 });
}

export const origin: Scene<P, { t: number }> = {
  id: 'origin',
  title: 'ch32.o.scene',
  params,
  time: { h: 0.0005, recordEvery: 50, frameStep: 0.01, scale: 0.05, unit: 'fs' },
  world: () => layout(narrow()).world,
  init: () => ({ t: 0 }),
  step: (s, h) => {
    s.t += h;
  },

  draw: (g, s, p) => {
    const { OC, SC } = layout(narrow());
    // ---- orbit: electron, current I, moment μ, angular momentum L
    const d = p.dir === 'ccw' ? 1 : -1;
    const phi = -Math.PI / 2 + (d * 2 * Math.PI * s.t) / T_FS;
    dipoleLines(g, OC, -d);
    ellipse(g, OC, RX, RY, 0, Math.PI, { color: GREY, width: 1.25, dash: [4, 4] });
    vec(g, { x: OC.x, y: OC.y + 0.25 * d }, 2.6 * d, L_COL, '*L*', true);
    charge(g, OC, 9, 1);
    vec(g, { x: OC.x, y: OC.y - 0.25 * d }, -2.6 * d, MU, '*μ*', false);
    ellipse(g, OC, RX, RY, Math.PI, 2 * Math.PI, { color: GREY, width: 1.75 });
    // Current: opposite to the electron's motion, drawn on the near side, right of μ.
    const pc = -Math.PI / 2 + 0.75;
    const at = onEllipse(OC, RX, RY, pc);
    const tg = { x: RX * Math.sin(pc) * d, y: -RY * Math.cos(pc) * d };
    const tl = Math.hypot(tg.x, tg.y);
    g.arrow({ x: at.x - (tg.x / tl) * 0.45, y: at.y - (tg.y / tl) * 0.45 }, { x: (tg.x / tl) * 0.9, y: (tg.y / tl) * 0.9 }, { color: '#1a1a1a', width: 2.5 });
    g.text(at, '*I*', { size: 15, align: 'center', dy: 24 });
    const e = onEllipse(OC, RX, RY, phi);
    const ve = { x: -RX * Math.sin(phi) * d, y: RY * Math.cos(phi) * d };
    const vl = Math.hypot(ve.x, ve.y);
    g.arrow(e, { x: (ve.x / vl) * 1.1, y: (ve.y / vl) * 1.1 }, { role: 'velocity', width: 2, label: '*v*' });
    charge(g, e, 7, -1);
    g.text({ x: OC.x, y: OC.y - 4.4 }, t('ch32.o.orbit'), { size: 14, color: TICK, align: 'center', dy: -6 });

    // ---- spin: S and its moment μ_s
    const u = p.spin === 'up' ? 1 : -1;
    const spinPhi = -Math.PI / 2 + (u * 2 * Math.PI * s.t) / (0.6 * T_FS);
    ellipse(g, SC, 1.55, 0.42, 0, Math.PI, { color: GREY, width: 1.25, dash: [3, 3] });
    vec(g, { x: SC.x, y: SC.y + 1.0 * u }, 1.8 * u, L_COL, '*S*', true);
    const disc: Vec2[] = [];
    for (let k = 0; k <= 40; k++) disc.push({ x: SC.x + 0.95 * Math.cos((k / 40) * 2 * Math.PI), y: SC.y + 0.95 * Math.sin((k / 40) * 2 * Math.PI) });
    g.polygon(disc, { fill: 'negative', fillAlpha: 0.9 });
    g.text(SC, '−', { size: 22, color: '#ffffff', align: 'center', baseline: 'middle', weight: 700 });
    ellipse(g, SC, 1.55, 0.42, Math.PI, 2 * Math.PI, { color: GREY, width: 1.75 });
    const sp = onEllipse(SC, 1.55, 0.42, spinPhi);
    if (Math.sin(spinPhi) < 0) g.circle(sp, 3.5, { fill: GREY });
    const fr = onEllipse(SC, 1.55, 0.42, -Math.PI / 2);
    g.arrow({ x: fr.x - u * 0.3, y: fr.y }, { x: u * 0.6, y: 0 }, { color: GREY, width: 1.75 });
    vec(g, { x: SC.x, y: SC.y - 1.0 * u }, -1.8 * u, MU, '*μ*_{s}', false);
    g.text({ x: SC.x, y: SC.y - 4.4 }, t('ch32.o.spin'), { size: 14, color: TICK, align: 'center', dy: -6 });
  },

  readouts: [
    { label: 'I', unit: 'mA', value: () => ORB.I * 1e3 },
    // fmt() prints |v| < 1e-9 as 0, so the tiny SI values carry their power of ten in the unit.
    { label: '\\mu = IA', unit: '×10⁻²⁴ J/T', value: () => ORB.mu * 1e24 },
    { label: 'L', unit: '×10⁻³⁴ J·s', value: () => ORB.L * 1e34 },
  ],

  info: {
    goals: ['ch32.o.goal.loop', 'ch32.o.goal.spin'],
    observe: ['ch32.o.obs.current', 'ch32.o.obs.ratio', 'ch32.o.obs.dir', 'ch32.o.obs.spin', 'ch32.o.obs.cancel'],
    equations: ['I = \\frac{e}{T} = \\frac{ev}{2\\pi r}, \\quad \\mu = IA = \\frac{evr}{2}', '\\vec\\mu_\\text{orb} = -\\frac{e}{2m}\\vec L, \\quad \\vec\\mu_s = -\\frac{e}{m}\\vec S', '\\mu_B = \\frac{e\\hbar}{2m} = 9.27\\times10^{-24}\\ \\text{J/T}'],
    assumptions: ['ch32.o.assume.bohr', 'ch32.o.assume.spin', 'ch32.o.assume.time'],
  },
};
