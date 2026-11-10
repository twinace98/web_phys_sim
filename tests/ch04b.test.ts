import { describe, expect, it } from 'vitest';
import { defaults } from '../src/core/params';
import { Runner } from '../src/core/runner';
import { centripetal, circularAt, crossingTime, drift, period, vBG, vBW, vWG, type River } from '../src/sims/ch04/physics';
import { relative } from '../src/sims/ch04/relative';

const deg = Math.PI / 180;

describe('ch04 uniform circular motion', () => {
  const c = { r: 2, v: 3 };
  it('speed stays constant while the velocity turns', () => {
    for (const t of [0, 0.3, 1.1, 2.7]) {
      const k = circularAt(c, t);
      expect(Math.hypot(k.vx, k.vy)).toBeCloseTo(3, 12);
      expect(Math.hypot(k.x, k.y)).toBeCloseTo(2, 12);
    }
    expect(circularAt(c, 0).vx).not.toBeCloseTo(circularAt(c, 1).vx, 3);
  });

  it('a points to the centre, is perpendicular to v, and has size v²/r', () => {
    for (const t of [0.2, 0.9, 1.7]) {
      const k = circularAt(c, t);
      expect(k.ax * k.vx + k.ay * k.vy).toBeCloseTo(0, 12);
      expect(Math.hypot(k.ax, k.ay)).toBeCloseTo(9 / 2, 12);
      // a = −(v²/r²) r: antiparallel to the position vector
      expect(k.ax * k.x + k.ay * k.y).toBeCloseTo(-centripetal(c) * 2, 12);
    }
  });

  it('a equals the numerical derivative of v; period is 2πr/v', () => {
    const d = 1e-6;
    const k0 = circularAt(c, 0.5);
    const k1 = circularAt(c, 0.5 + d);
    expect((k1.vx - k0.vx) / d).toBeCloseTo(k0.ax, 4);
    expect(period(c)).toBeCloseTo((2 * Math.PI * 2) / 3, 12);
    const kT = circularAt(c, period(c));
    expect(kT.x).toBeCloseTo(2, 10);
    expect(kT.y).toBeCloseTo(0, 10);
  });

  it('doubling v quadruples a; doubling r halves it', () => {
    expect(centripetal({ r: 1, v: 2 }) / centripetal({ r: 1, v: 1 })).toBeCloseTo(4, 12);
    expect(centripetal({ r: 2, v: 2 }) / centripetal({ r: 1, v: 2 })).toBeCloseTo(0.5, 12);
  });
});

describe('ch04 relative motion: river crossing', () => {
  const river = (thetaDeg: number, u = 1, vb = 2): River => ({ W: 20, vb, u, theta: thetaDeg * deg });

  it('v_BG = v_BW + v_WG', () => {
    const r = river(15);
    const s = vBG(r);
    expect(s[0]).toBeCloseTo(vBW(r)[0] + vWG(r)[0], 12);
    expect(s[1]).toBeCloseTo(vBW(r)[1] + vWG(r)[1], 12);
  });

  it('heading straight across: crossing time W / v_b whatever the current, drift u W / v_b', () => {
    for (const u of [0, 0.5, 1, 1.5]) {
      expect(crossingTime(river(0, u))).toBeCloseTo(10, 12);
      expect(drift(river(0, u))).toBeCloseTo(u * 10, 12);
    }
  });

  it('heading upstream at sin θ = u / v_b lands straight across, and takes longer', () => {
    const r = river(30, 1, 2);
    expect(drift(r)).toBeCloseTo(0, 12);
    expect(crossingTime(r)).toBeGreaterThan(crossingTime(river(0, 1, 2)));
    expect(drift(river(60, 1, 2))).toBeLessThan(0);
  });

  it('the scene stops on the far bank', () => {
    const p = defaults(relative.params);
    const run = new Runner(relative, p);
    run.play();
    for (let i = 0; i < 400 && run.playing; i++) run.advance(0.1);
    expect(run.playing).toBe(false);
    expect(run.state.t).toBeCloseTo(run.tEnd!, 12);
  });
});

describe('ch04 relative-motion panel', () => {
  it('renders as valid KaTeX with the current components', async () => {
    const katex = (await import('katex')).default;
    const { velocityPanel } = await import('../src/sims/ch04/relative');
    const p = defaults(relative.params);
    for (const heading of [0, 30, 60]) {
      const tex = velocityPanel({ ...p, heading });
      expect(() => katex.renderToString(tex, { throwOnError: true })).not.toThrow();
    }
    expect(velocityPanel({ ...p, heading: 0 })).toContain('1.00');
  });
});
