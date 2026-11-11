// Ch 6 scene: circular motion. The top view shows the motion and the net force; the side view
// shows only real forces (tension, gravity, normal force, friction). The net force points to the
// centre and equals mv²/r: "centripetal force" names that component, it is not an extra force.
import { t as tr } from '../../core/i18n';
import type { ParamSchema, Scene, Vec2 } from '../../core/types';
import type { Draw } from '../../draw/draw';
import { G, SETUPS, forces, lapTime, netForce, required, topViewAt, type Force, type Preset } from './physics';

type P = { preset: string; cut: boolean; ice: boolean };

const RATE = 240;
const SX = 3.3; // centre of the side view
const OX = SX + 0.25; // object in the side view
const KV = 0.55; // length of the velocity arrow in the top view
const KN = 0.5; // length of the net-force arrow in the top view
const GREY = '#9a9a9a';
const BODY = '#5c5c5c';
const CAPTION = '#6b6b6b';
const ICE = '#9ccbe8';

const presetOf = (p: P) => (p.preset in SETUPS ? p.preset : 'string') as Preset;
const released = (p: P) => {
  const pr = presetOf(p);
  return pr === 'flat' ? p.ice : pr !== 'banked' && p.cut;
};
/** The centripetal force is lost a quarter lap after the start. */
const tRel = (p: P) => (released(p) ? lapTime(SETUPS[presetOf(p)]) / 4 : Infinity);

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

function drawTop(g: Draw, p: P, t: number): void {
  const pr = presetOf(p);
  const s = SETUPS[pr];
  const tr0 = tRel(p);
  const k = topViewAt(s, t, tr0);
  const P0: Vec2 = { x: k.x / s.r, y: k.y / s.r };
  const vhat: Vec2 = { x: k.vx / s.v, y: k.vy / s.v };
  const O: Vec2 = { x: 0, y: 0 };
  const ring: Vec2[] = [];
  for (let i = 0; i <= 96; i++) ring.push({ x: Math.cos((i / 96) * 2 * Math.PI), y: Math.sin((i / 96) * 2 * Math.PI) });
  g.polyline(ring, { color: GREY, width: 1.25, dash: k.onCircle ? undefined : [3, 4] });
  g.circle(O, 3, { fill: GREY });

  if (!k.onCircle) {
    const r0 = topViewAt(s, tr0, tr0);
    g.line({ x: r0.x / s.r, y: r0.y / s.r }, P0, { color: GREY, width: 1, dash: [3, 4] });
  } else if (pr === 'string' || pr === 'cone') {
    g.line(O, P0, { color: BODY, width: 1.25 });
  }

  if (pr === 'flat' || pr === 'banked') rotRect(g, P0, vhat, 0.22, 0.12);
  else g.circle(P0, 8, { fill: 'position' });

  g.arrow(P0, { x: vhat.x * KV, y: vhat.y * KV }, { role: 'velocity', width: 2.25, label: '*v*' });
  const net = netForce(pr, !k.onCircle);
  if (k.onCircle && net.r > 0) {
    // Net force toward the centre, labelled beside its middle on the outer side.
    const inward = { x: -P0.x, y: -P0.y };
    g.arrow(P0, { x: inward.x * KN, y: inward.y * KN }, { role: 'force', width: 3.5 });
    const m = add(P0, inward, KN / 2);
    const side = { x: -vhat.x, y: -vhat.y };
    g.text(add(m, side, g.px(16)), '*F*_{net}', { size: 13, role: 'force', align: side.x >= 0 ? 'left' : 'right', baseline: 'middle' });
  }
  g.text({ x: 0, y: 1.5 }, tr('ch06.c.top'), { size: 12, color: CAPTION, align: 'center' });
}

function drawSide(g: Draw, p: P, onCircle: boolean): void {
  const pr = presetOf(p);
  const s = SETUPS[pr];
  const rel = !onCircle;
  const fs = forces(pr, rel);
  const KF = 0.75 / (s.m * G);
  const O: Vec2 = { x: OX, y: 0 };
  const axisX = pr === 'cone' ? OX - 1.4 * Math.sin(s.theta) : OX - 1.25;

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
    const pivot = { x: axisX, y: 1.4 * Math.cos(s.theta) };
    g.line({ x: axisX - 0.3, y: pivot.y }, { x: axisX + 0.3, y: pivot.y }, { color: BODY, width: 3 });
    if (!rel) g.line(pivot, O, { color: BODY, width: 1.25 });
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
    if (f.r > 1e-9 && f.z > 1e-9) {
      // Tilted force: dashed components; the horizontal one equals mv²/r.
      const name = f.name === 'N' ? '*N*' : '*T*';
      g.arrow(from, { x: v.x, y: 0 }, { role: 'force', width: 1.5, dash: [4, 3] });
      // Beside the tip, clear of the car (banked); under the middle on the open side (cone).
      if (pr === 'banked') g.text({ x: from.x + v.x, y: from.y }, `${name} sin*θ*`, { size: 12, role: 'force', align: 'right', baseline: 'middle', dx: -8 });
      else g.text({ x: from.x + v.x / 2, y: from.y }, `${name} sin*θ*`, { size: 12, role: 'force', align: 'center', dy: 18 });
      g.line({ x: from.x + v.x, y: from.y }, add(from, v), { role: 'force', width: 1, dash: [2, 3], alpha: 0.6 });
    }
  }
  g.text({ x: SX, y: 1.5 }, tr('ch06.c.side'), { size: 12, color: CAPTION, align: 'center' });
}

export const circular: Scene<P, { t: number; n: number }> = {
  id: 'circular',
  title: 'ch06.c.scene',
  params,
  time: { h: 1 / RATE, recordEvery: 4, frameStep: 0.05, tEnd: (p) => tRel(p as P) + (1.6 * SETUPS[presetOf(p as P)].r) / SETUPS[presetOf(p as P)].v },
  world: () => ({ x: [-1.45, 4.95], y: [-1.3, 1.75], aspect: 'contain', padPx: 16 }),
  init: () => ({ t: 0, n: 0 }),
  step: (s, _h, p) => {
    s.n += 1;
    s.t = s.n / RATE;
    const end = tRel(p) + (1.6 * SETUPS[presetOf(p)].r) / SETUPS[presetOf(p)].v;
    if (s.t > end) s.t = end;
  },
  snapshot: (s) => ({ ...s }),

  draw: (g, s, p) => {
    drawTop(g, p, s.t);
    drawSide(g, p, s.t < tRel(p));
  },

  readouts: [
    { label: 'v', unit: 'm/s', value: (_s, p) => SETUPS[presetOf(p)].v },
    { label: 'F_{\\text{net},r}', unit: 'N', value: (s, p) => netForce(presetOf(p), s.t >= tRel(p)).r },
    { label: 'mv^2/r', unit: 'N', value: (_s, p) => required(SETUPS[presetOf(p)]) },
  ],

  info: {
    goals: ['ch06.c.goal.net', 'ch06.c.goal.notnew'],
    observe: ['ch06.c.obs.string', 'ch06.c.obs.flat', 'ch06.c.obs.tilt', 'ch06.c.obs.cut'],
    equations: ['F_{\\text{net},r} = \\frac{mv^2}{r}', 'N\\sin\\theta = \\frac{mv^2}{r}, \\; N\\cos\\theta = mg \\;\\Rightarrow\\; v^2 = g r\\tan\\theta'],
    assumptions: ['ch06.c.assume'],
  },
};
