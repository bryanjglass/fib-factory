import type { CreateRoomResponse } from '../../../shared/protocol';
import { SERVER_HTTP } from '../config';

export async function createRoom(): Promise<CreateRoomResponse> {
  const res = await fetch(`${SERVER_HTTP}/api/rooms`, { method: 'POST' });
  if (!res.ok) throw new Error(`Could not create a game (HTTP ${res.status}).`);
  return (await res.json()) as CreateRoomResponse;
}

export async function roomExists(code: string): Promise<boolean> {
  const res = await fetch(`${SERVER_HTTP}/api/rooms/${encodeURIComponent(code)}`);
  if (res.status === 404) return false;
  if (!res.ok) throw new Error(`Server error (HTTP ${res.status}).`);
  return true;
}
