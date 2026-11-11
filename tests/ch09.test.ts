import { describe, expect, it } from 'vitest';
import { defaults } from '../src/core/params';
import { Runner } from '../src/core/runner';
import { collide1D, collide2D, contactTime, explode1D, motion1D, motion2D, state1D, state2D, type Puck, type Track } from '../src/sims/ch09/physics';
import { puckScene } from '../src/sims/ch09/puck';
import { track } from '../src/sims/ch09/track';

describe('ch09 1D collisions', () => {
  const cases: [number, number, number, number][] = [
    [1, 2, 1, 0],
    [2, 3, 0.5, -1],
    [0.5, 1, 4, 0.5],
  ];

  it('momentum is conserved for every restitution', () => {
    for (const [m1, v1, m2, v2] of cases) {
      for (const e of [0, 0.25, 0.5, 1]) {
        const [a, b] = collide1D(m1, v1, m2, v2, e);
        expect(m1 * a + m2 * b).toBeCloseTo(m1 * v1 + m2 * v2, 12);
        // restitution: relative speed of separation = e × relative speed of approach
        expect(b - a).toBeCloseTo(e * (v1 - v2), 12);
      }
    }
  });

  it('elastic: kinetic energy conserved; equal masses swap velocities', () => {
    for (const [m1, v1, m2, v2] of cases) {
      const [a, b] = collide1D(m1, v1, m2, v2, 1);
      expect(0.5 * m1 * a * a + 0.5 * m2 * b * b).toBeCloseTo(0.5 * m1 * v1 * v1 + 0.5 * m2 * v2 * v2, 12);
    }
    const [a, b] = collide1D(1, 2, 1, 0, 1);
    expect(a).toBeCloseTo(0, 12);
    expect(b).toBeCloseTo(2, 12);
  });

  it('perfectly inelastic: common velocity v_cm and the textbook loss of K', () => {
    const [a, b] = collide1D(2, 3, 1, 0, 0);
    expect(a).toBeCloseTo(2, 12);
    expect(b).toBeCloseTo(2, 12);
    const Ki = 0.5 * 2 * 9;
    const Kf = 0.5 * 3 * 4;
    expect(Ki - Kf).toBeCloseTo(0.5 * ((2 * 1) / 3) * 9, 12); // ½ μ v_rel²
  });

  it('explosion keeps total momentum and adds the spring energy', () => {
    const [a, b] = explode1D(1, 2, 0.5, 3);
    expect(1 * a + 2 * b).toBeCloseTo(1.5, 12);
    expect(0.5 * a * a + 0.5 * 2 * b * b - 0.5 * 3 * 0.25).toBeCloseTo(3, 12);
  });

  it('the carts touch exactly at the collision time and never overlap', () => {
    const tr: Track = { kind: 'inelastic', m1: 1, m2: 2, v1: 2, v2: -0.5, e: 0.5, E: 0, w1: 0.25, w2: 0.35, x1: -3, x2: 1, tSep: 1 };
    const mo = motion1D(tr);
    const at = state1D(tr, mo, mo.tc);
    expect(at.x2 - at.x1).toBeCloseTo((tr.w1 + tr.w2) / 2, 12);
    for (let t = 0; t < 6; t += 0.01) {
      const k = state1D(tr, mo, t);
      expect(k.x2 - k.x1).toBeGreaterThanOrEqual((tr.w1 + tr.w2) / 2 - 1e-12);
    }
  });

  it('scene: p_tot flat and x_cm linear over the whole run; K drops only for inelastic kinds', () => {
    for (const kind of ['elastic', 'inelastic', 'stick', 'explode']) {
      const p = { ...defaults(track.params), kind, m2: 2 };
      const run = new Runner(track, p);
      run.play();
      for (let i = 0; i < 200 && run.playing; i++) run.advance(0.05);
      const pt = run.hist.col('pt');
      const Kt = run.hist.col('Kt');
      const ts = run.hist.col('t');
      const xcm = run.hist.col('xcm');
      for (const v of pt) expect(v).toBeCloseTo(pt[0], 12);
      const vcm = (xcm[xcm.length - 1] - xcm[0]) / (ts[ts.length - 1] - ts[0]);
      for (let i = 0; i < ts.length; i++) expect(xcm[i]).toBeCloseTo(xcm[0] + vcm * ts[i], 9);
      const dK = Kt[Kt.length - 1] - Kt[0];
      if (kind === 'elastic') expect(dK).toBeCloseTo(0, 12);
      else if (kind === 'explode') expect(dK).toBeCloseTo(p.E, 12);
      else expect(dK).toBeLessThan(-0.1);
    }
  });
});

describe('ch09 2D collisions', () => {
  const a: Puck = { m: 1, R: 0.18, x: [-3, 0.2], v: [1.5, 0] };
  const b: Puck = { m: 1, R: 0.18, x: [0, 0], v: [0, 0] };

  it('contact time puts the centres one diameter apart', () => {
    const tc = contactTime(a, b);
    const d = Math.hypot(a.x[0] + a.v[0] * tc - b.x[0], a.x[1] - b.x[1]);
    expect(d).toBeCloseTo(0.36, 12);
    expect(contactTime({ ...a, x: [-3, 0.5] }, b)).toBe(Infinity);
  });

  it('momentum vector conserved; elastic keeps K; equal masses leave at 90°', () => {
    for (const kind of ['elastic', 'inelastic', 'stick'] as const) {
      const mo = motion2D(a, { ...b, m: kind === 'inelastic' ? 2 : 1 }, kind, 0.5);
      const [p, q] = mo.at;
      expect(p.m * p.v[0] + q.m * q.v[0]).toBeCloseTo(1.5, 12);
      expect(p.m * p.v[1] + q.m * q.v[1]).toBeCloseTo(0, 12);
    }
    const [p, q] = motion2D(a, b, 'elastic', 1).at;
    expect(0.5 * (p.v[0] ** 2 + p.v[1] ** 2) + 0.5 * (q.v[0] ** 2 + q.v[1] ** 2)).toBeCloseTo(0.5 * 1.5 ** 2, 12);
    expect(p.v[0] * q.v[0] + p.v[1] * q.v[1]).toBeCloseTo(0, 12);
  });

  it('frictionless contact leaves the tangential components unchanged', () => {
    const [va, vb] = collide2D({ ...a, x: [-0.3, 0.2] }, b, 'inelastic', 0.3);
    const L = Math.hypot(0.3, 0.2);
    const n = [0.3 / L, -0.2 / L];
    const t = [-n[1], n[0]];
    expect(va[0] * t[0] + va[1] * t[1]).toBeCloseTo(1.5 * t[0], 12);
    expect(vb[0] * t[0] + vb[1] * t[1]).toBeCloseTo(0, 12);
  });

  it('scene: total momentum components flat over the run', () => {
    const run = new Runner(puckScene, defaults(puckScene.params));
    run.play();
    for (let i = 0; i < 200 && run.playing; i++) run.advance(0.05);
    expect(run.state.t).toBeCloseTo(5, 9);
    for (const v of run.hist.col('ptx')) expect(v).toBeCloseTo(1.5, 12);
    for (const v of run.hist.col('pty')) expect(v).toBeCloseTo(0, 12);
    const st = state2D(motion2D(a, b, 'elastic', 1), 5);
    expect(Math.hypot(st[0].x[0] - st[1].x[0], st[0].x[1] - st[1].x[1])).toBeGreaterThan(0.36);
  });
});
