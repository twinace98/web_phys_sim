/**
 * Recorded channels plus optional state snapshots, index-aligned.
 * When full, every other sample is dropped (first and last kept), so a long
 * run keeps its whole time span at lower resolution (docs/design.md §5.2).
 */
export class History<S> {
  private cols = new Map<string, number[]>();
  private snaps: S[] = [];
  private n = 0;

  constructor(private readonly capacity = 10000) {}

  get length(): number {
    return this.n;
  }

  clear(): void {
    this.cols.clear();
    this.snaps = [];
    this.n = 0;
  }

  push(rec: Record<string, number>, snap?: S): void {
    for (const k in rec) {
      let c = this.cols.get(k);
      if (!c) {
        c = new Array(this.n).fill(NaN);
        this.cols.set(k, c);
      }
      c.push(rec[k]);
    }
    if (snap !== undefined) this.snaps.push(snap);
    this.n += 1;
    if (this.n > this.capacity) this.decimate();
  }

  col(name: string): readonly number[] {
    return this.cols.get(name) ?? [];
  }

  snap(i: number): S | undefined {
    return this.snaps[i];
  }

  /** Index of the sample whose 't' is nearest to t. */
  indexAtTime(t: number): number {
    const ts = this.col('t');
    if (ts.length === 0) return -1;
    let lo = 0;
    let hi = ts.length - 1;
    if (t <= ts[lo]) return lo;
    if (t >= ts[hi]) return hi;
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1;
      if (ts[mid] <= t) lo = mid;
      else hi = mid;
    }
    return t - ts[lo] <= ts[hi] - t ? lo : hi;
  }

  private decimate(): void {
    const last = this.n - 1;
    const keep = (_: unknown, i: number) => i % 2 === 0 || i === last;
    for (const [k, c] of this.cols) this.cols.set(k, c.filter(keep));
    if (this.snaps.length) this.snaps = this.snaps.filter(keep);
    this.n = this.cols.values().next().value?.length ?? this.snaps.length;
  }
}
