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

describe('ch04 relative on a phone', () => {
  const W = 20;
  it('the river fills at least 40 % of a tall stage and the labels stay apart', () => {
    phone(true);
    for (const over of [{ heading: 60, vb: 1, u: 1.5 }, { vb: 1 }, { u: 1.5 }, {}, { vb: 3, heading: 60 }]) {
      for (const t of [0, 1.2, 8]) {
        const { g } = run(relative, over, t, 390, 590);
        const [, yNear] = g.vp.toPx(0, 0);
        const [, yFar] = g.vp.toPx(0, W);
        expect(yNear - yFar, JSON.stringify(over)).toBeGreaterThan(0.4 * 590);
        const labels = texts(g, /^\*v\*_\{(BW|WG|BG)\}$/).map(midBox);
        for (let i = 0; i < labels.length; i++) for (let j = i + 1; j < labels.length; j++) expect(overlap(labels[i], labels[j]), `${JSON.stringify(over)} t = ${t}`).toBe(false);
        // The boat (first polygon after the water) is clear of every label.
        const boat = bbox(g.polys[1]);
        for (const b of labels) expect(overlap(b, boat), `${JSON.stringify(over)} t = ${t}`).toBe(false);
      }
    }
  });

  it('the boat stays inside the stage for the whole crossing', () => {
    phone(true);
    const p = { ...defaults(relative.params), heading: 60, vb: 1, u: 1.5 };
    const T = (relative.time!.tEnd as (q: Params) => number)(p);
    for (const t of [0, 0.25 * T, 0.5 * T, T]) {
      const { g } = run(relative, { heading: 60, vb: 1, u: 1.5 }, t, 390, 590);
      const b = bbox(g.polys[1]);
      expect(b.x0).toBeGreaterThan(0);
      expect(b.x1).toBeLessThan(390);
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
