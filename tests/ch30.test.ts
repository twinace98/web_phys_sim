import { describe, expect, it } from 'vitest';
import { MU0, circlePoly, closedCirc, closedFlux, fieldFn } from '../src/sims/field/physics';
import {
  A_COIL,
  A_LOOP,
  I_CAP,
  M_MAG,
  R_B,
  ampereMaxwell,
  dipoleFlux,
  dipoleFluxRate,
  faradayAt,
  faradayEnd,
  faradayRhs,
  inducedE,
  overlap,
} from '../src/sims/ch30/physics';

describe('ch30 Faraday-Lenz', () => {
  it('square loop through the region: Φ ramps 0 → B a² → 0, emf = ∓ B a v', () => {
    const B = 0.5;
    const v = 0.5;
    const T = faradayEnd('region', v);
    expect(faradayAt('region', 0, v, B).phi).toBe(0);
    expect(faradayAt('region', T / 2, v, B).phi).toBeCloseTo(B * A_LOOP * A_LOOP, 12);
    expect(faradayAt('region', T, v, B).phi).toBeCloseTo(0, 12);
    // Entering (loop centre at −0.5): dΦ/dt = +B a v, so emf < 0.
    const tIn = (1 - 0.5) / v;
    expect(faradayAt('region', tIn, v, B).dphi).toBeCloseTo(B * A_LOOP * v, 12);
    const tOut = (1 + 0.5) / v;
    expect(faradayAt('region', tOut, v, B).dphi).toBeCloseTo(-B * A_LOOP * v, 12);
  });

  it('dΦ/dt matches the numerical derivative of Φ', () => {
    for (const sc of ['region', 'magnet'] as const) {
      for (const t of [0.9, 1.3, 2.7, 3.3]) {
        const d = 1e-6;
        const num = (faradayAt(sc, t + d, 0.5, 0.5).phi - faradayAt(sc, t - d, 0.5, 0.5).phi) / (2 * d);
        expect(num).toBeCloseTo(faradayAt(sc, t, 0.5, 0.5).dphi, 8);
      }
    }
    expect(overlap(0)).toBeCloseTo(A_LOOP, 12);
  });

  it('dipole flux through a coaxial loop equals the flux of its on-axis-field reciprocity formula', () => {
    // Numerical flux of a point dipole's B_x over the disc of radius a at distance x.
    const x = 0.3;
    const n = 4000;
    let phi = 0;
    for (let i = 0; i < n; i++) {
      const rho = ((i + 0.5) / n) * A_COIL;
      const r2 = x * x + rho * rho;
      const bx = ((MU0 * M_MAG) / (4 * Math.PI)) * (3 * x * x - r2) / r2 ** 2.5;
      phi += bx * 2 * Math.PI * rho * (A_COIL / n);
    }
    expect(phi / dipoleFlux(x)).toBeCloseTo(1, 5);
    // Approaching (x < 0) the flux grows; receding it falls.
    expect(dipoleFluxRate(-0.3)).toBeGreaterThan(0);
    expect(dipoleFluxRate(0.3)).toBeLessThan(0);
  });
});

describe('ch30 Maxwell equations', () => {
  it('Faraday: ∮E·ds = −dΦ_B/dt for loops inside, around and off the field disc', () => {
    for (const [cx, cy, r] of [
      [0, 0, 0.2],
      [0.1, 0.05, 0.6],
      [0.3, 0.1, 0.25],
      [0.9, 0, 0.2],
    ]) {
      const circ = closedCirc((x, y) => inducedE(x, y, 1.5), circlePoly(cx, cy, r, 200));
      expect(Math.abs(circ - faradayRhs(cx, cy, r, 1.5))).toBeLessThan(1e-4);
    }
    // Growing B out of the page: E circulates clockwise.
    const [ex, ey] = inducedE(R_B / 2, 0, 1);
    expect(ex).toBeCloseTo(0, 12);
    expect(ey).toBeLessThan(0);
  });

  it('Gauss (magnetic): bound-current magnet has zero net flux through any circle', () => {
    const wires = [];
    for (let i = 0; i < 30; i++) {
      const x = ((i + 0.5) * 0.6) / 30;
      wires.push({ x, y: 0.08, s: 1 }, { x, y: -0.08, s: -1 });
    }
    for (const poly of [circlePoly(-0.05, 0.05, 0.3), circlePoly(0.3, 0, 0.5), circlePoly(0.6, 0.02, 0.21)]) {
      expect(Math.abs(closedFlux(fieldFn(wires, 'wire'), poly))).toBeLessThan(1e-4);
    }
  });

  it('Ampère-Maxwell: flat and bag surfaces give the same total current', () => {
    for (const x of [-0.6, 0, 0.6]) {
      const flat = ampereMaxwell(x, 'flat');
      const bag = ampereMaxwell(x, 'bulge');
      expect(flat.ic + flat.id).toBe(I_CAP);
      expect(bag.ic + bag.id).toBe(I_CAP);
      expect(flat.ic).not.toBe(bag.ic);
      expect(flat.circ).toBeCloseTo(MU0 * I_CAP, 15);
    }
    expect(ampereMaxwell(-0.6, 'flat').ic).toBe(I_CAP);
    expect(ampereMaxwell(0, 'flat').id).toBe(I_CAP);
  });
});
