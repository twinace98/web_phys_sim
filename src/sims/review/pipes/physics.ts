// Standing sound waves in a pipe (Halliday 17-6). x is measured from the open left end; the right
// end is open (open pipe) or closed (closed pipe). SI units, DOM-free.
//   displacement s(x, t) = s_m cos(kx) cos ωt   (antinode at an open end)
//   pressure    Δp(x, t) = −B ∂s/∂x = Δp_m sin(kx) cos ωt,  Δp_m = B k s_m
// Open pipe: displacement antinodes at both ends, kL = nπ, λ = 2L/n, f = nv/2L, n = 1, 2, 3, …
// Closed pipe: displacement node at the closed end, kL = nπ/2, λ = 4L/n, f = nv/4L, n = 1, 3, 5, …

export type PipeType = 'open' | 'closed';

/** Speed of sound in air at 20 °C [m/s]. */
export const V_SOUND = 343;

/** Harmonic numbers a pipe can sustain: every n for an open pipe, odd n for a closed pipe. */
export const allowed = (type: PipeType, n: number) => Number.isInteger(n) && n >= 1 && (type === 'open' || n % 2 === 1);

export const wavelength = (type: PipeType, L: number, n: number) => (type === 'open' ? (2 * L) / n : (4 * L) / n);

export const frequency = (type: PipeType, L: number, n: number, v = V_SOUND) => v / wavelength(type, L, n);

export const waveNumber = (type: PipeType, L: number, n: number) => (2 * Math.PI) / wavelength(type, L, n);

/** Displacement amplitude profile s(x)/s_m = cos kx. */
export const displacementShape = (type: PipeType, L: number, n: number, x: number) => Math.cos(waveNumber(type, L, n) * x);

/** Pressure amplitude profile Δp(x)/Δp_m = sin kx, from Δp = −B ∂s/∂x. */
export const pressureShape = (type: PipeType, L: number, n: number, x: number) => Math.sin(waveNumber(type, L, n) * x);

/** Points in [0, L] where kx = (j + offset)π. */
function marks(type: PipeType, L: number, n: number, offset: number): number[] {
  const k = waveNumber(type, L, n);
  const out: number[] = [];
  for (let j = 0; ; j++) {
    const x = ((j + offset) * Math.PI) / k;
    if (x > L * (1 + 1e-9)) break;
    out.push(Math.min(x, L));
  }
  return out;
}

/** Displacement nodes (= pressure antinodes). */
export const displacementNodes = (type: PipeType, L: number, n: number) => marks(type, L, n, 0.5);

/** Displacement antinodes (= pressure nodes). */
export const displacementAntinodes = (type: PipeType, L: number, n: number) => marks(type, L, n, 0);
