// Addition under review #/ch/107: buoyancy of a cube in a finite tank.
import { describe, expect, it } from 'vitest';
import { defaults } from '../src/core/params';
import { Runner } from '../src/core/runner';
import {
  GRAV,
  TANK,
  blockArea,
  bobPeriod,
  buoyancy,
  faces,
  floatDepth,
  fluidVolume,
  levelAt,
  normal,
  step,
  tankArea,
  weight,
  type Block,
  type Fluid,
  type Motion,
} from '../src/sims/review/buoyancy/physics';
import { FLUIDS, buoyancyScene, fluidOf, formulaLines, forcesOf } from '../src/sims/review/buoyancy/scene';

const water: Fluid = { rho: 1000 };

/** Run until t, from the block bottom at the surface, at rest. */
function settle(b: Block, f: Fluid, t = 40, h = 5e-4, zeta?: number): Motion {
  const m: Motion = { y: TANK.h0, v: 0 };
  for (let i = 0; i < t / h; i++) step(b, f, m, h, zeta);
  return m;
}

describe('buoyancy physics', () => {
  it('fluid volume is conserved: A_t L − A s = A_t h0 for any block height', () => {
    const b: Block = { a: 0.3, rho: 500 };
    for (const y of [0, 0.05, 0.1, 0.2, 0.3, 0.35, 0.39, 0.4, 0.6]) {
      const { L, s } = levelAt(b, y);
      expect(tankArea() * L - blockArea(b) * s).toBeCloseTo(fluidVolume(), 12);
      expect(s).toBeGreaterThanOrEqual(0);
      expect(s).toBeLessThanOrEqual(b.a);
      if (s > 0 && s < b.a) expect(L - y).toBeCloseTo(s, 12);
    }
  });

  it('equilibrium submerged fraction = ρ_obj/ρ_f (several densities, sizes, fluids)', () => {
    for (const [a, rho, rf] of [
      [0.2, 600, 1000],
      [0.1, 917, 1025],
      [0.4, 240, 1000],
      [0.25, 7870, 13600],
      [0.15, 50, 920],
    ]) {
      const b: Block = { a, rho };
      const f: Fluid = { rho: rf };
      const m = settle(b, f, 60);
      const { s } = levelAt(b, m.y);
      expect(s / a).toBeCloseTo(rho / rf, 4);
      expect(Math.abs(m.v)).toBeLessThan(1e-5);
      expect(buoyancy(b, f, m.y)).toBeCloseTo(weight(b), 3);
    }
  });

  it('F_b = (p_bottom − p_top) A = ρ_f V_sub g, partly and fully submerged', () => {
    const b: Block = { a: 0.2, rho: 3000 };
    for (const y of [0.3, 0.25, 0.15, 0.05, 0]) {
      const fc = faces(b, water, y);
      const Fb = buoyancy(b, water, y);
      expect(fc.F).toBeCloseTo(Fb, 9);
      const { L, s } = levelAt(b, y);
      expect(fc.pBot).toBeCloseTo(1000 * GRAV * (L - y), 9);
      if (s >= b.a) expect(fc.pTop).toBeGreaterThan(0);
      else expect(fc.pTop).toBe(0);
    }
    // Fully submerged: the same F_b at every depth.
    expect(buoyancy(b, water, 0.05)).toBeCloseTo(buoyancy(b, water, 0), 12);
    expect(buoyancy(b, water, 0)).toBeCloseTo(1000 * 0.008 * GRAV, 9);
  });

  it('sink / float threshold at ρ_obj = ρ_f', () => {
    const f: Fluid = { rho: 1000 };
    const below = settle({ a: 0.2, rho: 990 }, f, 80);
    const above = settle({ a: 0.2, rho: 1010 }, f, 20);
    expect(below.y).toBeGreaterThan(0.1); // floating, top just above the surface
    expect(levelAt({ a: 0.2, rho: 990 }, below.y).s / 0.2).toBeCloseTo(0.99, 3);
    expect(above.y).toBe(0); // on the floor
    const N = normal({ a: 0.2, rho: 1010 }, f, above);
    expect(N).toBeCloseTo(10 * 0.008 * GRAV, 6); // (ρ_obj − ρ_f) V g
    // Iron floats in mercury, sinks in water.
    expect(settle({ a: 0.2, rho: 7870 }, { rho: 13600 }, 20).y).toBeGreaterThan(0.1);
    expect(settle({ a: 0.2, rho: 7870 }, water, 5).y).toBe(0);
  });

  it('small-oscillation period matches T = 2π √(d_eq (1 − A/A_t) / g)', () => {
    for (const [a, rho] of [
      [0.2, 600],
      [0.4, 500],
      [0.1, 300],
    ]) {
      const b: Block = { a, rho };
      const deq = floatDepth(b, water);
      const At = tankArea();
      const Ab = blockArea(b);
      const yEq = (fluidVolume() + Ab * deq) / At - deq;
      // Start 2 % of d_eq above equilibrium, no damping; time successive upward zero crossings.
      const m: Motion = { y: yEq + 0.02 * deq, v: 0 };
      const h = 2e-5;
      let t = 0;
      let prev = m.y - yEq;
      const ups: number[] = [];
      while (ups.length < 4 && t < 20) {
        step(b, water, m, h, 0);
        t += h;
        const d = m.y - yEq;
        if (prev < 0 && d >= 0) ups.push(t - h * (d / (d - prev)));
        prev = d;
      }
      const T = (ups[3] - ups[0]) / 3;
      expect(T / bobPeriod(b, water)).toBeCloseTo(1, 3);
    }
    // Default block: wood 600 in water, a = 0.20 m → T = 0.67 s.
    expect(bobPeriod({ a: 0.2, rho: 600 }, water)).toBeCloseTo(0.673, 3);
  });

  it('the level rises by V_sub / A_t', () => {
    const b: Block = { a: 0.2, rho: 600 };
    const m = settle(b, water, 60);
    const { L, s } = levelAt(b, m.y);
    expect(L - TANK.h0).toBeCloseTo((blockArea(b) * s) / tankArea(), 12);
    expect((L - TANK.h0) * 1000).toBeCloseTo(7.5, 1); // 0.04 m² × 0.12 m / 0.64 m² = 7.5 mm
  });
});

describe('buoyancy scene', () => {
  it('runs from the default start to the floating equilibrium; formula lines carry the numbers', () => {
    const p = defaults(buoyancyScene.params);
    const r = new Runner(buoyancyScene, p, 1);
    r.play();
    for (let i = 0; i < 2000; i++) r.advance(0.02);
    const s = r.state;
    const { Fb, Fg, net } = forcesOf(s, p);
    expect(Fb / Fg).toBeCloseTo(1, 4);
    expect(Math.abs(net)).toBeLessThan(1e-3);
    const lines = formulaLines(s, p);
    expect(lines.length).toBe(5);
    expect(lines[3]).toContain('0.600');
    for (const l of lines) expect(l).not.toMatch(/NaN|Infinity|undefined/);
  });

  it('fluid presets set the fluid density', () => {
    const p = defaults(buoyancyScene.params);
    expect(fluidOf(p).rho).toBe(1000);
    for (const [k, v] of Object.entries(FLUIDS)) expect(fluidOf({ ...p, fluid: k, rhoF: 777 }).rho).toBe(v);
    expect(fluidOf({ ...p, rhoF: 777 }).rho).toBe(777);
  });

  it('a held block does not move; released it does', () => {
    const p = defaults(buoyancyScene.params);
    const r = new Runner(buoyancyScene, p, 1);
    r.state.held = true;
    r.state.y = 0.6;
    r.play();
    for (let i = 0; i < 50; i++) r.advance(0.02);
    expect(r.state.y).toBe(0.6);
    r.state.held = false;
    for (let i = 0; i < 10; i++) r.advance(0.02);
    expect(r.state.y).toBeLessThan(0.6);
  });
});
