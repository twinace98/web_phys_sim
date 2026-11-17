// Ch 6 scene: circular motion, drawn at once in two frames.
// Top panel, the inertial (ground) frame: the top view shows the motion and the net force; the side
// view shows only real forces (tension, gravity, normal force, friction). The net force points to
// the centre and equals mv²/r: "centripetal force" names that component, it is not an extra force.
// Bottom panel, the frame rotating with the object (non-inertial): the object rests while the ground
// turns the other way, and the real forces plus the centrifugal force mω²r add to zero. After the
// release the object curves outward and backward under the centrifugal and Coriolis forces.
// Fictitious forces are drawn dashed.
import { t as tr } from '../../core/i18n';
import type { ParamSchema, Scene, Vec2 } from '../../core/types';
import type { Viewport } from '../../core/viewport';
import type { Draw } from '../../draw/draw';
import { theme } from '../../draw/theme';
import { PX_WORLD } from '../modern/frame';
import { G, SETUPS, fictitious, forces, lapTime, netForce, omega, required, rotatingViewAt, topViewAt, type Force, type Preset } from './physics';

type P = { preset: string; cut: boolean; ice: boolean };
type Frame = 'inertial' | 'rotating';

const RATE = 240;
const SX = 3.3; // centre of the side view
const OX = SX + 0.25; // object in the side view
const KV = 0.55; // length of the velocity arrow in the top view [r per v]
const KN = 0.5; // length of a force arrow in the top view [r per mv²/r]
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
const released = (p: P) => {
  const pr = presetOf(p);
  return pr === 'flat' ? p.ice : pr !== 'banked' && p.cut;
};
/** The centripetal force is lost a quarter lap after the start. */
const tRel = (p: P) => (released(p) ? lapTime(SETUPS[presetOf(p)]) / 4 : Infinity);
/**
 * Run end: after the release the object travels TRAVEL radii along the tangent, so it and its
 * velocity arrow stay on stage; the cut conical pendulum also falls, so it stops sooner.
 */
const TRAVEL = 0.95;
const TRAVEL_CONE = 0.7;
const tEnd = (p: P) => {
  const s = SETUPS[presetOf(p)];
  return tRel(p) + ((presetOf(p) === 'cone' ? TRAVEL_CONE : TRAVEL) * s.r) / s.v;
};
/** Side view: world units per metre for the conical pendulum (1 m string drawn 1.4 long). */
const CONE_SCALE = 1.4;

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
};

const add = (a: Vec2, b: Vec2, k = 1): Vec2 => ({ x: a.x + b.x * k, y: a.y + b.y * k });

/** Box in canvas px. */
export type Box = { l: number; t: number; r: number; b: number };

/**
 * The two panels, inertial frame on top and rotating frame below, the common scale [px per r] and
 * how far the side view moves right on a wide stage.
 */
export function layout(w: number, h: number): { boxes: [Box, Box]; s: number; shift: number } {
  const hb = Math.max(1, (h - 2 * PAD - GAP) / 2);
  const span = Math.max(...Object.values(SPAN).map(([a, b]) => b - a));
  const bw = Math.max(1, w - 2 * PAD);
  const s = Math.max(1, Math.min(bw / (XR - XL), (hb - STRIP) / span));
  const shift = Math.min(SHIFT_MAX, Math.max(0, (bw / s - (XR - XL)) / 3));
  // A narrow stage limits the scale by its width: the panels shrink to their content and sit in the middle.
  const hp = Math.min(hb, STRIP + span * s + 2 * FIT);
  const y0 = PAD + (hb - hp);
  const top: Box = { l: PAD, t: y0, r: w - PAD, b: y0 + hp };
  const bot: Box = { l: PAD, t: y0 + hp + GAP, r: w - PAD, b: y0 + 2 * hp + GAP };
  return { boxes: [top, bot], s, shift };
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
 * clear of the ground marks on a small stage too.
 */
function netArrow(g: Draw, P0: Vec2, side: Vec2): void {
  const inward = { x: -P0.x, y: -P0.y };
  const len = Math.hypot(inward.x, inward.y) || 1;
  const u = { x: inward.x / len, y: inward.y / len };
  g.arrow(P0, { x: u.x * KN, y: u.y * KN }, { role: 'force', width: 3.5 });
  const m = add(P0, u, 0.8 * KN);
  g.text(add(m, side, g.px(18)), '*F*_{net}', { size: 13, role: 'force', align: 'center', baseline: 'middle' });
}

function drawTopInertial(g: Draw, p: P, t: number): void {
  const pr = presetOf(p);
  const s = SETUPS[pr];
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

  g.arrow(P0, { x: vhat.x * KV, y: vhat.y * KV }, { role: 'velocity', width: 2.25, label: '*v*' });
  if (k.onCircle && netForce(pr).r > 0) netArrow(g, P0, { x: -vhat.x, y: -vhat.y });
  g.text({ x: 0, y: 1.5 }, tr('ch06.c.top'), { size: 12, color: CAPTION, align: 'center' });
}

function drawTopRotating(g: Draw, p: P, t: number): void {
  const pr = presetOf(p);
  const s = SETUPS[pr];
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

  const F0 = required(s);
  const f = fictitious(s, q);
  if (q.onCircle) {
    // At rest: the real net force and the centrifugal force cancel.
    netArrow(g, P0, { x: -head.x, y: -head.y });
    fictArrow(g, P0, { x: (f.cf.x / F0) * KN, y: (f.cf.y / F0) * KN }, CF);
    return;
  }
  fictArrow(g, P0, { x: (f.cf.x / F0) * KN, y: (f.cf.y / F0) * KN }, CF);
  // The Coriolis arrow starts nearly along the circle, pointing backward: its label goes beside the
  // middle on the side away from the axis, extending away from the centrifugal arrow.
  const cor = { x: (f.cor.x / F0) * KN, y: (f.cor.y / F0) * KN };
  fictArrow(g, P0, cor);
  const len = Math.hypot(cor.x, cor.y);
  if (len < 1e-12) return;
  let n = { x: -cor.y / len, y: cor.x / len };
  if (n.x * P0.x + n.y * P0.y < 0) n = { x: -n.x, y: -n.y };
  const m = add(add(P0, cor, 0.5), n, g.px(18));
  g.text(m, COR, { size: 13, role: 'force', align: 'right', baseline: 'middle', dx: -6 });
}

function drawSide(g: Draw, p: P, t: number, frame: Frame): void {
  const pr = presetOf(p);
  const s = SETUPS[pr];
  const rel = t >= tRel(p);
  const fs = forces(pr, rel);
  const KF = 0.75 / (s.m * G);
  // A cut conical pendulum falls freely; its tangential motion is across the view.
  const fall = pr === 'cone' && rel ? 0.5 * G * (t - tRel(p)) ** 2 * CONE_SCALE : 0;
  const O: Vec2 = { x: OX, y: -fall };
  const axisX = pr === 'cone' ? OX - CONE_SCALE * Math.sin(s.theta) : OX - 1.25;

  // Rotation axis (dash-dot) through the centre of the circle, on the left.
  g.line({ x: axisX, y: -1.05 }, { x: axisX, y: 1.3 }, { color: GREY, width: 1, dash: [8, 3, 2, 3] });

  let at = O; // where the force arrows start
  if (pr === 'string') {
    g.line({ x: axisX - 0.2, y: -g.px(9) }, { x: OX + 0.9, y: -g.px(9) }, { color: BODY, width: 2 });
    g.circle({ x: axisX, y: 0 }, 3.5, { fill: BODY });
    if (!rel) g.line({ x: axisX, y: 0 }, O, { color: BODY, width: 1.25 });
    g.circle(O, 9, { fill: 'position' });
  } else if (pr === 'flat') {
    const road = -0.13;
    g.line({ x: axisX - 0.2, y: road }, { x: OX + 0.9, y: road }, { color: rel ? ICE : BODY, width: rel ? 4 : 2 });
    rotRect(g, O, { x: 1, y: 0 }, 0.36, 0.22, 0.2);
    at = O;
  } else if (pr === 'banked') {
    const u = { x: Math.cos(s.theta), y: Math.sin(s.theta) };
    const n = { x: -u.y, y: u.x };
    const foot = add(O, n, -0.13);
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
    const from = f.name === 'f' ? { x: OX, y: -0.13 + g.px(2) } : at;
    // Tension lies along the string, so its label goes beside the arrow, not beyond the tip.
    g.arrow(from, v, { role: 'force', width: 2.25, label: f.name === 'T' || f.name === 'f' ? undefined : FORCE_LABEL[f.name] });
    // Friction runs along the road line: label it above the tip.
    if (f.name === 'f') g.text(add(from, v), FORCE_LABEL.f, { size: 13, role: 'force', align: 'center', dy: -12 });
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
    } else fictArrow(g, at, vec, CF);
  } else {
    g.text({ x: SX, y: 1.5 }, tr('ch06.c.side'), { size: 12, color: CAPTION, align: 'center' });
  }
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
    const { boxes, s: sc, shift } = layout(g0.vp.w, g0.vp.h);
    (['inertial', 'rotating'] as const).forEach((f, i) => {
      const box = boxes[i];
      const [y0, y1] = SPAN[f];
      const g = panelDraw(g0, { ...box, t: box.t + STRIP }, sc, (XL + XR + shift) / 2, (y0 + y1) / 2);
      const { ctx } = g0;
      ctx.save();
      ctx.beginPath();
      ctx.rect(box.l, box.t, box.r - box.l, box.b - box.t);
      ctx.clip();
      if (f === 'inertial') drawTopInertial(g, p, s.t);
      else drawTopRotating(g, p, s.t);
      drawSide(shifted(g, { x: shift, y: 0 }), p, s.t, f);
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
    { label: 'v', unit: 'm/s', value: (_s, p) => SETUPS[presetOf(p)].v },
    { label: 'F_{\\text{net},r}', unit: 'N', value: (s, p) => netForce(presetOf(p), s.t >= tRel(p)).r },
    { label: 'mv^2/r', unit: 'N', value: (_s, p) => required(SETUPS[presetOf(p)]) },
  ],

  info: {
    goals: ['ch06.c.goal.net', 'ch06.c.goal.notnew', 'ch06.c.goal.rot'],
    observe: ['ch06.c.obs.string', 'ch06.c.obs.flat', 'ch06.c.obs.tilt', 'ch06.c.obs.cut', 'ch06.c.obs.rot', 'ch06.c.obs.cor'],
    equations: [
      'F_{\\text{net},r} = \\frac{mv^2}{r}',
      'N\\sin\\theta = \\frac{mv^2}{r}, \\; N\\cos\\theta = mg \\;\\Rightarrow\\; v^2 = g r\\tan\\theta',
      "\\vec F_\\text{cf} = m\\omega^2 \\vec r, \\quad \\vec F_\\text{Cor} = -2m\\,\\vec\\omega \\times \\vec v'",
      "\\sum \\vec F_\\text{real} + \\vec F_\\text{cf} + \\vec F_\\text{Cor} = m\\vec a'",
    ],
    assumptions: ['ch06.c.assume'],
  },
};
