// Drag-to-resize: the info panel (edge grip) and the stage overlay panel (corner grip).
// Sizes persist per browser in localStorage when it is available.
import katex from 'katex';
import { h } from './dom';

function load(key: string): number | null {
  try {
    const v = Number(localStorage.getItem(key));
    return Number.isFinite(v) && v > 0 ? v : null;
  } catch {
    return null;
  }
}

function save(key: string, v: number): void {
  try {
    localStorage.setItem(key, String(Math.round(v * 1000) / 1000));
  } catch {
    /* storage unavailable: size lasts for this page only */
  }
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const narrow = () => window.matchMedia('(max-width: 767px)').matches;

/** Pointer drag on `grip`; `onMove` gets the offset from the press point. */
function onDrag(grip: HTMLElement, onStart: () => void, onMove: (dx: number, dy: number) => void): void {
  let id: number | null = null;
  let x0 = 0;
  let y0 = 0;
  grip.addEventListener('pointerdown', (e) => {
    id = e.pointerId;
    x0 = e.clientX;
    y0 = e.clientY;
    grip.setPointerCapture(e.pointerId);
    grip.classList.add('dragging');
    onStart();
    e.preventDefault();
    e.stopPropagation();
  });
  grip.addEventListener('pointermove', (e) => {
    if (e.pointerId === id) onMove(e.clientX - x0, e.clientY - y0);
  });
  const end = (e: PointerEvent) => {
    if (e.pointerId !== id) return;
    id = null;
    grip.classList.remove('dragging');
  };
  grip.addEventListener('pointerup', end);
  grip.addEventListener('pointercancel', end);
}

/**
 * Side panel: on wide screens the left edge sets its width, on narrow screens (bottom sheet)
 * the top edge sets its height.
 */
export function resizableSidePanel(panel: HTMLElement, key: string, label: string): void {
  const grip = h('div', { class: 'panel-grip', role: 'separator', 'aria-label': label, title: label });
  panel.append(grip);
  panel.dataset.sizeKey = key;
  restoreSize(panel);
  let start = 0;
  onDrag(
    grip,
    () => (start = narrow() ? panel.offsetHeight : panel.offsetWidth),
    (dx, dy) => {
      if (narrow()) {
        const v = clamp(start - dy, window.innerHeight * 0.25, window.innerHeight * 0.92);
        panel.style.height = `${v}px`;
        save(`${key}.h`, v);
      } else {
        const v = clamp(start - dx, 260, window.innerWidth * 0.9);
        panel.style.width = `${v}px`;
        save(`${key}.w`, v);
      }
    },
  );
}

/** Re-apply the stored size of a side panel; panels sharing a key open at the same size. */
export function restoreSize(panel: HTMLElement): void {
  const key = panel.dataset.sizeKey;
  if (!key) return;
  const w = load(`${key}.w`);
  const hh = load(`${key}.h`);
  panel.style.width = !narrow() && w ? `${clamp(w, 260, window.innerWidth * 0.9)}px` : '';
  panel.style.height = narrow() && hh ? `${clamp(hh, window.innerHeight * 0.25, window.innerHeight * 0.92)}px` : '';
}

const GRIP_SVG =
  '<svg viewBox="0 0 12 12" width="12" height="12" aria-hidden="true"><path d="M11 4L4 11M11 8L8 11" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/></svg>';

/**
 * Outlined TeX panel at the top-left of the stage. Dragging its corner scales the panel and
 * its text together. Content is re-rendered only when the TeX changes.
 */
export class StagePanel {
  readonly el: HTMLDivElement;
  private body: HTMLDivElement;
  private tex = '';
  private scale: number;

  constructor(private readonly key: string, label: string) {
    this.el = h('div', { class: 'stage-panel' });
    this.body = h('div', { class: 'stage-panel-body' });
    const grip = h('div', { class: 'stage-panel-grip', role: 'separator', 'aria-label': label, title: label });
    grip.innerHTML = GRIP_SVG;
    this.el.append(this.body, grip);
    this.scale = load(key) ?? 1;
    this.applyScale();
    let w0 = 1;
    let s0 = 1;
    onDrag(
      grip,
      () => {
        w0 = this.el.offsetWidth;
        s0 = this.scale;
      },
      (dx) => {
        this.scale = clamp((s0 * (w0 + dx)) / w0, 0.6, 3);
        this.fit();
        save(this.key, this.scale);
      },
    );
  }

  update(tex: string): void {
    if (tex === this.tex) return;
    this.tex = tex;
    katex.render(tex, this.body, { throwOnError: false });
    this.fit();
  }

  /** Apply the chosen scale, shrunk if needed so the panel never overflows the stage. */
  fit(): void {
    this.applyScale();
    const max = (this.el.parentElement?.clientWidth ?? 0) - 20;
    const w = this.el.offsetWidth;
    if (max > 0 && w > max) this.el.style.fontSize = `${(1.05 * this.scale * max) / w}em`;
  }

  private applyScale(): void {
    this.el.style.fontSize = `${1.05 * this.scale}em`;
  }
}
