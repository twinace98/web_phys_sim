// Global shortcuts vs focused controls (review 2026-11-20, §2 "공통": after a stepper ± click,
// Space pressed ± again and I/R/E/L did nothing, because any focused BUTTON/INPUT/SELECT swallowed
// every key).
import { describe, expect, it } from 'vitest';
import { controlOwnsKey, type Focused } from '../src/shell/keys';

const SHORTCUTS = [' ', 'i', 'I', 'r', 'R', 'e', 'E', 'l', 'L', 'f', 'F', 'ArrowRight', 'Escape'];
const LETTERS = ['i', 'I', 'r', 'R', 'e', 'E', 'l', 'L', 'f', 'F'];
const button = (byPointer: boolean): Focused => ({ tag: 'BUTTON', byPointer });
const input = (type: string, byPointer: boolean): Focused => ({ tag: 'INPUT', type, byPointer });
const select = (byPointer: boolean): Focused => ({ tag: 'SELECT', byPointer });

describe('controlOwnsKey', () => {
  it('review case: after a mouse/touch click on a stepper ±, Space and letters are shortcuts', () => {
    for (const k of SHORTCUTS) expect(controlOwnsKey(button(true), k), k).toBe(false);
  });

  it('a button reached by Tab still activates with Space and Enter, letters stay shortcuts', () => {
    expect(controlOwnsKey(button(false), ' ')).toBe(true);
    expect(controlOwnsKey(button(false), 'Enter')).toBe(true);
    expect(controlOwnsKey(button(true), 'Enter')).toBe(true);
    for (const k of [...LETTERS, 'ArrowRight', 'Escape']) expect(controlOwnsKey(button(false), k), k).toBe(false);
  });

  it('a slider keeps arrows, Home/End and Page keys whether clicked or tabbed to; Space and letters pass', () => {
    for (const by of [true, false]) {
      for (const k of ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End', 'PageUp', 'PageDown']) {
        expect(controlOwnsKey(input('range', by), k), k).toBe(true);
      }
      for (const k of [' ', ...LETTERS, 'Escape']) expect(controlOwnsKey(input('range', by), k), k).toBe(false);
    }
  });

  it('a checkbox keeps Space only when reached by keyboard', () => {
    expect(controlOwnsKey(input('checkbox', false), ' ')).toBe(true);
    expect(controlOwnsKey(input('checkbox', true), ' ')).toBe(false);
    for (const by of [true, false]) for (const k of LETTERS) expect(controlOwnsKey(input('checkbox', by), k)).toBe(false);
  });

  it('a select keeps navigation always, Space and type-ahead letters only when reached by keyboard', () => {
    for (const by of [true, false]) {
      for (const k of ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Home', 'End', 'Enter']) expect(controlOwnsKey(select(by), k), k).toBe(true);
      expect(controlOwnsKey(select(by), 'Escape')).toBe(false);
    }
    for (const k of [' ', ...LETTERS]) {
      expect(controlOwnsKey(select(false), k), k).toBe(true);
      expect(controlOwnsKey(select(true), k), k).toBe(false);
    }
  });

  it('text fields and editable content keep every key', () => {
    for (const by of [true, false]) {
      for (const f of [input('text', by), input('number', by), { tag: 'TEXTAREA', byPointer: by }, { tag: 'DIV', editable: true, byPointer: by }]) {
        for (const k of SHORTCUTS) expect(controlOwnsKey(f, k), `${f.tag} ${k}`).toBe(true);
      }
    }
  });

  it('body, canvas and containers own nothing', () => {
    expect(controlOwnsKey(null, ' ')).toBe(false);
    for (const tag of ['CANVAS', 'DIV', 'ASIDE']) for (const k of SHORTCUTS) expect(controlOwnsKey({ tag, byPointer: true }, k)).toBe(false);
  });
});
