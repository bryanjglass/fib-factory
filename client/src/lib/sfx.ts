/**
 * Tiny synthesized sound effects (no audio files). Entirely optional: the game
 * is fully playable muted, and nothing waits on sound.
 */
import { usePrefs } from './prefs';

let ctx: AudioContext | null = null;

function audio(): AudioContext | null {
  if (!usePrefs.getState().sound) return null;
  try {
    ctx ??= new AudioContext();
    if (ctx.state === 'suspended') void ctx.resume();
    return ctx.state === 'running' ? ctx : null;
  } catch {
    return null;
  }
}

/** Browsers only allow audio after a user gesture; call this from a click. */
export function unlockAudio() {
  try {
    ctx ??= new AudioContext();
    void ctx.resume();
  } catch {
    /* no audio support */
  }
}

export function audioUnlocked(): boolean {
  return ctx?.state === 'running';
}

function tone(freq: number, start: number, dur: number, type: OscillatorType = 'sine', gain = 0.15, slideTo?: number) {
  const a = audio();
  if (!a) return;
  const t0 = a.currentTime + start;
  const osc = a.createOscillator();
  const g = a.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t0);
  if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, t0 + dur);
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(gain, t0 + 0.02);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  osc.connect(g).connect(a.destination);
  osc.start(t0);
  osc.stop(t0 + dur + 0.05);
}

export const sfx = {
  pop: () => tone(660, 0, 0.12, 'triangle', 0.12, 990),
  tick: () => tone(1200, 0, 0.05, 'square', 0.04),
  whoosh: () => tone(220, 0, 0.35, 'sawtooth', 0.05, 880),
  stamp: () => {
    tone(90, 0, 0.25, 'square', 0.18, 50);
    tone(180, 0, 0.12, 'triangle', 0.1);
  },
  buzz: () => tone(140, 0, 0.45, 'sawtooth', 0.09, 110),
  truth: () => [523, 659, 784, 1047].forEach((f, i) => tone(f, i * 0.09, 0.35, 'triangle', 0.12)),
  fanfare: () =>
    [523, 523, 659, 784, 659, 784, 1047].forEach((f, i) => tone(f, i * 0.14, 0.3, 'square', 0.06)),
};
