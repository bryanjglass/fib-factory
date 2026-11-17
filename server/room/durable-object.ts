/**
 * Cloudflare Durable Object adapter: one instance per room code.
 *
 * Uses the WebSocket Hibernation API so idle rooms cost nothing, and the
 * Durable Object alarm for authoritative phase timers (they keep firing even
 * with zero clients connected, and survive the object being evicted).
 */
import { DurableObject } from 'cloudflare:workers';
import { PING_TEXT, PONG_TEXT } from '../../shared/protocol';
import { makeBank } from '../bank';
import type { GameState } from '../engine/types';
import { randomToken, secureRandom } from '../engine/random';
import { RoomController, type ConnMeta, type Connection } from './controller';

export interface Env {
  ROOMS: DurableObjectNamespace;
  ALLOWED_ORIGINS?: string;
}

const STATE_KEY = 'game';
const bank = makeBank();

function wrap(ws: WebSocket): Connection {
  return {
    send: (text) => ws.send(text),
    close: (code, reason) => {
      try {
        ws.close(code, reason);
      } catch {
        /* already closed */
      }
    },
    getMeta: () => (ws.deserializeAttachment() as ConnMeta | null) ?? null,
    setMeta: (meta) => ws.serializeAttachment(meta),
  };
}

export class FibRoom extends DurableObject<Env> {
  private readonly controller: RoomController;

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair(PING_TEXT, PONG_TEXT));
    this.controller = new RoomController({
      storage: {
        load: async () => (await ctx.storage.get<GameState>(STATE_KEY)) ?? null,
        save: (state) => ctx.storage.put(STATE_KEY, state),
        setAlarm: async (at) => {
          if (at === null) await ctx.storage.deleteAlarm();
          else await ctx.storage.setAlarm(at);
        },
        clear: async () => {
          await ctx.storage.deleteAlarm();
          await ctx.storage.deleteAll();
        },
      },
      connections: () => ctx.getWebSockets().filter((ws) => ws.readyState === WebSocket.OPEN).map(wrap),
      now: () => Date.now(),
      rng: secureRandom,
      token: randomToken,
      bank,
    });
    void ctx.blockConcurrencyWhile(() => this.controller.reconcile());
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === '/init' && request.method === 'POST') {
      const { code } = (await request.json()) as { code: string };
      const result = await this.controller.initialize(code);
      return result.ok
        ? Response.json({ code, hostToken: result.hostToken })
        : new Response('room code taken', { status: 409 });
    }
    if (url.pathname === '/exists') {
      return Response.json({ exists: await this.controller.exists() });
    }
    if (url.pathname === '/ws') {
      if (request.headers.get('Upgrade')?.toLowerCase() !== 'websocket') {
        return new Response('Expected a WebSocket upgrade', { status: 426 });
      }
      const pair = new WebSocketPair();
      const [client, server] = [pair[0], pair[1]];
      this.ctx.acceptWebSocket(server);
      await this.controller.onOpen(wrap(server));
      return new Response(null, { status: 101, webSocket: client });
    }
    return new Response('Not found', { status: 404 });
  }

  async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer): Promise<void> {
    await this.controller.onMessage(wrap(ws), message);
  }

  async webSocketClose(ws: WebSocket, code: number, reason: string): Promise<void> {
    await this.controller.onClose(wrap(ws));
    try {
      ws.close(code === 1005 || code === 1006 ? 1000 : code, reason);
    } catch {
      /* already closed */
    }
  }

  async webSocketError(ws: WebSocket): Promise<void> {
    await this.controller.onClose(wrap(ws));
  }

  async alarm(): Promise<void> {
    await this.controller.onAlarm();
  }
}
