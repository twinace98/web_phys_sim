// QA 2026-11-24, P3 (polish) for Ch 34–38: rounding ties, floors and thresholds in the Σ panel,
// prefixes, the periodic image of the wave packet, wording, colours and the narrow layouts.
import { describe, expect, it } from 'vitest';
import { defaults } from '../src/core/params';
import { fmt } from '../src/core/format';
import { readBack } from '../src/core/tex';
import { imageDistance } from '../src/sims/ch34/physics';
import { formulaLines as lensLines, lensScene, mirrorScene, tie } from '../src/sims/ch34/scene';
import ko34 from '../src/sims/ch34/i18n.ko.json';
import en34 from '../src/sims/ch34/i18n.en.json';
import ko35 from '../src/sims/ch35/i18n.ko.json';
import en35 from '../src/sims/ch35/i18n.en.json';
import { brightAt, fringeSpacing } from '../src/sims/ch35/physics';
import { graphRectNarrow, slitWorld } from '../src/sims/ch35/screen';
import { Y0 } from '../src/sims/wave2d/slits';
import ko36 from '../src/sims/ch36/i18n.ko.json';
import en36 from '../src/sims/ch36/i18n.en.json';
import { pairDiff, shownSources, singleSlit } from '../src/sims/ch36/single';
import { LOUPE_BELOW, formulaLines as phasorLines, loupeZoom, phasor } from '../src/sims/ch36/phasor';
import ko37 from '../src/sims/ch37/i18n.ko.json';
import en37 from '../src/sims/ch37/i18n.en.json';
import { movingPeriod, restPeriod, ticks } from '../src/sims/ch37/physics';
import { ROD_COLOR, SP_COLOR, clockLines, floorInputs } from '../src/sims/ch37/scene';
import { STRUCTS, diffractionScene, formulaLines as diffLines, lamSig, lambdaP, dyText } from '../src/sims/ch38/diffraction';
import { packet, psi, vGroup } from '../src/sims/ch38/physics';
import { REPEAT, drawWeight, wavePacket, xEndOf, xRangeOf } from '../src/sims/ch38/scene';

describe('Ch 34: an exact tie prints rounded half up, as the Σ arithmetic does', () => {
  it('i = pf/(p − f) is exact: p = 9, f = 5 gives 11.25, printed 11.3 in the readout and Σ', () => {
    expect(imageDistance(9, 5)).toBe(11.25);
    const p = { ...defaults(lensScene.params), p: 9, f: 5 };
    const i = lensScene.readouts!.find((r) => r.label === 'i')!;
    expect(fmt(i.value({ t: 0 }, p), 3)).toBe('11.3');
    const lines = lensLines('lens', p);
    expect(lines.some((l) => l.includes('= 11.3\\'))).toBe(true);
    expect(lines.join(' ')).not.toContain('11.2');
  });

  it('every slider pair: the printed i is the exact ratio pf/(p − f) rounded half up', () => {
    for (let p = 2; p <= 55; p += 0.5)
      for (let f = 5; f <= 30; f++)
        for (const F of [f, -f]) {
          if (p === F) continue;
          // Exact decimal arithmetic in units of 1/1000: the ratio N/D, N = 2pF·1000, D = 2(p − F).
          const N = Math.round(2 * p * F);
          const Dn = Math.round(2 * (p - F));
          const i = imageDistance(p, F);
          const printed = fmt(tie(i), 3);
          const digits = printed.replace('−', '').replace('.', '').length;
          const dec = printed.includes('.') ? printed.split('.')[1].length : 0;
          // Half up in magnitude at `dec` decimals, on integers: |N|·10^dec / |D|.
          const scaled = (BigInt(Math.abs(N)) * 10n ** BigInt(dec) * 2n + BigInt(Math.abs(Dn))) / (2n * BigInt(Math.abs(Dn)));
          const want = (Number(scaled) / 10 ** dec).toFixed(dec);
          expect(printed.replace('−', ''), `p = ${p}, f = ${F}`).toBe(want);
          expect(digits).toBeGreaterThanOrEqual(3);
        }
  });

  it('the plane mirror has two principal rays, and the text says so', () => {
    const p = { ...defaults(mirrorScene.params), kind: 'plane' };
    expect(p.kind).toBe('plane');
    expect(ko34['ch34.m.goal.rays']).toContain('평면거울 2개');
    expect(en34['ch34.m.goal.rays']).toContain('two for a plane mirror');
  });
});

describe('Ch 35: the ⓘ names the small angle, not D ≫ d, as what makes Δy = λD/d exact', () => {
  it('over the slider ranges the far-field form D tan θ₁ is within 2.1 %, λD/d up to 12 % short', () => {
    let far = 0;
    let small = 0;
    for (let d = 1.5; d <= 5.001; d += 0.5)
      for (const L of [400, 550, 700])
        for (const D of [12, 18, 25]) {
          const ex = brightAt(1, L / 1000, d, D);
          far = Math.max(far, Math.abs((D * Math.tan(Math.asin(L / 1000 / d))) / ex - 1));
          small = Math.max(small, 1 - fringeSpacing(L / 1000, D, d) / ex);
        }
    expect(far).toBeLessThan(0.021);
    expect(small).toBeGreaterThan(0.11);
    expect(small).toBeLessThan(0.12);
    for (const m of [ko35, en35]) expect(m['ch35.assume.scale']).toContain('\\lambda \\ll d');
    expect(ko35['ch35.assume.scale']).not.toContain('이때 $\\Delta y = \\lambda D/d$가 정확해짐');
  });

  it('narrow stage: the graph sits under the field, as tall as the screen, and the world is portrait', () => {
    for (const D of [12, 20, 25]) {
      const r = graphRectNarrow(D);
      expect(r.y1).toBeLessThan(Y0 - 3);
      expect(r.y1 - r.y0).toBeCloseTo(24, 9);
      expect(r.x1 - r.x0).toBeGreaterThan(10);
      const w = slitWorld(D, true);
      expect(w.y[1] - w.y[0]).toBeGreaterThan(1.6 * (w.x[1] - w.x[0]));
      const wide = slitWorld(D, false);
      expect(wide.x[1] - wide.x[0]).toBeGreaterThan(wide.y[1] - wide.y[0]);
    }
  });
});

describe('Ch 36: wording, tab title, phasor loupe', () => {
  it('tab title covers one and two slits', () => {
    expect(ko36['ch36.s.scene']).toBe('슬릿 회절');
    expect(en36['ch36.s.scene']).toBe('Slit diffraction');
  });

  it('default point: the pair differs by 0.47λ (the stage value), pairs run 0.47 to 0.53, mean 0.50', () => {
    const p = defaults(singleSlit.params);
    expect(fmt(pairDiff(p), 2)).toBe('0.47');
    const ys = shownSources(p.a);
    const lam = p.lambda / 1000;
    const r = (y: number) => Math.hypot(p.D, p.yp - y);
    const diffs = [0, 1, 2, 3, 4].map((k) => (r(ys[k + 5]) - r(ys[k])) / lam);
    expect(fmt(Math.max(...diffs), 2)).toBe('0.53');
    expect(fmt(diffs.reduce((a, b) => a + b, 0) / 5, 2)).toBe('0.50');
    for (const m of [ko36, en36]) {
      expect(m['ch36.s.obs.pair']).toContain('0.47λ');
      expect(m['ch36.s.obs.pair']).toContain('0.53λ');
      expect(m['ch36.s.obs.pair']).not.toContain('\\approx 0.5\\lambda');
    }
  });

  it('φ = 0 prints as 0° (readout) and 0^∘ (Σ)', () => {
    const p = { ...defaults(phasor.params), theta: 0 };
    const phi = phasor.readouts!.find((r) => r.label === '\\phi')!;
    expect(fmt(phi.value({ t: 0 }, p), 3)).toBe('0');
    expect(phasorLines(p)[1]).toMatch(/= 0\^\\circ$/);
  });

  it('loupe only for a chain under LOUPE_BELOW px, a whole magnification 2–12', () => {
    expect(loupeZoom(LOUPE_BELOW)).toBe(0);
    expect(loupeZoom(80)).toBe(0);
    expect(loupeZoom(31)).toBe(2);
    expect(loupeZoom(20)).toBe(4);
    expect(loupeZoom(1)).toBe(12);
    expect(loupeZoom(31 * 1.3, 1.3)).toBe(2);
  });
});

describe('Ch 37: floors, colours, proper time', () => {
  it('⌊t/Δt⌋: the floor of the printed quotient is the printed count, every step to 40 s', () => {
    for (const beta of [0, 0.5, 0.8, 0.9, 0.99])
      for (const P of [restPeriod(1), movingPeriod(1, beta)])
        for (let n = 0; n <= 4800; n++) {
          const t = n / 120;
          const k = ticks(t, P);
          const [a, b] = floorInputs(t, P, k);
          expect(Math.floor(readBack(a) / readBack(b) + 1e-9), `β = ${beta}, t = ${t}`).toBe(k);
        }
  });

  it('QA cases: t = 11.99 s, Δt₀ = 2 s, t just below Δt at β = 0.5, an exact tick at β = 0.8', () => {
    const l = clockLines(1439 / 120, 0.8);
    expect(l[3]).toContain('\\lfloor 11.99/2.00 \\rfloor = 5');
    const P = movingPeriod(1, 0.5);
    const t = 277 / 120;
    expect(t).toBeLessThan(P);
    const m = clockLines(t, 0.5)[4];
    expect(m).toMatch(/= 0$/);
    expect(m).not.toContain('2.31/2.31');
    expect(clockLines(1600 / 120, 0.8)[4]).toContain('\\lfloor 13.33/3.33 \\rfloor = 4');
    // Away from a tick: 3 figures as before.
    expect(clockLines(5, 0.8)[3]).toContain('\\lfloor 5.00/2.00 \\rfloor = 2');
  });

  it('rod world strip in its own colour, apart from the orange S′ axes', () => {
    expect(ROD_COLOR).not.toBe(SP_COLOR);
    expect(ko37['ch37.d.obs.contract']).toContain('초록 띠');
    expect(en37['ch37.d.obs.contract']).toContain('green strip');
  });

  it('proper time (고유 시간) and γ are defined where Δt₀ and γ first appear', () => {
    expect(ko37['ch37.c.goal.dilate']).toContain('고유 시간');
    expect(ko37['ch37.c.goal.dilate']).toContain('로런츠 인자');
    expect(en37['ch37.c.goal.dilate']).toContain('proper time');
    expect(en37['ch37.c.goal.dilate']).toContain('Lorentz factor');
  });
});

describe('Ch 38 diffraction: threshold figures, prefixes', () => {
  const base = defaults(diffractionScene.params);
  const crystal = STRUCTS.crystal;

  it('near λ = d the printed λ lies on the side of d that the printed ratio says', () => {
    for (let v = 3.3e6; v <= 3.46e6; v += 1e4) {
      const p = { ...base, ve: v };
      const lam = lambdaP(p);
      const sig = lamSig(lam, crystal.d);
      const shown = readBack(fmt(lam / 1e-9, sig, 0)) * 1e-9;
      expect(Math.sign(shown - crystal.d), `v = ${v}`).toBe(Math.sign(lam - crystal.d));
      const sinLine = diffLines(p).find((l) => l.startsWith('\\sin\\theta_1'))!;
      const ratio = readBack(/\\text\{nm\}\} = (-?[\d.]+)/.exec(sinLine)![1]);
      expect(Math.sign(ratio - 1)).toBe(Math.sign(lam / crystal.d - 1));
    }
    // QA cases: 4.36×10⁶ m/s far from it keeps 3 figures; 3.39×10⁶ prints 0.2146 nm and 0.998.
    expect(lamSig(lambdaP({ ...base, ve: 4.36e6 }), crystal.d)).toBe(3);
    const l = diffLines({ ...base, ve: 3.39e6 }).join(' ');
    expect(l).toContain('\\frac{0.2146\\ \\text{nm}}{0.215\\ \\text{nm}} = 0.998');
    const over = diffLines({ ...base, ve: 3.38e6 }).join(' ');
    expect(over).toContain('\\frac{0.2152\\ \\text{nm}}{0.215\\ \\text{nm}} = 1.001 > 1');
    const readout = diffractionScene.readouts!.find((r) => r.label === '\\lambda')!;
    expect(readout.format!(lambdaP({ ...base, ve: 3.39e6 }), {} as never, { ...base, ve: 3.39e6 })).toBe('0.2146 nm');
  });

  it('K with a prefix: 2.28 keV, not 2276 eV; slow neutrons in μeV', () => {
    const v = Math.sqrt((2 * 2276 * 1.602176634e-19) / 9.1093837015e-31);
    const l = diffLines({ ...base, ve: v })[1];
    expect(l).toMatch(/= 2\.\d\d\\ \\text\{keV\}$/);
    expect(l).not.toMatch(/\d{4}\\ \\text\{eV\}/);
    const n = diffLines({ ...base, part: 'neutron', vn: 100 })[1];
    expect(n).toMatch(/\\mu\\text\{eV\}/);
  });

  it('Δy beyond 1000 axis units takes its own prefix: 18.2 mm, not 18185 μm', () => {
    const g = STRUCTS.grating;
    expect(dyText(18185e-6, g)).toBe('18.2 mm');
    expect(dyText(31.2e-6, g)).toBe('31.2 μm');
    const p = { ...base, st: 'grating' };
    const lines = diffLines(p).join(' ');
    expect(lines).not.toMatch(/\d{4,}\\ \\mu\\text\{m\}/);
  });
});

describe('Ch 38 wave packet: the periodic copy stays off the stage', () => {
  it('end of the run (wide and narrow): the drawn |ψ|² at the edges is below 1 % of the peak', () => {
    for (const narrow of [false, true])
      for (const M of [4, 5, 9, 17, 33])
        for (const k0 of [5, 10, 15]) {
          const p = { ...defaults(wavePacket.params), M, k0 };
          const pk = packet(M, k0);
          const amp = pk.a.reduce((a, b) => a + b, 0);
          const [x0, x1] = xRangeOf(narrow);
          for (const t of [0, xEndOf(narrow) / vGroup(k0)]) {
            const xc = vGroup(k0) * t;
            let edge = 0;
            for (const x of t === 0 ? [x1 - 1, x1] : [x0, x0 + 1]) {
              const [a, b] = psi(pk, x, t);
              edge = Math.max(edge, (drawWeight(p, x, xc) ** 2 * (a * a + b * b)) / (amp * amp));
            }
            expect(edge, `M = ${M}, k0 = ${k0}, t = ${t}, narrow = ${narrow}`).toBeLessThan(0.01);
          }
        }
  });

  it('a sum that is no packet (M ≤ 3) is drawn in full; the window is one repeat', () => {
    const p = { ...defaults(wavePacket.params), M: 3 };
    expect(drawWeight(p, 40, 0)).toBe(1);
    const q = { ...defaults(wavePacket.params), M: 9 };
    expect(drawWeight(q, 0, 0)).toBe(1);
    expect(drawWeight(q, REPEAT / 2, 0)).toBe(0);
    expect(drawWeight(q, -REPEAT / 2 + 1.5, 0)).toBeCloseTo(0.5, 6);
  });
});
