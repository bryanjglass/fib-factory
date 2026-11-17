import { describe, expect, it } from 'vitest';
import { GameError } from '../../server/engine/errors';
import * as g from '../../server/engine/game';
import { computeStandings, rankMap } from '../../server/engine/standings';
import { TIMING } from '../../shared/protocol';
import { gameWithPlayers } from '../helpers';

function expectError(fn: () => unknown, code: string) {
  try {
    fn();
  } catch (e) {
    expect(e).toBeInstanceOf(GameError);
    expect((e as GameError).code).toBe(code);
    return;
  }
  throw new Error(`expected ${code}`);
}

/** Start a 3-player game and move to the submission phase. */
function toSubmission(names = ['Abby', 'Owen', 'Dad']) {
  const t = gameWithPlayers(names);
  g.startGame(t.s, t.ctx());
  expect(t.s.phase).toBe('question');
  g.advance(t.s, t.ctx());
  expect(t.s.phase).toBe('submission');
  return t;
}

function toVoting(names = ['Abby', 'Owen', 'Dad']) {
  const t = toSubmission(names);
  t.players.forEach((p, i) => g.submitFib(t.s, p.id, `fib number ${i + 1}`, t.ctx()));
  expect(t.s.phase).toBe('voting');
  return t;
}

const truthId = (s: g.GameState | any) => s.round.ballot.find((e: any) => e.isTruth).id as string;
const fibOf = (s: any, pid: string) => s.round.ballot.find((e: any) => e.authorIds.includes(pid)).id as string;

describe('lobby & joining', () => {
  it('accepts valid names and trims whitespace', () => {
    const { s, ctx } = gameWithPlayers([]);
    const p = g.addPlayer(s, '   Abby   Lou ', { id: 'a', token: 't' }, ctx());
    expect(p.name).toBe('Abby Lou');
    expect(p.status).toBe('contestant');
  });

  it('rejects duplicate names ignoring case and whitespace', () => {
    const { s, ctx } = gameWithPlayers(['Abby']);
    expectError(() => g.addPlayer(s, 'ABBY', { id: 'x', token: 'y' }, ctx()), 'NAME_TAKEN');
    expectError(() => g.addPlayer(s, '  abby ', { id: 'x', token: 'y' }, ctx()), 'NAME_TAKEN');
  });

  it('rejects empty and over-long names', () => {
    const { s, ctx } = gameWithPlayers([]);
    expectError(() => g.addPlayer(s, '   ', { id: 'x', token: 'y' }, ctx()), 'NAME_INVALID');
    expectError(() => g.addPlayer(s, 'x'.repeat(17), { id: 'x', token: 'y' }, ctx()), 'NAME_INVALID');
    expectError(() => g.addPlayer(s, 42, { id: 'x', token: 'y' }, ctx()), 'NAME_INVALID');
  });

  it('caps the game at 10 players', () => {
    const { s, ctx } = gameWithPlayers(Array.from({ length: 10 }, (_, i) => `P${i}`));
    expectError(() => g.addPlayer(s, 'Eleven', { id: 'x', token: 'y' }, ctx()), 'ROOM_FULL');
  });

  it('gives each player a distinct color and avatar', () => {
    const { s } = gameWithPlayers(['A', 'B', 'C', 'D', 'E']);
    expect(new Set(s.players.map((p) => p.color)).size).toBe(5);
    expect(new Set(s.players.map((p) => p.avatar)).size).toBe(5);
  });

  it('refuses to start with fewer than 3 connected players', () => {
    const { s, ctx } = gameWithPlayers(['A', 'B']);
    expectError(() => g.startGame(s, ctx()), 'NOT_ENOUGH_PLAYERS');
    g.addPlayer(s, 'C', { id: 'c', token: 'c' }, ctx());
    g.setConnected(s, 'c', false, ctx());
    expect(g.canStart(s).ok).toBe(false);
    expectError(() => g.startGame(s, ctx()), 'NOT_ENOUGH_PLAYERS');
    g.setConnected(s, 'c', true, ctx());
    g.startGame(s, ctx());
    expect(s.phase).toBe('question');
  });

  it('validates settings', () => {
    const { s } = gameWithPlayers([]);
    g.updateSettings(s, { questionCount: 10, submitSeconds: 45, voteSeconds: 20 });
    expect(s.settings).toEqual({ questionCount: 10, submitSeconds: 45, voteSeconds: 20 });
    expectError(() => g.updateSettings(s, { questionCount: 6 as any }), 'INVALID_SETTINGS');
    expectError(() => g.updateSettings(s, { submitSeconds: 1 }), 'INVALID_SETTINGS');
    expectError(() => g.updateSettings(s, { voteSeconds: 999 }), 'INVALID_SETTINGS');
  });

  it('puts late joiners on the waiting list instead of into the running game', () => {
    const t = toSubmission();
    const late = g.addPlayer(t.s, 'Grandma', { id: 'gm', token: 'gm' }, t.ctx());
    expect(late.status).toBe('waiting');
    expectError(() => g.submitFib(t.s, 'gm', 'hello', t.ctx()), 'NOT_A_CONTESTANT');
  });
});

describe('question selection', () => {
  it('picks the configured number of distinct questions', () => {
    const t = gameWithPlayers(['A', 'B', 'C']);
    g.updateSettings(t.s, { questionCount: 10 });
    g.startGame(t.s, t.ctx());
    expect(t.s.deck).toHaveLength(10);
    expect(new Set(t.s.deck).size).toBe(10);
  });

  it('randomizes questions between games', () => {
    const decks = new Set<string>();
    for (let seed = 1; seed <= 5; seed++) {
      const t = gameWithPlayers(['A', 'B', 'C'], seed);
      g.updateSettings(t.s, { questionCount: 5 });
      g.startGame(t.s, t.ctx());
      decks.add(t.s.deck.join(','));
    }
    expect(decks.size).toBeGreaterThan(1);
  });
});

describe('state machine', () => {
  it('follows lobby → question → submission → voting → reveal → scoreboard → question', () => {
    const t = toVoting();
    const phases: string[] = [];
    t.players.forEach((p, i) => {
      const other = t.players[(i + 1) % 3]!;
      g.castVote(t.s, p.id, fibOf(t.s, other.id), t.ctx());
    });
    phases.push(t.s.phase);
    while (t.s.phase === 'reveal') g.advance(t.s, t.ctx());
    phases.push(t.s.phase);
    g.advance(t.s, t.ctx());
    phases.push(t.s.phase);
    expect(phases).toEqual(['reveal', 'scoreboard', 'question']);
    expect(t.s.roundIndex).toBe(1);
  });

  it('rejects invalid transitions', () => {
    const t = gameWithPlayers(['A', 'B', 'C']);
    expectError(() => g.advance(t.s, t.ctx()), 'INVALID_TRANSITION');
    expectError(() => g.rematch(t.s), 'INVALID_TRANSITION');
    expectError(() => g.restart(t.s), 'INVALID_TRANSITION');
    g.startGame(t.s, t.ctx());
    expectError(() => g.startGame(t.s, t.ctx()), 'INVALID_TRANSITION');
    expectError(() => g.updateSettings(t.s, { questionCount: 5 }), 'WRONG_PHASE');
    expectError(() => g.castVote(t.s, 'p1', 'x', t.ctx()), 'WRONG_PHASE');
    expectError(() => g.submitFib(t.s, 'p1', 'x', t.ctx()), 'WRONG_PHASE');
  });

  it('rejects stale advance requests so a double-click cannot skip a question', () => {
    const t = toSubmission();
    const expect1 = { phase: 'submission' as const, round: 1 };
    g.advance(t.s, t.ctx(), expect1);
    expect(t.s.phase).toBe('voting');
    expectError(() => g.advance(t.s, t.ctx(), expect1), 'STALE_ACTION');
    expect(t.s.phase).toBe('voting');
  });

  it('transitions the final question to game over', () => {
    const t = gameWithPlayers(['A', 'B', 'C']);
    g.updateSettings(t.s, { questionCount: 5 });
    g.startGame(t.s, t.ctx());
    let questionsSeen = 0;
    while (t.s.phase !== 'gameOver') {
      if (t.s.phase === 'question') questionsSeen++;
      g.advance(t.s, t.ctx());
    }
    expect(questionsSeen).toBe(5);
    expect(t.s.history).toHaveLength(5);
    expectError(() => g.advance(t.s, t.ctx()), 'INVALID_TRANSITION');
  });
});

describe('fib submission', () => {
  it('rejects empty and whitespace-only fibs', () => {
    const t = toSubmission();
    expectError(() => g.submitFib(t.s, 'p1', '', t.ctx()), 'FIB_EMPTY');
    expectError(() => g.submitFib(t.s, 'p1', '   \n\t ', t.ctx()), 'FIB_EMPTY');
    expectError(() => g.submitFib(t.s, 'p1', null, t.ctx()), 'FIB_EMPTY');
  });

  it('trims whitespace and enforces a maximum length', () => {
    const t = toSubmission();
    expect(g.submitFib(t.s, 'p1', '   purple   cows  ', t.ctx())).toBe('purple cows');
    expectError(() => g.submitFib(t.s, 'p2', 'x'.repeat(41), t.ctx()), 'FIB_TOO_LONG');
  });

  it('rejects duplicates case-insensitively with normalized whitespace', () => {
    const t = toSubmission();
    g.submitFib(t.s, 'p1', 'Purple Cows', t.ctx());
    expectError(() => g.submitFib(t.s, 'p2', '  purple    COWS ', t.ctx()), 'FIB_DUPLICATE');
  });

  it('rejects a fib matching the truth without revealing it', () => {
    const t = toSubmission();
    const q = t.ctx().bank.get(t.s.round!.questionId)!;
    for (const attempt of [q.answer, q.answer.toUpperCase(), `  ${q.answer}! `, q.alsoAccept![0]!]) {
      try {
        g.submitFib(t.s, 'p1', attempt, t.ctx());
        throw new Error('should reject');
      } catch (e) {
        expect((e as GameError).code).toBe('FIB_IS_TRUTH');
        expect((e as GameError).message).not.toContain(q.answer);
      }
    }
  });

  it('lets a player change their fib and keeps exactly one per player', () => {
    const t = toSubmission();
    g.submitFib(t.s, 'p1', 'first idea', t.ctx());
    g.submitFib(t.s, 'p1', 'better idea', t.ctx());
    g.submitFib(t.s, 'p1', 'BETTER idea', t.ctx()); // same player re-submitting is not a duplicate
    expect(t.s.round!.fibs).toEqual({ p1: 'BETTER idea' });
  });

  it('ends early once all connected players have submitted', () => {
    const t = toSubmission();
    g.submitFib(t.s, 'p1', 'a', t.ctx());
    g.submitFib(t.s, 'p2', 'b', t.ctx());
    expect(t.s.phase).toBe('submission');
    g.submitFib(t.s, 'p3', 'c', t.ctx());
    expect(t.s.phase).toBe('voting');
  });

  it('does not wait for disconnected players', () => {
    const t = toSubmission();
    g.submitFib(t.s, 'p1', 'a', t.ctx());
    g.submitFib(t.s, 'p2', 'b', t.ctx());
    g.setConnected(t.s, 'p3', false, t.ctx());
    expect(t.s.phase).toBe('voting');
  });

  it('rejects late submissions after the timer expires', () => {
    const t = toSubmission();
    t.clock.now += t.s.settings.submitSeconds * 1000;
    expectError(() => g.submitFib(t.s, 'p1', 'too late', t.ctx()), 'TIME_UP');
  });
});

describe('voting', () => {
  it('builds a ballot of every fib plus the truth, randomized once', () => {
    const t = toVoting();
    const ballot = t.s.round!.ballot!;
    expect(ballot).toHaveLength(4);
    expect(ballot.filter((e) => e.isTruth)).toHaveLength(1);
    expect(ballot.map((e) => e.text).sort()).toEqual(['Truth', 'fib number 1', 'fib number 2', 'fib number 3'].map((x) =>
      x === 'Truth' ? t.ctx().bank.get(t.s.round!.questionId)!.answer : x,
    ).sort());
  });

  it('shuffles answer order (truth is not always in the same slot)', () => {
    const positions = new Set<number>();
    for (let seed = 1; seed <= 12; seed++) {
      const t = gameWithPlayers(['A', 'B', 'C'], seed);
      g.startGame(t.s, t.ctx());
      g.advance(t.s, t.ctx());
      t.players.forEach((p, i) => g.submitFib(t.s, p.id, `fib ${i}`, t.ctx()));
      positions.add(t.s.round!.ballot!.findIndex((e) => e.isTruth));
    }
    expect(positions.size).toBeGreaterThan(1);
  });

  it('rejects voting for your own fib', () => {
    const t = toVoting();
    expectError(() => g.castVote(t.s, 'p1', fibOf(t.s, 'p1'), t.ctx()), 'VOTE_OWN_FIB');
  });

  it('rejects duplicate votes and vote changes', () => {
    const t = toVoting();
    g.castVote(t.s, 'p1', truthId(t.s), t.ctx());
    expectError(() => g.castVote(t.s, 'p1', truthId(t.s), t.ctx()), 'ALREADY_VOTED');
    expectError(() => g.castVote(t.s, 'p1', fibOf(t.s, 'p2'), t.ctx()), 'ALREADY_VOTED');
    expect(t.s.round!.votes.p1).toBe(truthId(t.s));
  });

  it('rejects late and invalid votes', () => {
    const t = toVoting();
    expectError(() => g.castVote(t.s, 'p1', 'nope', t.ctx()), 'INVALID_CHOICE');
    expectError(() => g.castVote(t.s, 'ghost', truthId(t.s), t.ctx()), 'NOT_JOINED');
    t.clock.now += t.s.settings.voteSeconds * 1000 + 1;
    expectError(() => g.castVote(t.s, 'p1', truthId(t.s), t.ctx()), 'TIME_UP');
  });

  it('allows players who did not submit to vote', () => {
    const t = toSubmission();
    g.submitFib(t.s, 'p1', 'only fib', t.ctx());
    t.clock.now += t.s.settings.submitSeconds * 1000;
    expect(g.tick(t.s, t.ctx())).toBe(true);
    expect(t.s.phase).toBe('voting');
    expect(t.s.round!.ballot).toHaveLength(2);
    g.castVote(t.s, 'p2', fibOf(t.s, 'p1'), t.ctx());
    expect(t.s.round!.votes.p2).toBeDefined();
  });
});

describe('scoring integration', () => {
  it('scores exactly once even if reveal steps are repeated', () => {
    const t = toVoting();
    g.castVote(t.s, 'p1', truthId(t.s), t.ctx());
    g.castVote(t.s, 'p2', fibOf(t.s, 'p1'), t.ctx());
    g.castVote(t.s, 'p3', fibOf(t.s, 'p1'), t.ctx());
    expect(t.s.phase).toBe('reveal');
    expect(t.s.players.map((p) => p.score)).toEqual([2000, 0, 0]);
    while (t.s.phase === 'reveal') g.advance(t.s, t.ctx());
    expect(t.s.players.map((p) => p.score)).toEqual([2000, 0, 0]);
    expect(t.s.history).toHaveLength(1);
  });

  it('reveals fibs that fooled someone first, and the truth last', () => {
    const t = toVoting();
    g.castVote(t.s, 'p1', fibOf(t.s, 'p2'), t.ctx());
    g.castVote(t.s, 'p2', truthId(t.s), t.ctx());
    g.castVote(t.s, 'p3', fibOf(t.s, 'p2'), t.ctx());
    expect(t.s.round!.revealOrder).toEqual([fibOf(t.s, 'p2'), truthId(t.s)]);
  });

  it('handles a round where nobody submits or votes', () => {
    const t = toSubmission();
    t.clock.now += 1e6;
    g.tick(t.s, t.ctx());
    expect(t.s.phase).toBe('voting');
    t.clock.now += 1e6;
    g.tick(t.s, t.ctx());
    expect(t.s.phase).toBe('reveal');
    expect(t.s.players.every((p) => p.score === 0)).toBe(true);
    expect(t.s.round!.revealOrder).toEqual([truthId(t.s)]);
  });
});

describe('timers', () => {
  it('auto-progresses on expiry, one phase per expiry', () => {
    const t = gameWithPlayers(['A', 'B', 'C']);
    g.startGame(t.s, t.ctx());
    expect(g.nextDeadline(t.s)).toBe(t.clock.now + TIMING.questionIntroMs);
    t.clock.now += TIMING.questionIntroMs - 1;
    expect(g.tick(t.s, t.ctx())).toBe(false);
    // Simulate a very late wake-up: still only one transition, and the new timer starts now.
    t.clock.now += 10 * 60 * 1000;
    expect(g.tick(t.s, t.ctx())).toBe(true);
    expect(t.s.phase).toBe('submission');
    expect(g.nextDeadline(t.s)).toBe(t.clock.now + t.s.settings.submitSeconds * 1000);
  });

  it('pauses and resumes with the remaining time preserved', () => {
    const t = toSubmission();
    t.clock.now += 10_000;
    g.pause(t.s, t.ctx());
    expect(g.nextDeadline(t.s)).toBeNull();
    t.clock.now += 5 * 60_000;
    expect(g.tick(t.s, t.ctx())).toBe(false);
    expect(t.s.phase).toBe('submission');
    g.resume(t.s, t.ctx());
    expect(g.nextDeadline(t.s)).toBe(t.clock.now + 50_000);
  });

  it('does not end early while paused, but does on resume', () => {
    const t = toSubmission();
    g.pause(t.s, t.ctx());
    t.players.forEach((p, i) => g.submitFib(t.s, p.id, `fib ${i}`, t.ctx()));
    expect(t.s.phase).toBe('submission');
    g.resume(t.s, t.ctx());
    expect(t.s.phase).toBe('voting');
  });
});

describe('standings, game over and rematch', () => {
  it('uses competition ranking for ties', () => {
    const ranks = rankMap([
      { id: 'a', name: 'A', score: 3000 },
      { id: 'b', name: 'B', score: 1000 },
      { id: 'c', name: 'C', score: 3000 },
      { id: 'd', name: 'D', score: 500 },
    ]);
    expect(ranks).toEqual({ a: 1, c: 1, b: 3, d: 4 });
  });

  it('sorts final standings by score', () => {
    const t = gameWithPlayers(['A', 'B', 'C', 'D']);
    t.s.players[0]!.score = 500;
    t.s.players[1]!.score = 2500;
    t.s.players[2]!.score = 1000;
    t.s.players[3]!.score = 2500;
    const rows = computeStandings(t.s.players, null);
    expect(rows.map((r) => [r.playerId, r.rank])).toEqual([
      ['p2', 1],
      ['p4', 1],
      ['p3', 3],
      ['p1', 4],
    ]);
  });

  it('rematch keeps the roster, resets scores and picks new questions', () => {
    const t = gameWithPlayers(['A', 'B', 'C']);
    g.updateSettings(t.s, { questionCount: 5 });
    g.startGame(t.s, t.ctx());
    const firstDeck = [...t.s.deck];
    g.advance(t.s, t.ctx());
    t.players.forEach((p, i) => g.submitFib(t.s, p.id, `fib ${i}`, t.ctx()));
    t.players.forEach((p) => g.castVote(t.s, p.id, truthId(t.s), t.ctx()));
    while (t.s.phase !== 'gameOver') g.advance(t.s, t.ctx());
    expect(t.s.players.every((p) => p.score === 1000)).toBe(true);
    g.addPlayer(t.s, 'Late', { id: 'late', token: 'late' }, t.ctx());
    g.rematch(t.s);
    expect(t.s.phase).toBe('lobby');
    expect(t.s.players.map((p) => p.score)).toEqual([0, 0, 0, 0]);
    expect(t.s.players.find((p) => p.id === 'late')!.status).toBe('contestant');
    g.startGame(t.s, t.ctx());
    // 12 test questions, 5 used: the rematch must not reuse any of them.
    expect(t.s.deck.some((id) => firstDeck.includes(id))).toBe(false);
  });

  it('restart abandons a game in progress', () => {
    const t = toVoting();
    g.restart(t.s);
    expect(t.s.phase).toBe('lobby');
    expect(t.s.round).toBeNull();
  });

  it('only removes contestants between games', () => {
    const t = toSubmission();
    expectError(() => g.removePlayer(t.s, 'p1'), 'GAME_IN_PROGRESS');
    g.restart(t.s);
    g.removePlayer(t.s, 'p1');
    expect(t.s.players).toHaveLength(2);
  });
});
