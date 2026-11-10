// Hash router: contents page or a chapter page.
import { getLang, register } from '../core/i18n';
import { parseHash } from '../core/url';
import en from '../i18n/en.json';
import ko from '../i18n/ko.json';
import { chapterMeta } from '../sims/registry';
import { HomeView } from './home';
import { applyLang, initLecture, initialLang } from './prefs';
import { SimView } from './simview';

export function startApp(root: HTMLElement): void {
  register(ko, en);
  initLecture();
  let current: { dispose(): void } | null = null;
  let seq = 0;

  const route = async () => {
    const my = ++seq;
    const r = parseHash(location.hash);
    const lang = initialLang(r.query);
    if (lang !== getLang() || document.documentElement.lang !== lang) applyLang(lang);

    const meta = r.page === 'chapter' ? chapterMeta(r.ch) : undefined;
    if (r.page === 'chapter' && meta?.load) {
      const page = await meta.load();
      if (my !== seq) return;
      register(page.i18n.ko, page.i18n.en);
      current?.dispose();
      current = new SimView(root, page, meta, r.query);
    } else {
      current?.dispose();
      current = new HomeView(root);
    }
  };

  window.addEventListener('hashchange', route);
  void route();
}
