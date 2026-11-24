// Contents page: chapters grouped by part; implemented chapters are links.
import { getLang, onLangChange, t } from '../core/i18n';
import { chapterHash } from '../core/url';
import { CHAPTERS, PARTS, REVIEW } from '../sims/registry';
import { h } from './dom';
import { toggleLang } from './prefs';

export class HomeView {
  private off: () => void;

  /** `missing`: the chapter a route asked for that has no page (Ch 12) or does not exist (Ch 999). */
  constructor(
    private readonly root: HTMLElement,
    private readonly missing?: { ch: number; known: boolean },
  ) {
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
    // A link to a chapter without a page lands here with a line saying so, not a silent contents page.
    if (this.missing) {
      const { ch, known } = this.missing;
      page.append(h('p', { class: 'home-note', role: 'status' }, t(known ? 'ui.noSim' : 'ui.noChapter', { ch })));
    }
    for (const part of [1, 2, 3, 4, 5, 6] as const) {
      const list = part === 6 ? REVIEW : CHAPTERS.filter((c) => c.part === part);
      if (!list.length) continue;
      const ol = h('ol', { class: part === 6 ? 'chapters review' : 'chapters' });
      for (const m of list) {
        // Additions under review show the chapter they are meant for.
        const num = m.review ? `→ ${m.review}` : String(m.ch);
        const inner = [h('span', { class: 'num' }, num), h('span', { class: 'name' }, m.title[lang]), h('span', { class: 'sum' }, m.summary[lang])];
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
        ', 12th ed., Wiley.',
      ),
    );
    this.root.replaceChildren(page);
  }
}
