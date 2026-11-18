// Ch 17 scene: Doppler effect. A point source emits a circular wavefront once per period.
// Moving source: fronts crowd ahead and spread behind; at v_s > v they form the Mach cone.
// Moving observers: the fronts stay concentric, but A meets them more often than B.
import { tn, u } from '../../core/tex';
import type { ParamSchema, Scene, Vec2 } from '../../core/types';
import { color } from '../../draw/theme';
import { arrivalAt, flashing, fronts, heardAll, heardAt, machAngle, observerX, sourceX, wavelengths, type Doppler } from './physics';

type P = { who: string; vs: number; vo: number };

const V = 340;
const F = 100; // λ = 3.4 m
const W = 40; // half-width of the view [m]
const H = 20;
const RUN = 48; // distance travelled by the source (or by A) during one run [m]
const FRONT = '#8c8c8c';
const KV = 6 / V; // world m per (m/s) for velocity arrows

/** Base run: the source (or A) covers RUN (or 0.6 W), at most 0.3 s so slow speeds stay short. */
function baseRun(vs: number, vo: number, src: boolean): number {
  const u = src ? vs : vo;
  return u > 0 ? Math.min((src ? RUN : 0.6 * W) / u, 0.3) : 0.2;
}

/** Time scale of the view: 1/40 of real speed… */
const SCALE = 0.025;
/** …slowed further above this heard frequency, so one heard period lasts at least 4 frames at 60 fps [Hz]. */
const F_SLOW = 600;
/** Longest run on screen at 1× [wall s]: a slowed run is shortened to this. */
const WALL_MAX = 12;
/** Emission starts at least this long before t = 0, so the pattern fills the view [s]… */
const TPRE_MIN = (2.2 * W) / V;
/** …and at most this long (about 600 fronts). */
const TPRE_MAX = 6;

function build(p: P, run: number): Doppler {
  const src = p.who === 'source';
  const vs = src ? p.vs : 0;
  const vo = src ? 0 : p.vo;
  const xs0 = src ? -(vs * run) / 2 : 0;
  const xA0 = 0.85 * W;
  // Below the speed of sound the source has been emitting long enough for its oldest front to
  // reach A two periods before t = 0: A hears the sound from the start of the run.
  const reachA = vs > 0 && vs < V ? (xA0 - xs0) / (V - vs) + 2 / F : 0;
  return {
    v: V,
    f: F,
    vs,
    xs0,
    vo,
    xA0,
    xB0: src ? -0.85 * W : -0.25 * W,
    tPre: Math.min(Math.max(TPRE_MIN, reachA), TPRE_MAX),
  };
}

/** Highest frequency heard at some time during [0, run]. */
function fHigh(d: Doppler, run: number): number {
  const all = heardAll(d);
  let f = Math.max(...[all.A, all.B].filter(Number.isFinite));
  if (Number.isFinite(all.B2)) {
    // B2 lasts until its earliest-emitted front arrives.
    const te0 = Math.ceil(-d.tPre * d.f - 1e-9) / d.f;
    if (arrivalAt(d, te0, 'B') >= -1e-9 && run > 0) f = Math.max(f, all.B2);
  }
  return f;
}

type Setup = { d: Doppler; run: number; scale: number };
let memoKey = '';
let memo: Setup | null = null;

/** Doppler set-up, run length and time scale for these parameters. */
export function setup(p: P): Setup {
  const key = `${p.who}|${p.vs}|${p.vo}`;
  if (memo && key === memoKey) return memo;
  const src = p.who === 'source';
  const run0 = baseRun(src ? p.vs : 0, src ? 0 : p.vo, src);
  const f0 = fHigh(build(p, run0), run0);
  const scale = SCALE * Math.min(1, F_SLOW / f0);
  const run = Math.min(run0, WALL_MAX * scale);
  memo = { d: build(p, run), run, scale };
  memoKey = key;
  return memo;
}

const cfg = (p: P) => setup(p).d;
const runTime = (p: P) => setup(p).run;

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
    control: 'slider',
    min: 0,
    max: 510,
    step: 10,
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
    control: 'slider',
    min: 0,
    max: 255,
    step: 5,
    default: 170,
    unit: 'm/s',
    visibleIf: (p) => p.who === 'observer',
  },
};

export const doppler: Scene<P, { t: number }> = {
  id: 'doppler',
  title: 'ch17.d.scene',
  params,
  // Sound is fast: shown at 1/40 of real speed, slower still for high heard frequencies.
  time: { h: 1 / 5000, recordEvery: 10, frameStep: 0.005, scale: (p) => setup(p as P).scale, tEnd: (p) => runTime(p as P) },
  world: () => ({ x: [-W, W], y: [-H, H], aspect: 'contain', padPx: 8 }),
  init: () => ({ t: 0 }),
  step: (s, h) => {
    s.t += h;
  },

  draw: (g, s, p, ui) => {
    const d = cfg(p);
    // Analytic in t: drawn at the frame's own time, so the fronts move smoothly between steps.
    const t = ui?.tFrame ?? s.t;
    const { ctx, vp } = g;

    // Wavefronts: circles of radius v(t − t_e) around where the source was at emission. Circles
    // that miss the view, or enclose all of it, are skipped (up to 600 fronts near v_S = v).
    const [vx0, vx1] = [-W - 1, W + 1];
    const [vy0, vy1] = [-H - 1, H + 1];
    ctx.save();
    ctx.strokeStyle = FRONT;
    ctx.lineWidth = 1.1;
    // Near the speed of sound the fronts ahead are under 3 px apart and merge into a block: lighter.
    const aheadPx = d.vs < V ? ((V - d.vs) / F) * vp.scale : Infinity;
    ctx.globalAlpha = Math.min(1, Math.max(0.35, aheadPx / 3));
    for (const fr of fronts(d, t)) {
      if (fr.r <= 0) continue;
      const near = Math.hypot(Math.max(vx0 - fr.cx, 0, fr.cx - vx1), Math.max(vy0, 0, -vy1));
      const far = Math.hypot(Math.max(Math.abs(vx0 - fr.cx), Math.abs(vx1 - fr.cx)), Math.max(-vy0, vy1));
      if (fr.r < near || fr.r > far) continue;
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
      // Flash for a short time after each arrival, shorter than the heard period so flashes stay apart.
      const hit = flashing(d, which, t);
      const O: Vec2 = { x: xo, y: 0 };
      g.circle(O, 8, { fill: hit ? '#1a1a1a' : '#ffffff', color: '#1a1a1a', width: 2 });
      g.text(O, which, { size: 14, color: '#1a1a1a', align: 'center', dy: -16, weight: 600 });
      if (d.vo > 0) g.arrow({ x: xo, y: -g.px(16) }, { x: -d.vo * KV, y: 0 }, { role: 'velocity', width: 2 });
    }

    // Source.
    if (d.vs > 0) g.arrow({ x: xs, y: 0 }, { x: d.vs * KV, y: 0 }, { role: 'velocity', width: 2.25, label: '*v*_{S}' });
    g.circle({ x: xs, y: 0 }, 7, { fill: color('position') });
  },

  // A branch reads "–" while none of its fronts is arriving. Above the speed of sound B hears two
  // sounds at once: f'_B (sent back after the source passed) and f'_B2 (sent towards B before).
  readouts: [
    { label: "f'_A", unit: 'Hz', value: (s, p) => heardAt(cfg(p), s.t).A },
    { label: "f'_B", unit: 'Hz', value: (s, p) => heardAt(cfg(p), s.t).B },
    { label: "f'_{B2}", unit: 'Hz', value: (s, p) => heardAt(cfg(p), s.t).B2 },
  ],

  formula: (s, p) => formulaLines(p, s.t),

  info: {
    goals: ['ch17.d.goal.source', 'ch17.d.goal.mach'],
    observe: ['ch17.d.obs.spacing', 'ch17.d.obs.count', 'ch17.d.obs.v', 'ch17.d.obs.cone', 'ch17.d.obs.boom', 'ch17.d.obs.observer'],
    equations: ["f' = f\\,\\frac{v \\pm v_D}{v \\mp v_S}", '\\sin\\theta = \\frac{v}{v_S}', "f'_{B2} = f\\,\\frac{v}{v_S - v} \\quad (v_S > v)"],
    assumptions: ['ch17.d.assume.medium', 'ch17.d.assume.start', 'ch17.d.assume.slow'],
  },
};

/**
 * Σ panel: the frequencies A and B are hearing at time t (a line only while its readout shows a
 * value), the spacing of the fronts ahead of and behind a moving source, and at or above the
 * speed of sound the condition v_S ≥ v instead of f'_A, with f'_B2 and the Mach angle above it.
 */
export function formulaLines(p: P, t: number): string[] {
  const d = cfg(p);
  const h = heardAt(d, t);
  const { v, f } = d;
  const lines: string[] = [];
  const hz = (x: number) => `${tn(x)}${u('Hz')}`;
  if (p.who !== 'source') {
    const vo = d.vo;
    if (Number.isFinite(h.A)) lines.push(`f'_A = f\\,\\frac{v + v_D}{v} = ${f} \\times \\frac{${v} + ${vo}}{${v}} = ${hz(h.A)}`);
    if (Number.isFinite(h.B)) lines.push(`f'_B = f\\,\\frac{v - v_D}{v} = ${f} \\times \\frac{${v} - ${vo}}{${v}} = ${hz(h.B)}`);
    lines.push(`\\lambda = v/f = ${v}/${f} = ${tn(v / f)}${u('m')}`);
    return lines;
  }
  const vs = d.vs;
  const lam = wavelengths(d);
  if (vs < v && Number.isFinite(h.A)) lines.push(`f'_A = f\\,\\frac{v}{v - v_S} = ${f} \\times \\frac{${v}}{${v} - ${vs}} = ${hz(h.A)}`);
  if (vs >= v) lines.push(`v_S = ${vs}${u('m/s')} \\ge v`);
  if (Number.isFinite(h.B)) lines.push(`f'_B = f\\,\\frac{v}{v + v_S} = ${f} \\times \\frac{${v}}{${v} + ${vs}} = ${hz(h.B)}`);
  if (Number.isFinite(h.B2)) lines.push(`f'_{B2} = f\\,\\frac{v}{v_S - v} = ${f} \\times \\frac{${v}}{${vs} - ${v}} = ${hz(h.B2)}`);
  if (vs > v) lines.push(`\\theta = \\arcsin\\frac{v}{v_S} = \\arcsin\\frac{${v}}{${vs}} = ${tn((machAngle(d) * 180) / Math.PI)}^\\circ`);
  if (vs < v) lines.push(`\\lambda_A = (v - v_S)/f = (${v} - ${vs})/${f} = ${tn(lam.ahead)}${u('m')}`);
  lines.push(`\\lambda_B = (v + v_S)/f = (${v} + ${vs})/${f} = ${tn(lam.behind)}${u('m')}`);
  return lines;
}
