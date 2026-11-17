/**
 * Builds the per-viewer snapshot sent over the wire.
 *
 * This is the single choke point that keeps secrets secret:
 *  - the real answer and which ballot entry is the truth are only included
 *    once the round has been scored (reveal/scoreboard phases);
 *  - fib authors and votes are hidden until the reveal;
 *  - fib *contents* are hidden until voting (and then only as anonymous text);
 *  - tokens are never included.
 */
import type { GameView, MeView, PlayerView, RevealView, Role } from '../../shared/protocol';
import { canStart } from './game';
import { computeAwards, computeStandings, roundHighlights } from './standings';
import type { GameState, QuestionBank } from './types';

export interface Viewer {
  role: Role;
  playerId: string | null;
}

const QUESTION_PHASES = new Set(['question', 'submission', 'voting', 'reveal', 'scoreboard']);

export function buildView(s: GameState, viewer: Viewer, now: number, bank: QuestionBank, hostConnected: boolean): GameView {
  const round = s.round;
  const question = round ? bank.get(round.questionId) : undefined;
  const showQuestion = QUESTION_PHASES.has(s.phase) && !!question;
  const scored = !!round?.scored && (s.phase === 'reveal' || s.phase === 'scoreboard');

  const players: PlayerView[] = s.players
    .slice()
    .sort((a, b) => a.joinedAt - b.joinedAt)
    .map((p) => ({
      id: p.id,
      name: p.name,
      color: p.color,
      avatar: p.avatar,
      score: p.score,
      connected: p.connected,
      status: p.status,
    }));

  let reveal: RevealView | null = null;
  if (scored && round?.ballot && round.results && question) {
    const truth = round.ballot.find((e) => e.isTruth)!;
    reveal = {
      truthId: truth.id,
      answer: truth.text,
      fact: question.fact ?? null,
      entries: round.ballot.map((e) => ({
        id: e.id,
        text: e.text,
        isTruth: e.isTruth,
        authorIds: e.authorIds,
        voterIds: Object.keys(round.votes)
          .filter((pid) => round.votes[pid] === e.id)
          .sort(),
      })),
      order: round.revealOrder,
      step: round.revealStep,
      results: round.results,
    };
  }

  let me: MeView | null = null;
  if (viewer.role === 'player' && viewer.playerId) {
    const p = s.players.find((x) => x.id === viewer.playerId);
    if (p) {
      const own = round?.ballot?.find((e) => e.authorIds.includes(p.id));
      me = {
        playerId: p.id,
        name: p.name,
        status: p.status,
        fib: round?.fibs[p.id] ?? null,
        voteId: round?.votes[p.id] ?? null,
        ownBallotId: own?.id ?? null,
      };
    }
  }

  const timer = s.timer
    ? {
        endsAt: s.timer.pausedRemainingMs === null ? s.timer.endsAt : null,
        remainingMs: s.timer.pausedRemainingMs ?? Math.max(0, s.timer.endsAt - now),
        durationMs: s.timer.durationMs,
        paused: s.timer.pausedRemainingMs !== null,
      }
    : null;

  const inGame = s.phase !== 'lobby';
  const showBallot = (s.phase === 'voting' || scored) && !!round?.ballot;

  return {
    code: s.code,
    phase: s.phase,
    gameNumber: s.gameNumber,
    settings: s.settings,
    players,
    hostConnected,
    round: inGame && s.phase !== 'gameOver' ? s.roundIndex + 1 : inGame ? s.deck.length : 0,
    totalRounds: inGame ? s.deck.length : s.settings.questionCount,
    timer,
    paused: timer?.paused ?? false,
    question: showQuestion ? { id: question!.id, text: question!.text } : null,
    submittedIds:
      round && (s.phase === 'submission' || s.phase === 'voting') ? Object.keys(round.fibs).sort() : [],
    votedIds: round && s.phase === 'voting' ? Object.keys(round.votes).sort() : [],
    ballot: showBallot ? round!.ballot!.map((e) => ({ id: e.id, text: e.text })) : null,
    reveal,
    standings: computeStandings(
      s.players,
      (s.phase === 'scoreboard' || s.phase === 'reveal' || s.phase === 'gameOver') && round?.scored
        ? round.scoresBefore
        : null,
    ),
    highlights: scored && round?.ballot && round.results ? roundHighlights(round.ballot, round.results) : null,
    awards: s.phase === 'gameOver' ? computeAwards(s) : [],
    me,
    isHost: viewer.role === 'host',
    canStart: viewer.role === 'host' ? canStart(s) : { ok: false, reason: null },
  };
}

