/** A fresh 32-bit seed: every run starts from a different random state (docs/design.md §5.3). */
export function freshSeed(): number {
  const c = (globalThis as { crypto?: Crypto }).crypto;
  if (c?.getRandomValues) return c.getRandomValues(new Uint32Array(1))[0];
  return Math.floor(Math.random() * 4294967296);
}

/** Seeded PRNG (mulberry32). Same seed → same sequence; tests pass a fixed seed. */
export class Rng {
  private s: number;

  constructor(readonly seed: number) {
    this.s = seed >>> 0;
  }

  /** Uniform in [0, 1). */
  next(): number {
    this.s = (this.s + 0x6d2b79f5) >>> 0;
    let t = this.s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  /** Standard normal (Box-Muller). */
  normal(): number {
    const u = 1 - this.next();
    const v = this.next();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  }
}
