// Chapter page: header, stage, control bar, plots, settings drawer, info panel
// (docs/design.md §2). Controls are generated from the scene's parameter schema.
import { fmt, fmtTick } from '../core/format';
import { getLang, onLangChange, t } from '../core/i18n';
import { defaults, fromQuery, toQuery } from '../core/params';
import { Runner } from '../core/runner';
import { timeUnit, type Params, type ParamSpec, type Scene, type SimPage, type UiState } from '../core/types';
import { chapterHash } from '../core/url';
import { Viewport } from '../core/viewport';
import { CanvasDraw } from '../draw/draw';
import { PlotGroup } from '../plot/plot';
import type { ChapterMeta } from '../sims/registry';
import { h, iconButton, rich, tex } from './dom';
import { ICON } from './icons';
import { isLecture, onLectureChange, setLecture, toggleLang } from './prefs';
import { StagePanel, resizableSidePanel, restoreSize } from './resize';

const SPEEDS = [0.25, 0.5, 1, 2, 4];

/** "30°" but "2 m/s": no space before the degree sign. */
/** Value shown with as many decimals as the control's step has. */
const fmtStep = (v: number, step: number) => {
  const d = Math.min(4, Math.max(0, -Math.floor(Math.log10(step) + 1e-9)));
  const frac = step * 10 ** d;
  const dec = Math.abs(frac - Math.round(frac)) > 1e-9 ? d + 1 : d;
  return v.toFixed(dec).replace('-', '−');
};
const snap = (v: number, min: number, step: number) => Number((min + Math.round((v - min) / step) * step).toFixed(10));
const withUnit = (v: string, unit?: string) => (!unit ? v : unit === '°' ? `${v}°` : `${v} ${unit}`);

type Panel = 'none' | 'settings' | 'info';

export class SimView {
  private sceneIdx: number;
  private runner: Runner<Params, { t: number }>;
  private ui: UiState = { t: 0, cursorT: 0, scrubbing: false, lecture: false };
  private scrubT: number | null = null;
  private vp = new Viewport();
  private panel: Panel = 'none';

  // DOM
  private stageWrap!: HTMLElement;
  private stageCanvas!: HTMLCanvasElement;
  private stageCtx!: CanvasRenderingContext2D;
  private stageW = 0;
  private stageH = 0;
  private dpr = 1;
  private plots: PlotGroup<Params> | null = null;
  private bar!: HTMLElement;
  private settings!: HTMLElement;
  private info!: HTMLElement;
  private playBtn: HTMLButtonElement | null = null;
  private shownPlaying: boolean | null = null;
  private timeVal: HTMLElement | null = null;
  private readoutVals: HTMLElement[] = [];
  private stagePanel: StagePanel | null = null;

  private ro: ResizeObserver | null = null;
  private raf = 0;
  private last = 0;
  private urlTimer = 0;
  private stageDrag: { i: number; pointerId: number } | null = null;
  private off: (() => void)[] = [];

  constructor(
    private readonly root: HTMLElement,
    private readonly page: SimPage,
    private readonly meta: ChapterMeta,
    query: URLSearchParams,
  ) {
    const sid = query.get('s');
    this.sceneIdx = Math.max(0, page.scenes.findIndex((s) => s.id === sid));
    this.runner = new Runner(this.scene, fromQuery(this.scene.params, query));
    this.build();

    const onKey = (e: KeyboardEvent) => this.onKey(e);
    const onVis = () => {
      if (document.hidden) this.runner.pause();
    };
    window.addEventListener('keydown', onKey);
    document.addEventListener('visibilitychange', onVis);
    this.off.push(
      () => window.removeEventListener('keydown', onKey),
      () => document.removeEventListener('visibilitychange', onVis),
      onLangChange(() => {
        this.build();
        this.syncUrl(true);
      }),
      onLectureChange(() => this.build()),
    );
    this.raf = requestAnimationFrame(this.frame);
  }

  dispose(): void {
    cancelAnimationFrame(this.raf);
    window.clearTimeout(this.urlTimer);
    this.ro?.disconnect();
    for (const f of this.off) f();
    this.root.replaceChildren();
  }

  private get scene(): Scene {
    return this.page.scenes[this.sceneIdx];
  }

  // ------------------------------------------------------------------ build

  private build(): void {
    const scene = this.scene;
    const lang = getLang();
    const title = `Ch ${this.meta.ch} · ${this.meta.title[lang]}`;
    document.title = `${title} · ${t('app.title')}`;

    const header = h(
      'header',
      { class: 'hdr' },
      iconButton(ICON.menu, t('ui.contents'), () => (location.hash = '#/')),
      h('h1', null, title),
      this.page.scenes.length > 1 ? this.buildTabs() : null,
      h('div', { class: 'spacer' }),
      this.buildLangSwitch(),
      iconButton(ICON.screen, `${t('ui.lecture')} (F)`, () => setLecture(!isLecture()), isLecture() ? 'ib on' : 'ib'),
      iconButton(ICON.info, `${t('ui.info')} (I)`, () => this.togglePanel('info')),
      this.buildLinkButton(),
    );

    const main = h('main', { class: `sim ${scene.plots?.length ? (scene.layout ?? 'side') : 'solo'}` });
    this.stageWrap = h('section', { class: 'stage-wrap' });
    this.stageCanvas = h('canvas', { class: 'stage', 'aria-label': t(scene.title), role: 'img' });
    this.stageCtx = this.stageCanvas.getContext('2d')!;
    this.stageWrap.append(this.stageCanvas);
    this.stagePanel = null;
    if (scene.overlay) {
      this.stagePanel = new StagePanel(`wps.panel.${this.meta.ch}.${scene.id}`, t('ui.resize'));
      this.stageWrap.append(this.stagePanel.el);
    }
    this.bindStage();
    this.bar = this.buildBar();
    main.append(this.stageWrap, this.bar);

    this.plots = null;
    if (scene.plots?.length) {
      this.plots = new PlotGroup<Params>({
        scene,
        params: () => this.runner.params,
        ctx: () => this.runner.ctx(() => this.onParamsChanged(false)),
        isPaused: () => !this.runner.playing,
        setScrub: (tt) => this.setScrub(tt),
      });
      main.append(this.plots.el);
    }

    this.settings = this.buildSettings();
    this.info = this.buildInfo();

    this.root.replaceChildren(h('div', { class: 'app' }, header, main, this.settings, this.info));
    this.applyPanel();

    this.ro?.disconnect();
    this.ro = new ResizeObserver(() => this.resize());
    this.ro.observe(this.stageWrap);
    if (this.plots) this.ro.observe(this.plots.el);
    this.shownPlaying = null;
  }

  private buildTabs(): HTMLElement {
    const nav = h('nav', { class: 'tabs', 'aria-label': t('ui.scenes') });
    this.page.scenes.forEach((s, i) => {
      const b = h('button', { type: 'button', class: 'tab', 'aria-selected': i === this.sceneIdx ? 'true' : 'false' }, t(s.title));
      b.addEventListener('click', () => this.switchScene(i));
      nav.append(b);
    });
    return nav;
  }

  private buildLangSwitch(): HTMLElement {
    const lang = getLang();
    const seg = h('div', { class: 'seg', role: 'group', 'aria-label': `${t('ui.language')} (L)` });
    for (const l of ['ko', 'en'] as const) {
      const b = h('button', { type: 'button', 'aria-pressed': l === lang ? 'true' : 'false' }, l.toUpperCase());
      b.addEventListener('mousedown', (e) => e.preventDefault());
      b.addEventListener('click', () => l !== getLang() && toggleLang());
      seg.append(b);
    }
    return seg;
  }

  private buildLinkButton(): HTMLButtonElement {
    const b = iconButton(ICON.link, t('ui.copyLink'), async () => {
      this.syncUrl(true);
      try {
        await navigator.clipboard.writeText(location.href);
        b.innerHTML = ICON.check;
        window.setTimeout(() => (b.innerHTML = ICON.link), 1200);
      } catch {
        /* clipboard blocked: the address bar already holds the link */
      }
    });
    return b;
  }

  private buildBar(): HTMLElement {
    const r = this.runner;
    const bar = h('div', { class: 'bar' });
    const reset = iconButton(ICON.reset, `${t('ui.reset')} (R)`, () => this.reset());
    if (r.isStatic) {
      this.playBtn = null;
      this.timeVal = null;
      bar.append(reset);
    } else {
      this.playBtn = iconButton(ICON.play, t('ui.play'), () => this.togglePlay(), 'ib primary');
      const speed = h('select', { class: 'sel speed', 'aria-label': t('ui.speed'), title: t('ui.speed') });
      for (const s of SPEEDS) speed.append(h('option', { value: String(s), selected: s === r.speed }, `${s}×`));
      speed.addEventListener('change', () => (r.speed = Number(speed.value)));
      const speedCtl = h('label', { class: 'ctl', title: t('ui.speed.desc') }, h('span', { class: 'lbl' }, t('ui.speed')), speed);
      const unit = timeUnit(this.scene.time, r.params);
      this.timeVal = unit ? h('span', { class: 'val' }) : null;
      const time = unit ? h('span', { class: 'ro' }) : null;
      if (time && this.timeVal) {
        time.innerHTML = `${tex('t')} = `;
        time.append(this.timeVal, ` ${unit}`);
      }
      bar.append(
        this.playBtn,
        iconButton(ICON.step, `${t('ui.step')} (→)`, () => {
          this.scrubT = null;
          r.stepFrame();
        }),
        reset,
        speedCtl,
        ...(time ? [time] : []),
      );
    }

    const mains = this.paramKeys('main');
    if (mains.length) {
      const g = h('div', { class: 'group' });
      for (const k of mains) g.append(this.control(k, false));
      bar.append(g);
    }
    if (this.paramKeys('advanced').length) {
      bar.append(iconButton(ICON.sliders, t('ui.settings'), () => this.togglePanel('settings')));
    }

    const ros = h('div', { class: 'readouts' });
    this.readoutVals = [];
    for (const spec of this.scene.readouts ?? []) {
      const val = h('span', { class: 'val' });
      const el = h('span', { class: 'ro' });
      el.innerHTML = `${tex(spec.label)} = `;
      el.append(val, ` ${spec.unit}`);
      ros.append(el);
      this.readoutVals.push(val);
    }
    bar.append(ros);
    return bar;
  }

  private paramKeys(group: ParamSpec['group']): string[] {
    const schema = this.scene.params as Record<string, ParamSpec>;
    return Object.keys(schema).filter((k) => schema[k].group === group && (schema[k].visibleIf?.(this.runner.params) ?? true));
  }

  /** Control generated from the schema. `labelled` adds a visible label (drawer). */
  private control(key: string, labelled: boolean): HTMLElement {
    const spec = (this.scene.params as Record<string, ParamSpec>)[key];
    const value = this.runner.params[key];
    const label = t(spec.label);
    const plain = label.replace(/\$/g, '');
    const desc = spec.desc ? t(spec.desc) : '';
    const tip = desc ? `${plain}: ${desc.replace(/\$/g, '')}` : plain;
    let input: HTMLElement;
    switch (spec.kind) {
      case 'select': {
        const s = h('select', { class: 'sel', 'aria-label': plain, title: tip });
        for (const o of spec.options) s.append(h('option', { value: o.value, selected: o.value === value }, t(o.label)));
        s.addEventListener('change', () => this.setParam(key, s.value));
        input = s;
        break;
      }
      case 'number': {
        if (spec.control === 'select') {
          const s = h('select', { class: 'sel', 'aria-label': plain, title: tip });
          for (const c of spec.choices ?? []) {
            s.append(h('option', { value: String(c), selected: c === value }, withUnit(fmtTick(c), spec.unit)));
          }
          s.addEventListener('change', () => this.setParam(key, Number(s.value)));
          input = s;
        } else {
          const min = spec.min ?? 0;
          const max = spec.max ?? 1;
          const step = spec.step ?? (spec.control === 'stepper' ? 1 : 0.01);
          const show = (v: number) => withUnit(fmtStep(v, step), spec.unit);
          const out = h('span', { class: 'val' }, show(value as number));
          if (spec.control === 'stepper') {
            let v = value as number;
            const btn = (sign: -1 | 1) => {
              const b = h('button', { type: 'button', class: 'step-btn', 'aria-label': `${plain} ${sign > 0 ? '+' : '−'}` }, sign > 0 ? '+' : '−');
              b.addEventListener('click', (e) => {
                e.preventDefault();
                const nv = Math.min(max, Math.max(min, snap(v + sign * step, min, step)));
                if (nv === v) return;
                v = nv;
                out.textContent = show(v);
                dec.disabled = v <= min;
                inc.disabled = v >= max;
                this.setParam(key, v, false);
              });
              return b;
            };
            const dec = btn(-1);
            const inc = btn(1);
            dec.disabled = v <= min;
            inc.disabled = v >= max;
            input = h('span', { class: 'stepper', title: tip }, dec, out, inc);
          } else {
            const s = h('input', {
              type: 'range',
              min: String(min),
              max: String(max),
              step: String(step),
              value: String(value),
              'aria-label': plain,
              title: tip,
            });
            s.addEventListener('input', () => {
              out.textContent = show(Number(s.value));
              this.setParam(key, Number(s.value), false);
            });
            input = h('span', { class: 'slider' }, s, out);
          }
        }
        break;
      }
      case 'toggle': {
        const cb = h('input', { type: 'checkbox', checked: value === true, 'aria-label': plain });
        cb.addEventListener('change', () => this.setParam(key, cb.checked));
        input = cb;
        break;
      }
      case 'array':
        input = h('span');
        break;
    }
    if (!labelled) return h('label', { class: 'ctl', title: tip }, rich('span', label, 'lbl'), input);
    const text = h('span', { class: 'row-text' }, rich('span', label, 'lbl'), desc ? rich('span', desc, 'desc') : null);
    return h('label', { class: `row ${spec.kind}` }, text, input);
  }

  private buildSettings(): HTMLElement {
    const { panel, body } = this.sidePanel('', t('ui.settings'), t('ui.settings'));
    for (const k of this.paramKeys('advanced')) body.append(this.control(k, true));
    return panel;
  }

  private buildInfo(): HTMLElement {
    const info = this.scene.info;
    const { panel, body } = this.sidePanel('info', t('ui.info'), t(this.scene.title));
    const list = (title: string, keys: string[]) => {
      if (!keys.length) return;
      const ul = h('ul');
      for (const k of keys) ul.append(rich('li', t(k)));
      body.append(h('h3', null, title), ul);
    };
    list(t('info.goals'), info.goals);
    list(t('info.observe'), info.observe);
    if (info.equations?.length) {
      const eq = h('div', { class: 'eqs' });
      eq.innerHTML = info.equations.map((e) => tex(e, true)).join('');
      body.append(h('h3', null, t('info.equations')), eq);
    }
    list(t('info.assumptions'), info.assumptions ?? []);
    const schema = this.scene.params as Record<string, ParamSpec>;
    const ctls = [...this.paramKeys('main'), ...this.paramKeys('advanced')].filter((k) => schema[k].desc);
    if (ctls.length) {
      const ul = h('ul');
      for (const k of ctls) ul.append(h('li', null, rich('strong', t(schema[k].label)), ': ', rich('span', t(schema[k].desc!))));
      body.append(h('h3', null, t('info.controls')), ul);
    }
    const keys: [string, string][] = [
      ['Space', 'key.play'],
      ['→', 'key.step'],
      ['R', 'key.reset'],
      ['L', 'key.lang'],
      ['I', 'key.info'],
      ['F', 'key.lecture'],
    ];
    const dl = h('dl', { class: 'keys' });
    for (const [k, m] of keys) dl.append(h('dt', null, h('kbd', null, k)), h('dd', null, t(m)));
    body.append(h('h3', null, t('info.shortcuts')), dl, h('p', { class: 'note' }, t('key.scrub')));
    return panel;
  }

  /**
   * Every side panel (settings, info) shares one frame: header, scrolling body, and the same
   * resize rule. They also share one stored size so switching panels never changes the layout.
   */
  private sidePanel(extraClass: string, label: string, title: string): { panel: HTMLElement; body: HTMLElement } {
    const panel = h('aside', { class: extraClass ? `panel ${extraClass}` : 'panel', 'aria-label': label });
    const body = h('div', { class: 'panel-body' });
    panel.append(this.panelHead(title), body);
    resizableSidePanel(panel, 'wps.side', t('ui.resize'));
    return { panel, body };
  }

  private panelHead(title: string): HTMLElement {
    return h('div', { class: 'panel-head' }, h('h2', null, title), iconButton(ICON.close, t('ui.close'), () => this.togglePanel('none')));
  }

  // ------------------------------------------------------------------ state changes

  private setParam(key: string, value: Params[string], refresh = true): void {
    this.scrubT = null;
    this.runner.setParam(key, value);
    this.onParamsChanged(refresh);
  }

  /** After any parameter change: rebuild controls whose visibility may depend on it, then sync the URL. */
  private onParamsChanged(refresh: boolean): void {
    this.scrubT = null;
    if (refresh) {
      const bar = this.buildBar();
      this.bar.replaceWith(bar);
      this.bar = bar;
      const settings = this.buildSettings();
      this.settings.replaceWith(settings);
      this.settings = settings;
      this.applyPanel();
      this.shownPlaying = null;
    }
    this.syncUrl(false);
  }

  private switchScene(i: number): void {
    if (i === this.sceneIdx) return;
    this.sceneIdx = i;
    this.scrubT = null;
    this.runner = new Runner(this.scene, fromQuery(this.scene.params, new URLSearchParams()));
    this.build();
    this.syncUrl(true);
  }

  /** Dynamic scenes return to t = 0; static scenes return to their default parameters. */
  private reset(): void {
    this.scrubT = null;
    this.runner.pause();
    if (this.runner.isStatic) {
      this.runner.setParams(defaults(this.scene.params));
      this.onParamsChanged(true);
    } else {
      this.runner.reset();
    }
  }

  private togglePlay(): void {
    if (this.runner.playing) this.runner.pause();
    else {
      this.scrubT = null;
      this.runner.play();
    }
  }

  private togglePanel(p: Panel): void {
    this.panel = this.panel === p ? 'none' : p;
    this.applyPanel();
  }

  private applyPanel(): void {
    restoreSize(this.settings);
    restoreSize(this.info);
    this.settings.classList.toggle('open', this.panel === 'settings');
    this.info.classList.toggle('open', this.panel === 'info');
  }

  private setScrub(tt: number | null): void {
    if (tt === null || this.runner.playing) {
      this.scrubT = null;
      return;
    }
    const ts = this.runner.hist.col('t');
    this.scrubT = Math.min(Math.max(tt, ts[0] ?? 0), ts[ts.length - 1] ?? 0);
  }

  /** Replace the hash without a navigation; debounced while dragging. */
  private syncUrl(now: boolean): void {
    window.clearTimeout(this.urlTimer);
    const write = () => {
      const q: Record<string, string> = {};
      if (this.sceneIdx > 0) q.s = this.scene.id;
      q.lang = getLang();
      Object.assign(q, toQuery(this.scene.params, this.runner.params));
      history.replaceState(null, '', chapterHash(this.meta.ch, q));
    };
    if (now) write();
    else this.urlTimer = window.setTimeout(write, 300);
  }

  private onKey(e: KeyboardEvent): void {
    const tg = e.target as HTMLElement | null;
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    if (tg && /^(INPUT|SELECT|TEXTAREA|BUTTON)$/.test(tg.tagName)) return;
    switch (e.key) {
      case ' ':
        if (this.runner.isStatic) return;
        this.togglePlay();
        break;
      case 'ArrowRight':
        if (this.runner.isStatic) return;
        this.scrubT = null;
        this.runner.stepFrame();
        break;
      case 'r':
      case 'R':
        this.reset();
        break;
      case 'l':
      case 'L':
        toggleLang();
        break;
      case 'i':
      case 'I':
        this.togglePanel('info');
        break;
      case 'f':
      case 'F':
        setLecture(!isLecture());
        break;
      case 'Escape':
        this.togglePanel('none');
        break;
      default:
        return;
    }
    e.preventDefault();
  }

  // ------------------------------------------------------------------ stage pointer (scene handles)

  private bindStage(): void {
    const c = this.stageCanvas;
    const world = (e: PointerEvent) => {
      const r = c.getBoundingClientRect();
      const [x, y] = this.vp.toWorld(e.clientX - r.left, e.clientY - r.top);
      return { x, y };
    };
    const handles = () => (this.scene.handles ?? []).map((hd, i) => ({ hd, i })).filter(({ hd }) => hd.when?.(this.runner.params) ?? true);
    c.addEventListener('pointerdown', (e) => {
      const i = this.hitHandle(e, handles());
      if (i < 0) return;
      this.stageDrag = { i, pointerId: e.pointerId };
      c.setPointerCapture(e.pointerId);
      c.style.cursor = 'grabbing';
      e.preventDefault();
    });
    c.addEventListener('pointermove', (e) => {
      if (!this.stageDrag || this.stageDrag.pointerId !== e.pointerId) {
        if (e.pointerType === 'mouse') c.style.cursor = this.hitHandle(e, handles()) >= 0 ? 'grab' : '';
        return;
      }
      const hd = this.scene.handles![this.stageDrag.i];
      hd.onDrag(this.runner.ctx(() => this.onParamsChanged(false)), this.runner.state, world(e));
    });
    const end = (e: PointerEvent) => {
      if (this.stageDrag?.pointerId === e.pointerId) {
        this.stageDrag = null;
        c.style.cursor = '';
      }
    };
    c.addEventListener('pointerup', end);
    c.addEventListener('pointercancel', end);
  }

  /** Index of the scene handle under the pointer, or −1. */
  private hitHandle(e: PointerEvent, list: { hd: NonNullable<Scene['handles']>[number]; i: number }[]): number {
    const r = this.stageCanvas.getBoundingClientRect();
    const px = e.clientX - r.left;
    const py = e.clientY - r.top;
    for (const { hd, i } of list) {
      const p = hd.pos(this.runner.state, this.runner.params);
      const [hx, hy] = this.vp.toPx(p.x, p.y);
      const rad = Math.max(hd.radiusPx, e.pointerType === 'mouse' ? 0 : 24);
      if (Math.hypot(px - hx, py - hy) <= rad) return i;
    }
    return -1;
  }

  // ------------------------------------------------------------------ frame

  private resize(): void {
    const r = this.stageWrap.getBoundingClientRect();
    this.dpr = window.devicePixelRatio || 1;
    this.stageW = r.width;
    this.stageH = r.height;
    this.stageCanvas.width = Math.max(1, Math.round(r.width * this.dpr));
    this.stageCanvas.height = Math.max(1, Math.round(r.height * this.dpr));
    this.plots?.resize();
    this.stagePanel?.fit();
  }

  private frame = (now: number): void => {
    const dt = this.last ? Math.min((now - this.last) / 1000, 0.1) : 0;
    this.last = now;
    this.runner.advance(dt);
    this.render();
    this.raf = requestAnimationFrame(this.frame);
  };

  private render(): void {
    const r = this.runner;
    const scene = this.scene;
    const p = r.params;
    const hist = r.hist;
    let idx = hist.length - 1;
    let s = r.state;
    const scrubbing = !r.playing && this.scrubT !== null;
    if (scrubbing) {
      idx = hist.indexAtTime(this.scrubT!);
      s = (hist.snap(idx) as typeof s | undefined) ?? s;
    }
    const ts = hist.col('t');
    this.ui.t = r.state.t;
    this.ui.cursorT = ts[idx] ?? r.state.t;
    this.ui.scrubbing = scrubbing;
    this.ui.lecture = isLecture();

    const ctx = this.stageCtx;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.clearRect(0, 0, this.stageW, this.stageH);
    if (this.stageW > 0 && this.stageH > 0) {
      this.vp.fit(scene.world(p), this.stageW, this.stageH);
      scene.draw(new CanvasDraw(ctx, this.vp), s, p, this.ui);
    }
    if (this.stagePanel && scene.overlay) this.stagePanel.update(scene.overlay(s, p));

    if (this.plots) {
      const tEnd = r.tEnd;
      const win = scene.time?.window ?? 10;
      // A zero-length run (e.g. a projectile that lands at once) still needs a non-empty time axis.
      const tRange: [number, number] = tEnd !== undefined ? [0, tEnd > 0 ? tEnd : 1] : [Math.max(0, this.ui.t - win), Math.max(win, this.ui.t)];
      this.plots.render({ hist, p, ui: this.ui, idx, tRange });
    }

    if (this.timeVal) this.timeVal.textContent = this.ui.cursorT.toFixed(2);
    (scene.readouts ?? []).forEach((spec, i) => {
      this.readoutVals[i].textContent = fmt(spec.value(s, p), spec.sig ?? 3);
    });
    if (this.playBtn && this.shownPlaying !== r.playing) {
      this.shownPlaying = r.playing;
      this.playBtn.innerHTML = r.playing ? ICON.pause : ICON.play;
      const lbl = `${r.playing ? t('ui.pause') : t('ui.play')} (Space)`;
      this.playBtn.setAttribute('aria-label', lbl);
      this.playBtn.title = lbl;
    }
  }
}
