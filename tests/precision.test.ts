// Policy D formatters (src/core/precision.ts): slider strings, constants, integers, measured values,
// inequalities, run-scale values and readout text.
import { describe, expect, it } from 'vitest';
import { fmt } from '../src/core/format';
import { CONST, fmtCmp, fmtInt, fmtMeas, fmtScale, fmtStep, readoutText, slider, sliderText, tnCmp, tnInt, tnMeas, tnScale, unitAfter } from '../src/core/precision';
import { tn } from '../src/core/tex';
import type { NumberParam, ReadoutSpec } from '../src/core/types';

const num = (o: Partial<NumberParam>): NumberParam => ({ kind: 'number', default: 0, control: 'slider', label: 'x', group: 'main', live: true, ...o }) as NumberParam;

describe('slider (R1)', () => {
  it('fmtStep keeps the decimals of the step (unchanged from the shell)', () => {
    expect(fmtStep(2, 0.1)).toBe('2.0');
    expect(fmtStep(2, 0.5)).toBe('2.0');
    expect(fmtStep(0.05, 0.01)).toBe('0.05');
    expect(fmtStep(0.25, 0.25)).toBe('0.25');
    expect(fmtStep(60, 1)).toBe('60');
    expect(fmtStep(100, 10)).toBe('100');
    expect(fmtStep(-1.5, 0.1)).toBe('−1.5');
  });
  it('sliderText follows the control: slider step, stepper, log slider sig, preset tick', () => {
    expect(sliderText(num({ step: 0.1 }), 2)).toBe('2.0');
    expect(sliderText(num({}), 0.5)).toBe('0.50');
    expect(sliderText(num({ control: 'stepper' }), 3)).toBe('3');
    expect(sliderText(num({ control: 'slider', log: true, sig: 2, min: 1e13, max: 1e18 }), 3.2e15)).toBe('3.2×10¹⁵');
    expect(sliderText(num({ control: 'slider', log: true }), 47)).toBe('47');
    expect(sliderText(num({ control: 'select', choices: [0.5, 1, 2.25] }), 2.25)).toBe('2.25');
    expect(sliderText(num({ control: 'select', choices: [0.5, 1, 2.25] }), 1)).toBe('1');
  });
  it('slider() is the same string in TeX', () => {
    expect(slider(num({ step: 0.1 }), 2)).toBe('2.0');
    expect(slider(num({ step: 0.1 }), -1.5)).toBe('-1.5');
    expect(slider(num({ control: 'slider', log: true, sig: 2, min: 1e13, max: 1e18 }), 3.2e15)).toBe('3.2\\times 10^{15}');
  });
});

describe('CONST (R1)', () => {
  it('prints Halliday’s quoted values and their numbers agree with the strings', () => {
    expect(CONST.g.tex).toBe('9.8');
    expect(CONST.e.tex).toBe('1.60\\times 10^{-19}');
    expect(CONST.hc.tex).toBe('1240');
    expect(CONST.Ry.tex).toBe('13.60');
    for (const [k, c] of Object.entries(CONST)) {
      if (k === 'mu0') {
        expect(c.value).toBeCloseTo(4e-7 * Math.PI, 20);
        continue;
      }
      const back = Number(c.tex.replace(/\\times 10\^\{(-?\d+)\}/, 'e$1'));
      expect(back, k).toBe(c.value);
    }
  });
});

describe('tnInt (R2)', () => {
  it('integers print bare; rounding noise and −0 vanish', () => {
    expect(fmtInt(6)).toBe('6');
    expect(fmtInt(0.9999999)).toBe('1');
    expect(fmtInt(-0)).toBe('0');
    expect(fmtInt(-3)).toBe('−3');
    expect(tnInt(-3)).toBe('-3');
    expect(tnInt(NaN)).toBe('\\text{–}');
  });
});

describe('tnMeas (R4)', () => {
  it('rounds at the leading digit of the scatter', () => {
    expect(fmtMeas(94.13, 6.2)).toBe('94');
    expect(fmtMeas(94.13, 6.2, { pm: true })).toBe('94 ± 6');
    expect(fmtMeas(1.073, 0.083, { pm: true })).toBe('1.07 ± 0.08');
    expect(fmtMeas(1.073, 0.046)).toBe('1.07');
    expect(fmtMeas(1.073, 0.0996, { pm: true })).toBe('1.1 ± 0.1');
    expect(fmtMeas(3567, 120, { pm: true })).toBe('3600 ± 100');
    expect(fmtMeas(-0.004, 0.02)).toBe('0.00');
    expect(fmtMeas(2.43e-5, 3.1e-6, { pm: true })).toBe('(2.4 ± 0.3)×10⁻⁵');
    expect(fmtMeas(5, 0)).toBe(fmt(5, 2));
    expect(tnMeas(94.13, 6.2, { pm: true })).toBe('94 \\pm 6');
    expect(tnMeas(2.43e-5, 3.1e-6)).toBe('2.4\\times 10^{-5}');
  });
});

describe('tnCmp (R6)', () => {
  it('fewest figures (≥ 3) that keep the inequality visible', () => {
    expect(fmtCmp(1.0018, 1)).toBe('1.002');
    expect(fmtCmp(0.86036, 1)).toBe('0.860');
    expect(fmtCmp(0.99996, 1)).toBe('0.99996');
    expect(fmtCmp(1, 1)).toBe('1.00');
    expect(tnCmp(-1.00049, -1)).toBe('-1.0005');
  });
});

describe('tnScale (R7a)', () => {
  it('3 figures; residues below 10⁻³ of the run scale print as 0 (zero handling only, 2026-11-24)', () => {
    expect(fmtScale(2.96e-4, 2)).toBe('0');
    expect(fmtScale(-2.96e-4, 2)).toBe('0');
    expect(fmtScale(0.049, 1.7)).toBe('0.0490');
    expect(fmtScale(-0.005, 0.17)).toBe('−0.00500');
    expect(fmtScale(1.234, 2)).toBe('1.23');
    expect(fmtScale(1e-7, 2)).toBe('0');
    expect(fmtScale(15.2, 20)).toBe('15.2');
    expect(fmtScale(-0.04, 20)).toBe('−0.0400');
    expect(fmtScale(-0.019, 20)).toBe('0');
    expect(fmtScale(-0.4, 20)).toBe('−0.400');
    expect(fmtScale(806.3, 806.3)).toBe('806');
    expect(fmtScale(-1.69e-9, 806.3)).toBe('0');
    expect(fmtScale(23960.4, 23960)).toBe('23960');
    expect(fmtScale(1.23e-5, 2e-5)).toBe('1.23×10⁻⁵');
    expect(fmtScale(4e-8, 2e-5)).toBe('4.00×10⁻⁸');
    expect(fmtScale(1e-8, 2e-5)).toBe('0');
    expect(tnScale(-1.234, 2)).toBe('-1.23');
    expect(tnScale(1.23e-5, 2e-5)).toBe('1.23\\times 10^{-5}');
  });
});

describe('readoutText and units (R3, R8)', () => {
  const ro = (o: Partial<ReadoutSpec<unknown, { v0: number }>>): ReadoutSpec<unknown, { v0: number }> => ({ label: 'v', unit: 'm/s', value: () => 0, ...o });
  it('format, then scale, then sig figures; a Σ result with tn() prints the same string', () => {
    expect(readoutText(ro({}), 1.775001, { v0: 2 })).toBe('1.78');
    expect(tn(1.775001)).toBe('1.78');
    expect(readoutText(ro({ sig: 2 }), 1.775001, { v0: 2 })).toBe('1.8');
    expect(readoutText(ro({ scale: (p) => p.v0 }), 2.96e-4, { v0: 2 })).toBe('0');
    expect(readoutText(ro({ scale: 2 }), 1e-8, { v0: 2 })).toBe('0');
    expect(readoutText(ro({ format: (v) => (v < 1 ? '< 1' : undefined) }), 0.3, { v0: 2 })).toBe('< 1');
  });
  it('no space before the degree sign', () => {
    expect(unitAfter('°')).toBe('°');
    expect(unitAfter('m/s')).toBe(' m/s');
    expect(unitAfter('')).toBe('');
  });
});
