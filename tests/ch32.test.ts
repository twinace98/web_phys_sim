import { describe, expect, it } from 'vitest';
import { defaults } from '../src/core/params';
import { Rng } from '../src/core/rng';
import { Runner } from '../src/core/runner';
import { CHI, fieldAt, magnet, momentAt } from '../src/sims/ch32/magnet';
import { A0, E_CHARGE, HBAR, MU_B, M_E, TC, V1, magnetization, onsagerM, orbit, paraM, sweep, type Lattice } from '../src/sims/ch32/physics';

const uniform = (n: number, v: 1 | -1): Lattice => ({ nx: n, ny: n, s: new Int8Array(n * n).fill(v) });

/** Mean magnetization over `meas` sweeps after `eq` equilibration sweeps. */
function average(L: Lattice, J: number, h: number, T: number, eq: number, meas: number, seed = 7): number {
  const r = new Rng(seed);
  const rnd = () => r.next();
  for (let i = 0; i < eq; i++) sweep(L, J, h, T, rnd);
  let m = 0;
  for (let i = 0; i < meas; i++) {
    sweep(L, J, h, T, rnd);
    m += magnetization(L);
  }
  return m / meas;
}

describe('ch32 orbital moment', () => {
  const o = orbit(A0, V1);
  it('first Bohr orbit: μ = μ_B and L = ħ', () => {
    expect(o.mu / MU_B).toBeCloseTo(1, 6);
    expect(o.L / HBAR).toBeCloseTo(1, 6);
    expect(MU_B).toBeCloseTo(9.274e-24, 26);
  });

  it('μ/L = e/2m for any orbit; current I = e/T', () => {
    for (const [r, v] of [
      [A0, V1],
      [4 * A0, V1 / 2],
      [1e-10, 1e6],
    ]) {
      const k = orbit(r, v);
      expect(k.mu / k.L).toBeCloseTo(E_CHARGE / (2 * M_E), -2);
      expect(k.I * k.T).toBeCloseTo(E_CHARGE, 30);
    }
    expect(o.I * 1e3).toBeCloseTo(1.05, 2);
  });
});

describe('ch32 lattice of moments', () => {
  it('independent moments (J = 0) follow M = tanh(h/T)', () => {
    for (const [h, T] of [
      [1, 1.13],
      [0.5, 2],
      [2, 1],
    ]) {
      const m = average(uniform(32, 1), 0, h, T, 50, 400);
      expect(Math.abs(m - paraM(h, T))).toBeLessThan(0.02);
    }
  });

  it('below T_c the coupled lattice keeps the Onsager magnetization; above it, none', () => {
    const T = 0.8 * TC;
    expect(Math.abs(average(uniform(32, 1), 1, 0, T, 200, 400) - onsagerM(T))).toBeLessThan(0.03);
    expect(Math.abs(average(uniform(32, 1), 1, 0, 1.5 * TC, 300, 300))).toBeLessThan(0.1);
  });

  it('remanence: a ferromagnet stays magnetized at h = 0, a paramagnet does not', () => {
    const T = 0.5 * TC;
    expect(average(uniform(24, 1), 1, 0, T, 200, 50)).toBeGreaterThan(0.95);
    expect(Math.abs(average(uniform(24, 1), 0, 0, T, 50, 200))).toBeLessThan(0.08);
  });

  it('coercivity: a moderate reverse field does not flip a cold ferromagnet at once, a strong one does', () => {
    const T = 0.5 * TC;
    expect(average(uniform(24, 1), 1, -0.5, T, 100, 20)).toBeGreaterThan(0.9);
    expect(average(uniform(24, 1), 1, -3.5, T, 100, 20)).toBeLessThan(-0.9);
  });
});

describe('ch32 materials scene', () => {
  it('sweeps B symmetrically and traces a hysteresis loop for the ferromagnet', () => {
    expect(fieldAt('sweep', 75)).toBeCloseTo(3.5, 10);
    expect(fieldAt('sweep', 225)).toBeCloseTo(-3.5, 10);
    expect(fieldAt('off', 10)).toBe(0);
    const r = new Runner(magnet, defaults(magnet.params));
    r.play();
    r.advance(25); // 1000 sweeps: more than three field cycles
    const tr = r.state.trail;
    // On the falling branch at B ≈ 0 the magnetization is still positive (remanence), on the rising branch negative.
    let fall = 0;
    let rise = 0;
    for (let i = 2; i < tr.length; i += 2) {
      if (tr[i - 2] > 0 && tr[i] <= 0) fall = tr[i + 1];
      if (tr[i - 2] < 0 && tr[i] >= 0) rise = tr[i + 1];
    }
    expect(fall).toBeGreaterThan(0.8);
    expect(rise).toBeLessThan(-0.8);
  });

  it('diamagnet: M opposite to B', () => {
    const r = new Runner(magnet, { ...defaults(magnet.params), mat: 'dia' });
    r.play();
    r.advance(1);
    const s = r.state;
    expect(s.B).toBeGreaterThan(0);
    expect(s.M).toBeLessThan(0);
  });
});

describe('ch32 review fixes', () => {
  /** ∮ M dB over the recorded trail (two field periods), relative to the saturated square loop 4 B0 per period. */
  function loopArea(T: number, seed = 5): number {
    const r = new Runner(magnet, { ...defaults(magnet.params), T }, seed);
    r.play();
    r.advance(25); // 1000 field steps: three periods and a bit
    const tr = r.state.trail;
    let a = 0;
    for (let i = 2; i < tr.length; i += 2) a += 0.5 * (tr[i + 1] + tr[i - 1]) * (tr[i] - tr[i - 2]);
    return a / 2 / (4 * 3.5);
  }

  it('the ferromagnet loop is open below T_C and closes at and above it', () => {
    expect(Math.abs(loopArea(0.5))).toBeGreaterThan(0.3);
    for (const T of [1.0, 1.1, 1.5, 2.0]) expect(Math.abs(loopArea(T))).toBeLessThan(0.015);
  }, 30000);

  it('diamagnet: arrows are as long as M/M_s, at most CHI', () => {
    const r = new Runner(magnet, { ...defaults(magnet.params), mat: 'dia' });
    r.play();
    r.advance(75 / 40); // B at its maximum
    const s = r.state;
    expect(s.M).toBeCloseTo(-CHI, 2);
    expect(momentAt(s, r.params as never, 0)).toBe(s.M);
    expect(CHI).toBeLessThan(0.35);
  });

  it('every readout and record is finite across materials, temperatures and field modes', () => {
    for (const mat of ['para', 'ferro', 'dia'])
      for (const T of [0.2, 0.5, 0.95, 1, 1.35, 2])
        for (const field of ['sweep', 'on', 'off']) {
          const r = new Runner(magnet, { ...defaults(magnet.params), mat, T, field });
          r.play();
          r.advance(0.6);
          for (const ro of magnet.readouts!) expect(Number.isFinite(ro.value(r.state, r.params))).toBe(true);
          expect(r.state.trail.every(Number.isFinite)).toBe(true);
          expect(Math.abs(r.state.M)).toBeLessThanOrEqual(1);
        }
  }, 30000);
});
