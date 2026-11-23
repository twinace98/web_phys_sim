// Ch 36 scene: a plane wave passes one slit of width a (or two such slits, centres d apart).
// Huygens sources across each slit interfere behind it; the screen records the time-averaged
// intensity. Two slits: the single-slit envelope times the two-slit fringes, with missing
// orders where d/a is an integer.
import { fmt } from '../../core/format';
import type { ParamSchema, Scene, Vec2 } from '../../core/types';
import { ROLE_COLOR } from '../../draw/theme';
import { boxText } from '../inset/inset';
import { pathDiff } from '../ch35/physics';
import { WaveField, wavelengthRGB, type Aperture } from '../wave2d/field';
import {
  H_FS,
  SCREEN_N,
  STRIP,
  XL,
  Y0,
  Y1,
  clampY,
  dimLine,
  drawBarrier,
  drawMarker,
  drawScreen,
  fieldFor,
  initSlit,
  relIntensity,
  slitEnd,
  stepSlit,
  worldOf,
  type SlitState,
} from '../wave2d/slits';
import { drawWave } from '../wave2d/view';
import { num, slider, tn, tnCmp } from '../../core/tex';
import { firstMin } from './physics';

type P = { slits: string; a: number; lambda: number; D: number; d: number; yp: number };

/** Huygens sources drawn in the slit (the field itself uses a finer division). */
export const N_SHOW = 10;
const DEG = 180 / Math.PI;
const GREY = '#8c8c8c';

const two = (p: Pick<P, 'slits'>) => p.slits === 'two';
/** Centre-to-centre separation used: d, but never below a (at d = a the slits touch, one slit of width 2a). */
export const sepOf = (p: Pick<P, 'a' | 'd'>) => Math.max(p.d, p.a);

export const apsOf = (p: Pick<P, 'slits' | 'a' | 'd'>): Aperture[] =>
  two(p)
    ? [
        { yc: sepOf(p) / 2, w: p.a },
        { yc: -sepOf(p) / 2, w: p.a },
      ]
    : [{ yc: 0, w: p.a }];
const field = (p: P) => fieldFor(p.lambda, apsOf(p), p.D);

/** Fresnel number a²/(λD) of one slit: ≪ 1 is the Fraunhofer (far-field) regime. */
export const fresnelNumber = (p: Pick<P, 'a' | 'lambda' | 'D'>) => (p.a * p.a) / ((p.lambda / 1000) * p.D);
/**
 * How the Fraunhofer first-minimum mark y₁ = D tan θ₁ is drawn. Wave field over the slider ranges:
 * a²/(λD) ≤ 1: the minimum sits at y₁ and drops below 3 % of the maximum; 1-3: still at y₁
 * (within 0.05 μm) but filled in to 4-28 %; above 3 it moves away from y₁ or is no minimum at all
 * (a = 6 μm, λ = 400 nm, D = 15 μm: the brightest point lies at y₁ itself).
 */
export const FRESNEL_FAINT = 1;
export const FRESNEL_HIDE = 3;
export const y1Mark = (p: Pick<P, 'a' | 'lambda' | 'D'>): 'normal' | 'faint' | 'hidden' => {
  const nf = fresnelNumber(p);
  return nf > FRESNEL_HIDE ? 'hidden' : nf > FRESNEL_FAINT ? 'faint' : 'normal';
};
const FAINT = '#a8a8a8';

/** Heights of the drawn sources, top first, in a slit of width a centred at yc. */
export const shownSources = (a: number, n = N_SHOW, yc = 0) => Array.from({ length: n }, (_, i) => yc + a / 2 - ((i + 0.5) * a) / n);

const params: ParamSchema<P> = {
  slits: {
    kind: 'select',
    label: 'ch36.p.slits',
    desc: 'ch36.d.slits',
    group: 'main',
    live: false,
    default: 'one',
    options: [
      { value: 'one', label: 'ch36.slits.one' },
      { value: 'two', label: 'ch36.slits.two' },
    ],
  },
  a: {
    kind: 'number',
    label: 'ch36.p.a',
    desc: 'ch36.d.a',
    group: 'main',
    live: false,
    control: 'slider',
    min: 0.5,
    max: 6,
    step: 0.1,
    default: 2,
    unit: 'μm',
  },
  lambda: {
    kind: 'number',
    label: 'ch36.p.lambda',
    desc: 'ch36.d.lambda',
    group: 'advanced',
    live: false,
    control: 'slider',
    min: 400,
    max: 700,
    step: 10,
    default: 500,
    unit: 'nm',
  },
  D: {
    kind: 'number',
    label: 'ch36.p.D',
    desc: 'ch36.d.D',
    group: 'advanced',
    live: false,
    control: 'slider',
    min: 15,
    max: 30,
    step: 1,
    default: 25,
    unit: 'μm',
  },
  // Default d = 2a: the m = ±2 fringes fall on the first envelope zero and are missing.
  d: {
    kind: 'number',
    label: 'ch36.p.d',
    desc: 'ch36.d.d',
    group: 'advanced',
    live: false,
    control: 'slider',
    min: 1,
    max: 10,
    step: 0.1,
    default: 4,
    unit: 'μm',
    visibleIf: (p) => p.slits === 'two',
  },
  // Screen point for the path construction; default: first minimum of the single-slit pattern.
  yp: {
    kind: 'number',
    label: 'ch36.p.yp',
    desc: 'ch36.d.yp',
    group: 'hidden',
    live: true,
    control: 'slider',
    min: -11.5,
    max: 11.5,
    default: Math.round(25 * Math.tan(firstMin(0.5, 2)) * 20) / 20,
  },
};

/** Path difference of the pair (top source, source half a slit below it) to the screen point, in λ. */
export function pairDiff(p: Pick<P, 'a' | 'lambda' | 'D' | 'yp'>): number {
  const ys = shownSources(p.a);
  const r = (y: number) => Math.hypot(p.D, p.yp - y);
  return (r(ys[N_SHOW / 2]) - r(ys[0])) / (p.lambda / 1000);
}

/** Path difference shown at the screen point, in λ: the source pair (one slit) or the two slit centres (two slits). */
export const markDiff = (p: P) => (two(p) ? pathDiff(sepOf(p), p.D, p.yp) / (p.lambda / 1000) : pairDiff(p));

let envKey = '';
let envMemo = new Float64Array(0);
/**
 * Upper envelope (|E₁| + |E₂|)² of the two-slit screen pattern, relative to its maximum: each
 * slit's own diffraction pattern, computed alone with the same sources. The fringes touch it where
 * the two waves arrive in phase; far away it becomes the single-slit (sin α/α)².
 */
export function envelope(p: P): Float64Array {
  const key = `${p.lambda}|${p.D}|${p.a}|${sepOf(p)}`;
  if (key === envKey) return envMemo;
  const alone = (ap: Aperture) =>
    new WaveField({ lambda: p.lambda / 1000, apertures: [ap], xL: XL, x1: p.D, y0: Y0, y1: Y1, screenX: p.D, screenN: SCREEN_N, maxCells: 64 }).screenSteady();
  const [I1, I2] = apsOf({ ...p, slits: 'two' }).map(alone);
  const tot = fieldFor(p.lambda, apsOf({ ...p, slits: 'two' }), p.D).screenSteady();
  let max = 0;
  for (const v of tot) max = Math.max(max, v);
  envMemo = I1.map((v, i) => (Math.sqrt(v) + Math.sqrt(I2[i])) ** 2 / max);
  envKey = key;
  return envMemo;
}

const UM = '\\ \\mu\\mathrm{m}';

/**
 * Σ panel: first minimum a sin θ₁ = λ (or λ/a ≥ 1: no minimum), its screen height
 * y₁ = D tan θ₁, ΔL/λ at the marked point, and for two slits d/a with the missing orders.
 */
export function formulaLines(p: P): string[] {
  const lam = p.lambda / 1000;
  const ratio = lam / p.a;
  const th = firstMin(lam, p.a);
  const lines: string[] = [];
  const aa = slider(params.a, p.a);
  const head = `\\sin\\theta_1 = \\frac{\\lambda}{a} = \\frac{${num(lam)}}{${aa}}`;
  if (Number.isNaN(th)) lines.push(`${head} = ${tnCmp(ratio, 1)} \\ge 1`);
  else {
    const thDeg = th * DEG;
    lines.push(`${head} = ${tn(ratio)},\\quad \\theta_1 = ${tn(thDeg)}^\\circ`);
    const y1 = p.D * Math.tan(th);
    // Far from the Fraunhofer regime the stage drops the y₁ mark (no minimum there); so does the panel.
    if (y1Mark(p) !== 'hidden') lines.push(`y_1 = D\\tan\\theta_1 = ${slider(params.D, p.D)}\\tan ${tn(thDeg)}^\\circ = ${tn(y1)}${UM}`);
  }
  const n = markDiff(p);
  lines.push(`\\frac{\\Delta L}{\\lambda} = \\frac{${tn(n * lam)}${UM}}{${num(lam)}${UM}} = ${tn(n, 2)}`);
  if (two(p)) {
    const q = sepOf(p) / p.a;
    const k = Math.round(q);
    const whole = Math.abs(q - k) < 1e-9;
    const ratioTex = `\\frac{d}{a} = \\frac{${slider(params.a, sepOf(p))}}{${aa}} = ${whole ? `${k}\\ \\Rightarrow\\ m = \\pm ${k}, \\pm ${2 * k}, \\ldots` : tn(q)}`;
    // d below a cannot be built (the slits would overlap): they touch and d = a is used. Say so
    // with the slider's own d, so the next line does not quietly print a different d. Two lines:
    // one line shrank to about 0.6 × in the docked panel.
    if (p.d < p.a) lines.push(`d = ${slider(params.d, p.d)}${UM} < a\\ \\Rightarrow\\ d = a`);
    lines.push(ratioTex);
  }
  return lines;
}

export const singleSlit: Scene<P, SlitState> = {
  id: 'single',
  title: 'ch36.s.scene',
  params,
  time: { h: H_FS, recordEvery: 20, frameStep: 1, scale: 10, unit: 'fs', tEnd: (p) => slitEnd(field(p as P), (p as P).D) },
  world: (p) => worldOf(p.D),
  init: () => initSlit(),
  step: (s, h, p) => stepSlit(s, h, field(p)),

  draw: (g, s, p, ui) => {
    const f = field(p);
    const rgb = wavelengthRGB(p.lambda);
    const aps = apsOf(p);
    // Wave drawn at the frame's own time (between steps), so the wavefronts move smoothly.
    drawWave(g, f, ui?.tFrame ?? s.t, rgb);
    drawBarrier(g, aps);
    const inset = drawScreen(g, p.D, f, relIntensity(s, f), rgb);
    if (two(p)) {
      const env = envelope(p);
      inset.curve(
        Array.from(env, (v, i) => [v, f.screenY[i]] as [number, number]),
        { color: GREY, width: 1.25, dash: [5, 4] },
      );
    }

    // First minima a sin θ = λ (of the single-slit envelope), as screen heights: normal in the
    // Fraunhofer regime, light grey where the near-field minimum is shallow, gone beyond that.
    const th = firstMin(p.lambda / 1000, p.a);
    const y1 = p.D * Math.tan(th);
    const bx = inset.r.x1 + 0.9;
    const mark = y1Mark(p);
    if (mark !== 'hidden' && Number.isFinite(y1) && y1 < 11.5) {
      const faint = mark === 'faint';
      for (const y of [-y1, 0, y1]) g.line({ x: inset.r.x0, y }, { x: y === 0 ? bx : inset.r.x1, y }, { color: faint ? '#d6d6d6' : '#b5b5b5', width: 1, dash: [3, 4] });
      dimLine(g, { x: bx, y: 0 }, { x: bx, y: y1 }, '*y*_{1}', 20, 0, faint ? FAINT : undefined);
    }

    dimLine(g, { x: 0, y: Y0 - 1.2 }, { x: p.D, y: Y0 - 1.2 }, '*D*', 0, 0);
    const P0: Vec2 = { x: p.D, y: p.yp };
    const r = Math.max(2, Math.min(4, g.vp.scale * (p.a / N_SHOW) * 0.35));

    if (two(p)) {
      // Two slits: chained dimensions on one line (narrow stages have no room for two columns):
      // a across the lower slit, then d from its top edge to the top edge of the upper slit.
      // Sources blue (upper slit) and orange (lower slit); paths from the two centres to the point.
      const s2 = sepOf(p) / 2;
      const mid = -s2 + p.a / 2;
      // Labels sit (s2 + a/2) apart; push them apart when closer than one label height.
      const push = Math.max(0, 20 - (s2 + p.a / 2) * g.vp.scale) / 2;
      dimLine(g, { x: -1.1, y: -s2 - p.a / 2 }, { x: -1.1, y: mid }, '*a*', -16, push);
      dimLine(g, { x: -1.1, y: mid }, { x: -1.1, y: s2 + p.a / 2 }, '*d*', -16, -push);
      g.line({ x: 0, y: s2 }, P0, { color: ROLE_COLOR.position, width: 1.5 });
      g.line({ x: 0, y: -s2 }, P0, { color: ROLE_COLOR.energyU, width: 1.5 });
      const n = N_SHOW / 2;
      for (const [yc, fill] of [
        [s2, 'position'],
        [-s2, 'energyU'],
      ] as const)
        shownSources(p.a, n, yc).forEach((y, i) => g.circle({ x: 0.1, y }, i === (n - 1) / 2 ? r + 1.5 : r, { fill, color: '#ffffff', width: 1 }));
    } else {
      // Huygens sources: upper half blue, lower half orange; the pair (top, half a slit below) to the point.
      dimLine(g, { x: -1.1, y: -p.a / 2 }, { x: -1.1, y: p.a / 2 }, '*a*', -16, 0);
      const ys = shownSources(p.a);
      g.line({ x: 0, y: ys[0] }, P0, { color: ROLE_COLOR.position, width: 1.5 });
      g.line({ x: 0, y: ys[N_SHOW / 2] }, P0, { color: ROLE_COLOR.energyU, width: 1.5 });
      ys.forEach((y, i) => {
        const pair = i === 0 || i === N_SHOW / 2;
        g.circle({ x: 0.1, y }, pair ? r + 1.5 : r, { fill: i < N_SHOW / 2 ? 'position' : 'energyU', color: '#ffffff', width: 1 });
      });
    }
    drawMarker(g, p.D, p.yp);
    boxText(g, P0, `Δ*L* = ${fmt(markDiff(p), 2)} *λ*`, { size: 13, align: 'right', dx: -14, dy: p.yp > 9 ? 16 : -16 });
  },

  handles: [
    {
      pos: (_s, p) => ({ x: p.D + STRIP / 2, y: p.yp }),
      radiusPx: 14,
      onDrag: (ctx, _s, w) => {
        const y = clampY(w.y);
        if (y !== ctx.params.yp) ctx.set('yp', y);
      },
    },
  ],

  readouts: [
    { label: '\\theta_1', unit: '°', value: (_s, p) => firstMin(p.lambda / 1000, p.a) * DEG },
    { label: '\\Delta L/\\lambda', unit: '', value: (_s, p) => markDiff(p), sig: 2 },
  ],

  formula: (_s, p) => formulaLines(p),

  info: {
    goals: ['ch36.s.goal.cause', 'ch36.s.goal.min', 'ch36.s.goal.two'],
    observe: ['ch36.s.obs.build', 'ch36.s.obs.pair', 'ch36.s.obs.narrow', 'ch36.s.obs.wide', 'ch36.s.obs.lambda', 'ch36.s.obs.two', 'ch36.s.obs.ratio'],
    equations: [
      'a\\sin\\theta = m\\lambda \\;\\; (I = 0,\\; m = \\pm1, \\pm2, \\dots)',
      '\\Delta L = \\tfrac{a}{2}\\sin\\theta = \\tfrac{\\lambda}{2} \\;\\Rightarrow\\; a\\sin\\theta = \\lambda',
      'I = I_m \\left(\\frac{\\sin\\alpha}{\\alpha}\\right)^2 \\cos^2\\beta, \\quad \\alpha = \\frac{\\pi a}{\\lambda}\\sin\\theta, \\;\\; \\beta = \\frac{\\pi d}{\\lambda}\\sin\\theta',
    ],
    assumptions: ['ch36.s.assume.model', 'ch36.s.assume.scale', 'ch36.s.assume.sources', 'ch36.s.assume.two'],
  },
};
