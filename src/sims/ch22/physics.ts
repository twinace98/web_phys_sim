// Ch 22: Coulomb forces on a test charge. Charges in nC, lengths in m. DOM-free.
import { K_E, type Src, type V2 } from '../field/physics';

/**
 * Force [N] of each source on a test charge q0 [nC] at (x, y), and their vector sum.
 * F_i = k q_i q0 r̂ / r², superposition gives F = Σ F_i = q0 E.
 */
export function coulombForces(src: readonly Src[], x: number, y: number, q0: number): { parts: V2[]; net: V2 } {
  const parts: V2[] = [];
  let nx = 0;
  let ny = 0;
  for (const c of src) {
    const dx = x - c.x;
    const dy = y - c.y;
    const r = Math.hypot(dx, dy);
    if (r < 1e-9) {
      parts.push([0, 0]);
      continue;
    }
    const w = (K_E * c.s * 1e-9 * q0 * 1e-9) / (r * r * r);
    parts.push([w * dx, w * dy]);
    nx += w * dx;
    ny += w * dy;
  }
  return { parts, net: [nx, ny] };
}
