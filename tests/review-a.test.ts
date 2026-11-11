// Regression tests for the 2026-11-11 review fixes (group A: shell, Ch 2–5, Ch 7).
import { describe, expect, it } from 'vitest';
import { clockDecimals, fmtClock } from '../src/core/format';
import { defaults } from '../src/core/params';
import { Runner } from '../src/core/runner';
import type { Params, Scene } from '../src/core/types';
import { nearestHandle } from '../src/shell/hit';
import { RELOAD_KEY, RELOAD_WINDOW, reloadOnce } from '../src/shell/reload';
import { freefall } from '../src/sims/ch02/freefall';
import { kinematics } from '../src/sims/ch02/scene';
import { componentsScene } from '../src/sims/ch03/scene';
import { aArrowLen, circular } from '../src/sims/ch04/circular';
import { crossingTime, vBG } from '../src/sims/ch04/physics';
import { relative } from '../src/sims/ch04/relative';
import { projectile } from '../src/sims/ch04/scene';
import { newton } from '../src/sims/ch05/newton';
import { third } from '../src/sims/ch05/third';
import { workEnergy } from '../src/sims/ch07/scene';
import { register } from '../src/core/i18n';
import en from '../src/i18n/en.json';
import ko from '../src/i18n/ko.json';
import ch04en from '../src/sims/ch04/i18n.en.json';
import ch04ko from '../src/sims/ch04/i18n.ko.json';
import { offStage, probe } from './stage-probe';

register(ko, en);
register(ch04ko, ch04en);

// ------------------------------------------------------------------ shell

class MemStore {
  m = new Map<string, string>();
  getItem(k: string) {
    return this.m.get(k) ?? null;
  }
  setItem(k: string, v: string) {
    this.m.set(k, v);
  }
  removeItem(k: string) {
    this.m.delete(k);
  }
}

describe('stale-chunk reload guard', () => {
  it('reloads once, then refuses within the window, then allows again', () => {
    const st = new MemStore();
    let n = 0;
    expect(reloadOnce(st, 1000, () => n++)).toBe(true);
    expect(n).toBe(1);
    expect(st.getItem(RELOAD_KEY)).toBe('1000');
    // The reloaded page fails again: no second reload (no loop), the caller shows the error.
    expect(reloadOnce(st, 3000, () => n++)).toBe(false);
    expect(n).toBe(1);
    // A later redeploy, long after: one more reload is allowed.
    expect(reloadOnce(st, 1000 + RELOAD_WINDOW + 1, () => n++)).toBe(true);
    expect(n).toBe(2);
  });

  it('never reloads without working storage', () => {
    let n = 0;
    expect(reloadOnce(null, 0, () => n++)).toBe(false);
    const broken = {
      getItem: () => null,
      setItem: () => {
        throw new Error('quota');
      },
      removeItem: () => undefined,
    };
    expect(reloadOnce(broken, 0, () => n++)).toBe(false);
    expect(n).toBe(0);
  });
});

describe('stage handle hit test', () => {
  it('picks the nearest of overlapping handles, not the first in the list', () => {
    // Ch 29 solenoid: a wire handle listed before the loop-centre handle, 20 px apart.
    const pts = [
      { i: 0, x: 100, y: 100, r: 12 },
      { i: 1, x: 120, y: 100, r: 14 },
    ];
    expect(nearestHandle(pts, 118, 101, true)).toBe(1);
    expect(nearestHandle(pts, 103, 100, true)).toBe(0);
    // Mouse keeps the handle's own radius.
    expect(nearestHandle(pts, 100, 125, false)).toBe(-1);
    expect(nearestHandle(pts, 100, 122, true)).toBe(0);
  });
});

describe('clock format', () => {
  it('drops meaningless decimals for long runs, keeps them for short ones', () => {
    // Ch 13 orbit: h = 20 s, frame step 200 s, runs of 10⁴–10⁵ s.
    expect(fmtClock(23960, clockDecimals(200, 60000))).toBe('23960');
    // Ch 2 free fall: 0.05 s steps over about 2 s.
    expect(fmtClock(1.2375, clockDecimals(0.05, 2.02))).toBe('1.24');
    // Ch 19: 1 ps steps over 200 ps.
    expect(fmtClock(137.4, clockDecimals(1, 200))).toBe('137');
    // Ch 17 Doppler: 0.005 s steps.
    expect(clockDecimals(0.005, 0.2)).toBe(3);
    expect(fmtClock(-0.0001, 2)).toBe('0.00');
  });

  it('shows the state time, which the readouts use, not the last recorded sample', () => {
    // Ch 4 circular records every 4th step: after 3 steps the last sample is still t = 0.
    const r = new Runner(circular, defaults(circular.params) as any, 1);
    r.play();
    r.advance(3 / 120 + 1e-6);
    const ts = r.hist.col('t');
    expect(ts[ts.length - 1]).toBe(0);
    expect(r.state.t).toBeCloseTo(3 / 120, 9);
  });
});

// ------------------------------------------------------------------ sweeps: nothing off the stage

/** Every number param at min / max / an odd value, every select option, every toggle. */
function sweep(scene: Scene): Params[] {
  const base = defaults(scene.params) as Params;
  const out: Params[] = [base];
  for (const [k, spec] of Object.entries(scene.params)) {
    if (spec.kind === 'number' && spec.control !== 'select') {
      const lo = spec.min ?? 0;
      const hi = spec.max ?? 1;
      for (const v of [lo, hi, lo + 0.37 * (hi - lo)]) out.push({ ...base, [k]: v });
    } else if (spec.kind === 'select') {
      for (const o of spec.options) out.push({ ...base, [k]: o.value });
    } else if (spec.kind === 'toggle') {
      out.push({ ...base, [k]: !base[k] });
    }
  }
  return out;
}

/** Stage sizes seen at 1280×800 and 390×844 for side and stack layouts. */
const SIDE = [
  [768, 640],
  [390, 500],
];
const STACK = [
  [1280, 192],
  [390, 230],
];
const SOLO = [
  [1280, 700],
  [390, 600],
];

function checkStage(scene: Scene, sizes: number[][], extra: Params[] = []): string[] {
  const bad: string[] = [];
  for (const p of [...sweep(scene), ...extra]) {
    const r = new Runner(scene, p as any, 7);
    const shots = [0, 0.25, 0.5, 0.75, 1];
    const tEnd = r.tEnd ?? 10;
    let done = 0;
    for (const f of shots) {
      while (r.state.t < f * tEnd - 1e-9 && !r.done && done < 50000) {
        r.stepFrame();
        done++;
      }
      for (const [w, h] of sizes) {
        for (const m of offStage(probe(scene, r.state, p, w, h))) bad.push(`${JSON.stringify(p)} t=${r.state.t.toFixed(2)}: ${m}`);
      }
    }
  }
  return bad;
}

describe('arrows and labels stay on the stage', () => {
  it('Ch 2 free fall: v and a arrows on landing (P2)', () => {
    expect(checkStage(freefall, SIDE)).toEqual([]);
  });
  it('Ch 2 graphs', () => {
    expect(checkStage(kinematics, STACK)).toEqual([]);
  });
  it('Ch 4 projectile: v and v_y arrows on landing (P2)', () => {
    expect(checkStage(projectile, SIDE)).toEqual([]);
  });
  it('Ch 4 circular and relative', () => {
    expect(checkStage(circular, SOLO)).toEqual([]);
    expect(checkStage(relative, SOLO)).toEqual([]);
  });
  it('Ch 5 third law: cart A v arrow at the left end (P2)', () => {
    expect(checkStage(third, STACK)).toEqual([]);
    expect(checkStage(newton, STACK)).toEqual([]);
  });
  it('Ch 7 work-energy', () => {
    expect(checkStage(workEnergy, SOLO)).toEqual([]);
  });
});

// ------------------------------------------------------------------ physics and labels

describe('Ch 4 fixes', () => {
  it('relative motion: default heading 30°, which cancels the current and lands straight across', () => {
    const p = defaults(relative.params) as any;
    expect(p.heading).toBe(30);
    const river = { W: 20, vb: p.vb, u: p.u, theta: (p.heading * Math.PI) / 180 };
    expect(vBG(river)[0]).toBeCloseTo(0, 12);
    const r = new Runner(relative, p, 1);
    r.play();
    for (let i = 0; i < 1000 && r.playing; i++) r.advance(0.05);
    expect(r.state.t).toBeCloseTo(crossingTime(river), 6);
    const x = relative.readouts![0].value(r.state, p);
    expect(Math.abs(x)).toBeLessThan(1e-9);
  });

  it('circular: a arrow grows with a but never reaches the centre', () => {
    let prev = 0;
    for (let a = 0.1; a <= 9.01; a += 0.1) {
      const L = aArrowLen(a, 1);
      expect(L).toBeGreaterThan(prev);
      expect(L).toBeLessThan(0.55);
      prev = L;
    }
    for (const r of [1, 2, 3]) for (const v of [1, 2, 3]) expect(aArrowLen((v * v) / r, r)).toBeLessThan(0.55 * r);
    // r = 3, v = 1 (a = 0.33): still about 0.1 m, not a dot.
    expect(aArrowLen(1 / 3, 3)).toBeGreaterThan(0.09);
  });
});

describe('Ch 5 third law: forces drawn as a push', () => {
  it('F_AB acts on A to the left, F_BA on B to the right, equal size, from the contact faces', () => {
    const p = defaults(third.params) as any;
    const r = new Runner(third, p, 1);
    r.stepFrame();
    r.stepFrame();
    const s = r.state as any;
    expect(s.FA).toBeLessThan(0);
    expect(s.FB).toBeGreaterThan(0);
    expect(s.FA).toBeCloseTo(-s.FB, 12);
    // The force arrows start at the contact faces (A's right face xA, B's left face xB) and point away
    // from the other cart, so each lies over the cart it acts on.
    const g = probe(third, s, p, 1280, 192);
    const [xa] = g.vp.toPx(s.xA, 0);
    const [xb] = g.vp.toPx(s.xB, 0);
    const tips = g.marks.filter((m) => m.kind === 'arrow-tip');
    const fTexts = g.marks.filter((m) => m.kind === 'text' && /F\*_\{(AB|BA)\}/.test(m.text ?? ''));
    expect(fTexts.length).toBe(2);
    // F_AB label sits left of A's contact face, F_BA right of B's.
    const ab = fTexts.find((m) => m.text!.includes('AB'))!;
    const ba = fTexts.find((m) => m.text!.includes('BA'))!;
    expect(ab.x + ab.w).toBeLessThan(xa);
    expect(ba.x).toBeGreaterThan(xb);
    expect(tips.length).toBeGreaterThan(0);
  });
});

describe('Ch 3 component labels', () => {
  const boxes = (p: any, w: number, h: number) =>
    probe(componentsScene, { t: 0 }, p, w, h)
      .marks.filter((m) => m.kind === 'text' && /A\*|θ/.test(m.text ?? ''))
      .map((m) => ({ x0: m.x, x1: m.x + m.w, y0: m.y - 9, y1: m.y + 9, t: m.text }));

  it('A, A_x, A_y and θ labels never overlap, near the axes and with rotated axes', () => {
    const base = defaults(componentsScene.params) as any;
    const cases = [
      [4, 3],
      [0.5, 4],
      [4, 0.5],
      [-3, 4],
      [-4, -0.6],
      [0.4, -4.5],
      [5, 5],
    ];
    for (const phi of [0, 17, 30, 45, 60]) {
      for (const A of cases) for (const [w, h] of SOLO) {
        const b = boxes({ ...base, phi, A }, w, h);
        for (let i = 0; i < b.length; i++) {
          for (let j = i + 1; j < b.length; j++) {
            const o = b[i].x0 < b[j].x1 && b[j].x0 < b[i].x1 && b[i].y0 < b[j].y1 && b[j].y0 < b[i].y1;
            expect(o, `phi=${phi} A=${A} ${w}px: ${b[i].t} / ${b[j].t}`).toBe(false);
          }
        }
      }
    }
  });
});
