// Language and lecture-mode preferences (URL > localStorage > browser).
import { getLang, isLang, setLang, type Lang } from '../core/i18n';
import { theme } from '../draw/theme';

const KEY_LANG = 'wps.lang';
const KEY_LECTURE = 'wps.lecture';

function load(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function save(key: string, v: string): void {
  try {
    localStorage.setItem(key, v);
  } catch {
    /* storage unavailable: preference lasts for this page only */
  }
}

export function initialLang(query: URLSearchParams): Lang {
  const q = query.get('lang');
  if (isLang(q)) return q;
  const stored = load(KEY_LANG);
  if (isLang(stored)) return stored;
  return navigator.language?.toLowerCase().startsWith('ko') ? 'ko' : 'en';
}

export function applyLang(l: Lang): void {
  document.documentElement.lang = l;
  save(KEY_LANG, l);
  setLang(l);
}

export function toggleLang(): void {
  applyLang(getLang() === 'ko' ? 'en' : 'ko');
}

let lecture = false;
const lectureListeners = new Set<() => void>();

export function isLecture(): boolean {
  return lecture;
}

export function setLecture(on: boolean): void {
  lecture = on;
  theme.scale = on ? 1.3 : 1;
  document.documentElement.classList.toggle('lecture', on);
  save(KEY_LECTURE, on ? '1' : '0');
  for (const fn of lectureListeners) fn();
}

export function onLectureChange(fn: () => void): () => void {
  lectureListeners.add(fn);
  return () => lectureListeners.delete(fn);
}

export function initLecture(): void {
  setLecture(load(KEY_LECTURE) === '1');
}
