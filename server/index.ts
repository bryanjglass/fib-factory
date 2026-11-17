/**
 * Fib Factory Worker entry point.
 *
 *   POST /api/rooms              → create a room, returns { code, hostToken }
 *   GET  /api/rooms/:code        → { exists }
 *   GET  /api/rooms/:code/ws     → WebSocket upgrade, forwarded to the room's Durable Object
 *   GET  /api/health             → "ok"
 */
import { ROOM_CODE_PATTERN, type CreateRoomResponse } from '../shared/protocol';
import { randomRoomCode } from './engine/random';
import type { Env } from './room/durable-object';

export { FibRoom } from './room/durable-object';

function corsHeaders(request: Request, env: Env): Record<string, string> {
  const origin = request.headers.get('Origin') ?? '';
  const allowed = (env.ALLOWED_ORIGINS ?? '*').split(',').map((s) => s.trim()).filter(Boolean);
  const allowOrigin = allowed.includes('*') ? '*' : allowed.includes(origin) ? origin : allowed[0] ?? '';
  return {
    'Access-Control-Allow-Origin': allowOrigin,
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  };
}

function originAllowed(request: Request, env: Env): boolean {
  const allowed = (env.ALLOWED_ORIGINS ?? '*').split(',').map((s) => s.trim());
  if (allowed.includes('*')) return true;
  const origin = request.headers.get('Origin');
  return !origin || allowed.includes(origin);
}

function json(data: unknown, init: ResponseInit, cors: Record<string, string>): Response {
  return Response.json(data, { ...init, headers: { ...cors, ...(init.headers ?? {}) } });
}

function roomStub(env: Env, code: string) {
  return env.ROOMS.get(env.ROOMS.idFromName(code));
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const cors = corsHeaders(request, env);
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });

    if (url.pathname === '/api/health') return new Response('ok', { headers: cors });

    if (url.pathname === '/api/rooms' && request.method === 'POST') {
      if (!originAllowed(request, env)) return json({ error: 'origin not allowed' }, { status: 403 }, cors);
      // Room codes are unique: each code maps to exactly one Durable Object,
      // and /init refuses if that object already holds a live room.
      for (let attempt = 0; attempt < 20; attempt++) {
        const code = randomRoomCode();
        const res = await roomStub(env, code).fetch('https://room/init', {
          method: 'POST',
          body: JSON.stringify({ code }),
        });
        if (res.ok) return json((await res.json()) as CreateRoomResponse, { status: 201 }, cors);
      }
      return json({ error: 'Could not allocate a room code, try again.' }, { status: 503 }, cors);
    }

    const match = url.pathname.match(/^\/api\/rooms\/([A-Za-z]+)(\/ws)?$/);
    if (match) {
      const code = match[1]!.toUpperCase();
      if (!ROOM_CODE_PATTERN.test(code)) return json({ exists: false }, { status: 404 }, cors);
      const stub = roomStub(env, code);
      if (match[2]) {
        if (!originAllowed(request, env)) return new Response('origin not allowed', { status: 403 });
        return stub.fetch(new Request('https://room/ws', request));
      }
      const res = await stub.fetch('https://room/exists');
      const body = (await res.json()) as { exists: boolean };
      return json(body, { status: body.exists ? 200 : 404 }, cors);
    }

    return json({ error: 'Not found' }, { status: 404 }, cors);
  },
} satisfies ExportedHandler<Env>;
