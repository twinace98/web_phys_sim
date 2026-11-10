// Flat key → string dictionaries; chapters register their own on load.

export type Lang = 'ko' | 'en';
type Dict = Record<string, string>;

const dicts: Record<Lang, Dict> = { ko: {}, en: {} };
let lang: Lang = 'ko';
const listeners = new Set<() => void>();

export function register(ko: Dict, en: Dict): void {
  Object.assign(dicts.ko, ko);
  Object.assign(dicts.en, en);
}

/** Translate; `{name}` placeholders are filled from vars. Falls back to the other language, then the key. */
export function t(key: string, vars?: Record<string, string | number>): string {
  const other: Lang = lang === 'ko' ? 'en' : 'ko';
  let s = dicts[lang][key];
  if (s === undefined) {
    if (import.meta.env?.DEV) console.warn(`[i18n] missing ${lang}: ${key}`);
    s = dicts[other][key] ?? key;
  }
  if (vars) s = s.replace(/\{(\w+)\}/g, (m, k) => (k in vars ? String(vars[k]) : m));
  return s;
}

export function getLang(): Lang {
  return lang;
}

export function setLang(l: Lang): void {
  if (l === lang) return;
  lang = l;
  for (const fn of listeners) fn();
}

export function onLangChange(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function isLang(s: string | null | undefined): s is Lang {
  return s === 'ko' || s === 'en';
}
