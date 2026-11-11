// Ch 18 scene: cyclic process. Over a full cycle ΔE_int = 0 and the net work = net heat =
// the area enclosed by the loop (clockwise: engine, W > 0; counter-clockwise: W < 0).
import type { ParamSchema, Scene } from '../../core/types';
import { split, stageRect } from './panels';
import { cycle, eint, legWork, pathAt, temp, type Cycle, type CycleKind } from './physics';
import { dofOf } from './process';
import { barRange, drawBars, drawCylinder, drawPV, gasHeight, initMolecules, isWide, stepMolecules } from './view';

type P = { cyc: string; dir: string; gas: string };
interface S {
  t: number;
  mol: number[];
}

const PER_LEG = 2;
const DUR = 4 * PER_LEG;
const NAMES = ['A', 'B', 'C', 'D'];

let memoKey = '';
let memo: { c: Cycle; Vmax: number; pmax: number; yr: [number, number] } | null = null;
function model(p: P) {
  const key = `${p.cyc}|${p.dir}|${p.gas}`;
  if (key !== memoKey || !memo) {
    const f = dofOf(p.gas);
    const c = cycle(p.cyc as CycleKind, p.dir === 'cw', f);
    const Vmax = 1.12 * Math.max(...c.corners.map((q) => q.V));
    const pmax = 1.15 * Math.max(...c.corners.map((q) => q.p));
    const v: number[] = [];
    for (let i = 0; i <= 400; i++) {
      const e = pathAt(c.legs, i / 400, f);
      v.push(e.Q, e.W, e.dE);
    }
    memo = { c, Vmax, pmax, yr: barRange(v) };
    memoKey = key;
  }
  return memo;
}

const sOf = (t: number) => Math.min(t / DUR, 1);

const params: ParamSchema<P> = {
  cyc: {
    kind: 'select',
    label: 'ch18.p.cyc',
    desc: 'ch18.d.cyc',
    group: 'main',
    live: false,
    default: 'rect',
    options: [
      { value: 'rect', label: 'ch18.cyc.rect' },
      { value: 'carnot', label: 'ch18.cyc.carnot' },
    ],
  },
  dir: {
    kind: 'select',
    label: 'ch18.p.dir',
    desc: 'ch18.d.dir',
    group: 'main',
    live: false,
    default: 'cw',
    options: [
      { value: 'cw', label: 'ch18.dir.cw' },
      { value: 'ccw', label: 'ch18.dir.ccw' },
    ],
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

const point = (s: S, p: P) => pathAt(model(p).c.legs, sOf(s.t), dofOf(p.gas));

export const cycleScene: Scene<P, S> = {
  id: 'cycle',
  title: 'ch18.scene.cycle',
  params,
  time: { h: 1 / 120, recordEvery: 4, frameStep: 0.1, tEnd: DUR },
  world: () => ({ x: [0, 1], y: [0, 1], aspect: 'contain' }),
  init: (_p, rng) => ({ t: 0, mol: initMolecules(rng) }),
  step: (s, h, p) => {
    s.t += h;
    const st = point(s, p).st;
    stepMolecules(s.mol, h, temp(st), gasHeight(st.V, model(p).Vmax));
  },

  draw: (g, s, p) => {
    const f = dofOf(p.gas);
    const { c, Vmax, pmax, yr } = model(p);
    const pt = point(s, p);
    const leg = c.legs[pt.leg];
    const q = eint(leg.b, f) - eint(leg.a, f) + legWork(leg, 1);
    const full = stageRect(g);
    let cyl, pv, bars;
    if (isWide(full)) [cyl, pv, bars] = split(full, 'row', [0.75, 1.6, 0.95], 8);
    else {
      const [top, bottom] = split(full, 'col', [1.15, 1], 4);
      pv = top;
      [cyl, bars] = split(bottom, 'row', [1, 1.3], 4);
    }
    drawCylinder(g, cyl, {
      V: pt.st.V,
      Vmax,
      mol: s.mol,
      heat: leg.kind === 'adiabatic' ? 0 : Math.sign(Math.round(q)),
      work: Math.sign(Math.round(leg.b.V - leg.a.V)),
      insulated: leg.kind === 'adiabatic',
      locked: leg.kind === 'isochoric',
      reservoir: leg.kind === 'isothermal' ? temp(leg.a) : undefined,
    });
    // Corner labels point away from the middle of the loop; A is always the first corner.
    const mv = c.corners.reduce((a, q) => a + q.V, 0) / 4;
    const mp = c.corners.reduce((a, q) => a + q.p, 0) / 4;
    drawPV(g, pv, {
      Vmax,
      pmax,
      traces: [{ legs: c.legs, s: sOf(s.t), shade: true }],
      isotherms: c.TH ? [c.TH, c.TC!] : [],
      points: c.corners.map((q, i) => {
        const dx = (q.V - mv) / Vmax;
        const dy = (q.p - mp) / pmax;
        const n = Math.hypot(dx, dy) || 1;
        return { st: q, name: NAMES[i], dx: (dx / n) * 14, dy: (-dy / n) * 14 };
      }),
    });
    drawBars(g, bars, [{ Q: pt.Q, W: pt.W, dE: pt.dE }], yr);
  },

  readouts: [
    { label: 'W', unit: 'J', value: (s, p) => point(s, p).W },
    { label: 'Q', unit: 'J', value: (s, p) => point(s, p).Q },
    { label: '\\Delta E_\\text{int}', unit: 'J', value: (s, p) => point(s, p).dE },
  ],

  info: {
    goals: ['ch18.c.goal.cycle', 'ch18.c.goal.area'],
    observe: ['ch18.c.obs.zero', 'ch18.c.obs.area', 'ch18.c.obs.ccw', 'ch18.c.obs.carnot'],
    equations: ['\\Delta E_\\text{int} = 0 \\;\\Rightarrow\\; Q_\\text{net} = W_\\text{net} = \\oint p\\,dV'],
    assumptions: ['ch18.assume.ideal', 'ch18.assume.quasi'],
  },
};
