// Addition under review: standing sound waves in pipes (#/ch/109).
import { describe, expect, it } from 'vitest';
import { defaults } from '../src/core/params';
import { register } from '../src/core/i18n';
import type { NumberParam, Scene } from '../src/core/types';
import page from '../src/sims/review/pipes';
import en from '../src/sims/review/pipes/i18n.en.json';
import ko from '../src/sims/review/pipes/i18n.ko.json';
import {
  V_SOUND,
  allowed,
  columns,
  densityShape,
  displacementAntinodes,
  displacementNodes,
  displacementShape,
  frequency,
  particleX,
  pressureShape,
  wavelength,
  waveNumber,
  type PipeType,
} from '../src/sims/review/pipes/physics';
import { harmonicOf, pipesScene, rows } from '../src/sims/review/pipes/pipes';

register(ko, en);

const close = (a: number[], b: number[]) => {
  expect(a.length).toBe(b.length);
  a.forEach((v, i) => expect(v).toBeCloseTo(b[i], 12));
};

describe('pipes: harmonics', () => {
  it('open pipe: every n; closed pipe: odd n only', () => {
    for (let n = 1; n <= 10; n++) {
      expect(allowed('open', n)).toBe(true);
      expect(allowed('closed', n)).toBe(n % 2 === 1);
    }
    expect(allowed('open', 0)).toBe(false);
    expect(allowed('open', 1.5)).toBe(false);
  });

  it('the steppers offer exactly the allowed harmonics', () => {
    const values = (sp: NumberParam) => {
      const out: number[] = [];
      for (let v = sp.min!; v <= sp.max!; v += sp.step!) out.push(v);
      return out;
    };
    const no = values(pipesScene.params.nOpen as NumberParam);
    const nc = values(pipesScene.params.nClosed as NumberParam);
    expect(no).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    expect(nc).toEqual([1, 3, 5, 7, 9, 11, 13, 15]);
    for (const n of no) expect(allowed('open', n)).toBe(true);
    for (const n of nc) expect(allowed('closed', n)).toBe(true);
    expect(harmonicOf({ ...defaults(pipesScene.params), type: 'closed', nClosed: 5 })).toBe(5);
  });

  it('f_n = nv/2L (open) and nv/4L (closed)', () => {
    expect(V_SOUND).toBe(343);
    expect(frequency('open', 1, 1)).toBeCloseTo(171.5, 12);
    expect(frequency('open', 1, 2)).toBeCloseTo(343, 12);
    expect(frequency('open', 2, 3)).toBeCloseTo(257.25, 12);
    expect(frequency('closed', 1, 1)).toBeCloseTo(85.75, 12);
    expect(frequency('closed', 1, 3)).toBeCloseTo(257.25, 12);
    expect(frequency('closed', 0.5, 5)).toBeCloseTo(857.5, 12);
    expect(wavelength('open', 1, 1)).toBeCloseTo(2, 14);
    expect(wavelength('closed', 1, 1)).toBeCloseTo(4, 14);
    // f_n = n f_1
    for (const type of ['open', 'closed'] as PipeType[])
      for (const n of [1, 3, 5]) expect(frequency(type, 0.8, n)).toBeCloseTo(n * frequency(type, 0.8, 1), 10);
  });
});

describe('pipes: nodes and antinodes', () => {
  it('positions', () => {
    close(displacementNodes('open', 1, 1), [0.5]);
    close(displacementAntinodes('open', 1, 1), [0, 1]);
    close(displacementNodes('open', 1, 2), [0.25, 0.75]);
    close(displacementAntinodes('open', 1, 2), [0, 0.5, 1]);
    close(displacementNodes('closed', 1, 1), [1]);
    close(displacementAntinodes('closed', 1, 1), [0]);
    close(displacementNodes('closed', 1, 3), [1 / 3, 1]);
    close(displacementAntinodes('closed', 1, 3), [0, 2 / 3]);
  });

  it('counts and spacing λ/2 for every allowed n and several L', () => {
    for (const L of [0.25, 1, 1.37, 2]) {
      for (let n = 1; n <= 8; n++) {
        const N = displacementNodes('open', L, n);
        const A = displacementAntinodes('open', L, n);
        expect(N.length).toBe(n);
        expect(A.length).toBe(n + 1);
        for (let i = 1; i < N.length; i++) expect(N[i] - N[i - 1]).toBeCloseTo(wavelength('open', L, n) / 2, 12);
      }
      for (let n = 1; n <= 15; n += 2) {
        const N = displacementNodes('closed', L, n);
        const A = displacementAntinodes('closed', L, n);
        expect(N.length).toBe((n + 1) / 2);
        expect(A.length).toBe((n + 1) / 2);
        expect(N[N.length - 1]).toBeCloseTo(L, 12);
        for (let i = 1; i < N.length; i++) expect(N[i] - N[i - 1]).toBeCloseTo(wavelength('closed', L, n) / 2, 12);
      }
    }
  });

  it('end conditions: open end = displacement antinode = pressure node; closed end = displacement node = pressure antinode', () => {
    for (const L of [0.5, 1.2])
      for (let n = 1; n <= 8; n++) {
        for (const x of [0, L]) {
          expect(Math.abs(displacementShape('open', L, n, x))).toBeCloseTo(1, 12);
          expect(pressureShape('open', L, n, x)).toBeCloseTo(0, 12);
        }
        const m = 2 * n - 1;
        expect(Math.abs(displacementShape('closed', L, m, 0))).toBeCloseTo(1, 12);
        expect(displacementShape('closed', L, m, L)).toBeCloseTo(0, 12);
        expect(Math.abs(pressureShape('closed', L, m, L))).toBeCloseTo(1, 12);
      }
  });

  it('Δp = −B ∂s/∂x: the pressure profile is −(1/k) ds/dx', () => {
    for (const [type, n] of [
      ['open', 3],
      ['closed', 5],
    ] as [PipeType, number][]) {
      const L = 1.1;
      const k = waveNumber(type, L, n);
      const e = 1e-6;
      for (let x = 0.01; x < L; x += 0.037) {
        const ds = (displacementShape(type, L, n, x + e) - displacementShape(type, L, n, x - e)) / (2 * e);
        expect(pressureShape(type, L, n, x)).toBeCloseTo(-ds / k, 7);
      }
      // Displacement nodes are pressure antinodes and vice versa.
      for (const x of displacementNodes(type, L, n)) expect(Math.abs(pressureShape(type, L, n, x))).toBeCloseTo(1, 12);
      for (const x of displacementAntinodes(type, L, n)) expect(pressureShape(type, L, n, x)).toBeCloseTo(0, 12);
    }
  });
});

describe('pipes: page', () => {
  it('rows do not overlap and fit the stage at 1280x800 and 390x844 sizes', () => {
    for (const [w, h] of [
      [760, 600],
      [390, 560],
      [390, 420],
    ]) {
      const R = rows(w, h);
      expect(R.pipe[1]).toBeLessThan(R.disp[0]);
      expect(R.disp[1] + 18).toBeLessThanOrEqual(R.pres[0]);
      expect(R.pres[1] + 18).toBeLessThanOrEqual(h);
      expect(R.xl).toBeGreaterThan(30);
      expect(R.xr).toBeLessThan(w);
    }
  });

  it('formula lines carry the numbers', () => {
    const p = defaults(pipesScene.params);
    const lines = pipesScene.formula!({ t: 0 }, p).join(' ');
    expect(lines).toContain('171.5');
    expect(lines).toContain('2.00');
    const c = pipesScene.formula!({ t: 0 }, { ...p, type: 'closed', nClosed: 3 }).join(' ');
    expect(c).toContain('257.3');
    expect(c).toContain('1, 3, 5');
  });

  it('i18n: every key in both languages, no em-dash, no `$` right after a letter or digit', () => {
    const keys = new Set<string>();
    for (const sc of page.scenes as Scene[]) {
      keys.add(sc.title);
      for (const sp of Object.values(sc.params)) {
        keys.add(sp.label);
        if (sp.desc) keys.add(sp.desc);
        if (sp.kind === 'select') for (const o of sp.options) keys.add(o.label);
      }
      for (const k of [...sc.info.goals, ...sc.info.observe, ...(sc.info.assumptions ?? [])]) keys.add(k);
    }
    for (const k of keys) {
      expect(ko).toHaveProperty([k]);
      expect(en).toHaveProperty([k]);
    }
    expect(Object.keys(ko).sort()).toEqual(Object.keys(en).sort());
    for (const v of [...Object.values(ko), ...Object.values(en)]) {
      expect(v).not.toContain('\u2014');
      const parts = v.split('$');
      expect(parts.length % 2).toBe(1);
      for (let i = 0; i < parts.length - 1; i += 2) expect(parts[i]).not.toMatch(/[A-Za-z0-9가-힣]$/);
    }
  });
});

describe('pipes: tracer columns and density', () => {
  const cases: [PipeType, number, number][] = [
    ['open', 1, 1],
    ['open', 3, 1],
    ['open', 8, 0.25],
    ['closed', 1, 1],
    ['closed', 5, 2],
    ['closed', 15, 1.37],
  ];

  it('a tracer column sits exactly on every displacement node and antinode', () => {
    for (const [type, n, L] of cases)
      for (const approx of [16, 36, 134]) {
        const C = columns(type, L, n, approx);
        const tr = C.x.filter((_x, i) => C.tracer[i]);
        const nd = C.x.filter((_x, i) => C.node[i]);
        close(nd, displacementNodes(type, L, n));
        const all = [...displacementNodes(type, L, n), ...displacementAntinodes(type, L, n)].sort((a, b) => a - b);
        close(tr, all);
        expect(C.x[0]).toBe(0);
        expect(C.x[C.x.length - 1]).toBeCloseTo(L, 12);
      }
  });

  it('node columns stay fixed (displacement 0 to 1e-12); antinode columns move the full amplitude', () => {
    for (const [type, n, L] of cases) {
      const C = columns(type, L, n, 40);
      const sm = 0.05 * L;
      for (const ph of [0, 0.4, 1.3, Math.PI, 5]) {
        C.x.forEach((x0, i) => {
          if (!C.tracer[i]) return;
          const d = particleX(type, L, n, x0, sm, ph) - x0;
          if (C.node[i]) expect(Math.abs(d)).toBeLessThan(1e-12 * L);
          else expect(Math.abs(d)).toBeCloseTo(sm * Math.abs(Math.cos(ph)), 12);
        });
      }
    }
  });

  it('density from the moving columns: largest change at displacement nodes, none at antinodes', () => {
    for (const [type, n, L] of cases) {
      const C = columns(type, L, n, 60);
      const sm = 0.001 * L;
      const dx = C.x[1] - C.x[0];
      // Δρ/ρ of the slab around column i: rest width / moved width − 1 (neighbours i ± 1), at ωt = 0.
      const rel = (i: number) => {
        const a = particleX(type, L, n, C.x[i] - dx, sm, 0);
        const b = particleX(type, L, n, C.x[i] + dx, sm, 0);
        return (2 * dx) / (b - a) - 1;
      };
      const k = waveNumber(type, L, n);
      let maxAll = 0;
      let maxNode = 0;
      for (let i = 1; i < C.x.length - 1; i++) {
        maxAll = Math.max(maxAll, Math.abs(rel(i)));
        if (C.node[i]) maxNode = Math.max(maxNode, Math.abs(rel(i)));
      }
      // The largest density change of all columns is at a node; every node is within 5 % of it
      // (compressed and rarefied slabs differ at second order).
      if (C.node.slice(1, -1).some(Boolean)) expect(maxNode).toBe(maxAll);
      C.x.forEach((x0, i) => {
        if (i === 0 || i === C.x.length - 1 || !C.tracer[i]) return;
        if (C.node[i]) {
          expect(Math.abs(rel(i))).toBeGreaterThan(0.95 * maxAll);
          expect(Math.abs(densityShape(type, L, n, x0))).toBeCloseTo(1, 12);
          // Exactly: the slab is 2dx − 2 s_m sin(kx) sin(k dx) wide; to first order Δρ/ρ = −∂s/∂x = k s_m.
          const sx = Math.sin(k * x0);
          expect(rel(i)).toBeCloseTo(dx / (dx - sm * sx * Math.sin(k * dx)) - 1, 12);
          expect(Math.abs(rel(i)) / (k * sm)).toBeCloseTo(1, 1);
        } else {
          expect(Math.abs(rel(i))).toBeLessThan(1e-12);
          expect(Math.abs(densityShape(type, L, n, x0))).toBeLessThan(1e-12);
        }
      });
    }
  });

  it('the density profile is the pressure profile (Δρ/ρ = Δp/B)', () => {
    for (const [type, n, L] of cases) for (const x of [0, 0.13, 0.5, 0.77, 1].map((u) => u * L)) expect(densityShape(type, L, n, x)).toBe(pressureShape(type, L, n, x));
  });
});
