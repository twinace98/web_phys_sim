// Ch 6 scene: circular motion in the inertial frame and, with the toggle on, also in the frame rotating
// with the object.
// Inertial (ground) frame: the top view shows the motion and the net force; the side view shows only
// real forces (tension, gravity, normal force, friction). The net force points to the centre and
// equals mv²/r: "centripetal force" names that component, it is not an extra force. The speed slider
// sets v; the forces follow (flat curve: friction up to μs mg; banked curve: friction away from the
// design speed; conical pendulum: the angle).
// Rotating frame (non-inertial, toggle, off by default; drawn as a second panel below): the object
// rests while the ground turns the other way, and the real forces plus the centrifugal force mω²r add
// to zero. After the release the object curves outward and backward under the centrifugal and
// Coriolis forces. Fictitious forces are drawn dashed.
import { t as tr } from '../../core/i18n';
import { CONST, num, slider, tn, tnScale, tp, u } from '../../core/tex';
import type { NumberParam, ParamSchema, Scene, Vec2 } from '../../core/types';
import type { Viewport } from '../../core/viewport';
import type { Draw } from '../../draw/draw';
import { theme } from '../../draw/theme';
import { PX_WORLD } from '../modern/frame';
import {
  G,
  L_CONE,
  MU_DRY,
  MU_ICE,
  SETUPS,
  designSpeed,
  fictitious,
  forces,
  lapTime,
  netForce,
  omega,
  required,
  rotatingViewAt,
  setupAt,
  skidsOnIce,
  speedAt,
  topViewAt,
  type Force,
  type Preset,
  type Setup,
} from './physics';

type P = { preset: string; vString: number; vFlat: number; vBanked: number; vCone: number; cut: boolean; ice: boolean; rot: boolean };
type Frame = 'inertial' | 'rotating';

const RATE = 240;
const SX = 3.3; // centre of the side view
const OX = SX + 0.25; // object in the side view
/**
 * Top-view arrow lengths [r] at the preset's top speed: velocity, and a force of mv²/r. One scale per
 * preset over the whole slider range, so the arrows grow with v instead of keeping their length.
 */
const KV = 0.55;
const KN = 0.5;
const GREY = '#9a9a9a';
const BODY = '#5c5c5c';
const CAPTION = '#6b6b6b';
const ICE = '#9ccbe8';
const EDGE = '#e3e3e3';
/** Fictitious forces: force colour, dashed shaft. */
const FICT = [6, 4];

const PAD = 12; // stage inset [px]
const GAP = 14; // between the two panels [px]
const STRIP = 22; // title strip at the top of each panel [px]
const FIT = 10; // margin around the content when a panel shrinks to it [px]
/** Panel world x-extent [units of r]: top view around 0, side view around SX. */
const XL = -1.4;
const XR = 4.95;
/**
 * Panel world y-extents: the inertial panel leaves room above for the captions and the tangent path;
 * the rotating panel leaves room below for the outward path and its force arrows.
 */
const SPAN: Record<Frame, [number, number]> = { inertial: [-1.3, 1.75], rotating: [-2.3, 1.35] };
/** On a wide stage the side view moves right by up to this much, so the two views spread out. */
const SHIFT_MAX = 1.5;
/** Marks on the ground around the circle: fixed in the inertial frame, turning backward in the rotating one. */
const TICKS = 16;

const presetOf = (p: P) => (p.preset in SETUPS ? p.preset : 'string') as Preset;

/** Speed slider of each preset: one parameter each, so each keeps its own range and default. */
const V_KEY = { string: 'vString', flat: 'vFlat', banked: 'vBanked', cone: 'vCone' } as const satisfies Record<Preset, keyof P>;
/**
 * Slider range [m/s]. Flat curve: the dry road (μs = 0.6) holds the car up to √(μs g r) = 10.8 m/s,
 * above the range; on ice (μs = 0.1) the limit is 4.43 m/s, inside it. Banked curve: around the design
 * speed 8.45 m/s, the dry road holding the car over the range. Conical pendulum: 22°–43°.
 */
export const V_RANGE: Record<Preset, [number, number]> = { string: [1, 3.5], flat: [2, 10.5], banked: [4, 11], cone: [1.2, 2.5] };

/** The preset's setup at the slider speed. */
export function setupOf(p: P): Setup {
  const pr = presetOf(p);
  const v = Number(p[V_KEY[pr]]);
  const [lo, hi] = V_RANGE[pr];
  return setupAt(pr, Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : SETUPS[pr].v);
}

/** Top-view scales: velocity arrow [r per m/s] and force arrow [r per N], fixed per preset. */
const vScale = (pr: Preset) => KV / V_RANGE[pr][1];
const fScale = (pr: Preset) => KN / required(setupAt(pr, V_RANGE[pr][1]));

/** A quarter lap: the string is cut, or the car reaches the ice. */
const tQuarter = (p: P) => lapTime(setupOf(p)) / 4;
/** Flat curve with the icy road: on ice from the quarter lap on. */
const onIce = (p: P, t: number) => presetOf(p) === 'flat' && p.ice && t >= tQuarter(p);
/** The inward force is lost: the string is cut, or the car on ice needs more than μs,ice mg. */
const released = (p: P) => {
  const pr = presetOf(p);
  if (pr === 'flat') return p.ice && skidsOnIce(setupOf(p));
  return pr !== 'banked' && p.cut;
};
/** The centripetal force is lost a quarter lap after the start. */
const tRel = (p: P) => (released(p) ? tQuarter(p) : Infinity);
/**
 * Run end: after the release the object travels TRAVEL radii along the tangent, so it and its
 * velocity arrow stay on stage; the cut conical pendulum also falls, so it stops sooner.
 */
const TRAVEL = 0.95;
const TRAVEL_CONE = 0.7;
const tEnd = (p: P) => {
  const s = setupOf(p);
  return tRel(p) + ((presetOf(p) === 'cone' ? TRAVEL_CONE : TRAVEL) * s.r) / s.v;
};
/** Side view: world units per metre for the conical pendulum (1 m string drawn 1.4 long). */
const CONE_SCALE = 1.4;

const vParam = (pr: Preset): NumberParam =>
  ({
    kind: 'number',
    label: 'ch06.c.p.v',
    desc: 'ch06.c.d.v',
    group: 'main',
    live: false,
    control: 'slider',
    min: V_RANGE[pr][0],
    max: V_RANGE[pr][1],
    step: 0.01,
    default: SETUPS[pr].v,
    unit: 'm/s',
    visibleIf: (p) => p.preset === pr,
  });

const params: ParamSchema<P> = {
  preset: {
    kind: 'select',
    label: 'ch06.c.p.preset',
    desc: 'ch06.c.d.preset',
    group: 'main',
    live: false,
    default: 'string',
    options: [
      { value: 'string', label: 'ch06.c.preset.string' },
      { value: 'flat', label: 'ch06.c.preset.flat' },
      { value: 'banked', label: 'ch06.c.preset.banked' },
      { value: 'cone', label: 'ch06.c.preset.cone' },
    ],
  },
  vString: vParam('string'),
  vFlat: vParam('flat'),
  vBanked: vParam('banked'),
  vCone: vParam('cone'),
  cut: {
    kind: 'toggle',
    label: 'ch06.c.p.cut',
    desc: 'ch06.c.d.cut',
    group: 'main',
    live: false,
    default: false,
    visibleIf: (p) => p.preset === 'string' || p.preset === 'cone',
  },
  ice: {
    kind: 'toggle',
    label: 'ch06.c.p.ice',
    desc: 'ch06.c.d.ice',
    group: 'main',
    live: false,
    default: false,
    visibleIf: (p) => p.preset === 'flat',
  },
  rot: { kind: 'toggle', label: 'ch06.c.p.rot', desc: 'ch06.c.d.rot', group: 'main', live: true, default: false },
};

const add = (a: Vec2, b: Vec2, k = 1): Vec2 => ({ x: a.x + b.x * k, y: a.y + b.y * k });

/** Box in canvas px. */
export type Box = { l: number; t: number; r: number; b: number };

/** Stacked inertial panel (narrow stage): world x-extent of the top view and of the side view below it. */
const STACK_X = 1.45;

/**
 * The panels, the common scale [px per r] and how far the side view moves right on a wide stage.
 * `rot`: two panels, inertial frame on top and rotating frame below, each with the top view left and
 * the side view right. Otherwise one inertial panel on the whole stage; on a narrow (portrait) stage
 * its side view goes below the top view (`stack`), where the views come out larger.
 */
export function layout(w: number, h: number, rot = true): { boxes: Box[]; s: number; shift: number; stack: boolean } {
  const bw = Math.max(1, w - 2 * PAD);
  if (!rot) {
    const hb = Math.max(1, h - 2 * PAD);
    const [a, b] = SPAN.inertial;
    const span = b - a;
    const sRow = Math.max(1, Math.min(bw / (XR - XL), (hb - STRIP) / span));
    const sStack = Math.max(1, Math.min(bw / (2 * STACK_X), (hb - STRIP) / (2 * span)));
    const stack = sStack > 1.05 * sRow;
    const s = stack ? sStack : sRow;
    const shift = stack ? 0 : Math.min(SHIFT_MAX, Math.max(0, (bw / s - (XR - XL)) / 3));
    const hp = Math.min(hb, STRIP + (stack ? 2 : 1) * span * s + 2 * FIT);
    const y0 = PAD + (hb - hp) / 2;
    return { boxes: [{ l: PAD, t: y0, r: w - PAD, b: y0 + hp }], s, shift, stack };
  }
  const hb = Math.max(1, (h - 2 * PAD - GAP) / 2);
  const span = Math.max(...Object.values(SPAN).map(([a, b]) => b - a));
  const s = Math.max(1, Math.min(bw / (XR - XL), (hb - STRIP) / span));
  const shift = Math.min(SHIFT_MAX, Math.max(0, (bw / s - (XR - XL)) / 3));
  // A narrow stage limits the scale by its width: the panels shrink to their content and sit in the middle.
  const hp = Math.min(hb, STRIP + span * s + 2 * FIT);
  const y0 = PAD + (hb - hp);
  const top: Box = { l: PAD, t: y0, r: w - PAD, b: y0 + hp };
  const bot: Box = { l: PAD, t: y0 + hp + GAP, r: w - PAD, b: y0 + 2 * hp + GAP };
  return { boxes: [top, bot], s, shift, stack: false };
}

/**
 * The drawing API for one panel: panel world (x, y) maps to the box with scale s and centre
 * (xc, yc), then through the stage viewport, so every mark still goes through g0.
 */
function panelDraw(g0: Draw, box: Box, s: number, xc: number, yc: number): Draw {
  const cx = (box.l + box.r) / 2;
  const cy = (box.t + box.b) / 2;
  const toPx = (x: number, y: number): [number, number] => [cx + (x - xc) * s, cy - (y - yc) * s];
  const toWorld = (px: number, py: number): [number, number] => [xc + (px - cx) / s, yc - (py - cy) / s];
  const vp = { w: g0.vp.w, h: g0.vp.h, scale: s, toPx, toWorld, fit: () => {} } as unknown as Viewport;
  const m = (q: Vec2): Vec2 => {
    const [x, y] = g0.vp.toWorld(...toPx(q.x, q.y));
    return { x, y };
  };
  const k = s / g0.vp.scale;
  return {
    ctx: g0.ctx,
    vp,
    px: (n) => g0.px(n) / k,
    line: (a, b, st) => g0.line(m(a), m(b), st),
    polyline: (pts, st) => g0.polyline(pts.map(m), st),
    arrow: (from, vec, st) => g0.arrow(m(from), { x: vec.x * k, y: vec.y * k }, st),
    circle: (c, r, st) => g0.circle(m(c), r, st),
    polygon: (pts, st) => g0.polygon(pts.map(m), st),
    arc: (c, r, a0, a1, st) => g0.arc(m(c), r, a0, a1, st),
    text: (q, str, st) => g0.text(m(q), str, st),
    screenText: (x, y, str, st) => g0.screenText(x, y, str, st),
  };
}

/** The same drawing API with every world point shifted by d. */
function shifted(g: Draw, d: Vec2): Draw {
  const m = (q: Vec2): Vec2 => ({ x: q.x + d.x, y: q.y + d.y });
  return {
    ctx: g.ctx,
    vp: g.vp,
    px: (n) => g.px(n),
    line: (a, b, st) => g.line(m(a), m(b), st),
    polyline: (pts, st) => g.polyline(pts.map(m), st),
    arrow: (from, vec, st) => g.arrow(m(from), vec, st),
    circle: (c, r, st) => g.circle(m(c), r, st),
    polygon: (pts, st) => g.polygon(pts.map(m), st),
    arc: (c, r, a0, a1, st) => g.arc(m(c), r, a0, a1, st),
    text: (q, str, st) => g.text(m(q), str, st),
    screenText: (x, y, str, st) => g.screenText(x, y, str, st),
  };
}

/** Top view: half the object's size across its path [r] (car 0.12 r wide, ball 8 px radius). */
const bodyHalf = (g: Draw, pr: Preset) => (pr === 'flat' || pr === 'banked' ? 0.06 : g.px(8));

function rotRect(g: Draw, c: Vec2, u: Vec2, L: number, Wd: number, fillAlpha = 0.9): void {
  const n = { x: -u.y, y: u.x };
  const pts = [
    add(add(c, u, L / 2), n, Wd / 2),
    add(add(c, u, -L / 2), n, Wd / 2),
    add(add(c, u, -L / 2), n, -Wd / 2),
    add(add(c, u, L / 2), n, -Wd / 2),
  ];
  g.polygon(pts, { fill: 'position', fillAlpha, role: fillAlpha < 0.5 ? 'position' : undefined, width: 1.5 });
}

const FORCE_LABEL: Record<Force['name'], string> = { T: '*T*', N: '*N*', W: '*m**g*', f: '*f*_{s}' };
const CF = '*F*_{cf}';
const COR = '*F*_{Cor}';
/** Coriolis arrow length [px] below which its label goes beyond the tip instead of beside the middle. */
const COR_SHORT = 60;

/**
 * A fictitious force: dashed arrow, label (if given) beyond the tip along the arrow. The label keeps at
 * least `minPx` from the start, so a short arrow does not put it on the object.
 */
function fictArrow(g: Draw, from: Vec2, vec: Vec2, label?: string, minPx = 20): void {
  g.arrow(from, vec, { role: 'force', width: 2.25, dash: FICT });
  const len = Math.hypot(vec.x, vec.y);
  if (!label || len < 1e-12) return;
  const u = { x: vec.x / len, y: vec.y / len };
  const w = label.replace(/[*_{}]/g, '').length * 7;
  const d = Math.max(len, g.px(minPx)) + g.px(10 + Math.abs(u.x) * (w / 2 - 6));
  g.text(add(from, u, d), label, { size: 13, role: 'force', align: 'center', baseline: 'middle' });
}

/** Circle of radius 1 (units of r) with ground marks turned by `turn`, and the centre. */
function drawGround(g: Draw, onCircle: boolean, turn: number): void {
  const ring: Vec2[] = [];
  for (let i = 0; i <= 96; i++) ring.push({ x: Math.cos((i / 96) * 2 * Math.PI), y: Math.sin((i / 96) * 2 * Math.PI) });
  g.polyline(ring, { color: GREY, width: 1.25, dash: onCircle ? undefined : [3, 4] });
  for (let i = 0; i < TICKS; i++) {
    const a = turn + ((i + 0.5) / TICKS) * 2 * Math.PI;
    const u = { x: Math.cos(a), y: Math.sin(a) };
    g.line(add(u, u, -0.07), add(u, u, 0.07), { color: GREY, width: 1.5 });
  }
  g.circle({ x: 0, y: 0 }, 3, { fill: GREY });
}

/**
 * Net (real) force toward the centre from P0. Its label sits beside the inner part of the arrow on
 * the side `side` (tangential) and extends away from the arrow, so it stays inside the circle and
 * clear of the ground marks on a small stage too. A short arrow (slow object) puts the label just
 * inside the object's inner edge (`body` from its centre) instead, so it does not cover the object.
 */
function netArrow(g: Draw, P0: Vec2, side: Vec2, L: number, body: number): void {
  const inward = { x: -P0.x, y: -P0.y };
  const len = Math.hypot(inward.x, inward.y) || 1;
  const u = { x: inward.x / len, y: inward.y / len };
  g.arrow(P0, { x: u.x * L, y: u.y * L }, { role: 'force', width: 3.5 });
  const m = add(P0, u, Math.max(0.8 * L, body + g.px(14)));
  g.text(add(m, side, g.px(18)), '*F*_{net}', { size: 13, role: 'force', align: 'center', baseline: 'middle' });
}

function drawTopInertial(g: Draw, p: P, t: number): void {
  const pr = presetOf(p);
  const s = setupOf(p);
  const tr0 = tRel(p);
  const k = topViewAt(s, t, tr0);
  const P0: Vec2 = { x: k.x / s.r, y: k.y / s.r };
  const vhat: Vec2 = { x: k.vx / s.v, y: k.vy / s.v };
  const O: Vec2 = { x: 0, y: 0 };
  drawGround(g, k.onCircle, 0);

  if (!k.onCircle) {
    const r0 = topViewAt(s, tr0, tr0);
    g.line({ x: r0.x / s.r, y: r0.y / s.r }, P0, { color: GREY, width: 1, dash: [3, 4] });
  } else if (pr === 'string' || pr === 'cone') {
    g.line(O, P0, { color: BODY, width: 1.25 });
  }

  if (pr === 'flat' || pr === 'banked') rotRect(g, P0, vhat, 0.22, 0.12);
  else g.circle(P0, 8, { fill: 'position' });

  const lv = vScale(pr) * s.v;
  g.arrow(P0, { x: vhat.x * lv, y: vhat.y * lv }, { role: 'velocity', width: 2.25, label: '*v*' });
  const Fr = netForce(pr, false, s).r;
  if (k.onCircle && Fr > 0) netArrow(g, P0, { x: -vhat.x, y: -vhat.y }, fScale(pr) * Fr, bodyHalf(g, pr));
  g.text({ x: 0, y: 1.5 }, tr('ch06.c.top'), { size: 12, color: CAPTION, align: 'center' });
}

function drawTopRotating(g: Draw, p: P, t: number): void {
  const pr = presetOf(p);
  const s = setupOf(p);
  const tr0 = tRel(p);
  const w = omega(s);
  const q = rotatingViewAt(s, t, tr0);
  const P0: Vec2 = { x: q.x / s.r, y: q.y / s.r };
  const O: Vec2 = { x: 0, y: 0 };
  // The ground turns backward (clockwise) at ω.
  drawGround(g, q.onCircle, -w * t);

  if (!q.onCircle) {
    // Path since the release, transformed from the straight inertial path.
    const pts: Vec2[] = [];
    for (let i = 0; i <= 48; i++) {
      const r = rotatingViewAt(s, tr0 + ((t - tr0) * i) / 48, tr0);
      pts.push({ x: r.x / s.r, y: r.y / s.r });
    }
    g.polyline(pts, { color: GREY, width: 1, dash: [3, 4] });
  } else if (pr === 'string' || pr === 'cone') {
    g.line(O, P0, { color: BODY, width: 1.25 });
  }

  // The car keeps its inertial heading, which turns backward in this frame.
  const k = topViewAt(s, t, tr0);
  const c = Math.cos(w * t);
  const sn = Math.sin(w * t);
  const head: Vec2 = { x: (c * k.vx + sn * k.vy) / s.v, y: (-sn * k.vx + c * k.vy) / s.v };
  if (pr === 'flat' || pr === 'banked') rotRect(g, P0, head, 0.22, 0.12);
  else g.circle(P0, 8, { fill: 'position' });

  const kf = fScale(pr);
  const f = fictitious(s, q);
  if (q.onCircle) {
    // At rest: the real net force and the centrifugal force cancel.
    netArrow(g, P0, { x: -head.x, y: -head.y }, kf * required(s), bodyHalf(g, pr));
    fictArrow(g, P0, { x: f.cf.x * kf, y: f.cf.y * kf }, CF);
    return;
  }
  fictArrow(g, P0, { x: f.cf.x * kf, y: f.cf.y * kf }, CF);
  // The Coriolis arrow starts nearly along the circle, pointing backward: its label goes beside the
  // middle on the side away from the axis, extending away from the centrifugal arrow.
  // A short arrow (slow object) has no room beside it: the label goes beyond the tip, away from the
  // centrifugal label, which is about a right angle away.
  const cor = { x: f.cor.x * kf, y: f.cor.y * kf };
  const len = Math.hypot(cor.x, cor.y);
  const short = len < g.px(COR_SHORT);
  fictArrow(g, P0, cor, short ? COR : undefined, 24);
  if (len < 1e-12 || short) return;
  let n = { x: -cor.y / len, y: cor.x / len };
  if (n.x * P0.x + n.y * P0.y < 0) n = { x: -n.x, y: -n.y };
  const m = add(add(P0, cor, 0.5), n, g.px(18));
  g.text(m, COR, { size: 13, role: 'force', align: 'right', baseline: 'middle', dx: -6 });
}

function drawSide(g: Draw, p: P, t: number, frame: Frame): void {
  const pr = presetOf(p);
  const s = setupOf(p);
  const rel = t >= tRel(p);
  const fs = forces(pr, rel, s);
  const KF = 0.75 / (s.m * G);
  // A cut conical pendulum falls freely; its tangential motion is across the view.
  const fall = pr === 'cone' && rel ? 0.5 * G * (t - tRel(p)) ** 2 * CONE_SCALE : 0;
  const O: Vec2 = { x: OX, y: -fall };
  const axisX = pr === 'cone' ? OX - CONE_SCALE * Math.sin(s.theta) : OX - 1.25;

  // Rotation axis (dash-dot) through the centre of the circle, on the left.
  g.line({ x: axisX, y: -1.05 }, { x: axisX, y: 1.3 }, { color: GREY, width: 1, dash: [8, 3, 2, 3] });

  let at = O; // where the force arrows start
  let foot = O; // banked curve: where the tyres touch the road (friction starts there)
  let slope: Vec2 = { x: 1, y: 0 };
  if (pr === 'string') {
    g.line({ x: axisX - 0.2, y: -g.px(9) }, { x: OX + 0.9, y: -g.px(9) }, { color: BODY, width: 2 });
    g.circle({ x: axisX, y: 0 }, 3.5, { fill: BODY });
    if (!rel) g.line({ x: axisX, y: 0 }, O, { color: BODY, width: 1.25 });
    g.circle(O, 9, { fill: 'position' });
  } else if (pr === 'flat') {
    const road = -0.13;
    const ice = onIce(p, t);
    g.line({ x: axisX - 0.2, y: road }, { x: OX + 0.9, y: road }, { color: ice ? ICE : BODY, width: ice ? 4 : 2 });
    rotRect(g, O, { x: 1, y: 0 }, 0.36, 0.22, 0.2);
    at = O;
  } else if (pr === 'banked') {
    const u = { x: Math.cos(s.theta), y: Math.sin(s.theta) };
    const n = { x: -u.y, y: u.x };
    foot = add(O, n, -0.13);
    slope = u;
    g.polygon([add(foot, u, -1.1), add(foot, u, 0.9), { x: foot.x + 0.9 * u.x, y: -1.0 }, { x: foot.x - 1.1 * u.x, y: -1.0 }], { fill: '#efefef' });
    g.line(add(foot, u, -1.1), add(foot, u, 0.9), { color: BODY, width: 2 });
    rotRect(g, O, u, 0.36, 0.22, 0.2);
  } else {
    const pivot = { x: axisX, y: CONE_SCALE * Math.cos(s.theta) };
    g.line({ x: axisX - 0.3, y: pivot.y }, { x: axisX + 0.3, y: pivot.y }, { color: BODY, width: 3 });
    if (!rel) g.line(pivot, O, { color: BODY, width: 1.25 });
    // After the cut: dashed drop line from the release point.
    else g.line({ x: OX, y: 0 }, O, { color: GREY, width: 1, dash: [3, 4] });
    g.circle(O, 9, { fill: 'position' });
  }

  for (const f of fs) {
    // Inward is to the left in the side view.
    const v = { x: -f.r * KF, y: f.z * KF };
    const from = f.name !== 'f' ? at : pr === 'banked' ? foot : { x: OX, y: -0.13 + g.px(2) };
    // Tension lies along the string, so its label goes beside the arrow, not beyond the tip.
    g.arrow(from, v, { role: 'force', width: 2.25, label: f.name === 'T' || f.name === 'f' ? undefined : FORCE_LABEL[f.name] });
    // Friction runs along the road line: on the flat road label it above the tip; on the bank beyond
    // the tip and below the road, clear of the car and of the centrifugal force above it.
    // A short arrow ends under the car (half length 0.18): then the label goes left of the car.
    if (f.name === 'f' && pr !== 'banked') {
      if (from.x + v.x < OX - 0.18 - g.px(14)) g.text(add(from, v), FORCE_LABEL.f, { size: 13, role: 'force', align: 'center', dy: -12 });
      else g.text({ x: OX - 0.18, y: from.y }, FORCE_LABEL.f, { size: 13, role: 'force', align: 'right', dx: -6, dy: -12 });
    }
    if (f.name === 'f' && pr === 'banked') {
      const len = Math.hypot(v.x, v.y);
      const d = len > 1e-12 ? { x: v.x / len, y: v.y / len } : slope;
      const q = add(add(add(from, v), d, g.px(12)), { x: slope.y, y: -slope.x }, g.px(13));
      g.text(q, FORCE_LABEL.f, { size: 13, role: 'force', align: 'center', baseline: 'middle' });
    }
    if (f.name === 'T') {
      const len = Math.hypot(v.x, v.y);
      let nx = -v.y / len;
      let ny = v.x / len;
      if (ny < 0 || (ny === 0 && nx < 0)) [nx, ny] = [-nx, -ny];
      g.text({ x: from.x + v.x / 2 + nx * g.px(14), y: from.y + v.y / 2 + ny * g.px(14) }, FORCE_LABEL.T, { size: 13, role: 'force', align: 'center', baseline: 'middle' });
    }
    if (frame === 'inertial' && f.r > 1e-9 && f.z > 1e-9) {
      // Tilted force: dashed components; the horizontal one equals mv²/r.
      const name = f.name === 'N' ? '*N*' : '*T*';
      g.arrow(from, { x: v.x, y: 0 }, { role: 'force', width: 1.5, dash: [4, 3] });
      // Beside the tip, clear of the car (banked). Cone: under the component, ending left of the mg
      // arrow; on a small stage, where it does not fit between the axis and mg, left of the axis.
      if (pr === 'banked') g.text({ x: from.x + v.x, y: from.y }, `${name} sin*θ*`, { size: 12, role: 'force', align: 'right', baseline: 'middle', dx: -8 });
      else {
        const fits = (from.x - axisX) / g.px(1) >= 33 + 16;
        g.text({ x: fits ? from.x : axisX, y: from.y }, `${name} sin*θ*`, { size: 12, role: 'force', align: 'right', dx: fits ? -8 : -5, dy: 20 });
      }
      g.line({ x: from.x + v.x, y: from.y }, add(from, v), { role: 'force', width: 1, dash: [2, 3], alpha: 0.6 });
    }
  }
  if (frame === 'rotating') {
    // Centrifugal force, away from the axis (to the right), at the current distance from the axis.
    const q = rotatingViewAt(s, t, tRel(p));
    const { cf } = fictitious(s, q);
    const vec = { x: Math.hypot(cf.x, cf.y) * KF, y: 0 };
    // On the bank the road rises beyond the tip, so the label sits above and right of it.
    if (pr === 'banked') {
      fictArrow(g, at, vec);
      g.text(add(at, vec), CF, { size: 13, role: 'force', align: 'left', baseline: 'middle', dx: 4, dy: -18 });
    } else if (vec.x > g.px(50)) {
      // A long arrow (fast object, or far out after the release): the label above it, ending at the
      // tip, so it stays inside the panel on a narrow stage.
      fictArrow(g, at, vec);
      g.text(add(at, vec), CF, { size: 13, role: 'force', align: 'right', baseline: 'middle', dy: -14 });
    } else fictArrow(g, at, vec, CF);
  } else {
    g.text({ x: SX, y: 1.5 }, tr('ch06.c.side'), { size: 12, color: CAPTION, align: 'center' });
  }
}

/** The real force that supplies the centripetal force, as written in F_net,r = ... */
const SUPPLY: Record<Preset, string> = { string: 'T', flat: 'f_s', banked: 'N\\sin\\theta + f_s\\cos\\theta', cone: 'T\\sin\\theta' };
/** The force that disappears at the release. */
const LOST: Record<Preset, string> = { string: 'T', flat: 'f_s', banked: 'N', cone: 'T' };
const DEG = Math.PI / 180;

/**
 * Σ panel. Inertial frame: mv²/r at the slider speed, what fixes it (flat curve: the friction limit
 * μs mg; banked curve: the design speed and the friction away from it; conical pendulum: the angle
 * from tan θ = v²/(g r) with r = L sin θ) and the real force that supplies it (zero after the release).
 * With the rotating frame shown: ω = v/r and the centrifugal force; on the circle the radial forces
 * in that frame add to zero, after the release the centrifugal and Coriolis forces act on the object.
 * Policy D: v as its slider label, g from the constant table, derived values with 3 figures; the
 * banked-curve friction from v² − v_d² computed directly (R5), the radial sum in the rotating frame
 * an exact 0 (R7a).
 */
export function circularFormula(p: P, t: number): string[] {
  const pr = presetOf(p);
  const st = setupOf(p);
  const rel = t >= tRel(p);
  const need = required(st);
  const Fr = netForce(pr, rel, st).r;
  const m = num(st.m);
  const r = num(st.r);
  const mg = st.m * G;
  const g = CONST.g.tex;
  const v = slider(params[V_KEY[pr]], st.v);
  const lines: string[] = [];
  const mv2r = () => `\\frac{mv^2}{r} = \\frac{${m} \\times ${v}^2}{${r}} = ${tn(need)}${u('N')}`;
  if (pr === 'banked') {
    const vd = designSpeed(st);
    const th = `${num(st.theta / DEG)}^\\circ`;
    lines.push(`v_\\text{d} = \\sqrt{g r\\tan\\theta} = \\sqrt{${g} \\times ${r}\\tan ${th}} = ${tn(vd)}${u('m/s')}`);
    lines.push(mv2r());
    // f_s = m(v² − v_d²) cos θ / r: positive down the slope (above the design speed), negative up it.
    // v² − v_d² near the design speed is a small difference of two close squares: computed directly
    // (v² − g r tan θ) and printed as one number, so the line holds at any speed (policy D, R5).
    const dv2 = st.v * st.v - G * st.r * Math.tan(st.theta);
    const f = (st.m * dv2 * Math.cos(st.theta)) / st.r;
    lines.push(`f_s = \\frac{m\\,(v^2 - v_\\text{d}^2)}{r}\\cos\\theta`, `= \\frac{${m} \\times ${tp(dv2)}}{${r}}\\cos ${th} = ${tn(f)}${u('N')}`);
  } else if (pr === 'cone' && !rel) {
    // The angle follows from the speed (string length fixed); after the cut the pendulum falls.
    const thd = st.theta / DEG;
    lines.push(`\\tan\\theta = \\frac{v^2}{g r},\\; r = L\\sin\\theta \\;\\Rightarrow\\; \\theta = ${tn(thd)}^\\circ`);
    lines.push(`r = L\\sin\\theta = ${num(L_CONE)} \\times \\sin ${tn(thd)}^\\circ = ${tn(st.r)}${u('m')}`);
    lines.push(`\\frac{mv^2}{r} = mg\\tan\\theta = ${m} \\times ${g}\\tan ${tn(thd)}^\\circ = ${tn(need)}${u('N')}`);
  } else lines.push(mv2r());
  lines.push(rel ? `${LOST[pr]} = 0 \\;\\Rightarrow\\; F_{\\text{net},r} = ${tn(Fr)}${u('N')}` : `F_{\\text{net},r} = ${SUPPLY[pr]} = \\frac{mv^2}{r} = ${tn(Fr)}${u('N')}`);
  if (pr === 'flat') {
    // The most static friction the road gives: dry, or ice from the quarter lap on.
    const mu = onIce(p, t) ? MU_ICE : MU_DRY;
    const fmax = mu * mg;
    lines.push(`f_{s,\\text{max}} = \\mu_s mg = ${num(mu)} \\times ${m} \\times ${g} = ${tn(fmax)}${u('N')}${fmax < need ? ' < \\frac{mv^2}{r}' : ' \\ge f_s'}`);
  }
  if (!p.rot) return lines;
  const w = omega(st);
  lines.push(`\\omega = \\frac{v}{r} = \\frac{${v}}{${r}} = ${tn(w)}${u('rad/s')}`);
  const q = rotatingViewAt(st, t, tRel(p));
  const { cf, cor } = fictitious(st, q);
  const Fcf = Math.hypot(cf.x, cf.y);
  if (!rel) {
    lines.push(`F_\\text{cf} = m\\omega^2 r = \\frac{mv^2}{r} = ${tn(Fcf)}${u('N')}`);
    // Both are mv²/r: the difference is a rounding residue and prints as an exact 0 (R7a).
    lines.push(`\\sum F'_r = F_{\\text{net},r} - F_\\text{cf} = ${tn(Fr)} - ${tn(Fcf)} = ${tnScale(Fr - Fcf, need)}${u('N')}`);
    return lines;
  }
  const d = Math.hypot(q.x, q.y);
  const vp = Math.hypot(q.vx, q.vy);
  const Fcor = Math.hypot(cor.x, cor.y);
  // r′: the object's distance from the axis now, larger than the circle's r once released.
  lines.push(`F_\\text{cf} = m\\omega^2 r' = ${m} \\times ${tn(w)}^2 \\times ${tn(d)} = ${tn(Fcf)}${u('N')}`);
  lines.push(`F_\\text{Cor} = 2m\\omega v' = 2 \\times ${m} \\times ${tn(w)} \\times ${tn(vp)} = ${tn(Fcor)}${u('N')}`);
  return lines;
}

export const circular: Scene<P, { t: number; n: number }> = {
  id: 'circular',
  title: 'ch06.c.scene',
  params,
  time: { h: 1 / RATE, recordEvery: 4, frameStep: 0.05, tEnd: (p) => tEnd(p as P) },
  world: PX_WORLD,
  init: () => ({ t: 0, n: 0 }),
  step: (s, _h, p) => {
    s.n += 1;
    s.t = Math.min(s.n / RATE, tEnd(p));
  },
  snapshot: (s) => ({ ...s }),

  draw: (g0, s, p) => {
    const L = layout(g0.vp.w, g0.vp.h, p.rot);
    const frames: Frame[] = p.rot ? ['inertial', 'rotating'] : ['inertial'];
    frames.forEach((f, i) => {
      const box = L.boxes[i];
      const [y0, y1] = SPAN[f];
      const inner = { ...box, t: box.t + STRIP };
      // Stacked: the side view sits one span below the top view, so the pair spans y0 − span … y1,
      // centred on y0, and both views are centred on x = 0.
      const g = L.stack ? panelDraw(g0, inner, L.s, 0, y0) : panelDraw(g0, inner, L.s, (XL + XR + L.shift) / 2, (y0 + y1) / 2);
      const { ctx } = g0;
      ctx.save();
      ctx.beginPath();
      ctx.rect(box.l, box.t, box.r - box.l, box.b - box.t);
      ctx.clip();
      if (f === 'inertial') drawTopInertial(g, p, s.t);
      else drawTopRotating(g, p, s.t);
      drawSide(shifted(g, L.stack ? { x: -SX, y: -(y1 - y0) } : { x: L.shift, y: 0 }), p, s.t, f);
      ctx.restore();
      ctx.save();
      ctx.strokeStyle = EDGE;
      ctx.lineWidth = 1;
      ctx.strokeRect(box.l + 0.5, box.t + 0.5, box.r - box.l - 1, box.b - box.t - 1);
      ctx.restore();
      g0.screenText((box.r - 10) / theme.scale, (box.t + 12) / theme.scale, tr(`ch06.c.frame.${f}`), {
        size: 13,
        color: '#4a4a4a',
        weight: 600,
        align: 'right',
        baseline: 'middle',
      });
    });
  },

  readouts: [
    { label: 'v', unit: 'm/s', value: (s, p) => speedAt(presetOf(p), s.t, tRel(p), setupOf(p)) },
    { label: 'F_{\\text{net},r}', unit: 'N', value: (s, p) => netForce(presetOf(p), s.t >= tRel(p), setupOf(p)).r },
    { label: 'mv^2/r', unit: 'N', value: (_s, p) => required(setupOf(p)) },
  ],

  formula: (s, p) => circularFormula(p, s.t),

  info: {
    goals: ['ch06.c.goal.net', 'ch06.c.goal.notnew', 'ch06.c.goal.rot'],
    observe: [
      'ch06.c.obs.v',
      'ch06.c.obs.string',
      'ch06.c.obs.flat',
      'ch06.c.obs.tilt',
      'ch06.c.obs.bank',
      'ch06.c.obs.cone',
      'ch06.c.obs.cut',
      'ch06.c.obs.rot',
      'ch06.c.obs.fict',
      'ch06.c.obs.car',
      'ch06.c.obs.cor',
    ],
    equations: [
      'F_{\\text{net},r} = \\frac{mv^2}{r}',
      'f_s \\le f_{s,\\text{max}} = \\mu_s mg \\;\\Rightarrow\\; v \\le \\sqrt{\\mu_s g r}',
      'N\\sin\\theta = \\frac{mv^2}{r}, \\; N\\cos\\theta = mg \\;\\Rightarrow\\; v_\\text{d}^2 = g r\\tan\\theta',
      'f_s = \\frac{m(v^2 - v_\\text{d}^2)}{r}\\cos\\theta',
      "\\vec F_\\text{cf} = m\\omega^2 \\vec r, \\quad \\vec F_\\text{Cor} = -2m\\,\\vec\\omega \\times \\vec v'",
      "\\sum \\vec F_\\text{real} + \\vec F_\\text{cf} + \\vec F_\\text{Cor} = m\\vec a'",
    ],
    assumptions: ['ch06.c.assume'],
  },
};
