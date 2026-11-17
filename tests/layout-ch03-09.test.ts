// Layout regressions from the parameter-sweep screenshots (Ch 3, 4, 5, 6, 9): label overlaps,
// tiny bodies and arrows, on the desktop stage and on a 390 px phone stage.
import { afterEach, describe, expect, it } from 'vitest';
import { defaults } from '../src/core/params';
import type { Params, Scene, Vec2 } from '../src/core/types';
import { segHitsBox, type Box } from '../src/sims/ch03/labels';
import { sumScene } from '../src/sims/ch03/scene';
import { relative } from '../src/sims/ch04/relative';
import { projectile } from '../src/sims/ch04/scene';
import { frames } from '../src/sims/ch05/frames';
import { friction } from '../src/sims/ch06/friction';
import { puckScene } from '../src/sims/ch09/puck';
import { track } from '../src/sims/ch09/track';
import { ProbeDraw } from './stage-probe';

/** ProbeDraw that also keeps polygons and circles in canvas px. */
class ShapeProbe extends ProbeDraw {
  readonly polys: [number, number][][] = [];
  readonly circles: { x: number; y: number; r: number }[] = [];
  polygon(pts: Vec2[]): void {
    this.polys.push(pts.map((q) => this.vp.toPx(q.x, q.y)));
  }
  circle(c: Vec2, r: number): void {
    const [x, y] = this.vp.toPx(c.x, c.y);
    this.circles.push({ x, y, r });
  }
}

function run<P extends Params, S extends { t: number }>(scene: Scene<P, S>, over: Partial<P>, t: number, w: number, h: number) {
  const p = { ...defaults(scene.params), ...over } as P;
  const s = scene.init(p, { next: () => 0.5 } as never);
  const dt = scene.time?.h ?? 1;
  while (scene.step && s.t < t - 1e-9) {
    const before = s.t;
    scene.step(s, dt, p);
    if (s.t === before) break;
  }
  const g = new ShapeProbe(w, h);
  g.vp.fit(scene.world(p), w, h);
  scene.draw(g, s, p, { t: s.t, cursorT: s.t, scrubbing: false, lecture: false });
  return { g, p, s };
}

const texts = (g: ProbeDraw, re: RegExp) => g.marks.filter((m) => m.kind === 'text' && re.test(m.text ?? ''));
/** Text box for a middle-baseline label (13 px font). */
const midBox = (m: { x: number; y: number; w: number }): Box => ({ x0: m.x, x1: m.x + m.w, y0: m.y - 8, y1: m.y + 8 });
const overlap = (a: Box, b: Box) => a.x0 < b.x1 && b.x0 < a.x1 && a.y0 < b.y1 && b.y0 < a.y1;
const bbox = (pts: [number, number][]): Box => ({
  x0: Math.min(...pts.map((q) => q[0])),
  x1: Math.max(...pts.map((q) => q[0])),
  y0: Math.min(...pts.map((q) => q[1])),
  y1: Math.max(...pts.map((q) => q[1])),
});

const win = globalThis as unknown as { window?: unknown };
function phone(on: boolean): void {
  if (on) win.window = { matchMedia: () => ({ matches: true }) };
  else delete win.window;
}
afterEach(() => phone(false));

describe('ch04 projectile labels', () => {
  it('v and v_x labels never stack when the two arrows meet on the x axis', () => {
    for (const [theta, t] of [
      [0, 0],
      [3, 0],
      [3, 0.2],
      [8, 0],
    ] as const) {
      for (const [w, h] of [
        [390, 250],
        [760, 680],
      ] as const) {
        const { g } = run(projectile, { theta, h: 0 }, t, w, h);
        const v = texts(g, /^\*v\*$/);
        const vx = texts(g, /^\*v\*_\{\*x\*\}$/);
        expect(v.length).toBe(1);
        expect(vx.length).toBe(1);
        expect(overlap(midBox(v[0]), midBox(vx[0])), `θ = ${theta}, t = ${t}, ${w}×${h}`).toBe(false);
      }
    }
  });

  it('y tick labels end at least 7 px left of the y-shadow dot (radius 6.5 px)', () => {
    const { g } = run(projectile, { h: 40 }, 1.2, 390, 250);
    const ticks = texts(g, /^\d+$/).filter((m) => m.text !== '0');
    const [ax] = g.vp.toPx(0, 0);
    const yTicks = ticks.filter((m) => m.x + m.w < ax);
    expect(yTicks.length).toBeGreaterThan(2);
    for (const m of yTicks) expect(ax - (m.x + m.w)).toBeGreaterThanOrEqual(13);
  });
});

describe('ch04 relative: ground frame on top, water frame below', () => {
  const W = 20;
  const CASES = [{}, { heading: 0 }, { heading: 60 }, { heading: 60, vb: 1, u: 1.5 }, { heading: 0, vb: 1, u: 1.5 }, { vb: 3, heading: 60 }, { u: 0 }, { vb: 1 }];
  const SIZES = [
    [1280, 690],
    [390, 590],
  ] as const;
  /** Water band [y top, y bottom] of each panel: polygons 0 and 2 are the water, 1 and 3 the boats. */
  const band = (g: ShapeProbe, i: 0 | 1) => {
    const b = bbox(g.polys[2 * i]);
    return [b.y0, b.y1] as const;
  };

  it('both panels use one scale; the ground panel sits above the water panel', () => {
    for (const [w, h] of SIZES) {
      for (const over of CASES) {
        const { g } = run(relative, over, 0, w, h);
        const [t0, b0] = band(g, 0);
        const [t1, b1] = band(g, 1);
        expect(b0 - t0, JSON.stringify(over)).toBeCloseTo(b1 - t1, 6);
        expect(b0).toBeLessThan(t1);
        // The river takes at least 45 % of its panel height (30 % on a phone, below the formula panel).
        expect(b0 - t0).toBeGreaterThan(((h - 2 * 12 - 14) / 2) * (w < 600 ? 0.3 : 0.45));
        const titles = g.marks.filter((m) => m.kind === 'text' && /^ch04\.r\.frame\.|^(Ground|Water|지면 기준|물 기준)$/.test(m.text ?? ''));
        expect(titles.length).toBe(2);
      }
    }
  });

  it('when the whole crossing fits, the start lines up in both panels and the boats differ by u·t', () => {
    const p = { ...defaults(relative.params) };
    const t = 6;
    const { g } = run(relative, {}, t, 1280, 690);
    const b0 = bbox(g.polys[1]);
    const b1 = bbox(g.polys[3]);
    const [t0, bt0] = band(g, 0);
    const s = (bt0 - t0) / W; // px per m
    expect((b0.x0 + b0.x1) / 2 - (b1.x0 + b1.x1) / 2).toBeCloseTo(p.u * t * s, 3);
  });

  it('boats inside their panels, labels apart from each other, the boats and the frame titles', () => {
    for (const [w, h] of SIZES) {
      for (const over of CASES) {
        const p = { ...defaults(relative.params), ...over };
        const T = (relative.time!.tEnd as (q: Params) => number)(p);
        for (const t of [0, 1.2, 0.5 * T, T]) {
          const { g } = run(relative, over, t, w, h);
          const tag = `${w}×${h} ${JSON.stringify(over)} t = ${t.toFixed(1)}`;
          const boats = [bbox(g.polys[1]), bbox(g.polys[3])];
          for (const b of boats) {
            expect(b.x0, tag).toBeGreaterThan(0);
            expect(b.x1, tag).toBeLessThan(w);
          }
          const labels = [
            ...texts(g, /^\*v\*_\{(BW|WG|BG)\}$/).map(midBox),
            ...g.marks.filter((m) => m.kind === 'arrow-label').map((m) => ({ x0: m.x - m.w / 2, x1: m.x + m.w / 2, y0: m.y - 8, y1: m.y + 8 })),
          ];
          for (const b of labels) {
            expect(b.x0, tag).toBeGreaterThan(-1);
            expect(b.x1, tag).toBeLessThan(w + 1);
          }
          for (let i = 0; i < labels.length; i++) for (let j = i + 1; j < labels.length; j++) expect(overlap(labels[i], labels[j]), tag).toBe(false);
          for (const b of labels) for (const boat of boats) expect(overlap(b, boat), tag).toBe(false);
          const titles = g.marks.filter((m) => m.kind === 'text' && /^ch04\.r\.frame\.|^(Ground|Water|지면 기준|물 기준)$/.test(m.text ?? '')).map(midBox);
          expect(titles.length, tag).toBe(2);
          for (const b of labels) for (const tb of titles) expect(overlap(b, tb), tag).toBe(false);
        }
      }
    }
  });
});

describe('ch09 layout', () => {
  it('track: carts at least 23 px on a phone and on the desktop explode E = 5; CM marker under the track', () => {
    for (const [over, w, h] of [
      [{}, 390, 250],
      [{ kind: 'explode', E: 5 }, 1280, 190],
      [{ kind: 'explode', E: 5, m1: 0.5, m2: 4 }, 1280, 190],
      [{ m1: 0.5, m2: 4 }, 390, 250],
    ] as const) {
      const { g } = run(track, over, 1.2, w, h);
      const carts = g.polys.filter((q) => q.length === 4).map(bbox);
      expect(carts.length).toBe(2);
      for (const c of carts) expect(c.x1 - c.x0, JSON.stringify(over)).toBeGreaterThanOrEqual(23);
      const [, yTrack] = g.vp.toPx(0, 0);
      const cm = g.circles.at(-1)!;
      expect(cm.y - cm.r).toBeGreaterThanOrEqual(yTrack);
      // Cart 1 stays left of cart 2 (contact faces unchanged by the magnification).
      expect(carts[0].x1).toBeLessThanOrEqual(carts[1].x0 + 0.5);
    }
  });

  it('puck: the momentum-diagram title clears the lowest puck at b = 0 on a phone', () => {
    const { g } = run(puckScene, { b: 0 }, 1.2, 390, 250);
    const title = g.marks.filter((m) => m.kind === 'text' && /[가-힣a-z]{3,}/i.test(m.text ?? '') && !/\*/.test(m.text ?? ''));
    expect(title.length).toBe(1);
    const pucks = g.polys.filter((q) => q.length === 48).map(bbox);
    const bottom = Math.max(...pucks.map((b) => b.y1));
    // Alphabetic baseline: the 12 px text rises about 10 px above it.
    expect(title[0].y - 10 - bottom).toBeGreaterThanOrEqual(6);
  });
});

describe('ch03, ch05, ch06 labels', () => {
  it('ch03 sum: the A and B labels do not touch their own arrows (default and snapped)', () => {
    for (const [w, h] of [
      [390, 590],
      [760, 680],
    ] as const) {
      const { g, p } = run(sumScene, {}, 0, w, h);
      const [ox, oy] = g.vp.toPx(0, 0);
      for (const [key, re] of [
        ['A', /^\*A\* = /],
        ['B', /^\*B\* = /],
      ] as const) {
        const m = texts(g, re);
        expect(m.length).toBe(1);
        const [tx, ty] = g.vp.toPx(p[key][0], p[key][1]);
        expect(segHitsBox([ox, oy, tx, ty], { x0: m[0].x, x1: m[0].x + m[0].w, y0: m[0].y - 7, y1: m[0].y + 7 }), `${key} ${w}×${h}`).toBe(false);
      }
    }
  });

  it('ch05 frames (ground): the train a0 arrow sits a full lane above the ball v arrow on a phone', () => {
    const { g } = run(frames, { frame: 'ground' }, 1.2, 390, 250);
    const tips = g.marks.filter((m) => m.kind === 'arrow-tip');
    expect(tips.length).toBe(2);
    expect(Math.abs(tips[0].y - tips[1].y)).toBeGreaterThanOrEqual(20);
  });

  it('ch06 friction (ice): the f_k label ends left of the block', () => {
    for (const [w, h] of [
      [760, 680],
      [390, 250],
    ] as const) {
      const { g } = run(friction, { mat: 'ice' }, 1.2, w, h);
      const f = texts(g, /^\*f\*_\{k\}$/);
      expect(f.length).toBe(1);
      const block = bbox(g.polys[0]);
      expect(f[0].x + f[0].w).toBeLessThanOrEqual(block.x0);
    }
  });
});
