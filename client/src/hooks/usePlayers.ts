import { useMemo } from 'react';
import type { GameView, PlayerView } from '../../../shared/protocol';

export function usePlayerMap(view: GameView | null): Map<string, PlayerView> {
  return useMemo(() => new Map((view?.players ?? []).map((p) => [p.id, p])), [view?.players]);
}

export function contestantsOf(view: GameView): PlayerView[] {
  return view.players.filter((p) => p.status === 'contestant');
}
