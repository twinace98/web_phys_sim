// Number formatting: significant figures, true minus sign, ×10ⁿ for extremes.

const MINUS = '−';
const SUP: Record<string, string> = {
  '-': '⁻',
  '0': '⁰',
  '1': '¹',
  '2': '²',
  '3': '³',
  '4': '⁴',
  '5': '⁵',
  '6': '⁶',
  '7': '⁷',
  '8': '⁸',
  '9': '⁹',
};

const sup = (n: number) => String(n).replace(/[-0-9]/g, (c) => SUP[c]);

/**
 * Format with `sig` significant figures. |v| < zeroTol prints as zero, so
 * floating-point noise never shows up as 1.00×10⁻¹⁶.
 */
export function fmt(v: number, sig = 3, zeroTol = 1e-9): string {
  if (!Number.isFinite(v)) return '–';
  if (Math.abs(v) < zeroTol) v = 0;
  // An exact 0 (or rounding noise below zeroTol) prints as "0", not "0.00": 0.00 reads as a
  // measured small value (policy D, R7). Small physical values keep their figures (1.36×10⁻⁹).
  if (v === 0) return '0';
  const a = Math.abs(v);
  const sign = v < 0 ? MINUS : '';
  // Decide the notation from the value as it will be printed (99999.6 at 3 figures is 1.00×10⁵).
  const ar = a === 0 ? 0 : Number(a.toPrecision(sig));
  if (a !== 0 && (ar >= 1e5 || ar < 1e-3)) {
    let e = Math.floor(Math.log10(a));
    let m = a / 10 ** e;
    if (Number(m.toFixed(sig - 1)) >= 10) {
      e += 1;
      m /= 10;
    }
    return `${sign}${m.toFixed(sig - 1)}×10${sup(e)}`;
  }
  // Decimals from the printed magnitude: 9.996 at 3 figures prints 10.0, not 10.00. Values of
  // 10^sig and more keep all their integer digits (3567 N, not 3570 N).
  const mag = ar === 0 ? 0 : Math.floor(Math.log10(ar));
  const decimals = Math.max(0, sig - 1 - mag);
  return sign + a.toFixed(decimals);
}

/** Short tick label: no trailing zeros. */
export function fmtTick(v: number): string {
  if (Math.abs(v) < 1e-12) return '0';
  const s = Number(v.toPrecision(6)).toString();
  return s.startsWith('-') ? MINUS + s.slice(1) : s;
}

/** "Nice" tick positions (1, 2, 5 × 10ⁿ) covering [lo, hi]. */
export function niceTicks(lo: number, hi: number, target = 4): number[] {
  const span = hi - lo;
  if (!(span > 0)) return [lo];
  const raw = span / target;
  const p = 10 ** Math.floor(Math.log10(raw));
  const r = raw / p;
  const step = (r < 1.5 ? 1 : r < 3.5 ? 2 : r < 7.5 ? 5 : 10) * p;
  const out: number[] = [];
  for (let v = Math.ceil(lo / step) * step; v <= hi + step * 1e-9; v += step) {
    out.push(Math.abs(v) < step * 1e-9 ? 0 : v);
  }
  return out;
}

/**
 * Clock text: decimals fine enough that one step-button press (`frameStep`) shows, and about
 * three significant figures over the run (`span`: end time or plot window); at most 3 decimals.
 * So 23960 s of an orbit reads "23960", a 3 s throw "1.24".
 */
export function clockDecimals(frameStep: number, span: number): number {
  const byStep = frameStep > 0 ? Math.ceil(-Math.log10(frameStep) - 1e-9) : 0;
  const bySpan = span > 0 ? 2 - Math.floor(Math.log10(span) + 1e-9) : 0;
  return Math.min(3, Math.max(0, byStep, bySpan));
}

export function fmtClock(t: number, decimals: number): string {
  const a = Math.abs(t) < 0.5 * 10 ** -decimals ? 0 : t;
  return a.toFixed(decimals).replace('-', '−');
}
