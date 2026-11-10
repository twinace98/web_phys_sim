// Tiny DOM helpers.
import katex from 'katex';

type Child = Node | string | null | undefined | false;

export function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs: Record<string, string | boolean | undefined> | null = null,
  ...children: Child[]
): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs ?? {})) {
    if (v === undefined || v === false) continue;
    el.setAttribute(k, v === true ? '' : v);
  }
  for (const c of children) if (c) el.append(c);
  return el;
}

const ESC: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
const escape = (s: string) => s.replace(/[&<>"']/g, (c) => ESC[c]);

export function tex(s: string, display = false): string {
  return katex.renderToString(s, { throwOnError: false, displayMode: display });
}

/** Text with inline $…$ math → HTML. Only for strings from our own dictionaries. */
export function richHtml(s: string): string {
  return s
    .split('$')
    .map((part, i) => (i % 2 ? tex(part) : escape(part)))
    .join('');
}

export function rich<K extends keyof HTMLElementTagNameMap>(tag: K, s: string, cls?: string): HTMLElementTagNameMap[K] {
  const el = h(tag, cls ? { class: cls } : null);
  el.innerHTML = richHtml(s);
  return el;
}

export function iconButton(svg: string, label: string, onClick: () => void, cls = 'ib'): HTMLButtonElement {
  const b = h('button', { class: cls, type: 'button', 'aria-label': label, title: label });
  b.innerHTML = svg;
  // Mouse clicks must not leave focus on the button, or Space would press it again.
  b.addEventListener('mousedown', (e) => e.preventDefault());
  b.addEventListener('click', onClick);
  return b;
}
