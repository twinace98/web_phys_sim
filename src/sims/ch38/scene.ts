// Ch 38 scenes: a wave packet from M plane waves next to a classical particle, and the
// de Broglie wavelength of an electron, a neutron, a C60 molecule and a baseball.
import { fmt } from '../../core/format';
import { t } from '../../core/i18n';
import type { ParamSchema, Scene } from '../../core/types';
import { measureRich } from '../../draw/text';
import { ROLE_COLOR } from '../../draw/theme';
import { Frame, PX_WORLD, TICK, W, canvasBox, linePx, pow10, rectPx, textPx } from '../modern/frame';
import {
  EV,
  PARTICLES,
  deBroglie,
  deltaK,
  deltaX,
  packet,
  pFromK,
  pFromV,
  psi,
  vGroup,
  type Packet,
  type ParticleId,
} from './physics';

const WAVE = ROLE_COLOR.position;
const X_RANGE: [number, number] = [-5, 35];
const X_END = 33;

// ------------------------------------------------------------------ wave packet

type PP = { M: number; show: string; k0: number };

const packetParams: ParamSchema<PP> = {
  M: {
    kind: 'number',
    label: 'ch38.p.M',
    desc: 'ch38.d.M',
    group: 'main',
    live: false,
    control: 'slider',
    min: 1,
    max: 33,
    step: 1,
    default: 9,
  },
  show: {
    kind: 'select',
    label: 'ch38.p.show',
    desc: 'ch38.d.show',
    group: 'main',
    live: true,
    default: 'both',
    options: [
      { value: 'both', label: 'ch38.show.both' },
      { value: 're', label: 'ch38.show.re' },
      { value: 'prob', label: 'ch38.show.prob' },
    ],
  },
  k0: {
    kind: 'number',
    label: 'ch38.p.k0',
    desc: 'ch38.d.k0',
    group: 'advanced',
    live: false,
    control: 'slider',
    min: 5,
    max: 15,
    step: 0.5,
    default: 10,
    unit: 'nm⁻¹',
  },
};

let pkKey = '';
let pkMemo: Packet = packet(1, 10);
function pkOf(p: PP): Packet {
  const key = `${p.M}|${p.k0}`;
  if (key !== pkKey) {
    pkMemo = packet(p.M, p.k0);
    pkKey = key;
  }
  return pkMemo;
}

const H_PK = 0.02; // fs

export const wavePacket: Scene<PP, { t: number; n: number }> = {
  id: 'packet',
  title: 'ch38.k.scene',
  params: packetParams,
  world: PX_WORLD,
  time: { h: H_PK, recordEvery: 5, frameStep: 0.5, scale: 4, unit: 'fs', tEnd: (p) => X_END / vGroup((p as PP).k0) },
  init: () => ({ t: 0, n: 0 }),
  step: (s) => {
    s.n += 1;
    s.t = s.n * H_PK;
  },
  snapshot: (s) => ({ ...s }),

  draw: (g, s, p) => {
    const pk = pkOf(p);
    const o = canvasBox(g);
    const H = o.b - o.t;
    const wave = new Frame(g, { l: o.l + 40, t: o.t + 24, r: o.r - 20, b: o.t + 0.58 * H }, X_RANGE, [-1.15, 1.15]);
    const amp = pk.a.reduce((a, b) => a + b, 0);
    const n = Math.min(900, Math.round(wave.box.r - wave.box.l));
    const re: [number, number][] = [];
    const pr: [number, number][] = [];
    for (let i = 0; i <= n; i++) {
      const x = X_RANGE[0] + ((X_RANGE[1] - X_RANGE[0]) * i) / n;
      const [a, b] = psi(pk, x, s.t);
      re.push([x, a / amp]);
      pr.push([x, (a * a + b * b) / (amp * amp)]);
    }
    wave.line(X_RANGE[0], 0, X_RANGE[1], 0, { color: '#c4c4c4', width: 1 });
    if (p.show !== 're') {
      wave.polygon([[X_RANGE[0], 0], ...pr, [X_RANGE[1], 0]], { fill: WAVE, fillAlpha: 0.2 });
      wave.polyline(pr, { color: WAVE, width: 2 });
    }
    if (p.show !== 'prob') wave.polyline(re, { color: WAVE, width: 1.25, alpha: p.show === 'both' ? 0.55 : 1 });
    const lbl = p.show === 're' ? 'Re *ψ*' : p.show === 'prob' ? '|*ψ*|^{2}' : 'Re *ψ*,  |*ψ*|^{2}';
    textPx(g, wave.box.l + 4, wave.box.t - 8, lbl, { size: 13, color: TICK });

    // Classical particle with the group velocity, on its own track.
    const yT = wave.box.b + 0.09 * H;
    const xc = vGroup(p.k0) * s.t;
    linePx(g, wave.box.l, yT, wave.box.r, yT, { color: '#c4c4c4', width: 1 });
    g.circle(W(g, wave.X(xc), yT), 7, { fill: 'position' });
    textPx(g, wave.box.l + 4, yT - 12, t('ch38.k.particle'), { size: 12, color: TICK });
    // x axis under the track.
    const xa = new Frame(g, { ...wave.box, t: yT + 22, b: yT + 22 }, X_RANGE, [0, 1]);
    xa.axes({ xLabel: '*x* (nm)', yTicks: false });

    // Amplitudes of the plane-wave components.
    const fs = new Frame(g, { l: o.l + 40, t: yT + 0.13 * H, r: o.r - 20, b: o.b - 30 }, [p.k0 - 3.2, p.k0 + 3.2], [0, 1.2]);
    pk.k.forEach((k, j) => {
      fs.line(k, 0, k, pk.a[j], { color: WAVE, width: 2 });
      g.circle(fs.P(k, pk.a[j]), 3.5, { fill: WAVE });
    });
    fs.axes({ xLabel: '*k* (nm^{−1})', yTicks: false });
    textPx(g, fs.box.l + 4, fs.box.t - 4, t('ch38.k.amp'), { size: 12, color: TICK });
  },

  readouts: [
    { label: '\\Delta x', unit: 'nm', value: (s, p) => deltaX(pkOf(p), s.t, vGroup(p.k0) * s.t, 600) },
    { label: '\\Delta k', unit: 'nm⁻¹', value: (_s, p) => deltaK(pkOf(p)) },
    { label: '\\Delta x\\,\\Delta k', unit: '', value: (s, p) => deltaX(pkOf(p), s.t, vGroup(p.k0) * s.t, 600) * deltaK(pkOf(p)) },
  ],

  info: {
    goals: ['ch38.k.goal.build', 'ch38.k.goal.move'],
    observe: ['ch38.k.obs.one', 'ch38.k.obs.more', 'ch38.k.obs.product', 'ch38.k.obs.group', 'ch38.k.obs.spread'],
    equations: [
      '\\psi(x,t) = \\sum_j a_j\\, e^{i(k_j x - \\omega_j t)}, \\quad \\omega = \\frac{\\hbar k^2}{2m}',
      'v_\\text{group} = \\frac{d\\omega}{dk} = \\frac{\\hbar k_0}{m} = v_\\text{particle}',
      '\\Delta x\\,\\Delta k \\ge \\tfrac12',
    ],
    assumptions: ['ch38.k.assume.electron', 'ch38.k.assume.period'],
  },
};

// ------------------------------------------------------------------ de Broglie

type PD = { part: string; eK: number; vn: number; vc: number; vb: number };

const dbParams: ParamSchema<PD> = {
  part: {
    kind: 'select',
    label: 'ch38.p.part',
    desc: 'ch38.d.part',
    group: 'main',
    live: true,
    default: 'electron',
    options: [
      { value: 'electron', label: 'ch38.part.electron' },
      { value: 'neutron', label: 'ch38.part.neutron' },
      { value: 'c60', label: 'ch38.part.c60' },
      { value: 'ball', label: 'ch38.part.ball' },
    ],
  },
  eK: {
    kind: 'number',
    label: 'ch38.p.eK',
    desc: 'ch38.d.eK',
    group: 'main',
    live: true,
    control: 'select',
    choices: [1, 10, 54, 100, 1000, 10000],
    default: 100,
    unit: 'eV',
    visibleIf: (p) => p.part === 'electron',
  },
  vn: {
    kind: 'number',
    label: 'ch38.p.v',
    desc: 'ch38.d.v',
    group: 'main',
    live: true,
    control: 'select',
    choices: [220, 2200, 22000],
    default: 2200,
    unit: 'm/s',
    visibleIf: (p) => p.part === 'neutron',
  },
  vc: {
    kind: 'number',
    label: 'ch38.p.v',
    desc: 'ch38.d.v',
    group: 'main',
    live: true,
    control: 'slider',
    min: 50,
    max: 500,
    step: 10,
    default: 220,
    unit: 'm/s',
    visibleIf: (p) => p.part === 'c60',
  },
  vb: {
    kind: 'number',
    label: 'ch38.p.v',
    desc: 'ch38.d.v',
    group: 'main',
    live: true,
    control: 'slider',
    min: 1,
    max: 50,
    step: 1,
    default: 40,
    unit: 'm/s',
    visibleIf: (p) => p.part === 'ball',
  },
};

/** Momentum [kg·m/s] for the chosen particle and energy or speed. */
export function momentum(p: PD): number {
  const id = p.part as ParticleId;
  const m = PARTICLES[id].mass;
  switch (id) {
    case 'electron':
      return pFromK(m, p.eK * EV);
    case 'neutron':
      return pFromV(m, p.vn);
    case 'c60':
      return pFromV(m, p.vc);
    case 'ball':
      return pFromV(m, p.vb);
  }
}

/** Length with an SI prefix, e.g. "0.2 nm"; tiny lengths as ×10ⁿ m. */
export function fmtLen(L: number): string {
  const units: [number, string][] = [
    [1, 'm'],
    [1e-2, 'cm'],
    [1e-3, 'mm'],
    [1e-6, 'μm'],
    [1e-9, 'nm'],
    [1e-12, 'pm'],
    [1e-15, 'fm'],
  ];
  const trim = (v: string) => (v.includes('.') ? v.replace(/\.?0+$/, '') : v);
  for (const [f, u] of units) if (L >= f * 0.999) return `${trim(fmt(L / f, 3))} ${u}`;
  return `${fmt(L, 2, 0)} m`;
}

/** Nice 1-2-5 length near x. */
function nice(x: number): number {
  const e = Math.floor(Math.log10(x));
  const m = x / 10 ** e;
  return (m < 1.5 ? 1 : m < 3.5 ? 2 : m < 7.5 ? 5 : 10) * 10 ** e;
}

const REFS: { L: number; key: string }[] = [
  { L: 1e-14, key: 'ch38.ref.nucleus' },
  { L: 2e-10, key: 'ch38.ref.atom' },
  { L: 5e-7, key: 'ch38.ref.light' },
  { L: 1e-4, key: 'ch38.ref.hair' },
];
const REF_COLOR = '#6b6b6b';
const ATOM = '#d0d0d0';

export const deBroglieScene: Scene<PD, { t: number }> = {
  id: 'debroglie',
  title: 'ch38.d.scene',
  params: dbParams,
  world: PX_WORLD,
  init: () => ({ t: 0 }),

  draw: (g, _s, p) => {
    const id = p.part as ParticleId;
    const lam = deBroglie(momentum(p));
    const o = canvasBox(g);
    const H = o.b - o.t;
    const L = o.l + 30;
    const R = o.r - 30;

    // ---- log ruler 10⁻³⁶ … 1 m
    const yR = o.t + Math.max(100, 0.16 * H);
    const ruler = new Frame(g, { l: L, r: R, t: yR, b: yR }, [1e-36, 1], [0, 1], { x: true });
    linePx(g, L, yR, R, yR, { role: 'axis', width: 1.5 });
    for (let e = -36; e <= 0; e++) {
      const x = ruler.X(10 ** e);
      const major = e % (R - L < 600 ? 12 : 6) === 0;
      linePx(g, x, yR, x, yR + (major ? 6 : 3), { role: 'axis', width: 1 });
      if (major && Math.abs(x - ruler.X(lam)) > 26) textPx(g, x, yR + 19, `${pow10(e)} m`, { size: 11, color: TICK, align: 'center' });
    }
    // Reference labels: each in the lowest row where it does not overlap a label already placed.
    // Leader lines first, then the labels on white so a line never runs through text.
    const rowsEnd: number[] = [];
    const placed: { x: number; up: number; label: string; color: string; size: number }[] = [];
    for (const r of REFS) {
      const x = ruler.X(r.L);
      const label = t(r.key);
      const w = measureRich(g.ctx, label, { size: 11 }) + 8;
      let row = 0;
      while ((rowsEnd[row] ?? -Infinity) > x - w / 2) row++;
      rowsEnd[row] = x + w / 2;
      placed.push({ x, up: 16 + 17 * row, label, color: REF_COLOR, size: 11 });
    }
    const size = PARTICLES[id].size;
    if (size > 0) {
      const top = 16 + 17 * rowsEnd.length;
      placed.push({ x: ruler.X(size), up: top, label: t('ch38.d.size'), color: '#1a1a1a', size: 12 });
    }
    for (const q of placed) linePx(g, q.x, yR, q.x, yR - q.up + 4, { color: q.color, width: q.color === REF_COLOR ? 1 : 1.5 });
    for (const q of placed) {
      const w = measureRich(g.ctx, q.label, { size: q.size });
      const cx = Math.min(Math.max(q.x, L + w / 2), R - w / 2);
      rectPx(g, { l: cx - w / 2 - 2, r: cx + w / 2 + 2, t: yR - q.up - 11, b: yR - q.up + 3 }, { fill: '#ffffff' });
      textPx(g, cx, yR - q.up, q.label, { size: q.size, color: q.color, align: 'center' });
    }
    // λ marker below the ruler.
    const xl = ruler.X(lam);
    g.polygon(
      [
        ruler.P(lam, 0),
        { x: ruler.P(lam, 0).x - g.px(6), y: ruler.P(lam, 0).y - g.px(11) },
        { x: ruler.P(lam, 0).x + g.px(6), y: ruler.P(lam, 0).y - g.px(11) },
      ],
      { fill: WAVE },
    );
    const lx = Math.min(Math.max(xl, L + 60), R - 60);
    textPx(g, lx, yR + 42, `*λ* = ${fmt(lam, 3, 0)} m`, { size: 14, color: WAVE, align: 'center' });

    // ---- the wave at its own scale, with atoms and the particle when they fit
    const box = { l: L, r: R, t: yR + 72, b: o.b - 40 };
    const Wd = 8 * lam;
    const f = new Frame(g, box, [0, Wd], [-1.6, 1.6]);
    const pxPerM = (box.r - box.l) / Wd;
    const d = 2e-10;
    const dPx = d * pxPerM;
    f.clip(() => {
      if (dPx >= 10 && dPx <= box.r - box.l) {
        const r = Math.min(dPx * 0.22, (box.b - box.t) * 0.2);
        for (let x = d / 2; x < Wd; x += d) g.circle(f.P(x, 0), r, { fill: ATOM });
      }
      const sPx = size * pxPerM;
      if (size > 0 && sPx >= 6 && sPx <= 3 * (box.r - box.l)) {
        g.circle(f.P(Wd / 2, 0), sPx / 2, { color: '#1a1a1a', width: 1.5 });
      }
      const pts: [number, number][] = [];
      const n = 600;
      for (let i = 0; i <= n; i++) {
        const x = (Wd * i) / n;
        pts.push([x, Math.cos((2 * Math.PI * x) / lam)]);
      }
      f.polyline(pts, { color: WAVE, width: 2 });
    });
    // λ bracket over one wavelength, and a scale bar.
    const x0 = f.X(lam * 1);
    const x1 = f.X(lam * 2);
    const yb = f.Y(1.25);
    linePx(g, x0, yb, x1, yb, { color: WAVE, width: 1.25 });
    linePx(g, x0, yb - 4, x0, yb + 4, { color: WAVE, width: 1.25 });
    linePx(g, x1, yb - 4, x1, yb + 4, { color: WAVE, width: 1.25 });
    textPx(g, (x0 + x1) / 2, yb - 8, '*λ*', { size: 14, color: WAVE, align: 'center' });
    const S = nice(Wd / 4);
    const sx0 = box.r - S * pxPerM;
    const ys = box.b + 18;
    linePx(g, sx0, ys, box.r, ys, { color: '#1a1a1a', width: 2 });
    linePx(g, sx0, ys - 4, sx0, ys + 4, { color: '#1a1a1a', width: 1.5 });
    linePx(g, box.r, ys - 4, box.r, ys + 4, { color: '#1a1a1a', width: 1.5 });
    textPx(g, sx0 - 8, ys, fmtLen(S), { size: 12, color: '#1a1a1a', align: 'right', baseline: 'middle' });
  },

  readouts: [
    { label: '\\lambda', unit: 'm', value: (_s, p) => deBroglie(momentum(p)), zeroTol: 0 },
    { label: 'p', unit: 'kg·m/s', value: (_s, p) => momentum(p), zeroTol: 0 },
  ],

  info: {
    goals: ['ch38.d.goal.lambda', 'ch38.d.goal.scale'],
    observe: ['ch38.d.obs.electron', 'ch38.d.obs.neutron', 'ch38.d.obs.c60', 'ch38.d.obs.ball', 'ch38.d.obs.energy'],
    equations: ['\\lambda = \\frac{h}{p}', 'p = \\frac{\\sqrt{K^2 + 2Kmc^2}}{c} \\approx \\sqrt{2mK}'],
    assumptions: ['ch38.d.assume.rel', 'ch38.d.assume.refs'],
  },
};
