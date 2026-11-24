// Review 2026-11-17 §4 (symbols for first-year students): every symbol on the stage, in a readout,
// in ⓘ or in Σ is defined in ⓘ, and one letter has one meaning per scene.
// Ch 5 primes, Ch 13 U_eff, Ch 15 ζ, Ch 16 h, Ch 19 p (pressure only), Ch 20 Ω (multiplicity) vs W (work).
import { describe, expect, it } from 'vitest';
import { defaults } from '../src/core/params';
import { Runner } from '../src/core/runner';
import type { Params, Scene } from '../src/core/types';
import { frames } from '../src/sims/ch05/frames';
import ko05 from '../src/sims/ch05/i18n.ko.json';
import en05 from '../src/sims/ch05/i18n.en.json';
import { orbitScene } from '../src/sims/ch13/orbit';
import ko13 from '../src/sims/ch13/i18n.ko.json';
import en13 from '../src/sims/ch13/i18n.en.json';
import { shm } from '../src/sims/ch15/shm';
import ko15 from '../src/sims/ch15/i18n.ko.json';
import en15 from '../src/sims/ch15/i18n.en.json';
import { reflect } from '../src/sims/ch16/reflect';
import ko16 from '../src/sims/ch16/i18n.ko.json';
import en16 from '../src/sims/ch16/i18n.en.json';
import { gasScene } from '../src/sims/ch19/gas';
import ko19 from '../src/sims/ch19/i18n.ko.json';
import en19 from '../src/sims/ch19/i18n.en.json';
import { expansionScene } from '../src/sims/ch20/expansion';
import { heatScene } from '../src/sims/ch20/heat';
import { carnotScene } from '../src/sims/ch20/carnot';
import ko20 from '../src/sims/ch20/i18n.ko.json';
import en20 from '../src/sims/ch20/i18n.en.json';
import { probe } from './stage-probe';
import expansionSrc from '../src/sims/ch20/expansion.ts?raw';

type Msgs = Record<string, string>;

/** ⓘ keys of a scene (goals, observe, assumptions). */
const infoKeys = (s: Scene) => [...s.info.goals, ...s.info.observe, ...(s.info.assumptions ?? [])];

/** Every string a student can read in the scene: ⓘ text and equations, Σ at defaults and after a run, readout and plot labels, stage texts. */
function sceneText(scene: Scene, msgs: Msgs, over: Params = {}): string[] {
  const p = { ...(defaults(scene.params) as Params), ...over };
  const out: string[] = [];
  out.push(...infoKeys(scene).map((k) => msgs[k]));
  out.push(...(scene.info.equations ?? []));
  out.push(...(scene.readouts ?? []).map((r) => r.label));
  out.push(...(scene.plots ?? []).map((pl) => pl.label));
  for (const spec of Object.values(scene.params)) {
    out.push(msgs[spec.label as string] ?? '');
    if (spec.desc) out.push(msgs[spec.desc as string] ?? '');
  }
  const r = new Runner(scene, p as never, 3);
  if (scene.formula) out.push(...scene.formula(r.state as never, r.params as never));
  out.push(...probe(scene, r.state as never, p as never, 1280, 800).marks.map((m) => m.text ?? ''));
  if (scene.time) {
    r.play();
    for (let i = 0; i < 400 && r.playing; i++) r.advance(scene.time.h);
    if (scene.formula) out.push(...scene.formula(r.state as never, r.params as never));
    out.push(...probe(scene, r.state as never, p as never, 1280, 800).marks.map((m) => m.text ?? ''));
  }
  return out;
}

function inBoth(key: string, ko: Msgs, en: Msgs): void {
  expect(ko[key], `ko ${key}`).toBeTruthy();
  expect(en[key], `en ${key}`).toBeTruthy();
}

describe('Ch 5 inertial frames: one symbol per quantity (QA 2026-11-24: readout a against Σ a\')', () => {
  it('ⓘ defines x, v, a in the chosen frame and a = a_G − a_0, in ko and en', () => {
    inBoth('ch05.f.assume.sym', ko05, en05);
    expect(frames.info.assumptions).toContain('ch05.f.assume.sym');
    for (const m of [ko05, en05] as Msgs[]) {
      const s = m['ch05.f.assume.sym'];
      for (const t of ['$x$', '$v$', '$a$', '$a_\\text{G}$', 'a = a_\\text{G} - a_0']) expect(s).toContain(t);
      expect(s).not.toMatch(/[xva]'/);
    }
  });

  it('train-frame observations and the Σ panel use a, as the readouts and the stage do', () => {
    for (const m of [ko05, en05] as Msgs[]) {
      expect(m['ch05.f.obs.uniform']).toContain('$a = 0$');
      expect(m['ch05.f.obs.accel']).toContain('$a = -a_0$');
    }
    const lines = frames.formula!(new Runner(frames, defaults(frames.params) as never, 1).state as never, defaults(frames.params) as never);
    expect(lines.some((l) => l.startsWith('a = a_\\text{G} - a_0'))).toBe(true);
    expect(lines.join(' ')).not.toMatch(/[av]'/);
    expect(frames.readouts!.map((r) => r.label)).toContain('a');
  });
});

describe('Ch 13 orbits: effective potential', () => {
  it('ⓘ gives U_eff(r) = −GMm/r + L²/(2mr²) with L the angular momentum, in ko and en', () => {
    inBoth('ch13.o.obs.ueff', ko13, en13);
    expect(orbitScene.info.observe).toContain('ch13.o.obs.ueff');
    for (const m of [ko13, en13] as Msgs[]) {
      expect(m['ch13.o.obs.ueff']).toContain('U_\\text{eff}(r) = -GMm/r + L^2/(2mr^2)');
      expect(m['ch13.o.obs.ueff']).toContain('L = mrv_\\perp');
      expect(m['ch13.o.obs.ueff']).toContain('E = U_\\text{eff}');
    }
  });

  it('no other L in the scene: L appears only in the U_eff line', () => {
    const msgs = ko13 as Msgs;
    const txt = sceneText(orbitScene, msgs, { ueff: true }).filter((s) => s !== msgs['ch13.o.obs.ueff']);
    for (const s of txt) expect(s, s).not.toMatch(/(^|[^A-Za-z\\])L([^A-Za-z]|$)/);
  });
});

describe('Ch 15 SHM: damping ratio ζ', () => {
  it('ⓘ defines ζ = b/(2√km) with F_d = −bv, the three regimes, and γ = b/2m of review page 108', () => {
    inBoth('ch15.assume.zeta', ko15, en15);
    expect(shm.info.assumptions).toContain('ch15.assume.zeta');
    for (const m of [ko15, en15] as Msgs[]) {
      const s = m['ch15.assume.zeta'];
      for (const t of ['\\zeta = b/(2\\sqrt{km})', 'F_d = -bv', '\\zeta < 1', '\\zeta = 1', '\\zeta > 1', '\\gamma = b/2m']) expect(s).toContain(t);
    }
  });

  it('the ζ slider stays (its removal is a pending decision)', () => {
    expect(shm.params.zeta.kind).toBe('number');
  });
});

describe('Ch 16 reflection: h', () => {
  it('ⓘ defines h as the incident wave shape, in ko and en; Σ and ⓘ use the same h(t − L/v)', () => {
    inBoth('ch16.assume.h', ko16, en16);
    expect(reflect.info.assumptions).toContain('ch16.assume.h');
    for (const m of [ko16, en16] as Msgs[]) {
      expect(m['ch16.assume.h']).toContain('h(t - x/v)');
      expect(m['ch16.assume.h']).toContain('h(t - L/v)');
    }
    expect(reflect.info.equations!.some((e) => e.includes('h(t - x/v)'))).toBe(true);
    for (const mode of ['pulse', 'wave']) {
      const p = { ...defaults(reflect.params), mode } as never;
      const lines = reflect.formula!(new Runner(reflect, p, 1).state as never, p);
      expect(lines.some((l) => l.startsWith('h(t - L/v) = '))).toBe(true);
    }
  });
});

describe('Ch 19 kinetic theory: p is the pressure only', () => {
  it('no momentum p (Δp_x, p_x) anywhere in the scene; one bounce is ΔJ = 2mv_x', () => {
    for (const msgs of [ko19, en19] as Msgs[]) {
      for (const s of sceneText(gasScene, msgs)) expect(s, s).not.toMatch(/p_x|p_\{x\}|\\Delta p|Δp|Δ\*p\*/);
    }
    expect(gasScene.info.equations).toContain('\\Delta J = 2mv_x');
  });

  it('ⓘ links the 2D formula to the textbook 3D one, in ko and en', () => {
    inBoth('ch19.assume.3d', ko19, en19);
    expect(gasScene.info.assumptions).toContain('ch19.assume.3d');
    for (const m of [ko19, en19] as Msgs[]) {
      expect(m['ch19.assume.3d']).toContain('pA = \\tfrac12 Nm\\overline{v^2} = NkT');
      expect(m['ch19.assume.3d']).toContain('pV = \\tfrac13 Nm\\overline{v^2} = NkT');
    }
  });
});

describe('Ch 20: Ω for multiplicity, W for work', () => {
  const W = /(^|[^A-Za-z\\])W([^A-Za-z]|$)|\*W\*/;

  it('the statistical scenes use Ω only: no W in ⓘ, Σ, readouts, plots or stage texts', () => {
    for (const msgs of [ko20, en20] as Msgs[]) {
      for (const scene of [expansionScene, heatScene] as Scene[]) {
        const txt = sceneText(scene, msgs).filter((s) => s !== msgs['ch20.assume.omegaW']);
        for (const s of txt) expect(s, `${scene.id}: ${s}`).not.toMatch(W);
      }
      for (const N of [4, 10, 100, 1000]) {
        const txt = sceneText(expansionScene, msgs, { N });
        expect(txt.some((s) => s.includes('\\Omega'))).toBe(true);
      }
    }
    expect(expansionScene.readouts!.map((r) => r.label)).toContain('\\Omega');
    expect(expansionScene.plots!.find((pl) => pl.id === 'S')!.label).toBe('\\Delta S/k = \\ln\\Omega');
  });

  it('the chart axis of the expansion tab is labelled Ω, not W', () => {
    const src = expansionSrc;
    expect(src).toContain("yLabel: small ? 'Ω' : 'Ω / Ω_{max}'");
    expect(src).not.toMatch(/'\*W\*/);
  });

  it('both statistical scenes carry the line "Ω: 경우의 수 (교재의 W)" in ko and en', () => {
    inBoth('ch20.assume.omegaW', ko20, en20);
    expect(expansionScene.info.assumptions).toContain('ch20.assume.omegaW');
    expect(heatScene.info.assumptions).toContain('ch20.assume.omegaW');
    expect((ko20 as Msgs)['ch20.assume.omegaW']).toContain('경우의 수 (미시상태 수, 교재의 $W$)');
    expect((en20 as Msgs)['ch20.assume.omegaW']).toContain("the textbook's $W$");
  });

  it('the Carnot scene keeps W for work and has no Ω', () => {
    for (const msgs of [ko20, en20] as Msgs[]) {
      const txt = sceneText(carnotScene, msgs);
      expect(txt.some((s) => W.test(s))).toBe(true);
      for (const s of txt) expect(s, s).not.toMatch(/\\Omega|Ω/);
    }
  });
});
