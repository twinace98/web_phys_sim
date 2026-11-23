// The policy-D checks of tests/sigma-policy.ts catch what they are meant to catch (a made-up scene).
import { describe, expect, it } from 'vitest';
import type { Scene } from '../src/core/types';
import { evalTex, parts, policyIssues } from './sigma-policy';

const fake = (formula: string[], v = 2.47, n = 0): Scene =>
  ({
    id: 'fake',
    title: 'x',
    params: { m: { kind: 'number', control: 'slider', default: 2, min: 1, max: 5, step: 0.1, label: 'm', group: 'main', live: true } },
    world: () => ({ x: [0, 1], y: [0, 1] }),
    init: () => ({ t: 0 }),
    draw: () => {},
    readouts: [
      { label: 'v', unit: 'm/s', value: () => v },
      { label: 'n', unit: 'cm⁻³', value: () => n, zeroTol: 0 },
    ],
    formula: (_s: unknown, p: { m: number }) => formula.map((l) => l.replace('M#', String(p.m))),
    info: { goals: [], observe: [], equations: [] },
  }) as unknown as Scene;

describe('sigma-policy reading', () => {
  it('evaluates substituted sides and splits equation chains', () => {
    expect(evalTex('\\frac{(2.0)(9.8)}{4.0}')).toBeCloseTo(4.9, 12);
    expect(evalTex('(1.50/1.00) \\sin 35^\\circ')).toBeCloseTo(0.8604, 4);
    expect(evalTex('\\tfrac12(2)(0.821)^2')).toBeCloseTo(0.674, 3);
    expect(evalTex('(8.617\\times 10^{-5})(300)')).toBeCloseTo(0.025851, 6);
    expect(evalTex('g t')).toBeUndefined();
    const ps = parts('E = 0.320\\ \\mathrm{J} \\approx \\tfrac12 k x^2 = 0.325\\ \\mathrm{J},\\quad x = 1.00\\ \\mathrm{m}');
    expect(ps.map((p) => [p.lhs.trim(), p.res?.s])).toEqual([
      ['E', '0.320'],
      ['', '0.325'],
      ['x', '1.00'],
    ]);
  });
});

describe('policyIssues', () => {
  it('a clean scene passes every check', () => {
    const issues = policyIssues('9/fake', fake(['N = mg = 2.0 \\times 9.8 = 19.6\\ \\mathrm{N}', 'v = 1.23 \\times 2.0 = 2.47\\ \\mathrm{m/s}']));
    expect([...issues.values()].flat()).toEqual([]);
  });
  it('flags a slider value not printed as its label, 4-figure inputs, a result not the readout, a wrong recomputation', () => {
    const issues = policyIssues(
      '9/fake',
      fake(['N = mg = M# \\times 9.8 = 19.6\\ \\mathrm{N}', 'v = 1.2345 \\times 2.0 = 2.469\\ \\mathrm{m/s}', 'a = 2.0 \\times 3.0 = 7.00\\ \\mathrm{m/s^2}']),
    );
    expect(issues.get('slider')!.length).toBeGreaterThan(0);
    expect(issues.get('inputSig')!.some((l) => l.startsWith('1.2345'))).toBe(true);
    expect(issues.get('result')!.some((l) => l.includes("readout '2.47' vs Σ '2.469'"))).toBe(true);
    expect(issues.get('recompute')!.some((l) => l.includes('= 7.00'))).toBe(true);
  });
  it('flags a physical small value printed as 0.00 (R7b)', () => {
    expect(policyIssues('41/filling', fake(['v = 2.47\\ \\mathrm{m/s}'])).get('zero')!.length).toBeGreaterThan(0);
    expect(policyIssues('41/filling', fake(['v = 2.47\\ \\mathrm{m/s}'], 2.47, 3e-27)).get('zero')).toEqual([]);
  });
});
