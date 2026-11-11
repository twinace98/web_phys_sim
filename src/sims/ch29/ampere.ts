// Ch 29 scene: Ampère's law. Line currents ⊥ page (⊙ / ⊗), a deformable loop, the tangential
// component of B along it, and ∮ B·dl next to μ0 I_enc.
import { pathScene } from '../field/closedpath';
import { texNum, wireGlyph } from '../field/render';
import { MU0_UT, WIRE_B, WIRE_POOL, WIRE_PRESETS } from './physics';

const UNIT = '\\ \\mu\\mathrm{T\\,m}';

export const ampere = pathScene({
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
  overlay: (circ, rhs, enc) =>
    `\\begin{array}{rcl} I_\\text{enc} &=& ${texNum(enc, 3).replace(/\.00$/, '')}\\ \\mathrm{A} \\\\ \\oint \\vec B\\cdot d\\vec l &=& ${texNum(circ, 3, 5e-4)}${UNIT} \\\\ \\mu_0 I_\\text{enc} &=& ${texNum(rhs, 3, 5e-4)}${UNIT} \\end{array}`,
  G0: { single: [0.15, -0.1, 0.4], pair: [-0.35, -0.12, 0.3], solenoid: [0, 0.16, 0.17] },
  box: [-1.15, -0.75, 1.15, 0.75],
  info: {
    goals: ['ch29.a.goal.law', 'ch29.a.goal.out'],
    observe: ['ch29.a.obs.single', 'ch29.a.obs.pair', 'ch29.a.obs.solenoid', 'ch29.a.obs.arrows', 'ch29.a.obs.shape', 'ch29.a.obs.tray'],
    equations: ['\\oint \\vec B\\cdot d\\vec l = \\mu_0 I_\\text{enc}', 'B = \\frac{\\mu_0 I}{2\\pi r}'],
    assumptions: ['ch29.a.as.2d', 'ch29.a.as.units', 'ch29.a.as.sign', 'ch29.a.as.num'],
  },
});
