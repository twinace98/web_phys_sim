import { describe, expect, it } from 'vitest';
import { defaults } from '../src/core/params';
import { afterFirst, knobDir, polar, segments } from '../src/sims/ch33/polar';
import { MEDIA, acceptance, coreAngle, criticalAngle, malus, polarizerChain, reflectance, snell, wallIncidence } from '../src/sims/ch33/physics';
import { fibre, indexLabels, traceFibre, traceRays } from '../src/sims/ch33/refraction';
import { probe } from './stage-probe';

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

  it('alpha 80°, glass cladding: totally reflected at the cladding-air boundary (50.8° > 43.2°)', () => {
    const D = Math.PI / 180;
    const r = traceFibre({ alpha: 80, clad: '1.46' });
    const outer = r.hits.filter((h) => h.to === 'out');
    expect(outer.length).toBeGreaterThan(0);
    // n cos(angle to the axis) is conserved: sin(inc) in the cladding = 1.5 cos β / 1.46.
    const beta = Math.asin(Math.sin(80 * D) / 1.5);
    const inc = Math.asin((1.5 * Math.cos(beta)) / 1.46);
    expect(inc / D).toBeCloseTo(50.8, 1);
    for (const h of outer) {
      expect(h.inc).toBeCloseTo(inc, 9);
      expect(h.inc).toBeGreaterThan(criticalAngle(1.46, 1));
      expect(Number.isNaN(h.out)).toBe(true);
      // The reflected branch leaves the hit point back into the cladding.
      expect(r.escaped.some((s) => s.layer === 'clad' && Math.hypot(s.a.x - h.at.x, s.a.y - h.at.y) < 1e-9)).toBe(true);
    }
    expect(r.escaped.filter((s) => s.layer === 'out').length).toBe(0);
    // The cladding mode reaches the far end (x = 31, beyond the stage edge at 30).
    expect(Math.max(...r.escaped.map((s) => s.b.x))).toBeCloseTo(31, 9);
  });

  it('every α and cladding: Snell at every boundary, nothing leaves through the side into air', () => {
    for (const clad of ['1.46', '1.33', '1'])
      for (let alpha = 0; alpha <= 80; alpha++) {
        const r = traceFibre({ alpha, clad });
        for (const h of r.hits) {
          if (Number.isNaN(h.out)) expect(h.nFrom * Math.sin(h.inc)).toBeGreaterThan(h.nTo);
          else expect(h.nFrom * Math.sin(h.inc)).toBeCloseTo(h.nTo * Math.sin(h.out), 9);
          if (h.to === 'out') expect(Number.isNaN(h.out)).toBe(true);
        }
        for (const s of [...r.guided, ...r.escaped]) {
          expect(s.layer).not.toBe('out');
          for (const q of [s.a, s.b]) {
            expect(Math.abs(q.y)).toBeLessThanOrEqual(3.2 + 1e-9);
            expect(q.x).toBeGreaterThanOrEqual(6 - 1e-9);
            expect(q.x).toBeLessThanOrEqual(31 + 1e-9);
          }
        }
      }
  });

  it('a weak index step lets the ray refract out of the cladding with the Snell angle, to the stage edge', () => {
    const D = Math.PI / 180;
    const { segs, hits } = traceRays({ n1: 1.2, n2: 1.1, n0: 1 }, 80 * D);
    const leave = hits.filter((h) => h.to === 'out' && !Number.isNaN(h.out));
    expect(leave.length).toBeGreaterThan(0);
    for (const h of leave) expect(1.1 * Math.sin(h.inc)).toBeCloseTo(Math.sin(h.out), 9);
    const out = segs.filter((s) => s.layer === 'out');
    expect(out.length).toBeGreaterThan(0);
    for (const s of out) {
      const onEdge = Math.abs(Math.abs(s.b.y) - 6.2) < 1e-9 || Math.abs(s.b.x - 30) < 1e-9;
      expect(onEdge).toBe(true);
      // Direction matches the refraction angle at its start.
      const h = leave.find((k) => Math.hypot(k.at.x - s.a.x, k.at.y - s.a.y) < 1e-9)!;
      const ang = Math.atan2(s.b.x - s.a.x, Math.abs(s.b.y - s.a.y));
      expect(ang).toBeCloseTo(h.out, 9);
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
