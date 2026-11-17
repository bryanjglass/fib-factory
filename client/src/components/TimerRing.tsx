import { useEffect, useRef } from 'react';
import type { TimerView } from '../../../shared/protocol';
import { useCountdown } from '../hooks/useCountdown';

interface Props {
  timer: TimerView | null;
  className?: string;
  onTick?: (secondsLeft: number) => void;
}

/** Circular countdown, sized by the parent's font-size (1em = ring diameter / 5). */
export function TimerRing({ timer, className = '', onTick }: Props) {
  const { remainingMs, fraction } = useCountdown(timer);
  const seconds = Math.ceil(remainingMs / 1000);
  const urgent = seconds <= 5 && !timer?.paused;
  const lastSecond = useRef(seconds);
  useEffect(() => {
    if (seconds !== lastSecond.current) {
      lastSecond.current = seconds;
      if (seconds > 0) onTick?.(seconds);
    }
  }, [seconds, onTick]);
  const r = 44;
  const c = 2 * Math.PI * r;
  return (
    <div
      className={`relative w-[5em] h-[5em] ${urgent ? 'animate-pulse-fast' : ''} ${className}`}
      role="timer"
      aria-label={`${seconds} seconds left`}
    >
      <svg viewBox="0 0 100 100" className="w-full h-full -rotate-90">
        <circle cx="50" cy="50" r={r} fill="#1b1033" stroke="rgb(255 255 255 / 0.12)" strokeWidth="10" />
        <circle
          cx="50"
          cy="50"
          r={r}
          fill="none"
          stroke={urgent ? '#ff5a3c' : fraction < 0.4 ? '#ffc93c' : '#2de2a6'}
          strokeWidth="10"
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - Math.max(0, Math.min(1, fraction)))}
          style={{ transition: 'stroke-dashoffset 0.1s linear, stroke 0.3s' }}
        />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center font-display text-[1.9em] text-cream">
        {timer?.paused ? '❚❚' : seconds}
      </div>
    </div>
  );
}

/** Slim horizontal countdown for phones. */
export function TimerBar({ timer }: { timer: TimerView | null }) {
  const { remainingMs, fraction } = useCountdown(timer);
  if (!timer) return null;
  const seconds = Math.ceil(remainingMs / 1000);
  const urgent = seconds <= 5;
  return (
    <div className="flex items-center gap-3" role="timer" aria-label={`${seconds} seconds left`}>
      <div className="flex-1 h-4 rounded-full bg-black/40 overflow-hidden sticker border-2">
        <div
          className={`h-full ${urgent ? 'bg-tomato' : fraction < 0.4 ? 'bg-sun' : 'bg-mint'}`}
          style={{ width: `${Math.max(0, Math.min(1, fraction)) * 100}%`, transition: 'width 0.1s linear' }}
        />
      </div>
      <span className={`font-display text-xl w-12 text-right ${urgent ? 'text-tomato' : ''}`}>
        {timer.paused ? '❚❚' : seconds}
      </span>
    </div>
  );
}
