// Ch 4 scene: uniform circular motion. Constant speed, turning velocity, centripetal a = v²/r.
// A velocity circle (hodograph) beside the path shows where a comes from.
import { t } from '../../core/i18n';
import type { ParamSchema, Scene, Vec2 } from '../../core/types';
import { centripetal, circularAt, period, type Circular } from './physics';

type P = { r: number; v: number; hodo: boolean };

const R_MAX = 3;
const KV = 0.35; // world m per (m/s), same on the path and in the velocity circle
const KA = 0.2; // world m per (m/s²)
const HX = R_MAX + 2.2; // centre of the velocity circle
const GREY = '#9a9a9a';
const LABEL = '#6b6b6b';

const params: ParamSchema<P> = {
  r: {
    kind: 'number',
    label: 'ch04.c.p.r',
    desc: 'ch04.c.d.r',
    group: 'main',
    live: false,
    control: 'select',
    choices: [1, 2, 3],
    default: 2,
    unit: 'm',
  },
  v: {
    kind: 'number',
    label: 'ch04.c.p.v',
    desc: 'ch04.c.d.v',
    group: 'main',
    live: false,
    control: 'select',
    choices: [1, 2, 3],
    default: 2,
    unit: 'm/s',
  },
  hodo: { kind: 'toggle', label: 'ch04.c.p.hodo', desc: 'ch04.c.d.hodo', group: 'advanced', live: true, default: true },
};

const circ = (p: P): Circular => ({ r: p.r, v: p.v });

export const circular: Scene<P, { t: number }> = {
  id: 'circular',
  title: 'ch04.c.scene',
  params,
  time: { h: 1 / 120, recordEvery: 4, frameStep: 0.05 },
  world: (p) => ({
    x: [-R_MAX - 0.8, p.hodo ? HX + KV * 3 + 0.8 : R_MAX + 0.8],
    y: [-R_MAX - 0.8, R_MAX + 0.8],
    aspect: 'contain',
    padPx: 20,
  }),
  init: () => ({ t: 0 }),
  step: (s, h) => {
    s.t += h;
  },

  draw: (g, s, p) => {
    const c = circ(p);
    const k = circularAt(c, s.t);
    const O: Vec2 = { x: 0, y: 0 };
    const P0: Vec2 = { x: k.x, y: k.y };

    const ring: Vec2[] = [];
    for (let i = 0; i <= 96; i++) ring.push({ x: c.r * Math.cos((i / 96) * 2 * Math.PI), y: c.r * Math.sin((i / 96) * 2 * Math.PI) });
    g.polyline(ring, { color: GREY, width: 1.25 });
    g.line(O, P0, { color: '#c8c8c8', width: 1, dash: [3, 4] });
    g.circle(O, 3, { fill: GREY });
    // r labelled beside the middle of the radius line, on its counter-clockwise side.
    const ang = Math.atan2(k.y, k.x) + Math.PI / 2;
    g.text({ x: k.x / 2 + Math.cos(ang) * g.px(12), y: k.y / 2 + Math.sin(ang) * g.px(12) }, '*r*', { size: 13, color: LABEL, align: 'center', baseline: 'middle' });

    g.arrow(P0, { x: k.vx * KV, y: k.vy * KV }, { role: 'velocity', width: 2.5, label: '*v*' });
    g.arrow(P0, { x: k.ax * KA, y: k.ay * KA }, { role: 'acceleration', width: 2.5, label: '*a*' });
    g.circle(P0, 8, { fill: 'position' });

    if (p.hodo) {
      // Velocity circle: every velocity vector drawn from one point. Its tip moves along the
      // circle, in the direction of a, so a ⊥ v and |a| = ω v = v²/r.
      const H: Vec2 = { x: HX, y: 0 };
      const rv = c.v * KV;
      const hring: Vec2[] = [];
      for (let i = 0; i <= 64; i++) hring.push({ x: HX + rv * Math.cos((i / 64) * 2 * Math.PI), y: rv * Math.sin((i / 64) * 2 * Math.PI) });
      g.polyline(hring, { color: GREY, width: 1, dash: [3, 4] });
      g.circle(H, 3, { fill: GREY });
      const tip: Vec2 = { x: HX + k.vx * KV, y: k.vy * KV };
      g.arrow(H, { x: k.vx * KV, y: k.vy * KV }, { role: 'velocity', width: 2.5, label: '*v*' });
      g.arrow(tip, { x: k.ax * KA, y: k.ay * KA }, { role: 'acceleration', width: 2, label: '*a*' });
      g.text({ x: HX, y: rv }, t('ch04.c.hodo.title'), { size: 12, color: LABEL, align: 'center', dy: -40 });
    }
  },

  readouts: [
    { label: 'v', unit: 'm/s', value: (_s, p) => p.v },
    { label: 'a', unit: 'm/s²', value: (_s, p) => centripetal(circ(p)) },
    { label: 'T', unit: 's', value: (_s, p) => period(circ(p)) },
  ],

  info: {
    goals: ['ch04.c.goal.dir', 'ch04.c.goal.a'],
    observe: ['ch04.c.obs.perp', 'ch04.c.obs.hodo', 'ch04.c.obs.scale', 'ch04.c.obs.T'],
    equations: ['a = \\frac{v^2}{r}, \\quad \\vec a \\perp \\vec v', 'T = \\frac{2\\pi r}{v}'],
  },
};
