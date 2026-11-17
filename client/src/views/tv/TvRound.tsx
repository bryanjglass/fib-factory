import { useEffect } from 'react';
import type { GameView } from '../../../../shared/protocol';
import { TimerRing } from '../../components/TimerRing';
import { useCountdown } from '../../hooks/useCountdown';
import { contestantsOf } from '../../hooks/usePlayers';
import { sfx } from '../../lib/sfx';
import { AvatarRow, Banner, CARD_COLORS, TvQuestionCard, useOnIncrease } from './shared';

const tickLastSeconds = (s: number) => {
  if (s <= 5) sfx.tick();
};

export function TvQuestion({ view }: { view: GameView }) {
  const { fraction } = useCountdown(view.timer);
  useEffect(() => sfx.whoosh(), []);
  return (
    <div className="h-full flex flex-col justify-center px-[7rem] gap-[2.5rem]">
      <div className="text-center">
        <Banner tone="sun">
          Question {view.round} of {view.totalRounds}
        </Banner>
      </div>
      <div className="animate-pop-in [animation-delay:300ms]">
        <TvQuestionCard view={view} />
      </div>
      <div className="flex items-center gap-[1.5rem] animate-rise [animation-delay:700ms]">
        <span className="font-display text-[2rem] text-pink">Get ready to fib!</span>
        <div className="flex-1 h-[1rem] rounded-full bg-black/40 overflow-hidden">
          <div className="h-full bg-pink conveyor" style={{ width: `${(1 - fraction) * 100}%`, transition: 'width 0.1s linear' }} />
        </div>
      </div>
    </div>
  );
}

export function TvSubmission({ view }: { view: GameView }) {
  const players = contestantsOf(view);
  useOnIncrease(view.submittedIds.length, sfx.pop);
  return (
    <div className="h-full flex flex-col px-[5rem] pb-[3rem] gap-[2.5rem]">
      <div className="grid grid-cols-[1fr_auto] gap-[3rem] items-center pt-[1rem]">
        <TvQuestionCard view={view} size="md" />
        <TimerRing timer={view.timer} className="text-[3rem]" onTick={tickLastSeconds} />
      </div>
      <div className="text-center flex flex-col items-center gap-[1rem]">
        <Banner>✍️ Write a convincing fib on your phone!</Banner>
        <p className="text-[1.6rem] text-cream/80">Make it sound like the real answer. Sneaky is good.</p>
      </div>
      <div className="mt-auto flex flex-col items-center gap-[1.5rem]">
        <div className="font-display text-[2.2rem]" data-testid="tv-submit-count">
          <span className="text-sun">{view.submittedIds.length}</span> / {players.length} fibs in
        </div>
        <AvatarRow players={players} doneIds={view.submittedIds} />
      </div>
    </div>
  );
}

export function TvVoting({ view }: { view: GameView }) {
  const players = contestantsOf(view);
  const ballot = view.ballot ?? [];
  useOnIncrease(view.votedIds.length, sfx.pop);
  const cols = ballot.length > 8 ? 'grid-cols-3' : 'grid-cols-2';
  const text = ballot.length > 8 ? 'text-[1.8rem] py-[0.7rem]' : ballot.length > 4 ? 'text-[2.3rem] py-[0.9rem]' : 'text-[3rem] py-[1.1rem]';
  const crowded = players.length > 6;
  return (
    <div className="h-full flex flex-col px-[4rem] pb-[2.4rem] gap-[1.3rem]">
      <div className="grid grid-cols-[1fr_auto] gap-[2.5rem] items-center pt-[0.5rem]">
        <div className="flex flex-col gap-[1rem]">
          <TvQuestionCard view={view} size="sm" />
          <div>
            <Banner tone="sky">🕵️ Which one is the TRUTH? Vote on your phone!</Banner>
          </div>
        </div>
        <TimerRing timer={view.timer} className="text-[2.6rem]" onTick={tickLastSeconds} />
      </div>
      <div className={`grid ${cols} ${crowded ? 'gap-[1rem]' : 'gap-[1.3rem]'} flex-1 min-h-0 content-center`} data-testid="tv-ballot">
        {ballot.map((b, i) => (
          <div
            key={b.id}
            className={`sticker rounded-[1.4rem] px-[1.6rem] text-ink font-black answer-text ${text} leading-[1.1] flex items-center animate-pop-in`}
            style={{ background: CARD_COLORS[i % CARD_COLORS.length], animationDelay: `${i * 90}ms`, rotate: `${((i % 3) - 1) * 0.6}deg` }}
          >
            {b.text}
          </div>
        ))}
      </div>
      <div className="flex items-center justify-center gap-[2rem]">
        <div className="font-display text-[1.8rem]" data-testid="tv-vote-count">
          <span className="text-sun">{view.votedIds.length}</span> / {players.length} voted
        </div>
        <div className="text-[0.75rem]">
          <AvatarRow players={players} doneIds={view.votedIds} size={crowded ? 3 : 4} />
        </div>
      </div>
    </div>
  );
}
