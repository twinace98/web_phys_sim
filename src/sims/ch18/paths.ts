// Ch 18 scene: three paths between the same two states. W and Q depend on the path,
// ΔE_int does not (state function).
import type { ParamSchema, Scene } from '../../core/types';
import { split, stageRect } from './panels';
import { A0, pathAt, temp, threePaths, type St } from './physics';
import { dofOf } from './process';
import { barRange, drawBars, drawPV, isWide } from './view';

type P = { hl: string; B: string; gas: string };

const DUR = 6;
const NAMES = ['ACB', 'ADB', 'AB'];
const DASH = [undefined, [7, 5], [1.5, 4.5]];
const ENDS: Record<string, St> = {
  b1: { V: 30, p: 50 },
  b2: { V: 20, p: 50 },
  b3: { V: 30, p: 20 },
};

const endOf = (p: P) => ENDS[p.B] ?? ENDS.b1;
const sOf = (t: number) => Math.min(t / DUR, 1);
const hlIdx = (p: P) => Math.max(0, NAMES.indexOf(p.hl));

function barScale(p: P): [number, number] {
  const f = dofOf(p.gas);
  const { paths } = threePaths(endOf(p));
  const v: number[] = [];
  for (const legs of paths) {
    for (let i = 0; i <= 100; i++) {
      const e = pathAt(legs, i / 100, f);
      v.push(e.Q, e.W, e.dE);
    }
  }
  return barRange(v);
}

const params: ParamSchema<P> = {
  hl: {
    kind: 'select',
    label: 'ch18.p.hl',
    desc: 'ch18.d.hl',
    group: 'main',
    live: true,
    default: 'ACB',
    options: NAMES.map((n) => ({ value: n, label: `ch18.path.${n}` })),
  },
  B: {
    kind: 'select',
    label: 'ch18.p.B',
    desc: 'ch18.d.B',
    group: 'main',
    live: false,
    default: 'b1',
    options: Object.keys(ENDS).map((k) => ({ value: k, label: `ch18.B.${k}` })),
  },
  gas: {
    kind: 'select',
    label: 'ch18.p.gas',
    desc: 'ch18.d.gas',
    group: 'advanced',
    live: false,
    default: 'mono',
    options: [
      { value: 'mono', label: 'ch18.gas.mono' },
      { value: 'di', label: 'ch18.gas.di' },
    ],
  },
};

const hlPoint = (s: { t: number }, p: P) => pathAt(threePaths(endOf(p)).paths[hlIdx(p)], sOf(s.t), dofOf(p.gas));

export const pathsScene: Scene<P, { t: number }> = {
  id: 'paths',
  title: 'ch18.scene.paths',
  params,
  time: { h: 1 / 120, recordEvery: 4, frameStep: 0.1, tEnd: DUR },
  world: () => ({ x: [0, 1], y: [0, 1], aspect: 'contain' }),
  init: () => ({ t: 0 }),
  step: (s, h) => {
    s.t += h;
  },

  draw: (g, s, p) => {
    const f = dofOf(p.gas);
    const B = endOf(p);
    const { C, D, paths } = threePaths(B);
    const full = stageRect(g);
    const [pv, bars] = isWide(full) ? split(full, 'row', [1.5, 1.1], 8) : split(full, 'col', [1, 0.95], 4);
    const hi = hlIdx(p);
    const TA = temp(A0);
    const TB = temp(B);
    drawPV(g, pv, {
      Vmax: 35,
      pmax: 120,
      traces: paths.map((legs, i) => ({ legs, s: sOf(s.t), dash: DASH[i], shade: i === hi })),
      isotherms: Math.abs(TA - TB) > 1 ? [TA, TB] : [TA],
      points: [
        { st: A0, name: 'A', dx: -12, dy: -12 },
        { st: C, name: 'C', dx: 12, dy: -12 },
        { st: D, name: 'D', dx: -12, dy: 12 },
        { st: B, name: 'B', dx: 12, dy: 12 },
      ],
    });
    drawBars(
      g,
      bars,
      paths.map((legs, i) => {
        const e = pathAt(legs, sOf(s.t), f);
        return { name: NAMES[i], Q: e.Q, W: e.W, dE: e.dE };
      }),
      barScale(p),
    );
  },

  readouts: [
    { label: 'W', unit: 'J', value: (s, p) => hlPoint(s, p).W },
    { label: 'Q', unit: 'J', value: (s, p) => hlPoint(s, p).Q },
    { label: '\\Delta E_\\text{int}', unit: 'J', value: (s, p) => hlPoint(s, p).dE },
  ],

  info: {
    goals: ['ch18.p2.goal.path', 'ch18.p2.goal.state'],
    observe: ['ch18.p2.obs.W', 'ch18.p2.obs.E', 'ch18.p2.obs.Q', 'ch18.p2.obs.b2', 'ch18.p2.obs.b3'],
    equations: ['W_\\text{ACB} = p_\\text{A}(V_\\text{B} - V_\\text{A}), \\quad W_\\text{ADB} = p_\\text{B}(V_\\text{B} - V_\\text{A})', '\\Delta E_\\text{int} = \\tfrac{f}{2}(p_\\text{B}V_\\text{B} - p_\\text{A}V_\\text{A})'],
    assumptions: ['ch18.assume.ideal', 'ch18.assume.quasi'],
  },
};
