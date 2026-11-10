// Minimal rich text for canvas labels.
//   *…*   math italic          'Δ*v* = 2.00 m/s'
//   _{…}  subscript            '*A*_{*x*}'
//   ^{…}  superscript          '*C*^{2}'
import { MATH_FONT, UI_FONT, theme } from './theme';

export interface TextStyle {
  size?: number;
  color?: string;
  align?: CanvasTextAlign;
  baseline?: CanvasTextBaseline;
  weight?: number;
}

interface Seg {
  text: string;
  italic: boolean;
  /** 0 normal, -1 subscript, +1 superscript. */
  shift: -1 | 0 | 1;
}

function segments(s: string): Seg[] {
  const out: Seg[] = [];
  let italic = false;
  let shift: Seg['shift'] = 0;
  let buf = '';
  const flush = () => {
    if (buf) out.push({ text: buf, italic, shift });
    buf = '';
  };
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (ch === '*') {
      flush();
      italic = !italic;
    } else if ((ch === '_' || ch === '^') && s[i + 1] === '{') {
      flush();
      shift = ch === '_' ? -1 : 1;
      i += 1;
    } else if (ch === '}' && shift !== 0) {
      flush();
      shift = 0;
    } else {
      buf += ch;
    }
  }
  flush();
  return out;
}

function fontOf(seg: Seg, size: number, weight: number): string {
  const sz = seg.shift ? size * 0.72 : size;
  return seg.italic ? `italic ${sz * 1.1}px ${MATH_FONT}` : `${weight} ${sz}px ${UI_FONT}`;
}

export function measureRich(ctx: CanvasRenderingContext2D, s: string, st: TextStyle = {}): number {
  const size = (st.size ?? 12) * theme.scale;
  let w = 0;
  for (const seg of segments(s)) {
    ctx.font = fontOf(seg, size, st.weight ?? 400);
    w += ctx.measureText(seg.text).width;
  }
  return w;
}

/** Draws rich text at (x, y) in CSS px; returns its width. */
export function drawRich(ctx: CanvasRenderingContext2D, s: string, x: number, y: number, st: TextStyle = {}): number {
  const size = (st.size ?? 12) * theme.scale;
  const total = measureRich(ctx, s, st);
  const align = st.align ?? 'left';
  let cx = align === 'center' ? x - total / 2 : align === 'right' || align === 'end' ? x - total : x;
  ctx.save();
  ctx.fillStyle = st.color ?? '#1a1a1a';
  ctx.textBaseline = st.baseline ?? 'alphabetic';
  ctx.textAlign = 'left';
  for (const seg of segments(s)) {
    ctx.font = fontOf(seg, size, st.weight ?? 400);
    ctx.fillText(seg.text, cx, y + (seg.shift === -1 ? size * 0.28 : seg.shift === 1 ? -size * 0.4 : 0));
    cx += ctx.measureText(seg.text).width;
  }
  ctx.restore();
  return total;
}
