// Ch 30 scene: Faraday-Lenz. A square loop crosses a field region, or a bar magnet passes
// through a coil (side view). Φ_B(t) with its tangent, ℰ = −dΦ_B/dt, induced current and the
// field it makes, which opposes the change of flux.
import type { ParamSchema, Scene, Vec2 } from '../../core/types';
import type { Draw } from '../../draw/draw';
import { wireGlyph } from '../field/render';
import { A_COIL, A_LOOP, M_MAG, REGION, REGION_H, dipoleFlux, dipoleFluxRate, faradayAt, faradayEnd } from './physics';

type P = { scenario: string; v: number; B: number };
type S = { t: number };

const INDUCED = '#009E73';
const GREY = '#8c8c8c';
const MAG_L = 0.3;
const MAG_H = 0.09;

const params: ParamSchema<P> = {
  scenario: {
    kind: 'select',
    label: 'ch30.f.p.scenario',
    desc: 'ch30.f.d.scenario',
    group: 'main',
    live: false,
    default: 'region',
    options: [
      { value: 'region', label: 'ch30.f.sc.region' },
      { value: 'magnet', label: 'ch30.f.sc.magnet' },
    ],
  },
  v: { kind: 'number', label: 'ch30.f.p.v', desc: 'ch30.f.d.v', group: 'main', live: false, control: 'slider', min: 0.2, max: 1, step: 0.05, default: 0.5, unit: 'm/s' },
  B: {
    kind: 'number',
    label: 'ch30.f.p.B',
    desc: 'ch30.f.d.B',
    group: 'advanced',
    live: false,
    control: 'slider',
    min: 0.1,
    max: 1,
    step: 0.05,
    default: 0.5,
    unit: 'T',
    visibleIf: (p) => p.scenario === 'region',
  },
};

const sc = (p: P) => (p.scenario === 'magnet' ? 'magnet' : 'region');
const at = (p: P, t: number) => faradayAt(sc(p), t, p.v, p.B);

/** Largest |Φ| [mWb] and |ℰ| [mV] over the run, for the plot ranges. */
function maxima(p: P): [number, number] {
  if (sc(p) === 'region') return [p.B * A_LOOP * A_LOOP * 1e3, p.B * A_LOOP * p.v * 1e3];
  const xm = A_COIL / 2; // |dΦ/dx| peaks at x = a/2
  return [dipoleFlux(0) * 1e3, Math.abs(dipoleFluxRate(xm)) * p.v * 1e3];
}

/** Arrow along a segment, centred, for the induced current. */
function midArrow(g: Draw, a: Vec2, b: Vec2): void {
  const m = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
  const d = { x: b.x - a.x, y: b.y - a.y };
  const l = Math.hypot(d.x, d.y);
  const L = g.px(30);
  g.arrow({ x: m.x - (d.x / l) * L * 0.5, y: m.y - (d.y / l) * L * 0.5 }, { x: (d.x / l) * L, y: (d.y / l) * L }, { color: INDUCED, width: 2.5 });
}

function drawRegion(g: Draw, p: P, s: S): void {
  const f = at(p, s.t);
  g.polygon(
    [
      { x: -REGION, y: -REGION_H },
      { x: REGION, y: -REGION_H },
      { x: REGION, y: REGION_H },
      { x: -REGION, y: REGION_H },
    ],
    { fill: '#000000', fillAlpha: 0.035, color: '#c8c8c8', width: 1 },
  );
  // External B out of the page: grid of ⊙, kept clear of the loop wire, the v arrow and its
  // label; inside the loop the induced-field symbols take their place while there is a current.
  const h0 = A_LOOP / 2;
  const induced = Math.abs(f.dphi) > 1e-12;
  const ax0 = f.x + h0 + g.px(10);
  const ax1 = ax0 + g.px(58);
  for (let i = 0; i < 5; i++) {
    for (let j = 0; j < 5; j++) {
      const q = { x: -REGION + (i + 0.5) * 0.2, y: -REGION_H + (j + 0.5) * 0.18 };
      const dx = Math.abs(q.x - f.x) - h0;
      const dy = Math.abs(q.y) - h0;
      const inside = dx < 0 && dy < 0;
      const toWire = inside ? Math.min(-dx, -dy) : Math.hypot(Math.max(dx, 0), Math.max(dy, 0));
      if ((inside && induced) || toWire < g.px(11)) continue;
      if (q.x > ax0 - g.px(10) && q.x < ax1 && Math.abs(q.y) < g.px(14)) continue;
      wireGlyph(g, q, 1, 0.75, 6, GREY);
    }
  }
  g.text({ x: REGION, y: REGION_H }, '*B*', { size: 14, color: GREY, align: 'right', baseline: 'bottom', dy: -5 });

  const h = A_LOOP / 2;
  const c = [
    { x: f.x - h, y: -h },
    { x: f.x + h, y: -h },
    { x: f.x + h, y: h },
    { x: f.x - h, y: h },
  ];
  g.polygon(c, { color: '#1a1a1a', width: 3 });
  g.arrow({ x: f.x + h + g.px(10), y: 0 }, { x: g.px(34), y: 0 }, { role: 'velocity', width: 2.5, label: '*v*' });
  const emf = -f.dphi;
  if (Math.abs(emf) > 1e-12) {
    // ℰ > 0: counter-clockwise (normal out of the page).
    const ccw = emf > 0;
    for (let k = 0; k < 4; k++) {
      const a = c[k];
      const b = c[(k + 1) % 4];
      if (ccw) midArrow(g, a, b);
      else midArrow(g, b, a);
    }
    g.text(c[3], '*I*', { size: 14, color: INDUCED, align: 'right', baseline: 'bottom', dx: -4, dy: -4 });
    // Induced field inside the loop: out of the page for ccw current.
    for (const dx of [-h / 2, h / 2]) for (const dy of [-h / 2, h / 2]) wireGlyph(g, { x: f.x + dx, y: dy }, ccw ? 1 : -1, 1, 8, INDUCED);
  }
}

/** Dipole field line r = C sin²θ around (x0, 0), both halves. */
function dipoleLine(g: Draw, x0: number, C: number): void {
  for (const sgn of [1, -1]) {
    const pts: Vec2[] = [];
    for (let k = 1; k < 120; k++) {
      const th = (Math.PI * k) / 120;
      const r = C * Math.sin(th) ** 2;
      pts.push({ x: x0 + r * Math.cos(th), y: sgn * r * Math.sin(th) });
    }
    g.polyline(pts, { color: '#b5b5b5', width: 1.1 });
    // At the outermost point (θ = 90°) the field points against m, i.e. −x.
    g.arrow({ x: x0 + g.px(4), y: sgn * C }, { x: -g.px(8), y: 0 }, { color: '#b5b5b5', width: 1.1 });
  }
}

function drawMagnet(g: Draw, p: P, s: S): void {
  const f = at(p, s.t);
  for (const C of [0.18, 0.3, 0.48, 0.75, 1.15]) dipoleLine(g, f.x, C);
  // Coil seen edge-on: ellipse; the page cuts it at (0, ±a).
  const ring: Vec2[] = [];
  for (let k = 0; k <= 64; k++) ring.push({ x: 0.045 * Math.cos((2 * Math.PI * k) / 64), y: A_COIL * Math.sin((2 * Math.PI * k) / 64) });
  g.polyline(ring, { color: '#1a1a1a', width: 3 });
  g.line({ x: -1.15, y: 0 }, { x: 1.15, y: 0 }, { color: '#d0d0d0', width: 1, dash: [3, 4] });

  // Magnet: S (blue) on the left, N (vermilion) on the right, moment along +x.
  const x0 = f.x - MAG_L / 2;
  g.polygon(
    [
      { x: x0, y: -MAG_H / 2 },
      { x: f.x, y: -MAG_H / 2 },
      { x: f.x, y: MAG_H / 2 },
      { x: x0, y: MAG_H / 2 },
    ],
    { fill: 'negative' },
  );
  g.polygon(
    [
      { x: f.x, y: -MAG_H / 2 },
      { x: f.x + MAG_L / 2, y: -MAG_H / 2 },
      { x: f.x + MAG_L / 2, y: MAG_H / 2 },
      { x: f.x, y: MAG_H / 2 },
    ],
    { fill: 'positive' },
  );
  g.text({ x: f.x - MAG_L / 4, y: 0 }, 'S', { size: 13, color: '#ffffff', align: 'center', baseline: 'middle', weight: 600 });
  g.text({ x: f.x + MAG_L / 4, y: 0 }, 'N', { size: 13, color: '#ffffff', align: 'center', baseline: 'middle', weight: 600 });
  g.arrow({ x: f.x + MAG_L / 2 + g.px(8), y: MAG_H / 2 + g.px(14) }, { x: g.px(30), y: 0 }, { role: 'velocity', width: 2.5, label: '*v*' });

  const emf = -f.dphi;
  if (Math.abs(emf) > 1e-9 * M_MAG) {
    // ℰ > 0 circulates counter-clockwise about +x: out of the page at the top, in at the bottom.
    const sg = emf > 0 ? 1 : -1;
    wireGlyph(g, { x: 0, y: A_COIL }, sg, 1, 8, INDUCED);
    wireGlyph(g, { x: 0, y: -A_COIL }, -sg, 1, 8, INDUCED);
    g.text({ x: 0, y: A_COIL }, '*I*', { size: 14, color: INDUCED, align: 'left', baseline: 'middle', dx: 12, dy: -6 });
    // Induced field on the axis, along +x for ℰ > 0.
    g.arrow({ x: 0, y: -A_COIL - g.px(26) }, { x: sg * g.px(40), y: 0 }, { color: INDUCED, width: 2.5 });
    g.text({ x: sg * g.px(40), y: -A_COIL - g.px(26) }, '*B*_{ind}', { size: 13, color: INDUCED, align: sg > 0 ? 'left' : 'right', baseline: 'middle', dx: sg * 8 });
  }
}

export const faraday: Scene<P, S> = {
  id: 'faraday',
  title: 'ch30.f.scene',
  layout: 'side',
  params,
  time: { h: 1 / 240, recordEvery: 2, frameStep: 0.05, tEnd: (p) => faradayEnd(sc(p as P), (p as P).v) },
  world: () => ({ x: [-1.2, 1.2], y: [-0.62, 0.62], aspect: 'contain', padPx: 10 }),
  init: () => ({ t: 0 }),
  step: (s, h) => {
    s.t += h;
  },
  record: (s, p) => {
    const f = at(p, s.t);
    return { t: s.t, phi: f.phi * 1e3, dphi: f.dphi * 1e3, emf: -f.dphi * 1e3 };
  },
  snapshot: (s) => ({ ...s }),

  draw: (g, s, p) => (sc(p) === 'region' ? drawRegion(g, p, s) : drawMagnet(g, p, s)),

  plots: [
    {
      id: 'phi',
      label: '\\Phi_B\\,(\\mathrm{mWb})',
      traces: [{ channel: 'phi', role: 'position' }],
      yRange: (p) => {
        const m = maxima(p)[0];
        return [-0.12 * m, 1.15 * m];
      },
      overlays: () => [{ kind: 'tangent', channel: 'phi', slopeChannel: 'dphi', role: 'velocity', unit: 'mWb/s', target: { plot: 'emf', channel: 'emf' } }],
    },
    {
      id: 'emf',
      label: '\\mathcal{E} = -d\\Phi_B/dt\\,(\\mathrm{mV})',
      traces: [{ channel: 'emf', role: 'velocity' }],
      yRange: (p) => {
        const m = maxima(p)[1];
        return [-1.25 * m, 1.25 * m];
      },
    },
  ],

  readouts: [
    { label: '\\Phi_B', unit: 'mWb', value: (s, p) => at(p, s.t).phi * 1e3 },
    { label: '\\mathcal{E}', unit: 'mV', value: (s, p) => -at(p, s.t).dphi * 1e3 },
  ],

  info: {
    goals: ['ch30.f.goal.law', 'ch30.f.goal.lenz'],
    observe: ['ch30.f.obs.enter', 'ch30.f.obs.full', 'ch30.f.obs.leave', 'ch30.f.obs.slope', 'ch30.f.obs.magnet', 'ch30.f.obs.v'],
    equations: ['\\Phi_B = \\int \\vec B\\cdot d\\vec A', '\\mathcal{E} = -\\frac{d\\Phi_B}{dt}', '\\text{region: } \\mathcal{E} = \\mp B a v'],
    assumptions: ['ch30.f.as.region', 'ch30.f.as.magnet', 'ch30.f.as.sign', 'ch30.f.as.self'],
  },
};
