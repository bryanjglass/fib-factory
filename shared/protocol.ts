/**
 * Fib Factory wire protocol and shared constants.
 *
 * Everything in this file is safe to ship to browsers: it contains types and
 * game constants only — never question answers.
 */

export const MIN_PLAYERS = 3;
export const MAX_PLAYERS = 10;
/** Contestants plus people waiting to join the next game. */
export const MAX_ROOM_OCCUPANTS = 16;
export const QUESTION_COUNTS = [5, 7, 10] as const;
export type QuestionCount = (typeof QUESTION_COUNTS)[number];
export const SUBMIT_SECONDS_OPTIONS = [20, 30, 45, 60, 90, 120] as const;
export const VOTE_SECONDS_OPTIONS = [15, 20, 30, 45, 60] as const;
export const MAX_NAME_LENGTH = 16;
export const MAX_FIB_LENGTH = 40;
export const MAX_MESSAGE_BYTES = 4096;

export const POINTS = {
  /** Awarded for voting for the real answer. */
  truth: 1000,
  /** Awarded to a fib's author for each opponent who voted for it. */
  perPlayerFooled: 500,
} as const;

/** Phase timings that are not configurable by the host (milliseconds). */
export const TIMING = {
  questionIntroMs: 6000,
  revealFibStepMs: 4500,
  revealTruthStepMs: 7000,
} as const;

export const ROOM_CODE_ALPHABET = 'BCDFGHJKLMNPQRSTVWXZ';
export const ROOM_CODE_LENGTH = 4;
export const ROOM_CODE_PATTERN = new RegExp(`^[${ROOM_CODE_ALPHABET}]{${ROOM_CODE_LENGTH}}$`);

/** Exact text for keep-alive pings; the server answers without waking up. */
export const PING_TEXT = '{"type":"ping"}';
export const PONG_TEXT = '{"type":"pong"}';

export type Phase =
  | 'lobby'
  | 'question'
  | 'submission'
  | 'voting'
  | 'reveal'
  | 'scoreboard'
  | 'gameOver';

export interface GameSettings {
  questionCount: QuestionCount;
  submitSeconds: number;
  voteSeconds: number;
}

export const DEFAULT_SETTINGS: GameSettings = {
  questionCount: 7,
  submitSeconds: 60,
  voteSeconds: 30,
};

export type Role = 'host' | 'display' | 'player';
export type PlayerStatus = 'contestant' | 'waiting';

export interface PlayerView {
  id: string;
  name: string;
  color: string;
  avatar: string;
  score: number;
  connected: boolean;
  status: PlayerStatus;
}

export interface TimerView {
  /** Server epoch ms when the timer expires (null while paused). */
  endsAt: number | null;
  remainingMs: number;
  durationMs: number;
  paused: boolean;
}

export interface BallotOption {
  id: string;
  text: string;
}

export interface RevealEntry {
  id: string;
  text: string;
  isTruth: boolean;
  authorIds: string[];
  voterIds: string[];
}

export interface PlayerRoundResult {
  playerId: string;
  submitted: boolean;
  votedFor: string | null;
  foundTruth: boolean;
  /** Author of the fib this player fell for, if any. */
  fooledBy: string | null;
  truthPoints: number;
  fibPoints: number;
  /** Players who voted for this player's fib. */
  fooledIds: string[];
  total: number;
}

export interface RevealView {
  truthId: string;
  answer: string;
  fact: string | null;
  entries: RevealEntry[];
  /** Ballot ids in the order the TV reveals them (truth is always last). */
  order: string[];
  step: number;
  results: Record<string, PlayerRoundResult>;
}

export interface StandingRow {
  playerId: string;
  /** Competition ranking: tied scores share a rank (1, 2, 2, 4). */
  rank: number;
  score: number;
  delta: number;
  previousRank: number | null;
}

export interface RoundHighlights {
  biggestBluff: { authorIds: string[]; text: string; fooledCount: number } | null;
  truthDetectorIds: string[];
}

export interface Award {
  id: string;
  title: string;
  emoji: string;
  description: string;
  playerIds: string[];
  value: number;
}

export interface MeView {
  playerId: string;
  name: string;
  status: PlayerStatus;
  fib: string | null;
  voteId: string | null;
  ownBallotId: string | null;
}

export interface GameView {
  code: string;
  phase: Phase;
  gameNumber: number;
  settings: GameSettings;
  players: PlayerView[];
  hostConnected: boolean;
  /** 1-based round number; 0 in the lobby. */
  round: number;
  totalRounds: number;
  timer: TimerView | null;
  paused: boolean;
  question: { id: string; text: string } | null;
  submittedIds: string[];
  votedIds: string[];
  ballot: BallotOption[] | null;
  reveal: RevealView | null;
  standings: StandingRow[];
  highlights: RoundHighlights | null;
  awards: Award[];
  me: MeView | null;
  isHost: boolean;
  canStart: { ok: boolean; reason: string | null };
}

export type HostAction =
  | { kind: 'updateSettings'; settings: Partial<GameSettings> }
  | { kind: 'start' }
  | { kind: 'advance'; expect?: { phase: Phase; round: number; step?: number } }
  | { kind: 'pause' }
  | { kind: 'resume' }
  | { kind: 'rematch' }
  | { kind: 'restart' }
  | { kind: 'removePlayer'; playerId: string };

export type ClientMessage =
  | { type: 'hello'; role: 'host'; hostToken: string; requestId?: string }
  | { type: 'hello'; role: 'display'; requestId?: string }
  | { type: 'hello'; role: 'player'; playerToken?: string | null; requestId?: string }
  | { type: 'join'; name: string; requestId?: string }
  | { type: 'submitFib'; text: string; requestId?: string }
  | { type: 'vote'; choiceId: string; requestId?: string }
  | { type: 'host'; action: HostAction; requestId?: string }
  | { type: 'ping' };

export type ErrorCode =
  | 'BAD_MESSAGE'
  | 'ROOM_NOT_FOUND'
  | 'NOT_AUTHORIZED'
  | 'NOT_JOINED'
  | 'TOKEN_INVALID'
  | 'NAME_INVALID'
  | 'NAME_TAKEN'
  | 'ROOM_FULL'
  | 'GAME_IN_PROGRESS'
  | 'NOT_ENOUGH_PLAYERS'
  | 'INVALID_SETTINGS'
  | 'INVALID_TRANSITION'
  | 'STALE_ACTION'
  | 'WRONG_PHASE'
  | 'TIME_UP'
  | 'PAUSED'
  | 'NOT_A_CONTESTANT'
  | 'FIB_EMPTY'
  | 'FIB_TOO_LONG'
  | 'FIB_DUPLICATE'
  | 'FIB_IS_TRUTH'
  | 'INVALID_CHOICE'
  | 'VOTE_OWN_FIB'
  | 'ALREADY_VOTED';

export type ServerMessage =
  | { type: 'welcome'; role: Role; playerId: string | null; requestId?: string }
  | { type: 'joined'; playerId: string; playerToken: string; requestId?: string }
  | { type: 'state'; state: GameView; serverNow: number }
  | { type: 'ack'; requestId: string }
  | { type: 'error'; code: ErrorCode; message: string; requestId?: string }
  | { type: 'pong' };

/** HTTP response from POST /api/rooms */
export interface CreateRoomResponse {
  code: string;
  hostToken: string;
}
