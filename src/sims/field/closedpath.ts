// Scene factory shared by Gauss (Ch 23: line charges, flux) and Ampère (Ch 29: line currents,
// circulation): draggable sources with a palette, a deformable closed path, the normal or
// tangential field component along it, and the numerical integral next to the enclosed source.
import type { InfoSpec, ParamSchema, Params, Scene, Vec2 } from '../../core/types';
import type { Draw } from '../../draw/draw';
import { FieldLayers, palette } from './layers';
import { closedCirc, closedFlux, enclosed, fieldAt, fieldFn, perimeter, resample, type Src } from './physics';
import { Memo, componentArrows, drawSurface, knob, srcKey, type Tray } from './render';
import { Pool, slotHandles, tagOf, type Box, type Placed } from './slots';
import { freeDefault, keepOff, knobs, surfaceHandles, surfacePoly } from './surface';

export type PathP = Params & { preset: string; shape: string; view: string; Q: number[]; G: number[]; F: number[] };
type S = { t: number; tray?: Tray };

export interface PathSceneCfg {
  id: string;
  /** i18n prefix, e.g. 'ch23'. */
  prefix: string;
  kernel: 'line' | 'wire';
  mode: 'flux' | 'circ';
  pool: Pool;
  presets: Record<string, Placed[]>;
  defaultPreset: string;
  /** Preset select in the control bar (otherwise the drawer, or none for a single layout). */
  presetMain: boolean;
  viewMain: boolean;
  /** Source glyph; `chip` is true for the tray. */
  glyph: (g: Draw, p: Vec2, s: number, alpha: number, chip?: boolean) => void;
  /** Path integral of the kernel field × integralScale = displayed value. */
  integralScale: number;
  /** Enclosed strength × encScale = displayed right-hand side. */
  encScale: number;
  /** TeX panel from (integral, right-hand side, enclosed strength). */
  overlay: (integral: number, rhs: number, enc: number) => string;
  /** Initial path per preset: [cx, cy, size]. */
  G0: Record<string, number[]>;
  box: Box;
  info: InfoSpec;
}

export interface PathModel {
  src: Src[];
  poly: [number, number][];
  integral: number;
  enc: number;
}

export function pathScene(cfg: PathSceneCfg): Scene<PathP, S> {
  const names = Object.keys(cfg.presets);
  const tag = (p: PathP) => tagOf(names, p.preset);
  const G0 = (p: PathP) => cfg.G0[p.preset] ?? cfg.G0[cfg.defaultPreset];
  // G = [cx, cy, size, tag]: the stored path belongs to the preset it was dragged under.
  const Gin = (p: PathP) => (p.G.length === 4 && p.G[3] === tag(p) ? p.G.slice(0, 3) : G0(p));
  const packG = (p: PathP, g: number[]) => [...g, tag(p)];
  const coords = (p: PathP) => cfg.pool.coords(p.Q, tag(p), cfg.presets[p.preset] ?? cfg.presets[cfg.defaultPreset]);
  const sources = (p: PathP) => cfg.pool.sources(coords(p));
  const layers = new FieldLayers(cfg.kernel, 8);
  const memo = new Memo<PathModel>();
  const model = (p: PathP): PathModel => {
    const src = sources(p);
    const G = Gin(p);
    const key = `${srcKey(src)}|${p.shape}|${G.join(',')}|${p.shape === 'free' ? p.F.join(',') : ''}`;
    return memo.get(key, () => {
      const poly = surfacePoly(p.shape, G, p.F);
      const f = fieldFn(src, cfg.kernel);
      const integral = cfg.mode === 'flux' ? closedFlux(f, poly) : closedCirc(f, poly);
      return { src, poly, integral, enc: enclosed(src, poly) };
    });
  };
  const p = cfg.prefix;
  const multi = names.length > 1;

  const params: ParamSchema<PathP> = {
    preset: {
      kind: 'select',
      label: `${p}.p.preset`,
      desc: `${p}.d.preset`,
      group: multi ? (cfg.presetMain ? 'main' : 'advanced') : 'hidden',
      live: true,
      default: cfg.defaultPreset,
      options: names.map((v) => ({ value: v, label: `${p}.preset.${v}` })),
    },
    shape: {
      kind: 'select',
      label: `${p}.p.shape`,
      desc: `${p}.d.shape`,
      group: 'main',
      live: true,
      default: 'circle',
      options: (['circle', 'square', 'free'] as const).map((v) => ({ value: v, label: `field.shape.${v}` })),
    },
    view: {
      kind: 'select',
      label: `${p}.p.view`,
      desc: `${p}.d.view`,
      group: cfg.viewMain ? 'main' : 'advanced',
      live: true,
      default: 'lines',
      // Korean has separate words for electric (전기력선) and magnetic (자기력선) field lines.
      options: (['lines', 'vectors', 'off'] as const).map((v) => ({ value: v, label: v === 'lines' && cfg.kernel === 'wire' ? 'field.view.blines' : `field.view.${v}` })),
    },
    Q: { kind: 'array', label: `${p}.p.layout`, group: 'hidden', live: true, default: cfg.pool.blank(), min: -99, max: 99 },
    G: { kind: 'array', label: `${p}.p.G`, group: 'hidden', live: true, default: [...cfg.G0[cfg.defaultPreset], tagOf(names, cfg.defaultPreset)], min: -2, max: 2 },
    F: { kind: 'array', label: `${p}.p.F`, group: 'hidden', live: true, default: freeDefault(cfg.G0[cfg.defaultPreset][2]), min: -2, max: 2 },
  };

  return {
    id: cfg.id,
    title: `${p}.scene`,
    params,
    world: () => ({ x: [-1.2, 1.2], y: [-0.8, 0.8], aspect: 'contain', padPx: 8 }),
    init: () => ({ t: 0 }),

    draw: (g, s, pp) => {
      const m = model(pp);
      if (pp.view === 'lines') layers.lines(g, m.src);
      else if (pp.view === 'vectors') layers.vectors(g, m.src);
      drawSurface(g, m.poly);
      // Normal (flux) or tangential (circulation) component at evenly spaced points.
      const step = Math.max(perimeter(m.poly) / 40, g.px(24));
      const samples = resample(m.poly, step).map(({ p: q, t }) => {
        const dir: [number, number] = cfg.mode === 'flux' ? [t[1], -t[0]] : t;
        const [fx, fy] = fieldAt(m.src, cfg.kernel, q[0], q[1]);
        return { p: q, dir, v: fx * dir[0] + fy * dir[1] };
      });
      componentArrows(g, samples);
      for (const c of m.src) cfg.glyph(g, c, c.s, 1, false);
      for (const k of knobs(pp.shape, Gin(pp), pp.F)) knob(g, k.p, k.kind);
      palette(g, s, cfg.pool, coords(pp), (gg, q, v, a) => cfg.glyph(gg, q, v, a, true));
    },

    overlay: (_s, pp) => {
      const m = model(pp);
      return cfg.overlay(m.integral * cfg.integralScale, m.enc * cfg.encScale, m.enc);
    },

    handles: [
      ...slotHandles<PathP, S>({
        pool: cfg.pool,
        coords,
        tag,
        key: 'Q',
        box: cfg.box,
        tray: (s) => s.tray,
        adjust: (pp, w) => keepOff(surfacePoly(pp.shape, Gin(pp), pp.F), w),
      }),
      ...surfaceHandles<PathP, S>({ sources, box: cfg.box, G: Gin, packG }),
    ],

    info: cfg.info,
  };
}
