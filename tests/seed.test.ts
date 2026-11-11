import { describe, expect, it } from 'vitest';
import { defaults } from '../src/core/params';
import { Runner } from '../src/core/runner';
import { decayScene } from '../src/sims/ch42/decay';

describe('run seeds', () => {
  const p = defaults(decayScene.params);

  it('every reset draws a new seed, so stochastic runs differ', () => {
    const r = new Runner(decayScene, p);
    const first = Array.from(r.state.times);
    const s0 = r.seed;
    r.reset();
    expect(r.seed).not.toBe(s0);
    expect(Array.from(r.state.times)).not.toEqual(first);
    expect(Array.from(new Runner(decayScene, p).state.times)).not.toEqual(first);
  });

  it('a fixed seed still reproduces a run exactly (tests)', () => {
    const a = new Runner(decayScene, p, 7);
    const b = new Runner(decayScene, p, 7);
    expect(Array.from(a.state.times)).toEqual(Array.from(b.state.times));
    a.reset();
    expect(a.seed).toBe(7);
    expect(Array.from(a.state.times)).toEqual(Array.from(b.state.times));
  });
});
