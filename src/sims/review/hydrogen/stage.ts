// Stage controls shared by the review pages hydrogen (102) and welljump (103): the draggable
// knobs at the ends of a transition arrow, the arrow between them, and a small stage button.
// Pixel-space (PX_WORLD) helpers.
import type { Vec2 } from '../../../core/types';
import type { Draw } from '../../../draw/draw';
import { arrowPx } from '../../../draw/draw';
import { measureRich } from '../../../draw/text';
import { ROLE_COLOR, theme } from '../../../draw/theme';
import { W, textPx, type Box } from '../../modern/frame';

/** Knob colour: the electron's (position blue). */
export const KNOB = ROLE_COLOR.position;
const INK = '#1a1a1a';

/** Knob radius [px]. */
export const knobR = (): number => 9.5 * theme.scale;

/** Hit radius [px] of a knob handle (the knob plus a margin; touch input widens it further). */
export const KNOB_HIT = 16;

/**
 * Draggable knob at one end of a transition arrow: a soft halo, a solid disc and white ▲▼
 * chevrons, so it reads as "grab and move up or down". Larger halo while it is being dragged.
 */
export function drawKnob(g: Draw, x: number, y: number, active = false): void {
  const r = knobR();
  g.circle(W(g, x, y), r + (active ? 7 : 3.5) * theme.scale, { fill: KNOB, alpha: active ? 0.22 : 0.14 });
  g.circle(W(g, x, y), r, { fill: KNOB, color: '#ffffff', width: 1.5 });
  // Solid white ▲ and ▼ (solid triangles stay legible at 1× where thin chevrons blur).
  const a = 3.6 * theme.scale;
  const tip = 6.6 * theme.scale;
  const base = 1.5 * theme.scale;
  const st = { fill: '#ffffff' };
  g.polygon([W(g, x, y - tip), W(g, x + a, y - base), W(g, x - a, y - base)], st);
  g.polygon([W(g, x, y + tip), W(g, x + a, y + base), W(g, x - a, y + base)], st);
}

/** Room [px] the arrow needs between the two knobs (shaft plus head). */
const ARROW_ROOM = 10;

/** The two levels are too close for an arrow between knobs centred on its ends. */
const tooClose = (yi: number, yf: number): boolean => Math.abs(yf - yi) - 2 * (knobR() + 1.5) < ARROW_ROOM * theme.scale;

/**
 * Horizontal offset [px] of the knobs from the arrow: 0 (centred on its ends), or, when the levels
 * are too close for an arrow between the knobs, a shift to the left of the arrow so the whole arrow
 * stays visible. Handles use the same offset, so the knob is where it can be grabbed.
 */
export function knobDx(yi: number, yf: number): number {
  return Math.abs(yf - yi) >= 0.5 && tooClose(yi, yf) ? -(knobR() + 5 * theme.scale) : 0;
}

/**
 * Transition arrow from height yi to yf at x: from knob edge to knob edge, so the head stays
 * visible beside the end knob; full length when the knobs sit beside it (knobDx ≠ 0).
 */
export function knobArrow(g: Draw, x: number, yi: number, yf: number, st: { color?: string; width?: number } = {}): void {
  const d = yf - yi;
  if (Math.abs(d) < 3) return;
  const sgn = Math.sign(d);
  const r = knobR() + 1.5;
  const style = { color: st.color ?? INK, width: st.width ?? 2 };
  if (!tooClose(yi, yf)) arrowPx(g.ctx, x, yi + sgn * r, x, yf - sgn * r, style);
  else arrowPx(g.ctx, x, yi, x, yf, style);
}

/** Stage button: centre [world] and box [px], for a Handle with onTap. */
export interface StageBtn {
  box: Box;
  c: Vec2;
}

/** Button height [px]. */
export const BTN_H = 20;

/** Width [px] of a button with this label. */
export const buttonWidth = (g: Draw, label: string): number => measureRich(g.ctx, label, { size: 11 }) + 16;

/** Small outlined button with its right edge at x and its top at y. */
export function stageButton(g: Draw, xRight: number, yTop: number, label: string): StageBtn {
  const w = buttonWidth(g, label);
  const box: Box = { l: xRight - w, r: xRight, t: yTop, b: yTop + BTN_H };
  const { ctx } = g;
  ctx.save();
  ctx.beginPath();
  ctx.roundRect(box.l, box.t, w, BTN_H, 5);
  ctx.fillStyle = '#ffffff';
  ctx.fill();
  ctx.strokeStyle = '#5c5c5c';
  ctx.lineWidth = 1.25;
  ctx.stroke();
  ctx.restore();
  textPx(g, (box.l + box.r) / 2, (box.t + box.b) / 2 + 0.5, label, { size: 11, color: INK, align: 'center', baseline: 'middle' });
  return { box, c: W(g, (box.l + box.r) / 2, (box.t + box.b) / 2) };
}

/** Off-stage position for a handle whose button is not drawn. */
export const OFF: Vec2 = { x: -1e6, y: -1e6 };

// ------------------------------------------------------------------ accumulated lines of the spectrum strip

/** The strip holds lines other than the current transition's (the clear button is shown). */
export function hasEarlierLines(s: { seen: Map<string, [number, number]> }, p: { ni: number; nf: number }): boolean {
  const cur = `${Math.min(p.ni, p.nf)}-${Math.max(p.ni, p.nf)}`;
  for (const k of s.seen.keys()) if (k !== cur) return true;
  return false;
}

/** Forget the accumulated lines; the current transition's line stays (it is drawn again at once). */
export function clearLines(s: { seen: Map<string, [number, number]> }, p: { ni: number; nf: number }): void {
  s.seen.clear();
  if (p.ni !== p.nf) s.seen.set(`${Math.min(p.ni, p.nf)}-${Math.max(p.ni, p.nf)}`, [Math.min(p.ni, p.nf), Math.max(p.ni, p.nf)]);
}
