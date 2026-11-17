/**
 * A self-healing WebSocket to one game room.
 *
 * - Sends `hello` on every (re)connect, so the server re-attaches identity.
 * - Reconnects with capped exponential backoff, and immediately when the tab
 *   becomes visible again or the network comes back (phones sleep a lot!).
 * - Sends keep-alive pings and treats prolonged silence as a dead socket.
 * - Correlates requests with ack/error replies via `requestId`.
 */
import { PING_TEXT, type ClientMessage, type ErrorCode, type ServerMessage } from '../../../shared/protocol';
import { SERVER_WS } from '../config';

export type ConnectionStatus = 'connecting' | 'open' | 'reconnecting' | 'notFound' | 'unauthorized' | 'stopped';

export class RequestError extends Error {
  constructor(
    public code: ErrorCode | 'TIMEOUT' | 'OFFLINE',
    message: string,
  ) {
    super(message);
  }
}

type Outgoing = Exclude<ClientMessage, { type: 'ping' }>;
type DistributiveOmit<T, K extends keyof any> = T extends unknown ? Omit<T, K> : never;

interface Pending {
  resolve: (msg: ServerMessage) => void;
  reject: (err: RequestError) => void;
  timer: ReturnType<typeof setTimeout>;
}

export interface ConnectionHandlers {
  hello: () => Outgoing;
  onMessage: (msg: ServerMessage) => void;
  onStatus: (status: ConnectionStatus) => void;
}

const PING_EVERY_MS = 15_000;
const SILENCE_LIMIT_MS = 40_000;
const REQUEST_TIMEOUT_MS = 10_000;

export class GameConnection {
  private ws: WebSocket | null = null;
  private attempts = 0;
  private stopped = false;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private pingTimer: ReturnType<typeof setInterval> | null = null;
  private lastHeard = 0;
  private pending = new Map<string, Pending>();
  private seq = 0;

  constructor(
    private readonly code: string,
    private readonly handlers: ConnectionHandlers,
  ) {}

  start() {
    this.stopped = false;
    window.addEventListener('online', this.wake);
    document.addEventListener('visibilitychange', this.wake);
    this.open();
  }

  stop() {
    this.stopped = true;
    window.removeEventListener('online', this.wake);
    document.removeEventListener('visibilitychange', this.wake);
    this.clearTimers();
    this.ws?.close(1000, 'bye');
    this.ws = null;
    this.failAll(new RequestError('OFFLINE', 'Disconnected.'));
    this.handlers.onStatus('stopped');
  }

  /** Send a message and wait for the server's ack (or error). */
  request(msg: DistributiveOmit<Outgoing, 'requestId'>): Promise<ServerMessage> {
    const ws = this.ws;
    if (!ws || ws.readyState !== WebSocket.OPEN) {
      return Promise.reject(new RequestError('OFFLINE', 'Reconnecting… try again in a moment.'));
    }
    const requestId = `r${++this.seq}`;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(requestId);
        reject(new RequestError('TIMEOUT', 'The server did not answer. Try again.'));
      }, REQUEST_TIMEOUT_MS);
      this.pending.set(requestId, { resolve, reject, timer });
      ws.send(JSON.stringify({ ...msg, requestId }));
    });
  }

  private wake = () => {
    if (this.stopped || document.visibilityState === 'hidden') return;
    const state = this.ws?.readyState;
    if (state === WebSocket.OPEN) {
      // Probe a possibly-dead socket after the phone wakes up.
      this.ws!.send(PING_TEXT);
      return;
    }
    if (state !== WebSocket.CONNECTING) {
      this.attempts = 0;
      this.open();
    }
  };

  private open() {
    this.clearTimers();
    if (this.stopped) return;
    this.handlers.onStatus(this.attempts === 0 ? 'connecting' : 'reconnecting');
    let ws: WebSocket;
    try {
      ws = new WebSocket(`${SERVER_WS}/api/rooms/${this.code}/ws`);
    } catch {
      return this.scheduleReconnect();
    }
    this.ws = ws;

    ws.onopen = () => {
      this.attempts = 0;
      this.lastHeard = Date.now();
      ws.send(JSON.stringify(this.handlers.hello()));
      this.handlers.onStatus('open');
      this.pingTimer = setInterval(() => {
        if (Date.now() - this.lastHeard > SILENCE_LIMIT_MS) {
          ws.close(4000, 'silent'); // triggers reconnect
          return;
        }
        if (ws.readyState === WebSocket.OPEN) ws.send(PING_TEXT);
      }, PING_EVERY_MS);
    };

    ws.onmessage = (ev) => {
      this.lastHeard = Date.now();
      let msg: ServerMessage;
      try {
        msg = JSON.parse(String(ev.data));
      } catch {
        return;
      }
      if (msg.type === 'pong') return;
      const requestId = 'requestId' in msg ? msg.requestId : undefined;
      if (requestId && this.pending.has(requestId)) {
        const p = this.pending.get(requestId)!;
        this.pending.delete(requestId);
        clearTimeout(p.timer);
        if (msg.type === 'error') p.reject(new RequestError(msg.code, msg.message));
        else p.resolve(msg);
        if (msg.type === 'ack') return;
      }
      this.handlers.onMessage(msg);
    };

    ws.onclose = (ev) => {
      if (this.ws !== ws) return;
      this.ws = null;
      this.clearTimers();
      this.failAll(new RequestError('OFFLINE', 'Connection lost.'));
      if (this.stopped) return;
      if (ev.code === 4004) return this.handlers.onStatus('notFound');
      if (ev.code === 4003) return this.handlers.onStatus('unauthorized');
      this.scheduleReconnect();
    };
    ws.onerror = () => {
      /* onclose follows */
    };
  }

  private scheduleReconnect() {
    if (this.stopped) return;
    this.handlers.onStatus('reconnecting');
    const delay = Math.min(5000, 400 * 2 ** this.attempts) + Math.random() * 300;
    this.attempts++;
    this.reconnectTimer = setTimeout(() => this.open(), delay);
  }

  private clearTimers() {
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    if (this.pingTimer) clearInterval(this.pingTimer);
    this.reconnectTimer = null;
    this.pingTimer = null;
  }

  private failAll(err: RequestError) {
    for (const p of this.pending.values()) {
      clearTimeout(p.timer);
      p.reject(err);
    }
    this.pending.clear();
  }
}
