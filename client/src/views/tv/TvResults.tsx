import { useEffect } from 'react';
import type { GameView, PlayerView, StandingRow } from '../../../../shared/protocol';
import { Avatar } from '../../components/Avatar';
import { Confetti } from '../../components/Confetti';
import { useTween } from '../../hooks/useTween';
import { usePlayerMap } from '../../hooks/usePlayers';
import { sfx } from '../../lib/sfx';
import { Banner } from './shared';

function ScoreRow({
  row,
  player,
  max,
  index,
  compact,
  showMoves,
}: {
  row: StandingRow;
  player: PlayerView;
  max: number;
  index: number;
  compact: boolean;
  showMoves: boolean;
}) {
  const delay = 500 + index * 120;
  const score = useTween(row.score, 1400, delay);
  const from = row.score - row.delta;
  const width = useTween(Math.round((row.score / max) * 1000), 1400, delay);
  const moved = showMoves && row.previousRank !== null ? row.previousRank - row.rank : 0;
  return (
    <li
      className={`grid grid-cols-[4rem_5rem_14rem_1fr_9rem_6rem] items-center gap-[1rem] animate-rise ${compact ? 'text-[0.75rem]' : ''}`}
      style={{ animationDelay: `${index * 120}ms` }}
      data-testid="tv-score-row"
      data-player={player.name}
      data-score={row.score}
    >
      <span className={`font-display text-[2.6em] text-center ${row.rank === 1 ? 'text-sun' : 'text-cream/80'}`}>{row.rank}</span>
      <Avatar player={player} size={compact ? 2.6 : 4} className="text-[1.2rem]" />
      <span className="font-display text-[2em] truncate" style={{ color: player.color }}>
        {player.name}
      </span>
      <div className="h-[2.4em] rounded-full bg-black/40 overflow-hidden sticker border-[0.15rem]">
        <div
          className="h-full rounded-full"
          style={{ width: `${Math.max(from === 0 && row.score === 0 ? 0 : 2, width / 10)}%`, background: player.color }}
        />
      </div>
      <span className="font-display text-[2.4em] text-right tabular-nums">{score.toLocaleString()}</span>
      <span className="text-[1.5em] font-black">
        {row.delta > 0 && (
          <span className="text-mint animate-fly-up inline-block" style={{ animationDelay: `${delay}ms` }}>
            +{row.delta.toLocaleString()}
          </span>
        )}
        {moved > 0 && <span className="block text-sun text-[1.2rem]">▲ {moved}</span>}
        {moved < 0 && <span className="block text-tomato text-[1.2rem]">▼ {-moved}</span>}
      </span>
    </li>
  );
}

export function TvScoreboard({ view }: { view: GameView }) {
  const players = usePlayerMap(view);
  const max = Math.max(1, ...view.standings.map((s) => s.score));
  const hl = view.highlights;
  const last = view.round >= view.totalRounds;
  const compact = view.standings.length > 6;
  useEffect(() => sfx.pop(), []);
  return (
    <div className="h-full grid grid-cols-[2fr_1fr] gap-[3rem] px-[4rem] pb-[2.5rem]">
      <section className="flex flex-col gap-[1.2rem]">
        <div>
          <Banner tone="sun">Scores after question {view.round}</Banner>
        </div>
        <ol className={`flex flex-col mt-[0.5rem] ${compact ? 'gap-[0.5rem]' : 'gap-[0.9rem]'}`} data-testid="tv-scoreboard">
          {view.standings.map((row, i) => {
            const p = players.get(row.playerId);
            return p ? (
              <ScoreRow key={row.playerId} row={row} player={p} max={max} index={i} compact={compact} showMoves={view.round > 1} />
            ) : null;
          })}
        </ol>
      </section>
      <aside className="flex flex-col gap-[1.5rem] pt-[1rem]">
        <div className="sticker rounded-[1.6rem] bg-pink text-white p-[1.6rem] animate-pop-in [animation-delay:600ms]">
          <div className="font-display text-[1.8rem]">🎭 Biggest bluff</div>
          {hl?.biggestBluff ? (
            <>
              <div className="answer-text text-[2.2rem] font-black mt-[0.4rem]">“{hl.biggestBluff.text}”</div>
              <div className="text-[1.5rem] mt-[0.6rem]">
                by <b>{hl.biggestBluff.authorIds.map((id) => players.get(id)?.name).join(' & ')}</b> — fooled{' '}
                {hl.biggestBluff.fooledCount} player{hl.biggestBluff.fooledCount === 1 ? '' : 's'}
              </div>
            </>
          ) : (
            <div className="text-[1.6rem] mt-[0.4rem]">Nobody got fooled this time. Tough crowd!</div>
          )}
        </div>
        <div className="sticker rounded-[1.6rem] bg-mint text-ink p-[1.6rem] animate-pop-in [animation-delay:900ms]">
          <div className="font-display text-[1.8rem]">🔍 Truth detectors</div>
          {hl && hl.truthDetectorIds.length > 0 ? (
            <div className="flex flex-wrap gap-[1rem] mt-[0.8rem]">
              {hl.truthDetectorIds.map((id) => {
                const p = players.get(id);
                return p ? <Avatar key={id} player={p} size={3.6} showName nameClassName="text-ink" className="text-[1.2rem]" /> : null;
              })}
            </div>
          ) : (
            <div className="text-[1.6rem] mt-[0.4rem]">Nobody! The fibs were too good.</div>
          )}
        </div>
        <div className="mt-auto text-center text-[1.6rem] text-cream/70">
          {last ? 'Final results are next!' : 'Next question coming up…'}
        </div>
      </aside>
    </div>
  );
}

export function TvGameOver({ view }: { view: GameView }) {
  const players = usePlayerMap(view);
  const winners = view.standings.filter((s) => s.rank === 1);
  const rest = view.standings.filter((s) => s.rank !== 1);
  useEffect(() => sfx.fanfare(), []);
  return (
    <div className="h-full flex flex-col items-center px-[4rem] pb-[3rem] gap-[1.4rem]" data-testid="tv-game-over">
      <Confetti />
      <div className="font-display text-[2.2rem] text-cream/80 animate-rise">And the Fib Factory champion is…</div>
      <div className="flex flex-wrap justify-center gap-[4rem] items-center mt-[2.6rem] animate-pop-in [animation-delay:700ms]">
        {winners.map((w) => {
          const p = players.get(w.playerId);
          return p ? (
            <div key={w.playerId} className="flex items-center gap-[2rem]" data-testid="tv-winner">
              <div className="relative">
                <div className="absolute -top-[3rem] left-1/2 -translate-x-1/2 text-[3.6rem] leading-none animate-wobble">👑</div>
                <Avatar player={p} size={winners.length > 1 ? 5 : 7} className="text-[1.5rem]" />
              </div>
              <div>
                <div className="font-display text-[4.6rem] leading-none text-outline shadow-pop" style={{ color: p.color }}>
                  {p.name}
                </div>
                <div className="font-display text-[2.6rem] text-sun">{w.score.toLocaleString()} pts</div>
              </div>
            </div>
          ) : null;
        })}
      </div>
      <div className="grid grid-cols-[1fr_1.25fr] gap-[3rem] w-full min-h-0 flex-1">
        <ol
          className={`grid content-start gap-[0.5rem] animate-rise [animation-delay:1.2s] ${rest.length > 5 ? 'grid-cols-2' : 'grid-cols-1'}`}
          data-testid="tv-final-standings"
        >
          {rest.map((r) => {
            const p = players.get(r.playerId);
            return p ? (
              <li key={r.playerId} className="flex items-center gap-[0.8rem] rounded-[1rem] bg-black/30 px-[1rem] py-[0.35rem] text-[1.5rem]">
                <span className="font-display w-[2.4rem] text-center">{r.rank}</span>
                <Avatar player={p} size={2.2} className="text-[1rem]" />
                <span className="flex-1 truncate" style={{ color: p.color }}>
                  {p.name}
                </span>
                <span className="font-display">{r.score.toLocaleString()}</span>
              </li>
            ) : null;
          })}
        </ol>
        <div className="grid grid-cols-2 gap-[1rem] content-start">
          {view.awards.map((a, i) => (
            <div
              key={a.id}
              className="sticker rounded-[1.2rem] bg-plum px-[1.2rem] py-[0.7rem] animate-pop-in"
              style={{ animationDelay: `${1500 + i * 250}ms` }}
              data-testid="tv-award"
            >
              <div className="font-display text-[1.4rem] text-sun">
                {a.emoji} {a.title}
              </div>
              <div className="text-[1.5rem] truncate">{a.playerIds.map((id) => players.get(id)?.name).join(' & ')}</div>
              <div className="text-[1.1rem] text-cream/70">{a.description}</div>
            </div>
          ))}
        </div>
      </div>
      <div className="text-[1.4rem] text-cream/70">Rematch? The host can start a new game with the same players.</div>
    </div>
  );
}
