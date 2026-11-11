import { describe, expect, it } from 'vitest';
import { defaults } from '../src/core/params';
import { Runner } from '../src/core/runner';
import { GM, R_EARTH, angMom, circularSpeed, classify, elements, energy, escapeSpeed, radius, yoshida, type Body } from '../src/sims/ch13/physics';
import { orbitScene } from '../src/sims/ch13/orbit';

const r0 = R_EARTH + 6e6;
const tangential = (f: number): Body => ({ x: [-r0, 0], v: [0, -f * escapeSpeed(r0)] });

describe('ch13 gravitation', () => {
  it('escape and circular speeds: v_esc = √2 v_circ, 11.2 km/s at the surface', () => {
    expect(escapeSpeed(R_EARTH) / 1e3).toBeCloseTo(11.19, 2);
    expect(escapeSpeed(r0) / circularSpeed(r0)).toBeCloseTo(Math.SQRT2, 12);
  });

  it('the sign of E classifies the orbit, independent of direction', () => {
    expect(classify(tangential(0.85))).toBe('ellipse');
    expect(classify(tangential(1.2))).toBe('hyperbola');
    expect(classify(tangential(1))).toBe('parabola');
    const v = 1.2 * escapeSpeed(r0);
    expect(classify({ x: [-r0, 0], v: [-v * 0.7, -v * Math.sqrt(0.51)] })).toBe('hyperbola');
  });

  it('elliptical orbit: 100 periods with Yoshida 2.5 s steps keep |ΔE/E| < 1e-6 and L exact to 1e-10', () => {
    const b = tangential(0.85);
    const E0 = energy(b);
    const L0 = angMom(b);
    const { period, a, e } = elements(b);
    expect(a).toBeCloseTo(r0 / (2 * (1 - 0.85 ** 2)), 0);
    expect(e).toBeCloseTo(1 - r0 / a, 9);
    const dt = 2.5;
    const n = Math.round((100 * period) / dt);
    let worst = 0;
    for (let i = 0; i < n; i++) {
      yoshida(b, dt);
      if (i % 50 === 0) worst = Math.max(worst, Math.abs(energy(b) / E0 - 1));
    }
    expect(worst).toBeLessThan(1e-6);
    expect(Math.abs(angMom(b) / L0 - 1)).toBeLessThan(1e-10);
  });

  it('a circular orbit returns to its start after one period (Kepler 3rd law)', () => {
    const b: Body = { x: [-r0, 0], v: [0, -circularSpeed(r0)] };
    const T = 2 * Math.PI * Math.sqrt(r0 ** 3 / GM);
    const n = 4000;
    for (let i = 0; i < n; i++) yoshida(b, T / n);
    expect(b.x[0] / r0).toBeCloseTo(-1, 8);
    expect(b.x[1] / r0).toBeCloseTo(0, 8);
    expect(radius(b) / r0).toBeCloseTo(1, 10);
  });

  it('scene: E channel flat over 3 periods; 0.5 v_esc crashes; escape leaves the view', () => {
    const p = defaults(orbitScene.params);
    const run = new Runner(orbitScene, p);
    run.play();
    for (let i = 0; i < 2000 && run.playing; i++) run.advance(0.1);
    expect(run.playing).toBe(false);
    const E = run.hist.col('E');
    for (const v of E) expect(Math.abs(v / E[0] - 1)).toBeLessThan(1e-6);
    const r = run.hist.col('r');
    // Tangential launch at 0.85 v_esc: launch point is the periapsis; apoapsis = r0 f²/(1 − f²).
    expect(Math.max(...r) / (r0 / 1e6)).toBeCloseTo(0.7225 / 0.2775, 3);

    const crash = new Runner(orbitScene, { ...p, speed: '0.5' });
    crash.play();
    for (let i = 0; i < 2000 && crash.playing; i++) crash.advance(0.1);
    expect(crash.hist.col('r').at(-1)! * 1e6).toBeCloseTo(R_EARTH, 0);

    const esc = new Runner(orbitScene, { ...p, speed: '1.2', dir: 30 });
    esc.play();
    for (let i = 0; i < 4000 && esc.playing; i++) esc.advance(0.1);
    expect(esc.hist.col('r').at(-1)!).toBeGreaterThan(1.8 * (r0 / 1e6));
    const Ee = esc.hist.col('E');
    expect(Ee[0]).toBeGreaterThan(0);
    for (const v of Ee) expect(Math.abs(v / Ee[0] - 1)).toBeLessThan(1e-6);
  });
});
