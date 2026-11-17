import { useEffect, useState } from 'react';
import type { GameView } from '../../../../shared/protocol';
import { ConnectionBanner } from '../../components/ConnectionBanner';
import { Logo } from '../../components/Logo';
import { PrefsControls } from '../../components/PrefsControls';
import { MessageScreen } from '../../components/Screen';
import { shortSiteLabel } from '../../config';
import { usePrefs } from '../../lib/prefs';
import { audioUnlocked, unlockAudio } from '../../lib/sfx';
import { useGame } from '../../store';
import { TvLobby } from './TvLobby';
import { TvQuestion, TvSubmission, TvVoting } from './TvRound';
import { TvReveal } from './TvReveal';
import { TvGameOver, TvScoreboard } from './TvResults';

export function TvView({ code }: { code: string }) {
  const { connect, disconnect, view, status } = useGame();

  useEffect(() => {
    connect(code, 'display');
    return () => disconnect();
  }, [code, connect, disconnect]);

  if (status === 'notFound') return <MessageScreen title={`Room ${code} has closed`} emoji="🚪" />;
  if (!view) {
    return (
      <div className="w-screen h-screen bg-factory flex flex-col items-center justify-center gap-8">
        <Logo className="text-[6rem] animate-pop-in" />
        <div className="text-[2rem] text-cream/70">Warming up the machines…</div>
      </div>
    );
  }
  return <TvStage view={view} />;
}

function TvStage({ view }: { view: GameView }) {
  const sound = usePrefs((s) => s.sound);
  const [needsAudio, setNeedsAudio] = useState(() => sound && !audioUnlocked());
  useEffect(() => setNeedsAudio(sound && !audioUnlocked()), [sound]);

  const phaseKey = `${view.gameNumber}-${view.phase}-${view.round}`;
  const showHeader = view.phase !== 'lobby';

  return (
    <div
      className="relative w-screen h-screen overflow-hidden bg-factory text-cream select-none"
      onClick={() => {
        unlockAudio();
        setNeedsAudio(false);
      }}
      data-testid="tv"
      data-phase={view.phase}
    >
      <div className="spotlight-beam left-[5%]" style={{ animationDelay: '-2s' }} />
      <div className="spotlight-beam right-[5%]" style={{ animationDelay: '-6s', animationDirection: 'reverse' }} />
      <div className="absolute inset-0 bg-stripes pointer-events-none" />

      {showHeader && (
        <header className="absolute top-0 inset-x-0 h-[6.5rem] flex items-center px-[3rem] gap-[2rem] z-20">
          <Logo className="text-[1.9rem]" />
          {view.phase !== 'gameOver' && (
            <div className="mx-auto flex items-center gap-[0.8rem]" aria-label="Progress">
              {Array.from({ length: view.totalRounds }, (_, i) => (
                <span
                  key={i}
                  className={`block rounded-full sticker transition-all ${
                    i + 1 < view.round ? 'w-[1.1rem] h-[1.1rem] bg-mint' : i + 1 === view.round ? 'w-[1.6rem] h-[1.6rem] bg-sun' : 'w-[1.1rem] h-[1.1rem] bg-white/15'
                  }`}
                />
              ))}
            </div>
          )}
          <div className="ml-auto text-right leading-tight">
            <div className="text-[1.1rem] text-cream/70">{shortSiteLabel()}</div>
            <div className="font-display text-[2rem] text-sun tracking-[0.2em]">{view.code}</div>
          </div>
        </header>
      )}

      <main key={phaseKey} className={`absolute inset-0 ${showHeader ? 'pt-[6.5rem]' : ''}`}>
        {view.phase === 'lobby' && <TvLobby view={view} />}
        {view.phase === 'question' && <TvQuestion view={view} />}
        {view.phase === 'submission' && <TvSubmission view={view} />}
        {view.phase === 'voting' && <TvVoting view={view} />}
        {view.phase === 'reveal' && <TvReveal view={view} />}
        {view.phase === 'scoreboard' && <TvScoreboard view={view} />}
        {view.phase === 'gameOver' && <TvGameOver view={view} />}
      </main>

      {view.paused && (
        <div className="absolute inset-0 z-30 bg-ink/80 flex items-center justify-center" role="status">
          <div className="hazard sticker px-[1rem] py-[1rem] rotate-[-4deg]">
            <div className="bg-ink px-[4rem] py-[2rem] font-display text-[7rem] text-sun">PAUSED</div>
          </div>
        </div>
      )}

      {!view.hostConnected && view.phase !== 'lobby' && (
        <div className="absolute top-[7rem] right-[3rem] z-20 rounded-full bg-tomato sticker px-[1rem] py-[0.3rem] text-[1rem] animate-blink">
          Host reconnecting…
        </div>
      )}

      <div className="absolute bottom-[0.6rem] right-[1rem] z-40 flex items-center gap-[0.6rem] text-[0.8rem] opacity-50 hover:opacity-100 transition-opacity">
        {needsAudio && <span className="rounded-full bg-black/60 px-[0.8rem] py-[0.3rem] text-cream/90">🔈 Click this tab once to enable sound</span>}
        <PrefsControls />
      </div>
      <ConnectionBanner />
    </div>
  );
}
