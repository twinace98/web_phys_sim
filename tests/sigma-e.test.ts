// Σ formula panel, Ch 31-36: the printed result of the panel lines equals the scene's own
// readouts (same function, same significant figures) at defaults and other settings, and states
// without a quantity print no number for it (TIR: no θ₂; object at F: no i, no m).
import { describe, expect, it } from 'vitest';
import { defaults } from '../src/core/params';
import { Runner } from '../src/core/runner';
import { tn } from '../src/core/tex';
import type { Params, Scene } from '../src/core/types';
import { acScene } from '../src/sims/ch31/ac';
import { tns } from '../src/sims/ch31/fit';
import { freeScene } from '../src/sims/ch31/free';
import { magnet } from '../src/sims/ch32/magnet';
import { origin } from '../src/sims/ch32/origin';
import { MU_B, onsagerM, paraM, TC } from '../src/sims/ch32/physics';
import { MEDIA, snell } from '../src/sims/ch33/physics';
import { polar } from '../src/sims/ch33/polar';
import { fibre, refraction } from '../src/sims/ch33/refraction';
import { lensScene, mirrorScene } from '../src/sims/ch34/scene';
import { doubleSlit } from '../src/sims/ch35/scene';
import { phasor } from '../src/sims/ch36/phasor';
import { singleSlit } from '../src/sims/ch36/single';

type AnyScene = Scene<never, never>;

/** Runner at defaults + overrides, optionally played for n steps. */
function run(scene: AnyScene, over: object = {}, steps = 0) {
  const p = { ...(defaults(scene.params) as Params), ...(over as Params) };
  const r = new Runner(scene, p as never, 1);
  if (steps && scene.time) {
    r.play();
    for (let i = 0; i < steps && r.playing; i++) r.advance(scene.time.h);
  }
  const lines = scene.formula!(r.state as never, r.params as never);
  /** A readout as the stage prints it (its own sig), in TeX. */
  const ro = (label: string) => {
    const spec = scene.readouts!.find((x) => x.label === label)!;
    return tn(spec.value(r.state as never, r.params as never), spec.sig ?? 3);
  };
  return { lines, ro, r };
}

/** The line's printed result: the text after its last " = ", without a trailing comparison, unit or degree sign. */
const result = (l: string) =>
  l
    .replace(/ (\\le|\\ge|<|>) \\theta$/, '')
    .replace(/(\\ \\mathrm\{[^}]*\}|\\ \\mu\\mathrm\{[^}]*\}|\^\\circ|\\ \\%)$/, '')
    .replace(/^= /, '')
    .split(' = ')
    .at(-1)!;

/** Some line prints exactly v as its result. */
function shows(lines: string[], v: string) {
  expect(lines.map(result), `${v} in\n${lines.join('\n')}`).toContain(v);
}

const as = (s: unknown) => s as AnyScene;

describe('Σ Ch 31', () => {
  it('free: T\' and the live U equal the readouts; overdamped prints the condition, no T\'', () => {
    for (const [over, steps] of [
      [{}, 0],
      [{}, 317],
      [{ R: 20 }, 211],
      [{ R: 63, L: 10, C: 10 }, 50],
    ] as const) {
      const { lines, ro } = run(as(freeScene), over, steps);
      shows(lines, ro("T'"));
      shows(lines, ro('U'));
    }
    const { lines, ro } = run(as(freeScene), { R: 100, L: 5, C: 20 }, 100);
    expect(ro("T'")).toBe('\\text{–}');
    expect(lines.some((l) => l.startsWith("T'"))).toBe(false);
    expect(lines.some((l) => l.endsWith('\\ge \\omega_0'))).toBe(true);
    shows(lines, ro('U'));
  });

  it('ac: I, φ and Z equal the readouts', () => {
    for (const over of [{}, { ratio: 1 }, { ratio: 1.01 }, { ratio: 2.5, R: 50 }, { ratio: 0.3, R: 10 }]) {
      const { lines, ro } = run(as(acScene), over);
      for (const k of ['I', '\\phi', 'Z']) shows(lines, ro(k));
    }
  });
});

describe('Σ Ch 32', () => {
  it('origin: I and μ = IA equal the readouts; μ_s has the sign of the spin', () => {
    for (const over of [{}, { dir: 'cw', spin: 'down' }]) {
      const { lines, ro, r } = run(as(origin), over);
      shows(lines, ro('I'));
      const mu = as(origin).readouts!.find((x) => x.label === '\\mu = IA')!.value(r.state as never, r.params as never) * 1e-24;
      shows(lines, tns(mu));
      shows(lines, tns((over.spin === 'down' ? 1 : -1) * MU_B));
    }
  });

  it('materials: M/M_s and B/B_max equal the readouts while the field sweeps; equilibrium references', () => {
    for (const [over, steps] of [
      [{}, 0],
      [{}, 120],
      [{ mat: 'para', T: 1.5 }, 80],
      [{ mat: 'dia' }, 50],
      [{ mat: 'ferro', T: 1.2, field: 'on' }, 5],
    ] as const) {
      const { lines, ro, r } = run(as(magnet), over, steps);
      shows(lines, ro('M/M_\\text{s}'));
      shows(lines, ro('B/B_\\text{max}'));
      const p = r.params as unknown as { mat: string; T: number };
      const s = r.state as unknown as { B: number };
      if (p.mat === 'para') shows(lines, tn(paraM(s.B, p.T * TC), 2));
      if (p.mat === 'ferro' && p.T < 1) shows(lines, tn(onsagerM(p.T * TC)));
      if (p.mat === 'ferro' && p.T >= 1) expect(lines.at(-1)).toContain('= 0');
    }
  });
});

describe('Σ Ch 33', () => {
  it('polar: I/I_1 and I/I_0 equal the readouts (2 and 3 polarizers)', () => {
    for (const over of [{}, { theta: 90 }, { n: 3, theta: 45 }, { n: 3, theta: 120 }]) {
      const { lines, ro } = run(as(polar), over);
      shows(lines, ro('I/I_1'));
      shows(lines, ro('I/I_0'));
    }
  });

  it('refraction: θ₂ and θ_c equal the readouts; under TIR no θ₂, the condition and R = 100 %', () => {
    for (const over of [{}, { theta: 0 }, { theta: 41.8103148957786 }, { n1: 'air', n2: 'diamond', theta: 70 }]) {
      const { lines, ro } = run(as(refraction), over);
      shows(lines, ro('\\theta_2'));
      if (ro('\\theta_c') !== '\\text{–}') shows(lines, ro('\\theta_c'));
    }
    const { lines, ro } = run(as(refraction), { theta: 45.6 });
    expect(Number.isNaN(snell(MEDIA.glass, MEDIA.air, 45.6 * (Math.PI / 180)))).toBe(true);
    expect(lines.some((l) => l.startsWith('\\theta_2'))).toBe(false);
    expect(lines[0]).toMatch(/= 1\.07 > 1$/);
    shows(lines, ro('R'));
    shows(lines, ro('\\theta_c'));
  });

  it('fibre: θ, θ_c and α_max equal the readouts', () => {
    for (const over of [{}, { alpha: 25 }, { alpha: 80, clad: '1' }, { alpha: 0, clad: '1.33' }]) {
      const { lines, ro } = run(as(fibre), over);
      for (const k of ['\\theta', '\\theta_c', '\\alpha_\\text{max}']) shows(lines, ro(k));
    }
  });
});

describe('Σ Ch 34', () => {
  it('lens and mirror: i and m equal the readouts; at p = f no i and no m', () => {
    for (const sc of [lensScene, mirrorScene]) {
      const kinds = sc === lensScene ? ['converging', 'diverging'] : ['concave', 'convex', 'plane'];
      for (const kind of kinds)
        for (const over of [{}, { p: 7.5 }, { p: 55, f: 30 }, { p: 2, f: 5 }]) {
          const { lines, ro } = run(as(sc), { kind, ...over });
          shows(lines, ro('i'));
          shows(lines, ro('m'));
        }
      const { lines, ro } = run(as(sc), { p: 15, f: 15 });
      expect(ro('i')).toBe('\\text{–}');
      expect(lines.at(-1)).toMatch(/= 0$/);
      expect(lines.some((l) => l.startsWith('i =') || l.startsWith('m ='))).toBe(false);
    }
  });
});

describe('Σ Ch 35', () => {
  it('double slit: Δy and ΔL/λ equal the readouts', () => {
    for (const over of [{}, { d: 1.5, lambda: 700, D: 12, yp: -11.5 }, { d: 5, lambda: 400, D: 25, yp: 3.3 }]) {
      const { lines, ro } = run(as(doubleSlit), over, 40);
      shows(lines, ro('\\Delta y'));
      shows(lines, ro('\\Delta L/\\lambda'));
    }
  });
});

describe('Σ Ch 36', () => {
  it('single / two slits: θ₁ and ΔL/λ equal the readouts; λ ≥ a prints the condition', () => {
    for (const over of [{}, { slits: 'two' }, { slits: 'two', a: 1.5, d: 4.5 }, { a: 6, lambda: 400, D: 15 }]) {
      const { lines, ro } = run(as(singleSlit), over, 40);
      shows(lines, ro('\\theta_1'));
      shows(lines, ro('\\Delta L/\\lambda'));
    }
    const { lines, ro } = run(as(singleSlit), { a: 0.5, lambda: 700 });
    expect(ro('\\theta_1')).toBe('\\text{–}');
    expect(lines[0]).toMatch(/\\ge 1$/);
    shows(lines, ro('\\Delta L/\\lambda'));
  });

  it('phasor: φ and I/I_m equal the readouts', () => {
    for (const over of [{}, { theta: 0 }, { theta: -40, a: 4, lambda: 400, N: 8 }, { theta: 30, a: 0.5, lambda: 600, N: 20 }]) {
      const { lines, ro } = run(as(phasor), over);
      shows(lines, ro('\\phi'));
      shows(lines, ro('I/I_m'));
    }
  });
});
