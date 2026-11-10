// Shared by the Ch 2 scenes: position–velocity–acceleration plots linked by slope and area.
import type { Params, PlotSpec } from '../../core/types';
import { areaUnderA, areaUnderV, type Profile, type Ranges } from './physics';

/** Range including zero, at least minSpan wide, with a margin. */
export function padded([lo0, hi0]: [number, number], minSpan: number): [number, number] {
  let lo = Math.min(lo0, 0);
  let hi = Math.max(hi0, 0);
  if (hi - lo < minSpan) {
    const mid = (hi + lo) / 2;
    lo = Math.min(lo, mid - minSpan / 2);
    hi = Math.max(hi, mid + minSpan / 2);
  }
  const m = 0.12 * (hi - lo);
  return [lo - m, hi + m];
}

type Model = { pr: Profile; rg: Ranges };

/**
 * Three stacked plots: position `pos` (x or y), v and a. In 'slope' mode the tangent of each
 * graph marks the value on the next; in 'area' mode the area under each marks the change in
 * the previous. Areas are exact (rectangles under a, trapezoids under v).
 */
export function kinematicPlots<P extends Params & { mode: string }>(
  pos: 'x' | 'y',
  model: (p: P) => Model,
  aRange?: (p: P) => [number, number],
): PlotSpec<P>[] {
  return [
    {
      id: pos,
      label: `${pos}\\,(\\mathrm{m})`,
      traces: [{ channel: pos, role: 'position' }],
      yRange: (p) => padded(model(p).rg.x, 2),
      overlays: (p) =>
        p.mode === 'slope' ? [{ kind: 'tangent', channel: pos, slopeChannel: 'v', role: 'velocity', unit: 'm/s', target: { plot: 'v', channel: 'v' } }] : [],
    },
    {
      id: 'v',
      label: 'v\\,(\\mathrm{m/s})',
      traces: [{ channel: 'v', role: 'velocity' }],
      yRange: (p) => padded(model(p).rg.v, 1),
      overlays: (p) =>
        p.mode === 'slope'
          ? [{ kind: 'tangent', channel: 'v', slopeChannel: 'a', role: 'acceleration', unit: 'm/s²', target: { plot: 'a', channel: 'a' } }]
          : [
              {
                kind: 'area',
                channel: 'v',
                role: 'velocity',
                unit: 'm',
                symbol: `Δ*${pos}*`,
                area: (pp, t0, t1) => areaUnderV(model(pp as P).pr, t0, t1),
                target: { plot: pos, channel: pos },
              },
            ],
    },
    {
      id: 'a',
      label: 'a\\,(\\mathrm{m/s^2})',
      traces: [{ channel: 'a', role: 'acceleration' }],
      yRange: (p) => (aRange ? aRange(p) : padded(model(p).rg.a, 1)),
      overlays: (p) =>
        p.mode === 'area'
          ? [
              {
                kind: 'area',
                channel: 'a',
                role: 'acceleration',
                unit: 'm/s',
                symbol: 'Δ*v*',
                area: (pp, t0, t1) => areaUnderA(model(pp as P).pr, t0, t1),
                target: { plot: 'v', channel: 'v' },
              },
            ]
          : [],
    },
  ];
}
