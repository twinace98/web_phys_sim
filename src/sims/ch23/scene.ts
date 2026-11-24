// Ch 23 scene: Gaussian surface (circle, square, free curve) around line charges; the outward
// field component along it and ∮ E_n dl next to λ_enc / ε0.
import { CONST, u } from '../../core/tex';
import type { Params, Vec2 } from '../../core/types';
import type { Draw } from '../../draw/draw';
import { pathScene } from '../field/closedpath';
import { chargeGlyph, texNum } from '../field/render';
import { ENC_FLUX, LINE_E, LINE_LAYOUT, LINE_POOL } from './physics';

/** λ_enc [nC/m] as the stage panel and the Σ panel print it: integers bare (R2), else 3 figures. */
const lamTex = (enc: number) => (Number.isInteger(enc) ? String(enc) : texNum(enc, 3, 1e-9));
/** ∮ E_n dl and λ_enc/ε0 [N m/C] in both panels: 3 figures, below 0.05 an exact 0 (R7a, R8). */
const fluxTex = (v: number) => texNum(v, 3, 0.05);

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

/** Region the Gaussian surface (and its knobs) stays inside: within the ±0.8 m stage. */
const BOX: [number, number, number, number] = [-1.15, -0.75, 1.15, 0.75];

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
    return `\\begin{array}{rcl} \\lambda_\\text{enc} &=& ${lamTex(enc)}\\ \\mathrm{nC/m} \\\\ \\oint E_n\\,dl &=& ${fluxTex(flux)}${UNIT} \\\\ \\lambda_\\text{enc}/\\varepsilon_0 &=& ${fluxTex(rhs)}${UNIT} \\end{array}`;
  },
  G0: { default: [-0.3, 0, 0.4] },
  box: BOX,
  info: {
    goals: ['ch23.goal.law', 'ch23.goal.2d', 'ch23.goal.out'],
    observe: ['ch23.obs.cross', 'ch23.obs.outside', 'ch23.obs.shape', 'ch23.obs.arrows', 'ch23.obs.lines', 'ch23.obs.tray'],
    equations: ['\\oint \\vec E\\cdot d\\vec A = \\frac{q_\\text{enc}}{\\varepsilon_0}', '\\text{2D:}\\quad \\oint E_n\\,dl = \\frac{\\lambda_\\text{enc}}{\\varepsilon_0}, \\quad E = \\frac{\\lambda}{2\\pi\\varepsilon_0 r}'],
    assumptions: ['ch23.as.sym', 'ch23.as.2d', 'ch23.as.units', 'ch23.as.num', 'ch23.as.snap', 'ch23.as.box'],
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

const clamp = (v: number, lo: number, hi: number) => (lo > hi ? (lo + hi) / 2 : Math.min(hi, Math.max(lo, v)));
type H = NonNullable<typeof base.handles>[number];
/** The factory's surface handles are its last ten: centre, rim, then the eight free-curve points. */
const NS = base.handles!.length - 10;
const centreH = base.handles![NS];
const rimH = base.handles![NS + 1];

/**
 * QA 2026-11-24: the shared surface handles allow a size up to 1.1 m on a ±0.8 m stage, so the
 * circle and its rim knob could leave the stage. Here the pointer is limited before the factory's
 * handler sees it (which still keeps the path clear of the charges): the centre only goes where the
 * whole circle, square or free curve stays inside BOX, and the rim only as far as BOX allows.
 */
const keepOnStage = (h: H, i: number): H => {
  const [x0, y0, x1, y1] = BOX;
  if (i === NS)
    return {
      ...h,
      onDrag: (ctx, s, w) => {
        const p = ctx.params;
        const c = centreH.pos(s, p);
        let ext: [number, number, number, number];
        if (p.shape === 'free') {
          const fx = p.F.filter((_, k) => k % 2 === 0);
          const fy = p.F.filter((_, k) => k % 2 === 1);
          ext = [Math.min(...fx), Math.min(...fy), Math.max(...fx), Math.max(...fy)];
        } else {
          const r = rimH.pos(s, p);
          const size = p.shape === 'square' ? r.x - c.x : Math.hypot(r.x - c.x, r.y - c.y);
          ext = [-size, -size, size, size];
        }
        h.onDrag(ctx, s, { x: clamp(w.x, x0 - ext[0], x1 - ext[2]), y: clamp(w.y, y0 - ext[1], y1 - ext[3]) });
      },
    };
  if (i === NS + 1)
    return {
      ...h,
      onDrag: (ctx, s, w) => {
        const c = centreH.pos(s, ctx.params);
        const max = Math.max(0, Math.min(x1 - c.x, c.x - x0, y1 - c.y, c.y - y0));
        let dx = w.x - c.x;
        let dy = w.y - c.y;
        if (ctx.params.shape === 'square') {
          dx = clamp(dx, -max, max);
          dy = clamp(dy, -max, max);
        } else {
          const m = Math.hypot(dx, dy);
          if (m > max && m > 0) {
            dx *= max / m;
            dy *= max / m;
          }
        }
        h.onDrag(ctx, s, { x: c.x + dx, y: c.y + dy });
      },
    };
  return h;
};

/** Σ panel: λ_enc, λ_enc/ε0 with ε0 substituted, and the numerical ∮ E_n dl. */
export const gaussScene: typeof base = {
  ...base,
  handles: base.handles!.map(keepOnStage),
  formula: (_s, p) => {
    const { flux, rhs, enc } = gaussValues(p);
    const lam = lamTex(enc);
    return [
      `\\lambda_\\text{enc} = ${lam}${u('nC/m')}`,
      `\\frac{\\lambda_\\text{enc}}{\\varepsilon_0} = \\frac{${enc === 0 ? '0' : `${lam}\\times 10^{-9}`}}{${CONST.eps0.tex}} = ${fluxTex(rhs)}${UNIT}`,
      `\\oint E_n\\,dl = ${fluxTex(flux)}${UNIT}`,
    ];
  },
};
