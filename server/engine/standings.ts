import type { Award, PlayerRoundResult, RoundHighlights, StandingRow } from '../../shared/protocol';
import type { BallotEntry, GameState, ServerPlayer } from './types';

interface Rankable {
  id: string;
  name: string;
  score: number;
}

/** Sort by score (desc), then name for a stable display order. */
export function sortForStandings<T extends Rankable>(players: readonly T[]): T[] {
  return players
    .slice()
    .sort(
      (a, b) =>
        b.score - a.score ||
        a.name.localeCompare(b.name, 'en', { sensitivity: 'base' }) ||
        a.id.localeCompare(b.id),
    );
}

/** Competition ranking: equal scores share a rank and the next rank is skipped (1, 2, 2, 4). */
export function rankMap(players: readonly Rankable[]): Record<string, number> {
  const sorted = sortForStandings(players);
  const ranks: Record<string, number> = {};
  sorted.forEach((p, i) => {
    const prev = sorted[i - 1];
    ranks[p.id] = prev && prev.score === p.score ? ranks[prev.id]! : i + 1;
  });
  return ranks;
}

export function computeStandings(
  players: readonly ServerPlayer[],
  scoresBefore: Record<string, number> | null,
): StandingRow[] {
  const contestants = players.filter((p) => p.status === 'contestant');
  const ranks = rankMap(contestants);
  const prevRanks = scoresBefore
    ? rankMap(contestants.map((p) => ({ ...p, score: scoresBefore[p.id] ?? 0 })))
    : null;
  return sortForStandings(contestants).map((p) => ({
    playerId: p.id,
    rank: ranks[p.id]!,
    score: p.score,
    delta: scoresBefore ? p.score - (scoresBefore[p.id] ?? 0) : 0,
    previousRank: prevRanks ? prevRanks[p.id]! : null,
  }));
}

export function roundHighlights(
  ballot: readonly BallotEntry[],
  results: Record<string, PlayerRoundResult>,
): RoundHighlights {
  let biggest: RoundHighlights['biggestBluff'] = null;
  for (const entry of ballot) {
    if (entry.isTruth) continue;
    const fooled = new Set(entry.authorIds.flatMap((a) => results[a]?.fooledIds ?? [])).size;
    if (fooled > 0 && (!biggest || fooled > biggest.fooledCount)) {
      biggest = { authorIds: entry.authorIds, text: entry.text, fooledCount: fooled };
    }
  }
  return {
    biggestBluff: biggest,
    truthDetectorIds: Object.values(results)
      .filter((r) => r.foundTruth)
      .map((r) => r.playerId),
  };
}

function leaders(counts: Map<string, number>): { ids: string[]; value: number } {
  let best = 0;
  for (const v of counts.values()) best = Math.max(best, v);
  if (best === 0) return { ids: [], value: 0 };
  return { ids: [...counts].filter(([, v]) => v === best).map(([id]) => id), value: best };
}

/** Light-hearted end-of-game awards derived from round history. */
export function computeAwards(state: GameState): Award[] {
  const ids = state.players.filter((p) => p.status === 'contestant').map((p) => p.id);
  const fooledOthers = new Map(ids.map((id) => [id, 0]));
  const truths = new Map(ids.map((id) => [id, 0]));
  const gotFooled = new Map(ids.map((id) => [id, 0]));
  const bestSingle = new Map(ids.map((id) => [id, 0]));
  for (const round of state.history) {
    for (const r of Object.values(round.results)) {
      if (!fooledOthers.has(r.playerId)) continue;
      fooledOthers.set(r.playerId, fooledOthers.get(r.playerId)! + r.fooledIds.length);
      bestSingle.set(r.playerId, Math.max(bestSingle.get(r.playerId)!, r.fooledIds.length));
      if (r.foundTruth) truths.set(r.playerId, truths.get(r.playerId)! + 1);
      if (r.fooledBy) gotFooled.set(r.playerId, gotFooled.get(r.playerId)! + 1);
    }
  }
  const awards: Award[] = [];
  const add = (
    id: string,
    title: string,
    emoji: string,
    counts: Map<string, number>,
    describe: (n: number) => string,
  ) => {
    const { ids: winners, value } = leaders(counts);
    if (winners.length) awards.push({ id, title, emoji, description: describe(value), playerIds: winners, value });
  };
  add('manipulator', 'Master Manipulator', '🎭', fooledOthers, (n) => `Fooled opponents ${n} time${n === 1 ? '' : 's'}`);
  add('factChecker', 'Human Fact Checker', '🔍', truths, (n) => `Found the truth ${n} time${n === 1 ? '' : 's'}`);
  add('believer', 'Professional Believer', '🙈', gotFooled, (n) => `Fell for ${n} fib${n === 1 ? '' : 's'}`);
  add('oneHit', 'Fib of the Night', '🏆', bestSingle, (n) => `Fooled ${n} player${n === 1 ? '' : 's'} with a single fib`);
  return awards;
}
