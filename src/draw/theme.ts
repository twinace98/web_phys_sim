// Semantic colour tokens (Okabe-Ito) and global drawing scale (docs/design.md §3).
import type { Role } from '../core/types';

export const ROLE_COLOR: Record<Role, string> = {
  position: '#0072B2',
  velocity: '#D55E00',
  acceleration: '#009E73',
  force: '#CC79A7',
  energyK: '#56B4E9',
  energyU: '#E69F00',
  energyE: '#1a1a1a',
  positive: '#D55E00',
  negative: '#0072B2',
  surface: '#E69F00',
  field: '#8c8c8c',
  highlight: '#F0E442',
  fg: '#1a1a1a',
  muted: '#9a9a9a',
  axis: '#5c5c5c',
};

export const UI_FONT =
  '"Pretendard Variable", Pretendard, -apple-system, BlinkMacSystemFont, system-ui, "Apple SD Gothic Neo", "Noto Sans KR", sans-serif';
export const MATH_FONT = 'KaTeX_Math, "Times New Roman", serif';

/** Lecture mode multiplies line widths and font sizes. */
export const theme = { scale: 1 };

export function color(c: Role | string): string {
  return (ROLE_COLOR as Record<string, string>)[c] ?? c;
}

export function withAlpha(hex: string, a: number): string {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${a})`;
}
