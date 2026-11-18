// Ch 29 scene: Ampère's law. Line currents ⊥ page (⊙ / ⊗), a deformable loop, the tangential
// component of B along it, and ∮ B·dl next to μ0 I_enc.
import { tn } from '../../core/tex';
import type { Params } from '../../core/types';
import { pathScene } from '../field/closedpath';
import { texNum, wireGlyph } from '../field/render';
import { MU0_UT, WIRE_B, WIRE_POOL, WIRE_PRESETS } from './physics';

const UNIT = '\\ \\mu\\mathrm{T\\,m}';

/** Values the factory last passed to the stage panel: ∮ B·dl, μ0 I_enc [μT m], I_enc [A]. */
let shown = { circ: 0, rhs: 0, enc: 0 };

const base = pathScene({
  id: 'ampere',
  prefix: 'ch29.a',
  kernel: 'wire',
  mode: 'circ',
  pool: WIRE_POOL,
  presets: WIRE_PRESETS,
  defaultPreset: 'pair',
  presetMain: true,
  viewMain: false,
  // Wires of the solenoid section sit 8 cm apart: shrink the glyph on small screens.
  glyph: (g, p, s, alpha, chip) => wireGlyph(g, p, s, alpha, chip ? 10 : Math.min(10, Math.max(4, g.vp.scale * 0.028))),
  integralScale: WIRE_B,
  encScale: MU0_UT,
  overlay: (circ, rhs, enc) => {
    shown = { circ, rhs, enc };
    return `\\begin{array}{rcl} I_\\text{enc} &=& ${texNum(enc, 3).replace(/\.00$/, '')}\\ \\mathrm{A} \\\\ \\oint \\vec B\\cdot d\\vec l &=& ${texNum(circ, 3, 5e-4)}${UNIT} \\\\ \\mu_0 I_\\text{enc} &=& ${texNum(rhs, 3, 5e-4)}${UNIT} \\end{array}`;
  },
  G0: { single: [0.15, -0.1, 0.4], pair: [-0.35, -0.12, 0.3], solenoid: [0, 0.16, 0.17] },
  box: [-1.15, -0.75, 1.15, 0.75],
  info: {
    goals: ['ch29.a.goal.law', 'ch29.a.goal.out'],
    observe: ['ch29.a.obs.single', 'ch29.a.obs.pair', 'ch29.a.obs.solenoid', 'ch29.a.obs.arrows', 'ch29.a.obs.shape', 'ch29.a.obs.tray'],
    equations: ['\\oint \\vec B\\cdot d\\vec l = \\mu_0 I_\\text{enc}', 'B = \\frac{\\mu_0 I}{2\\pi r}'],
    assumptions: ['ch29.a.as.2d', 'ch29.a.as.units', 'ch29.a.as.sign', 'ch29.a.as.num'],
  },
});

/** Below the stage panel's zero tolerance a value prints as 0, as there. */
const z = (v: number, tol: number) => (Math.abs(v) < tol ? 0 : v);

/**
 * The stage panel's values from the factory's own (memoised) model, read through the overlay it
 * builds: ∮ B·dl and μ0 I_enc [μT m], I_enc [A].
 */
export function ampereValues(p: Params): { circ: number; rhs: number; enc: number } {
  base.overlay!({ t: 0 }, p as never);
  return { circ: z(shown.circ, 5e-4), rhs: z(shown.rhs, 5e-4), enc: z(shown.enc, 1e-9) };
}

/** Σ panel: I_enc, μ0 I_enc with μ0 substituted, and the numerical ∮ B·dl. */
export const ampere: typeof base = {
  ...base,
  formula: (_s, p) => {
    const { circ, rhs, enc } = ampereValues(p);
    const I = Number.isInteger(enc) ? String(enc) : tn(enc);
    return [
      `I_\\text{enc} = ${I}\\ \\mathrm{A}`,
      `\\mu_0 I_\\text{enc} = (4\\pi\\times 10^{-7})(${I})\\ \\mathrm{T\\,m} = ${tn(rhs)}${UNIT}`,
      `\\oint \\vec B\\cdot d\\vec l = ${tn(circ)}${UNIT}`,
    ];
  },
};
