// Point charges in the plane (Ch 22, Ch 24): pool, presets, physical units.
// Charges in nC, lengths in m: E [N/C] = K_E·1e-9 · fieldAt(point), V [V] = K_E·1e-9 · potentialAt.
import type { ArrayParam, SelectParam, WorldSpec } from '../../core/types';
import { K_E, fieldAt, potentialAt, type Src, type V2 } from './physics';
import { Pool, tagOf, type Box, type Placed } from './slots';

/** nC → SI prefactor: field [N/C] and potential [V] per unit strength. */
export const KQ = K_E * 1e-9;

/** Kinds +1, +2, −1, −2 nC. */
export const POINT_POOL = new Pool([1, 2, -1, -2], [8, 3, 8, 3]);

export const PRESETS = ['single', 'dipole', 'like', 'plates'] as const;

const plates: Placed[] = [];
for (let i = 0; i < 8; i++) {
  const x = -0.7 + (1.4 * i) / 7;
  plates.push([0, Math.round(x * 1000) / 1000, 0.3], [2, Math.round(x * 1000) / 1000, -0.3]);
}

export const PRESET_LAYOUT: Record<(typeof PRESETS)[number], Placed[]> = {
  single: [[0, 0, 0]],
  dipole: [
    [0, -0.4, 0],
    [2, 0.4, 0],
  ],
  like: [
    [0, -0.4, 0],
    [0, 0.4, 0],
  ],
  plates,
};

export const BOX: Box = [-1.15, -0.75, 1.15, 0.75];
export const pointWorld = (): WorldSpec => ({ x: [-1.2, 1.2], y: [-0.8, 0.8], aspect: 'contain', padPx: 8 });

export const presetParam = (prefix: string, def: (typeof PRESETS)[number] = 'dipole'): SelectParam => ({
  kind: 'select',
  label: `${prefix}.p.preset`,
  desc: `${prefix}.d.preset`,
  group: 'main',
  live: true,
  default: def,
  options: PRESETS.map((v) => ({ value: v, label: `field.preset.${v}` })),
});

export const layoutParam = (prefix: string): ArrayParam => ({
  kind: 'array',
  label: `${prefix}.p.layout`,
  group: 'hidden',
  live: true,
  default: POINT_POOL.blank(),
  min: -99,
  max: 99,
});

export const presetTag = (p: { preset: string }) => tagOf(PRESETS as unknown as string[], p.preset);
export const pointCoords = (p: { preset: string; Q: number[] }) =>
  POINT_POOL.coords(p.Q, presetTag(p), PRESET_LAYOUT[p.preset as (typeof PRESETS)[number]] ?? PRESET_LAYOUT.dipole);
export const pointSources = (p: { preset: string; Q: number[] }) => POINT_POOL.sources(pointCoords(p));

/** E [N/C] at (x, y). */
export const E = (src: readonly Src[], x: number, y: number): V2 => {
  const [fx, fy] = fieldAt(src, 'point', x, y);
  return [KQ * fx, KQ * fy];
};

/** V [V] at (x, y). */
export const V = (src: readonly Src[], x: number, y: number) => KQ * potentialAt(src, 'point', x, y);

/** Keep a test charge at least `d` from every source. */
export function clearOf(src: readonly Src[], x: number, y: number, d = 0.05): V2 {
  for (const c of src) {
    const r = Math.hypot(x - c.x, y - c.y);
    if (r < d) {
      const ux = r > 1e-9 ? (x - c.x) / r : 1;
      const uy = r > 1e-9 ? (y - c.y) / r : 0;
      x = c.x + ux * d;
      y = c.y + uy * d;
    }
  }
  return [x, y];
}
