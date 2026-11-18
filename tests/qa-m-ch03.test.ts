import { describe, expect, it } from 'vitest';
import { fmt } from '../src/core/format';
import { axes, components, placeComponentTip, setComponent, type V2 } from '../src/sims/ch03/physics';
import { componentsScene } from '../src/sims/ch03/scene';

const deg = Math.PI / 180;
const LIM = 5.5;
const HALF = 6.3; // world half-width of the stage
const PHIS = Array.from({ length: 61 }, (_, i) => i);
const POINTERS: V2[] = [];
for (let x = -6.6; x <= 6.6 + 1e-9; x += 0.3) for (let y = -6.6; y <= 6.6 + 1e-9; y += 0.3) POINTERS.push([x, y]);

const onGrid = (v: number) => fmt(v) === fmt(Math.round(v * 2) / 2);

/** Both component tips (as drawn: c.ax along e_x, c.ay along e_y) in screen coordinates. */
function compTips(a: V2, phi: number): V2[] {
  const c = components(a, phi);
  const { ex, ey } = axes(phi);
  return [
    [ex[0] * c.ax, ex[1] * c.ax],
    [ey[0] * c.ay, ey[1] * c.ay],
  ];
}

describe('ch03 components, 0.5 grid snap in rotated axes', () => {
  it('every snapped tip shows components that are exact multiples of 0.5 (no 1.49 / −2.51)', () => {
    let bad = 0;
    for (const phi of PHIS) {
      for (const w of POINTERS) {
        const a = placeComponentTip(w, phi * deg, true, LIM);
        const c = components(a, phi * deg);
        if (!onGrid(c.ax) || !onGrid(c.ay)) bad++;
      }
    }
    expect(bad).toBe(0);
  });

  it('dragging a component handle in snap mode keeps both components on the grid', () => {
    let bad = 0;
    for (const phi of [10, 22, 37, 45, 60]) {
      for (const w of POINTERS) {
        let a = placeComponentTip([2.2, 1.3], phi * deg, true, LIM);
        a = setComponent(a, phi * deg, 0, w, true, LIM);
        a = setComponent(a, phi * deg, 1, [w[1], -w[0]], true, LIM);
        const c = components(a, phi * deg);
        if (!onGrid(c.ax) || !onGrid(c.ay)) bad++;
      }
    }
    expect(bad).toBe(0);
  });
});

describe('ch03 components stay on the stage', () => {
  it('tip and both component tips stay within ±5.5 for any pointer and any axis angle', () => {
    let worst = 0;
    for (const snap of [false, true]) {
      for (const phiDrag of [0, 22, 45]) {
        for (const w of POINTERS) {
          const a = placeComponentTip(w, phiDrag * deg, snap, LIM);
          worst = Math.max(worst, Math.abs(a[0]), Math.abs(a[1]));
          // The axes slider can then turn to any angle without moving A.
          for (const phi of PHIS) for (const q of compTips(a, phi * deg)) worst = Math.max(worst, Math.abs(q[0]), Math.abs(q[1]));
          // Component handles too.
          for (const axis of [0, 1] as const) {
            const b = setComponent(a, phiDrag * deg, axis, w, snap, LIM);
            for (const q of compTips(b, phiDrag * deg)) worst = Math.max(worst, Math.abs(q[0]), Math.abs(q[1]));
          }
        }
      }
    }
    // Before: a corner tip (5.5, 5.5) put a component tip at 6.64, beyond the 6.3 half-width.
    expect(worst).toBeLessThanOrEqual(LIM + 1e-5);
    expect(worst).toBeLessThan(HALF);
  });

  it('tips along the axes still reach 5.5', () => {
    expect(placeComponentTip([9, 0], 0, false, LIM)).toEqual([5.5, 0]);
    expect(placeComponentTip([0, -9], 0, true, LIM)).toEqual([0, -5.5]);
  });
});

describe('ch03 components scene: dragging the tip in snap mode (as the stage does)', () => {
  it('the shown components are multiples of 0.5 at every pointer position and axis angle', () => {
    let bad = 0;
    let n = 0;
    for (const phi of [10, 20, 30, 45, 60]) {
      for (const w of POINTERS) {
        const params: any = { phi, drag: 'snap', A: [4, 3] };
        const ctx = { params, set: (k: string, v: any) => (params[k] = v) };
        componentsScene.handles![0].onDrag!(ctx as any, { t: 0 }, { x: w[0], y: w[1] });
        const c = components([params.A[0], params.A[1]], phi * deg);
        n++;
        if (!onGrid(c.ax) || !onGrid(c.ay)) bad++;
      }
    }
    // Before: 36–44 % of the grid points showed 1.49 / −2.51 style values.
    expect(bad / n).toBe(0);
  });
});
