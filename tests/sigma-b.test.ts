// Σ formula panel, Ch 7–11, 13, 14 and the Ch 15 SHM scene: the printed results agree with the
// simulation. At defaults and at other settings, after running a while, a line ends in
// "= tn(value) unit" for the scene's own readouts and physics functions.
import { describe, expect, it } from 'vitest';
import { defaults } from '../src/core/params';
import { Runner } from '../src/core/runner';
import { INPUT_SIG, tn, u } from '../src/core/tex';
import type { Params, Scene } from '../src/core/types';
import { CHAPTERS } from '../src/sims/registry';
import { kinetic } from '../src/sims/ch07/physics';
import { sigFit, tnFit } from '../src/sims/ch07/sigfit';
import { fitSig } from '../src/sims/ch31/fit';
import { POTENTIALS } from '../src/sims/ch08/physics';
import { inertiaCm } from '../src/sims/ch10/physics';
import { BETA, G, rollAccel } from '../src/sims/ch11/physics';
import { escapeSpeed, radius } from '../src/sims/ch13/physics';

async function scene(ch: number, id: string): Promise<Scene> {
  const page = await CHAPTERS.find((m) => m.ch === ch)!.load!();
  return page.scenes.find((s) => s.id === id)!;
}

/** Runner at defaults + over, advanced `steps` physics steps. */
function run(sc: Scene, over: Params, steps: number) {
  const r = new Runner(sc, { ...(defaults(sc.params) as Params), ...over } as never, 1);
  if (sc.time && steps > 0) {
    r.play();
    for (let i = 0; i < steps && r.playing; i++) r.advance(sc.time.h);
  }
  const lines = sc.formula!(r.state as never, r.params as never);
  const ro = (label: string) => sc.readouts!.find((q) => q.label === label)!.value(r.state as never, r.params as never);
  return { s: r.state as never as Record<string, number>, p: r.params as never as Params, lines, ro };
}

/** Some line ends in "= value unit" (tn with the readout's three figures). */
function shows(lines: string[], v: number, unit: string, sig = 3): void {
  const tail = `= ${tn(v, sig)}${unit ? u(unit) : ''}`;
  expect(lines.some((l) => l.endsWith(tail)), `${tail}\n${lines.join('\n')}`).toBe(true);
}

describe('digit-fitting helpers (policy D: at most 3 figures)', () => {
  it('sigFit and tnFit: 3 figures, also where the shown arithmetic would need more', () => {
    // 0.167 + 0.442 = 0.609, but 1/6 + 0.4418 = 0.6085 prints 0.608: still 3 figures (R3).
    expect(sigFit([1 / 6, 0.4418], (a, b) => a + b, 1 / 6 + 0.4418)).toBe(3);
    expect(sigFit([2, 3], (a, b) => a * b, 6)).toBe(3);
    expect(sigFit([-1.7390774, 0.56099271 * 3.1], (a, b) => a + b, 0)).toBe(3);
    expect(sigFit([1.2542], (t) => 2 * t, 2 * 1.2542, 3, 4)).toBe(3);
    expect(tnFit(0.44183, 5)).toBe('0.442');
    expect(tnFit(0.5, 2)).toBe('0.50');
  });
  it('fitSig: 3 figures at most; fitSig keeps 2 when allowed and enough', () => {
    expect(fitSig((r) => tn(r(1 / 6) + r(0.4418)), tn(1 / 6 + 0.4418), 3, 8)).toBe(3);
    expect(fitSig((r) => tn(r(2.4) * 2, 2), tn(4.8, 2), 2)).toBe(2);
    expect(fitSig((r) => tn(r(1 / 6) + r(0.4418)), tn(1 / 6 + 0.4418), 5, 8)).toBe(3);
    expect(INPUT_SIG).toBe(3);
  });
});

describe('Σ panel agrees with the simulation (group B)', () => {
  it('Ch 07 work: F, W = ΔK and K', async () => {
    const sc = await scene(7, 'work');
    for (const [over, steps] of [
      [{}, 0],
      [{}, 700],
      [{ preset: 'spring' }, 400],
      [{ preset: 'custom', custom: [2, -0.5, 1.5, -2] }, 900],
      [{ preset: 'const' }, 500],
    ] as [Params, number][]) {
      const { s, lines, ro } = run(sc, over, steps);
      shows(lines, ro('K'), 'J');
      const m = 2;
      const v0 = over.preset === 'spring' ? 0 : 1;
      const dK = kinetic(m, s.v) - kinetic(m, v0);
      shows(lines, dK, 'J');
      // W_net (the W line) prints the same number as ΔK.
      expect(lines.filter((l) => l.endsWith(`= ${tn(dK)}${u('J')}`)).length).toBeGreaterThanOrEqual(2);
    }
  });

  it('Ch 08 energy: U, F = −dU/dx, K and E', async () => {
    const sc = await scene(8, 'energy');
    for (const [over, steps] of [
      [{}, 0],
      [{}, 500],
      [{ pot: 'hill', friction: true }, 600],
      [{ x0s: [-2.05, 2.9] }, 300],
    ] as [Params, number][]) {
      const { s, p, lines, ro } = run(sc, over, steps);
      shows(lines, ro('K'), 'J');
      shows(lines, ro('U'), 'J');
      shows(lines, ro('E'), 'J');
      shows(lines, -POTENTIALS[p.pot as 'double' | 'hill'].dU(s.x), 'N');
    }
  });

  it('Ch 08 path: W so far and over the whole path', async () => {
    const sc = await scene(8, 'path');
    const wab: Record<string, number> = { gravity: -1 * 9.8 * 1.5, spring: -0.5 * 2 * (13 - 6.25) };
    for (const [over, steps] of [
      [{}, 0],
      [{}, 500],
      [{ force: 'spring', path: 'zigzag' }, 400],
      [{ force: 'friction', closed: true }, 800],
      [{ force: 'spring', closed: true }, 300],
    ] as [Params, number][]) {
      const { p, lines, ro } = run(sc, over, steps);
      shows(lines, ro('W'), 'J');
      if (p.force !== 'friction') shows(lines, p.closed ? 0 : wab[p.force as string], 'J');
    }
  });

  it('Ch 09 track: p_tot, K_tot, v_cm and e', async () => {
    const sc = await scene(9, 'track');
    for (const [over, steps] of [
      [{}, 0],
      [{}, 800],
      [{ kind: 'inelastic', m1: 1.3, m2: 2.7, v2: -0.7, e: 0.35 }, 800],
      [{ kind: 'explode', m2: 3.1, E: 4.2 }, 600],
    ] as [Params, number][]) {
      const { p, lines, ro } = run(sc, over, steps);
      shows(lines, ro('p_\\mathrm{tot}'), 'kg\\,m/s');
      shows(lines, ro('K_\\mathrm{tot}'), 'J');
      shows(lines, ro('v_\\mathrm{cm}'), 'm/s');
      if (steps > 0 && p.kind === 'inelastic') shows(lines, 0.35, '');
    }
  });

  it('Ch 09 puck: p_tot,x, p_tot,y and K_tot', async () => {
    const sc = await scene(9, 'puck');
    for (const [over, steps] of [
      [{}, 0],
      [{}, 1000],
      [{ kind: 'inelastic', m2: 0.5, b: 0.29, v1: 1.7 }, 1000],
    ] as [Params, number][]) {
      const { lines, ro } = run(sc, over, steps);
      shows(lines, ro('p_{\\mathrm{tot},x}'), 'kg\\,m/s');
      shows(lines, ro('p_{\\mathrm{tot},y}'), 'kg\\,m/s');
      shows(lines, ro('K_\\mathrm{tot}'), 'J');
    }
  });

  it('Ch 10 rotor: I, α and ω', async () => {
    const sc = await scene(10, 'rotor');
    for (const [over, steps] of [
      [{}, 0],
      [{ rA: 0.35, m: 1.3, tau: 0.65 }, 700],
    ] as [Params, number][]) {
      const { s, p, lines, ro } = run(sc, over, steps);
      shows(lines, ro('\\alpha_A'), 'rad/s^2');
      shows(lines, ro('\\alpha_B'), 'rad/s^2');
      shows(lines, 2 * (p.m as number) * (p.rA as number) ** 2, 'kg\\,m^2');
      shows(lines, ro('\\alpha_B') * s.t, 'rad/s');
    }
  });

  it('Ch 10 parallel: I_cm, Md² and I', async () => {
    const sc = await scene(10, 'parallel');
    for (const over of [{}, { shape: 'rod', d: -0.47 }, { shape: 'ring', d: 0 }] as Params[]) {
      const { p, lines, ro } = run(sc, over, 0);
      shows(lines, ro('I_\\mathrm{cm}'), 'kg\\,m^2');
      shows(lines, ro('Md^2'), 'kg\\,m^2');
      shows(lines, ro('I'), 'kg\\,m^2');
      expect(ro('I_\\mathrm{cm}')).toBe(inertiaCm(p.shape as 'ring' | 'disk' | 'rod', 2, 0.5));
    }
  });

  it('Ch 11 spin: I, L = Iω and the areal velocity', async () => {
    const sc = await scene(11, 'spin');
    for (const [over, steps] of [
      [{}, 0],
      [{}, 1000],
      [{ mode: 'both', rIn: 0.3, m: 0.45 }, 2000],
      [{ sys: 'chair' }, 600],
      [{ sys: 'chair', arms: 'release', mDb: 3.3 }, 1500],
    ] as [Params, number][]) {
      const { p, lines, ro } = run(sc, over, steps);
      shows(lines, ro('I'), 'kg\\,m^2');
      shows(lines, ro('L'), 'kg\\,m^2/s');
      if (p.sys !== 'chair') shows(lines, ro('L') / (2 * (p.m as number)), 'm^2/s');
    }
  });

  it('Ch 11 roll: a, f_s, v_cm and K_rot/K_trans', async () => {
    const sc = await scene(11, 'roll');
    for (const [over, steps] of [
      [{}, 0],
      [{}, 150],
      [{ focus: 'hoop', theta: 12 }, 400],
      [{ focus: 'block', theta: 40 }, 2000],
    ] as [Params, number][]) {
      const { p, lines, ro } = run(sc, over, steps);
      shows(lines, ro('a'), 'm/s^2');
      shows(lines, ro('v_\\mathrm{cm}'), 'm/s');
      const b = p.focus as 'hoop' | 'disk' | 'sphere' | 'block';
      if (b !== 'block') {
        shows(lines, ro('K_\\mathrm{rot}/K_\\mathrm{trans}'), '');
        shows(lines, rollAccel(BETA[b], ((p.theta as number) * Math.PI) / 180).f, 'N');
        expect(lines.some((l) => l.startsWith('f_s'))).toBe(true);
      } else {
        shows(lines, G * Math.sin(((p.theta as number) * Math.PI) / 180), 'm/s^2');
        expect(lines.some((l) => l.startsWith('f_s') || l.startsWith('\\omega'))).toBe(false);
      }
    }
  });

  it('Ch 13 orbit: E, v_esc and the sign of E', async () => {
    const sc = await scene(13, 'orbit');
    for (const [over, steps, rel] of [
      [{}, 0, '<'],
      [{}, 150, '<'],
      [{ speed: 1 }, 400, '='],
      [{ speed: 1.3, alt: 15000 }, 400, '>'],
      [{ speed: 0.3, alt: 1000 }, 5000, '<'],
    ] as [Params, number, string][]) {
      const { lines, ro } = run(sc, over, steps);
      // At the escape speed E is an exact 0 (policy D, R7a), in the Σ panel and the readout.
      if (rel === '=') expect(lines.some((l) => l.endsWith(`= 0${u('GJ')}`))).toBe(true);
      else shows(lines, ro('E'), 'GJ');
      shows(lines, ro('v_\\mathrm{esc}'), 'km/s');
      expect(lines.at(-1)).toBe(`v = ${tn(ro('v'))}${u('km/s')} ${rel} v_\\mathrm{esc}`);
    }
    // v_esc from the physics function directly.
    const { lines } = run(sc, {}, 0);
    shows(lines, escapeSpeed(radius({ x: [-(6.371e6 + 6e6), 0], v: [0, 0] })) / 1e3, 'km/s');
  });

  it('Ch 14 venturi: v₁, v₂ and p₁ − p₂', async () => {
    const sc = await scene(14, 'venturi');
    for (const over of [{}, { ratio: 0.45, Q: 7.5, dy: 13 }, { ratio: 1, Q: 15 }, { ratio: 0.4, Q: 5, dy: 20 }] as Params[]) {
      const { lines, ro } = run(sc, over, 0);
      shows(lines, ro('v_1'), 'm/s');
      shows(lines, ro('v_2'), 'm/s');
      shows(lines, ro('p_1 - p_2'), 'kPa');
    }
  });

  it('Ch 15 shm: ω, T, x, a and E', async () => {
    const sc = await scene(15, 'shm');
    for (const [over, steps] of [
      [{}, 0],
      [{}, 700],
      [{ A: 0.05, k: 40, m: 0.2 }, 333],
      [{ zeta: 0.13, m: 0.3, k: 37 }, 700],
    ] as [Params, number][]) {
      const { s, p, lines, ro } = run(sc, over, steps);
      shows(lines, ro('\\omega'), 'rad/s');
      shows(lines, ro('T'), 's');
      shows(lines, ro('E'), 'J');
      shows(lines, s.a, 'm/s^2');
      if (p.zeta === 0) {
        shows(lines, s.x, 'm');
        shows(lines, 0.5 * (p.k as number) * (p.A as number) ** 2, 'J');
      }
    }
  });
});
