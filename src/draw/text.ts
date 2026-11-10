// Minimal rich text for canvas labels: segments between '*' are math italic.
// Example: 'Δ*v* = 2.00 m/s'.
import { MATH_FONT, UI_FONT, theme } from './theme';

export interface TextStyle {
  size?: number;
  color?: string;
  align?: CanvasTextAlign;
  baseline?: CanvasTextBaseline;
  weight?: number;
}

function segments(s: string): { text: string; italic: boolean }[] {
  return s
    .split('*')
    .map((text, i) => ({ text, italic: i % 2 === 1 }))
    .filter((seg) => seg.text.length > 0);
}

function font(italic: boolean, size: number, weight: number): string {
  return italic ? `italic ${size * 1.1}px ${MATH_FONT}` : `${weight} ${size}px ${UI_FONT}`;
}

export function measureRich(ctx: CanvasRenderingContext2D, s: string, st: TextStyle = {}): number {
  const size = (st.size ?? 12) * theme.scale;
  let w = 0;
  for (const seg of segments(s)) {
    ctx.font = font(seg.italic, size, st.weight ?? 400);
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
    ctx.font = font(seg.italic, size, st.weight ?? 400);
    ctx.fillText(seg.text, cx, y);
    cx += ctx.measureText(seg.text).width;
  }
  ctx.restore();
  return total;
}
