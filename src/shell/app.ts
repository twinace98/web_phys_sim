// Hash router: contents page or a chapter page.
import { getLang, register, t } from '../core/i18n';
import { parseHash } from '../core/url';
import en from '../i18n/en.json';
import ko from '../i18n/ko.json';
import { chapterMeta, type ChapterMeta } from '../sims/registry';
import type { SimPage } from '../core/types';
import { h } from './dom';
import { HomeView } from './home';
import { applyLang, initLecture, initialLang } from './prefs';
import { clearReloadGuard, reloadOnce, sessionStore } from './reload';
import { SimView } from './simview';

/** Chapters of the textbook (Fundamentals of Physics, 12th ed.). */
const HALLIDAY_CHAPTERS = 44;

export function startApp(root: HTMLElement): void {
  register(ko, en);
  initLecture();
  let current: { dispose(): void } | null = null;
  let seq = 0;

  /** Minimal message when a chapter cannot be loaded even after a reload. */
  const showLoadError = () => {
    current?.dispose();
    current = null;
    const btn = h('button', { type: 'button' }, t('ui.reload'));
    btn.addEventListener('click', () => location.reload());
    root.replaceChildren(h('div', { class: 'load-error', role: 'alert' }, h('p', null, t('ui.loadError')), btn));
  };

  const load = async (meta: ChapterMeta, isCurrent: () => boolean): Promise<SimPage | null> => {
    try {
      const page = await meta.load!();
      clearReloadGuard(sessionStore());
      return page;
    } catch (err) {
      // Stale index.html after a redeploy: its chunk was deleted. Reload once to get the new index.
      if (reloadOnce(sessionStore(), Date.now(), () => location.reload())) return null;
      console.error(err);
      if (isCurrent()) showLoadError();
      return null;
    }
  };

  const route = async () => {
    const my = ++seq;
    const r = parseHash(location.hash);
    const lang = initialLang(r.query);
    if (lang !== getLang() || document.documentElement.lang !== lang) applyLang(lang);

    const meta = r.page === 'chapter' ? chapterMeta(r.ch) : undefined;
    if (r.page === 'chapter' && meta?.load) {
      const page = await load(meta, () => my === seq);
      if (!page || my !== seq) return;
      register(page.i18n.ko, page.i18n.en);
      current?.dispose();
      current = new SimView(root, page, meta, r.query);
    } else {
      current?.dispose();
      // Halliday has 44 chapters: one of them without a page here "has no simulation yet".
      current = new HomeView(root, r.page === 'chapter' ? { ch: r.ch, known: meta !== undefined || (r.ch >= 1 && r.ch <= HALLIDAY_CHAPTERS) } : undefined);
    }
  };

  window.addEventListener('hashchange', route);
  void route();
}
