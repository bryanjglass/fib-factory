/**
 * RoomController — the authoritative brain of one game room.
 *
 * It is deliberately independent of Cloudflare APIs: the Durable Object
 * adapter supplies storage, live connections, a clock and randomness. That
 * lets integration tests drive the exact same message-handling code with fake
 * sockets and a fake clock.
 */
import {
  MAX_MESSAGE_BYTES,
  PONG_TEXT,
  type ClientMessage,
  type ErrorCode,
  type HostAction,
  type Role,
  type ServerMessage,
} from '../../shared/protocol';
import { GameError } from '../engine/errors';
import * as game from '../engine/game';
import type { EngineContext, GameState, QuestionBank } from '../engine/types';
import { buildView } from '../engine/views';

export interface ConnMeta {
  connId: string;
  role: Role;
  playerId: string | null;
}

export interface Connection {
  send(text: string): void;
  close(code: number, reason: string): void;
  getMeta(): ConnMeta | null;
  setMeta(meta: ConnMeta): void;
}

export interface RoomStorage {
  load(): Promise<GameState | null>;
  save(state: GameState): Promise<void>;
  setAlarm(at: number | null): Promise<void>;
  clear(): Promise<void>;
}

export interface RoomDeps {
  storage: RoomStorage;
  /** Currently open connections (sockets) attached to this room. */
  connections: () => Connection[];
  now: () => number;
  rng: () => number;
  token: (bytes?: number) => string;
  bank: QuestionBank;
}

/** Rooms with no activity for this long are deleted. */
export const ROOM_TTL_MS = 12 * 60 * 60 * 1000;

export const CLOSE_CODES = {
  roomNotFound: 4004,
  notAuthorized: 4003,
} as const;

function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

function parse(raw: string | ArrayBuffer): ClientMessage | null {
  const text = typeof raw === 'string' ? raw : new TextDecoder().decode(raw);
  if (text.length > MAX_MESSAGE_BYTES) return null;
  try {
    const msg = JSON.parse(text);
    return msg && typeof msg === 'object' && typeof msg.type === 'string' ? (msg as ClientMessage) : null;
  } catch {
    return null;
  }
}

export class RoomController {
  private state: GameState | null = null;
  private loaded = false;

  constructor(private readonly deps: RoomDeps) {}

  /** Exposed for tests and diagnostics only. */
  get snapshot(): GameState | null {
    return this.state;
  }

  async load(): Promise<void> {
    if (this.loaded) return;
    this.state = await this.deps.storage.load();
    this.loaded = true;
  }

  async exists(): Promise<boolean> {
    await this.load();
    return this.state !== null;
  }

  /** Creates the room. Fails if a room already lives in this object (code collision). */
  async initialize(code: string): Promise<{ ok: true; hostToken: string } | { ok: false }> {
    await this.load();
    if (this.state) return { ok: false };
    const hostToken = this.deps.token(32);
    this.state = game.createGame(code, hostToken, this.deps.now());
    await this.persist();
    return { ok: true, hostToken };
  }

  /**
   * After the object is (re)activated, sockets may have closed while it was
   * away. Re-derive presence from the sockets that are actually open, and catch
   * up on any timer that expired in the meantime.
   */
  async reconcile(): Promise<void> {
    await this.load();
    const s = this.state;
    if (!s) return;
    const live = new Set(this.liveConnections().map((c) => c.getMeta()?.playerId).filter(Boolean));
    const stale = s.players.some((p) => p.connected !== live.has(p.id));
    if (stale) {
      await this.mutate((draft, ctx) => {
        for (const p of draft.players) game.setConnected(draft, p.id, live.has(p.id), ctx);
      });
    }
    await this.runTimers();
  }

  // -------------------------------------------------------------------------
  // Socket events
  // -------------------------------------------------------------------------

  async onOpen(conn: Connection): Promise<void> {
    await this.load();
    if (!this.state) {
      this.sendTo(conn, { type: 'error', code: 'ROOM_NOT_FOUND', message: 'That room does not exist (or has expired).' });
      conn.close(CLOSE_CODES.roomNotFound, 'room not found');
    }
  }

  async onMessage(conn: Connection, raw: string | ArrayBuffer): Promise<void> {
    await this.load();
    const msg = parse(raw);
    if (!msg) return this.sendError(conn, 'BAD_MESSAGE', 'Unreadable message.');
    if (msg.type === 'ping') return conn.send(PONG_TEXT);
    if (!this.state) {
      this.sendError(conn, 'ROOM_NOT_FOUND', 'That room does not exist (or has expired).');
      return conn.close(CLOSE_CODES.roomNotFound, 'room not found');
    }
    // Apply any overdue timer first so late actions are judged against the real phase.
    await this.runTimers();
    const requestId = 'requestId' in msg && typeof msg.requestId === 'string' ? msg.requestId.slice(0, 64) : undefined;
    try {
      await this.dispatch(conn, msg, requestId);
    } catch (err) {
      if (err instanceof GameError) {
        this.sendError(conn, err.code, err.message, requestId);
      } else {
        console.error('Unexpected error handling message', err);
        this.sendError(conn, 'BAD_MESSAGE', 'Something went wrong.', requestId);
      }
    }
  }

  async onClose(conn: Connection): Promise<void> {
    await this.load();
    const meta = conn.getMeta();
    if (!meta || !this.state) return;
    const others = this.liveConnections().filter((c) => c.getMeta()?.connId !== meta.connId);
    if (meta.playerId && !others.some((c) => c.getMeta()?.playerId === meta.playerId)) {
      await this.mutate((draft, ctx) => game.setConnected(draft, meta.playerId!, false, ctx), meta.connId);
    } else {
      this.broadcast(meta.connId); // e.g. host presence changed
    }
  }

  async onAlarm(): Promise<void> {
    await this.load();
    const s = this.state;
    if (!s) return;
    const now = this.deps.now();
    if (now - s.updatedAt >= ROOM_TTL_MS && this.liveConnections().length === 0) {
      // Abandoned room: wipe it so the code can be reused.
      this.state = null;
      await this.deps.storage.clear();
      return;
    }
    const changed = await this.runTimers();
    if (!changed) await this.scheduleAlarm();
  }

  // -------------------------------------------------------------------------
  // Dispatch
  // -------------------------------------------------------------------------

  private async dispatch(conn: Connection, msg: ClientMessage, requestId?: string) {
    if (msg.type === 'hello') return this.hello(conn, msg, requestId);
    const meta = conn.getMeta();
    if (!meta) throw new GameError('BAD_MESSAGE', 'Say hello first.');

    switch (msg.type) {
      case 'join': {
        if (meta.role !== 'player') throw new GameError('NOT_AUTHORIZED', 'Only players can join.');
        if (meta.playerId) {
          // Idempotent: a retried join just gets the same identity back.
          const p = this.state!.players.find((x) => x.id === meta.playerId);
          if (p) return this.sendTo(conn, { type: 'joined', playerId: p.id, playerToken: p.token, requestId });
        }
        const ids = { id: this.deps.token(9), token: this.deps.token(24) };
        await this.mutate((draft, ctx) => {
          game.addPlayer(draft, msg.name, ids, ctx);
          conn.setMeta({ ...meta, playerId: ids.id });
        });
        this.sendTo(conn, { type: 'joined', playerId: ids.id, playerToken: ids.token, requestId });
        return;
      }
      case 'submitFib': {
        const pid = this.requirePlayer(meta);
        await this.mutate((draft, ctx) => void game.submitFib(draft, pid, msg.text, ctx));
        return this.ack(conn, requestId);
      }
      case 'vote': {
        const pid = this.requirePlayer(meta);
        await this.mutate((draft, ctx) => game.castVote(draft, pid, msg.choiceId, ctx));
        return this.ack(conn, requestId);
      }
      case 'host': {
        if (meta.role !== 'host') throw new GameError('NOT_AUTHORIZED', 'Only the host can do that.');
        await this.hostAction(msg.action);
        return this.ack(conn, requestId);
      }
      default:
        throw new GameError('BAD_MESSAGE', 'Unknown message type.');
    }
  }

  private async hello(conn: Connection, msg: Extract<ClientMessage, { type: 'hello' }>, requestId?: string) {
    const s = this.state!;
    const connId = conn.getMeta()?.connId ?? this.deps.token(9);
    if (msg.role === 'host') {
      if (typeof msg.hostToken !== 'string' || !safeEqual(msg.hostToken, s.hostToken)) {
        this.sendError(conn, 'NOT_AUTHORIZED', 'This browser is not the host of that room.', requestId);
        conn.close(CLOSE_CODES.notAuthorized, 'not authorized');
        return;
      }
      conn.setMeta({ connId, role: 'host', playerId: null });
      this.sendTo(conn, { type: 'welcome', role: 'host', playerId: null, requestId });
      return this.broadcast(); // everyone learns the host is (back) online
    }
    if (msg.role === 'display') {
      conn.setMeta({ connId, role: 'display', playerId: null });
      this.sendTo(conn, { type: 'welcome', role: 'display', playerId: null, requestId });
      return this.sendState(conn);
    }
    if (msg.role === 'player') {
      const token = typeof msg.playerToken === 'string' ? msg.playerToken : null;
      const player = token ? s.players.find((p) => safeEqual(p.token, token)) : undefined;
      if (player) {
        conn.setMeta({ connId, role: 'player', playerId: player.id });
        this.sendTo(conn, { type: 'welcome', role: 'player', playerId: player.id, requestId });
        if (!player.connected) {
          await this.mutate((draft, ctx) => game.setConnected(draft, player.id, true, ctx));
        } else {
          this.sendState(conn);
        }
        return;
      }
      conn.setMeta({ connId, role: 'player', playerId: null });
      if (token) this.sendError(conn, 'TOKEN_INVALID', 'Your old seat is gone — join again!');
      this.sendTo(conn, { type: 'welcome', role: 'player', playerId: null, requestId });
      return this.sendState(conn);
    }
    throw new GameError('BAD_MESSAGE', 'Unknown role.');
  }

  private async hostAction(action: HostAction) {
    if (!action || typeof action !== 'object') throw new GameError('BAD_MESSAGE', 'Missing action.');
    switch (action.kind) {
      case 'updateSettings':
        return this.mutate((d) => game.updateSettings(d, action.settings));
      case 'start':
        return this.mutate((d, ctx) => game.startGame(d, ctx));
      case 'advance':
        return this.mutate((d, ctx) => game.advance(d, ctx, action.expect));
      case 'pause':
        return this.mutate((d, ctx) => game.pause(d, ctx));
      case 'resume':
        return this.mutate((d, ctx) => game.resume(d, ctx));
      case 'rematch':
        return this.mutate((d) => game.rematch(d));
      case 'restart':
        return this.mutate((d) => game.restart(d));
      case 'removePlayer': {
        const removedId = action.playerId;
        await this.mutate((d) => game.removePlayer(d, removedId));
        for (const c of this.liveConnections()) {
          const m = c.getMeta();
          if (m?.playerId === removedId) {
            c.setMeta({ ...m, playerId: null });
            this.sendError(c, 'TOKEN_INVALID', 'The host removed you from the game.');
            this.sendState(c);
          }
        }
        return;
      }
      default:
        throw new GameError('BAD_MESSAGE', 'Unknown host action.');
    }
  }

  private requirePlayer(meta: ConnMeta): string {
    if (meta.role !== 'player' || !meta.playerId) throw new GameError('NOT_JOINED', 'Join the game first.');
    return meta.playerId;
  }

  // -------------------------------------------------------------------------
  // State management
  // -------------------------------------------------------------------------

  private ctx(): EngineContext {
    return {
      now: this.deps.now(),
      rng: this.deps.rng,
      bank: this.deps.bank,
      makeId: () => this.deps.token(6),
    };
  }

  /** Apply `fn` to a copy of the state; commit, persist and broadcast only if it succeeds. */
  private async mutate(fn: (draft: GameState, ctx: EngineContext) => void, excludeConnId?: string) {
    const draft = structuredClone(this.state!);
    const ctx = this.ctx();
    fn(draft, ctx);
    draft.updatedAt = ctx.now;
    this.state = draft;
    await this.persist();
    this.broadcast(excludeConnId);
  }

  /** Processes an expired timer, if any. Returns true when the phase changed. */
  private async runTimers(): Promise<boolean> {
    if (!this.state) return false;
    const draft = structuredClone(this.state);
    const ctx = this.ctx();
    if (!game.tick(draft, ctx)) return false;
    this.state = draft;
    await this.persist();
    this.broadcast();
    return true;
  }

  private async persist() {
    await this.deps.storage.save(this.state!);
    await this.scheduleAlarm();
  }

  private async scheduleAlarm() {
    const s = this.state;
    if (!s) return this.deps.storage.setAlarm(null);
    const expiry = Math.max(s.updatedAt + ROOM_TTL_MS, this.deps.now() + 60_000);
    const deadline = game.nextDeadline(s);
    await this.deps.storage.setAlarm(deadline === null ? expiry : Math.min(deadline, expiry));
  }

  private liveConnections(): Connection[] {
    return this.deps.connections();
  }

  private broadcast(excludeConnId?: string) {
    for (const c of this.liveConnections()) {
      const meta = c.getMeta();
      if (!meta || meta.connId === excludeConnId) continue;
      this.sendState(c, excludeConnId);
    }
  }

  private sendState(conn: Connection, excludeConnId?: string) {
    const meta = conn.getMeta();
    if (!meta || !this.state) return;
    const hostConnected = this.liveConnections().some(
      (c) => c.getMeta()?.role === 'host' && c.getMeta()?.connId !== excludeConnId,
    );
    const now = this.deps.now();
    this.sendTo(conn, {
      type: 'state',
      state: buildView(this.state, { role: meta.role, playerId: meta.playerId }, now, this.deps.bank, hostConnected),
      serverNow: now,
    });
  }

  private sendTo(conn: Connection, msg: ServerMessage) {
    try {
      conn.send(JSON.stringify(msg));
    } catch {
      // Socket already gone; presence is handled by onClose.
    }
  }

  private ack(conn: Connection, requestId?: string) {
    if (requestId) this.sendTo(conn, { type: 'ack', requestId });
  }

  private sendError(conn: Connection, code: ErrorCode, message: string, requestId?: string) {
    this.sendTo(conn, { type: 'error', code, message, requestId });
  }
}
