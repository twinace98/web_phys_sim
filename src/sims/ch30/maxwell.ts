// Ch 30 scene: the four Maxwell equations with the integral form and a numerical check in the
// stage panel. Gauss's law for E has its own scene in Ch 23 (tab 1), so three mini scenes here:
//   gaussB   bar magnet (bound surface currents) and a circle: net flux 0
//   faraday  growing uniform B in a disc: circulating E, ∮E·ds = −dΦ_B/dt
//   ampere   charging capacitor: flat or bulging surface on the same loop
import type { ParamSchema, Scene, Vec2 } from '../../core/types';
import type { Draw } from '../../draw/draw';
import { WIRE_B } from '../ch29/physics';
import { FieldLayers } from '../field/layers';
import { num, tn, u } from '../../core/tex';
import { MU0, circlePoly, closedCirc, discOverlap, edgeIntegrals, fieldAt, fieldFn, perimeter, resample, type Src, type V2 } from '../field/physics';
import { IN, Memo, OUT, componentArrows, drawSurface, drawVectorGrid, knob, texNum, vectorGrid, vpKey, wireGlyph } from '../field/render';
import { freeDefault, knobs, surfaceHandles } from '../field/surface';
import { GAP, I_CAP, R_AMP, R_B, R_PLATE, ampereMaxwell, faradayRhs, inducedE } from './physics';

type P = { eq: string; dBdt: number; surf: string; shape: string; G: number[]; F: number[]; X: number[] };
type S = { t: number };

export const EQS = ['gaussB', 'faraday', 'ampere'] as const;
/**
 * Default: Faraday, the field form of tab 1's law (a changing B makes a circulating E) and the
 * one equation with a live slider. Old links with the removed eq=gaussE fall back to it.
 */
export const EQ0 = 'faraday';
/** Tag kept in G[3] so each equation keeps its own circle; fixed values keep old links valid. */
const TAG: Record<string, number> = { gaussB: 1, faraday: 2, ampere: 3 };
const BOX: [number, number, number, number] = [-1.15, -0.75, 1.15, 0.75];
const G0: Record<string, number[]> = { gaussB: [-0.05, 0.05, 0.3], faraday: [0.1, 0.05, 0.25] };
const GREY = '#8c8c8c';

const params: ParamSchema<P> = {
  eq: {
    kind: 'select',
    label: 'ch30.m.p.eq',
    desc: 'ch30.m.d.eq',
    group: 'main',
    live: true,
    default: EQ0,
    options: EQS.map((v) => ({ value: v, label: `ch30.m.eq.${v}` })),
  },
  dBdt: {
    kind: 'number',
    label: 'ch30.m.p.dBdt',
    desc: 'ch30.m.d.dBdt',
    group: 'main',
    live: true,
    control: 'slider',
    min: 0.2,
    max: 2,
    step: 0.1,
    default: 1,
    unit: 'T/s',
    visibleIf: (p) => p.eq === 'faraday',
  },
  surf: {
    kind: 'select',
    label: 'ch30.m.p.surf',
    desc: 'ch30.m.d.surf',
    group: 'main',
    live: true,
    default: 'flat',
    options: [
      { value: 'flat', label: 'ch30.m.surf.flat' },
      { value: 'bulge', label: 'ch30.m.surf.bulge' },
    ],
    visibleIf: (p) => p.eq === 'ampere',
  },
  shape: { kind: 'select', label: 'ch30.m.p.G', group: 'hidden', live: true, default: 'circle', options: [{ value: 'circle', label: 'field.shape.circle' }] },
  G: { kind: 'array', label: 'ch30.m.p.G', group: 'hidden', live: true, default: [...G0[EQ0], TAG[EQ0]], min: -2, max: 4 },
  F: { kind: 'array', label: 'ch30.m.p.G', group: 'hidden', live: true, default: freeDefault(0.3), min: -2, max: 2 },
  X: { kind: 'array', label: 'ch30.m.p.X', group: 'hidden', live: true, default: [-0.6], min: -1, max: 1 },
};

const tag = (p: P) => TAG[p.eq] ?? TAG[EQ0];
/** Circle [cx, cy, r] of the current equation (each keeps its own). */
export const Gin = (p: P) => (p.G.length === 4 && p.G[3] === tag(p) ? p.G.slice(0, 3) : (G0[p.eq] ?? G0[EQ0]));
const poly = (p: P) => circlePoly(Gin(p)[0], Gin(p)[1], Gin(p)[2], 160);

/** Magnet: 0.6 m × 0.16 m, N on the right; bound currents ⊙ along the top, ⊗ along the bottom. */
const MAG = { x0: 0, x1: 0.6, h: 0.08 };
const MAG_WIRES: Src[] = [];
const N_MAG = 30;
for (let i = 0; i < N_MAG; i++) {
  const x = MAG.x0 + ((i + 0.5) * (MAG.x1 - MAG.x0)) / N_MAG;
  MAG_WIRES.push({ x, y: MAG.h, s: 1 }, { x, y: -MAG.h, s: -1 });
}

const wireLayers = new FieldLayers('wire', 8);
const eVec = new Memo<Float32Array>();
const fluxMemo = new Memo<{ flux: number; out: number; inn: number }>();

const row = (lhs: string, rhs: string) => `${lhs} &=& ${rhs}`;
const arr = (rows: string[]) => `\\begin{array}{rcl} ${rows.join(' \\\\ ')} \\end{array}`;

/** Normal or tangential component arrows of f along a closed polygon. */
function componentsOn(g: Draw, pl: V2[], f: (x: number, y: number) => V2, mode: 'flux' | 'circ'): void {
  const samples = resample(pl, Math.max(perimeter(pl) / 40, g.px(24))).map(({ p: q, t }) => {
    const dir: V2 = mode === 'flux' ? [t[1], -t[0]] : t;
    const [fx, fy] = f(q[0], q[1]);
    return { p: q, dir, v: fx * dir[0] + fy * dir[1] };
  });
  componentArrows(g, samples);
}

function drawKnobs(g: Draw, p: P): void {
  for (const k of knobs('circle', Gin(p), [])) knob(g, k.p, k.kind);
}

// ------------------------------------------------------------------ the three mini scenes

function drawGaussB(g: Draw, p: P): void {
  wireLayers.lines(g, MAG_WIRES);
  const half = (x0: number, x1: number, fill: 'negative' | 'positive') =>
    g.polygon(
      [
        { x: x0, y: -MAG.h },
        { x: x1, y: -MAG.h },
        { x: x1, y: MAG.h },
        { x: x0, y: MAG.h },
      ],
      { fill, fillAlpha: 0.35, color: fill, width: 1.5 },
    );
  const mid = (MAG.x0 + MAG.x1) / 2;
  half(MAG.x0, mid, 'negative');
  half(mid, MAG.x1, 'positive');
  g.text({ x: (MAG.x0 + mid) / 2, y: 0 }, 'S', { size: 14, role: 'negative', align: 'center', baseline: 'middle', weight: 700 });
  g.text({ x: (mid + MAG.x1) / 2, y: 0 }, 'N', { size: 14, role: 'positive', align: 'center', baseline: 'middle', weight: 700 });
  const pl = poly(p);
  drawSurface(g, pl);
  componentsOn(g, pl, (x, y) => fieldAt(MAG_WIRES, 'wire', x, y), 'flux');
  drawKnobs(g, p);
}

function drawFaraday(g: Draw, p: P): void {
  const disc: Vec2[] = circlePoly(0, 0, R_B, 96).map(([x, y]) => ({ x, y }));
  g.polygon(disc, { fill: '#000000', fillAlpha: 0.035, color: '#c8c8c8', width: 1 });
  // ⊙ symbols of B, left out where the dragged loop runs over them; the E arrows keep clear.
  const glyphs: Vec2[] = ([[0, 0], ...circlePoly(0, 0, 0.2, 6)] as V2[]).map(([x, y]) => ({ x, y }));
  const [lx, ly, lr] = Gin(p);
  for (const q of glyphs) if (Math.abs(Math.hypot(q.x - lx, q.y - ly) - lr) > g.px(12)) wireGlyph(g, q, 1, 0.75, 6, GREY);
  g.text({ x: -R_B * 0.72, y: R_B * 0.72 }, '*B*', { size: 14, color: GREY, align: 'right', baseline: 'bottom', dx: -4 });
  const arrows = eVec.get(`${vpKey(g)}|${p.dBdt}`, () => vectorGrid(g, (x, y) => inducedE(x, y, p.dBdt), glyphs, 34, 22));
  drawVectorGrid(g, arrows);
  const pl = poly(p);
  drawSurface(g, pl);
  componentsOn(g, pl, (x, y) => inducedE(x, y, p.dBdt), 'circ');
  drawKnobs(g, p);
}

/** Drag knob on the loop's left edge, halfway up (clear of the B symbols). */
const KNOB = (xL: number): Vec2 => ({ x: xL - 0.06 * Math.cos(Math.PI / 6), y: R_AMP * Math.sin(Math.PI / 6) });

/** Geometry of the bulging surface: x of its far cap. */
function capX(x: number): number {
  if (Math.abs(x) < GAP) return -GAP - 0.18;
  return x < 0 ? -GAP + 0.06 : GAP - 0.06;
}

function drawAmpere(g: Draw, p: P): void {
  const xL = p.X[0];
  const rx = 0.06;
  // Wire with current i, plates, and the growing field between them.
  g.line({ x: -1.15, y: 0 }, { x: -GAP, y: 0 }, { color: '#1a1a1a', width: 2.5 });
  g.line({ x: GAP, y: 0 }, { x: 1.15, y: 0 }, { color: '#1a1a1a', width: 2.5 });
  for (const x of [-0.95, 0.75]) g.arrow({ x, y: 0 }, { x: 0.12, y: 0 }, { color: '#1a1a1a', width: 2.5 });
  g.text({ x: -0.89, y: 0 }, '*i*', { size: 14, color: '#1a1a1a', align: 'center', dy: -12 });
  for (const [x, sgn] of [
    [-GAP, '+'],
    [GAP, '−'],
  ] as const) {
    g.line({ x, y: -R_PLATE }, { x, y: R_PLATE }, { color: '#1a1a1a', width: 4 });
    g.text({ x, y: R_PLATE }, sgn, { size: 14, role: sgn === '+' ? 'positive' : 'negative', align: 'center', dy: -10 });
  }
  for (const y of [-0.2, 0, 0.2]) g.arrow({ x: -GAP + g.px(6), y }, { x: 2 * GAP - g.px(12), y: 0 }, { color: GREY, width: 1.5 });
  g.text({ x: 0, y: 0.2 }, '*E*', { size: 13, color: GREY, align: 'center', dy: -10 });

  // Surface bounded by the loop: flat disc, or a bag that reaches the far cap.
  const ell = (cx: number, from: number, to: number): Vec2[] => {
    const pts: Vec2[] = [];
    for (let k = 0; k <= 32; k++) {
      const u = from + ((to - from) * k) / 32;
      pts.push({ x: cx + rx * Math.cos(u), y: R_AMP * Math.sin(u) });
    }
    return pts;
  };
  const fill = '#E69F00';
  if (p.surf === 'flat') g.polygon(ell(xL, 0, 2 * Math.PI), { fill, fillAlpha: 0.18 });
  else {
    const xc = capX(xL);
    const bag = [{ x: xL, y: R_AMP }, ...ell(xc, Math.PI / 2, (xc > xL ? -1 : 3) * (Math.PI / 2)), { x: xL, y: -R_AMP }];
    g.polygon([...bag, ...ell(xL, -Math.PI / 2, Math.PI / 2)], { fill, fillAlpha: 0.18, color: fill, width: 1.25 });
  }
  g.polyline(ell(xL, 0, 2 * Math.PI), { color: fill, width: 2.25, dash: [6, 4] });
  // B on the loop: out of the page at the top, into it at the bottom.
  wireGlyph(g, { x: xL, y: R_AMP }, 1, 1, 7, GREY);
  wireGlyph(g, { x: xL, y: -R_AMP }, -1, 1, 7, GREY);
  g.text({ x: xL, y: R_AMP }, '*B*', { size: 13, color: GREY, align: 'left', baseline: 'middle', dx: 12 });
  knob(g, KNOB(xL), 'centre');
}

// ------------------------------------------------------------------ panel values

function gaussB(p: P) {
  const pl = poly(p);
  return fluxMemo.get(`${Gin(p).join(',')}`, () => {
    const parts = edgeIntegrals(fieldFn(MAG_WIRES, 'wire'), pl, 'flux').map((v) => v * WIRE_B);
    const out = parts.filter((v) => v > 0).reduce((a, v) => a + v, 0);
    const inn = parts.filter((v) => v < 0).reduce((a, v) => a + v, 0);
    return { flux: out + inn, out, inn };
  });
}

/** Faraday panel values: numerical ∮ E·ds and −dΦ_B/dt [V]. */
export function faradayValues(p: P): { circ: number; rhs: number } {
  const G = Gin(p);
  return { circ: closedCirc((x, y) => inducedE(x, y, p.dBdt), poly(p)), rhs: faradayRhs(G[0], G[1], G[2], p.dBdt) };
}

/** Below the stage panel's zero tolerance a value prints as 0, as there. */
const z = (v: number, tol: number) => (Math.abs(v) < tol ? 0 : v);
const UT = '\\ \\mu\\mathrm{T\\,m}';
const MU0_TEX = '4\\pi\\times 10^{-7}';

/** Σ panel: the numbers of the stage panel with the relation that gives them. */
export function formulaLines(p: P): string[] {
  switch (p.eq) {
    case 'gaussB': {
      const b = gaussB(p);
      const out = tn(z(b.out, 1e-4));
      const inn = tn(z(b.inn, 1e-4));
      return [
        `\\Phi_\\text{out} = ${out}${UT},\\quad \\Phi_\\text{in} = ${inn}${UT}`,
        `\\oint B_n\\,dl = \\Phi_\\text{out} + \\Phi_\\text{in} = ${out} + (${inn}) = ${tn(z(b.flux, 5e-3))}${UT}`,
      ];
    }
    case 'ampere': {
      const a = ampereMaxwell(p.X[0], p.surf === 'bulge' ? 'bulge' : 'flat');
      return [
        `i_\\text{enc} = ${num(a.ic)}\\ \\mathrm{A},\\quad i_d = \\varepsilon_0\\,\\frac{d\\Phi_E}{dt} = ${num(a.id)}\\ \\mathrm{A}`,
        `\\oint \\vec B\\cdot d\\vec s = \\mu_0(i_\\text{enc} + i_d) = (${MU0_TEX})(${num(a.ic)} + ${num(a.id)})\\ \\mathrm{T\\,m} = ${tn(a.circ * 1e6)}${UT}`,
        `B = \\frac{\\mu_0 i}{2\\pi r} = \\frac{(${MU0_TEX})(${I_CAP})}{2\\pi(${R_AMP})}\\ \\mathrm{T} = ${tn(((MU0 * I_CAP) / (2 * Math.PI * R_AMP)) * 1e6)}${u('\\mu T')}`,
      ];
    }
    default: {
      const { circ, rhs } = faradayValues(p);
      const G = Gin(p);
      const A = discOverlap(R_B, G[2], Math.hypot(G[0], G[1]));
      return [
        `\\oint \\vec E\\cdot d\\vec s = ${tn(z(circ, 1e-5))}${u('V')}`,
        `-\\frac{d\\Phi_B}{dt} = -\\frac{dB}{dt}\\,A = -(${num(p.dBdt)}\\ \\mathrm{T/s})(${tn(A, 4)}\\ \\mathrm{m^2}) = ${tn(z(rhs, 1e-5))}${u('V')}`,
      ];
    }
  }
}

function overlay(p: P): string {
  switch (p.eq) {
    case 'gaussB': {
      const b = gaussB(p);
      const u = '\\ \\mu\\mathrm{T\\,m}';
      return `\\oint \\vec B\\cdot d\\vec A = 0 \\\\[4pt] ${arr([
        row('\\Phi_\\text{out}', `\\textcolor{${OUT}}{${texNum(b.out, 3, 1e-4)}}${u}`),
        row('\\Phi_\\text{in}', `\\textcolor{${IN}}{${texNum(b.inn, 3, 1e-4)}}${u}`),
        row('\\oint B_n\\,dl', `${texNum(b.flux, 3, 5e-3)}${u}`),
      ])}`;
    }
    case 'ampere': {
      const a = ampereMaxwell(p.X[0], p.surf === 'bulge' ? 'bulge' : 'flat');
      return `\\oint \\vec B\\cdot d\\vec s = \\mu_0 i_\\text{enc} + \\mu_0\\varepsilon_0\\frac{d\\Phi_E}{dt} \\\\[4pt] ${arr([
        row('i_\\text{enc}', `${texNum(a.ic, 3, 1e-9)}\\ \\mathrm{A}`),
        row('\\varepsilon_0\\, d\\Phi_E/dt', `${texNum(a.id, 3, 1e-9)}\\ \\mathrm{A}`),
        row('\\oint \\vec B\\cdot d\\vec s', `${texNum(a.circ * 1e6, 3)}\\ \\mu\\mathrm{T\\,m}`),
      ])}`;
    }
    default: {
      // faraday (also any unknown eq value)
      const { circ, rhs } = faradayValues(p);
      return `\\oint \\vec E\\cdot d\\vec s = -\\frac{d\\Phi_B}{dt} \\\\[4pt] ${arr([
        row('\\oint \\vec E\\cdot d\\vec s', `${texNum(circ, 3, 1e-5)}\\ \\mathrm{V}`),
        row('-d\\Phi_B/dt', `${texNum(rhs, 3, 1e-5)}\\ \\mathrm{V}`),
      ])}`;
    }
  }
}

// ------------------------------------------------------------------ scene

export const maxwell: Scene<P, S> = {
  id: 'maxwell',
  title: 'ch30.m.scene',
  params,
  world: () => ({ x: [-1.2, 1.2], y: [-0.8, 0.8], aspect: 'contain', padPx: 8 }),
  init: () => ({ t: 0 }),

  draw: (g, _s, p) => {
    if (p.eq === 'gaussB') drawGaussB(g, p);
    else if (p.eq === 'ampere') drawAmpere(g, p);
    else drawFaraday(g, p);
  },

  overlay: (_s, p) => overlay(p),
  formula: (_s, p) => formulaLines(p),

  handles: [
    ...surfaceHandles<P, S>({
      sources: () => [],
      box: BOX,
      shapes: ['circle'],
      when: (p) => p.eq !== 'ampere',
      G: Gin,
      packG: (p, G) => [...G, tag(p)],
    }),
    {
      radiusPx: 16,
      when: (p) => p.eq === 'ampere',
      pos: (_s, p) => KNOB(p.X[0]),
      onDrag: (ctx, _s, w) => {
        const x = Math.round(Math.min(0.95, Math.max(-0.95, w.x)) * 100) / 100;
        if (x !== ctx.params.X[0]) ctx.set('X', [x]);
      },
    },
  ],

  info: {
    goals: ['ch30.m.goal.four', 'ch30.m.goal.pairs'],
    observe: ['ch30.m.obs.gaussB', 'ch30.m.obs.faraday', 'ch30.m.obs.ampere', 'ch30.m.obs.drag'],
    equations: [
      '\\oint \\vec E\\cdot d\\vec A = \\frac{q_\\text{enc}}{\\varepsilon_0}',
      '\\oint \\vec B\\cdot d\\vec A = 0',
      '\\oint \\vec E\\cdot d\\vec s = -\\frac{d\\Phi_B}{dt}',
      '\\oint \\vec B\\cdot d\\vec s = \\mu_0 i_\\text{enc} + \\mu_0\\varepsilon_0\\frac{d\\Phi_E}{dt}',
    ],
    assumptions: ['ch30.m.as.magnet', 'ch30.m.as.faraday', 'ch30.m.as.cap'],
  },
};
