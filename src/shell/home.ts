// Contents page: chapters grouped by part; implemented chapters are links.
import { getLang, onLangChange, t } from '../core/i18n';
import { chapterHash } from '../core/url';
import { CHAPTERS, PARTS } from '../sims/registry';
import { h } from './dom';
import { toggleLang } from './prefs';

export class HomeView {
  private off: () => void;

  constructor(private readonly root: HTMLElement) {
    this.build();
    this.off = onLangChange(() => this.build());
  }

  dispose(): void {
    this.off();
    this.root.replaceChildren();
  }

  private build(): void {
    const lang = getLang();
    document.title = t('app.title');
    const seg = h('div', { class: 'seg', role: 'group', 'aria-label': t('ui.language') });
    for (const l of ['ko', 'en'] as const) {
      const b = h('button', { type: 'button', 'aria-pressed': l === lang ? 'true' : 'false' }, l.toUpperCase());
      b.addEventListener('click', () => l !== getLang() && toggleLang());
      seg.append(b);
    }
    const page = h(
      'div',
      { class: 'home' },
      h('header', { class: 'home-head' }, h('h1', null, t('app.title')), seg),
    );
    for (const part of [1, 2, 3, 4, 5] as const) {
      const ol = h('ol', { class: 'chapters' });
      for (const m of CHAPTERS.filter((c) => c.part === part)) {
        const inner = [h('span', { class: 'num' }, String(m.ch)), h('span', { class: 'name' }, m.title[lang]), h('span', { class: 'sum' }, m.summary[lang])];
        ol.append(
          h(
            'li',
            m.load ? null : { class: 'todo' },
            m.load ? h('a', { href: chapterHash(m.ch, { lang }) }, ...inner) : h('div', null, ...inner),
          ),
        );
      }
      page.append(h('section', null, h('h2', null, PARTS[part][lang]), ol));
    }
    page.append(
      h(
        'footer',
        { class: 'source' },
        `${t('app.source')}: D. Halliday, R. Resnick, J. Walker, `,
        h('cite', null, 'Fundamentals of Physics'),
        ', Wiley.',
      ),
    );
    this.root.replaceChildren(page);
  }
}
