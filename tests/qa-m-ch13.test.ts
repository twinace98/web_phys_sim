import { describe, expect, it } from 'vitest';
import { defaults } from '../src/core/params';
import { timeScale } from '../src/core/types';
import en from '../src/sims/ch13/i18n.en.json';
import ko from '../src/sims/ch13/i18n.ko.json';
import { model, orbitScene, type P } from '../src/sims/ch13/orbit';
import { GM, R_EARTH } from '../src/sims/ch13/physics';

const base = defaults(orbitScene.params) as P;

describe('ch13 escape speed: direction-free unless the path hits the Earth', () => {
  it('at v_esc an inward launch can crash, so the ⓘ goal states the exception', () => {
    // The physics the text must match: 1.0 v_esc at 1000 km crashes below about −21.6°.
    expect(model({ ...base, speed: 1, alt: 1000, dir: -30 }).crashed).toBe(true);
    expect(model({ ...base, speed: 1, alt: 1000, dir: -10 }).crashed).toBe(false);
    expect(model({ ...base, speed: 1, alt: 6000, dir: -50 }).crashed).toBe(true);
    expect(model({ ...base, speed: 1, alt: 6000, dir: -40 }).crashed).toBe(false);
    expect(en['ch13.o.goal.esc']).toMatch(/does not hit the Earth/);
    expect(en['ch13.o.goal.esc']).not.toMatch(/whatever the direction/);
    expect(ko['ch13.o.goal.esc']).toMatch(/부딪히지 않는 한/);
  });
});

describe('ch13 playback follows the period', () => {
  it('one revolution takes at most 10 s of wall time at 1× for every bound launch speed and altitude', () => {
    let worst = 0;
    for (let s = 30; s <= 140; s++) {
      for (let alt = 1000; alt <= 15000; alt += 500) {
        const p = { ...base, speed: s / 100, alt };
        const f = Math.abs(p.speed - Math.SQRT1_2) < 0.005 ? Math.SQRT1_2 : p.speed;
        if (f >= 1) continue;
        // Vis-viva with v0 = f v_esc: a = r0 / (2(1 − f²)), whatever the direction.
        const a = (R_EARTH + alt * 1e3) / (2 * (1 - f * f));
        const period = 2 * Math.PI * Math.sqrt(a ** 3 / GM);
        worst = Math.max(worst, period / timeScale(orbitScene.time, p));
      }
    }
    // Before: a fixed 4000 s/s gave up to 979 s per revolution at (0.99, 15000 km).
    expect(worst).toBeLessThanOrEqual(10 + 1e-9);
  });

  it('spot check against the simulated orbit: (0.99, 15000 km) and the default', () => {
    for (const p of [{ ...base, speed: 0.99, alt: 15000 }, base]) {
      const m = model(p);
      expect(m.kind).toBe('ellipse');
      expect(m.period / timeScale(orbitScene.time, p)).toBeLessThanOrEqual(10 + 1e-9);
    }
  });

  it('the default launch keeps 4000 s per wall second', () => {
    expect(timeScale(orbitScene.time, base)).toBe(4000);
  });
});
