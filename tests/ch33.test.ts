import { describe, expect, it } from 'vitest';
import { defaults } from '../src/core/params';
import { afterFirst, knobDir, polar, segments } from '../src/sims/ch33/polar';
import { MEDIA, acceptance, coreAngle, criticalAngle, malus, polarizerChain, reflectance, snell, wallIncidence } from '../src/sims/ch33/physics';
import { JACKET_PX, arrivedFraction, dragAngle, fibre, indexLabels, refraction, traceFibre, traceRays } from '../src/sims/ch33/refraction';
import { ProbeDraw, probe } from './stage-probe';

describe('ch33 fibre index labels (round 2)', () => {
  it('phone: stacked above the fibre with leaders; desktop: beside the layers', () => {
    const p = defaults(fibre.params);
    for (const [w, h, mode] of [
      [390, 630, 'leader'],
      [1280, 704, 'beside'],
    ] as const) {
      const g = probe(fibre, { t: 0 }, p, w, h);
      expect(indexLabels(g, { n1: 1.5, n2: 1.46, n0: 1 })).toBe(mode);
      const texts = g.marks.filter((m) => m.kind === 'text' && /n\*_\{[12]\}/.test(m.text ?? ''));
      expect(texts.length).toBe(4); // drawn by the scene and by the call above
      const [a, b] = texts;
      // The two labels at least one text line apart, and on the stage.
      expect(Math.abs(a.y - b.y)).toBeGreaterThanOrEqual(16);
      for (const m of texts) expect(m.x).toBeGreaterThanOrEqual(0);
      if (mode === 'leader') {
        // Both rows above the fibre's top edge, clear of the input ray on the axis and its knob.
        const [, yTop] = g.vp.toPx(0, 3.2);
        for (const m of texts) expect(m.y).toBeLessThan(yTop - 8);
      }
    }
  });
});

const deg = Math.PI / 180;

describe('ch33 polarizers', () => {
  it('first polarizer halves unpolarized light, then Malus', () => {
    for (const th of [0, 30, 45, 60, 90]) {
      const [I1, I2] = polarizerChain(1, [0, th * deg]);
      expect(I1).toBeCloseTo(0.5, 12);
      expect(I2).toBeCloseTo(malus(0.5, th * deg), 12);
      expect(afterFirst(2, th * deg)).toBeCloseTo(I2 / I1, 12);
    }
    expect(polarizerChain(1, [0, 90 * deg])[1]).toBeCloseTo(0, 12);
  });

  it('a 45° sheet between crossed polarizers passes I0/8', () => {
    const I = polarizerChain(1, [0, 45 * deg, 90 * deg]);
    expect(I[2]).toBeCloseTo(1 / 8, 12);
    expect(segments({ n: 3, theta: 45 }).at(-1)).toBeCloseTo(1 / 8, 12);
    expect(segments({ n: 3, theta: 0 }).at(-1)).toBeCloseTo(0, 12);
    expect(afterFirst(3, 45 * deg)).toBeCloseTo(0.25, 12);
  });
});

describe('ch33 refraction', () => {
  it("Snell's law and its reverse path", () => {
    const n1 = MEDIA.air;
    const n2 = MEDIA.glass;
    for (const th of [10, 30, 60, 85]) {
      const t2 = snell(n1, n2, th * deg);
      expect(n1 * Math.sin(th * deg)).toBeCloseTo(n2 * Math.sin(t2), 12);
      expect(snell(n2, n1, t2)).toBeCloseTo(th * deg, 10);
    }
  });

  it('critical angles: glass 41.8°, water 48.8°, diamond 24.4°', () => {
    expect(criticalAngle(1.5, 1) / deg).toBeCloseTo(41.81, 2);
    expect(criticalAngle(1.33, 1) / deg).toBeCloseTo(48.75, 2);
    expect(criticalAngle(2.42, 1) / deg).toBeCloseTo(24.41, 2);
    expect(criticalAngle(1, 1.5)).toBeNaN();
    expect(snell(1.5, 1, 42 * deg)).toBeNaN();
  });

  it('Fresnel reflectance: 4 % at normal incidence on glass, 100 % beyond the critical angle', () => {
    expect(reflectance(1, 1.5, 0)).toBeCloseTo(0.04, 10);
    expect(reflectance(1.5, 1, 0)).toBeCloseTo(0.04, 10);
    expect(reflectance(1.5, 1, 50 * deg)).toBe(1);
    expect(reflectance(1.5, 1, 41.5 * deg)).toBeGreaterThan(0.5);
    // Rises monotonically toward the critical angle.
    let last = 0;
    for (let th = 0; th < 41.8; th += 2) {
      const R = reflectance(1.5, 1, th * deg);
      expect(R).toBeGreaterThanOrEqual(last - 0.03);
      last = Math.max(last, R);
    }
  });
});

describe('ch33 optical fibre', () => {
  const f = { n1: 1.5, n2: 1.46, n0: 1 };
  it('acceptance angle: sin α_max = √(n1² − n2²)', () => {
    expect(Math.sin(acceptance(f))).toBeCloseTo(Math.sqrt(1.5 ** 2 - 1.46 ** 2), 12);
    expect(acceptance({ n1: 1.5, n2: 1, n0: 1 })).toBeCloseTo(Math.PI / 2, 12);
    const a = acceptance(f);
    expect(wallIncidence(f, a)).toBeCloseTo(criticalAngle(1.5, 1.46), 10);
    expect(Math.sin(a)).toBeCloseTo(1.5 * Math.sin(coreAngle(f, a)), 12);
  });

  it('guided below the acceptance angle, leaking above it', () => {
    const ok = traceFibre({ alpha: 15, clad: '1.46' });
    expect(ok.escaped.length).toBe(0);
    expect(ok.guided.length).toBeGreaterThanOrEqual(2);
    // No loss along the core after the entry face.
    expect(ok.guided.at(-1)!.I).toBeCloseTo(ok.guided[0].I, 12);
    const leak = traceFibre({ alpha: 35, clad: '1.46' });
    expect(leak.escaped.length).toBeGreaterThan(0);
    expect(traceFibre({ alpha: 60, clad: '1' }).escaped.length).toBe(0);
  });

  it('alpha 80°, glass cladding: light reaching the outer cladding edge is absorbed by the jacket', () => {
    const r = traceFibre({ alpha: 80, clad: '1.46' });
    const t = traceRays({ n1: 1.5, n2: 1.46, n0: 1 }, (80 * Math.PI) / 180);
    expect(t.absorbed.length).toBeGreaterThan(0);
    // Before the fix the cladding-air boundary reflected it totally (50.8° > 43.2°) and the
    // cladding mode reached the far end. Now every cladding segment ends on the jacket or the core wall.
    for (const s of r.escaped) {
      expect(s.layer).toBe('clad');
      expect(Math.abs(s.b.x - 31) > 1e-9).toBe(true);
    }
    for (const h of r.hits) expect(Math.abs(h.at.y)).toBeCloseTo(1.3, 9);
    for (const q of t.absorbed) expect(Math.abs(q.at.y)).toBeCloseTo(3.2, 9);
  });

  it('every α and cladding: Snell at the core wall, rays stay inside the jacket, energy balance', () => {
    for (const clad of ['1.46', '1.33', '1'])
      for (let alpha = 0; alpha <= 80; alpha += 0.5) {
        const r = traceFibre({ alpha, clad });
        for (const h of r.hits) {
          if (Number.isNaN(h.out)) expect(h.nFrom * Math.sin(h.inc)).toBeGreaterThan(h.nTo);
          else expect(h.nFrom * Math.sin(h.inc)).toBeCloseTo(h.nTo * Math.sin(h.out), 9);
        }
        for (const s of [...r.guided, ...r.escaped])
          for (const q of [s.a, s.b]) {
            expect(Math.abs(q.y)).toBeLessThanOrEqual(3.2 + 1e-9);
            expect(q.x).toBeGreaterThanOrEqual(6 - 1e-9);
            expect(q.x).toBeLessThanOrEqual(31 + 1e-9);
          }
        // Arrived + absorbed + dropped weak branches = light entering the core.
        const t = traceRays({ n1: 1.5, n2: Number(clad), n0: 1 }, (alpha * Math.PI) / 180);
        const inCore = 1 - reflectance(1, 1.5, (alpha * Math.PI) / 180);
        const absorbed = t.absorbed.reduce((a, q) => a + q.I, 0);
        expect(t.arrived + absorbed).toBeLessThanOrEqual(inCore + 1e-9);
        expect(t.arrived + absorbed).toBeGreaterThan(inCore - 0.05);
        const am = (acceptance({ n1: 1.5, n2: Number(clad), n0: 1 }) * 180) / Math.PI;
        if (alpha <= am) {
          expect(t.absorbed.length).toBe(0);
          expect(arrivedFraction({ alpha, clad })).toBeCloseTo(inCore, 12);
        }
      }
  });

  it('review case: beyond the acceptance angle the arriving fraction falls (leak = loss)', () => {
    const D = Math.PI / 180;
    const f = { n1: 1.5, n2: 1.46, n0: 1 };
    const am = acceptance(f) / D; // 20.1°
    // Wall incidence 0.94 θc (72.1°): before the fix the light leaking at every wall reached
    // the far end through the cladding, so the total arriving there stayed at about 0.95.
    const th = 0.94 * criticalAngle(1.5, 1.46);
    const alpha = Math.asin(1.5 * Math.cos(th)) / D;
    expect(alpha).toBeGreaterThan(am);
    const inCore = 1 - reflectance(1, 1.5, alpha * D);
    const got = arrivedFraction({ alpha, clad: '1.46' });
    expect(got).toBeLessThan(0.5 * inCore);
    // Guided below the acceptance angle: all of the core light arrives.
    expect(arrivedFraction({ alpha: 15, clad: '1.46' })).toBeCloseTo(1 - reflectance(1, 1.5, 15 * D), 12);
    // Monotone loss past the acceptance angle, for glass and water claddings.
    for (const clad of ['1.46', '1.33']) {
      const a0 = acceptance({ n1: 1.5, n2: Number(clad), n0: 1 }) / D;
      let prev = Infinity;
      for (let a = Math.ceil(a0 + 1); a <= 80; a += 5) {
        const v = arrivedFraction({ alpha: a, clad }) / (1 - reflectance(1, 1.5, a * D));
        expect(v).toBeLessThan(prev + 1e-9);
        prev = v;
      }
      expect(prev).toBeLessThan(0.05);
    }
  });

  it('the jacket is drawn on both outer cladding edges, at every cladding option', () => {
    for (const clad of ['1.46', '1.33', '1'])
      for (const [w, h] of [
        [1280, 800],
        [390, 844],
      ]) {
        const polys: { pts: { x: number; y: number }[]; fill?: string }[] = [];
        const g = new (class extends ProbeDraw {
          polygon(pts: { x: number; y: number }[], st?: { fill?: string }): void {
            polys.push({ pts, fill: st?.fill });
          }
        })(w, h);
        const p = { ...defaults(fibre.params), clad };
        g.vp.fit(fibre.world(p), w, h);
        fibre.draw(g, { t: 0 }, p, { t: 0, cursorT: 0, scrubbing: false, lecture: false });
        const jackets = polys.filter((pl) => pl.fill === '#3a3a3a');
        expect(jackets.length).toBe(2);
        for (const j of jackets) {
          const ys = j.pts.map((q) => Math.abs(q.y));
          // From the outer cladding edge outward, JACKET_PX wide on screen.
          expect(Math.min(...ys)).toBeCloseTo(3.2, 9);
          expect((Math.max(...ys) - 3.2) / g.px(1)).toBeCloseTo(JACKET_PX, 9);
        }
      }
  });
});

describe('ch33 review fixes', () => {
  const D = Math.PI / 180;
  it('the polarizer knob stays on the upper half of the rim at every angle (clear of the P label)', () => {
    for (let th = 0; th <= 180; th += 1) {
      const k = knobDir(th * D);
      expect(k.y).toBeGreaterThanOrEqual(-1e-9);
      // Still on the transmission axis: parallel to (sin θ, cos θ).
      expect(Math.abs(k.x * Math.cos(th * D) - k.y * Math.sin(th * D))).toBeLessThan(1e-12);
    }
  });

  it('three polarizers: I_3 = I_0 sin²2θ / 8 as in the info equation', () => {
    for (const th of [0, 10, 30, 45, 60, 90, 135, 180]) {
      const out = segments({ n: 3, theta: th }).at(-1)!;
      expect(out).toBeCloseTo(Math.sin(2 * th * D) ** 2 / 8, 12);
    }
    expect(polar.info.equations!.some((e) => e.includes('\\tfrac18 I_0'))).toBe(true);
  });

  it('readouts are finite over n and θ', () => {
    for (const n of [2, 3])
      for (const theta of [0, 1, 37, 90, 133, 180])
        for (const r of polar.readouts!) expect(Number.isFinite(r.value({ t: 0 }, { ...defaults(polar.params), n, theta }))).toBe(true);
  });
});

describe('Ch 33 refraction: smooth approach to total internal reflection', () => {
  const TC = (criticalAngle(1.5, 1.0) * 180) / Math.PI; // 41.81°

  it('the angle sliders step by 0.1°, so the last step before θc leaves a faint transmitted ray', () => {
    expect((refraction.params.theta as any).step).toBeLessThanOrEqual(0.1);
    expect((fibre.params.alpha as any).step).toBeLessThanOrEqual(0.1);
    const T = (deg: number) => 1 - reflectance(1.5, 1.0, (deg * Math.PI) / 180);
    // Before: 41° → 42° jumped from T = 0.62 to 0.
    expect(T(41)).toBeCloseTo(0.62, 2);
    const last = Math.floor(TC * 10) / 10; // 41.8°
    expect(T(last)).toBeLessThan(0.12);
    expect(T(last - 0.1)).toBeLessThan(0.32);
  });

  it('dragging near θc lands exactly on it: grazing ray, θ2 = 90°, R = 1', () => {
    expect(dragAngle(TC - 0.25, TC)).toBe(TC);
    expect(dragAngle(TC + 0.2, TC)).toBe(TC);
    expect(dragAngle(35.04, TC)).toBe(35);
    expect(dragAngle(41.46, TC)).toBe(41.5);
    expect(dragAngle(60, NaN)).toBe(60);
    const th2 = snell(1.5, 1.0, (TC * Math.PI) / 180);
    expect(Number.isNaN(th2)).toBe(false);
    expect((th2 * 180) / Math.PI).toBeCloseTo(90, 4);
    expect(reflectance(1.5, 1.0, (TC * Math.PI) / 180)).toBeCloseTo(1, 6);
    // Every TIR pair: snell at its own critical angle is the grazing ray, not NaN.
    for (const [a, b] of [[1.33, 1], [2.42, 1], [1.5, 1.33], [2.42, 1.5]]) {
      const tc = criticalAngle(a, b);
      expect(snell(a, b, tc)).toBeCloseTo(Math.PI / 2, 4);
      expect(Number.isNaN(snell(a, b, tc + 1e-6))).toBe(true);
    }
  });
});
