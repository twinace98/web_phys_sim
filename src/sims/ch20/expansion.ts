// Ch 20 scene: free expansion. The gas starts in the left half behind a partition; the user removes
// it (button under the box, or a tap on the partition). The macrostate n (particles in the left
// half) then wanders towards N/2, where the number of microstates Ω = C(N, n) is largest.
import { fmt } from '../../core/format';
import { t as tr } from '../../core/i18n';
import { fmtInt, num, texOf, tn } from '../../core/tex';
import type { Handle, ParamSchema, Scene, Vec2 } from '../../core/types';
import type { Draw } from '../../draw/draw';
import { drawRich, measureRich } from '../../draw/text';
import { ROLE_COLOR, theme } from '../../draw/theme';
import { chart, inPanel, split, stageRect, TICK, type Rect } from '../ch18/panels';
import { entropyLR, initParticles, leftCount, lnBinom, moveParticles, type Particles } from './physics';

type P = { N: number };
interface S {
  t: number;
  part: Particles;
  n: number;
  /** Partition removed (by the user). */
  open: boolean;
}

/** Where the remove button and the partition were drawn last frame [stage world coords]. */
let lastHit: { button: Vec2 | null; wall: Vec2 | null } = { button: null, wall: null };

const BLUE = ROLE_COLOR.position;
const HL = ROLE_COLOR.velocity;
const WALL = '#5c5c5c';

const Smax = (N: number) => lnBinom(N, Math.floor(N / 2));

/** Ω = C(N, n): the integer below 10⁵ (R2: 1, 252), 3 figures above (1.01×10²⁹). Bar labels, readout, Σ. */
export const omegaText = (Om: number) => (Om < 1e5 ? fmtInt(Om) : fmt(Om));
/** ΔS/k = ln Ω: an exact 0 for the single microstate Ω = 1 (R2); undefined: 3 figures. */
const dsText = (S: number) => (Math.abs(S) < 1e-9 ? '0' : undefined);

const params: ParamSchema<P> = {
  N: {
    kind: 'number',
    label: 'ch20.p.N',
    desc: 'ch20.d.N',
    group: 'main',
    live: false,
    control: 'select',
    choices: [4, 10, 100, 1000],
    default: 10,
  },
};

function drawBox(g: Draw, r: Rect, s: S, p: P): void {
  // Room under the box for the remove button.
  inPanel(g, r, { x: [-0.05, 2.05], y: [-0.4, 1.12], aspect: 'contain', padPx: 8 }, (d) => {
    // Panel px → stage world (the panel is drawn translated by r.x, r.y).
    const toStage = (px: number, py: number): Vec2 => {
      const [x, y] = g.vp.toWorld(r.x + px, r.y + py);
      return { x, y };
    };
    const box: Vec2[] = [
      { x: 0, y: 0 },
      { x: 2, y: 0 },
      { x: 2, y: 1 },
      { x: 0, y: 1 },
      { x: 0, y: 0 },
    ];
    d.polyline(box, { color: WALL, width: 2.5 });
    if (!s.open) {
      d.line({ x: 1, y: 0 }, { x: 1, y: 1 }, { color: WALL, width: 4 });
      // Remove button centred under the partition.
      const label = tr('ch20.e.remove');
      // 8 px clear of the box at any scale (the button is 24 px tall).
      const [cx, by] = d.vp.toPx(1, 0);
      const cy = by + 20;
      const w = measureRich(g.ctx, label, { size: 12 }) + 18;
      const hgt = 24;
      const ctx = g.ctx;
      ctx.save();
      ctx.beginPath();
      ctx.roundRect(cx - w / 2, cy - hgt / 2, w, hgt, 5);
      ctx.fillStyle = '#ffffff';
      ctx.fill();
      ctx.lineWidth = 1.25;
      ctx.strokeStyle = WALL;
      ctx.stroke();
      ctx.restore();
      drawRich(ctx, label, cx, cy + 0.5, { size: 12, color: '#1a1a1a', align: 'center', baseline: 'middle' });
      const [wx, wy] = d.vp.toPx(1, 0.5);
      lastHit = { button: toStage(cx, cy), wall: toStage(wx, wy) };
    } else {
      d.line({ x: 1, y: 0 }, { x: 1, y: 1 }, { color: '#c8c8c8', width: 1, dash: [4, 5] });
      lastHit = { button: null, wall: null };
    }
    // Radius in box units (box height 1), so particles shrink with the box on a narrow screen.
    const rBox = p.N <= 10 ? 0.025 : p.N <= 100 ? 0.014 : 0.0078;
    const rPx = Math.max(1.2, rBox / d.px(1));
    const pt = s.part;
    for (let i = 0; i < pt.N; i++) d.circle({ x: pt.x[i], y: pt.y[i] }, rPx, { fill: BLUE });
    d.text({ x: 0.5, y: 1 }, `*n* = ${s.n}`, { size: 13, color: '#1a1a1a', align: 'center', dy: -8 });
    d.text({ x: 1.5, y: 1 }, `*N* − *n* = ${p.N - s.n}`, { size: 13, color: '#1a1a1a', align: 'center', dy: -8 });
  });
}

/** Ω(n) (multiplicity) for every macrostate, the current one highlighted. */
function drawOmega(g: Draw, r: Rect, s: S, p: P): void {
  const N = p.N;
  const lm = Smax(N);
  const small = N <= 10;
  const yTop = small ? Math.exp(lm) * 1.18 : 1.12;
  const wOf = (n: number) => (small ? Math.exp(lnBinom(N, n)) : Math.exp(lnBinom(N, n) - lm));
  chart(g, r, [-0.6, N + 0.6], [0, yTop], { l: small ? 40 : 34, r: 14, t: 20, b: 36 }, (c) => {
    c.axes({
      xLabel: '*n*',
      yLabel: small ? 'Ω' : 'Ω / Ω_{max}',
      xTickList: N <= 10 ? Array.from({ length: N + 1 }, (_, k) => k) : undefined,
      yTicks: small ? 4 : 2,
    });
    const half = Math.max(0.5, Math.min(14, (c.X(1) - c.X(0)) * 0.36));
    const bar = (n: number, col: string, a: number) => {
      const h = wOf(n);
      if (c.Y(h) - c.Y(0) < 0.5) return;
      c.d.polygon(
        [
          { x: c.X(n) - half, y: c.Y(0) },
          { x: c.X(n) + half, y: c.Y(0) },
          { x: c.X(n) + half, y: c.Y(h) },
          { x: c.X(n) - half, y: c.Y(h) },
        ],
        { fill: col, fillAlpha: a },
      );
    };
    if (N <= 100) for (let n = 0; n <= N; n++) bar(n, BLUE, 0.35);
    else {
      const pts: Vec2[] = [c.P(0, 0)];
      for (let n = 0; n <= N; n++) pts.push(c.P(n, wOf(n)));
      pts.push(c.P(N, 0));
      c.d.polygon(pts, { fill: BLUE, fillAlpha: 0.35 });
    }
    if (small) {
      for (let n = 0; n <= N; n++) c.d.text(c.P(n, wOf(n)), omegaText(wOf(n)), { size: 11, color: TICK, align: 'center', dy: -5 });
    }
    // Current macrostate: highlighted bar and a marker on the axis.
    const hn = Math.max(half, 1.5);
    const h = wOf(s.n);
    c.d.polygon(
      [
        { x: c.X(s.n) - hn, y: c.Y(0) },
        { x: c.X(s.n) + hn, y: c.Y(0) },
        { x: c.X(s.n) + hn, y: Math.max(c.Y(h), c.Y(0) + 2) },
        { x: c.X(s.n) - hn, y: Math.max(c.Y(h), c.Y(0) + 2) },
      ],
      { fill: HL, fillAlpha: 0.9 },
    );
    c.d.polygon(
      [
        { x: c.X(s.n), y: c.Y(0) - 1 },
        { x: c.X(s.n) - 5, y: c.Y(0) - 9 },
        { x: c.X(s.n) + 5, y: c.Y(0) - 9 },
      ],
      { fill: HL },
    );
  });
}

export const expansionScene: Scene<P, S> = {
  id: 'expansion',
  title: 'ch20.scene.expansion',
  params,
  time: { h: 1 / 60, recordEvery: 2, frameStep: 0.1, window: 30 },
  world: () => ({ x: [0, 1], y: [0, 1], aspect: 'contain' }),
  init: (p, rng) => {
    const part = initParticles(p.N, rng);
    return { t: 0, part, n: leftCount(part), open: false };
  },
  step: (s, h) => {
    s.t += h;
    moveParticles(s.part, h, !s.open);
    s.n = leftCount(s.part);
  },

  // Remove the partition: the button under the box, or a tap on the partition itself.
  handles: (['button', 'wall'] as const).map(
    (which): Handle<S, P> => ({
      radiusPx: which === 'button' ? 22 : 18,
      when: () => lastHit[which] !== null,
      pos: () => lastHit[which] ?? { x: -1e6, y: -1e6 },
      onDrag: () => {},
      onTap: (_ctx, s) => {
        s.open = true;
      },
    }),
  ),
  record: (s, p) => ({ t: s.t, n: s.n, S: entropyLR(p.N, s.n) }),

  draw: (g, s, p) => {
    const full = stageRect(g);
    const [box, w] = full.w > 1.9 * full.h ? split(full, 'row', [1.2, 1], 10) : split(full, 'col', [1, 1], 6);
    drawBox(g, box, s, p);
    drawOmega(g, w, s, p);
  },

  plots: [
    { id: 'n', label: 'n', traces: [{ channel: 'n', role: 'position' }], yRange: (p) => [0, p.N * 1.05] },
    { id: 'S', label: '\\Delta S/k = \\ln\\Omega', traces: [{ channel: 'S', role: 'fg' }], yRange: (p) => [0, Math.max(1, Smax(p.N) * 1.15)] },
  ],

  drawPlot: (id, pd, p) => {
    const y = id === 'n' ? p.N / 2 : Smax(p.N);
    const [x0] = pd.toPx(0, y);
    const st = { color: '#1a1a1a', width: 1, dash: [5, 4], alpha: 0.6 };
    pd.polyline([[-1e6, y], [1e6, y]], st);
    const [, py] = pd.toPx(0, y);
    const lbl = id === 'n' ? '*N*/2' : 'Δ*S*_{max}';
    drawRich(pd.ctx, lbl, x0 + 6 * theme.scale, py - 5 * theme.scale, { size: 11, color: TICK });
  },

  readouts: [
    { label: 'n', unit: '', value: (s) => s.n, sig: 1 },
    // Ω a count (R2): an integer below 10⁵, 3 figures above.
    { label: '\\Omega', unit: '', value: (s, p) => Math.exp(lnBinom(p.N, s.n)), format: (v) => (v < 1e5 ? omegaText(v) : undefined) },
    // Relative to the all-left state (Ω = 1): only the change is physical; ln 1 = 0 exactly.
    { label: '\\Delta S/k', unit: '', value: (s, p) => entropyLR(p.N, s.n), format: dsText },
  ],

  formula: (s, p) => formulaLines(s.n, p),

  info: {
    goals: ['ch20.e.goal.S', 'ch20.e.goal.irr'],
    observe: ['ch20.e.obs.remove', 'ch20.e.obs.peak', 'ch20.e.obs.small', 'ch20.e.obs.large', 'ch20.e.obs.S'],
    equations: [
      '\\Omega(n) = \\binom{N}{n} = \\frac{N!}{n!\\,(N-n)!}',
      '\\Delta S = k \\ln\\Omega(n) - k \\ln\\Omega(N) = k \\ln\\Omega(n)',
      '\\Delta S_\\text{max} \\approx Nk \\ln 2 - \\tfrac{k}{2}\\ln\\frac{\\pi N}{2}',
      'P(n = N) = \\frac{1}{2^N}',
    ],
    assumptions: ['ch20.e.assume', 'ch20.e.assume.ref', 'ch20.assume.omegaW'],
  },
};

/**
 * Σ panel: Ω(n) = C(N, n) of the current macrostate, ΔS/k = ln Ω relative to the all-left state
 * (Ω = 1), its largest value at n = N/2 with the large-N form, and P(n = N) = 1/2^N.
 */
export function formulaLines(n: number, p: P): string[] {
  const N = p.N;
  const Om = Math.exp(lnBinom(N, n));
  // Policy D, R2: Ω a count, ln 1 = 0 exactly; beyond 10⁵ Ω and ln Ω to 3 figures (R3).
  const Omt = texOf(omegaText(Om));
  const half = Math.floor(N / 2);
  return [
    `\\Omega(n) = \\binom{N}{n} = \\binom{${N}}{${n}} = ${Omt}`,
    `\\Delta S/k = \\ln\\Omega(n) = \\ln(${Omt}) = ${texOf(dsText(entropyLR(N, n)) ?? fmt(entropyLR(N, n)))}`,
    `\\Delta S_\\text{max}/k = \\ln\\binom{${N}}{${half}} = ${tn(Smax(N))}`,
    `\\approx N\\ln 2 - \\tfrac{1}{2}\\ln\\frac{\\pi N}{2} = ${N}\\ln 2 - \\tfrac{1}{2}\\ln(${num(N / 2)}\\pi) = ${tn(N * Math.LN2 - 0.5 * Math.log((Math.PI * N) / 2))}`,
    `P(n = N) = 1/2^N = 1/2^{${N}} = ${pow2(N)}`,
  ];
}

/** 2^−N in TeX, three figures; below 10⁻⁹ (where tn prints 0) from its base-10 logarithm. */
export function pow2(N: number): string {
  if (N < 29) return tn(2 ** -N);
  const x = -N * Math.log10(2);
  let e = Math.floor(x);
  let m = (10 ** (x - e)).toFixed(2);
  if (m === '10.00') {
    m = '1.00';
    e += 1;
  }
  return `${m}\\times 10^{${e}}`;
}
