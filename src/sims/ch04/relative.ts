// Ch 4 scene: relative motion. A boat crosses a river: v_BG = v_BW + v_WG.
// The same crossing is drawn at once from the ground frame (top) and from the water frame (bottom).
import { t } from '../../core/i18n';
import { clockDecimals, fmtClock } from '../../core/format';
import { paren, slider, texOf, tn, tp, u } from '../../core/tex';
import type { ParamSchema, Role, Scene, Vec2 } from '../../core/types';
import type { Viewport } from '../../core/viewport';
import type { Draw } from '../../draw/draw';
import { ROLE_COLOR, theme } from '../../draw/theme';
import { PX_WORLD } from '../modern/frame';
import { crossingTime, vBG, vBW, vWG, type River } from './physics';

type P = { heading: number; vb: number; u: number };
type Frame = 'ground' | 'water';

const W = 20; // river width [m]
const DEG = Math.PI / 180;
const KV = 4; // world m per (m/s)
const PAD = 12; // stage inset [CSS px]
const GAP = 14; // between the two panels [CSS px]
const STRIP = 22; // title strip at the top of each panel [CSS px]
/** Narrow stage: the formula panel spans most of the width, so the top panel starts below it. */
const NARROW = 600;
const RESERVE = 84;
const BANK = '#5c5c5c';
const WATER = '#eef5fb';
const RIPPLE = '#b9d4ea';
const POST = '#9a9a9a';
const EDGE = '#e3e3e3';

const riverOf = (p: P): River => ({ W, vb: p.vb, u: p.u, theta: p.heading * DEG });

/** Step button [s]: 0.05 s, so the clock shows 2 decimals over the whole crossing (6.67 to 40 s). */
const FRAME_STEP = 0.05;
/**
 * A time in the Σ panel: the clock's string (2 decimals) from 1 s on, so the panel and the clock
 * agree (R8: 6.06 s, not 6.1 against 6.06); below 1 s the clock has fewer than 3 figures and the
 * panel keeps 3 (0.108).
 */
export function timeTex(t: number, p: P): string {
  if (t < 1) return tn(t);
  return texOf(fmtClock(t, clockDecimals(FRAME_STEP, crossingTime(riverOf(p)))));
}

/** x-extent covering the whole crossing in both frames, so the two panels can share it. */
function xSpan(p: P): [number, number] {
  const r = riverOf(p);
  const T = crossingTime(r);
  const xs = [0, vBG(r)[0] * T, vBW(r)[0] * T, -r.u * T];
  // Margin: the velocity arrows (up to v_BW·KV long) and their labels past the end of the path.
  const m = Math.max(0.3 * W, r.vb * KV + 3);
  return [Math.min(...xs) - m, Math.max(...xs) + m];
}

/** y-extent of one panel: room below the near bank for the −v_WG arrow, above the far bank for the triangle. */
const ySpan = (p: P): [number, number] => [-0.25 * W, W + p.vb * KV + 0.18 * W];

const params: ParamSchema<P> = {
  heading: {
    kind: 'number',
    label: 'ch04.r.p.heading',
    desc: 'ch04.r.d.heading',
    group: 'main',
    live: false,
    control: 'slider',
    min: 0,
    max: 60,
    step: 1,
    default: 30,
    unit: '°',
  },
  vb: {
    kind: 'number',
    label: 'ch04.r.p.vb',
    desc: 'ch04.r.d.vb',
    group: 'advanced',
    live: false,
    control: 'slider',
    min: 1,
    max: 3,
    step: 0.1,
    default: 2,
    unit: 'm/s',
  },
  u: {
    kind: 'number',
    label: 'ch04.r.p.u',
    desc: 'ch04.r.d.u',
    group: 'advanced',
    live: false,
    control: 'slider',
    min: 0,
    max: 1.5,
    step: 0.1,
    default: 1,
    unit: 'm/s',
  },
};


/**
 * Panel: v_BG = v_BW + v_WG, then the x and y components with values. Colours as in Ch 3. The
 * components print as in the Σ panel: 3 figures, v_WG as its slider label (policy D, R1/R3/R8).
 */
export function velocityPanel(p: P): string {
  const r = riverOf(p);
  const a = vBW(r);
  const c = vBG(r);
  const A = (x: string) => `\\textcolor{${ROLE_COLOR.position}}{${x}}`;
  const B = (x: string) => `\\textcolor{${ROLE_COLOR.energyU}}{${x}}`;
  // v_WG = (u, 0): u is the slider value.
  const wg = [paren(slider(params.u, p.u)), '0'];
  const row = (k: 'x' | 'y', i: 0 | 1) => `${k}: & \\quad ${tn(c[i])} = ${A(tp(a[i]))} + ${B(wg[i])}`;
  const eq = `\\vec v_{BG} = ${A('\\vec v_{BW}')} + ${B('\\vec v_{WG}')}`;
  return `\\begin{array}{l} ${eq} \\\\ \\begin{array}{ll} ${row('x', 0)} \\\\ ${row('y', 1)} \\end{array} \\end{array}`;
}

/** Box in canvas CSS px. */
type Box = { l: number; t: number; r: number; b: number };

/**
 * The two panels, ground frame on top and water frame below, and the common scale [px per m]
 * that fits the panel height. Both panels use the same scale so the two motions compare directly.
 */
function layout(w: number, h: number, p: P): { boxes: [Box, Box]; s: number } {
  const y0 = PAD + (w < NARROW ? RESERVE : 0);
  const hb = Math.max(1, (h - y0 - PAD - GAP) / 2);
  const top: Box = { l: PAD, t: y0, r: w - PAD, b: y0 + hb };
  const bot: Box = { l: PAD, t: y0 + hb + GAP, r: w - PAD, b: h - PAD };
  const [ya, yb] = ySpan(p);
  return { boxes: [top, bot], s: Math.max(1, hb - STRIP) / (yb - ya) };
}

/**
 * x of the panel centre at time t. When the whole crossing (both frames) fits the panel, both
 * panels show the same fixed x-range, so the start lines up. Otherwise the panel follows its own
 * boat and velocity arrows but stops at the ends of the crossing, so the start stays in view when it can.
 */
function cameraX(p: P, t: number, f: Frame, win: number): number {
  const [x0, x1] = xSpan(p);
  if (x1 - x0 <= win) return (x0 + x1) / 2;
  const r = riverOf(p);
  const vb = vBW(r);
  const vg = vBG(r);
  const px = (f === 'ground' ? vg : vb)[0] * t;
  const ext = f === 'ground' ? [0, vb[0] * KV, vg[0] * KV] : [0, vb[0] * KV];
  const c = px + (Math.min(...ext) + Math.max(...ext)) / 2;
  return Math.min(Math.max(c, x0 + win / 2), x1 - win / 2);
}

/**
 * The drawing API for one panel: panel world (x, y) [m] maps to the box with scale s and centre
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

/** Boat outline pointing along its heading (unit vector d), centred at c. */
function boat(c: Vec2, d: Vec2): Vec2[] {
  const n = { x: -d.y, y: d.x };
  const L = 0.9;
  const B = 0.35;
  const at = (s: number, w: number): Vec2 => ({ x: c.x + d.x * s + n.x * w, y: c.y + d.y * s + n.y * w });
  return [at(L, 0), at(0.2, B), at(-L, B), at(-L, -B), at(0.2, -B)];
}

/**
 * Label beside the middle of the arrow a→b, on the side away from `opp` (the third corner of the
 * vector triangle), so the three labels never sit inside the triangle or on another arrow.
 * When `opp` lies on the arrow's line, `side` (+1 left of a→b on screen, −1 right) decides.
 */
function edgeLabel(g: Draw, a: Vec2, b: Vec2, opp: Vec2, side: 1 | -1, text: string, role: Role): void {
  const [ax, ay] = g.vp.toPx(a.x, a.y);
  const [bx, by] = g.vp.toPx(b.x, b.y);
  const [ox, oy] = g.vp.toPx(opp.x, opp.y);
  const len = Math.hypot(bx - ax, by - ay);
  if (len < 1e-6) return;
  let nx = (by - ay) / len;
  let ny = -(bx - ax) / len;
  const mx = (ax + bx) / 2;
  const my = (ay + by) / 2;
  const dOpp = (ox - mx) * nx + (oy - my) * ny;
  const flip = Math.abs(dOpp) > 6 * theme.scale ? dOpp > 0 : side < 0;
  if (flip) {
    nx = -nx;
    ny = -ny;
  }
  const align = nx > 0.35 ? 'left' : nx < -0.35 ? 'right' : 'center';
  const d = (align === 'center' ? 13 : 9) * theme.scale;
  g.screenText((mx + nx * d) / theme.scale, (my + ny * d) / theme.scale, text, { size: 13, role, align, baseline: 'middle' });
}

/** One frame of the crossing at time t, in panel world coordinates (start at the origin). */
function drawFrame(g: Draw, p: P, t: number, f: Frame): void {
  const r = riverOf(p);
  const ground = f === 'ground';
  // Water, banks, ripples and posts span the visible panel width plus a margin.
  const [vl] = g.vp.toWorld(0, 0);
  const [vr] = g.vp.toWorld(g.vp.w, 0);
  const L = vl - 0.5 * W;
  const R = vr + 0.5 * W;

  g.polygon(
    [
      { x: L, y: 0 },
      { x: R, y: 0 },
      { x: R, y: W },
      { x: L, y: W },
    ],
    { fill: WATER },
  );
  g.line({ x: L, y: 0 }, { x: R, y: 0 }, { color: BANK, width: 2 });
  g.line({ x: L, y: W }, { x: R, y: W }, { color: BANK, width: 2 });

  // Ripples move with the water (ground frame); banks move the other way (water frame).
  const rip = ground ? r.u * t : 0;
  const bank = ground ? 0 : -r.u * t;
  const step = 4;
  for (const yy of [0.25 * W, 0.5 * W, 0.75 * W]) {
    const off = yy === 0.5 * W ? step / 2 : 0;
    for (let x = Math.floor((L - rip - off) / step) * step + rip + off; x < R; x += step) {
      g.line({ x, y: yy }, { x: x + 1, y: yy }, { color: RIPPLE, width: 2 });
    }
  }
  for (let x = Math.floor((L - bank) / 5) * 5 + bank; x < R; x += 5) {
    for (const yy of [0, W]) g.line({ x, y: yy }, { x, y: yy + (yy === 0 ? -g.px(6) : g.px(6)) }, { color: POST, width: 1.5 });
  }
  // Start and the point straight across from it, fixed to the banks.
  g.line({ x: bank, y: 0 }, { x: bank, y: -g.px(14) }, { color: BANK, width: 2.5 });
  g.line({ x: bank, y: W }, { x: bank, y: W + g.px(14) }, { color: BANK, width: 2.5 });
  g.line({ x: bank, y: 0 }, { x: bank, y: W }, { color: POST, width: 1, dash: [2, 5] });

  const vb = vBW(r);
  const vw = vWG(r);
  const vg = vBG(r);
  const v = ground ? vg : vb;
  const pos: Vec2 = { x: v[0] * t, y: v[1] * t };
  g.line({ x: 0, y: 0 }, pos, { color: '#1a1a1a', width: 1.25, dash: [5, 4], alpha: 0.6 });

  const len = Math.hypot(vb[0], vb[1]);
  g.polygon(boat(pos, { x: vb[0] / len, y: vb[1] / len }), { fill: 'position', fillAlpha: 0.85 });

  const tipA: Vec2 = { x: pos.x + vb[0] * KV, y: pos.y + vb[1] * KV };
  const tipC: Vec2 = { x: pos.x + vg[0] * KV, y: pos.y + vg[1] * KV };
  if (ground) {
    // Triangle P → A (v_BW), A → C (v_WG), P → C (v_BG): each label on the outer side of its arrow.
    g.arrow(pos, { x: vb[0] * KV, y: vb[1] * KV }, { role: 'position', width: 2.25 });
    if (r.u > 0) g.arrow(tipA, { x: vw[0] * KV, y: 0 }, { role: 'energyU', width: 2.25 });
    g.arrow(pos, { x: vg[0] * KV, y: vg[1] * KV }, { role: 'fg', width: 2.5 });
    edgeLabel(g, pos, tipA, tipC, -1, '*v*_{BW}', 'position');
    if (r.u > 0) edgeLabel(g, tipA, tipC, pos, 1, '*v*_{WG}', 'energyU');
    edgeLabel(g, pos, tipC, tipA, 1, '*v*_{BG}', 'fg');
    return;
  }
  g.arrow(pos, { x: vb[0] * KV, y: vb[1] * KV }, { role: 'position', width: 2.25, label: '*v*_{BW}' });
  if (r.u > 0) {
    // Seen from the water, the banks move at −v_WG.
    g.arrow({ x: bank, y: -0.12 * W }, { x: -r.u * KV, y: 0 }, { role: 'energyU', width: 2 });
    g.text({ x: bank - (r.u * KV) / 2, y: -0.12 * W }, '−*v*_{WG}', { size: 13, role: 'energyU', align: 'center', dy: 16 });
  }
}

export const relative: Scene<P, { t: number; n: number }> = {
  id: 'relative',
  title: 'ch04.r.scene',
  params,
  time: { h: 1 / 120, recordEvery: 4, frameStep: FRAME_STEP, tEnd: (p) => crossingTime(riverOf(p as P)) },
  world: PX_WORLD,
  init: () => ({ t: 0, n: 0 }),
  step: (s, _h, p) => {
    s.n += 1;
    s.t = Math.min(s.n / 120, crossingTime(riverOf(p)));
  },

  draw: (g0, s, p) => {
    const { boxes, s: sc } = layout(g0.vp.w, g0.vp.h, p);
    const [y0, y1] = ySpan(p);
    (['ground', 'water'] as const).forEach((f, i) => {
      const box = boxes[i];
      const win = (box.r - box.l) / sc;
      const g = panelDraw(g0, { ...box, t: box.t + STRIP }, sc, cameraX(p, s.t, f, win), (y0 + y1) / 2);
      const { ctx } = g0;
      ctx.save();
      ctx.beginPath();
      ctx.rect(box.l, box.t, box.r - box.l, box.b - box.t);
      ctx.clip();
      drawFrame(g, p, s.t, f);
      ctx.restore();
      ctx.save();
      ctx.strokeStyle = EDGE;
      ctx.lineWidth = 1;
      ctx.strokeRect(box.l + 0.5, box.t + 0.5, box.r - box.l - 1, box.b - box.t - 1);
      ctx.restore();
      // Frame name at the top right (the formula panel sits at the top left of the stage).
      g0.screenText((box.r - 10) / theme.scale, (box.t + 12) / theme.scale, t(`ch04.r.frame.${f}`), {
        size: 13,
        color: '#4a4a4a',
        weight: 600,
        align: 'right',
        baseline: 'middle',
      });
    });
  },

  overlay: (_s, p) => velocityPanel(p),

  readouts: [
    { label: 'x_{BG}', unit: 'm', value: (s, p) => vBG(riverOf(p))[0] * s.t },
    { label: 'x_{BW}', unit: 'm', value: (s, p) => vBW(riverOf(p))[0] * s.t },
    { label: 'y', unit: 'm', value: (s, p) => vBW(riverOf(p))[1] * s.t },
  ],

  // Σ panel: components of v_BG, the ground-frame position at the current t, and the crossing time
  // (the t at which y reaches W). Slider values as their labels, the rest with 3 figures (policy D).
  formula: (s, p) => {
    const r = riverOf(p);
    const bg = vBG(r);
    const vb = slider(params.vb, p.vb);
    const th = slider(params.heading, p.heading);
    const T = timeTex(s.t, p);
    // x and y with the velocity components written from the sliders: the arithmetic on the printed
    // inputs then reproduces the result (1.13 × 1.18 = 1.33 against 1.32 with v_BG,y rounded).
    const vx = `(-${vb}\\sin ${th}^\\circ + ${slider(params.u, p.u)})`;
    const vy = `${vb}\\cos ${th}^\\circ`;
    return [
      `v_{BG,x} = -v_{BW}\\sin\\theta + v_{WG}`,
      `= -${vb}\\sin ${th}^\\circ + ${slider(params.u, p.u)} = ${tn(bg[0])}${u('m/s')}`,
      `v_{BG,y} = v_{BW}\\cos\\theta = ${vy} = ${tn(bg[1])}${u('m/s')}`,
      `x_{BG} = v_{BG,x}\\,t = ${vx} \\times ${T} = ${tn(bg[0] * s.t)}${u('m')}`,
      `y = v_{BG,y}\\,t = ${vy} \\times ${T} = ${tn(bg[1] * s.t)}${u('m')}`,
      `y = W:\\ t = \\frac{W}{v_{BW}\\cos\\theta} = \\frac{${W}}{${vy}} = ${timeTex(crossingTime(r), p)}${u('s')}`,
    ];
  },

  info: {
    goals: ['ch04.r.goal.add', 'ch04.r.goal.frame'],
    observe: ['ch04.r.obs.straight', 'ch04.r.obs.cancel', 'ch04.r.obs.switch', 'ch04.r.obs.up'],
    equations: ['\\vec v_{BG} = \\vec v_{BW} + \\vec v_{WG}', 't = \\frac{W}{v_{BW}\\cos\\theta}'],
    assumptions: ['ch04.r.assume'],
  },
};
