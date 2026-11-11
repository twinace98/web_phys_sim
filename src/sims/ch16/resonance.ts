// Ch 16 scene: a string fixed at both ends, driven gently at one end. Sweeping the driving
// frequency, the amplitude builds up only near f_n = n v / 2L (L = n λ/2). The resonance curve
// below the string marks the current frequency and the amplitude reached so far.
import { fmtTick } from '../../core/format';
import { t } from '../../core/i18n';
import type { ParamSchema, Scene, Vec2 } from '../../core/types';
import { drawEnd } from './reflect';
import { harmonic, resonance, steadyAmp, stringAdvance, stringInit, stringStep, type Driven, type StringState } from './physics';

type P = { f: number; env: boolean };

const STR: Driven = { L: 2, v: 4, beta: 0.3, d: 0.03, N: 100 };
const Y0 = 0.55; // string axis
const CH_Y = -0.75; // chart baseline
const CH_H = 0.55; // chart height for AMP_MAX
const AMP_MAX = 0.24;
const F_MAX = 4.75;
const KX = STR.L / F_MAX; // chart: world m per Hz
const LABEL = '#6b6b6b';
const ENV = '#8c8c8c';

// The resonance curve depends only on the fixed string; compute it once.
let curveCache: Vec2[] | null = null;
function curvePts(): Vec2[] {
  if (!curveCache) {
    curveCache = [];
    for (let i = 0; i <= 600; i++) {
      const f = 0.05 + ((F_MAX - 0.05) * i) / 600;
      curveCache.push({ x: f * KX, y: CH_Y + (Math.min(resonance(STR, f, 100), AMP_MAX * 1.05) / AMP_MAX) * CH_H });
    }
  }
  return curveCache;
}

const params: ParamSchema<P> = {
  f: {
    kind: 'number',
    label: 'ch16.r.p.f',
    desc: 'ch16.r.d.f',
    group: 'main',
    live: true,
    control: 'slider',
    min: 0.5,
    max: 4.5,
    step: 0.05,
    default: 2,
    unit: 'Hz',
  },
  env: { kind: 'toggle', label: 'ch16.r.p.env', desc: 'ch16.r.d.env', group: 'advanced', live: true, default: true },
};

export const resonanceScene: Scene<P, StringState> = {
  id: 'resonance',
  title: 'ch16.r.scene',
  params,
  time: { h: stringStep(STR), recordEvery: 4, frameStep: 0.05 },
  world: () => ({ x: [-0.32, STR.L + 0.3], y: [CH_Y - 0.2, Y0 + 0.32], aspect: 'contain', padPx: 18 }),
  init: () => stringInit(STR),
  step: (s, _h, p) => stringAdvance(STR, s, p.f),

  draw: (g, s, p) => {
    const { L, N } = STR;
    const lambda = STR.v / p.f;

    // Envelope of the steady state and its nodes, x = L − mλ/2.
    if (p.env) {
      for (const sg of [-1, 1]) {
        const pts: Vec2[] = [];
        for (let i = 0; i <= 200; i++) {
          const x = (L * i) / 200;
          pts.push({ x, y: Y0 + sg * Math.min(steadyAmp(STR, p.f, x), 0.3) });
        }
        g.polyline(pts, { color: ENV, width: 1, dash: [2, 3] });
      }
      for (let m = 1; L - (m * lambda) / 2 > 0.02; m++) g.circle({ x: L - (m * lambda) / 2, y: Y0 }, 3.5, { fill: '#1a1a1a' });
    }

    const pts: Vec2[] = s.y.map((y, i) => ({ x: (L * i) / N, y: Y0 + y }));
    g.polyline(pts, { role: 'fg', width: 2.5 });
    drawEnd(g, 'fixed', L, Y0, Y0, 0.25);
    // Driver: a small block moving the left end.
    const yd = Y0 + s.y[0];
    g.polygon(
      [
        { x: -0.12, y: yd - 0.05 },
        { x: 0, y: yd - 0.05 },
        { x: 0, y: yd + 0.05 },
        { x: -0.12, y: yd + 0.05 },
      ],
      { fill: '#5c5c5c' },
    );

    // Resonance curve: largest steady-state amplitude against the driving frequency.
    const x1 = F_MAX * KX;
    g.line({ x: 0, y: CH_Y }, { x: x1, y: CH_Y }, { role: 'axis', width: 1.25 });
    g.line({ x: 0, y: CH_Y }, { x: 0, y: CH_Y + CH_H + 0.04 }, { role: 'axis', width: 1.25 });
    for (let f = 1; f <= 4; f++) {
      g.line({ x: f * KX, y: CH_Y }, { x: f * KX, y: CH_Y - g.px(4) }, { role: 'axis', width: 1 });
      g.text({ x: f * KX, y: CH_Y }, fmtTick(f), { size: 11, color: LABEL, align: 'center', dy: 16 });
    }
    for (const a of [0.1, 0.2]) {
      const y = CH_Y + (a / AMP_MAX) * CH_H;
      g.line({ x: 0, y }, { x: -g.px(4), y }, { role: 'axis', width: 1 });
      g.text({ x: 0, y }, fmtTick(a), { size: 11, color: LABEL, align: 'right', baseline: 'middle', dx: -7 });
    }
    g.text({ x: x1, y: CH_Y }, '*f* (Hz)', { size: 12, color: LABEL, align: 'right', dy: 32 });
    g.text({ x: 0, y: CH_Y + CH_H + 0.04 }, t('ch16.r.amp'), { size: 12, color: LABEL, align: 'left', dx: 6, dy: -8 });
    g.polyline(curvePts(), { color: '#b0b0b0', width: 1.5 });
    for (let n = 1; harmonic(STR, n) <= F_MAX; n++) {
      const x = harmonic(STR, n) * KX;
      const top = CH_Y + (resonance(STR, harmonic(STR, n), 100) / AMP_MAX) * CH_H;
      g.text({ x, y: top }, `*f*_{${n}}`, { size: 12, color: LABEL, align: 'center', dy: -8 });
    }
    const fx = p.f * KX;
    g.line({ x: fx, y: CH_Y }, { x: fx, y: CH_Y + (Math.min(resonance(STR, p.f, 100), AMP_MAX) / AMP_MAX) * CH_H }, { color: '#1a1a1a', width: 1, alpha: 0.35 });
    g.circle({ x: fx, y: CH_Y + (Math.min(s.amp, AMP_MAX * 1.05) / AMP_MAX) * CH_H }, 5, { fill: 'position' });
  },

  readouts: [
    { label: 'f', unit: 'Hz', value: (_s, p) => p.f },
    { label: '\\lambda', unit: 'm', value: (_s, p) => STR.v / p.f },
    { label: '2L/\\lambda', unit: '', value: (_s, p) => (2 * STR.L * p.f) / STR.v },
  ],

  info: {
    goals: ['ch16.r.goal.res', 'ch16.r.goal.modes'],
    observe: ['ch16.r.obs.default', 'ch16.r.obs.off', 'ch16.r.obs.sweep', 'ch16.r.obs.nodes', 'ch16.r.obs.build'],
    equations: ['L = n\\frac{\\lambda}{2}, \\quad f_n = \\frac{n v}{2L} \\quad (n = 1, 2, 3, \\dots)'],
    assumptions: ['ch16.r.assume.string', 'ch16.r.assume.damp'],
  },
};
