// Ch 18 scene: one quasi-static process of an ideal gas. Piston, p–V path with the work area,
// and Q, W, ΔE_int bars that always satisfy ΔE_int = Q − W.
import type { ParamSchema, Scene } from '../../core/types';
import { split, stageRect } from './panels';
import { A0, eint, legAt, legWork, pathAt, processLeg, temp, type Leg, type Process } from './physics';
import { barRange, drawBars, drawCylinder, drawPV, gasHeight, initMolecules, isWide, stepMolecules } from './view';

type P = { proc: string; dirV: string; dirT: string; gas: string };
interface S {
  t: number;
  mol: number[];
}

const DUR = 4;
const VMAX = 24;
const PMAX = 350;
const PROCS: Process[] = ['isobaric', 'isochoric', 'isothermal', 'adiabatic'];

export const dofOf = (gas: string) => (gas === 'di' ? 5 : 3);
const up = (p: P) => (p.proc === 'isochoric' ? p.dirT === 'heat' : p.dirV === 'expand');
const legOf = (p: P): Leg => processLeg(p.proc as Process, up(p), dofOf(p.gas));

/** Fixed bar scale per gas, covering every process choice so bars compare across choices. */
function barScale(f: number): [number, number] {
  const v: number[] = [];
  for (const k of PROCS) {
    for (const u of [true, false]) {
      const l = processLeg(k, u, f);
      const w = legWork(l, 1);
      const de = eint(l.b, f) - eint(l.a, f);
      v.push(w, de, w + de);
    }
  }
  return barRange(v);
}

/** Label offset (px) pointing back along the path at A and forward at B. */
function labelDirs(l: Leg): { a: [number, number]; b: [number, number] } {
  const k = [VMAX, PMAX];
  const dir = (u0: number, u1: number): [number, number] => {
    const p = legAt(l, u0);
    const q = legAt(l, u1);
    const dx = (q.V - p.V) / k[0];
    const dy = (q.p - p.p) / k[1];
    const n = Math.hypot(dx, dy) || 1;
    return [dx / n, dy / n];
  };
  const a = dir(0, 0.02);
  const b = dir(0.98, 1);
  return { a: [-a[0], -a[1]], b };
}

const params: ParamSchema<P> = {
  proc: {
    kind: 'select',
    label: 'ch18.p.proc',
    desc: 'ch18.d.proc',
    group: 'main',
    live: false,
    default: 'isobaric',
    options: PROCS.map((k) => ({ value: k, label: `ch18.proc.${k}` })),
  },
  dirV: {
    kind: 'select',
    label: 'ch18.p.dirV',
    desc: 'ch18.d.dirV',
    group: 'main',
    live: false,
    default: 'expand',
    options: [
      { value: 'expand', label: 'ch18.dir.expand' },
      { value: 'compress', label: 'ch18.dir.compress' },
    ],
    visibleIf: (p) => p.proc !== 'isochoric',
  },
  dirT: {
    kind: 'select',
    label: 'ch18.p.dirT',
    desc: 'ch18.d.dirT',
    group: 'main',
    live: false,
    default: 'heat',
    options: [
      { value: 'heat', label: 'ch18.dir.heat' },
      { value: 'cool', label: 'ch18.dir.cool' },
    ],
    visibleIf: (p) => p.proc === 'isochoric',
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

const sOf = (t: number) => Math.min(t / DUR, 1);

export const processScene: Scene<P, S> = {
  id: 'process',
  title: 'ch18.scene.process',
  params,
  time: { h: 1 / 120, recordEvery: 4, frameStep: 0.1, tEnd: DUR },
  world: () => ({ x: [0, 1], y: [0, 1], aspect: 'contain' }),
  init: (_p, rng) => ({ t: 0, mol: initMolecules(rng) }),
  step: (s, h, p) => {
    s.t += h;
    const st = legAt(legOf(p), sOf(s.t));
    stepMolecules(s.mol, h, temp(st), gasHeight(st.V, VMAX));
  },

  draw: (g, s, p) => {
    const f = dofOf(p.gas);
    const l = legOf(p);
    const pt = pathAt([l], sOf(s.t), f);
    const Q = eint(l.b, f) - eint(l.a, f) + legWork(l, 1);
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
      Vmax: VMAX,
      mol: s.mol,
      heat: l.kind === 'adiabatic' ? 0 : Math.sign(Math.round(Q)),
      work: Math.sign(l.b.V - l.a.V),
      insulated: l.kind === 'adiabatic',
      locked: l.kind === 'isochoric',
      reservoir: l.kind === 'isothermal' ? temp(A0) : undefined,
    });
    const TA = temp(l.a);
    const TB = temp(l.b);
    const dirs = labelDirs(l);
    const off = 15;
    drawPV(g, pv, {
      Vmax: VMAX,
      pmax: PMAX,
      traces: [{ legs: [l], s: sOf(s.t), shade: true, wLabel: true }],
      isotherms: Math.abs(TA - TB) > 1 ? [TA, TB] : [TA],
      points: [
        { st: l.a, name: 'A', dx: dirs.a[0] * off, dy: -dirs.a[1] * off },
        { st: l.b, name: 'B', dx: dirs.b[0] * off, dy: -dirs.b[1] * off },
      ],
    });
    drawBars(g, bars, [{ Q: pt.Q, W: pt.W, dE: pt.dE }], barScale(f));
  },

  readouts: [
    { label: 'p', unit: 'kPa', value: (s, p) => pathAt([legOf(p)], sOf(s.t), dofOf(p.gas)).st.p },
    { label: 'V', unit: 'L', value: (s, p) => pathAt([legOf(p)], sOf(s.t), dofOf(p.gas)).st.V },
    { label: 'T', unit: 'K', value: (s, p) => temp(pathAt([legOf(p)], sOf(s.t), dofOf(p.gas)).st) },
  ],

  info: {
    goals: ['ch18.goal.first', 'ch18.goal.area'],
    observe: ['ch18.obs.isobaric', 'ch18.obs.isochoric', 'ch18.obs.isothermal', 'ch18.obs.adiabatic', 'ch18.obs.gas'],
    equations: [
      '\\Delta E_\\text{int} = Q - W',
      'W = \\int_{V_i}^{V_f} p\\,dV',
      'E_\\text{int} = \\tfrac{f}{2}\\,nRT, \\quad pV = nRT',
      'W_\\text{isothermal} = nRT\\ln\\frac{V_f}{V_i}, \\quad pV^\\gamma = \\text{const (adiabatic)}',
    ],
    assumptions: ['ch18.assume.ideal', 'ch18.assume.quasi'],
  },
};
