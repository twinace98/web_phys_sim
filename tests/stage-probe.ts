// Test helper: a Draw that records where arrows, arrow labels and texts land on a canvas of a
// given CSS size, so tests can check that nothing is drawn off the stage.
import { Viewport } from '../src/core/viewport';
import type { Params, Scene, Vec2 } from '../src/core/types';
import type { ArrowStyle, Draw, LabelStyle } from '../src/draw/draw';

// Canvas paths are not drawn here; a no-op Path2D lets scenes that build one run under node.
const G = globalThis as unknown as { Path2D?: unknown };
G.Path2D ??= class {
  moveTo(): void {}
  lineTo(): void {}
  closePath(): void {}
  rect(): void {}
  arc(): void {}
};

export type Mark = { kind: string; text?: string; x: number; y: number; w: number };

// Offscreen canvases (hatch patterns) get the same no-op context.
const D = globalThis as unknown as { document?: unknown };
D.document ??= { createElement: () => ({ width: 0, height: 0, getContext: () => fakeCtx(8, 8) }) };

/** Approximate text width [px]: 7 px per character after stripping rich-text markers. */
const textW = (s: string) => s.replace(/[*_{}]/g, '').length * 7;

function fakeCtx(w: number, h: number): CanvasRenderingContext2D {
  const target: Record<string, unknown> = {
    canvas: { clientWidth: w, clientHeight: h, width: w, height: h },
    measureText: (s: string) => ({ width: s.length * 7 }),
  };
  return new Proxy(target, {
    get: (t, k: string) => (k in t ? t[k] : () => undefined),
    set: (t, k: string, v) => {
      t[k] = v;
      return true;
    },
  }) as unknown as CanvasRenderingContext2D;
}

export class ProbeDraw implements Draw {
  readonly ctx: CanvasRenderingContext2D;
  readonly vp = new Viewport();
  readonly marks: Mark[] = [];

  constructor(
    readonly w: number,
    readonly h: number,
  ) {
    this.ctx = fakeCtx(w, h);
  }

  px(n: number): number {
    return n / this.vp.scale;
  }
  line(): void {}
  polyline(): void {}
  circle(): void {}
  polygon(): void {}
  arc(): void {}

  arrow(from: Vec2, vec: Vec2, st: ArrowStyle = {}): void {
    const [x0, y0] = this.vp.toPx(from.x, from.y);
    const [x1, y1] = this.vp.toPx(from.x + vec.x, from.y + vec.y);
    this.marks.push({ kind: 'arrow-tip', x: x1, y: y1, w: 0 });
    const len = Math.hypot(x1 - x0, y1 - y0);
    if (st.label && len >= 0.5) {
      this.marks.push({ kind: 'arrow-label', text: st.label, x: x1 + ((x1 - x0) / len) * 10, y: y1 + ((y1 - y0) / len) * 10, w: textW(st.label) });
    }
  }

  text(p: Vec2, s: string, st: LabelStyle = {}): void {
    const [x, y] = this.vp.toPx(p.x, p.y);
    this.pushText(s, x + (st.dx ?? 0), y + (st.dy ?? 0), st.align);
  }

  screenText(x: number, y: number, s: string, st: LabelStyle = {}): void {
    this.pushText(s, x, y, st.align);
  }

  private pushText(s: string, x: number, y: number, align?: string): void {
    const w = textW(s);
    const x0 = align === 'right' || align === 'end' ? x - w : align === 'center' ? x - w / 2 : x;
    this.marks.push({ kind: 'text', text: s, x: x0, y, w });
  }
}

/** Draw the scene's state on a w × h stage; return the marks. */
export function probe<P extends Params, S extends { t: number }>(scene: Scene<P, S>, s: S, p: P, w: number, h: number): ProbeDraw {
  const g = new ProbeDraw(w, h);
  g.vp.fit(scene.world(p), w, h);
  scene.draw(g, s, p, { t: s.t, cursorT: s.t, scrubbing: false, lecture: false });
  return g;
}

/** Marks (tips, labels, texts) outside the stage by more than `tol` px. */
export function offStage(g: ProbeDraw, tol = 1): string[] {
  const out: string[] = [];
  for (const m of g.marks) {
    if (m.x < -tol || m.x + m.w > g.w + tol || m.y < -tol || m.y > g.h + tol) {
      out.push(`${m.kind}${m.text ? ` "${m.text}"` : ''} at (${m.x.toFixed(0)}, ${m.y.toFixed(0)}) on ${g.w}×${g.h}`);
    }
  }
  return out;
}
