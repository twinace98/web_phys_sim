// Which keys a focused control keeps for itself; every other key goes to the page shortcuts.

/** The focused element, reduced to what the decision needs (keeps the rule testable without a DOM). */
export interface Focused {
  tag: string;
  type?: string;
  editable?: boolean;
  /** Focus arrived with a mouse or touch press rather than Tab. */
  byPointer: boolean;
}

const NAV = new Set(['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End', 'PageUp', 'PageDown']);
const PRESS_INPUTS = new Set(['checkbox', 'radio', 'button', 'submit', 'reset', 'color', 'file', 'image']);

/**
 * True when `key` belongs to the focused control (the shortcut handler must leave it alone).
 * - text fields: every key
 * - sliders: arrow / Home / End / Page keys only, so Space and letters stay shortcuts
 * - buttons, checkboxes: Space and Enter, but Space only when reached by keyboard; after a pointer
 *   click Space means play/pause, not "press the last clicked button again"
 * - selects: navigation keys and Enter; Space and type-ahead letters only when reached by keyboard
 */
export function controlOwnsKey(f: Focused | null, key: string): boolean {
  if (!f) return false;
  if (f.editable) return true;
  const tag = f.tag.toUpperCase();
  if (tag === 'TEXTAREA') return true;
  if (tag === 'INPUT') {
    const type = (f.type ?? 'text').toLowerCase();
    if (type === 'range') return NAV.has(key);
    if (PRESS_INPUTS.has(type)) return key === 'Enter' || (key === ' ' && !f.byPointer);
    return true;
  }
  if (tag === 'SELECT') {
    if (NAV.has(key) || key === 'Enter') return true;
    return !f.byPointer && (key === ' ' || key.length === 1);
  }
  if (tag === 'BUTTON') return key === 'Enter' || (key === ' ' && !f.byPointer);
  if (tag === 'A') return key === 'Enter';
  return false;
}

/** Reduce an event target to `Focused`. Body, canvas and plain containers give null. */
export function describeFocus(el: EventTarget | null, byPointer: boolean): Focused | null {
  if (!(el instanceof HTMLElement) || el === document.body) return null;
  return { tag: el.tagName, type: el instanceof HTMLInputElement ? el.type : undefined, editable: el.isContentEditable, byPointer };
}
