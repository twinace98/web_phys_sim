import { describe, expect, it } from 'vitest';
import { defaults } from '../src/core/params';
import { Runner } from '../src/core/runner';
import { circular } from '../src/sims/ch06/circular';
import { G, lapTime, SETUPS } from '../src/sims/ch06/physics';
import ko from '../src/sims/ch06/i18n.ko.json';

const vReadout = (s: any, p: any) => (circular.readouts![0] as any).value(s, p) as number;

describe('ch06 circular: the v readout is the true speed', () => {
  it('cut conical pendulum: v grows as the bob falls, √(v0² + (g(t − t_cut))²)', () => {
    const p = { ...(defaults(circular.params) as any), preset: 'cone', cut: true };
    const run = new Runner(circular, p);
    run.play();
    for (let i = 0; i < 400 && run.playing; i++) run.advance(0.02);
    const s = SETUPS.cone;
    const tau = run.state.t - lapTime(s) / 4;
    expect(tau).toBeGreaterThan(0.15);
    const v = vReadout(run.state, p);
    expect(v).toBeCloseTo(Math.hypot(s.v, G * tau), 9);
    // Before the fix the readout stayed at v0 = 1.682 m/s; the bob ends ~57 % faster.
    expect(v / s.v).toBeGreaterThan(1.4);
  });

  it('every other case keeps v (circle, cut string on the table, car on ice)', () => {
    for (const [preset, extra] of [
      ['string', { cut: true }],
      ['flat', { ice: true }],
      ['banked', {}],
      ['cone', { cut: false }],
    ] as const) {
      const p = { ...(defaults(circular.params) as any), preset, ...extra };
      const run = new Runner(circular, p);
      run.play();
      for (let i = 0; i < 400 && run.playing; i++) run.advance(0.02);
      expect(vReadout(run.state, p), preset).toBeCloseTo(SETUPS[preset].v, 12);
    }
  });

  it('terminology: 관성계, not 관성 기준계', () => {
    for (const v of Object.values(ko)) expect(v).not.toContain('관성 기준계');
  });
});
