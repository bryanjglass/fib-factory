import { useEffect, useRef, useState } from 'react';
import { usePrefs } from '../lib/prefs';

/** Animates a number from its previous value to `target` (instant with reduced motion). */
export function useTween(target: number, durationMs = 1200, delayMs = 0): number {
  const reduce = usePrefs((s) => s.reduceMotion);
  const [value, setValue] = useState(target);
  const from = useRef(target);
  useEffect(() => {
    if (reduce || from.current === target) {
      from.current = target;
      setValue(target);
      return;
    }
    const start = from.current;
    let raf = 0;
    let t0 = 0;
    const timeout = setTimeout(() => {
      const frame = (t: number) => {
        t0 ||= t;
        const p = Math.min(1, (t - t0) / durationMs);
        const eased = 1 - Math.pow(1 - p, 3);
        setValue(Math.round(start + (target - start) * eased));
        if (p < 1) raf = requestAnimationFrame(frame);
        else from.current = target;
      };
      raf = requestAnimationFrame(frame);
    }, delayMs);
    return () => {
      clearTimeout(timeout);
      cancelAnimationFrame(raf);
      from.current = target;
    };
  }, [target, durationMs, delayMs, reduce]);
  return value;
}
