import { useEffect, useRef, useState, type FormEvent } from 'react';
import {
  MAX_FIB_LENGTH,
  MAX_NAME_LENGTH,
  type GameView,
  type MeView,
  type PlayerRoundResult,
  type PlayerView as PV,
} from '../../../../shared/protocol';
import { Avatar } from '../../components/Avatar';
import { Button } from '../../components/Button';
import { ConnectionBanner } from '../../components/ConnectionBanner';
import { Logo } from '../../components/Logo';
import { PrefsControls } from '../../components/PrefsControls';
import { MessageScreen } from '../../components/Screen';
import { TimerBar } from '../../components/TimerRing';
import { usePlayerMap } from '../../hooks/usePlayers';
import { LAST_NAME_KEY, storage } from '../../lib/storage';
import { requestWithError, useGame } from '../../store';

export function PlayerView({ code }: { code: string }) {
  const { connect, disconnect, view, status, welcomed } = useGame();

  useEffect(() => {
    connect(code, 'player');
    return () => disconnect();
  }, [code, connect, disconnect]);

  if (status === 'notFound') {
    return (
      <MessageScreen title={`No game called ${code}`} emoji="🤷">
        <p className="text-cream/80">Double-check the room code on the TV.</p>
      </MessageScreen>
    );
  }
  if (!view || !welcomed) return <MessageScreen title="Finding your seat…" emoji="⚙️" />;

  return (
    <div className="min-h-dvh bg-factory flex flex-col">
      {view.me ? <Header view={view} me={view.me} /> : null}
      <main className="flex-1 flex flex-col w-full max-w-lg mx-auto px-4 py-5 gap-5">
        {!view.me ? <JoinForm view={view} /> : <PlayerGame view={view} me={view.me} />}
      </main>
      <footer className="flex justify-center pb-4 text-sm">
        <PrefsControls showSound={false} />
      </footer>
      <ConnectionBanner />
      {view.paused && view.me?.status === 'contestant' && (
        <div className="fixed inset-0 z-30 bg-ink/85 flex flex-col items-center justify-center gap-3" role="status">
          <div className="font-display text-5xl text-sun">PAUSED</div>
          <p className="text-cream/80">The host hit pause. Hang tight!</p>
        </div>
      )}
    </div>
  );
}

function Header({ view, me }: { view: GameView; me: MeView }) {
  const self = view.players.find((p) => p.id === me.playerId);
  return (
    <header className="flex items-center gap-3 px-4 py-3 bg-black/25 border-b border-white/10">
      {self && <Avatar player={self} size={2.4} className="text-base" />}
      <div className="min-w-0">
        <div className="truncate text-lg" style={{ color: self?.color }} data-testid="my-name">
          {me.name}
        </div>
        <div className="text-xs text-cream/60">Room {view.code}</div>
      </div>
      <div className="ml-auto text-right">
        <div className="font-display text-2xl text-sun" data-testid="my-score">
          {(self?.score ?? 0).toLocaleString()}
        </div>
        <div className="text-xs text-cream/60">points</div>
      </div>
    </header>
  );
}

function JoinForm({ view }: { view: GameView }) {
  const [name, setName] = useState(() => storage.get(LAST_NAME_KEY) ?? '');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const inProgress = view.phase !== 'lobby';

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const res = await requestWithError({ type: 'join', name });
    setBusy(false);
    if (!res.ok) return setError(res.message);
    storage.set(LAST_NAME_KEY, name.trim());
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-5 pt-6 animate-rise">
      <Logo className="text-4xl self-center" />
      <div className="text-center">
        <div className="text-cream/70">Joining room</div>
        <div className="font-display text-4xl text-sun tracking-widest">{view.code}</div>
      </div>
      {inProgress && (
        <p className="rounded-2xl bg-sky/20 border border-sky/50 p-3 text-center">
          A game is already running. Join now and you'll be in the <b>next</b> game!
        </p>
      )}
      <label className="flex flex-col gap-2 text-lg">
        Your name
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={MAX_NAME_LENGTH}
          autoComplete="nickname"
          enterKeyHint="go"
          placeholder="e.g. Grandma Jo"
          aria-label="Your name"
          className="sticker rounded-2xl bg-cream text-ink text-2xl px-4 py-3 placeholder:text-ink/30"
        />
      </label>
      {error && (
        <p className="text-white bg-tomato sticker rounded-xl px-3 py-2 animate-shake" role="alert">
          {error}
        </p>
      )}
      <Button type="submit" tone="pink" big disabled={busy || !name.trim()} data-testid="join-button">
        {busy ? 'Joining…' : "Let's go!"}
      </Button>
    </form>
  );
}

function PlayerGame({ view, me }: { view: GameView; me: MeView }) {
  if (me.status === 'waiting') {
    return (
      <Centered emoji="⏳" title="You're on the list!">
        A game is in progress. You'll jump in when the next game starts — enjoy the show on the TV!
      </Centered>
    );
  }
  switch (view.phase) {
    case 'lobby':
      return <Lobby view={view} />;
    case 'question':
      return (
        <div className="flex flex-col gap-4 animate-rise">
          <RoundTag view={view} />
          <QuestionCard text={view.question?.text} />
          <p className="text-center text-sun text-xl animate-pulse-fast">Get your fibbing brain ready…</p>
        </div>
      );
    case 'submission':
      return <Submission view={view} me={me} />;
    case 'voting':
      return <Voting view={view} me={me} />;
    case 'reveal':
      return <Reveal view={view} me={me} />;
    case 'scoreboard':
      return <MyStanding view={view} me={me} />;
    case 'gameOver':
      return <GameOver view={view} me={me} />;
  }
}

function Centered({ emoji, title, children }: { emoji: string; title: string; children?: React.ReactNode }) {
  return (
    <div className="flex-1 flex flex-col items-center justify-center text-center gap-4 py-8 animate-rise">
      <div className="text-7xl animate-float" aria-hidden="true">
        {emoji}
      </div>
      <h2 className="font-display text-2xl text-sun">{title}</h2>
      {children && <div className="text-lg text-cream/85 max-w-sm">{children}</div>}
    </div>
  );
}

function RoundTag({ view }: { view: GameView }) {
  return (
    <div className="self-start rounded-full bg-pink sticker px-3 py-1 font-display text-sm text-white">
      Question {view.round} / {view.totalRounds}
    </div>
  );
}

function QuestionCard({ text }: { text?: string }) {
  return (
    <div className="sticker rounded-3xl bg-cream text-ink p-5 text-xl leading-snug" data-testid="question-text">
      {text}
    </div>
  );
}

function Lobby({ view }: { view: GameView }) {
  const players = view.players.filter((p) => p.status === 'contestant');
  return (
    <Centered emoji="🎉" title="You're in!">
      <p>Watch the TV. The host will start when everyone's here.</p>
      <div className="flex flex-wrap justify-center gap-3 mt-5 text-base">
        {players.map((p) => (
          <Avatar key={p.id} player={p} size={2.6} showName className="animate-pop-in" />
        ))}
      </div>
    </Centered>
  );
}

function Submission({ view, me }: { view: GameView; me: MeView }) {
  const [text, setText] = useState(me.fib ?? '');
  const [editing, setEditing] = useState(!me.fib);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing) inputRef.current?.focus();
  }, [editing]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const res = await requestWithError({ type: 'submitFib', text });
    setBusy(false);
    if (!res.ok) return setError(res.message);
    setEditing(false);
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-3">
        <RoundTag view={view} />
      </div>
      <TimerBar timer={view.timer} />
      <QuestionCard text={view.question?.text} />
      {me.fib && !editing ? (
        <div className="sticker rounded-3xl bg-mint text-ink p-5 flex flex-col gap-3 animate-pop-in" data-testid="fib-locked">
          <div className="font-display text-lg">✓ Fib locked in!</div>
          <div className="answer-text text-2xl font-black">{me.fib}</div>
          <p className="text-sm">You can change it until time runs out.</p>
          <Button tone="ghost" className="!text-ink !border-ink/40 !bg-white/40" onClick={() => setEditing(true)}>
            Change my fib
          </Button>
        </div>
      ) : (
        <form onSubmit={submit} className="flex flex-col gap-3">
          <label className="text-lg" htmlFor="fib-input">
            Write a fake answer that sounds <span className="text-sun">totally real</span>:
          </label>
          <input
            id="fib-input"
            ref={inputRef}
            value={text}
            onChange={(e) => setText(e.target.value)}
            maxLength={MAX_FIB_LENGTH}
            autoComplete="off"
            autoCorrect="off"
            enterKeyHint="send"
            placeholder="Your fib…"
            className={`sticker rounded-2xl bg-cream text-ink text-2xl px-4 py-3 uppercase placeholder:normal-case placeholder:text-ink/30 ${
              error ? 'animate-shake' : ''
            }`}
            data-testid="fib-input"
          />
          <div className="text-right text-sm text-cream/60">
            {text.trim().length}/{MAX_FIB_LENGTH}
          </div>
          {error && (
            <p className="text-white bg-tomato sticker rounded-xl px-3 py-2" role="alert" data-testid="fib-error">
              {error}
            </p>
          )}
          <Button type="submit" tone="pink" big disabled={busy || !text.trim()} data-testid="fib-submit">
            {busy ? 'Sending…' : me.fib ? 'Update fib' : 'Submit fib'}
          </Button>
        </form>
      )}
      <p className="text-center text-cream/60 text-sm">
        {view.submittedIds.length} of {view.players.filter((p) => p.status === 'contestant').length} fibs submitted
      </p>
    </div>
  );
}

function Voting({ view, me }: { view: GameView; me: MeView }) {
  const [selected, setSelected] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const ballot = view.ballot ?? [];

  if (me.voteId) {
    const choice = ballot.find((b) => b.id === me.voteId);
    return (
      <div className="flex flex-col gap-4">
        <TimerBar timer={view.timer} />
        <div className="sticker rounded-3xl bg-sky text-ink p-6 flex flex-col gap-2 items-center text-center animate-pop-in" data-testid="vote-locked">
          <div className="text-5xl" aria-hidden="true">🔒</div>
          <div className="font-display text-xl">Vote locked in!</div>
          <div className="answer-text text-2xl font-black">{choice?.text}</div>
          <p>Fingers crossed it's the truth…</p>
        </div>
      </div>
    );
  }

  async function lockIn() {
    if (!selected) return;
    setBusy(true);
    setError(null);
    const res = await requestWithError({ type: 'vote', choiceId: selected });
    setBusy(false);
    if (!res.ok) setError(res.message);
  }

  return (
    <div className="flex flex-col gap-4 pb-24">
      <div className="flex items-center gap-3">
        <RoundTag view={view} />
      </div>
      <TimerBar timer={view.timer} />
      <p className="text-cream/90 text-base leading-snug">{view.question?.text}</p>
      <h2 className="font-display text-2xl text-sun">Which one is the truth?</h2>
      <div className="flex flex-col gap-3" role="radiogroup" aria-label="Answers">
        {ballot.map((b) => {
          const own = b.id === me.ownBallotId;
          const isSel = selected === b.id;
          return (
            <button
              key={b.id}
              role="radio"
              aria-checked={isSel}
              disabled={own}
              onClick={() => setSelected(b.id)}
              data-testid="ballot-option"
              data-text={b.text}
              className={`sticker rounded-2xl px-4 py-3 text-left answer-text text-xl transition-transform ${
                own ? 'bg-white/10 text-cream/50' : isSel ? 'bg-sun text-ink scale-[1.02]' : 'bg-cream text-ink'
              }`}
            >
              {b.text}
              {own && <span className="block text-xs normal-case font-black text-pink">That's your fib — no voting for yourself!</span>}
            </button>
          );
        })}
      </div>
      {error && (
        <p className="text-white bg-tomato sticker rounded-xl px-3 py-2" role="alert">
          {error}
        </p>
      )}
      <div className="fixed bottom-0 inset-x-0 p-4 bg-gradient-to-t from-ink via-ink/95 to-transparent">
        <div className="max-w-lg mx-auto">
          <Button tone="pink" big className="w-full" disabled={!selected || busy} onClick={lockIn} data-testid="vote-submit">
            {busy ? 'Locking…' : selected ? 'Lock in my vote' : 'Tap an answer'}
          </Button>
        </div>
      </div>
    </div>
  );
}

function Reveal({ view, me }: { view: GameView; me: MeView }) {
  const players = usePlayerMap(view);
  const reveal = view.reveal;
  if (!reveal) return null;
  const truthShown = reveal.step >= reveal.order.length - 1;
  if (!truthShown) {
    return (
      <Centered emoji="📺" title="Eyes on the TV!">
        Who fell for which fib? The truth is coming…
      </Centered>
    );
  }
  const r = reveal.results[me.playerId];
  return <RoundResultCard result={r} players={players} answer={reveal.answer} />;
}

function names(ids: string[], players: Map<string, PV>) {
  const list = ids.map((id) => players.get(id)?.name ?? '?');
  return list.length <= 1 ? list.join('') : `${list.slice(0, -1).join(', ')} & ${list.at(-1)}`;
}

function RoundResultCard({
  result,
  players,
  answer,
}: {
  result: PlayerRoundResult | undefined;
  players: Map<string, PV>;
  answer: string;
}) {
  if (!result) return null;
  return (
    <div className="flex flex-col gap-4 animate-rise" data-testid="round-result">
      <div className="text-center">
        <div className="text-cream/70">The truth was</div>
        <div className="answer-text font-display text-3xl text-mint">{answer}</div>
      </div>
      <div className="sticker rounded-3xl bg-plum p-6 text-center flex flex-col gap-3">
        <div className={`font-display text-6xl ${result.total > 0 ? 'text-sun' : 'text-cream/50'} animate-pop-in`} data-testid="round-points">
          +{result.total.toLocaleString()}
        </div>
        {result.foundTruth && <p className="text-mint text-xl">🔍 You found the truth! +1,000</p>}
        {result.fooledBy && <p className="text-tomato text-xl">🙈 You fell for {players.get(result.fooledBy)?.name}'s fib</p>}
        {!result.votedFor && <p className="text-cream/70">You didn't vote this time.</p>}
        {result.fooledIds.length > 0 && (
          <p className="text-pink text-xl">
            🎭 You fooled {names(result.fooledIds, players)}! +{result.fibPoints.toLocaleString()}
          </p>
        )}
        {result.submitted && result.fooledIds.length === 0 && <p className="text-cream/70">Nobody fell for your fib.</p>}
        {!result.submitted && <p className="text-cream/70">You didn't submit a fib.</p>}
      </div>
    </div>
  );
}

function MyStanding({ view, me }: { view: GameView; me: MeView }) {
  const row = view.standings.find((s) => s.playerId === me.playerId);
  if (!row) return null;
  const moved = row.previousRank !== null ? row.previousRank - row.rank : 0;
  return (
    <Centered emoji={row.rank === 1 ? '👑' : moved > 0 ? '🚀' : '📊'} title={`You're #${row.rank}`}>
      <div className="font-display text-5xl text-sun my-2">{row.score.toLocaleString()}</div>
      {row.delta > 0 && <div className="text-mint text-xl">+{row.delta.toLocaleString()} this round</div>}
      {moved > 0 && <div className="text-pink">Up {moved} place{moved > 1 ? 's' : ''}!</div>}
      <p className="mt-4 text-cream/70">
        {view.round >= view.totalRounds ? 'Final results coming up…' : 'Next question coming up…'}
      </p>
    </Centered>
  );
}

function GameOver({ view, me }: { view: GameView; me: MeView }) {
  const row = view.standings.find((s) => s.playerId === me.playerId);
  const myAwards = view.awards.filter((a) => a.playerIds.includes(me.playerId));
  const won = row?.rank === 1;
  return (
    <div className="flex flex-col gap-4 items-center text-center animate-rise">
      <div className="text-8xl animate-wobble" aria-hidden="true">
        {won ? '🏆' : '🎬'}
      </div>
      <h2 className="font-display text-3xl text-sun" data-testid="final-rank">
        {won ? 'You win!' : `You finished #${row?.rank}`}
      </h2>
      <div className="font-display text-4xl">{row?.score.toLocaleString()} pts</div>
      {myAwards.map((a) => (
        <div key={a.id} className="sticker rounded-2xl bg-pink text-white px-4 py-3 w-full">
          <div className="text-2xl">
            {a.emoji} {a.title}
          </div>
          <div className="text-sm">{a.description}</div>
        </div>
      ))}
      <p className="text-cream/70 mt-4">Waiting for the host to start a rematch…</p>
    </div>
  );
}
