// Ch 5 scene: inertial frames. A ball rests on a frictionless table in a train. Seen from the
// ground or a uniformly moving train it obeys the first law; seen from an accelerating train it
// accelerates backwards with no force on it, so that frame is not inertial.
import { t as tr } from '../../core/i18n';
import { slider, tn, tp, u } from '../../core/tex';
import type { ParamSchema, Scene, Vec2 } from '../../core/types';
import type { Draw } from '../../draw/draw';
import { theme } from '../../draw/theme';
import { FBD_MIN_PX, drawFbd, fbdParam, type FbdForce } from '../../draw/fbd';
import { G5, padded, weightPair } from './common';
import { ballGround, ballInTrain, trainAt, type Train } from './physics';

type P = { frame: string; motion: string; A: number; pseudo: boolean; fbd: boolean };

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
/** Ball mass [kg] (as in the pseudo force −m a_0 of the Σ panel). */
export const FRAMES_M = 1;
/** Longest free-body arrow [px] when the stage has room; dash of the pseudo force (as without the diagram). */
const FBD_LEN = 56;
const PSEUDO_DASH = [5, 4];

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
  fbd: fbdParam(),
  pseudo: { kind: 'toggle', label: 'ch05.f.p.pseudo', desc: 'ch05.f.d.pseudo', group: 'advanced', live: true, default: true },
};

/**
 * Free-body diagram of the ball in the chosen frame. Real forces: N and mg only (frictionless
 * table), in every frame. In the accelerating train, with the pseudo-force toggle on, the
 * fictitious −m a_0 as well: exerted by no body, but needed for ΣF = m a' there.
 */
export function framesFbd(p: P): { real: FbdForce[]; pseudo: number } {
  const A = trainOf(p).A;
  const pseudo = p.frame === 'train' && A > 0 && p.pseudo ? -FRAMES_M * A : 0;
  return { real: weightPair(FRAMES_M), pseudo };
}

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

/**
 * Faded ball with its free-body diagram from the centre. One scale per run (the ball's height, the
 * stage and the train do not change during it): the weight, the largest force, gets a length that
 * keeps the N and mg labels on the stage, below the a_0 arrow in the ground frame, and off the roof,
 * car-floor and ground lines. The pseudo force is grey and dashed,
 * as without the diagram: neither a field force nor a contact force.
 */
function drawBallFbd(g: Draw, p: P, bc: Vec2, ceil: number | null): void {
  const sc = theme.scale;
  const [, cy] = g.vp.toPx(bc.x, bc.y);
  const yPx = (y: number) => (g.vp.toPx(0, y)[1] - cy) / sc;
  // Label centre 11 px beyond the tip, text about ±8 px.
  const up = Math.min(cy / sc, ceil === null ? Infinity : -yPx(ceil) - 10) - 23;
  const down = (g.vp.h - cy) / sc - 23;
  const lines = [-yPx(ROOF), yPx(0.35), yPx(0)];
  const clear = (L: number) => lines.every((d) => Math.abs(L + 11 - d) > 10);
  // The longest clear length up to FBD_LEN; on a small stage, where none is, the shortest clear one
  // up to 1.5 FBD_LEN (labels beyond the roof and the ground); else the shortest arrow.
  const lo = FBD_MIN_PX + 6;
  const hi = Math.floor(Math.min(up, down));
  const pick = (from: number, to: number, step: 1 | -1): number | null => {
    for (let l = from; step < 0 ? l >= to : l <= to; l += step) if (clear(l)) return l;
    return null;
  };
  const L = pick(Math.min(hi, FBD_LEN), lo, -1) ?? pick(FBD_LEN + 1, Math.min(hi, 1.5 * FBD_LEN), 1) ?? lo;
  const perPx = L / (FRAMES_M * G5);
  g.circle(bc, 9, { fill: 'position', alpha: 0.25 });
  g.circle(bc, 9, { role: 'position', width: 1.25 });
  const { real, pseudo } = framesFbd(p);
  drawFbd(g, bc, real, perPx);
  if (pseudo !== 0) {
    // At least FBD_MIN_PX beyond the faded ball (radius 9 px): from the centre, a 14 px arrow
    // would show only 5 px outside the ball.
    const len = g.px(Math.max(Math.abs(pseudo) * perPx, 9 + FBD_MIN_PX)) * Math.sign(pseudo);
    g.arrow(bc, { x: len, y: 0 }, { color: PSEUDO, width: 2.5, dash: PSEUDO_DASH });
    // Above the arrow's line: the table top is just below the ball centre.
    g.text({ x: bc.x + len, y: bc.y }, tr('ch05.f.pseudoLabel'), { size: 13, color: PSEUDO, align: 'right', baseline: 'middle', dx: -5, dy: -9 });
  }
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
    // Acceleration of the train itself, seen from the ground: above the roof, and at least one lane
    // above the ball's v arrow (they meet on a phone).
    const a0Lane = Math.max(ROOF + g.px(16), vLane + g.px(22));
    if (p.fbd) {
      drawBallFbd(g, p, bc, !inTrain && train.A > 0 ? a0Lane : null);
      if (!inTrain && train.A > 0) g.arrow({ x: carX, y: a0Lane }, { x: train.A * ka, y: 0 }, { role: 'acceleration', label: tr('ch05.f.trainA') });
      return;
    }
    if (Math.abs(b.v) > 1e-9) g.arrow({ x: bx, y: vLane }, { x: b.v * kv, y: 0 }, { role: 'velocity', label: '*v*' });
    if (Math.abs(b.a) > 1e-9) g.arrow({ x: bx, y: TABLE_Y + 2 * BALL_R + g.px(16) }, { x: b.a * ka, y: 0 }, { role: 'acceleration', label: '*a*' });
    if (inTrain && train.A > 0 && p.pseudo) {
      // Pseudo force −m a_frame on the ball (m = 1 kg): not exerted by any body.
      g.arrow({ x: bx - g.px(9), y: bc.y }, { x: -train.A * ka, y: 0 }, { color: PSEUDO, width: 2, dash: [5, 4] });
      g.text({ x: bx - g.px(9) - train.A * ka, y: bc.y }, tr('ch05.f.pseudoLabel'), { size: 13, color: PSEUDO, align: 'right', baseline: 'middle', dx: -8 });
    }
    g.circle(bc, 9, { fill: 'position' });

    if (!inTrain && train.A > 0) g.arrow({ x: carX, y: a0Lane }, { x: train.A * ka, y: 0 }, { role: 'acceleration', label: tr('ch05.f.trainA') });
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

  // Σ panel: no horizontal force on the ball. Ground frame: a = 0, v = v_0. Train frame: a and v are
  // measured in the train, as on the stage, in the readouts and on the plots (one symbol, R8):
  // a = a_G − a_0 with a_G = 0 the ball's acceleration seen from the ground, v = a t, and the
  // pseudo force −m a_0 when shown.
  formula: (s, p) => {
    const b = ball(p, s.t);
    const A0 = trainOf(p).A;
    const F = `F_\\text{net} = ${tn(0)}${u('N')}`;
    // Free-body diagram: the vertical pair cancels in every frame.
    const W = FRAMES_M * G5;
    const vert = p.fbd ? [`\\Sigma F_y = N - mg = ${tn(W)} - ${tn(W)} = 0`] : [];
    if (p.frame !== 'train') return [`${F} \\;\\Rightarrow\\; a = ${tn(b.a)}${u('m/s^2')}`, `v = v_0 = ${tn(b.v)}${u('m/s')}`, ...vert];
    // a₀ is the slider value (its label) or exactly 0; a and t with 3 figures (policy D, R1/R3).
    const a0 = A0 > 0 ? slider(params.A, A0) : '0';
    const lines = [
      F,
      `a = a_\\text{G} - a_0 = 0 - ${a0} = ${tn(b.a)}${u('m/s^2')}`,
      `v = at = ${tp(b.a)} \\times ${tn(s.t)} = ${tn(b.v)}${u('m/s')}`,
    ];
    if (A0 > 0 && p.pseudo) lines.push(`F_\\text{pseudo} = -ma_0 = -1 \\times ${a0} = ${tn(-A0)}${u('N')}`);
    return [...lines, ...vert];
  },

  info: {
    goals: ['ch05.f.goal.inertial', 'ch05.f.goal.non'],
    observe: ['ch05.f.obs.ground', 'ch05.f.obs.uniform', 'ch05.f.obs.accel', 'ch05.f.obs.pseudo'],
    equations: ['a = a_\\text{G} - a_0', '\\vec F_\\text{net} = 0 \\;\\Rightarrow\\; m\\vec a = -m\\vec a_0 = \\vec F_\\text{pseudo}'],
    assumptions: ['ch05.f.assume', 'ch05.f.assume.sym'],
  },
};
