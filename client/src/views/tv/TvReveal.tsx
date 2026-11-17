import { useEffect } from 'react';
import { POINTS, type GameView, type RevealEntry } from '../../../../shared/protocol';
import { Avatar } from '../../components/Avatar';
import { usePlayerMap } from '../../hooks/usePlayers';
import { sfx } from '../../lib/sfx';
import { TvQuestionCard } from './shared';

/**
 * The reveal is driven by the server: `reveal.step` says which ballot entry is
 * in the spotlight. Fibs that fooled someone come first; the truth is last.
 */
export function TvReveal({ view }: { view: GameView }) {
  const reveal = view.reveal!;
  const id = reveal.order[reveal.step];
  const entry = reveal.entries.find((e) => e.id === id);
  if (!entry) return null;
  return (
    <div className="h-full flex flex-col px-[5rem] pb-[2.5rem] gap-[1.5rem]">
      <div className="pt-[0.5rem] opacity-90">
        <TvQuestionCard view={view} size="sm" />
      </div>
      {entry.isTruth ? (
        <TruthStep key={entry.id} view={view} entry={entry} />
      ) : (
        <FibStep key={entry.id} view={view} entry={entry} />
      )}
    </div>
  );
}

function FibStep({ view, entry }: { view: GameView; entry: RevealEntry }) {
  const players = usePlayerMap(view);
  const author = players.get(entry.authorIds[0] ?? '');
  const points = entry.voterIds.length * POINTS.perPlayerFooled;
  useEffect(() => {
    sfx.whoosh();
    const t = setTimeout(sfx.stamp, 1800);
    return () => clearTimeout(t);
  }, []);
  return (
    <div className="flex-1 flex flex-col items-center justify-center gap-[2rem]" data-testid="tv-reveal-fib">
      <div className="relative animate-pop-in">
        <div className="sticker rounded-[2rem] bg-cream text-ink px-[4rem] py-[2.2rem] answer-text font-black text-[4.6rem] leading-[1.05] min-w-[34rem] max-w-[66rem] text-center rotate-[-1deg]">
          {entry.text}
        </div>
        <div className="absolute -top-[3.4rem] -right-[6rem] text-tomato text-[4rem] animate-stamp [animation-delay:1.8s]">
          <span className="stamp bg-ink/80">FIB!</span>
        </div>
      </div>

      <div className="flex items-center gap-[1.5rem] text-[2rem]">
        <span className="text-cream/80 animate-rise [animation-delay:400ms]">Fooled:</span>
        {entry.voterIds.map((vid, i) => {
          const p = players.get(vid);
          return p ? (
            <div key={vid} className="animate-pop-in" style={{ animationDelay: `${600 + i * 220}ms` }}>
              <Avatar player={p} size={5} showName className="text-[1.3rem]" />
            </div>
          ) : null;
        })}
      </div>

      {author && (
        <div className="flex items-center gap-[1.5rem] animate-rise [animation-delay:2.2s]">
          <span className="text-[2.2rem] text-cream/90">Fib written by</span>
          <Avatar player={author} size={5.5} className="text-[1.4rem]" />
          <span className="font-display text-[3.2rem]" style={{ color: author.color }}>
            {author.name}
          </span>
          <span className="font-display text-[3.4rem] text-sun animate-fly-up [animation-delay:2.6s]" data-testid="tv-fib-points">
            +{points.toLocaleString()}
          </span>
        </div>
      )}
    </div>
  );
}

function TruthStep({ view, entry }: { view: GameView; entry: RevealEntry }) {
  const players = usePlayerMap(view);
  const reveal = view.reveal!;
  const unbought = reveal.entries.filter((e) => !e.isTruth && e.voterIds.length === 0);
  useEffect(() => {
    sfx.whoosh();
    const t = setTimeout(sfx.truth, 1300);
    return () => clearTimeout(t);
  }, []);
  return (
    <div className="flex-1 flex flex-col items-center justify-center gap-[1.6rem]" data-testid="tv-reveal-truth">
      <div className="text-[2rem] text-cream/80 animate-rise">And the truth is…</div>
      <div className="relative animate-pop-in [animation-delay:600ms]">
        <div
          className="sticker rounded-[2rem] bg-sun text-ink px-[4rem] py-[2.2rem] answer-text font-black text-[5rem] leading-[1.05] min-w-[34rem] max-w-[66rem] text-center animate-glow"
          data-testid="tv-truth"
        >
          {entry.text}
        </div>
        <div className="absolute -top-[3.4rem] -right-[7rem] text-mint text-[3.6rem] animate-stamp [animation-delay:1.3s]">
          <span className="stamp bg-ink/80">TRUTH!</span>
        </div>
      </div>
      {reveal.fact && <p className="text-[1.7rem] text-cream/90 max-w-[60rem] text-center animate-rise [animation-delay:2.4s]">💡 {reveal.fact}</p>}

      <div className="flex items-start gap-[1.6rem] min-h-[9rem] animate-rise [animation-delay:1.6s]">
        {entry.voterIds.length === 0 ? (
          <div className="font-display text-[2.4rem] text-tomato">Nobody found the truth! 😱</div>
        ) : (
          entry.voterIds.map((vid, i) => {
            const p = players.get(vid);
            return p ? (
              <div key={vid} className="flex flex-col items-center gap-[0.4rem] animate-pop-in" style={{ animationDelay: `${1800 + i * 200}ms` }}>
                <Avatar player={p} size={5} showName className="text-[1.3rem]" />
                <span className="font-display text-[1.8rem] text-mint animate-fly-up" style={{ animationDelay: `${2200 + i * 200}ms` }}>
                  +{POINTS.truth.toLocaleString()}
                </span>
              </div>
            ) : null;
          })
        )}
      </div>

      {unbought.length > 0 && (
        <div className="flex flex-wrap justify-center items-center gap-[0.8rem] text-[1.3rem] animate-rise [animation-delay:3s]">
          <span className="text-cream/60">Fibs nobody bought:</span>
          {unbought.map((e) => {
            const a = players.get(e.authorIds[0] ?? '');
            return (
              <span key={e.id} className="rounded-full bg-white/10 px-[0.9rem] py-[0.2rem]">
                <span className="answer-text">{e.text}</span>
                {a && <span style={{ color: a.color }}> — {a.name}</span>}
              </span>
            );
          })}
        </div>
      )}
    </div>
  );
}
