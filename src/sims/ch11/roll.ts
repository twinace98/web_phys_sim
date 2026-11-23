// Ch 11 scene: rolling down an incline. A hoop, a disk and a solid sphere roll without slipping
// on parallel lanes of the same incline; a block slides without friction as a reference. All start
// from rest together. a = g sin θ / (1 + β) with β = I / (M R²), so the order is fixed by the mass
// distribution alone. One body (chosen) shows the velocities of its contact point, centre and top,
// or, with the free-body diagram, the forces on it: Mg, N and the static friction f_s up the incline.
// Each lane is tagged with its body's β and a; numbered badges mark the arrivals at the finish.
import { t as tr } from '../../core/i18n';
import { CONST, num, slider, tn, u } from '../../core/tex';
import type { ParamSchema, Scene, Vec2 } from '../../core/types';
import type { Draw, PlotDraw } from '../../draw/draw';
import { FBD_MIN_PX, drawFbd, fbdParam, fbdScale, type FbdForce } from '../../draw/fbd';
import { drawRich, measureRich } from '../../draw/text';
import { ROLE_COLOR, theme } from '../../draw/theme';
import { fmt } from '../../core/format';
import { Recorder, textBox } from './place';
import { BETA, BODIES, G, finishTime, pointVelocity, rollAccel, rollState, type Body, type Incline } from './physics';

type P = { theta: number; focus: string; fbd: boolean };

interface S {
  t: number;
  n: number;
}

const RATE = 240;
const H = 1 / RATE;
const LEN = 1.6; // run along the incline [m]
const R = 0.12; // radius of the round bodies [m]
export const M = 1; // mass of every body [kg]
const GAP = 0.5; // lane spacing, perpendicular to the incline [m]
const STRIP = 0.04; // lane thickness [m]
const EXT = R + 0.08; // lane beyond the finish line, so a body stopped there sits on it [m]
const BACK = R + 0.08; // lane behind the start [m]
const RUN_OUT = 0.3; // floor beyond the foot of the incline [m]
const LEFT = 0.95; // room left of the lanes for the tags (name, β, a) [m]
const ARROW_MAX = 0.5; // longest velocity arrow (top of the sphere at the finish) [m]

/** Lanes from the bottom up. */
const LANES: Body[] = ['block', 'sphere', 'disk', 'hoop'];
export const BODY_COLOR: Record<Body, string> = { hoop: '#0072B2', disk: '#009E73', sphere: '#CC79A7', block: '#7a7a7a' };
const DASH: Record<Body, number[]> = { hoop: [], disk: [7, 4], sphere: [2, 3], block: [9, 3, 2, 3] };
const K_TRANS = ROLE_COLOR.energyK;
const K_ROT = '#0072B2';
const LANE_FILL = '#ededed';
const LANE_EDGE = '#b5b5b5';
const LABEL_PX = 44; // width of the 'v = 0' label [px]

const ramp = (p: P): Incline => ({ theta: (p.theta * Math.PI) / 180, len: LEN, R, M });
const focusOf = (p: P): Body => ((BODIES as string[]).includes(p.focus) ? (p.focus as Body) : 'disk');
/** The run ends just after the last body (the hoop) crosses the line, so its end dot shows in the plot. */
const tEndOf = (p: P) => 1.03 * Math.max(...BODIES.map((b) => finishTime(ramp(p), b)));

/** Unit vectors down the incline (u) and out of its surface (n); the foot of lane 0 is the origin. */
function frame(p: P) {
  const th = ramp(p).theta;
  const u: Vec2 = { x: Math.cos(th), y: -Math.sin(th) };
  const n: Vec2 = { x: Math.sin(th), y: Math.cos(th) };
  const start = (i: number): Vec2 => ({ x: -(LEN + EXT) * u.x + i * GAP * n.x, y: -(LEN + EXT) * u.y + i * GAP * n.y });
  /** Point at distance s along lane i, h above its surface. */
  const at = (i: number, s: number, h = 0): Vec2 => {
    const o = start(i);
    return { x: o.x + s * u.x + h * n.x, y: o.y + s * u.y + h * n.y };
  };
  return { th, u, n, at };
}

/** Finish speed √(2 g h / (1 + β)). */
const vFinish = (p: P, b: Body) => Math.sqrt((2 * G * LEN * Math.sin(ramp(p).theta)) / (1 + BETA[b]));
/** Velocity-arrow scale: the fastest top point (sphere at the finish, 2 v) gets ARROW_MAX. */
const arrowScale = (p: P) => ARROW_MAX / (2 * vFinish(p, 'sphere'));

const params: ParamSchema<P> = {
  theta: { kind: 'number', label: 'ch11.r.p.theta', desc: 'ch11.r.d.theta', group: 'main', live: false, control: 'slider', min: 5, max: 40, step: 1, default: 30, unit: '°' },
  focus: {
    kind: 'select',
    label: 'ch11.r.p.focus',
    desc: 'ch11.r.d.focus',
    group: 'main',
    live: true,
    default: 'disk',
    options: BODIES.map((b) => ({ value: b, label: `ch11.r.body.${b}` })),
  },
  fbd: fbdParam(),
};

/**
 * Forces on the chosen body [N] (x right, y up): weight, the normal force of the lane and, for the
 * round bodies, the static friction up the incline from the same solution as a (the block slides
 * without friction). Their sum is M a down the incline.
 */
export function fbdForces(p: P): FbdForce[] {
  const b = focusOf(p);
  const { th, u, n } = frame(p);
  const W = M * G;
  const N = W * Math.cos(th);
  const out: FbdForce[] = [
    { F: { x: 0, y: -W }, label: '*M**g*', field: true },
    { F: { x: N * n.x, y: N * n.y }, label: '*N*' },
  ];
  if (b !== 'block') {
    const f = rollAccel(BETA[b], th).f * M;
    out.push({ F: { x: -f * u.x, y: -f * u.y }, label: '*f*_{s}' });
  }
  return out;
}

/**
 * Px per newton for the run: the weight, the largest force on any body, gets at most 56 px and 0.8 of
 * the lane spacing (on a small stage the arrows stay near their own lane), and less where Mg below the
 * finish or N above the start would reach the edge of the stage with its label.
 */
export function fbdPerN(g: Draw, p: P): number {
  const { th, at } = frame(p);
  const i = LANES.indexOf(focusOf(p));
  const [, yTop] = g.vp.toWorld(0, 0);
  const [, yBot] = g.vp.toWorld(0, g.vp.h);
  const label = 20;
  const below = (at(i, LEN, R).y - yBot) / g.px(1) - label;
  // N = Mg cos θ rises cos θ of its length; its label sits above the tip.
  const above = ((yTop - at(i, 0, R).y) / g.px(1) - label) / Math.cos(th) ** 2;
  return fbdScale(M * G, Math.max(20, Math.min(56, (0.8 * GAP) / g.px(1), below, above)));
}

function drawLanes(g: Draw, p: P): void {
  const { th, n, at } = frame(p);
  // Lane 0 is the top of a wedge standing on the floor; the others are rails above it.
  const a0 = at(0, -BACK);
  g.polygon([a0, { x: 0, y: 0 }, { x: a0.x, y: 0 }], { fill: LANE_FILL, color: LANE_EDGE, width: 1 });
  g.line({ x: a0.x, y: 0 }, { x: RUN_OUT, y: 0 }, { color: LANE_EDGE, width: 1.5 });
  for (let i = 1; i < LANES.length; i++) {
    const a = at(i, -BACK);
    const b = at(i, LEN + EXT);
    const d = { x: -n.x * STRIP, y: -n.y * STRIP };
    g.polygon([a, b, { x: b.x + d.x, y: b.y + d.y }, { x: a.x + d.x, y: a.y + d.y }], { fill: LANE_FILL, color: LANE_EDGE, width: 1 });
  }
  // Finish line across every lane.
  g.line(at(0, LEN), at(LANES.length - 1, LEN, 2 * R + 0.06), { color: '#9a9a9a', width: 1.25, dash: [5, 4] });
  // Incline angle at the foot of the wedge.
  // A shallow wedge is too thin for the label inside, and above the incline the block and its
  // arrows pass by: the label then sits under the floor, below the arc.
  const shallow = th < (14 * Math.PI) / 180;
  g.arc({ x: 0, y: 0 }, 30, Math.PI - th, Math.PI, { color: '#5c5c5c', width: 1.25 });
  if (shallow) {
    g.text({ x: -g.px(30), y: 0 }, '*θ*', { size: 13, color: '#5c5c5c', align: 'center', baseline: 'top', dy: 4 });
  } else {
    const la = Math.PI - th / 2;
    const lr = g.px(44);
    g.text({ x: lr * Math.cos(la), y: lr * Math.sin(la) }, '*θ*', { size: 13, color: '#5c5c5c', align: 'center', baseline: 'middle' });
  }
  // Tags behind the start of each lane: name and β, then a. Right edge clear of the lane's end cap
  // (its lower corner is the leftmost point).
  LANES.forEach((b, i) => {
    const [l1, l2] = tagLines(p, b);
    const q = { x: at(i, -BACK, -STRIP).x - g.px(5) - g.px(tagShift(g, p, b)), y: at(i, -BACK, R).y };
    const st = { size: 12, color: BODY_COLOR[b], align: 'right' as const, baseline: 'middle' as const, weight: b === focusOf(p) ? 700 : 500 };
    g.text(q, l1, { ...st, dy: -7 });
    g.text(q, l2, { ...st, dy: 7 });
  });
}

/**
 * How far [px] the chosen body's tag moves left under its free-body diagram, so that it clears the
 * friction label as the body leaves the start (fixed for the run, so the tag does not slide).
 */
function tagShift(g: Draw, p: P, b: Body): number {
  if (!p.fbd || b !== focusOf(p) || b === 'block') return 0;
  const sc = theme.scale;
  const { at } = frame(p);
  const i = LANES.indexOf(b);
  const fs = fbdForces(p)[2];
  const mag = Math.hypot(fs.F.x, fs.F.y);
  const ux = fs.F.x / mag;
  const uy = fs.F.y / mag;
  const len = Math.max(mag * fbdPerN(g, p), FBD_MIN_PX) * sc;
  const [cx, cy] = g.vp.toPx(at(i, 0, R).x, at(i, 0, R).y);
  const lab = textBox(g.ctx, fs.label, cx + ux * len - 5 * sc, cy - uy * len - uy * 8 * sc, { size: 13, align: 'right', baseline: 'middle' });
  const [xr, ya] = g.vp.toPx(at(i, -BACK, -STRIP).x - g.px(5), at(i, -BACK, R).y);
  const h = 12 * 1.2 * sc;
  const [y0, y1] = [ya - 7 * sc - h / 2, ya + 7 * sc + h / 2];
  if (y1 <= lab.y0 || lab.y1 <= y0) return 0;
  return Math.max(0, xr - (lab.x0 - 3 * sc)) / sc;
}

/**
 * One body. `a` < 1 fades it: the chosen body under its free-body diagram (0.35, so the arrows from
 * its centre read) and the other bodies while the diagram is shown (0.5, so labels over them read).
 */
function drawBody(g: Draw, p: P, b: Body, i: number, t: number, a = 1): void {
  const { n, at } = frame(p);
  const k = rollState(ramp(p), b, t);
  const col = BODY_COLOR[b];
  if (b === 'block') {
    const c0 = at(i, k.s - R);
    const c1 = at(i, k.s + R);
    const c2 = at(i, k.s + R, 2 * R);
    const c3 = at(i, k.s - R, 2 * R);
    g.polygon([c0, c1, c2, c3], { fill: col, fillAlpha: 0.3 * a, color: col, width: 1.75, alpha: a });
    return;
  }
  const c = at(i, k.s, R);
  const rPx = R / g.px(1);
  const mark = { x: Math.cos(k.phi) * n.x - Math.sin(k.phi) * n.y, y: Math.sin(k.phi) * n.x + Math.cos(k.phi) * n.y };
  const rim = { x: c.x + R * mark.x, y: c.y + R * mark.y };
  if (b === 'hoop') {
    g.circle(c, rPx - 2, { color: col, width: 4, alpha: a });
    g.line(c, rim, { color: col, width: 1.5, alpha: a });
  } else if (b === 'disk') {
    g.circle(c, rPx, { fill: col, alpha: 0.3 * a, color: col, width: 1.75 });
    g.circle(c, rPx * 0.25, { color: col, width: 1.25, alpha: a });
    g.line(c, rim, { color: '#1a1a1a', width: 1.75, alpha: a });
  } else {
    // Solid sphere: shaded so it reads as a ball, not a flat disk.
    if (!dry(g)) {
      const { ctx } = g;
      const [x, y] = g.vp.toPx(c.x, c.y);
      const rr = Math.max(1, rPx);
      const grad = ctx.createRadialGradient(x - rr * 0.35, y - rr * 0.35, rr * 0.1, x, y, rr);
      grad.addColorStop(0, '#ffffff');
      grad.addColorStop(1, col);
      ctx.save();
      ctx.globalAlpha = 0.75 * a;
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(x, y, rr, 0, 2 * Math.PI);
      ctx.fill();
      ctx.restore();
    }
    g.circle(c, rPx, { color: col, width: 1.75, alpha: a });
    g.line(c, rim, { color: '#1a1a1a', width: 1.75, alpha: a });
  }
  if (a === 1) g.circle(c, 2, { fill: '#1a1a1a' });
}

/** Velocities of the contact point, the centre and the top of the chosen body. */
function drawVelocities(g: Draw, p: P, t: number): void {
  const b = focusOf(p);
  const i = LANES.indexOf(b);
  const { u, n, at } = frame(p);
  const k = rollState(ramp(p), b, t);
  const kv = arrowScale(p);
  const vcm = { x: k.v * u.x, y: k.v * u.y };
  const wz = -k.w; // rolling down to the right turns clockwise
  const pts: { h: number; label: string }[] = [
    { h: 0, label: '' },
    { h: R, label: '*v*_{cm}' },
    { h: 2 * R, label: b === 'block' ? '' : '2*v*_{cm}' },
  ];
  for (const q of pts) {
    const at0 = at(i, k.s, q.h);
    const rel = { x: (q.h - R) * n.x, y: (q.h - R) * n.y };
    const v = b === 'block' ? vcm : pointVelocity(vcm, wz, rel);
    const sp = Math.hypot(v.x, v.y);
    if (q.h === 0 && sp < 1e-9) {
      // Contact point momentarily at rest.
      g.circle(at0, 3.5, { fill: 'velocity' });
      // Label lying on the lane just behind the body (text along the incline, so it never cuts
      // the lane or reaches the lane above). Shown once it has room after the lane start.
      const back = R + g.px(4);
      if (k.s - back - g.px(LABEL_PX) > -BACK + g.px(4)) {
        const [x, y] = g.vp.toPx(at0.x - u.x * back + n.x * g.px(2), at0.y - u.y * back + n.y * g.px(2));
        const { ctx } = g;
        const label = '*v* = 0';
        const lst = { size: 12, color: ROLE_COLOR.velocity, align: 'right' as const, baseline: 'bottom' as const };
        if (!dry(g)) {
          ctx.save();
          ctx.translate(x, y);
          ctx.rotate(ramp(p).theta);
          drawRich(ctx, label, 0, 0, lst);
          ctx.restore();
        }
        const w = measureRich(ctx, label, lst);
        if (g instanceof Recorder) {
          const th = ramp(p).theta;
          const hh = 12 * 1.2 * theme.scale;
          g.keep(
            [
              [-w, -hh],
              [0, -hh],
              [0, 0],
              [-w, 0],
            ].map(([a, b]) => [x + a * Math.cos(th) - b * Math.sin(th), y + a * Math.sin(th) + b * Math.cos(th)] as [number, number]),
          );
        }
      }
      continue;
    }
    const tip = { x: at0.x + v.x * kv, y: at0.y + v.y * kv };
    g.arrow(at0, { x: v.x * kv, y: v.y * kv }, { role: 'velocity', width: 2.25 });
    if (!q.label) continue;
    if (q.h === R) {
      // Centre: beyond the tip, once the tip clears the rim (else the label would sit on the body).
      if (sp * kv > R + g.px(8)) {
        g.text({ x: tip.x + u.x * g.px(16), y: tip.y + u.y * g.px(16) }, q.label, { size: 13, role: 'velocity', align: 'center', baseline: 'middle' });
      }
    } else if (sp * kv > g.px(16)) {
      // Top: above the tip, so it stays clear of the centre label whatever the arrow lengths.
      g.text({ x: tip.x + n.x * g.px(12), y: tip.y + n.y * g.px(12) }, q.label, { size: 13, role: 'velocity', align: 'center', baseline: 'middle' });
    }
  }
}

/** Pale wide band under the chosen trace (style cue beyond colour). */
function band(pd: PlotDraw, pts: [number, number][], color: string): void {
  pd.polyline(pts, { color, width: 7, alpha: 0.22 });
}

function curve(f: (t: number) => number, t1: number): [number, number][] {
  const pts: [number, number][] = [];
  for (let i = 0; i <= 80; i++) {
    const tt = (t1 * i) / 80;
    pts.push([tt, f(tt)]);
  }
  return pts;
}

/** β of each body as an exact fraction. */
const BETA_TEX: Record<Body, string> = { hoop: '1', disk: '\\tfrac12', sphere: '\\tfrac25', block: '0' };
/** β as written on the stage. */
const BETA_TXT: Record<Body, string> = { hoop: '1', disk: '1/2', sphere: '2/5', block: '0' };

/** The two lines of a lane tag: name and β, then the acceleration. */
export function tagLines(p: P, b: Body): [string, string] {
  return [`${tr(`ch11.r.tag.${b}`)} *β* = ${BETA_TXT[b]}`, `*a* = ${fmt(rollAccel(BETA[b], ramp(p).theta).a, 3)} m/s²`];
}

/** Finish order (1 first) of each body; the order is fixed by β. */
export const finishOrder = (b: Body) => [...BODIES].sort((x, y) => BETA[x] - BETA[y]).indexOf(b) + 1;
const BADGE = 7; // radius of the finish-order badge [px]

/** A Recorder that only measures. */
const dry = (g: Draw) => g instanceof Recorder && g.dry;

/** Everything on the stage except the tags' finish marks, at time t. */
function drawScene(g: Draw, p: P, t: number): void {
  drawLanes(g, p);
  const f = focusOf(p);
  LANES.forEach((b, i) => drawBody(g, p, b, i, t, !p.fbd ? 1 : b === f ? 0.35 : 0.5));
  drawArrows(g, p, t);
}

/** The chosen body's velocity arrows or, with the diagram on, its free-body diagram. */
function drawArrows(g: Draw, p: P, t: number): void {
  if (!p.fbd) {
    drawVelocities(g, p, t);
    return;
  }
  // Free-body diagram of the chosen body from its centre; its velocity arrows would cross the
  // friction and weight arrows, so they give way.
  const f = focusOf(p);
  const i = LANES.indexOf(f);
  drawFbd(g, frame(p).at(i, rollState(ramp(p), f, t).s, R), fbdForces(p), fbdPerN(g, p));
}

let marksKey = '';
let marksMemo: Map<Body, Vec2> = new Map();

/**
 * Centres (world) of the finish-order badges, beside the finish end of each lane. Chosen once per
 * setting from the final picture (every body stopped at the line) plus the chosen body's arrows on
 * their way to the line after the first finish, so a badge never moves and nothing passes over it. Spots in
 * order of preference: behind and above the stopped body (three distances back), on the lane's line
 * past its end, under the lane past its end (under the floor for the wedge), above the body. All
 * lanes take the first spot that is clear for every lane; failing that, each lane its own first
 * clear spot.
 */
export function finishBadges(g: Draw, p: P): Map<Body, Vec2> {
  const key = [p.theta, focusOf(p), p.fbd, g.vp.w, g.vp.h, g.vp.scale, theme.scale, ...BODIES.map((b) => tr(`ch11.r.tag.${b}`))].join('|');
  if (key === marksKey) return marksMemo;
  const rec = new Recorder(g, true);
  drawScene(rec, p, tEndOf(p));
  // The chosen body's arrows and labels sweep past the finish after the first body has stopped there.
  const t0 = finishTime(ramp(p), 'block');
  const t1 = finishTime(ramp(p), focusOf(p));
  for (let j = 0; j <= 40 && t1 > t0; j++) drawArrows(rec, p, t0 + ((t1 - t0) * j) / 40);
  const { u, n, at } = frame(p);
  const r = (BADGE + 1.5) * theme.scale;
  const step = (q: Vec2, d: Vec2, k: number): Vec2 => ({ x: q.x + d.x * g.px(k), y: q.y + d.y * g.px(k) });
  // Height of the free band above a stopped body: halfway between its top and the lane above.
  const hMid = (2 * R + GAP - STRIP) / 2;
  const spots: ((i: number) => Vec2)[] = [
    (i) => step(at(i, LEN - R, hMid), u, -(4 + BADGE)),
    (i) => step(at(i, LEN - R, hMid), u, -(22 + BADGE)),
    (i) => step(at(i, LEN - R, hMid), u, -(40 + BADGE)),
    (i) => step(at(i, LEN + EXT), u, 5 + BADGE),
    (i) => step(step(at(i, LEN + EXT, -STRIP), u, BADGE), n, -(3 + BADGE)),
    (i) => step(at(i, LEN + R, hMid), u, 4 + BADGE),
  ];
  const ok = (q: Vec2, taken: Vec2[]) => {
    const [x, y] = rec.toPx(q);
    return rec.clearDisc(x, y, r) && taken.every((o) => Math.hypot(...([0, 1].map((j) => rec.toPx(o)[j] - [x, y][j]) as [number, number])) >= 2 * r);
  };
  let out: Map<Body, Vec2> | null = null;
  for (const spot of spots) {
    const qs = LANES.map((_, i) => spot(i));
    if (qs.every((q, j) => ok(q, qs.slice(0, j)))) {
      out = new Map(LANES.map((b, i) => [b, qs[i]]));
      break;
    }
  }
  if (!out) {
    const taken: Vec2[] = [];
    out = new Map();
    LANES.forEach((b, i) => {
      const q = spots.map((s) => s(i)).find((x) => ok(x, taken)) ?? spots[0](i);
      taken.push(q);
      out!.set(b, q);
    });
  }
  marksKey = key;
  marksMemo = out;
  return out;
}

/** K_rot / K_trans readout: β before the start, when both are zero. */
export function kRatio(s: S, p: P): number {
  const k = rollState(ramp(p), focusOf(p), s.t);
  return k.Kt > 0 ? k.Kr / k.Kt : BETA[focusOf(p)];
}

/**
 * Σ panel for the chosen body: a and the static friction from Newton's law plus the rolling
 * condition, v_cm = √(2 a s) (from rest), ω = v_cm / R and K_rot / K_trans = β. θ as its slider
 * label, g from the constant table, state values with 3 figures (policy D, R1/R3).
 */
export function formulaLines(s: S, p: P): string[] {
  const b = focusOf(p);
  const rp = ramp(p);
  const k = rollState(rp, b, s.t);
  const { f } = rollAccel(BETA[b], rp.theta);
  const be = BETA_TEX[b];
  const gs = `${CONST.g.tex}\\sin ${slider(params.theta, p.theta)}^\\circ`;
  // The block slides without friction: a = g sin θ, and no f_s, ω or K_rot.
  const lines =
    b === 'block'
      ? [`a = g\\sin\\theta = ${gs} = ${tn(k.a)}${u('m/s^2')}`]
      : [
          `a = \\frac{g\\sin\\theta}{1 + \\beta} = \\frac{${gs}}{1 + ${be}} = ${tn(k.a)}${u('m/s^2')}`,
          `f_s = \\frac{\\beta}{1 + \\beta} Mg\\sin\\theta`,
          `= \\frac{${be}}{1 + ${be}}(${num(M)})(${gs}) = ${tn(f * M)}${u('N')}`,
        ];
  if (p.fbd) {
    // Net force along the incline from the drawn forces (N and the perpendicular part of Mg cancel).
    const W = M * G * Math.sin(rp.theta);
    lines.push(
      b === 'block'
        ? `\\Sigma F = Mg\\sin\\theta = ${tn(W)}${u('N')} = Ma`
        : `\\Sigma F = Mg\\sin\\theta - f_s = ${tn(W)} - ${tn(f * M)} = ${tn(W - f * M)}${u('N')} = Ma`,
    );
  }
  lines.push(`v_\\mathrm{cm} = \\sqrt{2as} = \\sqrt{2(${tn(k.a)})(${tn(k.s)})} = ${tn(k.v)}${u('m/s')}`);
  if (b !== 'block') {
    lines.push(`\\omega = \\frac{v_\\mathrm{cm}}{R} = \\frac{${tn(k.v)}}{${num(R)}} = ${tn(k.w)}${u('rad/s')}`);
    lines.push(`\\frac{K_\\mathrm{rot}}{K_\\mathrm{trans}} = \\frac{I_\\mathrm{cm}}{MR^2} = \\beta = ${be} = ${tn(kRatio(s, p))}`);
  }
  return lines;
}

export const rollScene: Scene<P, S> = {
  id: 'roll',
  title: 'ch11.r.scene',
  params,
  time: { h: H, recordEvery: 2, frameStep: 0.02, scale: 0.5, tEnd: (p) => tEndOf(p as P) },
  world: (p) => {
    const q = p as P;
    const { at } = frame(q);
    const kv = arrowScale(q);
    const pts: Vec2[] = [{ x: RUN_OUT, y: 0 }, at(0, -BACK)];
    LANES.forEach((b, i) => {
      // Lane ends, body tops, and the reach of the top arrow (2 v at the finish) plus its label.
      const reach = LEN + (b === 'block' ? 1 : 2) * vFinish(q, b) * kv + 0.25;
      pts.push(at(i, -BACK, 2 * R + 0.06), at(i, LEN + EXT, 2 * R + 0.06), at(i, -BACK), at(i, reach, 2 * R));
    });
    const xs = pts.map((q) => q.x);
    const ys = pts.map((q) => q.y);
    return { x: [Math.min(...xs) - LEFT, Math.max(...xs) + 0.05], y: [Math.min(0, ...ys) - 0.15, Math.max(...ys) + 0.05], aspect: 'contain', padPx: 14 };
  },

  init: () => ({ t: 0, n: 0 }),
  step: (s) => {
    s.n += 1;
    s.t = s.n * H;
  },

  record: (s, p) => {
    const r = ramp(p);
    const f = rollState(r, focusOf(p), s.t);
    return {
      t: s.t,
      vh: rollState(r, 'hoop', s.t).v,
      vd: rollState(r, 'disk', s.t).v,
      vs: rollState(r, 'sphere', s.t).v,
      vb: rollState(r, 'block', s.t).v,
      Kt: f.Kt,
      Kr: f.Kr,
    };
  },
  snapshot: (s) => ({ ...s }),

  draw: (g, s, p) => {
    drawScene(g, p, s.t);
    // Finish order, once a body has crossed the line.
    const badges = finishBadges(g, p);
    for (const b of LANES) {
      if (!rollState(ramp(p), b, s.t).done) continue;
      const c = badges.get(b)!;
      g.circle(c, BADGE, { fill: BODY_COLOR[b] });
      g.text(c, String(finishOrder(b)), { size: 11, color: '#ffffff', align: 'center', baseline: 'middle', weight: 700 });
    }
  },

  plots: [
    {
      id: 'v',
      label: 'v_\\mathrm{cm}\\,(\\mathrm{m/s})',
      traces: [],
      yRange: (p) => [0, Math.sqrt(2 * G * LEN * Math.sin(ramp(p).theta)) * 1.12],
    },
    {
      id: 'K',
      label: `\\textcolor{${K_TRANS}}{K_\\mathrm{trans}},\\ \\textcolor{${K_ROT}}{K_\\mathrm{rot}}\\,(\\mathrm{J})`,
      traces: [],
      yRange: (p) => [0, M * G * LEN * Math.sin(ramp(p).theta) * 1.1],
    },
  ],

  drawPlot: (id, pd, p, ui) => {
    const r = ramp(p);
    const f = focusOf(p);
    if (id === 'v') {
      // Chosen body last, so it lies on top.
      for (const b of [...BODIES.filter((x) => x !== f), f]) {
        const tf = finishTime(r, b);
        const t1 = Math.min(ui.t, tf);
        if (t1 <= 0) continue;
        const pts = curve((tt) => rollState(r, b, tt).v, t1);
        if (b === f) band(pd, pts, BODY_COLOR[b]);
        pd.polyline(pts, { color: BODY_COLOR[b], width: b === f ? 2.5 : 1.75, dash: DASH[b] });
        if (ui.t >= tf) pd.dot(tf, rollState(r, b, tf).v, { color: BODY_COLOR[b], r: b === f ? 4 : 3 });
      }
    } else if (id === 'K') {
      const tf = finishTime(r, f);
      const t1 = Math.min(ui.t, tf);
      if (t1 <= 0) return;
      const kt = curve((tt) => rollState(r, f, tt).Kt, t1);
      band(pd, kt, K_TRANS);
      pd.polyline(kt, { color: K_TRANS, width: 2 });
      pd.polyline(
        curve((tt) => rollState(r, f, tt).Kr, t1),
        { color: K_ROT, width: 2, dash: [6, 4] },
      );
    }
  },

  readouts: [
    { label: 'a', unit: 'm/s²', value: (s, p) => rollState(ramp(p), focusOf(p), s.t).a },
    { label: 'v_\\mathrm{cm}', unit: 'm/s', value: (s, p) => rollState(ramp(p), focusOf(p), s.t).v },
    {
      label: 'K_\\mathrm{rot}/K_\\mathrm{trans}',
      unit: '',
      value: (s, p) => kRatio(s, p),
    },
  ],

  formula: (s, p) => formulaLines(s, p),

  info: {
    goals: ['ch11.r.goal.roll', 'ch11.r.goal.race'],
    observe: ['ch11.r.obs.contact', 'ch11.r.obs.order', 'ch11.r.obs.split', 'ch11.r.obs.mass', 'ch11.r.obs.block'],
    equations: [
      'v_\\mathrm{cm} = \\omega R',
      'K = \\tfrac{1}{2} M v_\\mathrm{cm}^2 + \\tfrac{1}{2} I_\\mathrm{cm} \\omega^2, \\quad \\frac{K_\\mathrm{rot}}{K_\\mathrm{trans}} = \\beta = \\frac{I_\\mathrm{cm}}{MR^2}',
      'a = \\frac{g \\sin\\theta}{1 + \\beta}, \\quad f_s = \\frac{\\beta}{1 + \\beta} M g \\sin\\theta',
    ],
    assumptions: ['ch11.r.assume'],
  },
};
