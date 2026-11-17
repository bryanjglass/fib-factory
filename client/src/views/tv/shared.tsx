import { useEffect, useRef } from 'react';
import type { GameView, PlayerView } from '../../../../shared/protocol';
import { Avatar } from '../../components/Avatar';

export function usePrevious<T>(value: T): T | undefined {
  const ref = useRef<T>();
  useEffect(() => {
    ref.current = value;
  });
  return ref.current;
}

/** Plays `fn` when `count` goes up. */
export function useOnIncrease(count: number, fn: () => void) {
  const prev = usePrevious(count);
  useEffect(() => {
    if (prev !== undefined && count > prev) fn();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [count]);
}

export function TvQuestionCard({ view, size = 'lg' }: { view: GameView; size?: 'lg' | 'md' | 'sm' }) {
  const text = view.question?.text ?? '';
  const sizes = { lg: 'text-[3.6rem] p-[3rem]', md: 'text-[2.6rem] p-[2rem]', sm: 'text-[1.8rem] p-[1.3rem]' };
  // Draw the blank as a chunky underline.
  const [before = '', after = ''] = text.split('_____');
  const glued = after.match(/^[^\s]*/)?.[0] ?? '';
  return (
    <div className={`sticker rounded-[2rem] bg-cream text-ink leading-[1.2] font-black ${sizes[size]}`} data-testid="tv-question">
      {before}
      {text.includes('_____') && (
        <span className="whitespace-nowrap">
          <span className="inline-block align-baseline w-[3.5em] mx-[0.15em] border-b-[0.12em] border-pink translate-y-[-0.1em]" aria-label="blank" />
          {glued}
        </span>
      )}
      {after.slice(glued.length)}
    </div>
  );
}

export function AvatarRow({
  players,
  doneIds,
  size = 5,
}: {
  players: PlayerView[];
  doneIds?: string[];
  size?: number;
}) {
  const done = new Set(doneIds ?? []);
  return (
    <div className={`flex flex-wrap justify-center text-[1rem] ${players.length > 6 ? 'gap-[1rem]' : 'gap-[1.6rem]'}`}>
      {players.map((p, i) => (
        <div key={p.id} className="animate-pop-in" style={{ animationDelay: `${i * 60}ms` }}>
          <Avatar
            player={p}
            size={size}
            showName
            dim={doneIds !== undefined && !done.has(p.id)}
            badge={doneIds === undefined ? null : done.has(p.id) ? 'check' : p.connected ? 'typing' : null}
            className="text-[1.3rem]"
          />
        </div>
      ))}
    </div>
  );
}

export function Banner({ children, tone = 'pink' }: { children: React.ReactNode; tone?: 'pink' | 'sun' | 'mint' | 'sky' }) {
  const bg = { pink: 'bg-pink text-white', sun: 'bg-sun text-ink', mint: 'bg-mint text-ink', sky: 'bg-sky text-ink' }[tone];
  return (
    <div className={`inline-block sticker rounded-[1rem] px-[1.6rem] py-[0.5rem] font-display text-[2rem] rotate-[-2deg] animate-slide-in ${bg}`}>
      {children}
    </div>
  );
}

export const CARD_COLORS = ['#ff3d8b', '#ffc93c', '#2de2a6', '#39c2ff', '#b78cff', '#ff7a3d', '#9be15d', '#ff9de2', '#21d4c4', '#f2f25a', '#7aa7ff'];
