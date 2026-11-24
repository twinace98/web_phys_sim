// QA 2026-11-24, P3 (polish), Ch 2–11: Σ lines that reproduce their printed result over the whole run
// (R5b), one string per quantity (R8), slider defaults on their grid, a non-drag control for every
// draggable input, at most 2 main controls in Ch 11, and the stage fixes (arrows, labels, strobe).
import { describe, expect, it } from 'vitest';
import { defaults } from '../src/core/params';
import { Runner } from '../src/core/runner';
import type { NumberParam, Params, Scene, Vec2 } from '../src/core/types';
import type { ArrowStyle } from '../src/draw/draw';
import { CHAPTERS } from '../src/sims/registry';
import { freefall } from '../src/sims/ch02/freefall';
import { relative } from '../src/sims/ch04/relative';
import { frames } from '../src/sims/ch05/frames';
import { circular, layout } from '../src/sims/ch06/circular';
import { workEnergy } from '../src/sims/ch07/scene';
import { makeSetup, trajectory } from '../src/sims/ch07/physics';
import { energyScene } from '../src/sims/ch08/energy';
import { pathScene } from '../src/sims/ch08/path';
import { POTENTIALS, turningPoints } from '../src/sims/ch08/physics';
import { parallelScene } from '../src/sims/ch10/parallel';
import { rotorScene, runTime } from '../src/sims/ch10/rotor';
import { ProbeDraw, probe } from './stage-probe';
import { ALLOW, evalTex, parts, recomputes } from './sigma-policy';

const pages = async () => Promise.all(CHAPTERS.filter((m) => m.ch >= 2 && m.ch <= 11).map(async (m) => ({ ch: m.ch, page: await m.load!() })));

/** Runner at defaults + over, `steps` physics steps on. */
function run(sc: Scene, over: Params, steps: number) {
  const r = new Runner(sc, { ...(defaults(sc.params) as Params), ...over } as never, 1);
  if (sc.time && steps > 0) {
    r.play();
    for (let i = 0; i < steps && r.playing; i++) r.advance(sc.time.h);
  }
  return r;
}

/** Lines of the Σ panel whose printed arithmetic misses the printed result (1 % or 1 unit in the last digit). */
function misses(key: string, lines: string[]): string[] {
  const out: string[] = [];
  for (const l of lines)
    for (const pt of parts(l)) {
      if (pt.inRaw === undefined || !pt.res || !pt.inp.length) continue;
      if (ALLOW.some((a) => a.scene === key && a.checks.includes('recompute') && a.lhs.test(pt.lhs.trim()))) continue;
      const v = evalTex(pt.inRaw);
      if (v !== undefined && !recomputes(pt.resDeg ? v / (Math.PI / 180) : v, pt.res)) out.push(pt.sub);
    }
  return out;
}

describe('Σ recomputation over the whole run (QA: 3-figure rounding beyond 1 %, cancelling lines in Ch 2, 4–9, 11)', () => {
  it('every Ch 2–11 scene at defaults, min and max of each number, every option and toggle, every 9th step', async () => {
    const bad: string[] = [];
    for (const { ch, page } of await pages())
      for (const sc of page.scenes as Scene[]) {
        if (!sc.formula) continue;
        const base = defaults(sc.params) as Params;
        const cases: Params[] = [{}];
        for (const [k, spec] of Object.entries(sc.params)) {
          if (spec.kind === 'number' && spec.control !== 'select') cases.push({ [k]: spec.min ?? 0 }, { [k]: spec.max ?? 1 });
          if (spec.kind === 'select') for (const o of spec.options) cases.push({ [k]: o.value });
          if (spec.kind === 'toggle') cases.push({ [k]: !base[k] });
        }
        for (const over of cases) {
          const r = new Runner(sc, { ...base, ...over } as never, 1);
          const look = () => {
            for (const m of misses(`${ch}/${sc.id}`, sc.formula!(r.state as never, r.params as never))) bad.push(`${ch}/${sc.id} ${JSON.stringify(over)} t=${r.state.t.toFixed(3)}: ${m}`);
          };
          look();
          if (!sc.time) continue;
          r.play();
          for (let i = 0; i < 3000 && r.playing; i++) {
            r.advance(sc.time.h);
            if (i % 9 === 0) look();
          }
          look();
        }
      }
    expect([...new Set(bad)].slice(0, 20)).toEqual([]);
  }, 300_000);

  it('the quoted lines: friction (F − f_k)/m, 2nd law x = ½at², relative y = v_BG,y t, track p_tot, roll ω = v/R', async () => {
    const page = async (ch: number, id: string) => (await CHAPTERS.find((m) => m.ch === ch)!.load!()).scenes.find((s) => s.id === id) as Scene;
    // Ch 6 friction, steel, just after the slip.
    const fr = await page(6, 'friction');
    for (let n = 800; n < 1000; n += 3) expect(misses('6/friction', fr.formula!(run(fr, { mat: 'steel' }, n).state as never, { ...defaults(fr.params), mat: 'steel' } as never))).toEqual([]);
    // Ch 5 second law, m = 3 kg, t ≈ 1.02 s: ½ × 1.33 × 1.02² was 0.692 against 0.700.
    const nw = await page(5, 'newton');
    const r5 = run(nw, { m: 3 }, 246);
    expect(misses('5/newton', nw.formula!(r5.state as never, r5.params as never))).toEqual([]);
    // Ch 9 track, m₁ = 0.5 kg, m₂ = 2.7 kg: p_tot after the collision.
    const tr = await page(9, 'track');
    for (const kind of ['elastic', 'inelastic', 'sticky'])
      for (let n = 0; n < 1300; n += 7) {
        const r = run(tr, { kind, m1: 0.5, m2: 2.7 }, n);
        expect(misses('9/track', tr.formula!(r.state as never, r.params as never)), `${kind} ${n}`).toEqual([]);
      }
    // Ch 11 roll: ω = v/R to its last digit (R = 0.12 m).
    const rl = await page(11, 'roll');
    for (let n = 50; n < 600; n += 25) {
      const r = run(rl, { focus: 'hoop' }, n);
      const l = rl.formula!(r.state as never, r.params as never).find((x) => x.startsWith('\\omega = '))!;
      const [, v, R, w] = l.match(/\\frac\{([\d.]+)\}\{([\d.]+)\} = ([\d.]+)/)!;
      const ulp = 10 ** -(w.split('.')[1]?.length ?? 0);
      expect(Math.abs(Number(v) / Number(R) - Number(w)), l).toBeLessThanOrEqual(ulp * (1 + 1e-9));
    }
  }, 120_000);
});

describe('one string per quantity (R8)', () => {
  it('Ch 2 free fall: a = −g prints the constant 9.8 in the Σ panel and the readout', () => {
    const r = run(freefall as Scene, {}, 100);
    const l = freefall.formula!(r.state as never, r.params as never);
    expect(l).toContain('a = -g = -9.8\\ \\mathrm{m/s^2}');
    const ro = freefall.readouts!.find((q) => q.label === 'a')!;
    expect(ro.format!(ro.value(r.state as never, r.params as never), r.state as never, r.params as never)).toBe('−9.8');
    expect(l.join(' ')).not.toContain('9.80');
  });

  it('Ch 4 relative: t in the Σ panel is the clock string (2 decimals) from 1 s on', () => {
    expect(relative.time!.frameStep).toBe(0.05);
    const r = run(relative as Scene, {}, 727); // t = 6.058 s
    const l = relative.formula!(r.state as never, r.params as never);
    expect(l.find((x) => x.startsWith('y = v_{BG,y}'))).toContain('\\times 6.06 = ');
    const end = run(relative as Scene, {}, 1e5);
    expect(relative.formula!(end.state as never, end.params as never).at(-1)).toMatch(/= 11\.55\\ \\mathrm\{s\}$/);
  });

  it('Ch 5 frames: the train-frame Σ uses a and v, the symbols of the readouts and the stage', () => {
    const r = run(frames as Scene, {}, 200);
    const l = frames.formula!(r.state as never, r.params as never);
    const a = frames.readouts!.find((q) => q.label === 'a')!;
    expect(l.find((x) => x.startsWith('a = a_\\text{G} - a_0'))).toContain(`= -1.00\\ \\mathrm{m/s^2}`);
    expect(a.value(r.state as never, r.params as never)).toBe(-1);
    expect(l.join(' ')).not.toMatch(/[av]'/);
  });

  it('Ch 6 cone: r prints with 3 figures on every line (0.414, not 0.41 in ω = v/r)', () => {
    const p = { ...(defaults(circular.params) as Params), preset: 'cone', rot: true } as never;
    const l = circular.formula!({ t: 0 } as never, p);
    const r = l.find((x) => x.startsWith('r = L\\sin'))!.match(/= ([\d.]+)\\ \\mathrm\{m\}$/)![1];
    expect(r.replace('.', '').replace(/^0+/, '').length).toBe(3);
    expect(l.find((x) => x.startsWith('\\omega = '))).toContain(`{${r}}`);
  });
});

describe('slider defaults on the slider grid; non-drag controls; main bar', () => {
  it('every Ch 2–11 slider default sits on its step grid (Ch 6: 8.4462 and 1.6820 did not)', async () => {
    const bad: string[] = [];
    for (const { ch, page } of await pages())
      for (const sc of page.scenes as Scene[])
        for (const [k, spec] of Object.entries(sc.params)) {
          if (spec.kind !== 'number' || spec.control === 'select' || spec.log) continue;
          const n = spec as NumberParam;
          const step = n.step ?? (n.control === 'stepper' ? 1 : 0.01);
          const q = (n.default - (n.min ?? 0)) / step;
          if (Math.abs(q - Math.round(q)) > 1e-6) bad.push(`${ch}/${sc.id} ${k} = ${n.default}`);
        }
    expect(bad).toEqual([]);
  });

  it('every draggable input of Ch 7, 8, 10 also has a slider (QA: drag-only)', () => {
    const sliders = (sc: Scene, keys: string[]) =>
      keys.forEach((k) => expect((sc.params as Record<string, NumberParam>)[k], `${sc.id} ${k}`).toMatchObject({ kind: 'number', control: 'slider' }));
    sliders(workEnergy as Scene, ['F1', 'F2', 'F3', 'F4']);
    sliders(energyScene as Scene, ['x0Double', 'x0Hill']);
    sliders(pathScene as Scene, ['viaX', 'viaY']);
    sliders(parallelScene as Scene, ['d']);
    for (const sc of [workEnergy, energyScene, pathScene, parallelScene] as Scene[])
      for (const [k, spec] of Object.entries(sc.params)) expect(spec.kind === 'array' || spec.group === 'hidden', `${sc.id} ${k}`).toBe(false);
    // A drag sets the same slider: the custom handle of segment 3, the particle, the waypoint.
    const set: Record<string, unknown> = {};
    const ctx = (params: Params) => ({ params, set: (k: string, v: unknown) => (set[k] = v) });
    workEnergy.handles![2].onDrag(ctx({ ...defaults(workEnergy.params), preset: 'custom' } as never) as never, {} as never, { x: 5, y: 5.3 });
    expect(set.F3).toBe(2);
    energyScene.handles![0].onDrag(ctx({ ...defaults(energyScene.params), pot: 'hill' } as never) as never, {} as never, { x: 1.23, y: 0 });
    expect(set.x0Hill).toBe(1.25);
    pathScene.handles![0].onDrag(ctx({ ...defaults(pathScene.params), path: 'custom' } as never) as never, {} as never, { x: -0.52, y: 2.04 });
    expect([set.viaX, set.viaY]).toEqual([-0.5, 2]);
  });

  it('Ch 11: at most 2 main controls visible in every scene and system', async () => {
    const ch11 = await CHAPTERS.find((m) => m.ch === 11)!.load!();
    for (const sc of ch11.scenes as Scene[]) {
      const base = defaults(sc.params) as Params;
      const variants: Params[] = [base];
      for (const [k, spec] of Object.entries(sc.params)) if (spec.kind === 'select') for (const o of spec.options) variants.push({ ...base, [k]: o.value });
      for (const p of variants) {
        const main = Object.entries(sc.params).filter(([, s]) => s.group === 'main' && (s.visibleIf?.(p) ?? true));
        expect(main.length, `${sc.id} ${JSON.stringify(p)}: ${main.map(([k]) => k)}`).toBeLessThanOrEqual(2);
      }
    }
  });

  it('Ch 11 spin: no readout that never changes (L); K changes with the radius', async () => {
    const ch11 = await CHAPTERS.find((m) => m.ch === 11)!.load!();
    const sp = ch11.scenes.find((s) => s.id === 'spin') as Scene;
    expect(sp.readouts!.map((r) => r.label)).not.toContain('L');
    const K = sp.readouts!.find((r) => r.label === 'K')!;
    const a = run(sp, {}, 0);
    const b = run(sp, {}, 2000);
    expect(K.value(b.state as never, b.params as never)).toBeGreaterThan(1.5 * K.value(a.state as never, a.params as never));
  });
});

describe('runs and stops', () => {
  it('Ch 10 rotor: at least 2 s to watch (0.600 s at τ = 1, m = 0.5, r_A = 0.2), at most 6 s', () => {
    expect(runTime({ tau: 1, m: 0.5, rA: 0.2, rB: 1 })).toBe(2);
    expect(runTime(defaults(rotorScene.params) as never)).toBe(6);
  });

  it('Ch 7 custom: K = 0 exactly on a segment edge with no force beyond it ends the run there (not 11 s at rest)', () => {
    const tj = trajectory(makeSetup('custom', [-0.5, 0, 0, 0]), 240, 15);
    expect(tj.tEnd).toBeLessThan(4.1);
    expect(tj.v[tj.n - 1]).toBe(0);
    expect(tj.x[tj.n - 1]).toBe(2);
    // A force beyond the edge sends it back (−) or on (+): the run goes on.
    expect(trajectory(makeSetup('custom', [-0.5, -1, 0, 0]), 240, 15).tEnd).toBeGreaterThan(5);
  });

  it('Ch 8 energy: at t = 0 both turning points show (the start and the far side)', () => {
    for (const [pot, x0] of [
      ['double', -2.7],
      ['double', -1.5],
      ['hill', 2.9],
      ['hill', -2.3],
    ] as const) {
      const P = POTENTIALS[pot];
      const tp = turningPoints(P, P.U(x0), x0);
      expect(tp.filter((q) => q !== null).length, `${pot} ${x0}`).toBe(pot === 'hill' && x0 < 0 ? 1 : 2);
      expect(tp.some((q) => q !== null && Math.abs(q - x0) < 1e-6), `${pot} ${x0}`).toBe(true);
    }
  });
});

/** ProbeDraw that also keeps where each arrow starts (world) and each circle (canvas px). */
class ArrowProbe extends ProbeDraw {
  readonly arrows: { from: Vec2; vec: Vec2; st: ArrowStyle }[] = [];
  readonly circles: { x: number; y: number; r: number }[] = [];
  arrow(from: Vec2, vec: Vec2, st: ArrowStyle = {}): void {
    this.arrows.push({ from, vec, st });
    super.arrow(from, vec, st);
  }
  circle(c: Vec2, r: number): void {
    const [x, y] = this.vp.toPx(c.x, c.y);
    this.circles.push({ x, y, r });
  }
}

/** Draw a scene on a w × h stage with ArrowProbe. */
function shapes(sc: Scene, s: { t: number }, p: Params, w: number, h: number): ArrowProbe {
  const g = new ArrowProbe(w, h);
  g.vp.fit(sc.world(p), w, h);
  sc.draw(g, s as never, p as never, { t: s.t, cursorT: s.t, scrubbing: false, lecture: false });
  return g;
}

describe('stage', () => {
  it('Ch 5 frames: the pseudo force arrow reaches 14 px beyond the faded ball (was 5 px)', () => {
    for (const [w, h] of [
      [1280, 192],
      [390, 253],
    ]) {
      const p = { ...(defaults(frames.params) as Params), fbd: true, A: 0.5 } as never;
      const g = new ArrowProbe(w, h);
      g.vp.fit(frames.world(p), w, h);
      frames.draw(g, { t: 0.5, n: 120 } as never, p, { t: 0.5, cursorT: 0.5, scrubbing: false, lecture: false });
      const ps = g.arrows.find((a) => a.st.dash && a.vec.y === 0 && a.vec.x < 0)!;
      expect(Math.abs(ps.vec.x) / g.px(1)).toBeGreaterThanOrEqual(9 + 14 - 1e-9);
    }
  });

  it('Ch 6 banked curve: the net-force arrow starts at the car edge; the side view shows f_s cos θ', () => {
    for (const v of [4, 8.45, 11]) {
      const p = { ...(defaults(circular.params) as Params), preset: 'banked', vBanked: v } as Params;
      const g = shapes(circular as Scene, { t: 0 }, p, 1280, 704);
      const comp = g.marks.filter((m) => m.text === '*f*_{s} cos*θ*');
      // At 8.45 m/s, 0.05 % above the design speed, f_s is 3 N: its component is too short to label apart.
      expect(comp.length, `${v}`).toBe(1);
      const net = g.arrows.find((a) => a.st.width === 3.5)!;
      // The car sits on the circle (radius 1 in panel units): the arrow starts 0.06 r inside it.
      const [fx, fy] = g.vp.toPx(net.from.x, net.from.y);
      const c = g.circles.find((q) => q.r === 3)!;
      const { s: scale } = layout(1280, 704, false);
      expect(Math.hypot(fx - c.x, fy - c.y) / scale).toBeCloseTo(0.94, 3);
    }
  });

  it('Ch 6 rotating frame, phone: just after the release F_Cor keeps off the ground ring and its marks', () => {
    const p = { ...(defaults(circular.params) as Params), rot: true, cut: true } as Params;
    const { s: scale } = layout(390, 636, true);
    let seen = 0;
    for (const t of [0.53, 0.55, 0.58, 0.6, 0.65, 0.7]) {
      const g = shapes(circular as Scene, { t, n: Math.round(t * 240) } as never, p, 390, 636);
      const m = g.marks.find((k) => k.text === '*F*_{Cor}');
      if (!m) continue;
      seen++;
      // Centre of the rotating top view: the second 3 px grey dot (axis marks of the two panels).
      const c = g.circles.filter((q) => q.r === 3)[1];
      const d = Math.hypot(m.x + m.w / 2 - c.x, m.y - c.y);
      // Ring marks reach 0.07 r either side of the ring; the label is 13 px text (±7 px).
      expect(Math.abs(d - scale), `t = ${t}: ${d.toFixed(1)} px from the centre, ring at ${scale.toFixed(1)}`).toBeGreaterThan(0.07 * scale + 7);
    }
    expect(seen).toBeGreaterThan(3);
  });

  it('Ch 2 free fall: a small stage spaces the strobe images 0.2 s apart with smaller marks (0.1 s on the desktop)', () => {
    const p = defaults(freefall.params) as Params;
    const s = { t: 2, n: 480, y: 0.4, v: -19.6, a: -9.8 };
    const strobe = (w: number, h: number) => shapes(freefall as Scene, s, p, w, h).circles.filter((c) => c.r === 3 || c.r === 4);
    const desk = strobe(768, 668);
    const phone = strobe(390, 253);
    expect(desk.length).toBe(21);
    expect(desk.every((c) => c.r === 4)).toBe(true);
    expect(phone.length).toBe(11);
    expect(phone.every((c) => c.r === 3)).toBe(true);
  });

  it('Ch 7 bars: two long values on the same side part at the gap instead of overlapping (0.005580.00558)', () => {
    const p = { ...(defaults(workEnergy.params) as Params) } as never;
    const win = globalThis as unknown as { window?: unknown };
    win.window = { matchMedia: () => ({ matches: true }) };
    try {
      // Early in the run W = ΔK is a small value with many characters; the two bar labels print it.
      for (const n of [1, 2, 5, 40]) {
        const r = run(workEnergy as Scene, {}, n);
        const g = probe(workEnergy, r.state as never, p, 390, 686);
        const count = new Map<string, number>();
        for (const m of g.marks) if (m.kind === 'text' && /^−?\d+\.\d{2,}/.test(m.text ?? '')) count.set(m.text!, (count.get(m.text!) ?? 0) + 1);
        const pair = [...count].find(([, c]) => c === 2)?.[0];
        expect(pair, `step ${n}`).toBeTruthy();
        const [a, b] = g.marks.filter((m) => m.text === pair).sort((x, y) => x.x - y.x);
        expect(a.x + a.w, `step ${n}: ${pair}`).toBeLessThanOrEqual(b.x);
      }
    } finally {
      delete win.window;
    }
  });
});
