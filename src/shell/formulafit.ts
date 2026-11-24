// Σ panel layout: every line at one font size. A line too wide for the panel breaks after an
// "=" into aligned rows (lhs = a, then "= b = result") instead of shrinking on its own, which left
// the lines of one panel at sizes from 60 % to 100 % (QA 2026-11-24).
import { tex } from './dom';

/** Smallest uniform scale before a line is broken into rows. */
export const FORMULA_MIN = 0.85;
/** A single part wider than the panel even on its own row shrinks this far, then scrolls. */
export const FORMULA_FLOOR = 0.6;

/**
 * The parts of a TeX line between its top-level "=" signs: not inside braces, \left…\right or an
 * environment, and not part of a command (\ne, \leq keep their own =-free names anyway).
 * "a = \frac{b = c}{d} = e" → ["a", "\frac{b = c}{d}", "e"].
 */
export function splitAtEquals(s: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let from = 0;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (c === '\\') {
      const m = /^\\(left|right|begin|end)\b/.exec(s.slice(i));
      if (m) depth += m[1] === 'left' || m[1] === 'begin' ? 1 : -1;
      // Skip the command name or the escaped character (\{ is not a brace).
      i += m ? m[0].length - 1 : 1;
      continue;
    }
    if (c === '{') depth++;
    else if (c === '}') depth--;
    else if (c === '=' && depth === 0) {
      out.push(s.slice(from, i).trim());
      from = i + 1;
    }
  }
  out.push(s.slice(from).trim());
  return out;
}

/**
 * The line as aligned rows, `breaks` giving the part index each new row starts at:
 * parts [a, b, c, d], breaks [2] → "a &= b \\ &= c = d".
 */
export function alignedRows(parts: string[], breaks: number[]): string {
  if (!breaks.length) return parts.join(' = ');
  const rows: string[] = [];
  let start = 1;
  for (const b of [...breaks, parts.length]) {
    rows.push(parts.slice(start, b).join(' = '));
    start = b;
  }
  return `\\begin{aligned} ${parts[0]} &= ${rows.join(' \\\\ &= ')} \\end{aligned}`;
}

/** Same line with its numbers blanked: lines of one shape keep their row breaks while values change. */
const shapeOf = (s: string) => s.replace(/-?\d+(?:\.\d+)?/g, '#');

/** Rows remembered per line index: the shape they were chosen for and the breaks. */
export type FormulaMemo = Map<number, { shape: string; breaks: number[] }>;

/** KaTeX's own font size of a display line (1.21em of its parent) and the width it needs. */
function measure(d: HTMLElement): { k: HTMLElement; need: number; base: number } | null {
  const k = d.firstElementChild as HTMLElement | null;
  if (!k) return null;
  k.style.fontSize = '';
  return { k, need: k.scrollWidth, base: parseFloat(getComputedStyle(k).fontSize) };
}

/**
 * Render `lines` into `box` at one font size: the largest scale ≤ 1 at which every line fits,
 * not below FORMULA_MIN. A line that would need less is broken after "=" signs into aligned rows,
 * as few rows as fit; a part wider than the panel on its own row shrinks alone, to FORMULA_FLOOR.
 */
export function fitFormula(box: HTMLElement, lines: string[], memo: FormulaMemo): void {
  box.innerHTML = lines.map((l) => tex(l, true)).join('');
  const avail = box.clientWidth;
  if (!(avail > 0)) return;
  const displays = () => [...box.querySelectorAll<HTMLElement>(':scope > .katex-display')];
  // Width of one candidate line (rendered in place of display i, then measured).
  const widthOf = (i: number, src: string): number => {
    const d = displays()[i];
    d.outerHTML = tex(src, true);
    return measure(displays()[i])?.need ?? 0;
  };
  const room = avail / FORMULA_MIN;
  lines.forEach((line, i) => {
    const parts = splitAtEquals(line);
    const shape = shapeOf(line);
    const old = memo.get(i);
    // Same shape as before and still fits: keep its rows, so a running value does not make the
    // line jump between one row and two.
    if (old && old.shape === shape && old.breaks.length && widthOf(i, alignedRows(parts, old.breaks)) <= room) return;
    if (parts.length < 3 || widthOf(i, line) <= room) {
      memo.set(i, { shape, breaks: [] });
      return;
    }
    // Greedy: part k joins the current row while the aligned block of parts 0…k still fits.
    const breaks: number[] = [];
    for (let k = 2; k < parts.length; k++) if (widthOf(i, alignedRows(parts.slice(0, k + 1), breaks)) > room) breaks.push(k);
    widthOf(i, alignedRows(parts, breaks));
    memo.set(i, { shape, breaks });
  });
  // One scale for every line; a line still too wide at FORMULA_MIN shrinks further on its own.
  const ms = displays().map(measure);
  const fit = Math.min(1, ...ms.map((m) => (m && m.need > 0 ? avail / m.need : 1)));
  const scale = Math.max(FORMULA_MIN, fit);
  for (const m of ms) {
    if (!m || !(m.base > 0)) continue;
    const own = m.need > 0 ? avail / m.need : 1;
    const s = own < scale ? Math.max(FORMULA_FLOOR, own) : scale;
    if (s < 1) m.k.style.fontSize = `${m.base * s}px`;
  }
}
