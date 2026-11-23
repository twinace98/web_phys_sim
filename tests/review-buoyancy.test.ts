// Addition under review #/ch/107: buoyancy of a cube in a finite tank.
import { describe, expect, it } from 'vitest';
import { fmt } from '../src/core/format';
import { defaults, fromQuery, logStops, logValue } from '../src/core/params';
import type { NumberParam } from '../src/core/types';
import en from '../src/sims/review/buoyancy/i18n.en.json';
import ko from '../src/sims/review/buoyancy/i18n.ko.json';
import { Runner } from '../src/core/runner';
import {
  GRAV,
  TANK,
  blockArea,
  bobPeriod,
  buoyancy,
  faces,
  floatDepth,
  fluidVolume,
  levelAt,
  normal,
  step,
  tankArea,
  viewTop,
  weight,
  yMax,
  freeForce,
  drag,
  type Block,
  type Fluid,
  type Motion,
} from '../src/sims/review/buoyancy/physics';
import { FLUIDS, SOLIDS, blockOf, buoyancyScene, fluidName, fluidOf, formulaLines, forcesOf } from '../src/sims/review/buoyancy/scene';
import { NUM, agrees, agreesWithin, grab, val } from './sigma-digits';

const water: Fluid = { rho: 1000 };

/** Run until t, from the block bottom at the surface, at rest. */
function settle(b: Block, f: Fluid, t = 40, h = 5e-4, zeta?: number): Motion {
  const m: Motion = { y: TANK.h0, v: 0 };
  for (let i = 0; i < t / h; i++) step(b, f, m, h, zeta);
  return m;
}

describe('buoyancy physics', () => {
  it('fluid volume is conserved: A_t L − A s = A_t h0 for any block height', () => {
    const b: Block = { a: 0.3, rho: 500 };
    for (const y of [0, 0.05, 0.1, 0.2, 0.3, 0.35, 0.39, 0.4, 0.6]) {
      const { L, s } = levelAt(b, y);
      expect(tankArea() * L - blockArea(b) * s).toBeCloseTo(fluidVolume(), 12);
      expect(s).toBeGreaterThanOrEqual(0);
      expect(s).toBeLessThanOrEqual(b.a);
      if (s > 0 && s < b.a) expect(L - y).toBeCloseTo(s, 12);
    }
  });

  it('equilibrium submerged fraction = ρ_obj/ρ_f (several densities, sizes, fluids)', () => {
    for (const [a, rho, rf] of [
      [0.2, 600, 1000],
      [0.1, 917, 1025],
      [0.4, 240, 1000],
      [0.25, 7870, 13600],
      [0.15, 50, 920],
    ]) {
      const b: Block = { a, rho };
      const f: Fluid = { rho: rf };
      const m = settle(b, f, 60);
      const { s } = levelAt(b, m.y);
      expect(s / a).toBeCloseTo(rho / rf, 4);
      expect(Math.abs(m.v)).toBeLessThan(1e-5);
      expect(buoyancy(b, f, m.y)).toBeCloseTo(weight(b), 3);
    }
  });

  it('F_b = (p_bottom − p_top) A = ρ_f V_sub g, partly and fully submerged', () => {
    const b: Block = { a: 0.2, rho: 3000 };
    for (const y of [0.3, 0.25, 0.15, 0.05, 0]) {
      const fc = faces(b, water, y);
      const Fb = buoyancy(b, water, y);
      expect(fc.F).toBeCloseTo(Fb, 9);
      const { L, s } = levelAt(b, y);
      expect(fc.pBot).toBeCloseTo(1000 * GRAV * (L - y), 9);
      if (s >= b.a) expect(fc.pTop).toBeGreaterThan(0);
      else expect(fc.pTop).toBe(0);
    }
    // Fully submerged: the same F_b at every depth.
    expect(buoyancy(b, water, 0.05)).toBeCloseTo(buoyancy(b, water, 0), 12);
    expect(buoyancy(b, water, 0)).toBeCloseTo(1000 * 0.008 * GRAV, 9);
  });

  it('sink / float threshold at ρ_obj = ρ_f', () => {
    const f: Fluid = { rho: 1000 };
    const below = settle({ a: 0.2, rho: 990 }, f, 80);
    const above = settle({ a: 0.2, rho: 1010 }, f, 20);
    expect(below.y).toBeGreaterThan(0.1); // floating, top just above the surface
    expect(levelAt({ a: 0.2, rho: 990 }, below.y).s / 0.2).toBeCloseTo(0.99, 3);
    expect(above.y).toBe(0); // on the floor
    const N = normal({ a: 0.2, rho: 1010 }, f, above);
    expect(N).toBeCloseTo(10 * 0.008 * GRAV, 6); // (ρ_obj − ρ_f) V g
    // Iron floats in mercury, sinks in water.
    expect(settle({ a: 0.2, rho: 7870 }, { rho: 13600 }, 20).y).toBeGreaterThan(0.1);
    expect(settle({ a: 0.2, rho: 7870 }, water, 5).y).toBe(0);
  });

  it('small-oscillation period matches T = 2π √(d_eq (1 − A/A_t) / g)', () => {
    for (const [a, rho] of [
      [0.2, 600],
      [0.4, 500],
      [0.1, 300],
    ]) {
      const b: Block = { a, rho };
      const deq = floatDepth(b, water);
      const At = tankArea();
      const Ab = blockArea(b);
      const yEq = (fluidVolume() + Ab * deq) / At - deq;
      // Start 2 % of d_eq above equilibrium, no damping; time successive upward zero crossings.
      const m: Motion = { y: yEq + 0.02 * deq, v: 0 };
      const h = 2e-5;
      let t = 0;
      let prev = m.y - yEq;
      const ups: number[] = [];
      while (ups.length < 4 && t < 20) {
        step(b, water, m, h, 0);
        t += h;
        const d = m.y - yEq;
        if (prev < 0 && d >= 0) ups.push(t - h * (d / (d - prev)));
        prev = d;
      }
      const T = (ups[3] - ups[0]) / 3;
      expect(T / bobPeriod(b, water)).toBeCloseTo(1, 3);
    }
    // Default block: wood 600 in water, a = 0.20 m → T = 0.67 s.
    expect(bobPeriod({ a: 0.2, rho: 600 }, water)).toBeCloseTo(0.673, 3);
  });

  it("g = 9.8 m/s², Halliday's value as on every other page (was 9.81); ⓘ numbers unchanged", () => {
    expect(GRAV).toBe(9.8);
    expect(weight({ a: 0.2, rho: 600 })).toBeCloseTo(47.04, 9);
    for (const dict of [ko, en] as Record<string, string>[]) {
      expect(dict['buoyancy.as.fluid']).toContain('$g = 9.8\\ \\mathrm{m/s^2}$');
      expect(dict['buoyancy.as.fluid']).not.toContain('9.81');
      expect(dict['buoyancy.obs.period']).toContain('0.67 s');
    }
    expect(bobPeriod({ a: 0.2, rho: 600 }, water).toFixed(2)).toBe('0.67');
    // Terminal speed of the lightest, largest block: about 2.7 m/s.
    expect(Math.sqrt((2 * (1 - 50 / 1000) * 0.4 * GRAV) / 1.05).toFixed(1)).toBe('2.7');
  });

  it('the level rises by V_sub / A_t', () => {
    const b: Block = { a: 0.2, rho: 600 };
    const m = settle(b, water, 60);
    const { L, s } = levelAt(b, m.y);
    expect(L - TANK.h0).toBeCloseTo((blockArea(b) * s) / tankArea(), 12);
    expect((L - TANK.h0) * 1000).toBeCloseTo(7.5, 1); // 0.04 m² × 0.12 m / 0.64 m² = 7.5 mm
  });
});

describe('buoyancy: fast light blocks (QA: 41 m/s and an invisible ceiling)', () => {
  it('a light block released deep rises at a bounded speed, leaves the fluid, falls back and floats', () => {
    for (const a of [0.1, 0.2, 0.3, 0.4])
      for (const [rho, rf] of [
        [50, 15000],
        [50, 1000],
        [50, 500],
      ]) {
        const b: Block = { a, rho };
        const f: Fluid = { rho: rf };
        const m: Motion = { y: 0, v: 0 };
        let vMax = 0;
        let top = 0;
        let fellBack = false;
        let wasUp = false;
        for (let i = 0; i < 40 / 5e-4; i++) {
          step(b, f, m, 5e-4);
          vMax = Math.max(vMax, Math.abs(m.v));
          top = Math.max(top, m.y + a);
          // Out of the fluid, moving: gravity alone (no ceiling, no air drag).
          if (levelAt(b, m.y).s === 0) {
            wasUp = true;
            expect(freeForce(b, f, m.y, m.v) / (rho * a ** 3)).toBeCloseTo(-GRAV, 9);
          }
          if (wasUp && m.v < 0) fellBack = true;
        }
        // Terminal speed √(2 (1 − ρ/ρ_f) a g / C_d) ≤ 2.7 m/s (was up to 41 m/s).
        expect(vMax).toBeLessThan(2.8);
        expect(wasUp).toBe(true);
        expect(fellBack).toBe(true);
        // Stays in view (top of the drawing grows with a).
        expect(top).toBeLessThan(viewTop(a) - 0.01);
        // Settles floating at the equilibrium fraction, not stuck at a top limit.
        expect(levelAt(b, m.y).s / a).toBeCloseTo(rho / rf, 3);
        expect(Math.abs(m.v)).toBeLessThan(1e-4);
      }
  });

  it('a dense block dropped from the highest hold point falls into the fluid and sinks', () => {
    const b: Block = { a: 0.2, rho: 20000 };
    const m: Motion = { y: yMax(b), v: 0 };
    let vMax = 0;
    for (let i = 0; i < 10 / 5e-4; i++) {
      step(b, { rho: 500 }, m, 5e-4);
      vMax = Math.max(vMax, Math.abs(m.v));
    }
    expect(m.y).toBe(0);
    // Free fall from 0.24 m above the surface (√(2 g h) = 2.2 m/s), then it keeps speeding up in
    // the light fluid until it hits the floor: 3.4 m/s.
    expect(vMax).toBeLessThan(4);
  });

  it('form drag is −½ C_d ρ_f A v|v| on the submerged fraction; none in air; small bobbing keeps T', () => {
    const b: Block = { a: 0.2, rho: 600 };
    const yIn = 0.1;
    const { s } = levelAt(b, yIn);
    const lin = drag(b, water, yIn, 1, 0.05, 0);
    expect(drag(b, water, yIn, 1) - lin).toBeCloseTo(-0.5 * 1.05 * 1000 * 0.04 * (s / 0.2), 9);
    expect(drag(b, water, yIn, -1) + lin).toBeCloseTo(0.5 * 1.05 * 1000 * 0.04 * (s / 0.2), 9);
    expect(drag(b, water, 0.6, 3)).toBe(0);
  });
});

describe('buoyancy scene', () => {
  it('runs from the default start to the floating equilibrium; formula lines carry the numbers', () => {
    const p = defaults(buoyancyScene.params);
    const r = new Runner(buoyancyScene, p, 1);
    r.play();
    for (let i = 0; i < 2000; i++) r.advance(0.02);
    const s = r.state;
    const { Fb, Fg, net } = forcesOf(s, p);
    expect(Fb / Fg).toBeCloseTo(1, 4);
    expect(Math.abs(net)).toBeLessThan(1e-3);
    const lines = formulaLines(s, p);
    expect(lines.length).toBe(6);
    expect(lines[4]).toContain('0.600');
    // At rest the net force has decayed below 1 mN and prints from the unrounded forces.
    expect(lines[5]).toMatch(/^F_\\text\{net\} = F_b - F_g \+ F_d = 47\.0 - 47\.0 [-+] /);
    for (const l of lines) expect(l).not.toMatch(/NaN|Infinity|undefined/);
  });

  it('water is the reference: default ρ_f = 1000 kg/m³ named water; other fluids named within 1 %', () => {
    const p = defaults(buoyancyScene.params);
    expect(p.rhoF).toBe(1000);
    expect(fluidOf(p).rho).toBe(1000);
    expect(fluidName(fluidOf(p).rho)).toBe('water');
    // One fluid control: the ρ_f slider (no fluid select), in the main bar, always shown.
    expect(Object.keys(buoyancyScene.params)).not.toContain('fluid');
    expect(buoyancyScene.params.rhoF.group).toBe('main');
    expect(buoyancyScene.params.rhoF.visibleIf).toBeUndefined();
    for (const [k, v] of Object.entries(FLUIDS)) {
      expect(fluidName(v)).toBe(k);
      expect(fluidName(v * 1.009)).toBe(k);
      expect(fluidName(v * 0.991)).toBe(k);
      expect(fluidOf({ ...p, rhoF: v }).rho).toBe(v);
    }
    // Between the listed fluids: no name, and the physics uses the slider value as it is.
    for (const v of [777, 1012, 1100, 5000]) expect(fluidName(v)).toBeNull();
    expect(fluidOf({ ...p, rhoF: 777 }).rho).toBe(777);
    // The 1 % windows of water and sea water do not overlap.
    expect(FLUIDS.water * 1.01).toBeLessThan(FLUIDS.sea * 0.99);
  });

  it('a held block does not move; released it does', () => {
    const p = defaults(buoyancyScene.params);
    const r = new Runner(buoyancyScene, p, 1);
    r.state.held = true;
    r.state.y = 0.6;
    r.play();
    for (let i = 0; i < 50; i++) r.advance(0.02);
    expect(r.state.y).toBe(0.6);
    r.state.held = false;
    for (let i = 0; i < 10; i++) r.advance(0.02);
    expect(r.state.y).toBeLessThan(0.6);
  });
});

describe('buoyancy Σ: units, the hand while held, printed inputs reproduce the results', () => {
  const R = (s: string) => new RegExp(s.replace(/N#/g, `(${NUM})`));
  const p0 = defaults(buoyancyScene.params);
  function check(s: { y: number; v: number; held: boolean }, p: typeof p0, tag: string): string[] {
    const bad: string[] = [];
    const f = formulaLines(s, p);
    for (const i of [0, 1]) {
      const [rho, V, g, F] = grab(f[i], R(String.raw`= \(N#\)\(N#\)\(N#\) = N#\\ \\mathrm\{N\}$`));
      if (!agrees(val(rho) * val(V) * val(g), F)) bad.push(`${tag} ${f[i]}`);
    }
    // Face pressures, then F_b from their difference computed directly (R5): the printed difference
    // is the difference of the printed pressures up to their rounding.
    const [pb, pt] = grab(f[2], R(String.raw`^p_\\text\{bot\} = N#\\ \\mathrm\{Pa\},\\ p_\\text\{top\} = N#\\ \\mathrm\{Pa\}$`));
    const [dp, A, F] = grab(f[3], R(String.raw`= \(N#\\ \\mathrm\{Pa\}\)\(N#\\ \\mathrm\{m\^2\}\) = N#\\ \\mathrm\{N\}$`));
    if (!agreesWithin((b, t) => b - t, [pb, pt], dp)) bad.push(`${tag} Δp ${f[2]} ${f[3]}`);
    if (!agrees(val(dp) * val(A), F)) bad.push(`${tag} ${f[3]}`);
    if (F !== grab(f[0], R(String.raw`= N#\\ \\mathrm\{N\}$`))[0]) bad.push(`${tag} F_b differs between lines`);
    const [ro, rf, r] = grab(f[4], R(String.raw`= \\frac\{N#\}\{N#\} = N#`));
    if (!agrees(val(ro) / val(rf), r)) bad.push(`${tag} ${f[4]}`);
    const [expr, net] = grab(f[5], R(String.raw`= ([-+() \d.\\a-z^{}]+) = N#\\ \\mathrm\{N\}$`));
    // F_net is a small difference of large forces (R5): allow the rounding of the 3-figure terms.
    // Tokens of "78.5 - 47.1 + (-31.4)"; a 1.23\\times 10^{-5} term stays one token.
    const toks = expr.replace(/[()]/g, '').replace(/\\times 10/g, '\\times~10').split(' ').map((x) => x.replace('~', ' '));
    const terms = toks.filter((x) => x !== '+' && x !== '-');
    const signs = toks.flatMap((x, i) => (x === '+' || x === '-' ? [] : [toks[i - 1] === '-' ? -1 : 1]));
    if (!agreesWithin((...x) => x.reduce((acc, xi, i) => acc + signs[i] * xi, 0), terms, net)) bad.push(`${tag} ${f[5]}`);
    if (s.held && net !== '0') bad.push(`${tag} held but F_net ≠ 0: ${f[5]}`);
    // Every decimal input has at most 3 figures (policy D; pressures and forces ≥ 1000 keep their
    // integer digits, as fmt prints them).
    for (const l of f) for (const m of l.matchAll(/(?<![\d.])\d+\.\d+/g)) if (m[0].replace('.', '').replace(/^0+/, '').length > 3) bad.push(`${tag} ${m[0]} in ${l}`);
    return bad;
  }

  it('review case: the default block held under water shows F_net = 0 with the hand force (was 31.4 N)', () => {
    const s = { y: 0.1, v: 0, held: true };
    const f = formulaLines(s, p0);
    expect(f[5]).toMatch(/\+ F_\\text\{[^}]+\}/);
    expect(f[5]).toContain('+ (-31.4)');
    expect(f[5]).toMatch(/= 0\\ \\mathrm\{N\}$/);
    expect(check(s, p0, 'held')).toEqual([]);
    // Released at the same place: the net force is the unbalanced 31.4 N, no hand term.
    const free = formulaLines({ ...s, held: false }, p0)[5];
    expect(free).not.toMatch(/\+ F_\\text\{/);
    expect(free).toMatch(/= 31\.4\\ \\mathrm\{N\}$/);
  });

  it('pressures in Pa, so Pa × m² = N (no kPa × m² written as N); the face is 0.0400 m² (policy D)', () => {
    const f = formulaLines({ y: 0.1, v: 0, held: false }, p0);
    expect(f[2]).not.toContain('kPa');
    // g = 9.8: p_bot = 1000 × 9.8 × 0.3128 m; was (3066 - 1104) Pa × 0.040000 m² with g = 9.81.
    expect(f[2]).toBe('p_\\text{bot} = 3063\\ \\mathrm{Pa},\\ p_\\text{top} = 1103\\ \\mathrm{Pa}');
    expect(f[3]).toBe('F_b = (p_\\text{bot} - p_\\text{top})A = (1960\\ \\mathrm{Pa})(0.0400\\ \\mathrm{m^2}) = 78.4\\ \\mathrm{N}');
    expect(f[0]).toBe('F_b = \\rho_f V_\\text{sub}\\, g = (1000)(0.00800)(9.8) = 78.4\\ \\mathrm{N}');
    expect(f[1]).toBe('F_g = \\rho_\\text{obj} V g = (600)(0.00800)(9.8) = 47.0\\ \\mathrm{N}');
    // Partly submerged: the top face is above the surface, gauge pressure exactly "0" (not 0.00).
    expect(formulaLines({ y: 0.3, v: 0, held: false }, p0)[2]).toMatch(/p_\\text\{top\} = 0\\ \\mathrm\{Pa\}$/);
    // The face of the default 0.20 m cube prints 0.0400 m² at every position and speed.
    for (const y of [0, 0.1, 0.25, 0.38, 0.5])
      for (const v of [0, 1.3, -0.7]) expect(formulaLines({ y, v, held: false }, p0)[3]).toContain('(0.0400\\ \\mathrm{m^2})');
  });

  it('R6: ρ_obj/ρ_f next to 1 keeps the figures that show it, = 1 when equal', () => {
    const r = (rhoO: number, rhoF: number) => formulaLines({ y: 0.2, v: 0, held: false }, { ...p0, rhoO, rhoF })[4];
    expect(r(1000, 1000)).toMatch(/= 1 = 1$/);
    expect(r(7870, 13600)).toMatch(/= 0\.579$/);
    expect(r(20000, 15000)).toMatch(/= 1\.33 > 1$/);
  });

  it('F_net at rest on the floor is an exact 0 (R7a), and a residue never prints as 0.00', () => {
    const p = { ...p0, rhoO: 20000 };
    const r = new Runner(buoyancyScene, p, 1);
    r.play();
    for (let i = 0; i < 600; i++) r.advance(0.0005);
    const f = formulaLines(r.state, p);
    expect(f[5]).toMatch(/^F_\\text\{net\} = F_b - F_g \+ N = 78\.4 - 1568 \+ 1490 = 0\\ \\mathrm\{N\}$/);
    expect(f.join(' ')).not.toMatch(/= 0\.00\\/);
  });

  it('every line over densities, sizes, positions, speeds, held or free', () => {
    const bad: string[] = [];
    for (const rhoO of [50, 240, 600, 917, 2700, 7870, 20000])
      for (const rhoF of [500, 920, 1000, 1025, 1260, 13600, 15000])
        for (const a of [0.1, 0.2, 0.37, 0.4])
          for (const y of [0, 0.05, 0.17, 0.3, 0.38, 0.41, 0.6].filter((yy) => yy <= 0.84 - a))
            for (const [v, held] of [
              [0, false],
              [0, true],
              [0.8, false],
              [-1.3, false],
            ] as const) {
              const p = { ...p0, rhoO, rhoF, a };
              bad.push(...check({ y, v, held }, p, JSON.stringify({ rhoO, rhoF, a, y, v, held })));
            }
    // And along free runs.
    for (const [rhoO, y] of [
      [600, 0.1],
      [50, 0],
      [7870, 0.5],
    ]) {
      const p = { ...p0, rhoO };
      const r = new Runner(buoyancyScene, p, 1);
      r.state.y = y;
      r.play();
      for (let i = 0; i < 300; i++) {
        r.advance(0.02);
        bad.push(...check(r.state, p, `run ${rhoO} t=${r.state.t.toFixed(2)}`));
      }
    }
    expect(bad.length, bad.slice(0, 5).join('\n')).toBe(0);
  });
});

describe('buoyancy sliders reach the named densities (review 2026-11-20: 600 → 601/592)', () => {
  const sp = (k: 'rhoO' | 'rhoF') => buoyancyScene.params[k] as NumberParam;
  /** Densities [kg/m³] a ⓘ string names: integers of two to five digits, not a percentage. */
  const named = (s: string) => [...s.matchAll(/(?<![\d.])(\d{2,5})(?![\d.]| %)/g)].map((m) => Number(m[1]));

  it('review case: 600, 917 and 2700 are slider values (were 601/592, 914/928, 2690/2730)', () => {
    const stops = logStops(sp('rhoO'));
    for (const v of [600, 917, 2700]) expect(stops).toContain(v);
  });

  it('every density named in ⓘ (ko and en) and every listed material is exactly reachable', () => {
    const want = {
      rhoO: new Set([...Object.values(SOLIDS), 50, 20000, ...named(ko['buoyancy.d.rhoO']), ...named(en['buoyancy.d.rhoO'])]),
      rhoF: new Set([
        ...Object.values(FLUIDS),
        500,
        15000,
        ...named(ko['buoyancy.d.rhoF']),
        ...named(en['buoyancy.d.rhoF']),
        ...named(ko['buoyancy.as.fluidname']),
        ...named(en['buoyancy.as.fluidname']),
      ]),
    };
    expect([...want.rhoO].sort((a, b) => a - b)).toEqual([50, 240, 600, 917, 2700, 7870, 20000]);
    expect([...want.rhoF].sort((a, b) => a - b)).toEqual([500, 920, 1000, 1025, 1260, 13600, 15000]);
    for (const k of ['rhoO', 'rhoF'] as const) {
      const s = sp(k);
      for (const v of want[k]) {
        expect(logStops(s), `${k} ${v}`).toContain(v);
        // Thumb at the value's position (the browser rounds it to the nearest step) gives the value.
        expect(logValue(s, Math.log10(v))).toBe(v);
        // The slider readout prints the value the physics uses.
        expect(Number(fmt(v, s.sig))).toBe(v);
      }
      const st = logStops(s);
      for (let i = 1; i < st.length; i++) expect(st[i]).toBeGreaterThanOrEqual(st[i - 1]);
    }
    // Densities in the observations: the lightest block, wood, ice, iron; mercury.
    for (const v of [50, 600, 917, 7870]) expect(logStops(sp('rhoO'))).toContain(v);
    expect(logStops(sp('rhoF'))).toContain(13600);
  });

  it('every slider value: shown = used by the physics; readouts and Σ finite (whole track)', () => {
    const p0 = defaults(buoyancyScene.params);
    for (const k of ['rhoO', 'rhoF'] as const)
      for (const v of logStops(sp(k))) {
        const p = { ...p0, [k]: v };
        expect(Number(fmt(v, 3))).toBe(v);
        expect(k === 'rhoO' ? blockOf(p).rho : fluidOf(p).rho).toBe(v);
        const s = { y: 0.2, v: 0, held: false };
        for (const ro of buoyancyScene.readouts!) expect(Number.isFinite(ro.value(s as never, p))).toBe(true);
        expect(formulaLines(s, p).join(' ')).not.toMatch(/NaN|Infinity|undefined/);
      }
  });

  it('ⓘ numbers at the reached values: wood 0.600, ice 0.917 in water and 0.895 in sea water, iron 0.579 in mercury', () => {
    const p0 = defaults(buoyancyScene.params);
    const ratio = (rhoO: number, rhoF: number) => formulaLines({ y: 0.2, v: 0 }, { ...p0, rhoO, rhoF })[4];
    expect(ratio(600, 1000)).toMatch(/= 0\.600$/);
    expect(ratio(917, 1000)).toMatch(/\\frac\{917\}\{1000\} = 0\.917$/);
    expect(ratio(917, 1025)).toMatch(/\\frac\{917\}\{1025\} = 0\.895$/);
    expect(ratio(7870, 13600)).toMatch(/= 0\.579$/);
  });

  it('URL values: named densities as they are, others at 3 figures', () => {
    const q = (s: string) => fromQuery(buoyancyScene.params, new URLSearchParams(s));
    expect(q('rhoO=917&rhoF=1025')).toMatchObject({ rhoO: 917, rhoF: 1025 });
    expect(q('rhoO=917.3&rhoF=1024.6')).toMatchObject({ rhoO: 917, rhoF: 1020 });
    expect(q('rhoO=7870&rhoF=13600')).toMatchObject({ rhoO: 7870, rhoF: 13600 });
  });

  it('a live change mid-run to named densities settles at ρ_obj/ρ_f (or sinks)', () => {
    const p0 = defaults(buoyancyScene.params);
    for (const [rhoO, rhoF] of [
      [240, 1000],
      [917, 1025],
      [2700, 920],
      [7870, 13600],
      [600, 1260],
    ]) {
      const r = new Runner(buoyancyScene, p0, 1);
      r.play();
      for (let i = 0; i < 100; i++) r.advance(0.02);
      r.setParam('rhoO', rhoO);
      r.setParam('rhoF', rhoF);
      for (let i = 0; i < 2500; i++) r.advance(0.02);
      const f = levelAt(blockOf(r.params), r.state.y).s / r.params.a;
      expect(f).toBeCloseTo(Math.min(1, rhoO / rhoF), 2);
    }
  });
});
