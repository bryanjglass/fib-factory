import { POINTS, type PlayerRoundResult } from '../../shared/protocol';
import type { BallotEntry } from './types';

/**
 * Pure scoring function for one round.
 *
 * - Voting for the truth: +1000.
 * - Each *opponent* who votes for your fib: +500.
 * - Votes for your own fib (which the engine never accepts anyway) earn nothing.
 * - Votes from non-contestants or for unknown ballot entries are ignored.
 */
export function scoreRound(
  ballot: readonly BallotEntry[],
  votes: Readonly<Record<string, string>>,
  contestantIds: readonly string[],
  fibAuthors: ReadonlySet<string>,
): Record<string, PlayerRoundResult> {
  const results: Record<string, PlayerRoundResult> = {};
  const contestants = new Set(contestantIds);
  for (const id of contestantIds) {
    results[id] = {
      playerId: id,
      submitted: fibAuthors.has(id),
      votedFor: null,
      foundTruth: false,
      fooledBy: null,
      truthPoints: 0,
      fibPoints: 0,
      fooledIds: [],
      total: 0,
    };
  }
  const byId = new Map(ballot.map((e) => [e.id, e]));
  // Iterate in a stable order so results are deterministic.
  for (const voterId of Object.keys(votes).sort()) {
    const voter = results[voterId];
    const entry = byId.get(votes[voterId]!);
    if (!voter || !entry) continue;
    if (entry.authorIds.includes(voterId)) continue; // never reward self-votes
    voter.votedFor = entry.id;
    if (entry.isTruth) {
      voter.foundTruth = true;
      voter.truthPoints += POINTS.truth;
      continue;
    }
    voter.fooledBy = entry.authorIds[0] ?? null;
    for (const authorId of entry.authorIds) {
      const author = results[authorId];
      if (!author || !contestants.has(authorId)) continue;
      author.fibPoints += POINTS.perPlayerFooled;
      author.fooledIds.push(voterId);
    }
  }
  for (const r of Object.values(results)) r.total = r.truthPoints + r.fibPoints;
  return results;
}
