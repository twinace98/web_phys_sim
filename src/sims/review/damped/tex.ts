// Numbers for the formula panel: significant figures as in the readouts, written as TeX.
import { fmt } from '../../../core/format';

const DIGIT: Record<string, string> = {
  '⁻': '-',
  '⁰': '0',
  '¹': '1',
  '²': '2',
  '³': '3',
  '⁴': '4',
  '⁵': '5',
  '⁶': '6',
  '⁷': '7',
  '⁸': '8',
  '⁹': '9',
};

/** `sig` significant figures; ×10ⁿ becomes \times 10^{n}, the minus sign a TeX minus. */
export function tn(v: number, sig = 3): string {
  const s = fmt(v, sig);
  if (s === '–') return '\\text{–}';
  return s.replace('−', '-').replace(/×10([⁻⁰¹²³⁴⁵⁶⁷⁸⁹]+)/, (_m, e: string) => `\\times 10^{${[...e].map((c) => DIGIT[c]).join('')}}`);
}

/** Roman unit after a thin space. */
export const u = (unit: string) => `\\ \\mathrm{${unit}}`;
