// Ch 11 scene: rolling down an incline. A hoop, a disk and a solid sphere roll without slipping
// on parallel lanes of the same incline; a block slides without friction as a reference. All start
// from rest together. a = g sin θ / (1 + β) with β = I / (M R²), so the order is fixed by the mass
// distribution alone. One body (chosen) shows the velocities of its contact point, centre and top.
import { t as tr } from '../../core/i18n';
import type { ParamSchema, Scene, Vec2 } from '../../core/types';
import type { Draw, PlotDraw } from '../../draw/draw';
import { drawRich } from '../../draw/text';
import { ROLE_COLOR } from '../../draw/theme';
import { BETA, BODIES, G, finishTime, pointVelocity, rollState, type Body, type Incline } from './physics';

type P = { theta: number; focus: string };

interface S {
  t: number;
  n: number;
}

const RATE = 240;
const H = 1 / RATE;
const LEN = 1.6; // run along the incline [m]
const R = 0.12; // radius of the round bodies [m]
const M = 1; // mass of every body [kg]
const GAP = 0.5; // lane spacing, perpendicular to the incline [m]
const STRIP = 0.04; // lane thickness [m]
const EXT = R + 0.08; // lane beyond the finish line, so a body stopped there sits on it [m]
const BACK = R + 0.08; // lane behind the start [m]
const RUN_OUT = 0.3; // floor beyond the foot of the incline [m]
const LEFT = 0.45; // room left of the lanes for the body names [m]
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
};

function drawLanes(g: Draw, p: P): void {
  const { th, u, n, at } = frame(p);
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
  // Body names behind the start of each lane.
  LANES.forEach((b, i) => {
    const c = at(i, -BACK, R);
    g.text({ x: c.x - u.x * g.px(6), y: c.y - u.y * g.px(6) }, tr(`ch11.r.tag.${b}`), { size: 12, color: BODY_COLOR[b], align: 'right', baseline: 'middle', weight: b === focusOf(p) ? 700 : 500 });
  });
}

function drawBody(g: Draw, p: P, b: Body, i: number, t: number): void {
  const { n, at } = frame(p);
  const k = rollState(ramp(p), b, t);
  const col = BODY_COLOR[b];
  if (b === 'block') {
    const c0 = at(i, k.s - R);
    const c1 = at(i, k.s + R);
    const c2 = at(i, k.s + R, 2 * R);
    const c3 = at(i, k.s - R, 2 * R);
    g.polygon([c0, c1, c2, c3], { fill: col, fillAlpha: 0.3, color: col, width: 1.75 });
    return;
  }
  const c = at(i, k.s, R);
  const rPx = R / g.px(1);
  const mark = { x: Math.cos(k.phi) * n.x - Math.sin(k.phi) * n.y, y: Math.sin(k.phi) * n.x + Math.cos(k.phi) * n.y };
  const rim = { x: c.x + R * mark.x, y: c.y + R * mark.y };
  if (b === 'hoop') {
    g.circle(c, rPx - 2, { color: col, width: 4 });
    g.line(c, rim, { color: col, width: 1.5 });
  } else if (b === 'disk') {
    g.circle(c, rPx, { fill: col, alpha: 0.3, color: col, width: 1.75 });
    g.circle(c, rPx * 0.25, { color: col, width: 1.25 });
    g.line(c, rim, { color: '#1a1a1a', width: 1.75 });
  } else {
    // Solid sphere: shaded so it reads as a ball, not a flat disk.
    const { ctx } = g;
    const [x, y] = g.vp.toPx(c.x, c.y);
    const rr = Math.max(1, rPx);
    const grad = ctx.createRadialGradient(x - rr * 0.35, y - rr * 0.35, rr * 0.1, x, y, rr);
    grad.addColorStop(0, '#ffffff');
    grad.addColorStop(1, col);
    ctx.save();
    ctx.globalAlpha = 0.75;
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(x, y, rr, 0, 2 * Math.PI);
    ctx.fill();
    ctx.restore();
    g.circle(c, rPx, { color: col, width: 1.75 });
    g.line(c, rim, { color: '#1a1a1a', width: 1.75 });
  }
  g.circle(c, 2, { fill: '#1a1a1a' });
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
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(ramp(p).theta);
        drawRich(ctx, '*v* = 0', 0, 0, { size: 12, color: ROLE_COLOR.velocity, align: 'right', baseline: 'bottom' });
        ctx.restore();
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
    drawLanes(g, p);
    LANES.forEach((b, i) => drawBody(g, p, b, i, s.t));
    drawVelocities(g, p, s.t);
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
      value: (s, p) => {
        const k = rollState(ramp(p), focusOf(p), s.t);
        return k.Kt > 0 ? k.Kr / k.Kt : BETA[focusOf(p)];
      },
    },
  ],

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
