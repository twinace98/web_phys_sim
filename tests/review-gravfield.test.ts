// Addition under review #/ch/106: gravitational field and potential of point masses.
import { describe, expect, it } from 'vitest';
import { defaults } from '../src/core/params';
import type { Handle, SceneCtx } from '../src/core/types';
import { PARK } from '../src/sims/field/slots';
import { D_MOON, G, L, MOON, M_EARTH, fieldJac, gField, gParts, nullPoint, nullPoints, phi, phiStep, type Mass } from '../src/sims/review/gravfield/physics';
import { N_MAX, coords, formulaLines, gravfield, masses, present, probe } from '../src/sims/review/gravfield/scene';

const earthMoon: Mass[] = [
  { x: -D_MOON / 2, y: 0, m: 1 },
  { x: D_MOON / 2, y: 0, m: MOON },
];

describe('gravfield physics', () => {
  it('g = −∇Φ (central differences) at several points, two masses', () => {
    const ms: Mass[] = [
      { x: -1, y: 0.2, m: 2 },
      { x: 1.3, y: -0.4, m: 0.5 },
    ];
    const h = 1e-5;
    for (const [x, y] of [
      [0.3, 0.9],
      [-2, -1],
      [1.5, 0.5],
      [0, 0],
    ]) {
      const [gx, gy] = gField(ms, x, y);
      const dx = -(phi(ms, x + h, y) - phi(ms, x - h, y)) / (2 * h * L);
      const dy = -(phi(ms, x, y + h) - phi(ms, x, y - h)) / (2 * h * L);
      expect(Math.abs(dx - gx)).toBeLessThan(1e-6 * Math.hypot(gx, gy));
      expect(Math.abs(dy - gy)).toBeLessThan(1e-6 * Math.hypot(gx, gy));
    }
  });

  it('one mass: g = GM/r² towards the mass, ∝ 1/r²; Φ = −GM/r', () => {
    const ms: Mass[] = [{ x: 0, y: 0, m: 1 }];
    const g1 = gField(ms, 1, 0);
    expect(g1[0]).toBeCloseTo(-(G * M_EARTH) / L ** 2, 12);
    expect(Math.abs(g1[1])).toBeLessThan(1e-15);
    expect(-g1[0]).toBeCloseTo(0.03986, 5); // 3.986e14 / (1e8)²
    for (const r of [0.5, 2, 3]) {
      const [gx, gy] = gField(ms, r * Math.cos(1), r * Math.sin(1));
      expect(Math.hypot(gx, gy) * r * r).toBeCloseTo(-g1[0], 12);
    }
    // Twice as far: a quarter of g.
    expect(Math.hypot(...gField(ms, 2, 0)) / Math.hypot(...g1)).toBeCloseTo(0.25, 12);
    expect(phi(ms, 2, 0)).toBeCloseTo(-(G * M_EARTH) / (2 * L), 3);
  });

  it('the null point matches r1/r2 = √(M1/M2); Earth–Moon: 3.46×10⁵ km from the Earth', () => {
    const n = nullPoint(earthMoon[0], earthMoon[1]);
    expect(n.r1 / n.r2).toBeCloseTo(Math.sqrt(1 / MOON), 10);
    expect(n.r1 * 1e5).toBeGreaterThan(3.45e5);
    expect(n.r1 * 1e5).toBeLessThan(3.47e5);
    const [gx, gy] = gField(earthMoon, n.x, n.y);
    const scale = Math.hypot(...gParts(earthMoon, n.x, n.y)[0]);
    expect(Math.hypot(gx, gy)).toBeLessThan(1e-12 * scale);
    // Off-axis pair with other masses: still zero there, and nonzero a little to either side.
    const ms: Mass[] = [
      { x: -1.2, y: 0.5, m: 3 },
      { x: 1.1, y: -0.7, m: 0.4 },
    ];
    const q = nullPoint(ms[0], ms[1]);
    expect(Math.hypot(...gField(ms, q.x, q.y))).toBeLessThan(1e-14);
    expect(Math.hypot(...gField(ms, q.x + 0.05, q.y))).toBeGreaterThan(1e-4);
  });

  it('the field points towards the masses (attraction only)', () => {
    const [gx] = gField(earthMoon, -2.5, 0);
    expect(gx).toBeGreaterThan(0);
    const [, gy] = gField(earthMoon, 0, 1);
    expect(gy).toBeLessThan(0);
  });

  it('equipotential step is a 1-2-5 number near GM_max/(8L)', () => {
    expect(phiStep(earthMoon)).toBeCloseTo(5e5, 6); // 3.986e6/8 = 4.98e5 → 0.5 MJ/kg
    expect(phiStep([{ x: 0, y: 0, m: 10 }])).toBeCloseTo(5e6, 3);
    expect(phiStep([{ x: 0, y: 0, m: 0.01 }])).toBeCloseTo(5e3, 6);
    expect(phiStep([{ x: 0, y: 0, m: 0.03 }])).toBeCloseTo(2e4, 6); // 1.49e4 → 2e4 (log-nearest)
    expect(phiStep([{ x: 0, y: 0, m: 0.05 }])).toBeCloseTo(2e4, 6); // 2.49e4 → 2e4
  });
});


/** |g| relative to the size of the individual fields at a point. */
const relG = (ms: readonly Mass[], x: number, y: number) => {
  const f = fieldJac(ms, x, y);
  return Math.hypot(f.gx, f.gy) / f.scale;
};

describe('gravfield: points where g = 0', () => {
  it('two masses: one point, the pair formula, g = 0 to 1e-9', () => {
    for (const ms of [
      earthMoon,
      [
        { x: -1.2, y: 0.5, m: 3 },
        { x: 1.1, y: -0.7, m: 0.4 },
      ],
      [
        { x: 0, y: 0, m: 10 },
        { x: 0.3, y: 0, m: 0.01 },
      ],
    ]) {
      const ns = nullPoints(ms);
      expect(ns.length).toBe(1);
      const q = nullPoint(ms[0], ms[1]);
      expect(Math.hypot(ns[0].x - q.x, ns[0].y - q.y)).toBeLessThan(1e-9);
      expect(ns[0].kind).toBe('saddle');
      expect(relG(ms, ns[0].x, ns[0].y)).toBeLessThan(1e-9);
    }
  });

  it('three equal masses on a triangle: three saddles and the centre (a maximum in the plane)', () => {
    const R = 1.2;
    const ms: Mass[] = [0, 1, 2].map((k) => ({ x: R * Math.cos((2 * Math.PI * k) / 3 + 0.3), y: R * Math.sin((2 * Math.PI * k) / 3 + 0.3), m: 1 }));
    const ns = nullPoints(ms);
    expect(ns.length).toBe(4);
    for (const q of ns) expect(relG(ms, q.x, q.y)).toBeLessThan(1e-9);
    const max = ns.filter((q) => q.kind === 'max');
    expect(max.length).toBe(1);
    expect(Math.hypot(max[0].x, max[0].y)).toBeLessThan(1e-9);
    const sad = ns.filter((q) => q.kind === 'saddle');
    expect(sad.length).toBe(3);
    // Symmetric: the saddles lie at one distance from the centre, 120° apart.
    const r = sad.map((q) => Math.hypot(q.x, q.y));
    for (const v of r) expect(v).toBeCloseTo(r[0], 9);
    // Φ along the centre → saddle line falls (the centre is the highest point there).
    expect(phi(ms, 0, 0)).toBeGreaterThan(phi(ms, sad[0].x, sad[0].y));
  });

  it('three masses in a row: two saddles; unequal masses anywhere: every point found has g = 0', () => {
    const row: Mass[] = [
      { x: -2, y: 0, m: 1 },
      { x: 0, y: 0, m: 0.3 },
      { x: 1.8, y: 0, m: 2 },
    ];
    const ns = nullPoints(row);
    expect(ns.length).toBe(2);
    for (const q of ns) {
      expect(q.kind).toBe('saddle');
      expect(Math.abs(q.y)).toBeLessThan(1e-12);
      expect(relG(row, q.x, q.y)).toBeLessThan(1e-9);
    }
    expect(ns.some((q) => q.x < 0 && q.x > -2)).toBe(true);
    expect(ns.some((q) => q.x > 0 && q.x < 1.8)).toBe(true);
    const ms: Mass[] = [
      { x: -1.5, y: 0.8, m: 2 },
      { x: 1.2, y: 1.1, m: 0.5 },
      { x: 0.3, y: -1.2, m: 1 },
      { x: 2.2, y: -0.9, m: 0.05 },
    ];
    const n4 = nullPoints(ms);
    expect(n4.length).toBeGreaterThanOrEqual(3);
    for (const q of n4) expect(relG(ms, q.x, q.y)).toBeLessThan(1e-9);
    // Morse count in the plane (minima at the N masses, the maximum at infinity): saddles = N − 1 + maxima.
    const sad = n4.filter((q) => q.kind === 'saddle').length;
    const mx = n4.filter((q) => q.kind === 'max').length;
    expect(sad).toBe(ms.length - 1 + mx);
  });

  it('random layouts of 2 to 4 masses: every zero found, by the count saddles = N − 1 + maxima', () => {
    let seed = 7;
    const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    let n = 0;
    for (let trial = 0; trial < 600; trial++) {
      const N = 2 + (trial % 3);
      const ms: Mass[] = [];
      for (let i = 0; i < N; i++) ms.push({ x: -2.8 + 5.6 * rnd(), y: -1.8 + 3.6 * rnd(), m: 10 ** (-2 + 3 * rnd()) });
      if (ms.some((a, i) => ms.some((b, j) => j < i && Math.hypot(a.x - b.x, a.y - b.y) < 0.3))) continue;
      n++;
      const ns = nullPoints(ms);
      const sad = ns.filter((q) => q.kind === 'saddle').length;
      expect(sad).toBe(N - 1 + (ns.length - sad));
      for (const q of ns) expect(relG(ms, q.x, q.y)).toBeLessThan(1e-9);
    }
    expect(n).toBeGreaterThan(400);
  });

  it('the field of N masses is the vector sum of G M_i / r_i² towards each, and g = −∇Φ', () => {
    const ms: Mass[] = [
      { x: -1, y: 0.2, m: 2 },
      { x: 1.3, y: -0.4, m: 0.5 },
      { x: 0.2, y: 1.1, m: 1.5 },
      { x: -2, y: -1.2, m: 0.1 },
    ];
    const h = 1e-5;
    for (const [x, y] of [
      [0.3, 0.6],
      [-2.5, 1],
      [2, -1.5],
    ]) {
      let sx = 0;
      let sy = 0;
      for (const b of ms) {
        const r = Math.hypot(x - b.x, y - b.y);
        const gi = (G * b.m * M_EARTH) / (r * L) ** 2;
        sx += (gi * (b.x - x)) / r;
        sy += (gi * (b.y - y)) / r;
      }
      const [gx, gy] = gField(ms, x, y);
      expect(Math.abs(gx - sx)).toBeLessThan(1e-12 * Math.hypot(sx, sy));
      expect(Math.abs(gy - sy)).toBeLessThan(1e-12 * Math.hypot(sx, sy));
      const dx = -(phi(ms, x + h, y) - phi(ms, x - h, y)) / (2 * h * L);
      const dy = -(phi(ms, x, y + h) - phi(ms, x, y - h)) / (2 * h * L);
      expect(Math.abs(dx - gx)).toBeLessThan(1e-6 * Math.hypot(gx, gy));
      expect(Math.abs(dy - gy)).toBeLessThan(1e-6 * Math.hypot(gx, gy));
    }
  });
});

// ------------------------------------------------------------------ tray: add, remove, numbering

type P = Parameters<typeof gravfield.draw>[2];
type S = Parameters<typeof gravfield.draw>[1];
const TRAY = { rect: [-3, -1.95, -2.4, -1.6] as [number, number, number, number], chips: [{ x: -2.85, y: -1.78 }], trash: { x: -2.6, y: -1.78 } };

class Ctx implements SceneCtx<P> {
  constructor(public params: P) {}
  set<K extends keyof P>(k: K, v: P[K]) {
    this.params = { ...this.params, [k]: v };
  }
}

const state = (): S => ({ t: 0, tray: TRAY });
const handles = () => gravfield.handles as Handle<S, P>[];
/** The live handle at the tray chip (the next free mass). */
const chip = (p: P) => handles().find((h, i) => i > 0 && (h.when?.(p) ?? true) && h.pos(state(), p).x === TRAY.chips[0].x);
/** The handle of placed mass M_n. */
const massHandle = (_p: P, n: number) => handles()[n];
const visibleMain = (p: P) => Object.entries(gravfield.params).filter(([, sp]) => sp.group === 'main' && (sp.visibleIf?.(p) ?? true)).map(([k]) => k);

function add(c: Ctx, x: number, y: number): void {
  const h = chip(c.params);
  expect(h).toBeDefined();
  h!.onDrag(c, state(), { x, y });
}

describe('gravfield tray', () => {
  it('default: one mass M1 at the centre, only the M1 slider', () => {
    const p = defaults(gravfield.params);
    const ms = masses(p);
    expect(ms.length).toBe(1);
    expect(ms[0]).toMatchObject({ x: 0, y: 0, m: 1, n: 1 });
    expect(visibleMain(p)).toEqual(['M1']);
    expect(formulaLines(p).length).toBe(3);
  });

  it('a chip adds the lowest free mass; sliders follow; removing frees the number', () => {
    const c = new Ctx(defaults(gravfield.params) as P);
    add(c, 1.5, 0);
    expect(masses(c.params).map((b) => b.n)).toEqual([1, 2]);
    expect(masses(c.params)[1]).toMatchObject({ x: 1.5, y: 0, m: MOON });
    expect(visibleMain(c.params)).toEqual(['M1', 'M2']);
    add(c, -1, 1);
    add(c, -1, -1);
    expect(masses(c.params).map((b) => b.n)).toEqual([1, 2, 3, 4]);
    expect(visibleMain(c.params)).toEqual(['M1', 'M2', 'M3', 'M4']);
    // Full: no chip handle left.
    expect(chip(c.params)).toBeUndefined();
    expect(masses(c.params).length).toBe(N_MAX);
    // Double tap removes M2; the next mass added is M2 again.
    massHandle(c.params, 2).onDoubleTap!(c, state());
    expect(present(c.params, 1)).toBe(false);
    expect(visibleMain(c.params)).toEqual(['M1', 'M3', 'M4']);
    add(c, 2, 1);
    expect(masses(c.params).map((b) => b.n)).toEqual([1, 2, 3, 4]);
    expect(masses(c.params).find((b) => b.n === 2)).toMatchObject({ x: 2, y: 1 });
    // Dropping M3 on the tray removes it.
    massHandle(c.params, 3).onDrag(c, state(), { x: -2.7, y: -1.8 });
    expect(masses(c.params).map((b) => b.n)).toEqual([1, 2, 4]);
    expect(coords(c.params)[4]).toBe(PARK);
  });

  it('the last mass cannot be removed; masses keep 0.3 L apart', () => {
    const c = new Ctx(defaults(gravfield.params) as P);
    massHandle(c.params, 1).onDoubleTap!(c, state());
    massHandle(c.params, 1).onDrag(c, state(), { x: -2.7, y: -1.8 });
    expect(masses(c.params).length).toBe(1);
    // M1 removed while M2 is there: M2 alone, and the next one added is M1.
    add(c, 1, 0);
    massHandle(c.params, 1).onDoubleTap!(c, state());
    expect(masses(c.params).map((b) => b.n)).toEqual([2]);
    expect(visibleMain(c.params)).toEqual(['M2']);
    add(c, 1.1, 0);
    const ms = masses(c.params);
    expect(ms.map((b) => b.n)).toEqual([1, 2]);
    expect(Math.hypot(ms[0].x - ms[1].x, ms[0].y - ms[1].y)).toBeGreaterThanOrEqual(0.3 - 1e-3);
  });

  it('formula lines name the masses present (M1 and M3), several masses in one line', () => {
    const c = new Ctx(defaults(gravfield.params) as P);
    add(c, 1.5, 0);
    let lines = formulaLines(c.params);
    expect(lines.length).toBe(5);
    expect(lines[4]).toContain('r_1');
    add(c, -1.5, 1);
    massHandle(c.params, 2).onDoubleTap!(c, state());
    lines = formulaLines(c.params);
    expect(lines[1]).toContain('g_3');
    expect(lines[2]).toContain('\\vec g_1 + \\vec g_3');
    add(c, -1.5, -1);
    lines = formulaLines({ ...c.params, M2: 0.5, M3: 0.5 });
    expect(lines.length).toBe(4);
    expect(lines[0]).toMatch(/g_1 = .*g_2 = /);
    expect(lines[1]).toMatch(/^g_3 = /);
    expect(lines[2]).toContain("\\sum_i");
    for (const l of lines) expect(l).not.toMatch(/NaN|Infinity|undefined/);
  });

  it('probe stays clear of a mass dragged on top of it', () => {
    const p = { ...defaults(gravfield.params), T: [0, 0] };
    const at = probe(p);
    expect(Math.hypot(at.x, at.y)).toBeGreaterThan(0.149);
    for (const l of formulaLines(p)) expect(l).not.toMatch(/NaN|Infinity/);
  });
});
