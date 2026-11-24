// Σ panel layout (src/shell/formulafit.ts): where a long line may break into rows.
import { describe, expect, it } from 'vitest';
import { alignedRows, splitAtEquals } from '../src/shell/formulafit';

describe('Σ lines: breaking after "="', () => {
  it('splits at top-level = only: not inside braces, \\left…\\right or environments', () => {
    expect(splitAtEquals('a = \\frac{b = c}{d} = e')).toEqual(['a', '\\frac{b = c}{d}', 'e']);
    expect(splitAtEquals('x = \\left( y = 2 \\right) = 3')).toEqual(['x', '\\left( y = 2 \\right)', '3']);
    expect(splitAtEquals('\\{ a \\} = 1')).toEqual(['\\{ a \\}', '1']);
    expect(splitAtEquals('\\begin{cases} a = 1 \\end{cases} = 2')).toEqual(['\\begin{cases} a = 1 \\end{cases}', '2']);
    expect(splitAtEquals('v \\ne 0')).toEqual(['v \\ne 0']);
  });
  it('rows: the left side once, each further row starting with =', () => {
    expect(alignedRows(['a', 'b', 'c', 'd'], [])).toBe('a = b = c = d');
    expect(alignedRows(['a', 'b', 'c', 'd'], [2])).toBe('\\begin{aligned} a &= b \\\\ &= c = d \\end{aligned}');
    expect(alignedRows(['a', 'b', 'c', 'd'], [2, 3])).toBe('\\begin{aligned} a &= b \\\\ &= c \\\\ &= d \\end{aligned}');
  });
});
