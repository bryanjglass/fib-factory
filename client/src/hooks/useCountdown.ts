import { useEffect, useState } from 'react';
import type { TimerView } from '../../../shared/protocol';
import { useGame } from '../store';

/** Milliseconds left on the server timer, ticking locally between snapshots. */
export function useCountdown(timer: TimerView | null): { remainingMs: number; fraction: number } {
  const offset = useGame((s) => s.clockOffset);
  const compute = () => {
    if (!timer) return 0;
    if (timer.paused || timer.endsAt === null) return timer.remainingMs;
    return Math.max(0, timer.endsAt - (Date.now() + offset));
  };
  const [remainingMs, setRemaining] = useState(compute);
  useEffect(() => {
    setRemaining(compute());
    if (!timer || timer.paused) return;
    const id = setInterval(() => setRemaining(compute()), 100);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [timer?.endsAt, timer?.remainingMs, timer?.paused, offset]);
  const fraction = timer && timer.durationMs > 0 ? remainingMs / timer.durationMs : 0;
  return { remainingMs, fraction };
}
