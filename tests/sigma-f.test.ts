// Σ formula panel, group F (Ch 37–42, Ch 38 wave packet): the printed results agree with the
// scene's own readouts and physics functions, at defaults and at other settings, at t = 0 and
// after running.
import { describe, expect, it } from 'vitest';
import { fmt } from '../src/core/format';
import { defaults } from '../src/core/params';
import { Runner } from '../src/core/runner';
import { tn } from '../src/core/tex';
import type { Params, Scene } from '../src/core/types';
import { lightClocks, rods, simultaneity, spacetime } from '../src/sims/ch37/scene';
import { contracted, fromS, gamma, movingPeriod, ticks } from '../src/sims/ch37/physics';
import { wavePacket } from '../src/sims/ch38/scene';
import { model, superposition, wells } from '../src/sims/ch39/scene';
import { angle, sequential, single } from '../src/sims/ch40/scene';
import { bandsScene } from '../src/sims/ch41/bands';
import { conduction } from '../src/sims/ch41/conduction';
import { carriersOf, doping } from '../src/sims/ch41/doping';
import { filling } from '../src/sims/ch41/filling';
import { decayScene } from '../src/sims/ch42/decay';

const SUP = '⁰¹²³⁴⁵⁶⁷⁸⁹';
const plain = (c: string) => (c === '⁻' ? '-' : String(SUP.indexOf(c)));

/** The readout as printed on screen (format.ts, with its sig and zeroTol), written as TeX like tn(). */
function shown(v: number, sig = 3, zeroTol?: number): string {
  const s = fmt(v, sig, zeroTol);
  if (s === '–') return '\\text{–}';
  return s.replace('−', '-').replace(/×10([⁻⁰¹²³⁴⁵⁶⁷⁸⁹]+)/, (_m, e: string) => `\\times 10^{${[...e].map(plain).join('')}}`);
}

/** Printed result of a line: after the last '=', without the unit. */
function result(line: string): string {
  const r = line.slice(line.lastIndexOf('= ') + 2);
  return r.replace(/\\ \\mathrm\{.*$/, '').replace(/\s*(\\ge|<).*$/, '').trim();
}

/** Formula lines and readouts of a scene with params `over`, after `steps` runner steps. */
function run(scene: Scene, over: Partial<Params> = {}, steps = 0) {
  const r = new Runner(scene, { ...(defaults(scene.params) as Params), ...over } as never, 1);
  if (steps && scene.time) {
    r.play();
    for (let i = 0; i < steps && r.playing; i++) r.advance(scene.time.h);
  }
  const s = r.state as never;
  const p = r.params as never;
  const lines = scene.formula!(s, p);
  const ro = (label: string) => {
    const spec = scene.readouts!.find((x) => x.label === label)!;
    return shown(spec.value(s, p), spec.sig ?? 3, spec.zeroTol);
  };
  return { lines, ro, s: r.state as Record<string, unknown> & { t: number }, p: r.params as Record<string, unknown> };
}

/** The line that starts with `head`. */
const line = (lines: string[], head: string) => {
  const l = lines.find((x) => x.startsWith(head));
  if (!l) throw new Error(`no line ${head} in\n${lines.join('\n')}`);
  return l;
};

describe('Σ group F: Ch 37', () => {
  it('light clocks: γ, Δt and the tick counts', () => {
    for (const [beta, steps] of [
      [0.8, 0],
      [0.8, 700],
      [0.3, 1300],
    ]) {
      const { lines, ro, s } = run(lightClocks as Scene, { beta }, steps);
      expect(result(lines[0])).toBe(ro('\\gamma'));
      expect(result(line(lines, '\\Delta t ='))).toBe(ro('\\Delta t'));
      expect(result(line(lines, 'n ='))).toBe(String(ticks(s.t, movingPeriod(1, beta))));
    }
  });

  it('rods: L = L₀/γ', () => {
    for (const beta of [0.8, 0.5, 0.99]) {
      const { lines, ro } = run(rods as Scene, { beta });
      expect(result(line(lines, 'L ='))).toBe(ro('L'));
      expect(result(line(lines, 'L ='))).toBe(tn(contracted(4, beta)));
    }
  });

  it('spacetime diagram: γ, then the reading of each mode with the table rounding', () => {
    const d = run(spacetime as Scene, { mode: 'dilate', beta: 0.6 });
    expect(result(d.lines[0])).toBe(d.ro('\\gamma'));
    expect(result(line(d.lines, '\\Delta t ='))).toBe((gamma(0.6) * 2).toFixed(2));
    const c = run(spacetime as Scene, { mode: 'contract', beta: 0.73 });
    for (const l of c.lines.filter((x) => x.startsWith('L ='))) expect(result(l)).toBe((3 / gamma(0.73)).toFixed(2));
    const o = run(spacetime as Scene, { mode: 'order', beta: 0.8, B: [-2.3, 0.7] });
    expect(result(o.lines[o.lines.indexOf(line(o.lines, "\\Delta t'")) + 1])).toBe(fromS(-2.3, 0.7, 0.8).tp.toFixed(2));
    expect(result(line(o.lines, "x'_"))).toBe(fromS(-2.3, 0.7, 0.8).xp.toFixed(2));
  });

  it('train: Δt = t_F − t_R as the readout, and the shown difference holds', () => {
    for (const beta of [0.6, 0.1, 0.8, 0.37]) {
      const { lines, ro } = run(simultaneity as Scene, { beta });
      const l = line(lines, '\\Delta t =');
      expect(result(l)).toBe(ro('\\Delta t'));
      const [a, b] = l.split(' = ')[2].split(' - ').map(Number);
      expect(tn(a - b)).toBe(result(l));
    }
  });
});

describe('Σ group F: Ch 38 wave packet', () => {
  it('Δx, Δk and Δx Δk as the readouts while it plays', () => {
    for (const [over, steps] of [
      [{}, 0],
      [{}, 900],
      [{ M: 15, k0: 12.5 }, 600],
    ] as [Partial<Params>, number][]) {
      const { lines, ro } = run(wavePacket as Scene, over, steps);
      expect(line(lines, '\\Delta x =')).toContain(`\\Delta x = ${ro('\\Delta x')}\\ `);
      expect(line(lines, '\\Delta x =')).toContain(`\\Delta k = ${ro('\\Delta k')}\\ `);
      expect(result(line(lines, '\\Delta x\\,\\Delta k'))).toBe(ro('\\Delta x\\,\\Delta k'));
    }
  });

  it('not localised (M ≤ 3): the condition instead of Δx', () => {
    const { lines, ro } = run(wavePacket as Scene, { M: 3 }, 300);
    expect(ro('\\Delta x')).toBe('\\text{–}');
    expect(lines.some((l) => l.includes('\\Delta x >'))).toBe(true);
    expect(lines.some((l) => l.startsWith('\\Delta x\\,\\Delta k'))).toBe(false);
  });
});

describe('Σ group F: Ch 39', () => {
  it('wells: the printed levels are the solver levels on the diagram', () => {
    for (const L of [0.5, 1, 1.5]) {
      const { lines, p } = run(wells as Scene, { pot: 'infinite', L });
      const E = model(p as never).st.E;
      lines.forEach((l, k) => expect(result(l)).toBe(tn(E[k])));
      // E_n = n² E₁: the shown product reproduces the level.
      for (const l of lines.slice(1)) {
        const [n2, e1] = l.split(' = ')[2].split(' \\times ').map(Number);
        expect(tn(n2 * e1)).toBe(result(l));
      }
    }
    const h = run(wells as Scene, { pot: 'harmonic', hw: 0.37 });
    expect(result(h.lines[0])).toBe(tn(model(h.p as never).st.E[0]));
    expect(result(h.lines[1])).toBe(tn(model(h.p as never).st.E[1]));
    const d = run(wells as Scene, { pot: 'double', b: 0.5, Ub: 4.5 });
    const Ed = model(d.p as never).st.E;
    expect(result(d.lines[0])).toBe(tn(Ed[1] - Ed[0]));
  });

  it('finite well: E₁ of the solver below h²/8mL², and its decay length in the walls', () => {
    for (const [L, U0] of [
      [1, 2],
      [0.5, 0.5],
      [1.5, 4.5],
    ]) {
      const { lines, p } = run(wells as Scene, { pot: 'finite', L, U0 });
      const E1 = model(p as never).st.E[0];
      const inf = tn((9.8696044 * 0.0380998212) / L ** 2);
      expect(result(lines[0])).toBe(inf);
      expect(line(lines, 'E_1 =')).toBe(`E_1 = ${tn(E1)}\\ \\mathrm{eV} < ${inf}\\ \\mathrm{eV}`);
      expect(E1).toBeLessThan(Number(inf));
      expect(result(lines[lines.length - 1])).toBe(tn(Math.sqrt(0.0380998212 / (U0 - E1))));
    }
  });

  it('superposition: ΔE, T and ⟨x⟩ as the readouts', () => {
    for (const [over, steps] of [
      [{}, 0],
      [{}, 777],
      [{ pot: 'double' }, 500],
      [{ pot: 'harmonic', pairH: '01', hw: 0.3 }, 1000],
      [{ pot: 'finite', pair: '23' }, 400],
    ] as [Partial<Params>, number][]) {
      const { lines, ro } = run(superposition as Scene, over, steps);
      expect(result(line(lines, '\\Delta E'))).toBe(ro('\\Delta E'));
      expect(result(line(lines, 'T ='))).toBe(ro('T'));
      expect(result(lines[lines.length - 1])).toBe(ro('\\langle x\\rangle'));
    }
  });
});

describe('Σ group F: Ch 40', () => {
  it('single device: N↑/N as the readout', () => {
    for (const model of ['quantum', 'classical']) {
      const { lines, ro } = run(single as Scene, { model }, 900);
      expect(result(line(lines, 'N_{\\uparrow}/N'))).toBe(ro('N_{\\uparrow}/N'));
    }
  });

  it('z → x → z: P₊ and the measured fraction as the readouts', () => {
    for (const pass of ['+', '-']) {
      const { lines, ro } = run(sequential as Scene, { pass }, 900);
      expect(result(line(lines, 'P_+'))).toBe(ro('P_+'));
      expect(result(line(lines, 'N_+/'))).toBe(ro('N_+/(N_+ + N_-)'));
    }
  });

  it('angle: cos²(θ/2) and the measured fraction as the readouts', () => {
    for (const theta of [60, 0, 135, 180]) {
      const { lines, ro } = run(angle as Scene, { theta }, 900);
      expect(result(lines[0])).toBe(ro('\\cos^2(\\theta/2)'));
      expect(result(line(lines, 'N_+/'))).toBe(ro('N_+/(N_+ + N_-)'));
    }
  });
});

describe('Σ group F: Ch 41', () => {
  it('bands: W₁ and E_g as the readouts', () => {
    for (const over of [{}, { N: 1, b: 0.5 }, { N: 12, b: 0.3 }]) {
      const { lines, ro } = run(bandsScene as Scene, over);
      expect(result(lines[lines.indexOf(line(lines, 'W_1')) + 1])).toBe(ro('W_1'));
      expect(result(line(lines, 'E_\\text{g}'))).toBe(ro('E_\\text{g}'));
    }
  });

  it('filling: n_i (and the metal n) as the readout n', () => {
    for (const over of [{}, { mat: 'ge', T: 450 }, { mat: 'si', T: 600 }, { mat: 'metal' }]) {
      const { lines, ro } = run(filling as Scene, over);
      expect(result(lines.find((l) => /^(n =|= \()/.test(l))!)).toBe(ro('n'));
    }
  });

  it('conduction: J as the readout while the field drives the band', () => {
    for (const [over, steps] of [
      [{}, 0],
      [{}, 150],
      [{ fill: 'nearly', field: 0.35 }, 400],
      [{ fill: 'full' }, 400],
    ] as [Partial<Params>, number][]) {
      const { lines, ro } = run(conduction as Scene, over, steps);
      expect(result(line(lines, 'J ='))).toBe(ro('J'));
    }
  });

  it('doping: n and p as the readouts, E_F from carriers()', () => {
    for (const over of [
      { type: 'n' },
      { type: 'n', T: 80, conc: 1e18 },
      { type: 'p', T: 500, conc: 1e14 },
      { type: 'i', T: 50 },
      { type: 'i', T: 700 },
    ]) {
      const { lines, ro, p } = run(doping as Scene, over);
      const q = carriersOf(p as never);
      if (over.type === 'i') expect(result(lines[0])).toBe(ro('n'));
      else {
        // Majority carriers on the line after charge neutrality, minority from n p = n_i².
        const res = lines.map(result);
        expect(res).toContain(ro('n'));
        expect(res).toContain(ro('p'));
        expect(lines.some((l) => l.includes('= \\frac{n_i^2}'))).toBe(true);
      }
      expect(result(lines[lines.length - 1])).toBe(tn(q.mu));
    }
  });
});

describe('Σ group F: Ch 42', () => {
  it('decay: t/T½ and N/N₀ as the readouts', () => {
    for (const [over, steps] of [
      [{}, 0],
      [{}, 600],
      [{ iso: 'u238', N0: 10000 }, 900],
      [{ iso: 'i131', N0: 10 }, 1500],
    ] as [Partial<Params>, number][]) {
      const { lines, ro } = run(decayScene as Scene, over, steps);
      expect(result(line(lines, '\\frac{t}{T_{1/2}}'))).toBe(ro('t/T_{1/2}'));
      expect(result(line(lines, 'N/N_0'))).toBe(ro('N/N_0'));
    }
  });
});
