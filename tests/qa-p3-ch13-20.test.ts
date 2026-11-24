// QA 2026-11-24, P3 (polish), Ch 13–20: the fixed behaviour, at the quoted settings and swept over
// the controls' ranges.
import { describe, expect, it } from 'vitest';
import { defaults } from '../src/core/params';
import { readBack, readoutText, reproduces, texOf } from '../src/core/tex';
import { Runner } from '../src/core/runner';
import { Rng } from '../src/core/rng';
import type { Params } from '../src/core/types';
import ko13 from '../src/sims/ch13/i18n.ko.json';
import { model as orbitModel, orbitScene, sectorPolys, type P as OrbitP } from '../src/sims/ch13/orbit';
import { taps } from '../src/sims/ch14/physics';
import { termTexts, venturi } from '../src/sims/ch14/scene';
import { energyText, releaseEnergy, shm } from '../src/sims/ch15/shm';
import { formulaLines as reflectLines, reflect } from '../src/sims/ch16/reflect';
import { heardB, setup } from '../src/sims/ch17/doppler';
import { heardAt } from '../src/sims/ch17/physics';
import { collide, initGas, kinetic, stepGas } from '../src/sims/ch19/physics';

const orbitBase = defaults(orbitScene.params) as OrbitP;

describe('Ch 13 orbit', () => {
  it('Kepler sectors: the 12 areas agree to 10⁻⁴ (were up to 4 % apart, boundaries rounded to 20 s steps)', () => {
    let worst = 0;
    for (const speed of [0.5, 0.6, 0.71, 0.85, 0.95])
      for (const alt of [1000, 6000, 15000])
        for (const dir of [-40, 0, 35]) {
          const p = { ...orbitBase, speed, alt, dir, areas: true };
          const m = orbitModel(p);
          if (m.kind !== 'ellipse' || m.crashed) continue;
          const polys = sectorPolys(p, m.N);
          expect(polys.length, `${speed} ${alt} ${dir}`).toBe(12);
          const A = polys.map((pts) => pts.reduce((a, [x0, y0], i) => a + 0.5 * (x0 * pts[(i + 1) % pts.length][1] - pts[(i + 1) % pts.length][0] * y0), 0));
          const mean = A.reduce((a, b) => a + b) / 12;
          worst = Math.max(worst, ...A.map((a) => Math.abs(a / mean - 1)));
        }
    expect(worst).toBeLessThan(1e-4);
  });

  it('0.5 × escape speed, horizontal: crashes below twice the Earth radius (12 742 km), orbits from 13 000 km (ⓘ)', () => {
    for (let alt = 1000; alt <= 15000; alt += 500) {
      const m = orbitModel({ ...orbitBase, speed: 0.5, alt, dir: 0 });
      expect(m.crashed, `${alt} km`).toBe(alt < 12742);
    }
    expect(ko13['ch13.o.obs.crash']).toMatch(/12 742 km/);
  });

  it('launch direction: a slider in the settings (step 1°, default on the grid), label "발사 속력" matches its description', () => {
    const d = orbitScene.params.dir;
    expect(d.kind === 'number' && d.group).toBe('advanced');
    expect(d.kind === 'number' && d.control === 'slider' && d.step).toBe(1);
    expect(ko13['ch13.p.speed']).toMatch(/^발사 속력/);
    // Moving the slider mid-run changes the launch (a new orbit, the same energy).
    const r = new Runner(orbitScene, { ...orbitBase } as never, 1);
    r.play();
    for (let i = 0; i < 50; i++) r.advance(orbitScene.time!.h);
    r.setParam('dir', 30);
    expect(orbitModel(r.params as OrbitP).b0.v[0]).toBeLessThan(0);
  });
});

describe('Ch 14 Venturi: stage terms with 3 figures, like the readouts (R8)', () => {
  it('½ρv² and ρgh print as fmt at 3 figures; ratio 1 reads 0.500 kPa, not 0.50', () => {
    const t = taps({ A1: 0.01, ratio: 1, Q: 0.01, dy: 0 });
    expect(termTexts(t[0]).dyn).toBe('0.500');
    for (const ratio of [0.4, 0.75, 1])
      for (const Q of [5, 12.5, 15])
        for (const q of taps({ A1: 0.01, ratio, Q: Q / 1000, dy: 0.13 })) {
          const { dyn, stat } = termTexts(q);
          for (const s of [dyn, stat]) expect(s.replace(/^0\.0*|\./g, '').length, s).toBe(3);
        }
    expect(venturi.readouts!.length).toBe(3);
  });
});

describe('Ch 15 SHM: one run scale for E, K and U (R7a)', () => {
  const run = (over: Record<string, unknown>, t: number) => {
    const p = { ...(defaults(shm.params) as Params), ...over };
    const r = new Runner(shm, p as never, 1);
    r.play();
    while (r.playing && r.state.t < t - 1e-9) r.advance(shm.time!.h);
    return { lines: shm.formula!(r.state as never, r.params as never), s: r.state as { E: number; K: number; U: number }, p: r.params };
  };

  it('ζ = 0.2 late in the run: E = K + U = 0 + 0 = 0, never 0 + 0 = 1.36×10⁻⁹; the readout prints the same 0', () => {
    const { lines, s, p } = run({ zeta: 0.2 }, 9);
    const line = lines.find((l) => l.startsWith('E = K + U'))!;
    expect(line).toBe('E = K + U = 0 + 0 = 0\\ \\mathrm{J}');
    // x, v and a on their run scales too: the a line reproduces (was −(4.47)²(2.90×10⁻⁶) − … = 4.58×10⁻⁴).
    expect(lines).toContain('= -(4.47)^2(0) - 2(0.20)(4.47)(0) = 0\\ \\mathrm{m/s^2}');
    const ro = shm.readouts!.find((x) => x.label === 'E')!;
    expect(readoutText(ro as never, s.E, p as never, s as never)).toBe('0');
  });

  it('K + U reproduces E at every time, damped or not, at the range ends and in between', () => {
    for (const zeta of [0, 0.03, 0.2])
      for (const [A, k, m] of [
        [0.05, 5, 2],
        [0.2, 20, 1],
        [0.3, 40, 0.2],
      ])
        for (const t of [0.3, 1.7, 3.1, 4.4, 6.2, 8.9]) {
          const { lines, s, p } = run({ zeta, A, k, m }, t);
          const parts = lines.find((l) => l.startsWith('E = K + U'))!.replace('\\ \\mathrm{J}', '').split(' = ').slice(2);
          const [K, U] = parts[0].split(' + ').map(readBack);
          const E = parts[1];
          expect(E, `${zeta} ${A} ${k} ${m} ${t}`).toBe(texOf(energyText(s.E, p as never)));
          expect(reproduces(K + U, E, 0.01 * releaseEnergy(p as never)), `${parts.join(' = ')} at ${zeta} ${A} ${k} ${m} ${t}`).toBe(true);
        }
  });
});

describe('Ch 16 reflect: a live readout and the node number m', () => {
  it('y(L) readout is the Σ string; x′ = mλ/2 names m = 0, 1, 2, …', () => {
    for (const end of ['fixed', 'free'])
      for (const t of [0.4, 2.3, 3.75]) {
        const p = { ...(defaults(reflect.params) as Params), mode: 'wave', end, lambda: 1.3 };
        const lines = reflectLines(t, p as never);
        const ro = reflect.readouts!.find((x) => x.label === 'y(L)')!;
        const txt = readoutText(ro as never, ro.value({ t } as never, p as never), p as never);
        expect(lines[lines.length - 1].endsWith(`= ${txt.replace('−', '-')}\\ \\mathrm{m}`), `${end} ${t}: ${lines[lines.length - 1]} / ${txt}`).toBe(true);
        expect(lines.find((l) => l.startsWith("x' ="))).toMatch(/m = 0, 1, 2, \\dots/);
      }
  });
});

describe('Ch 17 Doppler at and above the speed of sound', () => {
  const P = (vs: number) => ({ who: 'source', vs, vo: 170 });

  it('the source starts left of B and passes it during the run; above v, B hears f′_B2 at the end of the run', () => {
    for (let vs = 340; vs <= 510; vs += 10) {
      const { d, run } = setup(P(vs));
      const tp = (d.xB0 - d.xs0) / vs;
      expect(tp, `${vs}`).toBeGreaterThan(0);
      expect(tp, `${vs}`).toBeLessThan(run);
      if (vs > 340) {
        const h = heardAt(d, run);
        expect(h.B2, `${vs}`).toBeCloseTo((100 * 340) / (vs - 340), 9);
        expect(Number.isFinite(h.B), `${vs}`).toBe(true);
        expect(heardB(P(vs), run).text, `${vs}`).toMatch(/ Hz, /);
      }
    }
  });

  it('below the speed of sound B has one value, never a dash for a second sound', () => {
    for (let vs = 0; vs < 340; vs += 30) {
      const { run } = setup(P(vs));
      for (const f of [0, 0.5, 1]) expect(heardB(P(vs), f * run).text).toBeUndefined();
    }
  });
});

describe('Ch 19 gas: collisions between steps', () => {
  it('a pair that passes through each other within one step collides at contact (momentum and energy kept)', () => {
    const g = initGas(2, 10, 300, 'equal', new Rng(1));
    const s = g.sigma;
    const h = 0.01;
    // Head-on at 60 nm/ps relative: 0.6 nm in one step, from 0.01 nm apart to beyond each other.
    const x0 = [5, 5 + s + 0.01];
    g.vx.set([30, -30]);
    g.vy.set([0, 0]);
    g.y.set([5, 5]);
    g.x.set([x0[0] + 30 * h, x0[1] - 30 * h]);
    const k0 = kinetic(g);
    const px = g.vx[0] + g.vx[1];
    // Apart at both ends of the step: the overlap test alone misses it.
    expect(collide(g, 0, 1)).toBe(false);
    expect(collide(g, 0, 1, h)).toBe(true);
    expect(g.vx[0]).toBeCloseTo(-30, 9);
    expect(g.vx[1]).toBeCloseTo(30, 9);
    expect(g.vx[0] + g.vx[1]).toBeCloseTo(px, 12);
    expect(kinetic(g)).toBeCloseTo(k0, 30);
    // Contact after 0.01/60 ps, then each flies back for the rest of the step: no overlap, no second collision.
    expect(g.x[1] - g.x[0]).toBeCloseTo(s + 60 * (h - 0.01 / 60), 9);
    expect(collide(g, 0, 1, h)).toBe(false);
  });

  it('densest, hottest gas: collisions within 3 % of a 10× finer step (were 8 % short)', () => {
    const count = (h: number) => {
      const g = initGas(1000, 15, 1200, 'mb', new Rng(5));
      const sp = new Float64Array(g.N);
      let n = 0;
      for (let i = 0; i < Math.round(4 / h); i++) {
        for (let k = 0; k < g.N; k++) sp[k] = Math.hypot(g.vx[k], g.vy[k]);
        stepGas(g, h);
        for (let k = 0; k < g.N; k++) if (Math.abs(Math.hypot(g.vx[k], g.vy[k]) - sp[k]) > 1e-9) n++;
      }
      return n / 2;
    };
    const coarse = count(0.01);
    const fine = count(0.001);
    expect(Math.abs(coarse / fine - 1)).toBeLessThan(0.03);
  }, 60_000);
});
