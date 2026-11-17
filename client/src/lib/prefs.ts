import { create } from 'zustand';
import { storage } from './storage';

interface Prefs {
  reduceMotion: boolean;
  sound: boolean;
  setReduceMotion: (v: boolean) => void;
  setSound: (v: boolean) => void;
}

const systemPrefersReduced =
  typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

function initial(key: string, fallback: boolean): boolean {
  const v = storage.get(key);
  return v === null ? fallback : v === '1';
}

function applyMotionClass(reduce: boolean) {
  document.documentElement.classList.toggle('reduce-motion', reduce);
}

export const usePrefs = create<Prefs>((set) => ({
  reduceMotion: initial('fib.reduceMotion', !!systemPrefersReduced),
  sound: initial('fib.sound', true),
  setReduceMotion: (v) => {
    storage.set('fib.reduceMotion', v ? '1' : '0');
    applyMotionClass(v);
    set({ reduceMotion: v });
  },
  setSound: (v) => {
    storage.set('fib.sound', v ? '1' : '0');
    set({ sound: v });
  },
}));

applyMotionClass(usePrefs.getState().reduceMotion);
