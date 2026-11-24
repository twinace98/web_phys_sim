// Parameter defaults and URL (de)serialisation, validated against the schema.
import type { NumberParam, ParamSchema, ParamSpec, ParamValue, Params } from './types';

export function defaults<P extends Params>(schema: ParamSchema<P>): P {
  const out: Params = {};
  for (const k in schema) {
    const d = schema[k].default;
    out[k] = Array.isArray(d) ? [...d] : d;
  }
  return out as P;
}

export function encode(v: ParamValue): string {
  if (Array.isArray(v)) return v.join(',');
  if (typeof v === 'boolean') return v ? '1' : '0';
  return String(v);
}

/** Divisions of a log slider's track. */
export const LOG_STEPS = 400;

/** Step of a linear slider or stepper (the control's default when the spec gives none). */
export const stepOf = (spec: NumberParam): number => spec.step ?? (spec.control === 'stepper' ? 1 : 0.01);

/** Nearest point min + k·step to v, without float noise (0.1 + 2·0.05 is 0.2, not 0.20000000000000004). */
export const snapStep = (v: number, min: number, step: number): number => Number((min + Math.round((v - min) / step) * step).toFixed(10));

const stopCache = new WeakMap<NumberParam, number[]>();

/**
 * Values a log slider takes, one per track position k = 0 … LOG_STEPS: the grid point
 * 10^(lo + k·(hi − lo)/LOG_STEPS) rounded to `sig` figures, except that each of `marks` replaces
 * the grid point nearest to it, so that named values (water 1000, ice 917) and the default are
 * reachable exactly.
 */
export function logStops(spec: NumberParam): number[] {
  const hit = stopCache.get(spec);
  if (hit) return hit;
  const min = spec.min ?? 1;
  const max = spec.max ?? 10;
  const sig = spec.sig ?? 2;
  const lo = Math.log10(min);
  const st = (Math.log10(max) - lo) / LOG_STEPS;
  const out: number[] = [];
  for (let k = 0; k <= LOG_STEPS; k++) out.push(Math.min(max, Math.max(min, Number((10 ** (lo + k * st)).toPrecision(sig)))));
  // The default is reachable too: a reset slider shows exactly the value the scene starts from.
  for (const m of [...(spec.marks ?? []), spec.default]) {
    if (m >= min && m <= max) out[Math.round((Math.log10(m) - lo) / st)] = m;
  }
  stopCache.set(spec, out);
  return out;
}

/** Track position 0 … LOG_STEPS of a log slider nearest to x = log10(value). */
export function logIndex(spec: NumberParam, v: number): number {
  const lo = Math.log10(spec.min ?? 1);
  const st = (Math.log10(spec.max ?? 10) - lo) / LOG_STEPS;
  return Math.min(LOG_STEPS, Math.max(0, Math.round((Math.log10(v) - lo) / st)));
}

/** Value of a log slider at track position x = log10(value). */
export const logValue = (spec: NumberParam, x: number): number => logStops(spec)[logIndex(spec, 10 ** x)];

/** Nearest grid point min + k·step of a linear slider or stepper within [min, max]. */
export function snapNumber(spec: NumberParam, v: number): number {
  const min = spec.min ?? 0;
  const max = spec.max ?? 1;
  const step = stepOf(spec);
  let s = snapStep(v, min, step);
  // A max off the grid: the last grid point below it, as a range input does.
  if (s > max) s = snapStep(s - step, min, step);
  return Math.max(min, s);
}

/**
 * A number from the URL (within [min, max]) as its control would hold it, so that the control
 * shows the value the physics uses:
 * - stepper, or slider with a whole-number step (counts, harmonic numbers, whole degrees):
 *   the nearest min + k·step (nClosed = 2 on a step-2 stepper from 1 becomes 3, never even);
 * - log slider: one of its `marks` as it is, any other value rounded to `sig` figures;
 * - slider with a fractional step: the nearest grid point too, so its label shows the value the
 *   physics uses (b = 8.04 would read "8.0" next to b_c = 8.00, QA 2026-11-24); except a `free`
 *   slider, whose stage handle sets values between its points (θ = θc in Ch 33), kept as it is.
 */
export function urlNumber(spec: NumberParam, v: number): number {
  if (spec.control === 'select') return v;
  if (spec.log) {
    if (v === spec.default || spec.marks?.includes(v)) return v;
    return Math.min(spec.max ?? Infinity, Math.max(spec.min ?? 0, Number(v.toPrecision(spec.sig ?? 2))));
  }
  return spec.free && spec.control === 'slider' ? v : snapNumber(spec, v);
}

/** Parse a URL value; returns undefined if it does not fit the spec. */
export function decode(spec: ParamSpec, s: string): ParamValue | undefined {
  switch (spec.kind) {
    case 'select':
      return spec.options.some((o) => o.value === s) ? s : undefined;
    case 'toggle':
      return s === '1' ? true : s === '0' ? false : undefined;
    case 'number': {
      // Number('') and Number(' ') are 0: an empty value is not a number.
      const v = s.trim() === '' ? NaN : Number(s);
      if (!Number.isFinite(v)) return undefined;
      if (spec.choices) return spec.choices.includes(v) ? v : undefined;
      if (spec.min !== undefined && v < spec.min) return undefined;
      if (spec.max !== undefined && v > spec.max) return undefined;
      return urlNumber(spec, v);
    }
    case 'array': {
      const a = s.split(',').map(Number);
      if (a.length !== spec.default.length) return undefined;
      if (a.some((v) => !Number.isFinite(v) || v < spec.min || v > spec.max)) return undefined;
      return a;
    }
  }
}

export function sameValue(a: ParamValue, b: ParamValue): boolean {
  if (Array.isArray(a) && Array.isArray(b)) return a.length === b.length && a.every((v, i) => v === b[i]);
  return a === b;
}

/** Defaults overridden by any valid entries in the query. */
export function fromQuery<P extends Params>(schema: ParamSchema<P>, q: URLSearchParams): P {
  const p = defaults(schema) as Params;
  for (const k in schema) {
    const s = q.get(k);
    if (s === null) continue;
    const v = decode(schema[k], s);
    if (v !== undefined) p[k] = v;
  }
  return p as P;
}

/** Only values that differ from the defaults. */
export function toQuery<P extends Params>(schema: ParamSchema<P>, p: P): Record<string, string> {
  const out: Record<string, string> = {};
  for (const k in schema) {
    if (!sameValue(p[k], schema[k].default)) out[k] = encode(p[k]);
  }
  return out;
}
