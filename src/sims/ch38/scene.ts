// Ch 38 scenes: a wave packet from M plane waves next to a classical particle, and the
// de Broglie wavelength of an electron, a neutron, a C60 molecule and a baseball.
import { t } from '../../core/i18n';
import type { ParamSchema, Scene } from '../../core/types';
import { ROLE_COLOR } from '../../draw/theme';
import { Frame, PX_WORLD, TICK, W, canvasBox, linePx, textPx } from '../modern/frame';
import { num, tn, u } from '../../core/tex';
import {
  DK,
  HBAR_M,
  deltaK,
  packet,
  packetWidth,
  psi,
  vGroup,
  vPhase,
  type Packet,
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
    control: 'stepper',
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

/**
 * Formula panel: group and phase velocity, the classical particle at v_g t, and Δx Δk (the same
 * calls as the readouts). Δx is printed only while the packet is localised within one repeat.
 */
export function packetLines(time: number, p: PP): string[] {
  const pk = pkOf(p);
  const vg = vGroup(p.k0);
  const dk = deltaK(pk);
  const dx = packetWidth(pk, time, vg * time, 600);
  const lines = [
    // ħ/m = 0.1158 nm²/fs, k₀ in nm⁻¹.
    `v_\\text{g} = \\frac{\\hbar}{m}\\,k_0 = ${tn(HBAR_M, 4)} \\times ${num(p.k0)} = ${tn(vg)}${u('nm/fs')}`,
    `v_\\text{p} = \\frac{\\omega_0}{k_0} = \\frac{v_\\text{g}}{2} = ${tn(vPhase(p.k0))}${u('nm/fs')}`,
    `x = v_\\text{g}\\,t = ${tn(vg, 4)} \\times ${tn(time, 4)} = ${tn(vg * time)}${u('nm')}`,
  ];
  if (!Number.isFinite(dx)) {
    lines.push(`\\Delta k = ${tn(dk)}${u('nm^{-1}')},\\quad \\Delta x > \\frac{2\\pi}{6\\,\\delta k} = \\frac{${num((2 * Math.PI) / DK)}\\ \\mathrm{nm}}{6} = ${tn((2 * Math.PI) / DK / 6)}${u('nm')}`);
    return lines;
  }
  const prod = dx * dk;
  lines.push(`\\Delta x = ${tn(dx)}${u('nm')},\\quad \\Delta k = ${tn(dk)}${u('nm^{-1}')}`);
  lines.push(`\\Delta x\\,\\Delta k = ${tn(dx, 4)} \\times ${tn(dk, 4)} = ${tn(prod)} ${Number(tn(prod)) >= 0.5 ? '\\ge' : '<'} \\tfrac12`);
  return lines;
}

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

  draw: (g, s, p, ui) => {
    const pk = pkOf(p);
    // Analytic in t: drawn at the frame's own time, so the packet moves smoothly between steps.
    const tt = ui?.tFrame ?? s.t;
    const o = canvasBox(g);
    const H = o.b - o.t;
    const wave = new Frame(g, { l: o.l + 40, t: o.t + 24, r: o.r - 20, b: o.t + 0.58 * H }, X_RANGE, [-1.15, 1.15]);
    const amp = pk.a.reduce((a, b) => a + b, 0);
    const n = Math.min(900, Math.round(wave.box.r - wave.box.l));
    const re: [number, number][] = [];
    const pr: [number, number][] = [];
    for (let i = 0; i <= n; i++) {
      const x = X_RANGE[0] + ((X_RANGE[1] - X_RANGE[0]) * i) / n;
      const [a, b] = psi(pk, x, tt);
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
    const xc = vGroup(p.k0) * tt;
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
    fs.axes({ yTicks: false });
    textPx(g, fs.box.l + 4, fs.box.t - 4, t('ch38.k.amp'), { size: 12, color: TICK });
    // k label on the title row at the right, clear of the stems (at M = 33 they reach the axis ends).
    textPx(g, fs.box.r, fs.box.t - 4, '*k* (nm^{−1})', { size: 12, color: TICK, align: 'right' });
  },

  readouts: [
    // Δx and the product read "–" while the packet is not localised within one repeat (M ≤ 3).
    { label: '\\Delta x', unit: 'nm', value: (s, p) => packetWidth(pkOf(p), s.t, vGroup(p.k0) * s.t, 600) },
    { label: '\\Delta k', unit: 'nm⁻¹', value: (_s, p) => deltaK(pkOf(p)) },
    { label: '\\Delta x\\,\\Delta k', unit: '', value: (s, p) => packetWidth(pkOf(p), s.t, vGroup(p.k0) * s.t, 600) * deltaK(pkOf(p)) },
  ],

  formula: (s, p) => packetLines(s.t, p),

  info: {
    goals: ['ch38.k.goal.build', 'ch38.k.goal.move'],
    observe: ['ch38.k.obs.one', 'ch38.k.obs.more', 'ch38.k.obs.product', 'ch38.k.obs.group', 'ch38.k.obs.spread'],
    equations: [
      '\\psi(x,t) = \\sum_j a_j\\, e^{i(k_j x - \\omega_j t)}, \\quad \\omega = \\frac{\\hbar k^2}{2m}',
      'v_\\text{g} = \\frac{d\\omega}{dk} = \\frac{\\hbar k_0}{m} = \\frac{p}{m}',
      '\\Delta x\\,\\Delta k \\ge \\tfrac12, \\quad \\Delta p = \\hbar\\,\\Delta k \\;\\Rightarrow\\; \\Delta x\\,\\Delta p \\ge \\tfrac{\\hbar}{2}',
    ],
    assumptions: ['ch38.k.assume.define', 'ch38.k.assume.electron', 'ch38.k.assume.period'],
  },
};
