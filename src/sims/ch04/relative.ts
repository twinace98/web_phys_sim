// Ch 4 scene: relative motion. A boat crosses a river: v_BG = v_BW + v_WG.
// The same crossing is drawn from the ground frame or from the water frame.
import type { ParamSchema, Scene, Vec2 } from '../../core/types';
import { ROLE_COLOR } from '../../draw/theme';
import { crossingTime, vBG, vBW, vWG, type River } from './physics';

type P = { frame: string; heading: number; vb: number; u: number };

const W = 20; // river width [m]
const DEG = Math.PI / 180;
const KV = 2.4; // world m per (m/s)
const BANK = '#5c5c5c';
const WATER = '#eef5fb';
const RIPPLE = '#b9d4ea';
const POST = '#9a9a9a';

const riverOf = (p: P): River => ({ W, vb: p.vb, u: p.u, theta: p.heading * DEG });

/** x-extent covering the whole crossing in both frames, so switching frames never rescales. */
function xSpan(p: P): [number, number] {
  const r = riverOf(p);
  const T = crossingTime(r);
  const xs = [0, vBG(r)[0] * T, vBW(r)[0] * T, -r.u * T];
  return [Math.min(...xs) - 0.3 * W, Math.max(...xs) + 0.3 * W];
}

const params: ParamSchema<P> = {
  frame: {
    kind: 'select',
    label: 'ch04.r.p.frame',
    desc: 'ch04.r.d.frame',
    group: 'main',
    live: true,
    default: 'ground',
    options: [
      { value: 'ground', label: 'ch04.r.frame.ground' },
      { value: 'water', label: 'ch04.r.frame.water' },
    ],
  },
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
    default: 0,
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

/** Two decimals for TeX; negatives in parentheses. */
const num = (v: number, paren = false) => {
  const t = Math.abs(v) < 0.005 ? '0.00' : v.toFixed(2);
  return paren && t.startsWith('-') ? `(${t})` : t;
};

/** Panel: v_BG = v_BW + v_WG, then the x and y components with values. Colours as in Ch 3. */
export function velocityPanel(p: P): string {
  const r = riverOf(p);
  const a = vBW(r);
  const b = vWG(r);
  const c = vBG(r);
  const A = (x: string) => `\\textcolor{${ROLE_COLOR.position}}{${x}}`;
  const B = (x: string) => `\\textcolor{${ROLE_COLOR.energyU}}{${x}}`;
  const row = (k: 'x' | 'y', i: 0 | 1) => `${k}: & \\quad ${num(c[i])} = ${A(num(a[i], true))} + ${B(num(b[i], true))}`;
  const eq = `\\vec v_{BG} = ${A('\\vec v_{BW}')} + ${B('\\vec v_{WG}')}`;
  return `\\begin{array}{l} ${eq} \\\\ \\begin{array}{ll} ${row('x', 0)} \\\\ ${row('y', 1)} \\end{array} \\end{array}`;
}

/** Boat outline pointing along its heading (unit vector d), centred at c. */
function boat(c: Vec2, d: Vec2): Vec2[] {
  const n = { x: -d.y, y: d.x };
  const L = 0.9;
  const B = 0.35;
  const at = (s: number, w: number): Vec2 => ({ x: c.x + d.x * s + n.x * w, y: c.y + d.y * s + n.y * w });
  return [at(L, 0), at(0.2, B), at(-L, B), at(-L, -B), at(0.2, -B)];
}

export const relative: Scene<P, { t: number; n: number }> = {
  id: 'relative',
  title: 'ch04.r.scene',
  params,
  time: { h: 1 / 120, recordEvery: 4, frameStep: 0.1, tEnd: (p) => crossingTime(riverOf(p as P)) },
  world: (p) => {
    const [x0, x1] = xSpan(p);
    return { x: [x0, x1], y: [-0.25 * W, 1.25 * W], aspect: 'contain', padPx: 16 };
  },
  init: () => ({ t: 0, n: 0 }),
  step: (s, _h, p) => {
    s.n += 1;
    s.t = Math.min(s.n / 120, crossingTime(riverOf(p)));
  },

  draw: (g, s, p) => {
    const r = riverOf(p);
    const ground = p.frame !== 'water';
    const [x0, x1] = xSpan(p);
    const t = s.t;
    const L = x0 - 0.5 * W;
    const R = x1 + 0.5 * W;

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
    g.arrow(pos, { x: vb[0] * KV, y: vb[1] * KV }, { role: 'position', width: 2.25, label: '*v*_{BW}' });
    if (ground) {
      if (r.u > 0) {
        // Label under the middle of v_WG: its tip coincides with the tip of v_BG.
        g.arrow(tipA, { x: vw[0] * KV, y: 0 }, { role: 'energyU', width: 2.25 });
        g.text({ x: tipA.x + (vw[0] * KV) / 2, y: tipA.y }, '*v*_{WG}', { size: 13, role: 'energyU', align: 'center', dy: 16 });
      }
      g.arrow(pos, { x: vg[0] * KV, y: vg[1] * KV }, { role: 'fg', width: 2.5, label: '*v*_{BG}' });
    } else if (r.u > 0) {
      // Seen from the water, the banks move at −v_WG.
      g.arrow({ x: bank, y: -0.12 * W }, { x: -r.u * KV, y: 0 }, { role: 'energyU', width: 2 });
      g.text({ x: bank - (r.u * KV) / 2, y: -0.12 * W }, '−*v*_{WG}', { size: 13, role: 'energyU', align: 'center', dy: 16 });
    }
  },

  overlay: (_s, p) => velocityPanel(p),

  readouts: [
    { label: 'x', unit: 'm', value: (s, p) => (p.frame === 'water' ? vBW(riverOf(p))[0] : vBG(riverOf(p))[0]) * s.t },
    { label: 'y', unit: 'm', value: (s, p) => vBW(riverOf(p))[1] * s.t },
  ],

  info: {
    goals: ['ch04.r.goal.add', 'ch04.r.goal.frame'],
    observe: ['ch04.r.obs.straight', 'ch04.r.obs.cancel', 'ch04.r.obs.switch', 'ch04.r.obs.up'],
    equations: ['\\vec v_{BG} = \\vec v_{BW} + \\vec v_{WG}', 't = \\frac{W}{v_{BW}\\cos\\theta}'],
    assumptions: ['ch04.r.assume'],
  },
};
