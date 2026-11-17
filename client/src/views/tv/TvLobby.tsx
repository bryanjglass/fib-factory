import { MAX_PLAYERS, MIN_PLAYERS, type GameView } from '../../../../shared/protocol';
import { Avatar } from '../../components/Avatar';
import { Logo } from '../../components/Logo';
import { QrCode } from '../../components/QrCode';
import { joinUrl, shortSiteLabel } from '../../config';
import { contestantsOf } from '../../hooks/usePlayers';
import { sfx } from '../../lib/sfx';
import { useOnIncrease } from './shared';

export function TvLobby({ view }: { view: GameView }) {
  const players = contestantsOf(view);
  useOnIncrease(players.length, sfx.pop);
  const needed = Math.max(0, MIN_PLAYERS - players.filter((p) => p.connected).length);
  const emptySlots = Math.max(0, MIN_PLAYERS - players.length);
  const big = players.length <= 6;

  return (
    <div className="h-full flex flex-col px-[4rem] pt-[2.2rem] pb-[3.2rem] gap-[1.6rem]">
      <div className="flex-1 min-h-0 grid grid-cols-[1.25fr_1fr] gap-[4rem] items-center">
        <div className="flex flex-col gap-[1.6rem]">
          <Logo className="text-[5rem] animate-pop-in" />
          <p className="text-[2rem] leading-tight text-cream/90 max-w-[40rem] animate-rise [animation-delay:200ms]">
            Grab your phone! Write fake answers, fool your family, find the truth.
          </p>
          <div className="flex flex-col gap-[0.8rem] text-[2rem] animate-rise [animation-delay:350ms]">
            <div>
              <span className="text-cream/70">1. Go to </span>
              <span className="text-sky" data-testid="tv-site">{shortSiteLabel()}</span>
            </div>
            <div className="flex items-center gap-[1.2rem]">
              <span className="text-cream/70">2. Enter code</span>
              <span className="hazard sticker rounded-[1rem] p-[0.5rem] rotate-[-3deg]">
                <span className="block bg-ink rounded-[0.6rem] px-[1.4rem] py-[0.2rem] font-display text-[4.2rem] text-sun tracking-[0.25em]" data-testid="tv-room-code">
                  {view.code}
                </span>
              </span>
            </div>
          </div>
        </div>
        <div className="flex flex-col items-center gap-[1rem] animate-pop-in [animation-delay:250ms]">
          <div className="relative">
            <QrCode value={joinUrl(view.code)} className="w-[20rem] h-[20rem] rotate-[2deg]" />
            <span className="absolute -top-[1.6rem] -left-[2rem] bg-pink sticker rounded-[0.8rem] px-[1rem] py-[0.3rem] font-display text-[1.8rem] rotate-[-10deg] text-white">
              SCAN ME!
            </span>
          </div>
          <div className="flex gap-[0.8rem] text-[1.3rem] mt-[1rem]">
            <span className="rounded-full bg-white/10 px-[1rem] py-[0.3rem]">{view.settings.questionCount} questions</span>
            <span className="rounded-full bg-white/10 px-[1rem] py-[0.3rem]">{view.settings.submitSeconds}s to fib</span>
            <span className="rounded-full bg-white/10 px-[1rem] py-[0.3rem]">{view.settings.voteSeconds}s to vote</span>
          </div>
        </div>
      </div>

      <section className="relative rounded-[2rem] bg-black/30 border-[0.15rem] border-white/10 px-[2rem] pt-[1.4rem] pb-[1.6rem]">
        <div className="absolute inset-x-0 top-0 h-[0.6rem] rounded-t-[2rem] hazard opacity-80" />
        <div className="flex items-baseline justify-between mb-[1rem] mt-[0.4rem]">
          <h2 className="font-display text-[2rem] text-sun">
            Players <span className="text-cream" data-testid="tv-player-count">{players.length}</span>
            <span className="text-cream/50">/{MAX_PLAYERS}</span>
          </h2>
          <div className="text-[1.8rem]" data-testid="tv-lobby-status">
            {needed > 0 ? (
              <span className="text-cream/80">Need {needed} more player{needed === 1 ? '' : 's'} to start</span>
            ) : (
              <span className="text-mint animate-pulse-fast inline-block">Ready! Waiting for the host to start…</span>
            )}
          </div>
        </div>
        <div className="flex flex-wrap gap-[1.6rem] min-h-[8.5rem] items-start text-[1rem]" data-testid="tv-players">
          {players.map((p) => (
            <div key={p.id} className="animate-pop-in">
              <Avatar player={p} size={big ? 6 : 4.6} showName className="text-[1.5rem]" />
            </div>
          ))}
          {Array.from({ length: emptySlots }, (_, i) => (
            <div
              key={`empty-${i}`}
              className="w-[9rem] h-[9rem] rounded-full border-[0.2rem] border-dashed border-white/25 flex items-center justify-center text-white/30 font-display text-[2.5rem]"
            >
              ?
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
