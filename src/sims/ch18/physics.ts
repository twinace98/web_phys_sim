// Ch 18: quasi-static processes of an ideal gas. Exact, DOM-free.
// Units: V in L, p in kPa, so pV and every energy are in J (1 kPa·L = 1 J).
// Internal energy E_int = (f/2) nRT = (f/2) pV; first law Q = ΔE_int + W.

/** nR [J/K]: 10 L at 100 kPa is 300 K (n ≈ 0.401 mol). */
export const NR = 1000 / 300;

export interface St {
  /** Volume [L]. */
  V: number;
  /** Pressure [kPa]. */
  p: number;
}

export type LegKind = 'isobaric' | 'isochoric' | 'isothermal' | 'adiabatic' | 'line';

export interface Leg {
  kind: LegKind;
  a: St;
  b: St;
}

/** Quadratic degrees of freedom: 3 monatomic, 5 diatomic. */
export const gammaOf = (f: number) => 1 + 2 / f;
export const temp = (s: St) => (s.p * s.V) / NR;
/** E_int relative to zero temperature [J]. */
export const eint = (s: St, f: number) => (f / 2) * s.p * s.V;

// ------------------------------------------------------------------ leg builders

export const isobaric = (a: St, V: number): Leg => ({ kind: 'isobaric', a, b: { V, p: a.p } });
export const isochoric = (a: St, p: number): Leg => ({ kind: 'isochoric', a, b: { V: a.V, p } });
export const isothermal = (a: St, V: number): Leg => ({ kind: 'isothermal', a, b: { V, p: (a.p * a.V) / V } });
export const adiabatic = (a: St, V: number, f: number): Leg => ({ kind: 'adiabatic', a, b: { V, p: a.p * (a.V / V) ** gammaOf(f) } });
export const line = (a: St, b: St): Leg => ({ kind: 'line', a, b });

/** Volume reached from a along an adiabat when the temperature becomes T. */
export function adiabatToT(a: St, T: number, f: number): number {
  // T V^(γ−1) is constant.
  return a.V * (temp(a) / T) ** (f / 2);
}

// ------------------------------------------------------------------ along a leg

/** State at fraction u ∈ [0, 1]. V moves linearly in u except on an isochore (p does). */
export function legAt(l: Leg, u: number): St {
  const { a, b } = l;
  if (l.kind === 'isochoric') return { V: a.V, p: a.p + u * (b.p - a.p) };
  const V = a.V + u * (b.V - a.V);
  switch (l.kind) {
    case 'isobaric':
      return { V, p: a.p };
    case 'isothermal':
      return { V, p: (a.p * a.V) / V };
    case 'adiabatic':
      return { V, p: a.p * (a.V / V) ** adiabaticGamma(l) };
    case 'line':
      return { V, p: a.p + u * (b.p - a.p) };
  }
}

/** Work done BY the gas from the start of the leg to fraction u [J]. */
export function legWork(l: Leg, u: number): number {
  const { a } = l;
  const s = legAt(l, u);
  switch (l.kind) {
    case 'isochoric':
      return 0;
    case 'isobaric':
      return a.p * (s.V - a.V);
    case 'isothermal':
      return a.p * a.V * Math.log(s.V / a.V);
    case 'adiabatic': {
      // W = (p_a V_a − p V)/(γ − 1); γ from the leg's own end points.
      const g = adiabaticGamma(l);
      return (a.p * a.V - s.p * s.V) / (g - 1);
    }
    case 'line':
      return 0.5 * (a.p + s.p) * (s.V - a.V);
  }
}

/** γ of an adiabatic leg, from its end points (p V^γ is the same at both). */
function adiabaticGamma(l: Leg): number {
  return Math.log(l.a.p / l.b.p) / Math.log(l.b.V / l.a.V);
}

// ------------------------------------------------------------------ paths

export interface Point {
  st: St;
  /** Work by the gas since the start [J]. */
  W: number;
  /** Heat into the gas since the start [J]. */
  Q: number;
  /** Change in internal energy since the start [J]. */
  dE: number;
  leg: number;
  u: number;
}

/**
 * State after fraction s ∈ [0, 1] of a path of legs, each leg taking an equal share of s.
 */
export function pathAt(legs: Leg[], s: number, f: number): Point {
  const n = legs.length;
  const x = Math.min(Math.max(s, 0), 1) * n;
  const leg = Math.min(n - 1, Math.floor(x));
  const u = x - leg;
  let W = 0;
  for (let i = 0; i < leg; i++) W += legWork(legs[i], 1);
  W += legWork(legs[leg], u);
  const st = legAt(legs[leg], u);
  const dE = eint(st, f) - eint(legs[0].a, f);
  return { st, W, Q: dE + W, dE, leg, u };
}

/** Points along the path from s0 to s1 for drawing (per leg, so corners are exact). */
export function pathPoints(legs: Leg[], s0: number, s1: number, perLeg = 48): St[] {
  const n = legs.length;
  const out: St[] = [];
  for (let i = 0; i < n; i++) {
    const lo = Math.max(s0 * n - i, 0);
    const hi = Math.min(s1 * n - i, 1);
    if (hi < lo || hi < 0 || lo > 1) continue;
    for (let k = 0; k <= perLeg; k++) out.push(legAt(legs[i], lo + ((hi - lo) * k) / perLeg));
  }
  return out;
}

/** Heat in and out over whole legs [J]: Q_in > 0, Q_out ≥ 0 (magnitude). */
export function heatSplit(legs: Leg[], f: number): { qin: number; qout: number } {
  let qin = 0;
  let qout = 0;
  for (const l of legs) {
    const q = eint(l.b, f) - eint(l.a, f) + legWork(l, 1);
    if (q > 0) qin += q;
    else qout -= q;
  }
  return { qin, qout };
}

// ------------------------------------------------------------------ scenarios

export const A0: St = { V: 10, p: 100 };

export type Process = 'isobaric' | 'isochoric' | 'isothermal' | 'adiabatic';

/** Single process from A0: expansion to 2V or compression to V/2; isochoric heating to 2p or cooling to p/2. */
export function processLeg(kind: Process, up: boolean, f: number): Leg {
  const k = up ? 2 : 0.5;
  switch (kind) {
    case 'isobaric':
      return isobaric(A0, A0.V * k);
    case 'isochoric':
      return isochoric(A0, A0.p * k);
    case 'isothermal':
      return isothermal(A0, A0.V * k);
    case 'adiabatic':
      return adiabatic(A0, A0.V * k, f);
  }
}

/** Three paths from A0 to B: via C = (V_B, p_A), via D = (V_A, p_B), and the straight line. */
export function threePaths(B: St): { C: St; D: St; paths: Leg[][] } {
  const C = { V: B.V, p: A0.p };
  const D = { V: A0.V, p: B.p };
  return {
    C,
    D,
    paths: [
      [isobaric(A0, B.V), isochoric(C, B.p)],
      [isochoric(A0, B.p), isobaric(D, B.V)],
      [line(A0, B)],
    ],
  };
}

export type CycleKind = 'rect' | 'carnot';

export interface Cycle {
  legs: Leg[];
  /** Corner states in traversal order, labelled A, B, C, D. */
  corners: St[];
  /** Reservoir temperatures of the isotherms (Carnot) [K]. */
  TH?: number;
  TC?: number;
}

/**
 * Rectangle: A(10 L, 100 kPa) → isochoric heating → isobaric expansion → isochoric cooling →
 * isobaric compression. Carnot: isotherm at T_H = 600 K, adiabat to T_C (default 300 K), isotherm,
 * adiabat back. `cw` = clockwise in the p–V plane (engine); otherwise reversed (refrigerator).
 */
export function cycle(kind: CycleKind, cw: boolean, f: number, tc = 300): Cycle {
  let corners: St[];
  let kinds: LegKind[];
  let TH: number | undefined;
  let TC: number | undefined;
  if (kind === 'rect') {
    corners = [
      { V: 10, p: 100 },
      { V: 10, p: 200 },
      { V: 30, p: 200 },
      { V: 30, p: 100 },
    ];
    kinds = ['isochoric', 'isobaric', 'isochoric', 'isobaric'];
  } else {
    TH = 600;
    TC = tc;
    const a: St = { V: 10, p: (NR * TH) / 10 };
    const b: St = { V: 20, p: (NR * TH) / 20 };
    const Vc = adiabatToT(b, TC, f);
    const c: St = { V: Vc, p: (NR * TC) / Vc };
    const Vd = adiabatToT(a, TC, f);
    const d: St = { V: Vd, p: (NR * TC) / Vd };
    corners = [a, b, c, d];
    kinds = ['isothermal', 'adiabatic', 'isothermal', 'adiabatic'];
  }
  if (!cw) {
    corners = [corners[0], corners[3], corners[2], corners[1]];
    kinds = [kinds[3], kinds[2], kinds[1], kinds[0]];
  }
  const legs = corners.map((a, i): Leg => ({ kind: kinds[i], a, b: corners[(i + 1) % 4] }));
  return { legs, corners, TH, TC };
}

/** Area enclosed by the closed polygon of states (shoelace on a fine sampling), positive clockwise. */
export function enclosedArea(legs: Leg[]): number {
  const pts = pathPoints(legs, 0, 1, 400);
  let a = 0;
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i];
    const q = pts[(i + 1) % pts.length];
    a += p.V * q.p - q.V * p.p;
  }
  return -a / 2;
}

/** Entropy of the gas relative to state ref [J/K]: ΔS = nR [(f/2) ln(T/T_ref) + ln(V/V_ref)]. */
export const entropy = (s: St, ref: St, f: number) => NR * ((f / 2) * Math.log(temp(s) / temp(ref)) + Math.log(s.V / ref.V));
