import { makeBank } from '../server/bank';
import type { Question } from '../server/questions';
import { createGame, addPlayer } from '../server/engine/game';
import { seededRandom } from '../server/engine/random';
import type { EngineContext, GameState } from '../server/engine/types';
import type { Connection, ConnMeta, RoomStorage } from '../server/room/controller';
import { RoomController } from '../server/room/controller';
import type { GameView, ServerMessage } from '../shared/protocol';

export const TEST_QUESTIONS: Question[] = Array.from({ length: 12 }, (_, i) => ({
  id: `t${i + 1}`,
  text: `Test question ${i + 1}: the answer is _____.`,
  answer: `Truth ${i + 1}`,
  alsoAccept: [`real ${i + 1}`],
}));

export const testBank = makeBank(TEST_QUESTIONS);

/** A controllable clock + deterministic randomness for engine tests. */
export function makeCtx(seed = 1) {
  const clock = { now: 1_700_000_000_000 };
  const rng = seededRandom(seed);
  let n = 0;
  const ctx = (): EngineContext => ({
    now: clock.now,
    rng,
    bank: testBank,
    makeId: () => `id${++n}`,
  });
  return { clock, ctx };
}

export function gameWithPlayers(names: string[], seed = 1) {
  const { clock, ctx } = makeCtx(seed);
  const s: GameState = createGame('TEST', 'host-secret', clock.now);
  const players = names.map((name, i) => addPlayer(s, name, { id: `p${i + 1}`, token: `tok${i + 1}` }, ctx()));
  return { s, clock, ctx, players };
}

// ---------------------------------------------------------------------------
// Fake transport for RoomController integration tests
// ---------------------------------------------------------------------------

export class FakeConnection implements Connection {
  meta: ConnMeta | null = null;
  open = true;
  messages: ServerMessage[] = [];
  closedWith: { code: number; reason: string } | null = null;

  constructor(private readonly onClosed: (c: FakeConnection) => void) {}

  send(text: string) {
    if (!this.open) throw new Error('socket closed');
    this.messages.push(JSON.parse(text));
  }
  close(code: number, reason: string) {
    this.closedWith = { code, reason };
    this.open = false;
    this.onClosed(this);
  }
  getMeta() {
    return this.meta;
  }
  setMeta(meta: ConnMeta) {
    this.meta = meta;
  }

  /** Latest state snapshot received. */
  get state(): GameView {
    const states = this.messages.filter((m): m is Extract<ServerMessage, { type: 'state' }> => m.type === 'state');
    if (!states.length) throw new Error('no state received yet');
    return states[states.length - 1]!.state;
  }
  errors() {
    return this.messages.filter((m): m is Extract<ServerMessage, { type: 'error' }> => m.type === 'error');
  }
  lastError() {
    return this.errors().at(-1);
  }
  clear() {
    this.messages = [];
  }
  raw(): string {
    return JSON.stringify(this.messages);
  }
}

export class MemoryStorage implements RoomStorage {
  data: GameState | null = null;
  alarm: number | null = null;
  saves = 0;
  async load() {
    return this.data ? structuredClone(this.data) : null;
  }
  async save(state: GameState) {
    this.saves++;
    this.data = structuredClone(state);
  }
  async setAlarm(at: number | null) {
    this.alarm = at;
  }
  async clear() {
    this.data = null;
    this.alarm = null;
  }
}

let tokenCounter = 0;

/**
 * A room harness that behaves like the Durable Object: a controller backed by
 * memory storage, fake sockets, a fake clock and an alarm we fire manually.
 */
export class RoomHarness {
  clock = { now: 1_700_000_000_000 };
  storage: MemoryStorage;
  conns: FakeConnection[] = [];
  controller!: RoomController;
  hostToken = '';

  constructor(storage = new MemoryStorage(), public seed = 7) {
    this.storage = storage;
    this.boot();
  }

  /** (Re)create the controller, as happens when a Durable Object is evicted and reactivated. */
  boot() {
    const rng = seededRandom(this.seed);
    this.controller = new RoomController({
      storage: this.storage,
      connections: () => this.conns.filter((c) => c.open),
      now: () => this.clock.now,
      rng,
      token: (bytes = 16) => `tk${++tokenCounter}_${bytes}_${Math.floor(rng() * 1e9).toString(36)}`,
      bank: testBank,
    });
    return this.controller;
  }

  async create(code = 'BCDF') {
    const res = await this.controller.initialize(code);
    if (!res.ok) throw new Error('room exists');
    this.hostToken = res.hostToken;
    return res;
  }

  async connect(): Promise<FakeConnection> {
    const conn = new FakeConnection(() => {});
    this.conns.push(conn);
    await this.controller.onOpen(conn);
    return conn;
  }

  async send(conn: FakeConnection, msg: unknown) {
    await this.controller.onMessage(conn, JSON.stringify(msg));
  }

  async host() {
    const c = await this.connect();
    await this.send(c, { type: 'hello', role: 'host', hostToken: this.hostToken });
    return c;
  }

  async display() {
    const c = await this.connect();
    await this.send(c, { type: 'hello', role: 'display' });
    return c;
  }

  async player(name: string) {
    const c = await this.connect();
    await this.send(c, { type: 'hello', role: 'player' });
    await this.send(c, { type: 'join', name });
    const joined = c.messages.find((m) => m.type === 'joined') as Extract<ServerMessage, { type: 'joined' }> | undefined;
    return { conn: c, id: joined?.playerId ?? '', token: joined?.playerToken ?? '' };
  }

  async drop(conn: FakeConnection) {
    conn.open = false;
    await this.controller.onClose(conn);
  }

  /** Advance the fake clock and fire the alarm if it's due (like the DO runtime would). */
  async advanceTime(ms: number) {
    this.clock.now += ms;
    if (this.storage.alarm !== null && this.storage.alarm <= this.clock.now) {
      await this.controller.onAlarm();
    }
  }

  /** Fire alarms repeatedly until the given phase is reached (bounded). */
  async runUntilPhase(phase: string, maxSteps = 50) {
    for (let i = 0; i < maxSteps; i++) {
      if (this.storage.data?.phase === phase) return;
      const at = this.storage.alarm;
      if (at === null) throw new Error(`no alarm scheduled while waiting for ${phase}`);
      this.clock.now = Math.max(this.clock.now, at);
      await this.controller.onAlarm();
    }
    throw new Error(`never reached ${phase}`);
  }
}
