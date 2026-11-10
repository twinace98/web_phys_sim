// Fixed-step time loop, DOM-free so it can be unit-tested (docs/design.md §5.1).
import { History } from './history';
import { Rng } from './rng';
import type { Params, Scene, SceneCtx } from './types';

const MAX_STEPS_PER_CALL = 50000;

export class Runner<P extends Params = Params, S extends { t: number } = { t: number }> {
  state!: S;
  rng!: Rng;
  readonly hist = new History<S>();
  playing = false;
  speed = 1;
  private acc = 0;
  private steps = 0;

  constructor(
    readonly scene: Scene<P, S>,
    public params: P,
    public seed = 1,
  ) {
    this.reset();
  }

  get done(): boolean {
    const e = this.scene.time.tEnd;
    return e !== undefined && this.state.t >= e - 1e-9;
  }

  reset(): void {
    this.rng = new Rng(this.seed);
    this.state = this.scene.init(this.params, this.rng);
    this.hist.clear();
    this.acc = 0;
    this.steps = 0;
    this.record();
  }

  play(): void {
    if (this.done) this.reset();
    this.playing = true;
  }

  pause(): void {
    this.playing = false;
    this.acc = 0;
  }

  /** Advance by wall-clock seconds (no-op while paused). */
  advance(wallDt: number): void {
    if (!this.playing) return;
    const { h, scale = 1 } = this.scene.time;
    this.acc += wallDt * this.speed * scale;
    let n = 0;
    while (this.acc >= h && n < MAX_STEPS_PER_CALL) {
      this.stepOnce();
      this.acc -= h;
      n += 1;
      if (this.done) {
        this.pause();
        return;
      }
    }
    if (n === MAX_STEPS_PER_CALL) this.acc = 0;
  }

  /** Step button: advance `frameStep` sim seconds and stay paused. */
  stepFrame(): void {
    if (this.done) return;
    const { h, frameStep } = this.scene.time;
    const n = Math.max(1, Math.round(frameStep / h));
    for (let i = 0; i < n && !this.done; i++) this.stepOnce();
    this.pause();
  }

  /** Returns true if the change reset the scene. */
  setParam<K extends keyof P>(key: K, value: P[K]): boolean {
    this.params = { ...this.params, [key]: value };
    if (!this.scene.params[key].live) {
      this.reset();
      return true;
    }
    return false;
  }

  ctx(onChange?: () => void): SceneCtx<P> {
    return {
      params: this.params,
      set: (k, v) => {
        this.setParam(k, v);
        onChange?.();
      },
    };
  }

  private stepOnce(): void {
    this.scene.step(this.state, this.scene.time.h, this.params);
    this.steps += 1;
    if (this.steps % this.scene.time.recordEvery === 0 || this.done) this.record();
  }

  private record(): void {
    this.hist.push(this.scene.record(this.state, this.params), this.scene.snapshot?.(this.state));
  }
}
