// Ch 8 scene: energy diagram. A particle moves in U(x) with total energy E (a horizontal line);
// K = E − U is the gap between them. F = −dU/dx is the downhill slope. Without friction E stays
// constant (velocity Verlet); with friction E falls and the turning points close in.
import { t as tr } from '../../core/i18n';
import { fmtTick, niceTicks } from '../../core/format';
import type { ParamSchema, Scene, Vec2 } from '../../core/types';
import type { Draw } from '../../draw/draw';
import { POTENTIALS, equilibria, forbidden, stepParticle, turningPoints, type PotKind, type Potential } from './physics';

type P = { pot: string; friction: boolean; x0s: number[] };

interface S {
  t: number;
  x: number;
  v: number;
  stopped: boolean;
}

const RATE = 240;
const M = 1;
const F_FRICTION = 0.15; // N
const KINDS: PotKind[] = ['double', 'spring', 'hill'];
const Y_LO = -0.9;
const Y_HI = 4.3;
const KF = 0.5; // world units per N
const BAR_X = 3.75;
const BAR_W = 0.32;
const TICK = '#6b6b6b';
const SHADE = '#f0f0f0';

const idx = (p: P) => Math.max(0, KINDS.indexOf(p.pot as PotKind));
const potOf = (p: P): Potential => POTENTIALS[KINDS[idx(p)]];
const x0Of = (p: P) => p.x0s[idx(p)];

const params: ParamSchema<P> = {
  pot: {
    kind: 'select',
    label: 'ch08.e.p.pot',
    desc: 'ch08.e.d.pot',
    group: 'main',
    live: false,
    default: 'double',
    options: [
      { value: 'double', label: 'ch08.e.pot.double' },
      { value: 'spring', label: 'ch08.e.pot.spring' },
      { value: 'hill', label: 'ch08.e.pot.hill' },
    ],
  },
  friction: { kind: 'toggle', label: 'ch08.e.p.friction', desc: 'ch08.e.d.friction', group: 'main', live: true, default: false },
  x0s: { kind: 'array', label: 'ch08.e.p.x0', group: 'hidden', live: false, default: [-2.7, -2.5, 2.9], min: -3.1, max: 3.1 },
};

const energies = (s: S, p: P) => {
  const U = potOf(p).U(s.x);
  const K = 0.5 * M * s.v * s.v;
  return { K, U, E: K + U };
};

/** Clip drawing to the graph box. */
function clipBox(g: Draw, pot: Potential): void {
  const [x0, y0] = g.vp.toPx(pot.lo, Y_HI);
  const [x1, y1] = g.vp.toPx(pot.hi, Y_LO);
  g.ctx.beginPath();
  g.ctx.rect(x0, y0, x1 - x0, y1 - y0);
  g.ctx.clip();
}

export const energyScene: Scene<P, S> = {
  id: 'energy',
  title: 'ch08.e.scene',
  layout: 'side',
  params,
  time: { h: 1 / RATE, recordEvery: 2, frameStep: 0.05, window: 10 },

  world: () => ({ x: [-3.75, 5.3], y: [-1.6, 4.6], aspect: 'contain', padPx: 14 }),

  init: (p) => ({ t: 0, x: x0Of(p), v: 0, stopped: false }),

  step: (s, h, p) => {
    s.t += h;
    stepParticle(potOf(p), s, h, M, p.friction ? F_FRICTION : 0);
  },

  record: (s, p) => {
    const e = energies(s, p);
    return { t: s.t, x: s.x, K: e.K, U: e.U, E: e.E };
  },
  snapshot: (s) => ({ ...s }),

  draw: (g, s, p) => {
    const pot = potOf(p);
    const { K, U, E } = energies(s, p);

    // Forbidden regions (U > E), shaded across the graph height.
    for (const [a, b] of forbidden(pot, E)) {
      g.polygon(
        [
          { x: a, y: Y_LO },
          { x: b, y: Y_LO },
          { x: b, y: Y_HI },
          { x: a, y: Y_HI },
        ],
        { fill: SHADE },
      );
    }

    // Axes.
    g.line({ x: pot.lo, y: Y_LO }, { x: pot.lo, y: Y_HI }, { role: 'axis', width: 1 });
    g.line({ x: pot.lo, y: Y_LO }, { x: pot.hi, y: Y_LO }, { role: 'axis', width: 1 });
    g.line({ x: pot.lo, y: 0 }, { x: pot.hi, y: 0 }, { color: '#c4c4c4', width: 1 });
    for (const y of niceTicks(Y_LO, Y_HI, 5)) {
      g.line({ x: pot.lo, y }, { x: pot.lo - g.px(4), y }, { role: 'axis', width: 1 });
      g.text({ x: pot.lo, y }, fmtTick(y), { size: 11, color: TICK, align: 'right', baseline: 'middle', dx: -7 });
    }
    for (const x of niceTicks(pot.lo, pot.hi, 6)) {
      g.line({ x, y: Y_LO }, { x, y: Y_LO - g.px(4) }, { role: 'axis', width: 1 });
      g.text({ x, y: Y_LO }, fmtTick(x), { size: 11, color: TICK, align: 'center', dy: 16 });
    }
    g.text({ x: pot.hi, y: Y_LO }, '*x* (m)', { size: 12, color: TICK, align: 'right', dy: 32 });
    g.text({ x: pot.lo, y: Y_HI }, `${tr('ch08.e.axis')} (J)`, { size: 12, color: '#1a1a1a', dx: 6, dy: -4 });

    g.ctx.save();
    clipBox(g, pot);
    // U(x) curve and the total-energy line.
    const pts: Vec2[] = [];
    for (let i = 0; i <= 320; i++) {
      const x = pot.lo + ((pot.hi - pot.lo) * i) / 320;
      pts.push({ x, y: pot.U(x) });
    }
    g.polyline(pts, { role: 'energyU', width: 2.5 });
    g.line({ x: pot.lo, y: E }, { x: pot.hi, y: E }, { role: 'energyE', width: 2 });

    // Turning points: where the E line meets U(x) on either side of the particle.
    for (const q of turningPoints(pot, E, s.x)) {
      if (q === null) continue;
      g.line({ x: q, y: Y_LO }, { x: q, y: E }, { color: '#7a7a7a', width: 1, dash: [3, 3] });
      g.circle({ x: q, y: E }, 4, { fill: '#ffffff', color: '#1a1a1a', width: 1.5 });
    }

    // Equilibria: filled = stable (minimum), hollow = unstable (maximum).
    for (const q of equilibria(pot)) {
      const y = pot.U(q.x);
      if (q.stable) g.circle({ x: q.x, y }, 4.5, { fill: '#5c5c5c' });
      else g.circle({ x: q.x, y }, 4.5, { fill: '#ffffff', color: '#5c5c5c', width: 1.5 });
      g.text({ x: q.x, y }, tr(q.stable ? 'ch08.e.stable' : 'ch08.e.unstable'), {
        size: 11,
        color: TICK,
        align: 'center',
        dy: q.stable ? 17 : -11,
      });
    }

    // Tangent at the particle and F = −dU/dx along x.
    const d = pot.dU(s.x);
    const n = Math.hypot(1, d);
    const tl = g.px(34);
    g.line({ x: s.x - tl / n, y: U - (tl * d) / n }, { x: s.x + tl / n, y: U + (tl * d) / n }, { color: '#9a9a9a', width: 1.5 });
    // K = E − U: the gap between the particle and the E line.
    if (K > 1e-6) g.line({ x: s.x, y: U }, { x: s.x, y: E }, { role: 'energyK', width: 4 });
    if (Math.abs(d) > 1e-6) g.arrow({ x: s.x, y: U }, { x: -d * KF, y: 0 }, { role: 'force', width: 2.5, label: '*F*' });
    g.circle({ x: s.x, y: U }, 8, { fill: 'position' });
    g.ctx.restore();

    // Bars K, U, E on the same energy scale.
    g.line({ x: BAR_X - 0.15, y: 0 }, { x: BAR_X + 3 * BAR_W + 0.35, y: 0 }, { role: 'axis', width: 1 });
    const bars: [number, 'energyK' | 'energyU' | 'energyE', string][] = [
      [K, 'energyK', '*K*'],
      [U, 'energyU', '*U*'],
      [E, 'energyE', '*E*'],
    ];
    bars.forEach(([v, role, name], i) => {
      const x = BAR_X + i * (BAR_W + 0.1);
      const top = Math.min(Math.max(v, Y_LO), Y_HI);
      g.polygon(
        [
          { x, y: 0 },
          { x: x + BAR_W, y: 0 },
          { x: x + BAR_W, y: top },
          { x, y: top },
        ],
        { fill: role, fillAlpha: role === 'energyE' ? 0.8 : 0.9 },
      );
      g.text({ x: x + BAR_W / 2, y: Math.min(0, top) }, name, { size: 13, role, align: 'center', dy: 17 });
    });
  },

  handles: [
    {
      pos: (s, p) => ({ x: s.x, y: potOf(p).U(s.x) }),
      radiusPx: 16,
      onDrag: (ctx, _s, w) => {
        const p = ctx.params;
        const x = Math.round(Math.min(3.1, Math.max(-3.1, w.x)) * 20) / 20;
        if (x === x0Of(p)) return;
        const next = [...p.x0s];
        next[idx(p)] = x;
        ctx.set('x0s', next);
      },
    },
  ],

  plots: [
    {
      id: 'E',
      label: 'K,\\ U,\\ E\\,(\\mathrm{J})',
      traces: [
        { channel: 'U', role: 'energyU' },
        { channel: 'K', role: 'energyK' },
        { channel: 'E', role: 'energyE' },
      ],
      yRange: (p) => {
        const pot = potOf(p);
        const E0 = pot.U(x0Of(p));
        const lo = Math.min(0, pot.U(pot.lo), pot.U(pot.hi));
        return [Math.max(lo, Y_LO) - 0.3, E0 + 0.25 * Math.max(E0 - lo, 1)];
      },
    },
    {
      id: 'x',
      label: 'x\\,(\\mathrm{m})',
      traces: [{ channel: 'x', role: 'position' }],
      yRange: () => [-3.4, 3.4],
    },
  ],

  readouts: [
    { label: 'K', unit: 'J', value: (s, p) => energies(s, p).K },
    { label: 'U', unit: 'J', value: (s, p) => energies(s, p).U },
    { label: 'E', unit: 'J', value: (s, p) => energies(s, p).E },
  ],

  info: {
    goals: ['ch08.e.goal.read', 'ch08.e.goal.force'],
    observe: ['ch08.e.obs.const', 'ch08.e.obs.turn', 'ch08.e.obs.eq', 'ch08.e.obs.drag', 'ch08.e.obs.friction'],
    equations: ['E = K + U(x) = \\text{const}', 'F(x) = -\\frac{dU}{dx}, \\quad K = E - U(x) \\ge 0'],
    assumptions: ['ch08.e.assume'],
  },
};
