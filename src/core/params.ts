// Parameter defaults and URL (de)serialisation, validated against the schema.
import type { ParamSchema, ParamSpec, ParamValue, Params } from './types';

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

/** Parse a URL value; returns undefined if it does not fit the spec. */
export function decode(spec: ParamSpec, s: string): ParamValue | undefined {
  switch (spec.kind) {
    case 'select':
      return spec.options.some((o) => o.value === s) ? s : undefined;
    case 'toggle':
      return s === '1' ? true : s === '0' ? false : undefined;
    case 'number': {
      const v = Number(s);
      if (!Number.isFinite(v)) return undefined;
      if (spec.choices) return spec.choices.includes(v) ? v : undefined;
      if (spec.min !== undefined && v < spec.min) return undefined;
      if (spec.max !== undefined && v > spec.max) return undefined;
      return v;
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
