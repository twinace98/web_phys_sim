import { describe, expect, it } from 'vitest';
import { add, components, fromAxes, placeTip, toAxes, type V2 } from '../src/sims/ch03/physics';

const deg = Math.PI / 180;
const vecs: V2[] = [
  [4, 3],
  [-2, 5],
  [-3.5, -1],
  [0.5, -4],
];

describe('ch03 components', () => {
  it('A = 4, 3 in the standard frame: A = 5, θ = 36.87°', () => {
    const c = components([4, 3], 0);
    expect(c.ax).toBeCloseTo(4, 12);
    expect(c.ay).toBeCloseTo(3, 12);
    expect(c.mag).toBeCloseTo(5, 12);
    expect(c.theta / deg).toBeCloseTo(36.8699, 3);
  });

  it('components satisfy A_x = A cos θ, A_y = A sin θ in any frame', () => {
    for (const a of vecs) {
      for (const phi of [0, 15, 30, 45, 60]) {
        const c = components(a, phi * deg);
        expect(c.ax).toBeCloseTo(c.mag * Math.cos(c.theta), 12);
        expect(c.ay).toBeCloseTo(c.mag * Math.sin(c.theta), 12);
      }
    }
  });

  it('rotating the axes changes the components but not the magnitude', () => {
    for (const a of vecs) {
      const m0 = components(a, 0).mag;
      for (const phi of [15, 30, 45, 60]) expect(components(a, phi * deg).mag).toBeCloseTo(m0, 12);
    }
    expect(components([4, 3], 30 * deg).ax).not.toBeCloseTo(4, 3);
  });

  it('toAxes and fromAxes are inverse', () => {
    for (const a of vecs) {
      const back = fromAxes(toAxes(a, 0.7), 0.7);
      expect(back[0]).toBeCloseTo(a[0], 12);
      expect(back[1]).toBeCloseTo(a[1], 12);
    }
  });

  it('the sum has components equal to the sums of components, in any frame', () => {
    const a: V2 = [4, 1];
    const b: V2 = [-1, 3];
    for (const phi of [0, 30 * deg]) {
      const ca = components(a, phi);
      const cb = components(b, phi);
      const cs = components(add(a, b), phi);
      expect(cs.ax).toBeCloseTo(ca.ax + cb.ax, 12);
      expect(cs.ay).toBeCloseTo(ca.ay + cb.ay, 12);
    }
  });

  it('snapping gives 0.5-step components along the rotated axes and clamps to the view', () => {
    const phi = 30 * deg;
    const tip = placeTip([3.13, 2.07], phi, true, 5.5);
    const [u, v] = toAxes(tip, phi);
    expect(Math.abs(u * 2 - Math.round(u * 2))).toBeLessThan(0.02);
    expect(Math.abs(v * 2 - Math.round(v * 2))).toBeLessThan(0.02);
    expect(placeTip([9, -9], 0, false, 5.5)).toEqual([5.5, -5.5]);
  });
});

describe('ch03 parallelogram limits', () => {
  it('clampWithPartner keeps the vector and the sum within the view', async () => {
    const { clampWithPartner } = await import('../src/sims/ch03/physics');
    const b = clampWithPartner([5, 5], [3, -2], 5.5);
    expect(b[0]).toBeLessThanOrEqual(2.5);
    expect(b[1]).toBe(5);
    expect(b[0] + 3).toBeLessThanOrEqual(5.5);
    expect(clampWithPartner([-5, 1], [-3, 0], 5.5)).toEqual([-2.5, 1]);
  });
});

describe('ch03 component handles', () => {
  it('dragging A_x changes only A_x, in any frame', async () => {
    const { setComponent, toAxes } = await import('../src/sims/ch03/physics');
    for (const phi of [0, 30 * deg]) {
      const a: V2 = [4, 3];
      const [, v0] = toAxes(a, phi);
      const pointer = fromAxes([2, 9], phi); // projection on the x axis is 2
      const [u, v] = toAxes(setComponent(a, phi, 0, pointer, false, 5.5), phi);
      expect(u).toBeCloseTo(2, 1);
      expect(v).toBeCloseTo(v0, 1);
    }
  });
  it('dragging A_y snaps to 0.5 and keeps A_x', async () => {
    const { setComponent } = await import('../src/sims/ch03/physics');
    expect(setComponent([4, 3], 0, 1, [0, -1.37], true, 5.5)).toEqual([4, -1.5]);
  });
});

describe('ch03 component-sum panel', () => {
  it('renders as valid KaTeX and shows the current values', async () => {
    const katex = (await import('katex')).default;
    const { componentPanel } = await import('../src/sims/ch03/scene');
    for (const [a, b] of [
      [[4, 1], [-1, 3]],
      [[0, 0], [-2.5, -3.5]],
    ] as [V2, V2][]) {
      const tex = componentPanel(a, b);
      expect(() => katex.renderToString(tex, { throwOnError: true })).not.toThrow();
      expect(tex).toContain((a[0] + b[0]).toFixed(2));
    }
    expect(componentPanel([4, 1], [-1, 3])).toContain('(-1.00)');
  });
});
