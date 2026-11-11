// Ch 23 scene: Gaussian surface (circle, square, free curve) around line charges; the outward
// field component along it and ∮ E_n dl next to λ_enc / ε0.
import { pathScene } from '../field/closedpath';
import { chargeGlyph, texNum } from '../field/render';
import { ENC_FLUX, LINE_E, LINE_LAYOUT, LINE_POOL } from './physics';

const UNIT = '\\ \\mathrm{N\\,m/C}';

export const gaussScene = pathScene({
  id: 'gauss',
  prefix: 'ch23',
  kernel: 'line',
  mode: 'flux',
  pool: LINE_POOL,
  presets: { default: LINE_LAYOUT },
  defaultPreset: 'default',
  presetMain: false,
  viewMain: true,
  glyph: chargeGlyph,
  integralScale: LINE_E,
  encScale: ENC_FLUX,
  overlay: (flux, rhs, enc) =>
    `\\begin{array}{rcl} \\lambda_\\text{enc} &=& ${texNum(enc, 3, 1e-9).replace(/\.00$/, '')}\\ \\mathrm{nC/m} \\\\ \\oint E_n\\,dl &=& ${texNum(flux, 3, 0.05)}${UNIT} \\\\ \\lambda_\\text{enc}/\\varepsilon_0 &=& ${texNum(rhs, 3, 0.05)}${UNIT} \\end{array}`,
  G0: { default: [-0.3, 0, 0.4] },
  box: [-1.15, -0.75, 1.15, 0.75],
  info: {
    goals: ['ch23.goal.law', 'ch23.goal.out'],
    observe: ['ch23.obs.cross', 'ch23.obs.outside', 'ch23.obs.shape', 'ch23.obs.arrows', 'ch23.obs.lines', 'ch23.obs.tray'],
    equations: ['\\oint \\vec E\\cdot d\\vec A = \\frac{q_\\text{enc}}{\\varepsilon_0}', '\\text{2D:}\\quad \\oint E_n\\,dl = \\frac{\\lambda_\\text{enc}}{\\varepsilon_0}, \\quad E = \\frac{\\lambda}{2\\pi\\varepsilon_0 r}'],
    assumptions: ['ch23.as.2d', 'ch23.as.units', 'ch23.as.num', 'ch23.as.snap'],
  },
});
