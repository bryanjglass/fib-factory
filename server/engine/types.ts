import type { GameSettings, Phase, PlayerRoundResult, PlayerStatus } from '../../shared/protocol';
import type { Question } from '../questions';

export interface ServerPlayer {
  id: string;
  /** Secret reconnect token. Never included in any view. */
  token: string;
  name: string;
  color: string;
  avatar: string;
  score: number;
  status: PlayerStatus;
  connected: boolean;
  joinedAt: number;
}

export interface BallotEntry {
  id: string;
  text: string;
  isTruth: boolean;
  authorIds: string[];
}

export interface RoundState {
  index: number;
  questionId: string;
  /** playerId -> fib text (cleaned) */
  fibs: Record<string, string>;
  ballot: BallotEntry[] | null;
  /** playerId -> ballot entry id */
  votes: Record<string, string>;
  /** Set exactly once when the round is scored. */
  scored: boolean;
  results: Record<string, PlayerRoundResult> | null;
  revealOrder: string[];
  revealStep: number;
  scoresBefore: Record<string, number>;
}

export interface TimerState {
  endsAt: number;
  durationMs: number;
  /** When non-null, the timer is paused with this much time left. */
  pausedRemainingMs: number | null;
}

export interface GameState {
  schema: 1;
  code: string;
  hostToken: string;
  createdAt: number;
  updatedAt: number;
  settings: GameSettings;
  phase: Phase;
  players: ServerPlayer[];
  /** Question ids chosen for the current game, in play order. */
  deck: string[];
  roundIndex: number;
  round: RoundState | null;
  /** Completed (scored) rounds of the current game. */
  history: { questionId: string; results: Record<string, PlayerRoundResult>; ballot: BallotEntry[] }[];
  timer: TimerState | null;
  gameNumber: number;
  /** Questions used by earlier games in this room, so rematches feel fresh. */
  usedQuestionIds: string[];
}

export interface QuestionBank {
  all: readonly Question[];
  get(id: string): Question | undefined;
}

export interface EngineContext {
  now: number;
  /** Uniform random number in [0, 1). Injected so tests are deterministic. */
  rng: () => number;
  bank: QuestionBank;
  /** Produces unpredictable ids (ballot ids). */
  makeId: () => string;
}
