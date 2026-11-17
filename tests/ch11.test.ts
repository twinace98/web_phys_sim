import { describe, expect, it } from 'vitest';
import { defaults, fromQuery } from '../src/core/params';
import { Runner } from '../src/core/runner';
import {
  BETA,
  BODIES,
  G,
  angMom,
  arealVelocity,
  chairInertia,
  chairKinetic,
  chairL,
  chairOmega,
  endTime,
  finishTime,
  kinetic,
  omega,
  pointVelocity,
  radius,
  rollAccel,
  rollState,
  stepAngle,
  tension,
  type Body,
  type Chair,
  type Incline,
  type Mode,
  type Pull,
} from '../src/sims/ch11/physics';
import { rollScene } from '../src/sims/ch11/roll';
import { spinScene } from '../src/sims/ch11/spin';

const pull = (mode: Mode, rIn = 0.5, wOut = 2): Pull => ({ mode, m: 0.2, rOut: 1, rIn, wOut, tRamp: 3, tHold: 2 });

/** φ(t) with RK4 at step h. */
function integrate(c: Pull, h: number): { t: number; phi: number }[] {
  const out = [{ t: 0, phi: 0 }];
  const N = Math.round(endTime(c) / h);
  let phi = 0;
  for (let n = 0; n < N; n++) {
    phi = stepAngle(c, phi, n * h, h);
    out.push({ t: (n + 1) * h, phi });
  }
  return out;
}

describe('ch11 puck on a string', () => {
  it('r(t) is continuous and smooth across the ramps; r ω² r² gives a constant L', () => {
    for (const mode of ['pull', 'release', 'both'] as Mode[]) {
      const c = pull(mode);
      const T = endTime(c);
      for (let t = 0; t <= T; t += 0.01) {
        const d = 1e-6;
        expect(radius(c, t + d).r - radius(c, t).r).toBeLessThan(1e-5);
        expect(c.m * radius(c, t).r ** 2 * omega(c, t)).toBeCloseTo(angMom(c), 12);
      }
      // dr/dt from the closed form agrees with a finite difference
      const t = c.tHold + 1.1;
      expect((radius(c, t + 1e-6).r - radius(c, t - 1e-6).r) / 2e-6).toBeCloseTo(radius(c, t).v, 6);
    }
  });

  it('half the radius: four times ω; K ∝ 1/r² on the circles', () => {
    const c = pull('pull', 0.5);
    expect(omega(c, endTime(c)) / omega(c, 0)).toBeCloseTo(4, 12);
    expect(kinetic(c, endTime(c)) / kinetic(c, 0)).toBeCloseTo(4, 12);
  });

  it('RK4 angle converges (step 1/240 s vs 1/1920 s agree to 1e-7 rad)', () => {
    const c = pull('both', 0.3, 3);
    const a = integrate(c, 1 / 240);
    const b = integrate(c, 1 / 1920);
    expect(Math.abs(a[a.length - 1].phi - b[b.length - 1].phi)).toBeLessThan(1e-7);
  });

  it('equal areas in equal times: swept area = (L / 2m) Δt', () => {
    const c = pull('pull', 0.4);
    const h = 1 / 240;
    const run = integrate(c, h);
    // Area swept between samples i and j: ∫ ½ r² dφ (trapezoid on the fine grid).
    const area = (i: number, j: number) => {
      let A = 0;
      for (let k = i; k < j; k++) {
        const r0 = radius(c, run[k].t).r;
        const r1 = radius(c, run[k + 1].t).r;
        A += 0.25 * (r0 * r0 + r1 * r1) * (run[k + 1].phi - run[k].phi);
      }
      return A;
    };
    const per = 48; // 0.2 s
    const expected = arealVelocity(c) * per * h;
    for (const i of [0, 480, 600, 720, 1200]) expect(area(i, i + per) / expected).toBeCloseTo(1, 5);
  });

  it('the string stays taut and the work done by the pull equals ΔK', () => {
    for (const mode of ['pull', 'release', 'both'] as Mode[]) {
      for (const rIn of [0.3, 0.7]) {
        for (const wOut of [1, 3]) {
          const c = pull(mode, rIn, wOut);
          const T = endTime(c);
          const h = 1e-3;
          let W = 0;
          let Tmin = Infinity;
          for (let t = 0; t < T; t += h) {
            const tm = t + h / 2;
            Tmin = Math.min(Tmin, tension(c, tm));
            // The string pulls inward with T; the puck moves outward at dr/dt: power = −T ṙ.
            W += -tension(c, tm) * radius(c, tm).v * h;
          }
          expect(Tmin).toBeGreaterThan(0);
          expect(W).toBeCloseTo(kinetic(c, T) - kinetic(c, 0), 4);
        }
      }
    }
  });

  it('scene: L channel is flat for the whole run and the run stops at the end', () => {
    const run = new Runner(spinScene, { ...defaults(spinScene.params), mode: 'both' }, 1);
    run.play();
    for (let i = 0; i < 400 && run.playing; i++) run.advance(0.05);
    expect(run.playing).toBe(false);
    const L = run.hist.col('L');
    for (const v of L) expect(v).toBeCloseTo(L[0], 12);
    const w = run.hist.col('w');
    expect(Math.max(...w) / w[0]).toBeCloseTo(4, 9);
  });
});

describe('ch11 spinning chair', () => {
  const chair = (mode: Mode): Chair => ({ mode, m: 2, rOut: 0.8, rIn: 0.2, wOut: 1.5, tRamp: 2, tHold: 1.5, I0: 1.5 });

  it('L = I ω is fixed; ω and K scale with I_out / I_in', () => {
    const c = chair('pull');
    const T = endTime(c);
    for (let t = 0; t <= T; t += 0.05) expect(chairInertia(c, t) * chairOmega(c, t)).toBeCloseTo(chairL(c), 12);
    const ratio = chairInertia(c, 0) / chairInertia(c, T);
    expect(ratio).toBeCloseTo((1.5 + 2 * 2 * 0.64) / (1.5 + 2 * 2 * 0.04), 12);
    expect(chairOmega(c, T) / chairOmega(c, 0)).toBeCloseTo(ratio, 12);
    expect(chairKinetic(c, T) / chairKinetic(c, 0)).toBeCloseTo(ratio, 12);
  });

  it('scene: L channel flat through pull-in and stretch-out', () => {
    const run = new Runner(spinScene, { ...defaults(spinScene.params), sys: 'chair', arms: 'both' }, 1);
    run.play();
    for (let i = 0; i < 400 && run.playing; i++) run.advance(0.05);
    expect(run.playing).toBe(false);
    const L = run.hist.col('L');
    for (const v of L) expect(v).toBeCloseTo(L[0], 12);
    const w = run.hist.col('w');
    expect(w[w.length - 1]).toBeCloseTo(w[0], 12);
  });
});

describe('ch11 merged tab: puck and chair share the I, ω, L, K plots', () => {
  const runAll = (p: Record<string, unknown>) => {
    const run = new Runner(spinScene, { ...defaults(spinScene.params), ...p } as never, 1);
    run.play();
    for (let i = 0; i < 400 && run.playing; i++) run.advance(0.05);
    return run;
  };

  it('puck: I = m r², I ω = L on every sample; I falls 4x, ω and K rise 4x', () => {
    const run = runAll({ sys: 'puck', mode: 'pull' });
    const [I, w, L, K] = ['I', 'w', 'L', 'K'].map((k) => run.hist.col(k));
    for (let i = 0; i < I.length; i++) expect(I[i] * w[i]).toBeCloseTo(L[i], 12);
    expect(I[0]).toBeCloseTo(0.2 * 1 * 1, 12);
    expect(I[0] / I[I.length - 1]).toBeCloseTo(4, 9);
    expect(w[w.length - 1] / w[0]).toBeCloseTo(4, 9);
    expect(K[K.length - 1] / K[0]).toBeCloseTo(4, 9);
  });

  it('chair: defaults give I 4.06 → 1.66 kg·m², ω 1.5 → 3.67 rad/s, L flat, K up by I_out/I_in', () => {
    const run = runAll({ sys: 'chair', arms: 'pull' });
    const [I, w, L, K] = ['I', 'w', 'L', 'K'].map((k) => run.hist.col(k));
    expect(I[0]).toBeCloseTo(4.06, 12);
    expect(I[I.length - 1]).toBeCloseTo(1.66, 12);
    expect(w[0]).toBeCloseTo(1.5, 12);
    expect(w[w.length - 1]).toBeCloseTo((4.06 * 1.5) / 1.66, 9);
    for (const v of L) expect(v).toBeCloseTo(L[0], 12);
    expect(K[K.length - 1] / K[0]).toBeCloseTo(4.06 / 1.66, 9);
  });

  it('each system uses its own motion, mass and ω parameters', () => {
    const a = runAll({ sys: 'chair', arms: 'release', mode: 'pull', m: 0.5, wOut: 3 });
    const b = runAll({ sys: 'chair', arms: 'release' });
    expect(a.hist.col('w')).toEqual(b.hist.col('w'));
    const I = a.hist.col('I');
    expect(I[I.length - 1]).toBeGreaterThan(I[0]); // stretched out
  });

  it('old chair link (s=chair&mode=both&m=3&wOut=1.8) parses and falls back to valid values', () => {
    const q = new URLSearchParams('s=chair&mode=both&m=3&wOut=1.8');
    const p = fromQuery(spinScene.params, q);
    expect(p.sys).toBe('puck');
    expect(p.mode).toBe('both');
    expect(p.m).toBe(0.2); // 3 kg is outside the puck range: default
    expect(p.wOut).toBe(1.8);
    // The shell picks the scene by id and falls back to the first tab when the id is unknown.
    const page = [spinScene, rollScene];
    expect(Math.max(0, page.findIndex((s) => s.id === q.get('s')))).toBe(0);
  });
});

describe('ch11 rolling down an incline', () => {
  const inc = (deg: number): Incline => ({ theta: (deg * Math.PI) / 180, len: 1.6, R: 0.12, M: 1 });
  const rel = (a: number, b: number) => Math.abs(a - b) / Math.abs(b);

  it('a from Newton + torque + rolling matches g sinθ / (1 + β) to 1e-9 (hoop, disk, sphere, block)', () => {
    const want: [Body, number][] = [
      ['hoop', 1],
      ['disk', 0.5],
      ['sphere', 0.4],
      ['block', 0],
    ];
    for (const deg of [5, 17, 30, 40]) {
      const th = (deg * Math.PI) / 180;
      for (const [b, beta] of want) {
        expect(BETA[b]).toBe(beta);
        const { a, f } = rollAccel(BETA[b], th);
        expect(rel(a, (G * Math.sin(th)) / (1 + beta))).toBeLessThan(1e-9);
        // Friction gives the torque: f R = I α = β M R² a / R.
        expect(Math.abs(f - beta * a)).toBeLessThan(1e-12);
      }
    }
  });

  it('β from the mass distribution: disk and ball integrated numerically', () => {
    const N = 20000;
    let disk = 0;
    let ball = 0;
    let ballM = 0;
    for (let i = 0; i < N; i++) {
      const r = (i + 0.5) / N;
      disk += r * r * 2 * r * (1 / N); // ∫ r² dm with dm ∝ 2 r dr (total 1)
      const z = -1 + (2 * (i + 0.5)) / N;
      const a2 = 1 - z * z; // slice radius²
      ball += 0.5 * a2 * a2 * (2 / N); // thin disks: ½ a² dm, dm ∝ a² dz
      ballM += a2 * (2 / N);
    }
    expect(disk).toBeCloseTo(BETA.disk, 6);
    expect(ball / ballM).toBeCloseTo(BETA.sphere, 6);
  });

  it('the contact point is at rest, the top moves at 2 v_cm (every round body, several times)', () => {
    const r = inc(30);
    const u = { x: Math.cos(r.theta), y: -Math.sin(r.theta) };
    const n = { x: Math.sin(r.theta), y: Math.cos(r.theta) };
    for (const b of ['hoop', 'disk', 'sphere'] as Body[]) {
      for (const t of [0.1, 0.5, 0.9]) {
        const k = rollState(r, b, t);
        const vcm = { x: k.v * u.x, y: k.v * u.y };
        const bottom = pointVelocity(vcm, -k.w, { x: -r.R * n.x, y: -r.R * n.y });
        const top = pointVelocity(vcm, -k.w, { x: r.R * n.x, y: r.R * n.y });
        expect(Math.hypot(bottom.x, bottom.y)).toBeLessThan(1e-12);
        expect(top.x).toBeCloseTo(2 * vcm.x, 12);
        expect(top.y).toBeCloseTo(2 * vcm.y, 12);
        expect(k.v).toBeCloseTo(k.w * r.R, 12);
      }
    }
  });

  it('K_rot / K_trans = β and K_trans + K_rot = M g Δh (scene channels, each body)', () => {
    for (const focus of BODIES) {
      const run = new Runner(rollScene, { ...defaults(rollScene.params), focus } as never, 1);
      run.play();
      for (let i = 0; i < 1000 && run.playing; i++) run.advance(0.01);
      expect(run.playing).toBe(false);
      const Kt = run.hist.col('Kt');
      const Kr = run.hist.col('Kr');
      const ts = run.hist.col('t');
      for (let i = 1; i < Kt.length; i++) {
        expect(Kr[i] / Kt[i]).toBeCloseTo(BETA[focus], 12);
        const k = rollState(inc(30), focus, ts[i]);
        expect(rel(Kt[i] + Kr[i], 1 * G * k.s * Math.sin(inc(30).theta))).toBeLessThan(1e-12);
      }
    }
  });

  it('finishing order block, sphere, disk, hoop at every angle; the run ends with the hoop', () => {
    for (const deg of [5, 12, 30, 40]) {
      const r = inc(deg);
      const tf = BODIES.map((b) => [b, finishTime(r, b)] as const).sort((a, b) => a[1] - b[1]);
      expect(tf.map((x) => x[0])).toEqual(['block', 'sphere', 'disk', 'hoop']);
      // t_f ∝ √(1 + β)
      expect(finishTime(r, 'hoop') / finishTime(r, 'block')).toBeCloseTo(Math.SQRT2, 12);
    }
    const run = new Runner(rollScene, defaults(rollScene.params) as never, 1);
    run.play();
    for (let i = 0; i < 1000 && run.playing; i++) run.advance(0.01);
    // The run stops just after the hoop crosses the line (3 % margin so its end dot is on the plot).
    expect(run.state.t).toBeGreaterThanOrEqual(finishTime(inc(30), 'hoop'));
    expect(run.state.t).toBeCloseTo(1.03 * finishTime(inc(30), 'hoop'), 2);
    // Recorded speeds at the end are the finish speeds √(2 g h / (1 + β)).
    const h = 1.6 * Math.sin(inc(30).theta);
    const last = (k: string) => run.hist.col(k)[run.hist.col(k).length - 1];
    expect(rel(last('vs'), Math.sqrt((2 * G * h) / 1.4))).toBeLessThan(1e-9);
    expect(rel(last('vd'), Math.sqrt((2 * G * h) / 1.5))).toBeLessThan(1e-9);
    expect(rel(last('vb'), Math.sqrt(2 * G * h))).toBeLessThan(1e-9);
  });

  it('the v(t) and K curves drawn in the plots stay inside their y ranges (all angles, all bodies)', () => {
    for (const deg of [5, 23, 40]) {
      for (const focus of BODIES) {
        const p = { theta: deg, focus } as never;
        const [, vMax] = rollScene.plots![0].yRange(p);
        const [, kMax] = rollScene.plots![1].yRange(p);
        for (const b of BODIES) {
          const k = rollState(inc(deg), b, finishTime(inc(deg), b));
          expect(k.v).toBeLessThan(vMax);
          expect(Math.max(k.Kt, k.Kr)).toBeLessThan(kMax);
        }
      }
    }
  });
});
