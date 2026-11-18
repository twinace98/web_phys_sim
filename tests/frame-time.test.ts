import { timeScale } from '../src/core/types';
// Frame time: scenes that can draw at any time move by the same amount every frame, even when
// a frame holds 1 or 2 simulation steps in turn (h = 0.1 fs, 1/6 fs per 60 Hz frame in Ch 35).
import { describe, expect, it } from 'vitest';
import { defaults } from '../src/core/params';
import { Runner } from '../src/core/runner';
import type { Scene } from '../src/core/types';
import { doubleSlit } from '../src/sims/ch35/scene';
import { doppler } from '../src/sims/ch17/doppler';
import { resonanceScene } from '../src/sims/ch16/resonance';

describe('runner frame time', () => {
  it('Ch 35: state time moves in uneven jumps, frame time in equal ones', () => {
    const r = new Runner(doubleSlit, defaults(doubleSlit.params), 1);
    r.play();
    const dt = 1 / 60;
    const per = timeScale(doubleSlit.time, defaults(doubleSlit.params)) * dt;
    let prevS = r.state.t;
    let prevF = r.frameTime();
    const jumpsS = new Set<string>();
    for (let i = 0; i < 120; i++) {
      r.advance(dt);
      jumpsS.add((r.state.t - prevS).toFixed(3));
      expect(r.frameTime() - prevF).toBeCloseTo(per, 9);
      prevS = r.state.t;
      prevF = r.frameTime();
    }
    // The state itself advanced by 0.1 or 0.2 fs per frame: the judder the frame time removes.
    expect(jumpsS.size).toBeGreaterThan(1);
  });

  it('frame time equals state time while paused, and never runs a full step ahead', () => {
    const scenes = [doubleSlit, doppler, resonanceScene] as unknown as Scene[];
    for (const sc of scenes) {
      const r = new Runner(sc, defaults(sc.params), 1);
      expect(r.frameTime()).toBe(r.state.t);
      r.play();
      for (let i = 0; i < 50; i++) {
        r.advance(1 / 60);
        const lead = r.frameTime() - r.state.t;
        expect(lead).toBeGreaterThanOrEqual(0);
        expect(lead).toBeLessThanOrEqual(sc.time!.h + 1e-12);
      }
      r.pause();
      expect(r.frameTime()).toBe(r.state.t);
    }
  });
});
