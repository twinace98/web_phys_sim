import { describe, expect, it } from 'vitest';
import { DK, EV, ME, PARTICLES, deBroglie, deltaK, deltaX, omega, packet, pFromK, pFromV, psi, vGroup, vPhase } from '../src/sims/ch38/physics';
import { fmtLen, momentum } from '../src/sims/ch38/scene';

describe('ch38 wave packet', () => {
  it('Gaussian amplitudes: Δx Δk → ½ at t = 0 for many components', () => {
    const pk = packet(33, 10);
    // Truncated near 2.4 standard deviations: Δk a little below s·δk/√2.
    expect(deltaK(pk) / (((33 / 5) * DK) / Math.SQRT2)).toBeGreaterThan(0.95);
    expect(deltaK(pk) / (((33 / 5) * DK) / Math.SQRT2)).toBeLessThan(1);
    expect(Math.abs(deltaX(pk, 0, 0) * deltaK(pk) - 0.5)).toBeLessThan(0.02);
  });

  it('more components: narrower packet; one component: not localised', () => {
    const w = (M: number) => deltaX(packet(M, 10), 0, 0);
    expect(w(1)).toBe(Infinity);
    expect(w(3)).toBeGreaterThan(w(9));
    expect(w(9)).toBeGreaterThan(w(33));
  });

  it('the peak of |ψ|² moves at the group velocity ħk0/m; crests at half that', () => {
    const pk = packet(17, 10);
    const t = 15;
    let best = -1;
    let bx = 0;
    for (let x = 0; x < 30; x += 0.005) {
      const [a, b] = psi(pk, x, t);
      if (a * a + b * b > best) {
        best = a * a + b * b;
        bx = x;
      }
    }
    expect(bx).toBeCloseTo(vGroup(10) * t, 1);
    expect(vPhase(10)).toBeCloseTo(omega(10) / 10, 12);
    expect(vGroup(10)).toBeCloseTo(2 * vPhase(10), 12);
  });

  it('a free packet spreads: σ(t)² = σ0² + (ħΔk t/m)²', () => {
    const pk = packet(33, 10);
    const s0 = deltaX(pk, 0, 0);
    const t = 10;
    const s1 = deltaX(pk, t, vGroup(10) * t);
    const hm = vGroup(1);
    expect(s1).toBeCloseTo(Math.sqrt(s0 * s0 + (hm * deltaK(pk) * t) ** 2), 2);
  });
});

describe('ch38 de Broglie wavelength', () => {
  it('electron: 100 eV → 0.1226 nm, 54 eV → 0.167 nm, 10 keV → 12.2 pm (relativistic)', () => {
    expect(deBroglie(pFromK(ME, 100 * EV))).toBeCloseTo(1.2264e-10, 13);
    expect(deBroglie(pFromK(ME, 54 * EV))).toBeCloseTo(1.669e-10, 12);
    expect(deBroglie(pFromK(ME, 1e4 * EV))).toBeCloseTo(1.2205e-11, 14);
  });

  it('thermal neutron 0.180 nm, C60 at 220 m/s 2.5 pm, baseball 1.1×10⁻³⁴ m', () => {
    expect(deBroglie(pFromV(PARTICLES.neutron.mass, 2200))).toBeCloseTo(1.798e-10, 12);
    expect(deBroglie(pFromV(PARTICLES.c60.mass, 220)) / 2.5e-12).toBeCloseTo(1, 1);
    const ball = deBroglie(momentum({ part: 'ball', eK: 100, vn: 2200, vc: 220, vb: 40 }));
    expect(ball / 1.142e-34).toBeCloseTo(1, 2);
  });

  it('length labels', () => {
    expect(fmtLen(2e-10)).toBe('200 pm');
    expect(fmtLen(1e-9)).toBe('1 nm');
    expect(fmtLen(5e-12)).toBe('5 pm');
    expect(fmtLen(0.02)).toBe('2 cm');
  });
});
