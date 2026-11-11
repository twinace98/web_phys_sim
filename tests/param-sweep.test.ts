// Parameter sweep over every registered scene (all chapters).
// For each scene: defaults, every number param at min / max / two in-between values (one at a time),
// every select option, every toggle flipped, and a few random combinations.
// Each case runs init + up to MAX_STEPS steps, then checks that the world, plot ranges,
// recorded channels and readouts are finite, and that recorded plot channels stay inside the plot range.
import { describe, expect, it } from 'vitest';
import { defaults } from '../src/core/params';
import { Rng } from '../src/core/rng';
import { Runner } from '../src/core/runner';
import type { Params, Scene } from '../src/core/types';
import { CHAPTERS } from '../src/sims/registry';

const MAX_STEPS = 4000;
const RANDOM_COMBOS = 6;
/** Fraction of the plot span a recorded value may exceed the range by (line width, auto margins). */
const RANGE_TOL = 0.05;

/** `live`: a live parameter changed halfway through the run (no reset), as a user drags it while playing. */
type Case = { name: string; p: Params; live?: [string, Params[string]] };

function numberValues(spec: Extract<Scene['params'][string], { kind: 'number' }>, rng: Rng): number[] {
  if (spec.control === 'select') return spec.choices ?? [spec.default];
  const min = spec.min ?? 0;
  const max = spec.max ?? 1;
  if (spec.log) {
    const lo = Math.log10(min);
    const hi = Math.log10(max);
    return [min, max, 10 ** (lo + (hi - lo) * 0.37), 10 ** (lo + (hi - lo) * rng.next())];
  }
  const step = spec.step ?? (spec.control === 'stepper' ? 1 : 0.01);
  const snap = (v: number) => Number((min + Math.round((v - min) / step) * step).toFixed(10));
  return [min, max, snap(min + (max - min) * 0.37), snap(min + (max - min) * rng.next())];
}

function randomValue(spec: Scene['params'][string], rng: Rng): Params[string] {
  switch (spec.kind) {
    case 'number': {
      const vs = numberValues(spec, rng);
      return vs[Math.floor(rng.next() * vs.length)];
    }
    case 'select':
      return spec.options[Math.floor(rng.next() * spec.options.length)].value;
    case 'toggle':
      return rng.next() < 0.5;
    case 'array':
      return spec.default;
  }
}

function cases(scene: Scene): Case[] {
  const rng = new Rng(12345);
  const base = defaults(scene.params) as Params;
  const out: Case[] = [{ name: 'defaults', p: base }];
  for (const [k, spec] of Object.entries(scene.params)) {
    if (spec.kind === 'number') {
      for (const v of numberValues(spec, rng)) if (v !== base[k]) out.push({ name: `${k}=${v}`, p: { ...base, [k]: v } });
    } else if (spec.kind === 'select') {
      for (const o of spec.options) if (o.value !== base[k]) out.push({ name: `${k}=${o.value}`, p: { ...base, [k]: o.value } });
    } else if (spec.kind === 'toggle') {
      out.push({ name: `${k}=${!base[k]}`, p: { ...base, [k]: !base[k] } });
    }
    if (spec.live && scene.time) {
      const vs = spec.kind === 'number' ? numberValues(spec, rng).slice(0, 2) : spec.kind === 'select' ? spec.options.map((o) => o.value) : spec.kind === 'toggle' ? [!base[k]] : [];
      for (const v of vs) if (v !== base[k]) out.push({ name: `live ${k}→${v}`, p: base, live: [k, v] });
    }
  }
  for (let i = 0; i < RANDOM_COMBOS; i++) {
    const p: Params = { ...base };
    // A preset rewrites array params (charge layouts) through the shell, so random combos leave it alone there.
    const hasArray = Object.values(scene.params).some((sp) => sp.kind === 'array');
    for (const [k, spec] of Object.entries(scene.params)) if (!(hasArray && k === 'preset')) p[k] = randomValue(spec, rng);
    out.push({ name: `random#${i} ${JSON.stringify(p)}`, p });
  }
  return out;
}

/** Canvas stand-in: every property is callable, every call returns the stand-in, numbers coerce to 1. */
function mockDraw(): unknown {
  const target = function () {} as unknown as object;
  const handler: ProxyHandler<object> = {
    get(_t, prop) {
      if (prop === Symbol.toPrimitive) return () => 1;
      if (prop === Symbol.iterator) return function* () { yield 0; yield 0; };
      if (prop === 'then') return undefined;
      if (prop === 'px') return (n: number) => n * 0.01;
      if (prop === 'measureText') return () => ({ width: 10, actualBoundingBoxAscent: 8, actualBoundingBoxDescent: 2 });
      if (prop === 'width' || prop === 'height' || prop === 'w' || prop === 'h') return 600;
      if (prop === 'dpr' || prop === 'scale') return 1;
      return proxy;
    },
    apply() {
      return proxy;
    },
    set() {
      return true;
    },
  };
  const proxy: unknown = new Proxy(target, handler);
  return proxy;
}

function check(scene: Scene, c: Case): string[] {
  const issues: string[] = [];
  const tag = (m: string) => `${scene.id} [${c.name}]: ${m}`;
  let r: Runner;
  try {
    r = new Runner(scene, c.p as never, 1);
  } catch (e) {
    return [tag(`init threw ${(e as Error).message}`)];
  }
  const w = scene.world(c.p as never);
  if (![...w.x, ...w.y].every(Number.isFinite) || w.x[1] <= w.x[0] || w.y[1] <= w.y[0]) issues.push(tag(`bad world ${JSON.stringify(w)}`));

  const time = scene.time;
  if (time) {
    const tEnd = r.tEnd;
    const want = tEnd !== undefined ? Math.ceil(tEnd / time.h) : Math.ceil((time.window ?? 10) / time.h);
    const n = Math.min(MAX_STEPS, want);
    try {
      r.play();
      for (let i = 0; i < n && r.playing; i++) {
        if (c.live && i === Math.floor(n / 2)) r.setParam(c.live[0], c.live[1]);
        r.advance(time.h / (time.scale ?? 1));
      }
    } catch (e) {
      issues.push(tag(`step threw at t=${r.state.t}: ${(e as Error).message}`));
    }
  }

  const P = r.params as never;
  const ranges = new Map<string, [number, number]>();
  for (const pl of scene.plots ?? []) {
    const yr = pl.yRange(P);
    if (!yr.every(Number.isFinite) || yr[1] <= yr[0]) issues.push(tag(`plot ${pl.id} bad yRange ${yr}`));
    else for (const tr of pl.traces) ranges.set(tr.channel, yr);
  }

  const keys = Object.keys(scene.record?.(r.state, P) ?? { t: 0 });
  const out = new Map<string, number>();
  for (const k of keys) {
    const col = r.hist.col(k);
    // NaN breaks a plotted line on purpose; ±Infinity is a bug.
    const i = col.findIndex((v) => v === Infinity || v === -Infinity);
    if (i >= 0) issues.push(tag(`channel ${k} = ${col[i]} at t=${r.hist.col('t')[i]}`));
    const yr = ranges.get(k);
    if (!yr) continue;
    const span = yr[1] - yr[0];
    for (const v of col) {
      if (!Number.isFinite(v)) continue;
      const ex = Math.max(yr[0] - v, v - yr[1]) / span;
      if (ex > RANGE_TOL) out.set(k, Math.max(out.get(k) ?? 0, ex));
    }
  }
  for (const [k, ex] of out) issues.push(tag(`channel ${k} leaves its plot range by ${(ex * 100).toFixed(0)} % of the span`));

  for (const ro of scene.readouts ?? []) {
    try {
      // NaN prints as "–" (no value, e.g. no critical angle); only a throw is a failure.
      ro.value(r.state, P);
    } catch (e) {
      issues.push(tag(`readout ${ro.label} threw ${(e as Error).message}`));
    }
  }

  try {
    scene.draw(mockDraw() as never, r.state, P, { t: r.state.t, cursorT: r.state.t, scrubbing: false, lecture: false });
  } catch (e) {
    issues.push(tag(`draw threw ${(e as Error).message}`));
  }
  try {
    scene.overlay?.(r.state, P);
  } catch (e) {
    issues.push(tag(`overlay threw ${(e as Error).message}`));
  }
  return issues;
}

// Browser drawing classes the scenes construct (Path2D etc.): stand-ins with the same do-nothing surface.
const g = globalThis as Record<string, unknown>;
for (const name of ['Path2D', 'OffscreenCanvas', 'ImageData', 'DOMMatrix']) {
  if (!g[name]) g[name] = function () { return mockDraw(); };
}
if (!g.document) g.document = { createElement: () => mockDraw() };

describe('parameter sweep', () => {
  for (const meta of CHAPTERS.filter((m) => m.load)) {
    it(`Ch ${meta.ch}: every scene survives min / max / in-between / random parameters`, async () => {
      const page = await meta.load!();
      const issues: string[] = [];
      for (const scene of page.scenes) for (const c of cases(scene)) issues.push(...check(scene, c));
      expect(issues).toEqual([]);
    }, 120_000);
  }
});
