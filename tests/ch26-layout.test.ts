// Ch 26 stage on a phone (review 2026-11-20 §2): the wire and its electrons must be readable.
import { describe, expect, it } from 'vitest';
import { defaults } from '../src/core/params';
import { Runner } from '../src/core/runner';
import type { Vec2 } from '../src/core/types';
import { heightOf } from '../src/sims/ch26/physics';
import { COMPACT_BELOW, R_EL_COMPACT, conduction, fullScale, layoutOf } from '../src/sims/ch26/scene';
import { ProbeDraw, offStage } from './stage-probe';

type Dot = { x: number; y: number; r: number; fill: string };
type Poly = { pts: [number, number][]; fill?: string };

/** Probe that also records circles and polygons in stage px. */
class DotProbe extends ProbeDraw {
  dots: Dot[] = [];
  polys: Poly[] = [];
  circle(c: Vec2, rPx: number, st: { fill?: string } = {}): void {
    const [x, y] = this.vp.toPx(c.x, c.y);
    this.dots.push({ x, y, r: rPx, fill: String(st.fill ?? '') });
  }
  polygon(pts: Vec2[], st: { fill?: string } = {}): void {
    this.polys.push({ pts: pts.map((q) => this.vp.toPx(q.x, q.y)), fill: st.fill });
  }
}

/** Stage sizes [CSS px] measured in the browser: 390×844, 360×740 phones, 1280×800 desktop, 768×1024 tablet. */
const PHONE = [390, 253] as const;
const SMALL = [360, 222] as const;
const DESK = [768, 642] as const;
const TABLET = [461, 838] as const;

function drawAt(p: ReturnType<typeof defaults>, w: number, h: number, secs = 3): DotProbe {
  const run = new Runner(conduction, p as never, 7);
  run.play();
  run.advance(secs);
  const g = new DotProbe(w, h);
  g.vp.fit(conduction.world(p as never), w, h);
  conduction.draw(g, run.state, p as never, { t: run.state.t, cursorT: run.state.t, scrubbing: false, lecture: false });
  return g;
}

const wireBox = (g: DotProbe) => {
  const xs = g.polys[0].pts.map((q) => q[0]);
  const ys = g.polys[0].pts.map((q) => q[1]);
  return { x0: Math.min(...xs), x1: Math.max(...xs), y0: Math.min(...ys), y1: Math.max(...ys) };
};
/** Electrons drawn in the wire (the key's dot sits in the top 25 px; the tracer is 3 px or more). */
const electrons = (g: DotProbe) => g.dots.filter((d) => d.fill === 'negative' && d.y > 25 && d.r < 3);

describe('ch26 compact stage on a phone (review 2026-11-20)', () => {
  it('review case 390×844: the old layout drew the 4 cm wire 110 × 49 px with 1.1 px electrons', () => {
    const [w, h] = PHONE;
    expect(fullScale(w, h)).toBeCloseTo(27.4, 1);
    expect(fullScale(w, h)).toBeLessThan(COMPACT_BELOW);
    const lay = layoutOf(w, h, 1);
    expect(lay.compact).toBe(true);
    // Now 51 px per cm: 204 × 92 px, electrons 2.2 px radius.
    expect(lay.scale).toBeCloseTo(51, 0);
    const g = drawAt(defaults(conduction.params), w, h);
    const b = wireBox(g);
    expect(b.x1 - b.x0).toBeGreaterThan(0.5 * w);
    expect(b.y1 - b.y0).toBeCloseTo(heightOf(2) * lay.scale, 0);
    const el = electrons(g);
    expect(el.length).toBeGreaterThan(100);
    for (const d of el) expect(d.r).toBeGreaterThanOrEqual(R_EL_COMPACT);
  });

  it('desktop 1280×800 and tablet 768×1024 keep the full layout (wire above the chart)', () => {
    for (const [w, h] of [DESK, TABLET]) {
      const lay = layoutOf(w, h, 1);
      expect(lay.compact).toBe(false);
      expect(lay.scale).toBe(fullScale(w, h));
    }
    expect(fullScale(...DESK)).toBeCloseTo(75, 0);
    // Desktop drawing: wire from x = 0 to L at 75 px per cm, electrons 2.6 px.
    const g = drawAt(defaults(conduction.params), ...DESK);
    const b = wireBox(g);
    expect((b.x1 - b.x0) / 4).toBeCloseTo(fullScale(...DESK), 6);
    for (const d of electrons(g)) expect(d.r).toBeCloseTo(2.6, 1);
  });

  it('sweep: every stage size × control extreme keeps text on stage and the wire clear of the chart', () => {
    const base = defaults(conduction.params);
    const cases = [];
    for (const V of [0, 0.7, 1.5]) for (const T of [200, 450]) for (const L of [2, 4, 4.5, 6]) for (const A of [1, 2, 3]) cases.push({ ...base, V, T, L, A });
    for (const [w, h] of [PHONE, SMALL, DESK, TABLET]) {
      const lay = layoutOf(w, h, 1);
      for (const p of cases) {
        const g = drawAt(p, w, h, 2.5);
        expect(offStage(g), `${w}×${h} ${JSON.stringify(p)}`).toEqual([]);
        const b = wireBox(g);
        expect(b.x0).toBeGreaterThan(0);
        expect(b.x1).toBeLessThan(w);
        expect(b.y0).toBeGreaterThan(25);
        expect(b.y1).toBeLessThan(h);
        if (!lay.compact) continue;
        // Wire, its electrons and labels stay left of the chart column; chart texts stay right of it.
        expect(b.x1).toBeLessThan(lay.keyRight);
        // Dots past a cut end (within 6 px) are clipped by the outline on the canvas.
        for (const d of electrons(g)) expect(d.x).toBeLessThan(b.x1 + 7);
        for (const m of g.marks.filter((q) => q.kind === 'text' && /^\d|mA|\(V\)/.test(q.text ?? ''))) expect(m.x).toBeGreaterThan(lay.keyRight);
        for (const d of electrons(g)) expect(d.r).toBeGreaterThanOrEqual(R_EL_COMPACT);
        // Whole wire up to the default length; a longer one is cropped around the counting section.
        const cx = (b.x0 + b.x1) / 2;
        expect(Math.abs(cx - lay.cx)).toBeLessThan(p.L > 4 ? 3.5 : 1e-6); // wavy cut ends: ±3 px
        if (p.L <= 4) expect(b.x1 - b.x0).toBeCloseTo(p.L * lay.scale, 6);
        else expect(b.x1 - b.x0).toBeLessThan(p.L * lay.scale);
      }
    }
  });

  it('the shell viewport is handed back unchanged after a compact draw', () => {
    const [w, h] = PHONE;
    const g = drawAt(defaults(conduction.params), w, h);
    const ref = new ProbeDraw(w, h);
    ref.vp.fit(conduction.world(defaults(conduction.params) as never), w, h);
    expect(g.vp.scale).toBe(ref.vp.scale);
    expect(g.vp.toPx(1, 1)).toEqual(ref.vp.toPx(1, 1));
  });
});
