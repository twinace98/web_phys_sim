// Σ formula panel, Ch 16–20: the printed result of a line equals tn() of the scene's own readout
// or physics function, at defaults and at other settings, at t = 0 and after running.
import { describe, expect, it } from 'vitest';
import { defaults } from '../src/core/params';
import { Runner } from '../src/core/runner';
import { num, readoutText, texOf, tn, u } from '../src/core/tex';
import { tJ } from '../src/sims/ch18/formula';
import type { Params, Scene } from '../src/core/types';
import { reflectAt } from '../src/sims/ch16/physics';
import { cfg as reflectCfg, reflect } from '../src/sims/ch16/reflect';
import { resonanceScene } from '../src/sims/ch16/resonance';
import { beats } from '../src/sims/ch17/beats';
import { doppler } from '../src/sims/ch17/doppler';
import { cycleScene } from '../src/sims/ch18/cycle';
import { pathsScene } from '../src/sims/ch18/paths';
import { processScene } from '../src/sims/ch18/process';
import { gasScene } from '../src/sims/ch19/gas';
import { carnotScene, heatsAt } from '../src/sims/ch20/carnot';
import { cycle } from '../src/sims/ch18/physics';
import { expansionScene, pow2 } from '../src/sims/ch20/expansion';
import { heatScene } from '../src/sims/ch20/heat';
import { lnBinom } from '../src/sims/ch20/physics';

type AnyScene = Scene<any, any>;

/** Runner at these params after `steps` steps (0: the initial state), optionally with the state prepared first. */
function run(scene: AnyScene, over: Record<string, unknown>, steps: number, prep?: (s: never) => void) {
  const p = { ...(defaults(scene.params) as Params), ...over };
  const r = new Runner(scene, p as never, 1);
  prep?.(r.state as never);
  if (steps > 0) {
    r.play();
    for (let i = 0; i < steps && r.playing; i++) r.advance(scene.time!.h);
  }
  const lines = scene.formula!(r.state as never, r.params as never);
  const ro = (scene.readouts ?? []).map((x) => x.value(r.state as never, r.params as never));
  // Readout strings as the shell prints them (policy D: a Σ result is its readout string), in TeX.
  const rt = (scene.readouts ?? []).map((x, k) => texOf(readoutText(x as never, ro[k], r.params as Params)));
  return { r, lines, ro, rt, s: r.state as never, p: r.params as never };
}

/** Line `i` ends with "= <tn(v, sig)><unit>". */
function ends(lines: string[], i: number, v: number, unit = '', sig = 3) {
  endsText(lines, i, tn(v, sig), unit);
}

/** Line `i` ends with "= <text><unit>". */
function endsText(lines: string[], i: number, text: string, unit = '') {
  expect(lines[i], `line ${i}: ${lines[i]}`).toBeDefined();
  expect(lines[i].endsWith(`= ${text}${unit ? u(unit) : ''}`), `line ${i}: ${lines[i]} vs ${text}`).toBe(true);
}

describe('Σ panel agrees with the simulation (Ch 16–20)', () => {
  it('Ch 16 reflect: y(L) is the string at the end; 0 at a fixed end, 2h at a free end', () => {
    for (const over of [{}, { end: 'free' }, { mode: 'wave' }, { mode: 'wave', end: 'free', lambda: 0.7 }]) {
      for (const steps of [0, 400, 520]) {
        const { lines, s, p } = run(reflect, over, steps);
        const t = (s as { t: number }).t;
        const c = reflectCfg(p);
        const at = reflectAt(c, 4, t);
        // 3 figures; a residue below 10⁻⁶ of the amplitude is an exact 0 (R7a): the two halves at a fixed end.
        const d = (v: number) => (Math.abs(v) < 1e-6 * c.A ? '0' : tn(v));
        endsText(lines, lines.length - 2, d(at.inc), 'm');
        endsText(lines, lines.length - 1, d(at.y), 'm');
        if (c.end === 'fixed') expect(lines.at(-1)!.endsWith(`= 0${u('m')}`), lines.at(-1)).toBe(true);
      }
    }
    // The free end really moves: 2h once the pulse is there.
    const { lines } = run(reflect, { end: 'free' }, 400);
    expect(lines.at(-1)).not.toMatch(/= 0\.00/);
  });

  it('Ch 16 resonance: λ and 2L/λ readouts, f_n of the nearest harmonic', () => {
    for (const f of [2, 0.55, 3.15]) {
      const { lines, ro } = run(resonanceScene, { f }, 0);
      ends(lines, 0, ro[1], 'm');
      ends(lines, 1, ro[2]);
      const n = Math.max(1, Math.round(ro[2]));
      ends(lines, 2, n * 1, 'Hz');
    }
  });

  it('Ch 17 beats: f₂, f_beat, T_beat readouts and the envelope now', () => {
    for (const over of [{}, { f1: 440, df: 3.9 }, { f1: 137, df: 1.3 }]) {
      for (const steps of [0, 300]) {
        const { lines, ro, rt, s, p } = run(beats, over, steps);
        // f₂ = f₁ + Δf is exact: printed as typed (443.9, not 444), as in its readout.
        expect(lines[0].endsWith(`= ${num(ro[0])}${u('Hz')}`), lines[0]).toBe(true);
        expect(beats.readouts![0].format!(ro[0])).toBe(num(ro[0]));
        // f_beat = Δf as the slider label (R1): 3.9, not 3.90.
        endsText(lines, 1, rt[1], 'Hz');
        expect(rt[1]).toBe(String((p as { df: number }).df.toFixed(1)));
        ends(lines, 2, ro[2], 's');
        const pp = p as { f1: number; df: number };
        const t = (s as { t: number }).t;
        expect(lines[5].endsWith(`= ${tn(2 * Math.abs(Math.cos(Math.PI * pp.df * t)))}A`)).toBe(true);
      }
    }
  });

  it("Ch 17 doppler: every f' readout with a value is printed, none without", () => {
    const sym = ["f'_A", "f'_B", "f'_{B2}"];
    for (const over of [{}, { vs: 510 }, { vs: 340 }, { vs: 0 }, { who: 'observer' }, { who: 'observer', vo: 255 }]) {
      for (const steps of [0, 200, 1200]) {
        const { lines, ro } = run(doppler, over, steps);
        ro.forEach((v, k) => {
          const i = lines.findIndex((l) => l.startsWith(`${sym[k]} =`));
          if (Number.isFinite(v)) ends(lines, i, v, 'Hz');
          else expect(i, `${sym[k]} ${JSON.stringify(over)}`).toBe(-1);
        });
      }
    }
    // Above the speed of sound: the Mach angle arcsin(v/v_S).
    const { lines } = run(doppler, { vs: 510 }, 0);
    expect(lines.some((l) => l.endsWith(`= ${tn((Math.asin(340 / 510) * 180) / Math.PI)}^\\circ`))).toBe(true);
  });

  it('Ch 18 process: T readout, then W, ΔE_int and Q = ΔE_int + W of the bars', () => {
    const cases = [{}, { proc: 'isothermal' }, { proc: 'adiabatic', gas: 'di' }, { proc: 'isochoric', dirT: 'cool' }, { proc: 'isobaric', dirV: 'compress' }];
    for (const over of cases) {
      for (const steps of [0, 250, 480]) {
        const { lines, ro } = run(processScene, over, steps);
        ends(lines, 0, ro[2], 'K');
        if ((over as { proc?: string }).proc === 'isothermal' || (over as { proc?: string }).proc === 'adiabatic') ends(lines, 1, ro[0], 'kPa');
      }
    }
    // Isothermal, end: W = nRT ln 2 = 1000 ln 2 J, ΔE_int = 0, Q = W; energies in whole joules.
    const { lines } = run(processScene, { proc: 'isothermal' }, 480);
    endsText(lines, 2, '693', 'J');
    endsText(lines, 3, '0', 'J');
    endsText(lines, 4, '693', 'J');
  });

  it('Ch 18 paths: W, ΔE_int, Q readouts of the highlighted path', () => {
    for (const over of [{}, { hl: 'ADB' }, { hl: 'AB', B: 'b3' }, { hl: 'ADB', B: 'b2', gas: 'di' }]) {
      for (const steps of [0, 300, 720]) {
        const { lines, rt } = run(pathsScene, over, steps);
        // The trapezoid of path AB takes two lines.
        const k = (over as { hl?: string }).hl === 'AB' ? 1 : 0;
        endsText(lines, k, rt[0], 'J');
        endsText(lines, k + 1, rt[2], 'J');
        endsText(lines, k + 2, rt[1], 'J');
      }
    }
  });

  it('Ch 18 cycle: W, ΔE_int, Q readouts; net work ± area 2000 J', () => {
    for (const over of [{}, { dir: 'ccw' }, { gas: 'di' }]) {
      for (const steps of [0, 300, 700, 960]) {
        const { lines, rt } = run(cycleScene, over, steps);
        endsText(lines, 0, rt[0], 'J');
        endsText(lines, 1, rt[2], 'J');
        endsText(lines, 2, rt[1], 'J');
        endsText(lines, 3, (over as { dir?: string }).dir === 'ccw' ? '-2000' : '2000', 'J');
      }
    }
  });

  it('Ch 19 pressure: J/(L t) and NkT/A readouts', () => {
    for (const over of [{}, { N: 1000, T: 1200, L: 15 }, { N: 20, T: 100, L: 30, init: 'mb' }]) {
      for (const steps of [0, 500, 3000]) {
        const { lines, ro, rt } = run(gasScene, over, steps);
        // Measured (R4): the readout string with its scatter, "(1.2 ± 0.2) mN/m"; 0 before the first bounce.
        if (ro[0] === 0) endsText(lines, 0, '0', 'mN/m');
        else expect(lines[0], lines[0]).toMatch(new RegExp(`= \\(?${rt[0].replace(/[.\\{}^()]/g, '\\$&')}( \\\\pm |\\\\times)`));
        ends(lines, 1, ro[1], 'mN/m');
      }
    }
  });

  it('Ch 20 expansion: W and ΔS/k readouts, closed and opened; P(n = N) = 2^−N', () => {
    for (const N of [10, 4, 100, 1000]) {
      for (const open of [false, true]) {
        const { lines, rt } = run(expansionScene, { N }, 600, (s: { open: boolean }) => {
          s.open = open;
        });
        endsText(lines, 0, rt[1]);
        endsText(lines, 1, rt[2]);
        ends(lines, 2, lnBinom(N, Math.floor(N / 2)));
        // Closed: one microstate, Ω = 1 and ΔS/k = ln 1 = 0 exactly (R2).
        if (!open) expect([rt[1], rt[2]]).toEqual(['1', '0']);
      }
    }
    expect(pow2(10)).toBe(tn(2 ** -10));
    expect(pow2(100)).toBe('7.89\\times 10^{-31}');
    expect(pow2(1000)).toBe('9.33\\times 10^{-302}');
  });

  it('Ch 20 heat: kT/ε readouts of both solids', () => {
    for (const over of [{}, { start: 'B' }, { na: 90, q: 20 }, { na: 10, q: 200 }]) {
      for (const steps of [0, 400]) {
        const { lines, rt } = run(heatScene, over, steps);
        endsText(lines, 3, rt[1]);
        endsText(lines, 4, rt[2]);
      }
    }
  });

  it('Ch 20 carnot: W/Q_H and 1 − T_C/T_H readouts, first law of the bars now', () => {
    for (const over of [{}, { tc: 150, gas: 'di' }, { tc: 500 }]) {
      for (const steps of [0, 400, 960]) {
        const { lines, ro, s, p } = run(carnotScene, over, steps);
        ends(lines, 3, ro[0]);
        ends(lines, 4, ro[1]);
        const pp = p as { tc: number; gas: string };
        const c = cycle('carnot', true, pp.gas === 'di' ? 5 : 3, pp.tc);
        endsText(lines, 5, tJ(heatsAt(c.legs, Math.min((s as { t: number }).t / 8, 1), pp.gas === 'di' ? 5 : 3).W), 'J');
      }
    }
  });
});
