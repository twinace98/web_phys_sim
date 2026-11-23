import { describe, expect, it } from 'vitest';
import { Rng } from '../src/core/rng';
import {
  AUTO_STRUCT,
  HitSampler,
  MAX_HITS,
  STRUCTS,
  T_END,
  arrival,
  HIST_BINS,
  binMasses,
  diffractionScene,
  formulaLines,
  fringe,
  gammaOf,
  hitsBy,
  kineticOf,
  lambdaOf,
  lambdaP,
  lenTex,
  lenText,
  structIdOf,
  type Structure,
} from '../src/sims/ch38/diffraction';
import { EV, PARTICLES } from '../src/sims/ch38/physics';

const ME = PARTICLES.electron.mass;
const base = { part: 'electron', ve: 4.36e6, vn: 2200, vc: 220, vb: 40, st: 'auto' };

describe('ch38 diffraction: de Broglie wavelength from the speed', () => {
  it('54 eV electron 0.167 nm, thermal neutron 0.180 nm, C60 at 220 m/s 2.5 pm, baseball at 40 m/s 1.1e-34 m', () => {
    // Default electron speed is 54.0 eV (Davisson–Germer).
    expect(kineticOf(ME, 4.36e6) / EV).toBeCloseTo(54.04, 1);
    expect(lambdaP(base)).toBeCloseTo(1.668e-10, 12);
    expect(lambdaP({ ...base, part: 'neutron' })).toBeCloseTo(1.798e-10, 12);
    expect(lambdaP({ ...base, part: 'c60' }) / 2.52e-12).toBeCloseTo(1, 2);
    expect(lambdaP({ ...base, part: 'ball' }) / 1.142e-34).toBeCloseTo(1, 2);
  });

  it('relativistic momentum: γ = 1.155 at 1.5e8 m/s, kinetic energy (γ − 1)mc² = 79 keV', () => {
    expect(gammaOf(1.5e8)).toBeCloseTo(1.1547, 3);
    expect(kineticOf(ME, 1.5e8) / EV / 1e3).toBeCloseTo(79.1, 0);
    // 10 keV electron: 12.2 pm (non-relativistic h/√(2mK) gives 12.26 pm).
    const v10k = 2.9979e8 * Math.sqrt(1 - 1 / (1 + 1e4 / 510998.95) ** 2);
    expect(lambdaOf(ME, v10k)).toBeCloseTo(1.2205e-11, 14);
    // Baseball kinetic energy keeps its digits: ½mv² = 116 J.
    expect(kineticOf(0.145, 40)).toBeCloseTo(116, 6);
  });

  it('auto structure: electron and neutron on the crystal, C60 on the grating, baseball at the slit pair', () => {
    expect(AUTO_STRUCT).toEqual({ electron: 'crystal', neutron: 'crystal', c60: 'grating', ball: 'slits' });
    expect(structIdOf({ ...base, part: 'c60', st: 'slits' })).toBe('slits');
  });
});

describe('ch38 diffraction: fringe spacing and the resolvability rule', () => {
  it('Davisson–Germer: sin θ₁ = λ/d → 50.9° on nickel (measured 50°), y₁ = L tan θ₁', () => {
    const f = fringe(STRUCTS.crystal, lambdaP(base));
    expect((f.theta1 * 180) / Math.PI).toBeCloseTo(50.9, 1);
    expect(f.y1).toBeCloseTo(0.05 * Math.tan(f.theta1), 12);
    expect(f.resolvable && f.onScreen).toBe(true);
    const n = fringe(STRUCTS.crystal, lambdaP({ ...base, part: 'neutron' }));
    expect((n.theta1 * 180) / Math.PI).toBeCloseTo(56.8, 1);
  });

  it('C60 on the 100 nm grating: Δy = λL/d = 31 μm at 1.25 m (Arndt et al. 1999), resolvable', () => {
    const f = fringe(STRUCTS.grating, lambdaP({ ...base, part: 'c60' }));
    expect(f.dyApprox * 1e6).toBeCloseTo(31.5, 0);
    expect(f.y1 / f.dyApprox).toBeCloseTo(1, 6);
    expect(f.resolvable && f.onScreen).toBe(true);
  });

  it('tiny λ/d: baseball and C60 at the 1 mm slit pair, C60 on the crystal: fringes unresolved', () => {
    const ball = fringe(STRUCTS.slits, lambdaP({ ...base, part: 'ball' }));
    expect(ball.dyApprox).toBeLessThan(1e-30);
    expect(ball.resolvable).toBe(false);
    expect(fringe(STRUCTS.slits, lambdaP({ ...base, part: 'c60' })).resolvable).toBe(false);
    // Even the slowest neutron (λ = 4 nm) at the slit pair: Δy = 4 μm < δ = 20.8 μm.
    expect(fringe(STRUCTS.slits, lambdaOf(PARTICLES.neutron.mass, 100)).resolvable).toBe(false);
    const c = fringe(STRUCTS.crystal, lambdaP({ ...base, part: 'c60' }));
    expect(c.y1).toBeLessThan(c.res);
    expect(c.resolvable).toBe(false);
  });

  it('λ ≥ d: no first order (electron below 32.5 eV on nickel); λ large on the grating: first order off the screen', () => {
    const slow = fringe(STRUCTS.crystal, lambdaOf(ME, 3.3e6));
    expect(slow.ratio).toBeGreaterThan(1);
    expect(Number.isNaN(slow.y1)).toBe(true);
    expect(slow.resolvable).toBe(false);
    expect(fringe(STRUCTS.crystal, lambdaOf(ME, 3.45e6)).ratio).toBeLessThan(1);
    const ng = fringe(STRUCTS.grating, lambdaP({ ...base, part: 'neutron' }));
    expect(ng.resolvable).toBe(true);
    expect(ng.onScreen).toBe(false);
  });

  it('the resolvability threshold is δ = 2Y/96', () => {
    const s = STRUCTS.grating;
    const lamAt = (y1: number) => (s.d * y1) / Math.hypot(y1, s.L);
    expect(fringe(s, lamAt(0.99 * fringe(s, 1e-12).res)).resolvable).toBe(false);
    expect(fringe(s, lamAt(1.01 * fringe(s, 1e-12).res)).resolvable).toBe(true);
    expect(fringe(s, 1e-12).res).toBeCloseTo((2 * s.Y) / 96, 15);
  });
});

/** χ² of n sampled hits against the expected bin masses (bins with expected < 5 merged). */
function chi2(s: Structure, lam: number, n: number, nb: number, seed: number): { chi2: number; dof: number; hits: number[] } {
  const smp = new HitSampler(s, lam);
  const rng = new Rng(seed);
  const counts = new Array(nb).fill(0);
  const hits: number[] = [];
  for (let i = 0; i < n; i++) {
    const y = smp.sample(rng).y;
    hits.push(y);
    counts[Math.min(nb - 1, Math.floor(((y + s.Y) / (2 * s.Y)) * nb))] += 1;
  }
  const P = binMasses(s, lam, nb);
  let c2 = 0;
  let dof = -1;
  let accE = 0;
  let accO = 0;
  for (let k = 0; k < nb; k++) {
    accE += P[k] * n;
    accO += counts[k];
    if (accE >= 5 || k === nb - 1) {
      c2 += (accO - accE) ** 2 / Math.max(accE, 1e-9);
      dof += 1;
      accE = 0;
      accO = 0;
    }
  }
  return { chi2: c2, dof, hits };
}

describe('ch38 diffraction: sampled hits follow |ψ|²', () => {
  const cases: [string, Structure, number][] = [
    ['electron 54 eV, crystal', STRUCTS.crystal, lambdaP(base)],
    ['electron 1.5e8 m/s, crystal (many orders)', STRUCTS.crystal, lambdaOf(ME, 1.5e8)],
    ['C60 220 m/s, grating', STRUCTS.grating, lambdaP({ ...base, part: 'c60' })],
    ['neutron 2200 m/s, grating (central peak only)', STRUCTS.grating, lambdaP({ ...base, part: 'neutron' })],
    ['baseball, slit pair (geometric shadow)', STRUCTS.slits, lambdaP({ ...base, part: 'ball' })],
    ['C60, crystal (unresolved)', STRUCTS.crystal, lambdaP({ ...base, part: 'c60' })],
  ];
  for (const [name, s, lam] of cases) {
    it(`${name}: χ² test over 60 bins`, () => {
      const r = chi2(s, lam, 20000, 60, 7);
      expect(r.hits.every((y) => Math.abs(y) <= s.Y)).toBe(true);
      // χ² mean = dof, sd = √(2 dof): allow 5 sd.
      expect(r.chi2).toBeLessThan(r.dof + 5 * Math.sqrt(2 * r.dof));
      const mean = r.hits.reduce((a, b) => a + b, 0) / r.hits.length;
      const rms = Math.sqrt(r.hits.reduce((a, b) => a + b * b, 0) / r.hits.length);
      expect(Math.abs(mean)).toBeLessThan((5 * rms) / Math.sqrt(r.hits.length));
    });
  }

  it('Fraunhofer case: the expected distribution peaks at the orders y_m = L tan(asin(mλ/d))', () => {
    const s = STRUCTS.grating;
    const lam = lambdaP({ ...base, part: 'c60' });
    const nb = 300;
    const P = binMasses(s, lam, nb);
    const bin = (y: number) => Math.floor(((y + s.Y) / (2 * s.Y)) * nb);
    const y1 = fringe(s, lam).y1;
    // Local maximum within one bin of y₁, and the midway dark fringe far below it.
    const k1 = bin(y1);
    const peak = Math.max(P[k1 - 1], P[k1], P[k1 + 1]);
    for (let k = k1 - 8; k <= k1 + 8; k++) expect(P[k]).toBeLessThanOrEqual(peak);
    expect(P[bin(y1 / 2)]).toBeLessThan(0.02 * peak);
    // a = d/2: the second order is missing.
    expect(P[bin(2 * y1)]).toBeLessThan(0.05 * peak);
  });

  it('geometric case: the baseball lands only in the two slit shadows', () => {
    const s = STRUCTS.slits;
    const r = chi2(s, lambdaP({ ...base, part: 'ball' }), 5000, 40, 3);
    const inShadow = r.hits.filter((y) => Math.abs(Math.abs(y) - s.d / 2) <= s.a / 2 + 1e-12).length;
    expect(inShadow).toBe(5000);
    // Both slits used equally.
    const upper = r.hits.filter((y) => y > 0).length;
    expect(Math.abs(upper - 2500)).toBeLessThan(5 * Math.sqrt(1250));
  });
});

describe('ch38 diffraction: scene', () => {
  it('hits arrive a few per second, then faster, up to 3000 before the end', () => {
    expect(hitsBy(0)).toBe(0);
    expect(hitsBy(1)).toBe(4);
    expect(hitsBy(T_END)).toBe(MAX_HITS);
    for (const k of [0, 10, 500, MAX_HITS - 1]) {
      expect(hitsBy(arrival(k))).toBe(k + 1);
      expect(hitsBy(arrival(k) - 1e-6)).toBe(k);
    }
  });

  it('init samples the hits; the hit readout follows time; Δy readout is NaN without a first order', () => {
    const s = diffractionScene.init(base as never, new Rng(1));
    expect(s.hits).toHaveLength(MAX_HITS);
    s.t = 2;
    const ro = diffractionScene.readouts!;
    expect(ro[2].value(s, base as never)).toBe(hitsBy(2));
    expect(ro[1].value(s, base as never)).toBeCloseTo(fringe(STRUCTS.crystal, lambdaP(base)).y1, 12);
    expect(Number.isNaN(ro[1].value(s, { ...base, ve: 1e6 } as never))).toBe(true);
  });

  it('formula panel: λ = h/p with numbers; unresolved and off-screen cases say so', () => {
    const dg = formulaLines(base);
    expect(dg.join(' ')).toContain('0.167\\ \\text{nm}');
    expect(dg.join(' ')).toContain('L\\tan\\theta_1');
    const ball = formulaLines({ ...base, part: 'ball' }).join(' ');
    expect(ball).toContain('\\Delta y < \\delta = 20.8\\ \\mu\\text{m}');
    expect(ball).toContain('{1\\ \\text{mm}}');
    expect(ball).toContain('\\tfrac12 mv^2');
    const c60 = formulaLines({ ...base, part: 'c60' }).join(' ');
    expect(c60).toContain('\\approx \\frac{\\lambda L}{d}');
    expect(c60).not.toContain('\\delta');
    expect(formulaLines({ ...base, part: 'neutron', st: 'grating' }).join(' ')).toContain('\\Delta y > Y = 150\\ \\mu\\text{m}');
    expect(formulaLines({ ...base, ve: 1e6 }).join(' ')).toContain('> 1');
    expect(formulaLines({ ...base, ve: 1.5e8 }).join(' ')).toContain('\\gamma m v');
  });

  it('length labels', () => {
    expect(lenText(0.215e-9)).toBe('0.215 nm');
    expect(lenText(100e-9)).toBe('100 nm');
    expect(lenText(1e-3)).toBe('1 mm');
    expect(lenTex(1.142e-34)).toBe('1.14\\times 10^{-34}\\ \\text{m}');
    expect(lenTex(31.5e-6)).toBe('31.5\\ \\mu\\text{m}');
  });
});

describe('ch38 diffraction: the resolvability verdict agrees with the drawn screen (review 2026-11-20)', () => {
  /** Expected histogram as drawn: a nearly empty bin (below a tenth of the smaller peak) between the centre and the first order. */
  function gap(s: Structure, lam: number): boolean {
    const bw = (2 * s.Y) / HIST_BINS;
    const bin = (y: number) => Math.min(HIST_BINS - 1, Math.floor((y + s.Y) / bw));
    const b0 = bin(0);
    const b1 = bin(fringe(s, lam).y1);
    if (b1 - b0 < 2) return false;
    const P = binMasses(s, lam, HIST_BINS);
    const pk = (b: number) => Math.max(P[b - 1], P[b], P[b + 1]);
    let lo = Infinity;
    for (let k = b0 + 1; k < b1; k++) lo = Math.min(lo, P[k]);
    return lo < 0.1 * Math.min(pk(b0), pk(b1));
  }
  /** The first order in the bin next to the central peak's bins (the screen centre is a bin edge): one block. */
  const merged = (s: Structure, lam: number) => {
    const bw = (2 * s.Y) / HIST_BINS;
    return Math.floor((fringe(s, lam).y1 + s.Y) / bw) - Math.floor(s.Y / bw) < 2;
  };
  /** Electron speed whose first order on the crystal screen lies at y1. */
  const speedFor = (s: Structure, y1: number) => {
    const lam = (s.d * y1) / Math.hypot(y1, s.L);
    const mc = ME * 299792458;
    const pm = 6.62607015e-34 / lam / mc; // γβ
    return (299792458 * pm) / Math.sqrt(1 + pm * pm);
  };

  it('electron at 2.82e7 m/s on nickel: Δy = 6.02 mm, fringes at 0, ±6, ±12 mm drawn and called resolved (was "Δy ≪ δ = 6.7 mm")', () => {
    const p = { ...base, ve: 2.82e7 };
    const s = STRUCTS.crystal;
    const f = fringe(s, lambdaP(p));
    expect(f.y1 * 1e3).toBeCloseTo(6.02, 2);
    expect(f.res * 1e3).toBeCloseTo(2.083, 3);
    expect(f.resolvable && f.onScreen).toBe(true);
    expect(gap(s, lambdaP(p))).toBe(true);
    const tex = formulaLines(p).join(' ');
    expect(tex).not.toContain('\\delta');
    expect(tex).not.toContain('\\ll');
  });

  it('every particle, structure and speed in range: resolved iff a gap in the drawn histogram; unresolved lines read Δy < δ', () => {
    const speeds: Record<string, [string, number, number]> = {
      electron: ['ve', 5e5, 1.5e8],
      neutron: ['vn', 100, 30000],
      c60: ['vc', 50, 500],
      ball: ['vb', 1, 50],
    };
    let resolved = 0;
    let unresolved = 0;
    for (const [part, [key, lo, hi]] of Object.entries(speeds))
      for (const st of ['crystal', 'grating', 'slits'])
        for (let k = 0; k <= 30; k++) {
          const v = lo * (hi / lo) ** (k / 30);
          const p = { ...base, part, st, [key]: v };
          const s = STRUCTS[st as keyof typeof STRUCTS];
          const lam = lambdaP(p);
          const f = fringe(s, lam);
          if (!(f.ratio < 1)) continue;
          const tex = formulaLines(p).join(' ');
          const at = `${part} ${st} v=${v}`;
          if (f.resolvable) {
            resolved++;
            // Clear of δ by more than the width of a first-order peak: a nearly empty bin between.
            if (f.onScreen && f.y1 >= 1.06 * f.res) expect(gap(s, lam), at).toBe(true);
            expect(tex, at).not.toContain('\\delta');
          } else {
            unresolved++;
            // The printed inequality holds, and the drawn histogram shows one block: no bin between.
            expect(f.y1, at).toBeLessThan(f.res);
            expect(merged(s, lam), at).toBe(true);
            expect(tex, at).toContain('\\Delta y < \\delta');
          }
        }
    expect(resolved).toBeGreaterThan(20);
    expect(unresolved).toBeGreaterThan(20);
  });

  it('at the threshold: just above δ resolved with a gap, just below merged; δ never prints equal to Δy', () => {
    const s = STRUCTS.crystal;
    const res = fringe(s, 1e-12).res;
    const above = { ...base, ve: speedFor(s, 1.06 * res) };
    expect(fringe(s, lambdaP(above)).resolvable).toBe(true);
    expect(gap(s, lambdaP(above))).toBe(true);
    expect(fringe(s, lambdaP({ ...base, ve: speedFor(s, 1.001 * res) })).resolvable).toBe(true);
    const below = { ...base, ve: speedFor(s, 0.999 * res) };
    const f = fringe(s, lambdaP(below));
    expect(f.resolvable).toBe(false);
    expect(merged(s, lambdaP(below))).toBe(true);
    const tex = formulaLines(below).join(' ');
    expect(tex).toContain('= 2.08\\ \\text{mm}');
    expect(tex).toContain('\\Delta y < \\delta = 2.083\\ \\text{mm}');
  });
});
