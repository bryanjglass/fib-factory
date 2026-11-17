import { create } from 'zustand';
import type { ClientMessage, GameView, Role, ServerMessage } from '../../shared/protocol';
import { hostTokenKey, playerTokenKey, storage } from './lib/storage';
import { GameConnection, RequestError, type ConnectionStatus } from './net/connection';

export interface Toast {
  id: number;
  text: string;
  tone: 'error' | 'info' | 'success';
}

type Outgoing = Exclude<ClientMessage, { type: 'ping' | 'hello' }>;
type DistributiveOmit<T, K extends keyof any> = T extends unknown ? Omit<T, K> : never;

interface GameStore {
  code: string | null;
  role: Role | null;
  status: ConnectionStatus;
  view: GameView | null;
  /** serverNow - Date.now(), used to render synchronized countdowns. */
  clockOffset: number;
  playerId: string | null;
  welcomed: boolean;
  toasts: Toast[];
  connect: (code: string, role: Role) => void;
  disconnect: () => void;
  /** Sends an action; resolves to the reply, or null after showing an error toast. */
  request: (msg: DistributiveOmit<Outgoing, 'requestId'>, opts?: { quiet?: boolean }) => Promise<ServerMessage | null>;
  toast: (text: string, tone?: Toast['tone']) => void;
  dismissToast: (id: number) => void;
}

let connection: GameConnection | null = null;
let toastSeq = 0;

export const useGame = create<GameStore>((set, get) => ({
  code: null,
  role: null,
  status: 'connecting',
  view: null,
  clockOffset: 0,
  playerId: null,
  welcomed: false,
  toasts: [],

  connect: (code, role) => {
    connection?.stop();
    set({ code, role, status: 'connecting', view: null, playerId: null, welcomed: false });

    const handleMessage = (msg: ServerMessage) => {
      switch (msg.type) {
        case 'state':
          set({ view: msg.state, clockOffset: msg.serverNow - Date.now() });
          break;
        case 'welcome':
          set({ welcomed: true, playerId: msg.playerId });
          break;
        case 'joined':
          storage.set(playerTokenKey(code), msg.playerToken);
          set({ playerId: msg.playerId });
          break;
        case 'error':
          if (msg.requestId) break; // handled by the request's caller
          if (msg.code === 'TOKEN_INVALID') {
            storage.remove(playerTokenKey(code));
            set({ playerId: null });
          }
          get().toast(msg.message, 'error');
          break;
      }
    };

    connection = new GameConnection(code, {
      hello: () => {
        if (role === 'host') return { type: 'hello', role, hostToken: storage.get(hostTokenKey(code)) ?? '' };
        if (role === 'player') return { type: 'hello', role, playerToken: storage.get(playerTokenKey(code)) };
        return { type: 'hello', role: 'display' };
      },
      onMessage: handleMessage,
      onStatus: (status) => set({ status }),
    });
    connection.start();
  },

  disconnect: () => {
    connection?.stop();
    connection = null;
  },

  request: async (msg, opts) => {
    if (!connection) return null;
    try {
      return await connection.request(msg);
    } catch (err) {
      if (!opts?.quiet) {
        get().toast(err instanceof RequestError ? err.message : 'Something went wrong.', 'error');
      }
      return null;
    }
  },

  toast: (text, tone = 'info') => {
    const id = ++toastSeq;
    set((s) => ({ toasts: [...s.toasts.slice(-2), { id, text, tone }] }));
    setTimeout(() => get().dismissToast(id), 4000);
  },

  dismissToast: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
}));

/** Last request error, for forms that want to show it inline instead of a toast. */
export async function requestWithError(
  msg: DistributiveOmit<Outgoing, 'requestId'>,
): Promise<{ ok: true; reply: ServerMessage } | { ok: false; message: string }> {
  if (!connection) return { ok: false, message: 'Not connected.' };
  try {
    return { ok: true, reply: await connection.request(msg) };
  } catch (err) {
    return { ok: false, message: err instanceof RequestError ? err.message : 'Something went wrong.' };
  }
}
