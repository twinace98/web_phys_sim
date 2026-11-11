// Ch 17 scene: Doppler effect. A point source emits a circular wavefront once per period.
// Moving source: fronts crowd ahead and spread behind; at v_s > v they form the Mach cone.
// Moving observers: the fronts stay concentric, but A meets them more often than B.
import type { ParamSchema, Scene, Vec2 } from '../../core/types';
import { color } from '../../draw/theme';
import { fronts, heard, machAngle, observerX, sourceX, type Doppler } from './physics';

type P = { who: string; vs: number; vo: number };

const V = 340;
const F = 100; // λ = 3.4 m
const W = 40; // half-width of the view [m]
const H = 20;
const RUN = 48; // distance travelled by the source (or by A) during one run [m]
const FRONT = '#8c8c8c';
const KV = 6 / V; // world m per (m/s) for velocity arrows

function cfg(p: P): Doppler {
  const src = p.who === 'source';
  const vs = src ? p.vs : 0;
  const vo = src ? 0 : p.vo;
  return {
    v: V,
    f: F,
    vs,
    xs0: src && vs > 0 ? -0.6 * W : 0,
    vo,
    xA0: 0.85 * W,
    xB0: src ? -0.85 * W : -0.25 * W,
    // Emitting long enough before t = 0 for the pattern to fill the view.
    tPre: (2.2 * W) / V,
  };
}

const runTime = (p: P) => {
  const d = cfg(p);
  const u = d.vs || d.vo;
  return u > 0 ? (p.who === 'source' ? RUN : 0.6 * W) / u : 0.2;
};

const params: ParamSchema<P> = {
  who: {
    kind: 'select',
    label: 'ch17.d.p.who',
    desc: 'ch17.d.d.who',
    group: 'main',
    live: false,
    default: 'source',
    options: [
      { value: 'source', label: 'ch17.d.who.source' },
      { value: 'observer', label: 'ch17.d.who.observer' },
    ],
  },
  vs: {
    kind: 'number',
    label: 'ch17.d.p.vs',
    desc: 'ch17.d.d.vs',
    group: 'main',
    live: false,
    control: 'select',
    choices: [0, 170, 340, 510],
    default: 170,
    unit: 'm/s',
    visibleIf: (p) => p.who === 'source',
  },
  vo: {
    kind: 'number',
    label: 'ch17.d.p.vo',
    desc: 'ch17.d.d.vo',
    group: 'main',
    live: false,
    control: 'select',
    choices: [0, 85, 170, 255],
    default: 170,
    unit: 'm/s',
    visibleIf: (p) => p.who === 'observer',
  },
};

export const doppler: Scene<P, { t: number }> = {
  id: 'doppler',
  title: 'ch17.d.scene',
  params,
  // Sound is fast: shown at 1/40 of real speed.
  time: { h: 1 / 5000, recordEvery: 10, frameStep: 0.005, scale: 0.025, tEnd: (p) => runTime(p as P) },
  world: () => ({ x: [-W, W], y: [-H, H], aspect: 'contain', padPx: 8 }),
  init: () => ({ t: 0 }),
  step: (s, h) => {
    s.t += h;
  },

  draw: (g, s, p) => {
    const d = cfg(p);
    const t = s.t;
    const { ctx, vp } = g;
    const lam = V / F;

    // Wavefronts: circles of radius v(t − t_e) around where the source was at emission.
    ctx.save();
    ctx.strokeStyle = FRONT;
    ctx.lineWidth = 1.1;
    for (const fr of fronts(d, t)) {
      if (fr.r <= 0) continue;
      const [cx, cy] = vp.toPx(fr.cx, 0);
      ctx.beginPath();
      ctx.arc(cx, cy, fr.r * vp.scale, 0, 2 * Math.PI);
      ctx.stroke();
    }
    ctx.restore();

    const xs = sourceX(d, t);
    // Mach cone: tangent to every front, half-angle sin θ = v / v_s.
    const th = machAngle(d);
    if (Number.isFinite(th)) {
      const len = 3 * W;
      for (const sg of [-1, 1]) g.line({ x: xs, y: 0 }, { x: xs - len * Math.cos(th), y: sg * len * Math.sin(th) }, { role: 'fg', width: 1.75 });
    }

    // Observers: a ring flashes while a front is passing it.
    for (const which of ['A', 'B'] as const) {
      const xo = observerX(d, which, t);
      const hit = fronts(d, t).some((fr) => {
        const dr = fr.r - Math.abs(xo - fr.cx);
        return dr >= 0 && dr < 0.18 * lam;
      });
      const O: Vec2 = { x: xo, y: 0 };
      g.circle(O, 8, { fill: hit ? '#1a1a1a' : '#ffffff', color: '#1a1a1a', width: 2 });
      g.text(O, which, { size: 14, color: '#1a1a1a', align: 'center', dy: -16, weight: 600 });
      if (d.vo > 0) g.arrow({ x: xo, y: -g.px(16) }, { x: -d.vo * KV, y: 0 }, { role: 'velocity', width: 2 });
    }

    // Source.
    if (d.vs > 0) g.arrow({ x: xs, y: 0 }, { x: d.vs * KV, y: 0 }, { role: 'velocity', width: 2.25, label: '*v*_{S}' });
    g.circle({ x: xs, y: 0 }, 7, { fill: color('position') });
  },

  readouts: [
    { label: "f'_A", unit: 'Hz', value: (_s, p) => heard(cfg(p)).A },
    { label: "f'_B", unit: 'Hz', value: (_s, p) => heard(cfg(p)).B },
  ],

  info: {
    goals: ['ch17.d.goal.source', 'ch17.d.goal.mach'],
    observe: ['ch17.d.obs.spacing', 'ch17.d.obs.count', 'ch17.d.obs.v', 'ch17.d.obs.cone', 'ch17.d.obs.observer'],
    equations: ["f' = f\\,\\frac{v \\pm v_D}{v \\mp v_S}", '\\sin\\theta = \\frac{v}{v_S}'],
    assumptions: ['ch17.d.assume.medium', 'ch17.d.assume.slow'],
  },
};
