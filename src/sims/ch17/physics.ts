// Ch 17: beats of two nearby frequencies; Doppler effect for a moving source or moving
// observers, with circular wavefronts and the Mach cone. DOM-free.

// ------------------------------------------------------------------ beats

/** y_i = A cos 2πf_i t. */
export const wave = (A: number, f: number, t: number) => A * Math.cos(2 * Math.PI * f * t);

/** Envelope of y₁ + y₂ for equal amplitudes: 2A |cos π(f₂ − f₁)t|. */
export const beatEnvelope = (A: number, f1: number, f2: number, t: number) => 2 * A * Math.abs(Math.cos(Math.PI * (f2 - f1) * t));

export const beatFrequency = (f1: number, f2: number) => Math.abs(f1 - f2);

// ------------------------------------------------------------------ Doppler

export interface Doppler {
  /** Speed of sound [m/s]. */
  v: number;
  /** Source frequency [Hz]. */
  f: number;
  /** Source velocity along +x [m/s]. */
  vs: number;
  /** Source position at t = 0 [m]. */
  xs0: number;
  /** Observer velocity along −x (towards the source for A, away for B) [m/s]. */
  vo: number;
  /** Observer positions at t = 0 [m]: A ahead of the source (+x), B behind it. */
  xA0: number;
  xB0: number;
  /** The source has been emitting since t = −tPre. */
  tPre: number;
}

export const sourceX = (d: Doppler, t: number) => d.xs0 + d.vs * t;
export const observerX = (d: Doppler, which: 'A' | 'B', t: number) => (which === 'A' ? d.xA0 : d.xB0) - d.vo * t;

export interface Front {
  /** Emission time. */
  te: number;
  /** Centre: where the source was at emission. */
  cx: number;
  /** Radius v (t − te). */
  r: number;
}

/** Wavefronts emitted once per period, from t = −tPre up to t. */
export function fronts(d: Doppler, t: number): Front[] {
  const out: Front[] = [];
  const k0 = Math.ceil(-d.tPre * d.f - 1e-9);
  const k1 = Math.floor(t * d.f + 1e-9);
  for (let k = k0; k <= k1; k++) {
    const te = k / d.f;
    out.push({ te, cx: sourceX(d, te), r: d.v * (t - te) });
  }
  return out;
}

/**
 * Frequency heard by A (ahead, source approaching or observer approaching) and B (behind).
 * Source moving: f v / (v ∓ v_s). Observers moving: f (v ± v_o) / v. NaN where no wave reaches
 * A in front of a source at or above the speed of sound.
 */
export function heard(d: Doppler): { A: number; B: number } {
  if (d.vs !== 0) return { A: d.vs >= d.v ? NaN : (d.f * d.v) / (d.v - d.vs), B: (d.f * d.v) / (d.v + d.vs) };
  return { A: (d.f * (d.v + d.vo)) / d.v, B: (d.f * (d.v - d.vo)) / d.v };
}

/**
 * Time at which the front emitted at te reaches observer `which` (moving at −v_o along x). The
 * front's edge on the observer's side moves at v; the observer meets it once, since v_o < v.
 */
export function arrivalAt(d: Doppler, te: number, which: 'A' | 'B'): number {
  const cx = sourceX(d, te);
  const x0 = which === 'A' ? d.xA0 : d.xB0;
  // Observer right of the centre at emission: v (t − te) = x0 − v_o t − cx; left: v (t − te) = cx − x0 + v_o t.
  if (x0 - d.vo * te >= cx) return (x0 - cx + d.v * te) / (d.v + d.vo);
  return (cx - x0 + d.v * te) / (d.v - d.vo);
}

/**
 * Everything each observer hears. A: ahead of the source (or approaching it). B: the sound the
 * source sent back after it passed B, f v / (v + v_s). B2: only for v_s > v, the sound the source
 * sent towards B before passing it, which arrives after the Mach cone in reverse order (the latest
 * emitted first) at f v / (v_s − v). B hears B and B2 at the same time.
 */
export function heardAll(d: Doppler): { A: number; B: number; B2: number } {
  return { ...heard(d), B2: d.vs > d.v ? (d.f * d.v) / (d.vs - d.v) : NaN };
}

/**
 * Frequencies being heard at time t: a branch reads NaN until its first front has arrived, and B2
 * also after its last front (the one emitted first) has passed.
 */
export function heardAt(d: Doppler, t: number): { A: number; B: number; B2: number } {
  const all = heardAll(d);
  let a = false;
  let b = false;
  let b2First = Infinity;
  let b2Last = -Infinity;
  for (const fr of fronts(d, t)) {
    if (arrivalAt(d, fr.te, 'A') <= t) a = true;
    const tb = arrivalAt(d, fr.te, 'B');
    // Emitted while the source was still left of B (before passing it): the B2 branch.
    if (fr.cx < d.xB0 - d.vo * fr.te) {
      b2First = Math.min(b2First, tb);
      b2Last = Math.max(b2Last, tb);
    } else if (tb <= t) b = true;
  }
  return {
    A: a ? all.A : NaN,
    B: b ? all.B : NaN,
    B2: Number.isFinite(all.B2) && b2First <= t && t <= b2Last ? all.B2 : NaN,
  };
}

/**
 * Flash duration [s] after a front arrives: 0.18 of the source period, at most 0.4 of the shortest
 * period being heard at time t, so successive flashes stay apart.
 */
export function flashWindow(d: Doppler, which: 'A' | 'B', t: number): number {
  const h = heardAt(d, t);
  const fs = (which === 'A' ? [h.A] : [h.B, h.B2]).filter(Number.isFinite);
  return Math.min(0.18 / d.f, 0.4 / Math.max(d.f, ...fs));
}

/** True while observer `which` is within flashWindow after a front's arrival. */
export function flashing(d: Doppler, which: 'A' | 'B', t: number): boolean {
  const w = flashWindow(d, which, t);
  return fronts(d, t).some((fr) => {
    const dt = t - arrivalAt(d, fr.te, which);
    return dt >= 0 && dt < w;
  });
}

/** Wavelength between successive fronts ahead of and behind a moving source. */
export const wavelengths = (d: Doppler) => ({ ahead: (d.v - d.vs) / d.f, behind: (d.v + d.vs) / d.f });

/** Mach cone half-angle, sin θ = v / v_s (only for v_s > v). */
export const machAngle = (d: Doppler) => (d.vs > d.v ? Math.asin(d.v / d.vs) : NaN);

/** Arrival time of front k at a static observer at x (source on the same line). */
export const arrival = (d: Doppler, te: number, x: number) => te + Math.abs(x - sourceX(d, te)) / d.v;
