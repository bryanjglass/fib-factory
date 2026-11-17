import { describe, expect, it } from 'vitest';
import worker from '../../server/index';
import { ROOM_CODE_PATTERN } from '../../shared/protocol';
import { RoomHarness } from '../helpers';

/** A fake Durable Object namespace: one RoomHarness per room name. */
function fakeEnv(opts: { takenFirst?: number; allowedOrigins?: string } = {}) {
  const rooms = new Map<string, RoomHarness>();
  let refusals = opts.takenFirst ?? 0;
  const ns = {
    idFromName: (name: string) => name,
    get: (name: string) => ({
      fetch: async (input: string | Request, init?: RequestInit) => {
        const req = typeof input === 'string' ? new Request(input, init) : input;
        const url = new URL(req.url);
        let room = rooms.get(name);
        if (url.pathname === '/init') {
          if (refusals > 0) {
            refusals--;
            return new Response('taken', { status: 409 });
          }
          room ??= new RoomHarness();
          rooms.set(name, room);
          const res = await room.controller.initialize(name);
          return res.ok ? Response.json({ code: name, hostToken: res.hostToken }) : new Response('taken', { status: 409 });
        }
        if (url.pathname === '/exists') return Response.json({ exists: !!room && (await room.controller.exists()) });
        return new Response('ws', { status: 200 });
      },
    }),
  };
  return { env: { ROOMS: ns as any, ALLOWED_ORIGINS: opts.allowedOrigins ?? '*' }, rooms };
}

const post = (path: string, headers: Record<string, string> = {}) =>
  new Request(`https://api.example${path}`, { method: 'POST', headers });

describe('worker routing', () => {
  it('creates rooms with unique, human-readable codes', async () => {
    const { env, rooms } = fakeEnv();
    const codes = new Set<string>();
    for (let i = 0; i < 25; i++) {
      const res = await worker.fetch(post('/api/rooms'), env);
      expect(res.status).toBe(201);
      const body = (await res.json()) as { code: string; hostToken: string };
      expect(body.code).toMatch(ROOM_CODE_PATTERN);
      expect(body.hostToken).toBeTruthy();
      codes.add(body.code);
    }
    expect(codes.size).toBe(rooms.size);
  });

  it('retries with a new code when a code is already taken', async () => {
    const { env } = fakeEnv({ takenFirst: 3 });
    const res = await worker.fetch(post('/api/rooms'), env);
    expect(res.status).toBe(201);
  });

  it('reports whether a room exists', async () => {
    const { env } = fakeEnv();
    const { code } = (await (await worker.fetch(post('/api/rooms'), env)).json()) as { code: string };
    const yes = await worker.fetch(new Request(`https://api.example/api/rooms/${code.toLowerCase()}`), env);
    expect(yes.status).toBe(200);
    const no = await worker.fetch(new Request('https://api.example/api/rooms/ZZZZ'), env);
    expect(no.status).toBe(404);
    const bad = await worker.fetch(new Request('https://api.example/api/rooms/AEIO'), env);
    expect(bad.status).toBe(404);
  });

  it('enforces the origin allow-list when configured', async () => {
    const { env } = fakeEnv({ allowedOrigins: 'https://family.github.io' });
    const denied = await worker.fetch(post('/api/rooms', { Origin: 'https://evil.example' }), env);
    expect(denied.status).toBe(403);
    const ok = await worker.fetch(post('/api/rooms', { Origin: 'https://family.github.io' }), env);
    expect(ok.status).toBe(201);
    expect(ok.headers.get('Access-Control-Allow-Origin')).toBe('https://family.github.io');
  });

  it('answers CORS preflight', async () => {
    const { env } = fakeEnv();
    const res = await worker.fetch(new Request('https://api.example/api/rooms', { method: 'OPTIONS' }), env);
    expect(res.status).toBe(204);
    expect(res.headers.get('Access-Control-Allow-Methods')).toContain('POST');
  });
});
