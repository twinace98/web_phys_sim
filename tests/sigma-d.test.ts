// Σ formula panel, Ch 22-30: the printed result of each scene's key lines equals the scene's own
// readout or stage-panel value (same function, same significant figures), at the defaults and at
// other settings, at t = 0 and while running.
import { describe, expect, it } from 'vitest';
import { defaults } from '../src/core/params';
import { Runner } from '../src/core/runner';
import { readoutText, texOf, tn } from '../src/core/tex';
import type { Params, Scene } from '../src/core/types';
import { gaussScene, gaussValues } from '../src/sims/ch23/scene';
import { ENC_FLUX } from '../src/sims/ch23/physics';
import { field, fieldAtTest, forceOnTest } from '../src/sims/ch22/scene';
import { potential } from '../src/sims/ch24/scene';
import { V, pointSources } from '../src/sims/field/charges';
import { capacitor, siTex, stateOf } from '../src/sims/ch25/scene';
import { conduction } from '../src/sims/ch26/scene';
import { resistanceOf } from '../src/sims/ch26/physics';
import { rcCircuit } from '../src/sims/ch27/scene';
import { lorentzScene } from '../src/sims/ch28/lorentz';
import { cyclotronScene } from '../src/sims/ch28/cyclotron';
import { maxEnergy, PARTICLES } from '../src/sims/ch28/physics';
import { biot } from '../src/sims/ch29/biot';
import { ampere, ampereValues } from '../src/sims/ch29/ampere';
import { MU0_UT, loopCentre } from '../src/sims/ch29/physics';
import { faraday } from '../src/sims/ch30/faraday';
import { maxwell } from '../src/sims/ch30/maxwell';
import { ampereMaxwell } from '../src/sims/ch30/physics';

/** Runner at `over` on top of the defaults, advanced `seconds` of sim time. */
function run(sc: unknown, over: Record<string, unknown> = {}, seconds = 0) {
  const scene = sc as Scene;
  const p = { ...(defaults(scene.params) as Params), ...over };
  const r = new Runner(scene, p as never, 1);
  if (seconds > 0 && scene.time) {
    r.play();
    const n = Math.round(seconds / scene.time.h);
    for (let i = 0; i < n && r.playing; i++) r.advance(scene.time.h);
  }
  const lines = scene.formula!(r.state as never, r.params as never);
  const ro = (label: string) => {
    const spec = scene.readouts!.find((x) => x.label === label)!;
    return texOf(readoutText(spec, spec.value(r.state as never, r.params as never), r.params as Params));
  };
  return { r, p: r.params as Params, s: r.state as never, lines, ro };
}

/** Some line ends its chain with "= <text>" (a unit may follow). */
function shows(lines: string[], text: string): void {
  const ok = lines.some((l) => l.endsWith(`= ${text}`) || l.includes(`= ${text}\\ `) || l.includes(`= ${text}\\,`));
  expect(ok, `"= ${text}" in\n${lines.join('\n')}`).toBe(true);
}

describe('Σ panel agrees with the simulation (Ch 22-30)', () => {
  it('Ch 22 field: E and F = q0 E at the test charge', () => {
    for (const over of [{}, { preset: 'single' }, { preset: 'plates', T: [0.3, -0.1] }, { preset: 'like' }]) {
      const { p, lines, ro } = run(field, over);
      shows(lines, ro('E'));
      shows(lines, ro('F'));
      const [ex, ey] = fieldAtTest(p as never);
      shows(lines, tn(Math.hypot(ex, ey)));
      shows(lines, tn(forceOnTest(p as never)));
    }
    // Without the test charge there is no force to print.
    const off = run(field, { test: false });
    expect(off.lines.some((l) => l.startsWith('F'))).toBe(false);
  });

  it('Ch 23 gauss: λ_enc/ε0 and the numerical ∮ E_n dl of the stage panel', () => {
    const G = (defaults(gaussScene.params) as Params).G as number[];
    for (const over of [{}, { shape: 'square' }, { G: [0.5, -0.2, 0.25, G[3]] }, { G: [0, 0, 0.7, G[3]] }]) {
      const { p, lines } = run(gaussScene, over);
      const v = gaussValues(p);
      expect(v.rhs).toBeCloseTo(v.enc * ENC_FLUX, 9);
      shows(lines, tn(v.rhs));
      shows(lines, tn(v.flux));
      expect(lines.join(' ')).toContain(`\\lambda_\\text{enc} = ${v.enc}`);
    }
  });

  it('Ch 24 potential: V, ΔV, W and −q0 ΔV after a drag', () => {
    for (const over of [{}, { preset: 'single' }]) {
      const { r, p, ro } = run(potential, over);
      const s = r.state as unknown as { path: number[]; A: { x: number; y: number } };
      // Drag the test charge along a short path.
      s.path.push(0.1, 0.4, 0.35, 0.2, 0.5, -0.3);
      const lines = potential.formula!(s as never, p as never);
      const src = pointSources(p as never);
      const dV = V(src, 0.5, -0.3) - V(src, s.A.x, s.A.y);
      shows(lines, ro('V'));
      shows(lines, ro('\\Delta V'));
      shows(lines, tn(dV));
      shows(lines, ro('W'));
      shows(lines, tn(-dV));
    }
  });

  it('Ch 25 capacitor: C, Q, V, E, U as in the stage table', () => {
    for (const over of [{}, { source: 'off' }, { dielectric: 'water', A: 200, d: 0.5 }, { dielectric: 'air', source: 'off', d: 2 }]) {
      const { p, lines } = run(capacitor, over);
      const st = stateOf(p as never);
      shows(lines, siTex(st.C, 'F'));
      shows(lines, siTex(st.Q, 'C'));
      shows(lines, siTex(st.V, 'V'));
      shows(lines, siTex(st.E, 'V/m'));
      shows(lines, siTex(st.U, 'J'));
    }
  });

  it('Ch 26 drift: R = ρL/A, and the measured Ī and V/Ī once counted', () => {
    for (const over of [{}, { T: 450, L: 6, A: 1 }, { V: 0.3, T: 200 }]) {
      const before = run(conduction, over, 0.5);
      shows(before.lines, before.ro('\\rho L/A'));
      expect(before.lines.some((l) => l.startsWith('\\bar I'))).toBe(false);
      const after = run(conduction, over, 4);
      shows(after.lines, tn(resistanceOf({ L: after.p.L as number, A: after.p.A as number, T: after.p.T as number })));
      shows(after.lines, after.ro('\\bar I'));
      shows(after.lines, after.ro('V/\\bar I'));
    }
  });

  it('Ch 27 rc: τ, V_C and i follow the readouts while charging and discharging', () => {
    for (const over of [{}, { sw: 'discharge' }, { R: 0.5, C: 100 }]) {
      for (const t of [0, 0.7, 3]) {
        const { lines, ro } = run(rcCircuit, over, t);
        shows(lines, ro('\\tau'));
        shows(lines, ro('V_C'));
        shows(lines, ro('i'));
      }
    }
    // Switch thrown mid-run: q continues from q0, i uses the new switch position.
    const { r, ro } = run(rcCircuit, {}, 1.5);
    (r.params as Params).sw = 'discharge';
    for (let i = 0; i < 120; i++) r.advance(rcCircuit.time!.h);
    const lines = rcCircuit.formula!(r.state as never, r.params as never);
    expect(lines.some((l) => l.includes('q_0\\,e^{-(t - t_s)/\\tau}'))).toBe(true);
    shows(lines, ro('V_C'));
    shows(lines, ro('i'));
  });

  it('Ch 28 lorentz: r and T of the fastest particle', () => {
    for (const over of [{}, { particle: 'electron', Be: 0.5 }, { particle: 'alpha', Bi: 2, compare: false, v: 1.5 }]) {
      const { lines, ro } = run(lorentzScene, over, 1);
      shows(lines, ro('r'));
      shows(lines, ro('T'));
    }
  });

  it('Ch 28 cyclotron: K_max, and K and r of the readouts while running', () => {
    for (const over of [{}, { ratio: 1.02, V0: 20 }]) {
      for (const t of [0, 1.5, 6]) {
        const { lines, ro } = run(cyclotronScene, over, t);
        shows(lines, ro('K'));
        shows(lines, ro('r'));
        const kmax = maxEnergy({ pt: PARTICLES.proton, B: 1, R: 0.05, gap: 0.006, V0: 1e4, ratio: 1 }) / 1.602176634e-16;
        shows(lines, tn(kmax));
      }
    }
  });

  it('Ch 29 biot: running sum B and the reference value', () => {
    for (const over of [{}, { wire: 'loop' }, { wire: 'loop', Pl: [0.3, 0] }, { n: 4, Ps: [0.5, -0.06] }]) {
      for (const t of [0, 2, 4]) {
        const { lines, ro } = run(biot, over, t);
        shows(lines, ro('B'));
      }
    }
    const centre = run(biot, { wire: 'loop' });
    shows(centre.lines, tn(loopCentre()));
  });

  it('Ch 29 ampere: μ0 I_enc and the numerical ∮ B·dl of the stage panel', () => {
    for (const over of [{}, { preset: 'single' }, { preset: 'solenoid', shape: 'square' }]) {
      const { p, lines } = run(ampere, over);
      const v = ampereValues(p);
      expect(v.rhs).toBeCloseTo(v.enc * MU0_UT, 9);
      shows(lines, tn(v.rhs));
      shows(lines, tn(v.circ));
    }
  });

  it('Ch 30 faraday: Φ_B and ℰ of the readouts while the loop or magnet moves', () => {
    for (const over of [{}, { scenario: 'magnet' }, { v: 1, B: 1 }]) {
      for (const t of [0, 0.9, 2.2, 3.5]) {
        const { lines, ro } = run(faraday, over, t);
        shows(lines, ro('\\Phi_B'));
        shows(lines, ro('\\mathcal{E}'));
      }
    }
  });

  it('Ch 30 maxwell: the stage panel values for each equation', () => {
    const fd = run(maxwell, { dBdt: 2 });
    const ov = maxwell.overlay!(fd.s as never, fd.p as never);
    const vals = [...ov.matchAll(/(-?\d+\.\d+)\\ \\mathrm\{V\}/g)].map((m) => m[1]);
    expect(vals.length).toBe(2);
    for (const v of vals) shows(fd.lines, v);
    for (const surf of ['flat', 'bulge']) {
      const { lines } = run(maxwell, { eq: 'ampere', surf });
      const a = ampereMaxwell(-0.6, surf === 'bulge' ? 'bulge' : 'flat');
      shows(lines, tn(a.circ * 1e6));
    }
    const gb = run(maxwell, { eq: 'gaussB' });
    shows(gb.lines, '0');
  });
});
