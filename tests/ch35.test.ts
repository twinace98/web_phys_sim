import { describe, expect, it } from 'vitest';
import { defaults } from '../src/core/params';
import { brightAt, doubleSlitFar, fringeSpacing, pathDiff } from '../src/sims/ch35/physics';
import { doubleSlit } from '../src/sims/ch35/scene';
import { C_LIGHT, WaveField, sourcesOf, wavelengthRGB } from '../src/sims/wave2d/field';

const lambda = 0.5;
const d = 3;
const D = 20;

function field(aps = [
  { yc: d / 2, w: 0 },
  { yc: -d / 2, w: 0 },
]) {
  return new WaveField({ lambda, apertures: aps, xL: -4, x1: D, y0: -12, y1: 12, screenX: D, screenN: 481, maxCells: 20000 });
}

/** Local maxima of an array (index list). */
function peaks(v: Float64Array): number[] {
  const out: number[] = [];
  for (let i = 1; i < v.length - 1; i++) if (v[i] > v[i - 1] && v[i] >= v[i + 1]) out.push(i);
  return out;
}

describe('ch35 double slit geometry', () => {
  it('Δy = λD/d and ΔL at the bright fringes', () => {
    expect(fringeSpacing(0.5, 20, 3)).toBeCloseTo(10 / 3, 12);
    expect(brightAt(0, lambda, d, D)).toBeCloseTo(0, 9);
    for (const m of [1, 2, -3]) expect(pathDiff(d, D, brightAt(m, lambda, d, D))).toBeCloseTo(m * lambda, 9);
  });

  it('far away the exact fringes approach D tan θ_m with d sin θ_m = mλ', () => {
    const big = 1e6;
    const th = Math.asin(lambda / d);
    expect(brightAt(1, lambda, d, big) / big).toBeCloseTo(Math.tan(th), 6);
    expect(doubleSlitFar(lambda / d, lambda, d)).toBeCloseTo(1, 12);
    expect(doubleSlitFar((0.5 * lambda) / d, lambda, d)).toBeCloseTo(0, 12);
    // Envelope: a zero of the single-slit factor removes that fringe.
    expect(doubleSlitFar(lambda / 1, lambda, d, 1)).toBeCloseTo(0, 12);
  });

  it('default marker sits on the first bright fringe', () => {
    const p = defaults(doubleSlit.params);
    expect(pathDiff(p.d, p.D, p.yp) / (p.lambda / 1000)).toBeCloseTo(1, 2);
  });
});

describe('ch35 wave field', () => {
  const f = field();
  const I = f.screenSteady();

  it('screen maxima where ΔL = mλ (two point sources)', () => {
    const ys = f.screenY;
    const dyS = ys[1] - ys[0];
    const ps = peaks(I).map((i) => ys[i]);
    for (const m of [-2, -1, 0, 1, 2]) {
      const y = brightAt(m, lambda, d, D);
      const near = ps.reduce((a, b) => (Math.abs(b - y) < Math.abs(a - y) ? b : a));
      expect(Math.abs(near - y)).toBeLessThan(2 * dyS);
    }
  });

  it('dark fringes are nearly zero (ΔL = λ/2)', () => {
    const iy = (y: number) => {
      let best = 0;
      for (let i = 0; i < f.screenY.length; i++) if (Math.abs(f.screenY[i] - y) < Math.abs(f.screenY[best] - y)) best = i;
      return best;
    };
    const max = I[iy(0)];
    // ΔL(y) = λ/2: bisection between the bright fringes 0 and 1.
    let lo = 0;
    let hi = brightAt(1, lambda, d, D);
    for (let k = 0; k < 60; k++) {
      const mid = (lo + hi) / 2;
      if (pathDiff(d, D, mid) < lambda / 2) lo = mid;
      else hi = mid;
    }
    let min = Infinity;
    for (let i = iy(lo) - 3; i <= iy(lo) + 3; i++) min = Math.min(min, I[i]);
    expect(min / max).toBeLessThan(0.01);
  });

  it('time average of ψ² on the screen converges to the steady intensity', () => {
    const psi = new Float64Array(f.screenY.length);
    const h = f.period / 40;
    const t0 = f.tb + Math.hypot(D, 12) / C_LIGHT + 2;
    let acc = 0;
    const k = 240; // screen centre
    const n = 40 * 10;
    for (let i = 0; i < n; i++) {
      f.screenPsi(t0 + i * h, psi);
      acc += psi[k] * psi[k];
    }
    expect(acc / n).toBeCloseTo(I[k], 6);
  });

  it('paints an opaque image; front not yet past the barrier at t = 0', () => {
    const data = new Uint8ClampedArray(f.nx * f.ny * 4);
    f.paint(0, data, wavelengthRGB(500));
    for (let i = 3; i < data.length; i += 4) expect(data[i]).toBe(255);
    // Behind the barrier nothing has arrived: white.
    const o = (Math.floor(f.ny / 2) * f.nx + f.nx - 2) * 4;
    expect([data[o], data[o + 1], data[o + 2]]).toEqual([255, 255, 255]);
  });

  it('sources: one per narrow slit, spacing ≤ λ/3 across a wide one', () => {
    expect(sourcesOf({ yc: 1, w: 0 }, 0.5)).toEqual([1]);
    const s = sourcesOf({ yc: 0, w: 2 }, 0.5);
    expect(s.length).toBe(12);
    expect(s[0] - s[1]).toBeLessThanOrEqual(0.5 / 3 + 1e-12);
  });
});
