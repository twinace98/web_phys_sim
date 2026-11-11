// Optional sound for the beats scene: two sine oscillators through Web Audio.
// The scene calls soundTick every frame; when the frames stop (scene left, tab hidden) a
// watchdog silences the sound, so no lifecycle hooks are needed.

let ctx: AudioContext | null = null;
let oscs: OscillatorNode[] = [];
let lastTick = 0;
let watchdog: number | undefined;

function stop(): void {
  if (watchdog !== undefined) window.clearInterval(watchdog);
  watchdog = undefined;
  if (!ctx) return;
  const c = ctx;
  ctx = null;
  oscs = [];
  void c.close();
}

function start(f1: number, f2: number): void {
  if (typeof AudioContext === 'undefined') return;
  const c = new AudioContext();
  const g = c.createGain();
  g.gain.setValueAtTime(0, c.currentTime);
  g.gain.linearRampToValueAtTime(0.12, c.currentTime + 0.08);
  g.connect(c.destination);
  oscs = [f1, f2].map((f) => {
    const o = c.createOscillator();
    o.type = 'sine';
    o.frequency.value = f;
    o.connect(g);
    o.start();
    return o;
  });
  if (c.state === 'suspended') void c.resume();
  ctx = c;
  watchdog = window.setInterval(() => {
    if (performance.now() - lastTick > 300) stop();
  }, 150);
}

/** Keep the two tones playing while `on`; silence otherwise. */
export function soundTick(on: boolean, f1: number, f2: number): void {
  if (typeof window === 'undefined') return;
  lastTick = performance.now();
  if (!on) {
    stop();
    return;
  }
  if (!ctx) {
    start(f1, f2);
    return;
  }
  if (oscs[0].frequency.value !== f1) oscs[0].frequency.value = f1;
  if (oscs[1].frequency.value !== f2) oscs[1].frequency.value = f2;
  if (ctx.state === 'suspended') void ctx.resume();
}
