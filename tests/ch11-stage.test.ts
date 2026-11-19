// Ch 11 stage labels. Tab 1 (spin): the area of each shaded equal-time sector, measured from its
// polygon, and the interval Δt. Tab 2 (roll): β and a beside each lane, finish order and time at the
// finish. Values against the physics, and every new label clear of everything else on the stage at
// the measured stage sizes of 1280×800 and 390×844.
import { describe, expect, it } from 'vitest';
import { defaults } from '../src/core/params';
import type { Vec2 } from '../src/core/types';
import type { ArrowStyle, LabelStyle } from '../src/draw/draw';
import { segHitsBox, type Box } from '../src/sims/ch03/labels';
import { BETA, BODIES, angMom, endTime, finishTime, rollAccel, type Body, type Mode } from '../src/sims/ch11/physics';
import { finishBadges, rollScene } from '../src/sims/ch11/roll';
import { sector, sectorDt, sectorsDone, spinScene } from '../src/sims/ch11/spin';
import { boxHitsPoly } from '../src/sims/ch11/place';
import { register, setLang, t as tr } from '../src/core/i18n';
import en from '../src/i18n/en.json';
import ko from '../src/i18n/ko.json';
import ch11en from '../src/sims/ch11/i18n.en.json';
import ch11ko from '../src/sims/ch11/i18n.ko.json';
import { ProbeDraw } from './stage-probe';

register(ko, en);
register(ch11ko, ch11en);

/** Stage (canvas) sizes measured in the browser at 1280×800 and 390×844. */
const SPIN_SIZES = [
  [768, 679],
  [768, 642], // English labels wrap the control bar
  [390, 253],
];
const ROLL_SIZES = [
  [768, 644],
  [390, 253],
];

type TextMark = { text: string; box: Box };
type Seg = [number, number, number, number];

/** Probe that keeps every text box (7 px per character, 14 px tall), segment and disc. */
class Rec extends ProbeDraw {
  texts: TextMark[] = [];
  segs: { seg: Seg; what: string }[] = [];
  discs: { x: number; y: number; r: number }[] = [];
  polys: [number, number][][] = [];

  private box(s: string, x: number, y: number, st: LabelStyle): Box {
    const w = s.replace(/[*_{}]/g, '').length * 7;
    const h = 14;
    const x0 = st.align === 'center' ? x - w / 2 : st.align === 'right' ? x - w : x;
    const y0 = st.baseline === 'middle' ? y - h / 2 : st.baseline === 'top' ? y : y - h * 0.8;
    return { x0, y0, x1: x0 + w, y1: y0 + h };
  }
  override text(p: Vec2, s: string, st: LabelStyle = {}): void {
    super.text(p, s, st);
    const [x, y] = this.vp.toPx(p.x, p.y);
    this.texts.push({ text: s, box: this.box(s, x + (st.dx ?? 0), y + (st.dy ?? 0), st) });
  }
  override screenText(x: number, y: number, s: string, st: LabelStyle = {}): void {
    super.screenText(x, y, s, st);
    this.texts.push({ text: s, box: this.box(s, x, y, st) });
  }
  override arrow(from: Vec2, vec: Vec2, st: ArrowStyle = {}): void {
    super.arrow(from, vec, st);
    const [x0, y0] = this.vp.toPx(from.x, from.y);
    const [x1, y1] = this.vp.toPx(from.x + vec.x, from.y + vec.y);
    this.segs.push({ seg: [x0, y0, x1, y1], what: 'arrow' });
    const len = Math.hypot(x1 - x0, y1 - y0);
    if (st.label && len >= 0.5) this.texts.push({ text: st.label, box: this.box(st.label, x1 + ((x1 - x0) / len) * 10, y1 + ((y1 - y0) / len) * 10, { align: 'center', baseline: 'middle' }) });
  }
  override line(...a: unknown[]): void {
    const [p, q] = a as [Vec2, Vec2];
    this.polyline([p, q]);
  }
  override polyline(...a: unknown[]): void {
    const pts = a[0] as Vec2[];
    // The faint guide rings (closed, 97 points) are not obstacles.
    const ring = pts.length === 97 && Math.hypot(pts[0].x - pts[96].x, pts[0].y - pts[96].y) < 1e-9;
    for (let i = 1; i < pts.length; i++) {
      const [ax, ay] = this.vp.toPx(pts[i - 1].x, pts[i - 1].y);
      const [bx, by] = this.vp.toPx(pts[i].x, pts[i].y);
      this.segs.push({ seg: [ax, ay, bx, by], what: ring ? 'ring' : 'line' });
    }
  }
  override circle(c: Vec2, rPx: number): void {
    const [x, y] = this.vp.toPx(c.x, c.y);
    this.discs.push({ x, y, r: rPx });
  }
  override polygon(pts: Vec2[]): void {
    this.polys.push(pts.map((q) => this.vp.toPx(q.x, q.y)));
  }
}

const overlap = (a: Box, b: Box) => a.x0 < b.x1 - 0.5 && b.x0 < a.x1 - 0.5 && a.y0 < b.y1 - 0.5 && b.y0 < a.y1 - 0.5;
const discHits = (b: Box, d: { x: number; y: number; r: number }) => {
  const dx = Math.max(b.x0 - d.x, 0, d.x - b.x1);
  const dy = Math.max(b.y0 - d.y, 0, d.y - b.y1);
  return dx * dx + dy * dy < d.r * d.r;
};

function draw<P, S extends { t: number }>(scene: { world: (p: P) => any; draw: (...a: any[]) => void }, s: S, p: P, w: number, h: number): Rec {
  const g = new Rec(w, h);
  (g.ctx as unknown as Record<string, unknown>).createRadialGradient = () => ({ addColorStop: () => undefined });
  g.vp.fit(scene.world(p), w, h);
  scene.draw(g, s, p, { t: s.t, cursorT: s.t, scrubbing: false, lecture: false });
  return g;
}

/** Problems of the texts picked by `mine`: off the stage, or touching another text, a segment or a disc. */
function clashes(g: Rec, mine: (t: string) => boolean, tag: string, opts: { segs?: boolean; discs?: boolean; polys?: boolean } = {}): string[] {
  const out: string[] = [];
  const own = g.texts.filter((t) => mine(t.text));
  for (const m of own) {
    const b = m.box;
    if (b.x0 < 0 || b.y0 < 0 || b.x1 > g.w || b.y1 > g.h) out.push(`${tag}: "${m.text}" off stage`);
    for (const o of g.texts) if (o !== m && overlap(o.box, b)) out.push(`${tag}: "${m.text}" / "${o.text}"`);
    if (opts.segs !== false) for (const s of g.segs) if (s.what !== 'ring' && segHitsBox(s.seg, { x0: b.x0 + 0.5, y0: b.y0 + 0.5, x1: b.x1 - 0.5, y1: b.y1 - 0.5 })) out.push(`${tag}: "${m.text}" on a ${s.what}`);
    // A badge digit sits on its own disc.
    const cx = (b.x0 + b.x1) / 2;
    const cy = (b.y0 + b.y1) / 2;
    if (opts.discs !== false) for (const d of g.discs) if (!(Math.abs(d.x - cx) < 0.5 && Math.abs(d.y - cy) < 0.5) && discHits(b, d)) out.push(`${tag}: "${m.text}" on a disc`);
    if (opts.polys) for (const q of g.polys) if (boxHitsPoly({ x0: b.x0 + 0.5, y0: b.y0 + 0.5, x1: b.x1 - 0.5, y1: b.y1 - 0.5 }, q)) out.push(`${tag}: "${m.text}" on a lane or body`);
  }
  return out;
}

// ------------------------------------------------------------------ tab 1: equal areas

type SpinP = Record<string, unknown> & { mode: string; rIn: number; wOut: number; m: number; areas: boolean };
const spinBase = defaults(spinScene.params) as unknown as SpinP;
const H = spinScene.time!.h;
const isArea = (s: string) => s.endsWith(' m²');

describe('Ch 11 spin: swept areas written on the stage', () => {
  it('the toggle is on the main bar and on by default', () => {
    expect(spinScene.params.areas).toMatchObject({ kind: 'toggle', group: 'main', default: true });
  });

  it('every sector polygon has area L Δt / 2m to 0.05 % (modes, r_in, ω, m, whole run)', () => {
    let worst = 0;
    for (const mode of ['pull', 'release', 'both'] as Mode[])
      for (const rIn of [0.3, 0.55, 0.8])
        for (const wOut of [1, 2.3, 3])
          for (const m of [0.1, 0.3, 0.5]) {
            const p = { ...spinBase, mode, rIn, wOut, m };
            const dt = sectorDt(p as never);
            // Δt is a whole number of physics steps and the fastest sector spans at most 1 rad.
            expect(Math.abs(dt / H - Math.round(dt / H))).toBeLessThan(1e-9);
            expect(wOut * dt / rIn ** 2).toBeLessThanOrEqual(1 + 1e-9);
            const L = angMom({ mode, m, rOut: 1, rIn, wOut, tRamp: 3, tHold: 2 });
            const want = (L * dt) / (2 * m);
            const nEnd = Math.round(endTime({ mode, m, rOut: 1, rIn, wOut, tRamp: 3, tHold: 2 }) / H);
            for (const k of sectorsDone(p as never, nEnd)) worst = Math.max(worst, Math.abs(sector(p as never, k).A / want - 1));
            for (const f of [0.2, 0.45, 0.6, 0.8]) for (const k of sectorsDone(p as never, Math.round(nEnd * f))) worst = Math.max(worst, Math.abs(sector(p as never, k).A / want - 1));
          }
    expect(worst).toBeLessThan(5e-4);
  });

  it('labels: at least two (all six where they fit), all the same text, clear of puck, string, arrows, path and each other', () => {
    const bad: string[] = [];
    const counts: number[] = [];
    for (const mode of ['pull', 'release', 'both'] as Mode[])
      for (const rIn of [0.3, 0.55, 0.8])
        for (const wOut of [1, 2, 3])
          for (const m of [0.1, 0.5]) {
            const p = { ...spinBase, mode, rIn, wOut, m };
            const nEnd = Math.round(endTime({ mode, m, rOut: 1, rIn, wOut, tRamp: 3, tHold: 2 }) / H);
            for (const f of [0.05, 0.2, 0.3, 0.38, 0.45, 0.52, 0.6, 0.7, 0.8, 0.9, 1]) {
              const n = Math.round(nEnd * f);
              const st = spinScene.init(p as never, undefined as never);
              for (let i = 0; i < n; i++) spinScene.step!(st, H, p as never);
              const shown = sectorsDone(p as never, n).length;
              for (const [w, h] of SPIN_SIZES) {
                const tag = `${mode} rIn=${rIn} ω=${wOut} m=${m} n=${n} ${w}px`;
                const g = draw(spinScene, st, p as never, w, h);
                const labels = g.texts.filter((t) => isArea(t.text));
                counts.push(labels.length);
                if (labels.length < Math.min(2, shown)) bad.push(`${tag}: ${labels.length} labels for ${shown} sectors`);
                if (new Set(labels.map((l) => l.text)).size > 1) bad.push(`${tag}: ${labels.map((l) => l.text).join(', ')}`);
                bad.push(...clashes(g, (t) => isArea(t) || t.startsWith('Δ'), tag));
              }
            }
          }
    expect(bad).toEqual([]);
    console.log('label counts', JSON.stringify(Object.entries(counts.reduce((a: Record<number, number>, c) => ((a[c] = (a[c] ?? 0) + 1), a), {}))));
  });
});

describe('Ch 11 spin: Δt marker and the toggle', () => {
  it('Δt on the stage with the areas; neither Δt nor areas with the toggle off or for the chair', () => {
    const p = { ...spinBase };
    const st = spinScene.init(p as never, undefined as never);
    for (let i = 0; i < 1000; i++) spinScene.step!(st, H, p as never);
    const on = draw(spinScene, st, p as never, 768, 679);
    expect(on.texts.filter((t) => t.text === `Δ*t* = ${sectorDt(p as never)} s`)).toHaveLength(1);
    expect(sectorDt(p as never)).toBe(0.125);
    expect(on.texts.filter((t) => isArea(t.text)).map((t) => t.text)).toEqual(Array(6).fill('0.125 m²'));
    const off = draw(spinScene, st, { ...p, areas: false } as never, 768, 679);
    expect(off.texts.some((t) => isArea(t.text) || t.text.startsWith('Δ'))).toBe(false);
    const chair = { ...p, sys: 'chair' };
    const sc = spinScene.init(chair as never, undefined as never);
    for (let i = 0; i < 600; i++) spinScene.step!(sc, H, chair as never);
    expect(draw(spinScene, sc, chair as never, 768, 679).texts.some((t) => isArea(t.text) || t.text.startsWith('Δ'))).toBe(false);
  });
});

// ------------------------------------------------------------------ tab 2: rolling race

type RollP = { theta: number; focus: string; fbd: boolean };
const rollBase = defaults(rollScene.params) as unknown as RollP;
const inc = (deg: number) => ({ theta: (deg * Math.PI) / 180, len: 1.6, R: 0.12, M: 1 });
const FRAC: Record<Body, string> = { hoop: '1', disk: '1/2', sphere: '2/5', block: '0' };
const isTag = (s: string) => s.includes('*β* =') || s.startsWith('*a* =');
const isBadge = (s: string) => /^[1-4]$/.test(s);

const drawRoll = (p: RollP, t: number, w: number, h: number): Rec => draw(rollScene, { t, n: 0 }, p, w, h);

const segDist = (x: number, y: number, [ax, ay, bx, by]: Seg) => {
  const dx = bx - ax;
  const dy = by - ay;
  const l2 = dx * dx + dy * dy;
  const k = l2 > 0 ? Math.min(1, Math.max(0, ((x - ax) * dx + (y - ay) * dy) / l2)) : 0;
  return Math.hypot(x - ax - k * dx, y - ay - k * dy);
};

/** Problems of the finish badges (7 px discs under their digits): off the stage or touching anything else. */
function badgeClashes(g: Rec, tag: string): string[] {
  const out: string[] = [];
  for (const m of g.texts.filter((t) => isBadge(t.text))) {
    const x = (m.box.x0 + m.box.x1) / 2;
    const y = (m.box.y0 + m.box.y1) / 2;
    const r = 7;
    const say = (what: string) => out.push(`${tag}: badge ${m.text} ${what}`);
    if (x - r < 0 || y - r < 0 || x + r > g.w || y + r > g.h) say('off stage');
    for (const o of g.texts) if (o !== m && discHits(o.box, { x, y, r })) say(`on "${o.text}"`);
    for (const s of g.segs) if (s.what !== 'ring' && segDist(x, y, s.seg) < r) say(`on a ${s.what}`);
    for (const d of g.discs) if (!(Math.abs(d.x - x) < 0.5 && Math.abs(d.y - y) < 0.5) && Math.hypot(d.x - x, d.y - y) < d.r + r) say('on a disc');
    for (const q of g.polys) if (q.some((v, i) => segDist(x, y, [v[0], v[1], q[(i + 1) % q.length][0], q[(i + 1) % q.length][1]]) < r)) say('on a lane or body');
  }
  return out;
}

describe('Ch 11 roll: β, a and finish order on the stage', () => {
  it('each lane tag names its body with β and a = g sin θ / (1 + β) from rollAccel (θ = 5°, 22°, 40°; ko, en)', () => {
    for (const lang of ['ko', 'en'] as const) {
      setLang(lang);
      for (const theta of [5, 22, 40]) {
        const g = drawRoll({ ...rollBase, theta }, 0, 768, 644);
        const tags = g.texts.filter((t) => isTag(t.text)).map((t) => t.text);
        expect(tags).toHaveLength(8);
        for (const b of BODIES) {
          expect(tags).toContain(`${tr(`ch11.r.tag.${b}`)} *β* = ${FRAC[b]}`);
          expect(BETA[b]).toBeCloseTo(eval(FRAC[b]), 12);
          const a = rollAccel(BETA[b], (theta * Math.PI) / 180).a;
          const shown = tags.find((x) => x.startsWith('*a* =') && Math.abs(parseFloat(x.slice(6)) / a - 1) < 5e-3);
          expect(shown, `${b} ${theta}°`).toBeDefined();
        }
        // Larger β, smaller a: the a values in the order block, sphere, disk, hoop fall.
        const as = ['block', 'sphere', 'disk', 'hoop'].map((b) => rollAccel(BETA[b as Body], (theta * Math.PI) / 180).a);
        for (let i = 1; i < 4; i++) expect(as[i]).toBeLessThan(as[i - 1]);
      }
    }
    setLang('ko');
  });

  it('finish badges 1-4 appear as each body crosses the line, in the order block, sphere, disk, hoop', () => {
    for (const theta of [5, 22, 40]) {
      const p = { ...rollBase, theta };
      const tf = BODIES.map((b) => [b, finishTime(inc(theta), b)] as const).sort((x, y) => x[1] - y[1]);
      expect(tf.map((x) => x[0])).toEqual(['block', 'sphere', 'disk', 'hoop']);
      for (const [w, h] of ROLL_SIZES) {
        // Just before and just after each finish.
        for (let j = 0; j < 4; j++) {
          for (const [dt, count] of [
            [-1e-3, j],
            [1e-3, j + 1],
          ] as const) {
            const g = drawRoll(p, tf[j][1] + dt, w, h);
            const digits = g.texts.filter((t) => isBadge(t.text));
            expect(digits.map((d) => d.text).sort()).toEqual(['1', '2', '3', '4'].slice(0, count));
          }
        }
        // Each digit sits at its own body's badge.
        const g = drawRoll(p, 2 * tf[3][1], w, h);
        const badges = finishBadges(g, p as never);
        tf.forEach(([b], j) => {
          const [x, y] = g.vp.toPx(badges.get(b)!.x, badges.get(b)!.y);
          const d = g.texts.find((t) => t.text === String(j + 1))!;
          expect(Math.hypot((d.box.x0 + d.box.x1) / 2 - x, (d.box.y0 + d.box.y1) / 2 - y)).toBeLessThan(0.5);
        });
      }
    }
  });

  it('tags and badges clear of each other, lanes, bodies, arrows and labels: 1280 and 390, start, mid-run, end, every body, with and without the diagram, ko and en', () => {
    const bad: string[] = [];
    for (const lang of ['ko', 'en'] as const) {
      setLang(lang);
      for (const theta of [5, 14, 30, 40])
        for (const focus of BODIES)
          for (const fbd of [false, true]) {
            const p = { ...rollBase, theta, focus, fbd };
            const tEnd = 1.03 * finishTime(inc(theta), 'hoop');
            for (const f of [0, 0.25, 0.5, 0.72, 0.76, 0.8, 0.83, 0.86, 0.89, 0.92, 0.95, 1])
              for (const [w, h] of ROLL_SIZES) {
                const g = drawRoll(p, f * tEnd, w, h);
                const tag = `${lang} θ=${theta} ${focus} fbd=${fbd} t=${(f * tEnd).toFixed(2)} ${w}px`;
                bad.push(...clashes(g, isTag, tag, { polys: true }), ...badgeClashes(g, tag));
              }
          }
    }
    setLang('ko');
    expect(bad).toEqual([]);
  });
});

describe('Ch 11 ⓘ: the new stage marks are named', () => {
  it('Δt, β, a and the finish numbers appear in the ⓘ lines and the toggle description (ko, en)', () => {
    for (const d of [ch11ko, ch11en] as Record<string, string>[]) {
      expect(d['ch11.s.obs.area']).toContain('$\\Delta t$');
      expect(d['ch11.d.areas']).toContain('$\\Delta t$');
      expect(d['ch11.r.goal.race']).toMatch(/\$\\beta\$.*\$a\$/);
      expect(d['ch11.r.obs.order']).toContain('1–4');
      for (const v of Object.values(d)) expect(v).not.toContain('—');
    }
  });
});
