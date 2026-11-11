// Ch 5 scene: inertial frames. A ball rests on a frictionless table in a train. Seen from the
// ground or a uniformly moving train it obeys the first law; seen from an accelerating train it
// accelerates backwards with no force on it, so that frame is not inertial.
import { t as tr } from '../../core/i18n';
import type { ParamSchema, Scene, Vec2 } from '../../core/types';
import type { Draw } from '../../draw/draw';
import { padded } from './common';
import { ballGround, ballInTrain, trainAt, type Train } from './physics';

type P = { frame: string; motion: string; A: number; pseudo: boolean };

interface S {
  t: number;
  n: number;
}

const RATE = 240;
const V0 = 2; // train speed at t = 0 [m/s]
const B0 = 2.5; // ball position in the car at t = 0 [m]
const HALF = 4; // half-length of the car [m]
const TABLE = 3.4; // half-length of the table [m]
const TABLE_Y = 1.0;
const ROOF = 3.0;
const BALL_R = 0.22; // [m]
const T_UNIFORM = 4;
const PSEUDO = '#7a7a7a';
const BODY = '#5c5c5c';
const POST = '#9a9a9a';

const trainOf = (p: P): Train => ({ v0: V0, A: p.motion === 'accel' ? p.A : 0, b0: B0 });

/** Accelerating: until the ball reaches the back of the table. Uniform: a fixed time. */
function tEnd(p: P): number {
  const A = trainOf(p).A;
  return A > 0 ? Math.sqrt((2 * (B0 + TABLE - BALL_R)) / A) : T_UNIFORM;
}

/** Ground-frame extent of the whole run. */
function span(p: P): [number, number] {
  const end = trainAt(trainOf(p), tEnd(p)).x;
  return [-HALF - 1.5, end + HALF + 1.5];
}

const ball = (p: P, t: number) => (p.frame === 'train' ? ballInTrain(trainOf(p), t) : ballGround(trainOf(p), t));

const params: ParamSchema<P> = {
  frame: {
    kind: 'select',
    label: 'ch05.f.p.frame',
    desc: 'ch05.f.d.frame',
    group: 'main',
    live: false,
    default: 'train',
    options: [
      { value: 'ground', label: 'ch05.f.frame.ground' },
      { value: 'train', label: 'ch05.f.frame.train' },
    ],
  },
  motion: {
    kind: 'select',
    label: 'ch05.f.p.motion',
    desc: 'ch05.f.d.motion',
    group: 'main',
    live: false,
    default: 'accel',
    options: [
      { value: 'uniform', label: 'ch05.f.motion.uniform' },
      { value: 'accel', label: 'ch05.f.motion.accel' },
    ],
  },
  A: {
    kind: 'number',
    label: 'ch05.f.p.A',
    desc: 'ch05.f.d.A',
    group: 'advanced',
    live: false,
    control: 'slider',
    min: 0.5,
    max: 2,
    step: 0.1,
    default: 1,
    unit: 'm/s²',
    visibleIf: (p) => p.motion === 'accel',
  },
  pseudo: { kind: 'toggle', label: 'ch05.f.p.pseudo', desc: 'ch05.f.d.pseudo', group: 'advanced', live: true, default: true },
};

function rect(g: Draw, x0: number, y0: number, x1: number, y1: number, st: Parameters<Draw['polygon']>[1]): void {
  g.polygon(
    [
      { x: x0, y: y0 },
      { x: x1, y: y0 },
      { x: x1, y: y1 },
      { x: x0, y: y1 },
    ],
    st,
  );
}

/** Car centred at c: body outline, wheels, table. */
function drawTrain(g: Draw, c: number): void {
  rect(g, c - HALF, 0.35, c + HALF, ROOF, { fill: '#f3f3f3', color: BODY, width: 1.5 });
  for (const dx of [-HALF + 0.9, -HALF + 1.8, HALF - 1.8, HALF - 0.9]) g.circle({ x: c + dx, y: 0.2 }, 6, { fill: BODY });
  g.line({ x: c - TABLE, y: TABLE_Y }, { x: c + TABLE, y: TABLE_Y }, { color: BODY, width: 3 });
  for (const dx of [-TABLE + 0.3, TABLE - 0.3]) g.line({ x: c + dx, y: TABLE_Y }, { x: c + dx, y: 0.35 }, { color: BODY, width: 1.5 });
}

export const frames: Scene<P, S> = {
  id: 'frames',
  title: 'ch05.f.scene',
  layout: 'stack',
  params,
  time: { h: 1 / RATE, recordEvery: 1, frameStep: 0.1, tEnd: (p) => tEnd(p as P) },

  world: (p) => {
    const [lo, hi] = span(p);
    // The train frame only needs the car; the ground frame needs the whole trip.
    const x: [number, number] = p.frame === 'train' ? [-HALF - 1.5, HALF + 1.5] : [lo, hi];
    return { x, y: [-0.5, ROOF + 0.7], aspect: 'contain', padPx: 16 };
  },

  init: () => ({ t: 0, n: 0 }),

  step: (s, _h, p) => {
    s.n += 1;
    s.t = Math.min(s.n / RATE, tEnd(p));
  },

  record: (s, p) => {
    const b = ball(p, s.t);
    return { t: s.t, x: b.x, v: b.v, a: b.a };
  },
  snapshot: (s) => ({ ...s }),

  draw: (g, s, p) => {
    const inTrain = p.frame === 'train';
    const train = trainOf(p);
    const tk = trainAt(train, s.t);
    const [lo, hi] = span(p);
    const W = hi - lo;
    // Everything is drawn in the chosen frame: shift ground-fixed things by −x_train in the train frame.
    const shift = inTrain ? -tk.x : 0;
    const carX = inTrain ? 0 : tk.x;

    // Ground with posts every 2 m, fixed to the ground.
    const L = (inTrain ? -W / 2 : lo) - W;
    const R = (inTrain ? W / 2 : hi) + W;
    g.line({ x: L, y: 0 }, { x: R, y: 0 }, { color: BODY, width: 2 });
    for (let x = Math.floor((L - shift) / 2) * 2 + shift; x <= R; x += 2) {
      g.line({ x, y: 0 }, { x, y: -0.35 }, { color: POST, width: 1.5 });
    }

    drawTrain(g, carX);

    // Ball: on the table, position given in the chosen frame.
    const b = ball(p, s.t);
    const bx = b.x;
    const bc: Vec2 = { x: bx, y: TABLE_Y + BALL_R };
    const kv = 0.6; // world m per (m/s)
    const ka = 1.2; // world m per (m/s²)
    const vLane = TABLE_Y + 2 * BALL_R + g.px(38);
    if (Math.abs(b.v) > 1e-9) g.arrow({ x: bx, y: vLane }, { x: b.v * kv, y: 0 }, { role: 'velocity', label: '*v*' });
    if (Math.abs(b.a) > 1e-9) g.arrow({ x: bx, y: TABLE_Y + 2 * BALL_R + g.px(16) }, { x: b.a * ka, y: 0 }, { role: 'acceleration', label: '*a*' });
    if (inTrain && train.A > 0 && p.pseudo) {
      // Pseudo force −m a_frame on the ball (m = 1 kg): not exerted by any body.
      g.arrow({ x: bx - g.px(9), y: bc.y }, { x: -train.A * ka, y: 0 }, { color: PSEUDO, width: 2, dash: [5, 4] });
      g.text({ x: bx - g.px(9) - train.A * ka, y: bc.y }, tr('ch05.f.pseudoLabel'), { size: 13, color: PSEUDO, align: 'right', baseline: 'middle', dx: -8 });
    }
    g.circle(bc, 9, { fill: 'position' });

    // Acceleration of the train itself, seen from the ground.
    if (!inTrain && train.A > 0) {
      // Above the roof, and at least one lane above the ball's v arrow (they meet on a phone).
      g.arrow({ x: carX, y: Math.max(ROOF + g.px(16), vLane + g.px(22)) },{ x: train.A * ka, y: 0 }, { role: 'acceleration', label: tr('ch05.f.trainA') });
    }
  },

  plots: [
    {
      id: 'x',
      label: 'x\\,(\\mathrm{m})',
      traces: [{ channel: 'x', role: 'position' }],
      yRange: (p) => {
        const a = ball(p as P, 0).x;
        const b = ball(p as P, tEnd(p as P)).x;
        return padded(Math.min(a, b), Math.max(a, b), 2);
      },
    },
    {
      id: 'v',
      label: 'v\\,(\\mathrm{m/s})',
      traces: [{ channel: 'v', role: 'velocity' }],
      yRange: (p) => {
        const b = ball(p as P, tEnd(p as P)).v;
        return padded(Math.min(b, 0), Math.max(b, V0), 1);
      },
    },
    {
      id: 'a',
      label: 'a\\,(\\mathrm{m/s^2})',
      traces: [{ channel: 'a', role: 'acceleration' }],
      yRange: () => padded(-2, 0, 1),
    },
  ],

  readouts: [
    { label: 'F_\\text{net}', unit: 'N', value: () => 0 },
    { label: 'a', unit: 'm/s²', value: (s, p) => ball(p, s.t).a },
    { label: 'v', unit: 'm/s', value: (s, p) => ball(p, s.t).v },
  ],

  info: {
    goals: ['ch05.f.goal.inertial', 'ch05.f.goal.non'],
    observe: ['ch05.f.obs.ground', 'ch05.f.obs.uniform', 'ch05.f.obs.accel', 'ch05.f.obs.pseudo'],
    equations: ["a' = a - a_0", "\\vec F_\\text{net} = 0 \\;\\Rightarrow\\; m\\vec a' = -m\\vec a_0"],
    assumptions: ['ch05.f.assume'],
  },
};
