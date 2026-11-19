// Ch 23 scene: Gaussian surface (circle, square, free curve) around line charges; the outward
// field component along it and ∮ E_n dl next to λ_enc / ε0.
import { tn, u } from '../../core/tex';
import type { Params, Vec2 } from '../../core/types';
import type { Draw } from '../../draw/draw';
import { pathScene } from '../field/closedpath';
import { EPS0 } from '../field/physics';
import { chargeGlyph, texNum } from '../field/render';
import { ENC_FLUX, LINE_E, LINE_LAYOUT, LINE_POOL } from './physics';

const UNIT = '\\ \\mathrm{N\\,m/C}';

/** Gap between the ± disc and the ring around a line charge, and the ring's stroke [px]. */
export const RING_GAP = 3.5;
export const RING_W = 2;

/**
 * Line charge seen end-on (⊥ page): the point-charge ± disc inside a ring of its colour on a
 * white halo, so it reads as a different object from the point charges of Ch 22 and 24.
 */
export function lineChargeGlyph(g: Draw, p: Vec2, s: number, alpha = 1): void {
  const r = Math.abs(s) > 1.5 ? 13 : 10;
  g.circle(p, r + RING_GAP, { fill: '#ffffff', role: s > 0 ? 'positive' : 'negative', width: RING_W, alpha });
  chargeGlyph(g, p, s, alpha);
}

/** Values the factory last passed to the stage panel: ∮ E_n dl, λ_enc/ε0 [N m/C], λ_enc [nC/m]. */
let shown = { flux: 0, rhs: 0, enc: 0 };

const base = pathScene({
  id: 'gauss',
  prefix: 'ch23',
  kernel: 'line',
  mode: 'flux',
  pool: LINE_POOL,
  presets: { default: LINE_LAYOUT },
  defaultPreset: 'default',
  presetMain: false,
  viewMain: true,
  glyph: lineChargeGlyph,
  integralScale: LINE_E,
  encScale: ENC_FLUX,
  overlay: (flux, rhs, enc) => {
    shown = { flux, rhs, enc };
    return `\\begin{array}{rcl} \\lambda_\\text{enc} &=& ${texNum(enc, 3, 1e-9).replace(/\.00$/, '')}\\ \\mathrm{nC/m} \\\\ \\oint E_n\\,dl &=& ${texNum(flux, 3, 0.05)}${UNIT} \\\\ \\lambda_\\text{enc}/\\varepsilon_0 &=& ${texNum(rhs, 3, 0.05)}${UNIT} \\end{array}`;
  },
  G0: { default: [-0.3, 0, 0.4] },
  box: [-1.15, -0.75, 1.15, 0.75],
  info: {
    goals: ['ch23.goal.law', 'ch23.goal.2d', 'ch23.goal.out'],
    observe: ['ch23.obs.cross', 'ch23.obs.outside', 'ch23.obs.shape', 'ch23.obs.arrows', 'ch23.obs.lines', 'ch23.obs.tray'],
    equations: ['\\oint \\vec E\\cdot d\\vec A = \\frac{q_\\text{enc}}{\\varepsilon_0}', '\\text{2D:}\\quad \\oint E_n\\,dl = \\frac{\\lambda_\\text{enc}}{\\varepsilon_0}, \\quad E = \\frac{\\lambda}{2\\pi\\varepsilon_0 r}'],
    assumptions: ['ch23.as.2d', 'ch23.as.units', 'ch23.as.num', 'ch23.as.snap'],
  },
});

/** Below the stage panel's zero tolerance a value prints as 0, as there. */
const z = (v: number, tol: number) => (Math.abs(v) < tol ? 0 : v);

/**
 * The stage panel's values from the factory's own (memoised) model, read through the overlay it
 * builds: ∮ E_n dl and λ_enc/ε0 [N m/C], λ_enc [nC/m].
 */
export function gaussValues(p: Params): { flux: number; rhs: number; enc: number } {
  base.overlay!({ t: 0 }, p as never);
  return { flux: z(shown.flux, 0.05), rhs: z(shown.rhs, 0.05), enc: z(shown.enc, 1e-9) };
}

/** Σ panel: λ_enc, λ_enc/ε0 with ε0 substituted, and the numerical ∮ E_n dl. */
export const gaussScene: typeof base = {
  ...base,
  formula: (_s, p) => {
    const { flux, rhs, enc } = gaussValues(p);
    const lam = Number.isInteger(enc) ? String(enc) : tn(enc);
    return [
      `\\lambda_\\text{enc} = ${lam}${u('nC/m')}`,
      `\\frac{\\lambda_\\text{enc}}{\\varepsilon_0} = \\frac{${enc === 0 ? '0' : `${lam}\\times 10^{-9}`}}{${texNum(EPS0, 4, 0)}} = ${tn(rhs)}${UNIT}`,
      `\\oint E_n\\,dl = ${tn(flux)}${UNIT}`,
    ];
  },
};
