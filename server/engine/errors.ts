import type { ErrorCode } from '../../shared/protocol';

export class GameError extends Error {
  constructor(
    public readonly code: ErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'GameError';
  }
}

export function fail(code: ErrorCode, message: string): never {
  throw new GameError(code, message);
}
