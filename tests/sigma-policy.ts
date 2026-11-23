// Test helper for the Σ digit policy D (docs/design.md §3.3): read the numbers of a Σ line the way a
// reader does (token classification of the 2026-11-23 audit), evaluate the substituted side, and run
// the policy checks on a scene (policyIssues, used by tests/sigma-all.test.ts).
import { defaults, logStops, stepOf } from '../src/core/params';
import { CONST, readoutText, slider, texOf } from '../src/core/precision';
import { tn } from '../src/core/tex';
import { Runner } from '../src/core/runner';
import type { NumberParam, Params, Scene } from '../src/core/types';

/** A number printed on a line: its text, value, significant figures, and whether it is an integer. */
export interface Tok {
  s: string;
  v: number;
  sig: number;
  int: boolean;
}

/** Remove \cmd{...} (nested braces), leaving a placeholder. */
function stripBraced(s: string, cmd: string): string {
  let out = '';
  let i = 0;
  const pat = `\\${cmd}{`;
  for (;;) {
    const j = s.indexOf(pat, i);
    if (j < 0) return out + s.slice(i);
    out += `${s.slice(i, j)} U `;
    let k = j + pat.length;
    let depth = 1;
    while (k < s.length && depth) {
      if (s[k] === '{') depth++;
      else if (s[k] === '}') depth--;
      k++;
    }
    i = k;
  }
}

/** TeX without units, sub- and superscripts and commands: numbers stay, 1.6\times 10^{-19} becomes 1.6e-19. */
export function texClean(s: string): string {
  for (const c of ['mathrm', 'text', 'textrm', 'operatorname']) s = stripBraced(s, c);
  s = s.replace(/\{,\}/g, '.');
  s = s.replace(/(\d)\s*\\times\s*10\^\{?(-?\d+)\}?/g, '$1e$2');
  s = s.replace(/(?<![\d.])10\^\{(-?\d+)\}/g, '1e$1');
  s = s.replace(/\^\{[^{}]*\}/g, ' ').replace(/\^\S/g, ' ');
  s = s.replace(/_\{[^{}]*\}/g, ' ').replace(/_\S/g, ' ');
  s = s.replace(/\\[a-zA-Z]+/g, ' ').replace(/\\[,;:! ]/g, ' ');
  return s;
}

/** Significant figures of a printed number (trailing zeros of an integer do not count). */
export function sigOf(t: string): { sig: number; int: boolean } {
  const m = t.replace(/^-/, '').split('e')[0];
  if (m.includes('.')) return { sig: m.replace('.', '').replace(/^0+/, '').length, int: false };
  const d = m.replace(/^0+/, '');
  return { sig: d ? d.replace(/0+$/, '').length || 1 : 0, int: true };
}

const NUM = /(?<![\w.])-?\d+(?:\.\d+)?(?:e-?\d+)?/g;

export function toks(s: string): Tok[] {
  const out: Tok[] = [];
  for (const m of s.matchAll(NUM)) {
    const v = Number(m[0]);
    if (!Number.isFinite(v)) continue;
    out.push({ s: m[0], v, ...sigOf(m[0]) });
  }
  return out;
}

/** Between two equations on one line: "a = 1,\quad b = 2", "F = 0 \Rightarrow v = …", "y = W:\ t = …". */
const CHAIN = /(\\quad|\\qquad|\\Rightarrow|,\\ |:\\ )/;
/** Relations other than "=": what follows is a new chain without a left-hand side of its own. */
const REL = /(\\approx|\\simeq|\\neq|<|>|\\le\b|\\ge\b|\\leq|\\geq|\\to\b|\\rightarrow)/;

export interface Part {
  /** The sub-line (a line split at \\) this equation chain belongs to. */
  sub: string;
  /** Left-hand side before the first "=" (raw TeX); empty after a relation such as < or ≈. */
  lhs: string;
  /** The substituted side: the segment before the result (raw TeX), if any. */
  inRaw?: string;
  /** Its numbers. */
  inp: Tok[];
  /** The result: the number the last "=" gives, when that side is a number (with unit) alone. */
  res?: Tok;
  /** The result carries a degree sign. */
  resDeg: boolean;
  /** Every number of the chain, in order, the result marked. */
  all: (Tok & { res: boolean })[];
}

/** A result side: a number with at most a unit, a degree or a percent sign ("0.167\ \text{nm}", "14.5^\circ"). */
const resultSide = (seg: string) => /^\s*\(?-?\d/.test(seg) && evalTex(seg.replace(/\\%/g, '').replace(/,\s*$/, '')) !== undefined;

/**
 * A Σ line as equation chains: sub-lines (\\), then equations (\quad, ⇒, ",\ ", ":\ "), then the
 * parts of a relation (=, and after ≈, <, ≥ … a new chain). Each chain: its left-hand side, the
 * substituted side before the last "=", and the result after it.
 */
export function parts(line: string): Part[] {
  const out: Part[] = [];
  for (const sub of line.split(/\\\\/)) {
    for (const eq of sub.split(CHAIN).filter((_x, i) => i % 2 === 0)) {
      const rel = eq.split(REL);
      for (let r = 0; r < rel.length; r += 2) {
        const segs = rel[r].split('=');
        const ct = segs.map((x) => toks(texClean(x)));
        const tail = segs[segs.length - 1];
        const hasRes = segs.length > 1 && ct[ct.length - 1].length === 1 && resultSide(tail);
        const all = ct.flatMap((ts, i) => ts.map((t, j) => ({ ...t, res: hasRes && i === ct.length - 1 && j === 0 })));
        out.push({
          sub,
          lhs: r === 0 && segs.length > 1 ? segs[0] : '',
          inRaw: hasRes && segs.length > 2 ? segs[segs.length - 2] : undefined,
          inp: hasRes && segs.length > 2 ? ct[ct.length - 2] : [],
          res: hasRes ? ct[ct.length - 1][0] : undefined,
          resDeg: hasRes && /\^\\circ/.test(tail),
          all,
        });
      }
    }
  }
  return out;
}

/** Every number of a line in order, the results marked (the same reading for two renderings of a line). */
export const lineToks = (line: string) => parts(line).flatMap((p) => p.all);

/** A label or left-hand side without spacing, braces and roman wrappers, for matching. */
export const norm = (s: string) => s.replace(/\s|\\[,;!]|\{|\}|\\mathrm|\\text/g, '');

// ---------------------------------------------------------------- evaluating the substituted side

const DEG = Math.PI / 180;
const FUN: Record<string, (x: number) => number> = { sin: Math.sin, cos: Math.cos, tan: Math.tan, ln: Math.log, log: Math.log10, exp: Math.exp };

type T = { k: 'n'; v: number } | { k: 'op'; v: string } | { k: 'f'; v: string };

function lex(src: string): T[] | undefined {
  // A product of units (\text{eV}\cdot\text{nm}) is one unit.
  let s = src.replace(/\}\s*\\cdot\s*\\(text|mathrm)\{/g, '}\\$1{');
  // Units and words go (unit prefixes are allowed for in the comparison); spacing and sizing go.
  for (const c of ['mathrm', 'text', 'textrm', 'operatorname']) s = stripBraced(s, c).replace(/ U /g, ' ');
  s = s.replace(/\\(left|right|big|Big|bigl|bigr|Bigl|Bigr)(?![a-zA-Z])/g, '').replace(/\\[,;:! ]/g, ' ').replace(/~/g, ' ');
  s = s.replace(/\\[dt]?frac(\d)(\d)/g, '\\frac{$1}{$2}').replace(/\\[dt]frac/g, '\\frac').replace(/\\lvert|\\rvert/g, '|').replace(/\\cdot|\\times/g, '*');
  const out: T[] = [];
  let i = 0;
  while (i < s.length) {
    const c = s[i];
    if (/\s/.test(c)) {
      i++;
      continue;
    }
    const num = /^\d+(?:\.\d+)?/.exec(s.slice(i));
    if (num) {
      out.push({ k: 'n', v: Number(num[0]) });
      i += num[0].length;
      continue;
    }
    if (c === '\\') {
      const m = /^\\([a-zA-Z]+)/.exec(s.slice(i));
      if (!m) return undefined;
      i += m[0].length;
      if (m[1] in FUN) out.push({ k: 'f', v: m[1] });
      else if (m[1] === 'pi') out.push({ k: 'n', v: Math.PI });
      else if (m[1] === 'frac' || m[1] === 'sqrt' || m[1] === 'circ') out.push({ k: 'op', v: m[1] });
      else return undefined;
      continue;
    }
    if ('+-*/^()[]{}|'.includes(c)) {
      out.push({ k: 'op', v: c });
      i++;
      continue;
    }
    return undefined;
  }
  return out;
}

/**
 * The value of a substituted TeX side such as \frac{(2.0)(9.8)}{4.0} or 4\sqrt{1.0/9.8} \times 1.57,
 * with degrees in trigonometric functions. undefined for anything else (symbols, e^{…}, lists).
 */
export function evalTex(src: string): number | undefined {
  const t = lex(src);
  if (!t || !t.length) return undefined;
  let i = 0;
  const peek = () => t[i];
  const isOp = (v: string) => peek()?.k === 'op' && peek()!.v === v;
  const fail = (): never => {
    throw new Error('parse');
  };
  const eat = (v: string) => (isOp(v) ? (i++, true) : fail());
  const startsAtom = () => {
    const p = peek();
    return !!p && (p.k === 'n' || p.k === 'f' || (p.k === 'op' && ['(', '[', '{', '|', 'frac', 'sqrt'].includes(p.v)));
  };
  const group = (): number => {
    // {…} or a single digit / atom (\tfrac12).
    if (isOp('{')) {
      i++;
      const v = expr();
      eat('}');
      return v;
    }
    const p = peek();
    if (p?.k === 'n') {
      i++;
      return p.v;
    }
    return fail();
  };
  const atom = (): number => {
    const p = peek();
    if (!p) return fail();
    if (p.k === 'n') {
      i++;
      return p.v;
    }
    if (p.k === 'f') {
      i++;
      const x = power();
      return FUN[p.v](x);
    }
    i++;
    switch (p.v) {
      case '(':
      case '[':
      case '{': {
        const v = expr();
        eat(p.v === '(' ? ')' : p.v === '[' ? ']' : '}');
        return v;
      }
      case '|': {
        const v = expr();
        eat('|');
        return Math.abs(v);
      }
      case 'frac': {
        const a = group();
        const b = group();
        return a / b;
      }
      case 'sqrt':
        return Math.sqrt(group());
    }
    return fail();
  };
  const power = (): number => {
    let v = atom();
    while (isOp('^')) {
      i++;
      if (isOp('circ')) {
        i++;
        v *= DEG;
      } else if (isOp('{') && t[i + 1]?.k === 'op' && t[i + 1].v === 'circ' && t[i + 2]?.k === 'op' && t[i + 2].v === '}') {
        i += 3;
        v *= DEG;
      } else v **= group();
    }
    return v;
  };
  const unary = (): number => {
    if (isOp('-')) {
      i++;
      return -unary();
    }
    if (isOp('+')) {
      i++;
      return unary();
    }
    return power();
  };
  const term = (): number => {
    let v = unary();
    for (;;) {
      if (isOp('*')) {
        i++;
        v *= unary();
      } else if (isOp('/')) {
        i++;
        v /= unary();
      } else if (startsAtom()) v *= power();
      else return v;
    }
  };
  function expr(): number {
    let v = term();
    for (;;) {
      if (isOp('+')) {
        i++;
        v += term();
      } else if (isOp('-')) {
        i++;
        v -= term();
      } else return v;
    }
  }
  try {
    const v = expr();
    return i === t.length && Number.isFinite(v) ? v : undefined;
  } catch {
    return undefined;
  }
}

/** One unit in the last printed digit of a token (1.23e-5 → 1e-7). */
export function ulpOf(t: Tok): number {
  const [m, e] = t.s.replace(/^-/, '').split('e');
  const dec = m.includes('.') ? m.split('.')[1].length : 0;
  return 10 ** (Number(e ?? 0) - dec);
}

/**
 * The recomputed value v agrees with the printed result r: within 1 % (R3: last-digit differences),
 * or within one unit in its last digit, allowing a power of ten for unit prefixes (kΩ against mA)
 * and the J ↔ eV factor (units are not read).
 */
export function recomputes(v: number, r: Tok): boolean {
  const tol = (x: number) => Math.abs(x - r.v) <= Math.max(0.01 * Math.abs(r.v), ulpOf(r)) * (1 + 1e-9) + 1e-300;
  if (tol(v)) return true;
  if (v === 0 || r.v === 0) return false;
  for (const f of [1, 1.602176634e-19, 1 / 1.602176634e-19]) {
    const k = Math.round(Math.log10(Math.abs(r.v / (v * f))));
    if (Math.abs(k) <= 40 && tol(v * f * 10 ** k)) return true;
  }
  return false;
}

// ---------------------------------------------------------------- the policy-D checks on a scene

/**
 * The checks of policy D: (result) a Σ result is its readout string; (slider) a slider value prints
 * as its control label; (inputSig) decimal inputs have at most 3 figures; (recompute) the arithmetic
 * on the printed inputs is within 1 % of the result; (zero) a physical small value never prints as
 * 0.00.
 */
export type Check = 'result' | 'slider' | 'inputSig' | 'recompute' | 'zero';
export const CHECKS: Check[] = ['result', 'slider', 'inputSig', 'recompute', 'zero'];

/** Constant strings (CONST) are exempt from the 3-figure input limit. */
const CONST_TOKS = new Set(Object.values(CONST).flatMap((c) => toks(texClean(c.tex)).map((t) => t.s.replace(/^-/, ''))));

/**
 * R5 / R6 lines (a small difference, an inequality) whose inputs may keep more than 3 figures or
 * whose recomputation may differ by more than 1 %: scene key "ch/id", a pattern for the line's
 * left-hand side, the checks it is exempt from, and why. Phase 2 adds a line only with its reason.
 */
export const ALLOW: { scene: string; lhs: RegExp; checks: Check[]; why: string }[] = [
  // Ch 33–42
  { scene: '33/refraction', lhs: /^\\theta_2$/, checks: ['inputSig'], why: 'R6: sin θ₂ just below 1 keeps its side of 1 (θ₁ = 41.8°: sin⁻¹(0.9998), not sin⁻¹(1.00))' },
  { scene: '39/wells', lhs: /^N$/, checks: ['inputSig'], why: 'R6: 2z₀/π next to an integer keeps its side for the ceiling (L = 1.3 nm, U₀ = 2.0 eV: ⌈2.998⌉ = 3)' },
  // Review pages 101–109
  { scene: '101/photoelectric', lhs: /V_\\text\{stop\}/, checks: ['recompute'], why: 'R5: K_max = hf − Φ near the threshold (2.32 − 2.28 = 0.0360 eV), from the unrounded hf' },
  { scene: '107/buoyancy', lhs: /^F_\\text\{net\}$/, checks: ['recompute'], why: 'R5: F_b − F_g + F_d nearly cancel while bobbing; F_net from the unrounded forces' },
  { scene: '108/free', lhs: /^\\Sigma F$/, checks: ['recompute'], why: 'R5: F_s ≈ mg near equilibrium; ΣF from the unrounded forces' },
  { scene: '108/driven', lhs: /^\\Sigma F$/, checks: ['recompute'], why: 'R5: F_s ≈ mg near equilibrium; ΣF from the unrounded forces' },
  // Ch 22–32
  { scene: '25/capacitor', lhs: /^C$/, checks: ['inputSig'], why: 'R1/R8: κ of air is the table value 1.00054, the string of its dropdown option (a preset, not a slider label)' },
];

/** Physical small values (R7b): their readout and Σ result never print as 0.00. Scene key → labels. */
export const PHYSICAL_SMALL: Record<string, string[]> = {
  '41/filling': ['n', 'n_i'],
  '27/rc': ['i'],
  '36/phasor': ['I/I_m'],
};

const STEPS = 600;

function cases(scene: Scene): { name: string; p: Params }[] {
  const base = defaults(scene.params) as Params;
  const out = [{ name: 'defaults', p: base }];
  for (const [k, spec] of Object.entries(scene.params)) {
    if (spec.kind === 'number') {
      const vs = spec.control === 'select' ? (spec.choices ?? []) : [spec.min ?? 0, spec.max ?? 1];
      for (const v of vs) if (v !== base[k]) out.push({ name: `${k}=${v}`, p: { ...base, [k]: v } });
    } else if (spec.kind === 'select') {
      for (const o of spec.options) if (o.value !== base[k]) out.push({ name: `${k}=${o.value}`, p: { ...base, [k]: o.value } });
    } else if (spec.kind === 'toggle') {
      out.push({ name: `${k}=${!base[k]}`, p: { ...base, [k]: !base[k] } });
    }
  }
  return out;
}

/** Another value of a number control, to tell its value apart from a coincidence on the line. */
function otherValue(spec: NumberParam, v: number): number | undefined {
  if (spec.control === 'select') return (spec.choices ?? []).find((c) => c !== v);
  if (spec.log) {
    const stops = logStops(spec);
    const i = stops.findIndex((x) => x >= v);
    return stops[i + 1] ?? stops[i - 1];
  }
  const step = stepOf(spec);
  const up = Number((v + step).toFixed(10));
  return up <= (spec.max ?? Infinity) ? up : Number((v - step).toFixed(10));
}

const abs = (s: string) => s.replace(/^-/, '');
/** "0.00", "-0.0", "0.00e-5": a zero printed with decimals. */
const isZeroText = (s: string) => /^-?0\.0+(?:e-?\d+)?$/.test(s.trim());
/** The first number of a unicode-formatted text (fmt) as a token. */
const firstTok = (text: string) => toks(texClean(texOf(text)))[0];

/** Every policy-D issue of a scene ("ch/id" key), by check, as "[case] time: line" strings. */
export function policyIssues(key: string, scene: Scene): Map<Check, string[]> {
  const out = new Map<Check, string[]>(CHECKS.map((c) => [c, []]));
  if (!scene.formula) return out;
  const add = (c: Check, msg: string) => {
    const l = out.get(c)!;
    if (!l.includes(msg)) l.push(msg);
  };
  const allowed = (lhs: string, c: Check) => ALLOW.some((a) => a.scene === key && a.checks.includes(c) && a.lhs.test(lhs));
  const small = (PHYSICAL_SMALL[key] ?? []).map(norm);
  const schema = scene.params as Record<string, NumberParam>;
  for (const c of cases(scene)) {
    let r: Runner<Params, { t: number }>;
    try {
      r = new Runner(scene as unknown as Scene<Params, { t: number }>, c.p, 1);
    } catch {
      continue;
    }
    const frame = (when: string) => {
      const s = r.state;
      const p = r.params;
      const tag = `[${c.name}] ${when}`;
      let lines: string[];
      try {
        lines = scene.formula!(s as never, p as never);
      } catch {
        return;
      }
      // Readout strings by normalized label (custom formats such as '< 1' are not numbers to match).
      const ro = new Map<string, { text: string; custom: boolean }>();
      for (const spec of scene.readouts ?? []) {
        const v = spec.value(s as never, p as never);
        if (!Number.isFinite(v)) continue;
        ro.set(norm(spec.label), { text: readoutText(spec as never, v, p), custom: spec.format?.(v) !== undefined });
      }
      // Slider labels now, and the positions on the lines that carry a slider's value: the token
      // equals the value here and the other value when the slider is moved.
      const sliders = Object.entries(schema).filter(
        ([k, spec]) => spec.kind === 'number' && spec.group !== 'hidden' && (spec.visibleIf?.(p) ?? true) && typeof p[k] === 'number',
      );
      const labels = new Set(sliders.map(([k, spec]) => abs(toks(texClean(slider(spec, p[k] as number)))[0]?.s ?? '')));
      const tokLines = lines.map(lineToks);
      for (const [k, spec] of sliders) {
        const v = p[k] as number;
        const w = otherValue(spec, v);
        if (v === 0 || w === undefined || w === v) continue;
        let other: string[];
        try {
          other = scene.formula!(s as never, { ...p, [k]: w } as never);
        } catch {
          continue;
        }
        if (other.length !== lines.length) continue;
        const want = abs(toks(texClean(slider(spec, v)))[0]?.s ?? '');
        // A quantity derived from the slider can equal it identically (a' = −a₀, ΔE = ħω at the
        // bottom of a well) and then prints as a state value with 3 figures (R3): also accepted.
        const state = abs(toks(texClean(tn(v)))[0]?.s ?? '');
        lines.forEach((l, i) => {
          const a = tokLines[i];
          const b = lineToks(other[i]);
          if (a.length !== b.length) return;
          // Inputs only: a result may equal a slider value and is the readout string.
          a.forEach((t, j) => {
            if (!t.res && Math.abs(t.v) === Math.abs(v) && Math.abs(b[j].v) === Math.abs(w) && abs(t.s) !== want && abs(t.s) !== state)
              add('slider', `${k}: label '${want}' vs Σ '${t.s}' ${tag}: ${l}`);
          });
        });
      }
      for (const l of lines)
        for (const part of parts(l)) {
          const lhs = part.lhs.trim();
          // (result) R3, R8: the result of a readout's symbol is the readout string.
          // A zero is a zero: "F_net = 0" next to a readout "0.00" (R7a) is not a mismatch.
          const rd = lhs ? ro.get(norm(lhs)) : undefined;
          if (rd && !rd.custom && part.res) {
            const want = firstTok(rd.text);
            if (want && want.s !== part.res.s && !(want.v === 0 && part.res.v === 0)) add('result', `${lhs}: readout '${rd.text}' vs Σ '${part.res.s}' ${tag}: ${part.sub}`);
          }
          // (inputSig) R3: decimal inputs with at most 3 figures, except constants and slider labels.
          if (!allowed(lhs, 'inputSig'))
            for (const t of part.inp)
              if (!t.int && t.sig > 3 && !CONST_TOKS.has(abs(t.s)) && !labels.has(abs(t.s))) add('inputSig', `${t.s} ${tag}: ${part.sub}`);
          // (recompute) R3: the printed arithmetic within 1 % of the printed result (degrees as such).
          if (part.inRaw !== undefined && part.res && part.inp.length && !allowed(lhs, 'recompute')) {
            const v = evalTex(part.inRaw);
            if (v !== undefined && !recomputes(part.resDeg ? v / DEG : v, part.res)) add('recompute', `${tag}: ${part.sub}`);
          }
          // (zero) R7b: a physical small value never prints as 0.00.
          if (small.includes(norm(lhs)) && part.res && isZeroText(part.res.s)) add('zero', `${lhs} = ${part.res.s} ${tag}: ${part.sub}`);
        }
      for (const lab of small) {
        const rd = ro.get(lab);
        const t = rd && firstTok(rd.text);
        if (t && isZeroText(t.s)) add('zero', `readout ${lab} = ${rd!.text} ${tag}`);
      }
    };
    frame('t=0');
    if (scene.time) {
      r.play();
      for (let i = 0; i < STEPS && r.playing; i++) r.advance(scene.time.h);
      frame(`t=${r.state.t.toFixed(2)}`);
    }
  }
  return out;
}
