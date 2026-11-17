/**
 * The Fib Factory game state machine.
 *
 *   lobby → question → submission → voting → reveal → scoreboard ─┬→ question (next round)
 *                                                                  └→ gameOver → (rematch) → lobby
 *
 * Every exported function mutates the given state in place. Callers (the room
 * controller) run them against a *clone* and only commit on success, so a
 * thrown GameError never leaves a half-applied change behind.
 */
import {
  DEFAULT_SETTINGS,
  MAX_FIB_LENGTH,
  MAX_NAME_LENGTH,
  MAX_PLAYERS,
  MAX_ROOM_OCCUPANTS,
  MIN_PLAYERS,
  QUESTION_COUNTS,
  SUBMIT_SECONDS_OPTIONS,
  TIMING,
  VOTE_SECONDS_OPTIONS,
  type GameSettings,
  type Phase,
} from '../../shared/protocol';
import { PLAYER_AVATARS, PLAYER_COLORS } from '../../shared/players';
import { cleanText, compareKey, looseKey } from '../../shared/text';
import { fail } from './errors';
import { shuffle } from './random';
import { scoreRound } from './scoring';
import type { BallotEntry, EngineContext, GameState, ServerPlayer } from './types';

// ---------------------------------------------------------------------------
// Creation & helpers
// ---------------------------------------------------------------------------

export function createGame(code: string, hostToken: string, now: number): GameState {
  return {
    schema: 1,
    code,
    hostToken,
    createdAt: now,
    updatedAt: now,
    settings: { ...DEFAULT_SETTINGS },
    phase: 'lobby',
    players: [],
    deck: [],
    roundIndex: 0,
    round: null,
    history: [],
    timer: null,
    gameNumber: 1,
    usedQuestionIds: [],
  };
}

export function contestants(s: GameState): ServerPlayer[] {
  return s.players.filter((p) => p.status === 'contestant');
}

function getPlayer(s: GameState, playerId: string): ServerPlayer {
  const p = s.players.find((x) => x.id === playerId);
  if (!p) fail('NOT_JOINED', 'You are not in this game.');
  return p;
}

function requirePhase(s: GameState, phase: Phase, message = 'That is not possible right now.') {
  if (s.phase !== phase) fail('WRONG_PHASE', message);
}

function startTimer(s: GameState, ms: number, ctx: EngineContext) {
  s.timer = { endsAt: ctx.now + ms, durationMs: ms, pausedRemainingMs: null };
}

export function isPaused(s: GameState): boolean {
  return !!s.timer && s.timer.pausedRemainingMs !== null;
}

function timeIsUp(s: GameState, now: number): boolean {
  return !!s.timer && s.timer.pausedRemainingMs === null && now >= s.timer.endsAt;
}

/** The next moment the server must wake up to progress the game, if any. */
export function nextDeadline(s: GameState): number | null {
  if (!s.timer || s.timer.pausedRemainingMs !== null) return null;
  return s.timer.endsAt;
}

// ---------------------------------------------------------------------------
// Lobby
// ---------------------------------------------------------------------------

export function validateName(raw: unknown): string {
  if (typeof raw !== 'string') fail('NAME_INVALID', 'Please enter a name.');
  const name = cleanText(raw);
  if (!name) fail('NAME_INVALID', 'Please enter a name.');
  if ([...name].length > MAX_NAME_LENGTH) {
    fail('NAME_INVALID', `Names can be at most ${MAX_NAME_LENGTH} characters.`);
  }
  return name;
}

export function addPlayer(
  s: GameState,
  rawName: unknown,
  ids: { id: string; token: string },
  ctx: EngineContext,
): ServerPlayer {
  const name = validateName(rawName);
  const key = compareKey(name);
  if (s.players.some((p) => compareKey(p.name) === key)) {
    fail('NAME_TAKEN', `Someone is already called "${name}". Try a different name.`);
  }
  const inLobby = s.phase === 'lobby';
  if (inLobby && contestants(s).length >= MAX_PLAYERS) {
    fail('ROOM_FULL', `This game already has ${MAX_PLAYERS} players.`);
  }
  if (s.players.length >= MAX_ROOM_OCCUPANTS) fail('ROOM_FULL', 'This room is full.');

  const usedColors = new Set(s.players.map((p) => p.color));
  const usedAvatars = new Set(s.players.map((p) => p.avatar));
  const player: ServerPlayer = {
    id: ids.id,
    token: ids.token,
    name,
    color: PLAYER_COLORS.find((c) => !usedColors.has(c)) ?? PLAYER_COLORS[0],
    avatar: PLAYER_AVATARS.find((a) => !usedAvatars.has(a)) ?? PLAYER_AVATARS[0],
    score: 0,
    // Late arrivals wait on the sidelines and join the next game.
    status: inLobby ? 'contestant' : 'waiting',
    connected: true,
    joinedAt: ctx.now,
  };
  s.players.push(player);
  return player;
}

export function removePlayer(s: GameState, playerId: string) {
  const p = getPlayer(s, playerId);
  if (p.status === 'contestant' && s.phase !== 'lobby' && s.phase !== 'gameOver') {
    fail('GAME_IN_PROGRESS', 'Players can only be removed between games.');
  }
  s.players = s.players.filter((x) => x.id !== playerId);
}

export function setConnected(s: GameState, playerId: string, connected: boolean, ctx: EngineContext) {
  const p = s.players.find((x) => x.id === playerId);
  if (!p || p.connected === connected) return;
  p.connected = connected;
  // A player dropping out must never block the rest of the table.
  checkEarlyCompletion(s, ctx);
}

export function updateSettings(s: GameState, patch: Partial<GameSettings>) {
  requirePhase(s, 'lobby', 'Settings can only be changed in the lobby.');
  if (typeof patch !== 'object' || patch === null) fail('INVALID_SETTINGS', 'Invalid settings.');
  const next = { ...s.settings };
  if (patch.questionCount !== undefined) {
    if (!(QUESTION_COUNTS as readonly number[]).includes(patch.questionCount)) {
      fail('INVALID_SETTINGS', `Question count must be one of ${QUESTION_COUNTS.join(', ')}.`);
    }
    next.questionCount = patch.questionCount;
  }
  if (patch.submitSeconds !== undefined) {
    if (!(SUBMIT_SECONDS_OPTIONS as readonly number[]).includes(patch.submitSeconds)) {
      fail('INVALID_SETTINGS', 'Invalid fib timer.');
    }
    next.submitSeconds = patch.submitSeconds;
  }
  if (patch.voteSeconds !== undefined) {
    if (!(VOTE_SECONDS_OPTIONS as readonly number[]).includes(patch.voteSeconds)) {
      fail('INVALID_SETTINGS', 'Invalid voting timer.');
    }
    next.voteSeconds = patch.voteSeconds;
  }
  s.settings = next;
}

export function canStart(s: GameState): { ok: boolean; reason: string | null } {
  if (s.phase !== 'lobby') return { ok: false, reason: 'The game has already started.' };
  const all = contestants(s);
  const connected = all.filter((p) => p.connected).length;
  if (connected < MIN_PLAYERS) {
    const need = MIN_PLAYERS - connected;
    return { ok: false, reason: `Need ${need} more connected player${need === 1 ? '' : 's'} (minimum ${MIN_PLAYERS}).` };
  }
  if (all.length > MAX_PLAYERS) return { ok: false, reason: `At most ${MAX_PLAYERS} players.` };
  return { ok: true, reason: null };
}

/** Pick `count` distinct questions, preferring ones this room hasn't seen yet. */
export function pickQuestions(s: GameState, count: number, ctx: EngineContext): string[] {
  const all = ctx.bank.all.map((q) => q.id);
  if (all.length < count) throw new Error('Question bank is too small');
  const used = new Set(s.usedQuestionIds);
  let fresh = all.filter((id) => !used.has(id));
  if (fresh.length < count) {
    // Everything has been seen: start the cycle again.
    s.usedQuestionIds = [];
    fresh = all;
  }
  return shuffle(fresh, ctx.rng).slice(0, count);
}

export function startGame(s: GameState, ctx: EngineContext) {
  if (s.phase !== 'lobby') fail('INVALID_TRANSITION', 'The game has already started.');
  const check = canStart(s);
  if (!check.ok) fail('NOT_ENOUGH_PLAYERS', check.reason!);
  s.deck = pickQuestions(s, s.settings.questionCount, ctx);
  s.usedQuestionIds = [...s.usedQuestionIds, ...s.deck];
  s.history = [];
  for (const p of s.players) p.score = 0;
  beginRound(s, 0, ctx);
}

// ---------------------------------------------------------------------------
// Rounds
// ---------------------------------------------------------------------------

function beginRound(s: GameState, index: number, ctx: EngineContext) {
  const questionId = s.deck[index];
  if (!questionId) throw new Error(`No question for round ${index}`);
  s.roundIndex = index;
  s.round = {
    index,
    questionId,
    fibs: {},
    ballot: null,
    votes: {},
    scored: false,
    results: null,
    revealOrder: [],
    revealStep: 0,
    scoresBefore: {},
  };
  s.phase = 'question';
  startTimer(s, TIMING.questionIntroMs, ctx);
}

function startSubmission(s: GameState, ctx: EngineContext) {
  s.phase = 'submission';
  startTimer(s, s.settings.submitSeconds * 1000, ctx);
}

function startVoting(s: GameState, ctx: EngineContext) {
  const round = s.round!;
  const question = ctx.bank.get(round.questionId)!;
  const ids = new Set(contestants(s).map((p) => p.id));
  const entries: BallotEntry[] = Object.entries(round.fibs)
    .filter(([pid]) => ids.has(pid))
    .map(([pid, text]) => ({ id: ctx.makeId(), text, isTruth: false, authorIds: [pid] }));
  entries.push({ id: ctx.makeId(), text: question.answer, isTruth: true, authorIds: [] });
  // Randomized exactly once, on the server; every client sees this order.
  round.ballot = shuffle(entries, ctx.rng);
  s.phase = 'voting';
  startTimer(s, s.settings.voteSeconds * 1000, ctx);
}

/** Scores the current round. Guarded so it can never run twice. */
function scoreCurrentRound(s: GameState) {
  const round = s.round!;
  if (round.scored) return;
  const players = contestants(s);
  round.scoresBefore = Object.fromEntries(players.map((p) => [p.id, p.score]));
  round.results = scoreRound(
    round.ballot!,
    round.votes,
    players.map((p) => p.id),
    new Set(Object.keys(round.fibs)),
  );
  for (const p of players) p.score += round.results[p.id]?.total ?? 0;
  round.scored = true;
  s.history.push({ questionId: round.questionId, results: round.results, ballot: round.ballot! });
}

function startReveal(s: GameState, ctx: EngineContext) {
  const round = s.round!;
  scoreCurrentRound(s);
  const counts = new Map<string, number>();
  for (const choice of Object.values(round.votes)) counts.set(choice, (counts.get(choice) ?? 0) + 1);
  const ballot = round.ballot!;
  const fooling = ballot
    .map((e, i) => ({ e, i, n: counts.get(e.id) ?? 0 }))
    .filter(({ e, n }) => !e.isTruth && n > 0)
    .sort((a, b) => a.n - b.n || a.i - b.i)
    .map(({ e }) => e.id);
  const truth = ballot.find((e) => e.isTruth)!;
  round.revealOrder = [...fooling, truth.id];
  round.revealStep = 0;
  s.phase = 'reveal';
  startRevealStepTimer(s, ctx);
}

function startRevealStepTimer(s: GameState, ctx: EngineContext) {
  const round = s.round!;
  const isTruthStep = round.revealStep === round.revealOrder.length - 1;
  startTimer(s, isTruthStep ? TIMING.revealTruthStepMs : TIMING.revealFibStepMs, ctx);
}

function advanceReveal(s: GameState, ctx: EngineContext) {
  const round = s.round!;
  if (round.revealStep < round.revealOrder.length - 1) {
    round.revealStep += 1;
    startRevealStepTimer(s, ctx);
  } else {
    s.phase = 'scoreboard';
    s.timer = null;
  }
}

function nextRoundOrFinish(s: GameState, ctx: EngineContext) {
  if (s.roundIndex + 1 < s.deck.length) {
    beginRound(s, s.roundIndex + 1, ctx);
  } else {
    s.phase = 'gameOver';
    s.timer = null;
  }
}

/** Ends submission/voting early once every connected contestant has acted. */
export function checkEarlyCompletion(s: GameState, ctx: EngineContext) {
  if (isPaused(s) || !s.round) return;
  const active = contestants(s).filter((p) => p.connected);
  if (active.length === 0) return; // nobody here: let the timer decide
  if (s.phase === 'submission' && active.every((p) => s.round!.fibs[p.id] !== undefined)) {
    startVoting(s, ctx);
  } else if (s.phase === 'voting' && active.every((p) => s.round!.votes[p.id] !== undefined)) {
    startReveal(s, ctx);
  }
}

/** One step forward through the state machine. */
function step(s: GameState, ctx: EngineContext) {
  switch (s.phase) {
    case 'question':
      return startSubmission(s, ctx);
    case 'submission':
      return startVoting(s, ctx);
    case 'voting':
      return startReveal(s, ctx);
    case 'reveal':
      return advanceReveal(s, ctx);
    case 'scoreboard':
      return nextRoundOrFinish(s, ctx);
    default:
      fail('INVALID_TRANSITION', `Cannot advance from ${s.phase}.`);
  }
}

/**
 * Host "Next" button. `expect` makes it idempotent: a double-click (or a
 * retried message) that was meant for a phase we've already left is rejected
 * instead of skipping a question.
 */
export function advance(
  s: GameState,
  ctx: EngineContext,
  expect?: { phase: Phase; round: number; step?: number },
) {
  if (expect) {
    const sameStep = expect.step === undefined || s.phase !== 'reveal' || s.round?.revealStep === expect.step;
    if (expect.phase !== s.phase || expect.round !== s.roundIndex + 1 || !sameStep) {
      fail('STALE_ACTION', 'The game has already moved on.');
    }
  }
  step(s, ctx);
}

/** Applies a timer expiry, if one is due. Returns true if the state changed. */
export function tick(s: GameState, ctx: EngineContext): boolean {
  if (!timeIsUp(s, ctx.now)) return false;
  // Exactly one transition per expiry; the next phase's timer starts from
  // `now`, so a late wake-up never skips a whole phase.
  step(s, ctx);
  return true;
}

export function pause(s: GameState, ctx: EngineContext) {
  if (!s.timer) fail('INVALID_TRANSITION', 'There is no timer running.');
  if (s.timer.pausedRemainingMs !== null) return; // already paused: idempotent
  s.timer.pausedRemainingMs = Math.max(0, s.timer.endsAt - ctx.now);
}

export function resume(s: GameState, ctx: EngineContext) {
  if (!s.timer || s.timer.pausedRemainingMs === null) return; // idempotent
  s.timer.endsAt = ctx.now + s.timer.pausedRemainingMs;
  s.timer.pausedRemainingMs = null;
  checkEarlyCompletion(s, ctx);
}

// ---------------------------------------------------------------------------
// Player actions
// ---------------------------------------------------------------------------

function requireContestant(s: GameState, playerId: string): ServerPlayer {
  const p = getPlayer(s, playerId);
  if (p.status !== 'contestant') fail('NOT_A_CONTESTANT', 'You will join in when the next game starts.');
  return p;
}

export function submitFib(s: GameState, playerId: string, rawText: unknown, ctx: EngineContext): string {
  requireContestant(s, playerId);
  requirePhase(s, 'submission', 'Fib submissions are closed.');
  if (timeIsUp(s, ctx.now)) fail('TIME_UP', "Time's up!");
  const text = typeof rawText === 'string' ? cleanText(rawText) : '';
  if (!text) fail('FIB_EMPTY', 'Type a fib first!');
  if ([...text].length > MAX_FIB_LENGTH) fail('FIB_TOO_LONG', `Keep it under ${MAX_FIB_LENGTH} characters.`);

  const round = s.round!;
  const question = ctx.bank.get(round.questionId)!;
  const loose = looseKey(text);
  const truthKeys = [question.answer, ...(question.alsoAccept ?? [])].map(looseKey);
  if (truthKeys.includes(loose)) {
    // Deliberately vague: never confirm what the answer is.
    fail('FIB_IS_TRUTH', 'Whoa — that might be too close to the truth! Try a different fib.');
  }
  const key = compareKey(text);
  const dupe = Object.entries(round.fibs).some(
    ([pid, other]) => pid !== playerId && (compareKey(other) === key || looseKey(other) === loose),
  );
  if (dupe) fail('FIB_DUPLICATE', 'Someone already wrote that! Get more creative.');

  round.fibs[playerId] = text;
  checkEarlyCompletion(s, ctx);
  return text;
}

export function castVote(s: GameState, playerId: string, choiceId: unknown, ctx: EngineContext) {
  requireContestant(s, playerId);
  requirePhase(s, 'voting', 'Voting is closed.');
  if (timeIsUp(s, ctx.now)) fail('TIME_UP', "Time's up!");
  const round = s.round!;
  if (round.votes[playerId] !== undefined) fail('ALREADY_VOTED', 'You already voted — no take-backs!');
  const entry = round.ballot!.find((e) => e.id === choiceId);
  if (!entry) fail('INVALID_CHOICE', 'That answer is not on the ballot.');
  if (entry.authorIds.includes(playerId)) fail('VOTE_OWN_FIB', "Nice try — you can't vote for your own fib!");
  round.votes[playerId] = entry.id;
  checkEarlyCompletion(s, ctx);
}

// ---------------------------------------------------------------------------
// Game over / rematch
// ---------------------------------------------------------------------------

function resetToLobby(s: GameState) {
  s.phase = 'lobby';
  s.round = null;
  s.roundIndex = 0;
  s.deck = [];
  s.history = [];
  s.timer = null;
  s.gameNumber += 1;
  for (const p of s.players) p.score = 0;
  // Promote people who were waiting on the sidelines, up to the cap.
  let count = contestants(s).length;
  for (const p of s.players) {
    if (p.status === 'waiting' && count < MAX_PLAYERS) {
      p.status = 'contestant';
      count += 1;
    }
  }
}

/** Same roster, scores reset, back to the lobby for a fresh set of questions. */
export function rematch(s: GameState) {
  if (s.phase !== 'gameOver') fail('INVALID_TRANSITION', 'A rematch can start once the game is over.');
  resetToLobby(s);
}

/** Abandon the current game (any phase) and return to the lobby. */
export function restart(s: GameState) {
  if (s.phase === 'lobby') fail('INVALID_TRANSITION', 'Already in the lobby.');
  resetToLobby(s);
}
