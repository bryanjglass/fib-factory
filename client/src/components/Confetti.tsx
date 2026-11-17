import { useMemo } from 'react';

const COLORS = ['#ff3d8b', '#ffc93c', '#2de2a6', '#39c2ff', '#b78cff', '#ff5a3c'];

export function Confetti({ count = 90 }: { count?: number }) {
  const pieces = useMemo(
    () =>
      Array.from({ length: count }, (_, i) => ({
        left: Math.random() * 100,
        delay: -Math.random() * 6,
        duration: 4 + Math.random() * 4,
        color: COLORS[i % COLORS.length],
        drift: `${(Math.random() - 0.5) * 30}vw`,
        spin: `${(Math.random() > 0.5 ? 1 : -1) * (360 + Math.random() * 720)}deg`,
        round: Math.random() > 0.7,
      })),
    [count],
  );
  return (
    <div className="pointer-events-none fixed inset-0 overflow-hidden z-10" aria-hidden="true">
      {pieces.map((p, i) => (
        <span
          key={i}
          className="confetti-piece"
          style={
            {
              left: `${p.left}%`,
              background: p.color,
              animationDelay: `${p.delay}s`,
              animationDuration: `${p.duration}s`,
              borderRadius: p.round ? '50%' : '2px',
              '--drift': p.drift,
              '--spin': p.spin,
            } as React.CSSProperties
          }
        />
      ))}
    </div>
  );
}
