import { useEffect, useState } from 'react';
import {
  MAX_PLAYERS,
  QUESTION_COUNTS,
  SUBMIT_SECONDS_OPTIONS,
  VOTE_SECONDS_OPTIONS,
  type GameView,
  type HostAction,
  type Phase,
} from '../../../../shared/protocol';
import { Avatar } from '../../components/Avatar';
import { Button } from '../../components/Button';
import { ConnectionBanner } from '../../components/ConnectionBanner';
import { Logo } from '../../components/Logo';
import { PrefsControls } from '../../components/PrefsControls';
import { QrCode } from '../../components/QrCode';
import { MessageScreen } from '../../components/Screen';
import { TimerRing } from '../../components/TimerRing';
import { joinUrl, tvUrl } from '../../config';
import { contestantsOf } from '../../hooks/usePlayers';
import { hostTokenKey, storage } from '../../lib/storage';
import { useGame } from '../../store';

const PHASE_LABEL: Record<Phase, string> = {
  lobby: 'Lobby',
  question: 'Question intro',
  submission: 'Writing fibs',
  voting: 'Voting',
  reveal: 'Reveal',
  scoreboard: 'Scoreboard',
  gameOver: 'Game over',
};

function nextLabel(v: GameView): string {
  switch (v.phase) {
    case 'question':
      return 'Skip intro';
    case 'submission':
      return 'End fibbing now';
    case 'voting':
      return 'End voting now';
    case 'reveal':
      return v.reveal && v.reveal.step >= v.reveal.order.length - 1 ? 'Show scores' : 'Next reveal';
    case 'scoreboard':
      return v.round >= v.totalRounds ? 'Final results' : 'Next question';
    default:
      return 'Next';
  }
}

export function HostView({ code }: { code: string }) {
  const { connect, disconnect, view, status, request } = useGame();
  const hasToken = !!storage.get(hostTokenKey(code));

  useEffect(() => {
    if (!hasToken) return;
    connect(code, 'host');
    return () => disconnect();
  }, [code, hasToken, connect, disconnect]);

  if (!hasToken || status === 'unauthorized') {
    return (
      <MessageScreen title="This browser isn't the host" emoji="🔒">
        <p className="max-w-md text-cream/80">
          Host controls only work in the browser that created room <b>{code}</b>. You can still{' '}
          <a className="underline text-sun" href={`#/play/${code}`}>join as a player</a> or{' '}
          <a className="underline text-sun" href={`#/tv/${code}`}>open the TV display</a>.
        </p>
      </MessageScreen>
    );
  }
  if (status === 'notFound') {
    return <MessageScreen title={`Room ${code} has closed`} emoji="🚪" />;
  }
  if (!view) {
    return <MessageScreen title="Starting the conveyor belts…" emoji="⚙️" />;
  }

  const send = (action: HostAction) => request({ type: 'host', action });
  return <HostPanel view={view} send={send} />;
}

function HostPanel({ view, send }: { view: GameView; send: (a: HostAction) => Promise<unknown> }) {
  const [confirmRestart, setConfirmRestart] = useState(false);
  const [copied, setCopied] = useState(false);
  const contestants = contestantsOf(view);
  const waiting = view.players.filter((p) => p.status === 'waiting');
  const inGame = view.phase !== 'lobby' && view.phase !== 'gameOver';
  const link = joinUrl(view.code);

  const openTv = () => {
    window.open(tvUrl(view.code), `fib-factory-tv-${view.code}`);
  };

  const advance = () =>
    send({
      kind: 'advance',
      expect: { phase: view.phase, round: view.round, step: view.reveal?.step },
    });

  const progress =
    view.phase === 'submission'
      ? `${view.submittedIds.length} / ${contestants.length} fibs in`
      : view.phase === 'voting'
        ? `${view.votedIds.length} / ${contestants.length} votes in`
        : null;

  return (
    <div className="min-h-dvh bg-factory text-base">
      <header className="flex flex-wrap items-center gap-4 px-6 py-4 border-b border-white/10 bg-black/20">
        <Logo className="text-2xl" />
        <div className="ml-2 flex items-baseline gap-2">
          <span className="text-cream/70">Room</span>
          <span className="font-display text-3xl text-sun tracking-widest" data-testid="room-code">
            {view.code}
          </span>
        </div>
        <span className="rounded-full bg-white/10 px-3 py-1 text-sm">Host controls</span>
        <PrefsControls className="ml-auto text-base" showSound={false} />
      </header>

      <main className="grid gap-6 p-6 lg:grid-cols-[1fr_1.3fr_1fr] max-w-[1500px] mx-auto">
        {/* TV + join */}
        <section className="flex flex-col gap-6">
          <div className="sticker rounded-3xl bg-plum p-5 flex flex-col gap-3">
            <h2 className="font-display text-xl text-sun">📺 TV display</h2>
            <Button tone="sun" big onClick={openTv} data-testid="open-tv">
              Open TV display
            </Button>
            <ol className="text-sm text-cream/80 list-decimal pl-5 space-y-1">
              <li>Click <b>Open TV display</b> — it opens in a new tab.</li>
              <li>In that tab, open Chrome's menu <b>⋮ → Cast…</b>, choose your TV, and pick <b>Cast tab</b>.</li>
              <li>Keep this host tab open to run the game.</li>
            </ol>
          </div>
          <div className="sticker rounded-3xl bg-night p-5 flex flex-col gap-3 items-center text-center">
            <h2 className="font-display text-xl text-pink self-start">📱 Players join</h2>
            <QrCode value={link} className="w-44 h-44" />
            <a href={link} target="_blank" rel="noreferrer" className="text-sky underline break-all text-sm" data-testid="join-link">
              {link}
            </a>
            <Button
              tone="ghost"
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(link);
                  setCopied(true);
                  setTimeout(() => setCopied(false), 1500);
                } catch {
                  /* clipboard unavailable */
                }
              }}
            >
              {copied ? 'Copied!' : 'Copy join link'}
            </Button>
          </div>
        </section>

        {/* Game control */}
        <section className="sticker rounded-3xl bg-night p-6 flex flex-col gap-5" aria-label="Game controls">
          <div className="flex items-center gap-4">
            <div>
              <div className="text-cream/60 text-sm uppercase tracking-wider">Now</div>
              <div className="font-display text-3xl text-sun" data-testid="host-phase">
                {PHASE_LABEL[view.phase]}
              </div>
              {view.phase !== 'lobby' && (
                <div className="text-cream/80">
                  Question {view.round} of {view.totalRounds}
                  {view.paused && <span className="ml-2 text-tomato">· Paused</span>}
                </div>
              )}
            </div>
            {view.timer && <TimerRing timer={view.timer} className="ml-auto text-[1.1rem]" />}
          </div>

          {progress && <div className="text-xl text-mint" data-testid="host-progress">{progress}</div>}

          {view.question && (
            <blockquote className="rounded-2xl bg-white/5 border border-white/10 p-4 text-lg">{view.question.text}</blockquote>
          )}
          {view.reveal && (
            <div className="rounded-2xl bg-mint/15 border border-mint/40 p-3">
              Real answer: <b className="answer-text text-mint">{view.reveal.answer}</b>
            </div>
          )}

          {view.phase === 'lobby' && (
            <>
              <Settings view={view} send={send} />
              <Button
                tone="pink"
                big
                disabled={!view.canStart.ok}
                onClick={() => send({ kind: 'start' })}
                data-testid="start-game"
              >
                Start game
              </Button>
              {!view.canStart.ok && view.canStart.reason && (
                <p className="text-sun text-center" data-testid="start-hint">{view.canStart.reason}</p>
              )}
            </>
          )}

          {inGame && (
            <div className="grid grid-cols-2 gap-3">
              <Button tone="sun" big className="col-span-2" onClick={advance} data-testid="host-next">
                {nextLabel(view)} ▶
              </Button>
              {view.timer &&
                (view.paused ? (
                  <Button tone="mint" onClick={() => send({ kind: 'resume' })} data-testid="host-resume">
                    ▶ Resume
                  </Button>
                ) : (
                  <Button tone="sky" onClick={() => send({ kind: 'pause' })} data-testid="host-pause">
                    ❚❚ Pause
                  </Button>
                ))}
              <Button
                tone="ghost"
                className={view.timer ? '' : 'col-span-2'}
                onClick={() => (confirmRestart ? (send({ kind: 'restart' }), setConfirmRestart(false)) : setConfirmRestart(true))}
              >
                {confirmRestart ? 'Really? Click again' : '↺ Back to lobby'}
              </Button>
            </div>
          )}

          {view.phase === 'gameOver' && (
            <div className="flex flex-col gap-3">
              <p className="text-center text-xl">
                🏆 Winner:{' '}
                <b className="text-sun">
                  {view.standings
                    .filter((s) => s.rank === 1)
                    .map((s) => view.players.find((p) => p.id === s.playerId)?.name)
                    .join(' & ')}
                </b>
              </p>
              <Button tone="pink" big onClick={() => send({ kind: 'rematch' })} data-testid="host-rematch">
                Rematch (same players)
              </Button>
            </div>
          )}
        </section>

        {/* Players */}
        <section className="sticker rounded-3xl bg-plum p-5 flex flex-col gap-3" aria-label="Players">
          <h2 className="font-display text-xl text-sun">
            Players {contestants.length}/{MAX_PLAYERS}
          </h2>
          {contestants.length === 0 && <p className="text-cream/70">Nobody yet — share the QR code!</p>}
          <ul className="flex flex-col gap-2" data-testid="host-players">
            {[...contestants, ...waiting].map((p) => {
              const removable = p.status === 'waiting' || view.phase === 'lobby' || view.phase === 'gameOver';
              return (
                <li key={p.id} className="flex items-center gap-3 rounded-2xl bg-black/20 px-3 py-2">
                  <Avatar player={p} size={2.2} />
                  <div className="min-w-0 flex-1">
                    <div className="truncate" style={{ color: p.color }}>
                      {p.name}
                    </div>
                    <div className="text-xs text-cream/60">
                      {p.connected ? '● online' : '○ offline'}
                      {p.status === 'waiting' && ' · joins next game'}
                    </div>
                  </div>
                  <span className="font-display text-sun">{p.score.toLocaleString()}</span>
                  {removable && (
                    <button
                      className="text-cream/50 hover:text-tomato text-sm px-1"
                      aria-label={`Remove ${p.name}`}
                      title={`Remove ${p.name}`}
                      onClick={() => send({ kind: 'removePlayer', playerId: p.id })}
                    >
                      ✕
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      </main>
      <ConnectionBanner />
    </div>
  );
}

function Settings({ view, send }: { view: GameView; send: (a: HostAction) => Promise<unknown> }) {
  const s = view.settings;
  const seg = (active: boolean) =>
    `sticker rounded-xl px-3 py-2 font-display text-base ${active ? 'bg-sun text-ink' : 'bg-white/10 text-cream'}`;
  return (
    <div className="flex flex-col gap-4" aria-label="Game settings">
      <fieldset className="flex flex-col gap-2">
        <legend className="text-cream/70 mb-1">Questions</legend>
        <div className="flex gap-2">
          {QUESTION_COUNTS.map((n) => (
            <button
              key={n}
              className={seg(s.questionCount === n)}
              aria-pressed={s.questionCount === n}
              onClick={() => send({ kind: 'updateSettings', settings: { questionCount: n } })}
              data-testid={`questions-${n}`}
            >
              {n}
            </button>
          ))}
        </div>
      </fieldset>
      <div className="grid grid-cols-2 gap-4">
        <label className="flex flex-col gap-1">
          <span className="text-cream/70">Fib timer</span>
          <select
            className="sticker rounded-xl bg-cream text-ink px-3 py-2"
            value={s.submitSeconds}
            data-testid="submit-seconds"
            onChange={(e) => send({ kind: 'updateSettings', settings: { submitSeconds: Number(e.target.value) } })}
          >
            {SUBMIT_SECONDS_OPTIONS.map((n) => (
              <option key={n} value={n}>
                {n} seconds
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-cream/70">Voting timer</span>
          <select
            className="sticker rounded-xl bg-cream text-ink px-3 py-2"
            value={s.voteSeconds}
            data-testid="vote-seconds"
            onChange={(e) => send({ kind: 'updateSettings', settings: { voteSeconds: Number(e.target.value) } })}
          >
            {VOTE_SECONDS_OPTIONS.map((n) => (
              <option key={n} value={n}>
                {n} seconds
              </option>
            ))}
          </select>
        </label>
      </div>
    </div>
  );
}
