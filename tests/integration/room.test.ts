import { beforeEach, describe, expect, it } from 'vitest';
import { ROOM_TTL_MS } from '../../server/room/controller';
import { TIMING, type GameView } from '../../shared/protocol';
import { RoomHarness, testBank, type FakeConnection } from '../helpers';

type Seat = Awaited<ReturnType<RoomHarness['player']>>;

let room: RoomHarness;

beforeEach(async () => {
  room = new RoomHarness();
  await room.create();
});

async function lobbyWithThree() {
  const host = await room.host();
  const tv = await room.display();
  const abby = await room.player('Abby');
  const owen = await room.player('Owen');
  const dad = await room.player('Dad');
  return { host, tv, abby, owen, dad, players: [abby, owen, dad] };
}

async function startAndSkipIntro(host: FakeConnection) {
  await room.send(host, { type: 'host', action: { kind: 'start' } });
  expect(room.storage.data!.phase).toBe('question');
  await room.runUntilPhase('submission');
}

function answerOfCurrentRound() {
  return testBank.get(room.storage.data!.round!.questionId)!.answer;
}

function ballotIdFor(view: GameView, text: string) {
  return view.ballot!.find((b) => b.text === text)!.id;
}

/** The truth is whichever ballot entry nobody at the table wrote. */
function truthIdFor(view: GameView, fibs: string[]) {
  return view.ballot!.find((b) => !fibs.includes(b.text))!.id;
}

describe('room creation & auth', () => {
  it('refuses to initialize a code that is already in use', async () => {
    const again = await room.controller.initialize('BCDF');
    expect(again.ok).toBe(false);
  });

  it('host token grants host privileges; a wrong token is rejected and disconnected', async () => {
    const host = await room.host();
    expect(host.messages.find((m) => m.type === 'welcome')).toMatchObject({ role: 'host' });
    expect(host.state.isHost).toBe(true);

    const impostor = await room.connect();
    await room.send(impostor, { type: 'hello', role: 'host', hostToken: 'guess' });
    expect(impostor.lastError()?.code).toBe('NOT_AUTHORIZED');
    expect(impostor.closedWith?.code).toBe(4003);
  });

  it('only the host can start, advance or restart', async () => {
    const { tv, abby } = await lobbyWithThree();
    for (const conn of [tv, abby.conn]) {
      for (const kind of ['start', 'advance', 'restart', 'pause']) {
        await room.send(conn, { type: 'host', action: { kind } });
        expect(conn.lastError()?.code).toBe('NOT_AUTHORIZED');
      }
    }
    expect(room.storage.data!.phase).toBe('lobby');
  });

  it('rejects messages before hello and malformed messages', async () => {
    const c = await room.connect();
    await room.controller.onMessage(c, '{not json');
    expect(c.lastError()?.code).toBe('BAD_MESSAGE');
    await room.send(c, { type: 'vote', choiceId: 'x' });
    expect(c.lastError()?.code).toBe('BAD_MESSAGE');
    await room.controller.onMessage(c, 'x'.repeat(10_000));
    expect(c.lastError()?.code).toBe('BAD_MESSAGE');
  });

  it('closes sockets for rooms that do not exist', async () => {
    const empty = new RoomHarness();
    const c = await empty.connect();
    expect(c.lastError()?.code).toBe('ROOM_NOT_FOUND');
    expect(c.closedWith?.code).toBe(4004);
  });
});

describe('lobby', () => {
  it('joins players and updates every screen in real time', async () => {
    const tv = await room.display();
    const abby = await room.player('Abby');
    expect(abby.id).toBeTruthy();
    expect(abby.token.length).toBeGreaterThan(10);
    expect(tv.state.players.map((p) => p.name)).toEqual(['Abby']);
    await room.player('Owen');
    expect(tv.state.players.map((p) => p.name)).toEqual(['Abby', 'Owen']);
    expect(abby.conn.state.me?.name).toBe('Abby');
  });

  it('rejects duplicate names ignoring case', async () => {
    await room.player('Abby');
    const dupe = await room.player('aBBy');
    expect(dupe.id).toBe('');
    expect(dupe.conn.lastError()?.code).toBe('NAME_TAKEN');
    expect(room.storage.data!.players).toHaveLength(1);
  });

  it('shows disconnects in the lobby', async () => {
    const tv = await room.display();
    const abby = await room.player('Abby');
    await room.drop(abby.conn);
    expect(tv.state.players[0]!.connected).toBe(false);
  });

  it('refuses to start with fewer than 3 players', async () => {
    const host = await room.host();
    await room.player('Abby');
    await room.player('Owen');
    expect(host.state.canStart.ok).toBe(false);
    await room.send(host, { type: 'host', action: { kind: 'start' }, requestId: 'r1' });
    expect(host.lastError()).toMatchObject({ code: 'NOT_ENOUGH_PLAYERS', requestId: 'r1' });
    expect(room.storage.data!.phase).toBe('lobby');
  });

  it('applies host settings', async () => {
    const host = await room.host();
    await room.send(host, { type: 'host', action: { kind: 'updateSettings', settings: { questionCount: 5, submitSeconds: 30, voteSeconds: 20 } } });
    expect(host.state.settings).toEqual({ questionCount: 5, submitSeconds: 30, voteSeconds: 20 });
    await room.send(host, { type: 'host', action: { kind: 'updateSettings', settings: { questionCount: 4 } } });
    expect(host.lastError()?.code).toBe('INVALID_SETTINGS');
  });

  it('a retried join returns the same identity instead of a duplicate player', async () => {
    const abby = await room.player('Abby');
    await room.send(abby.conn, { type: 'join', name: 'Abby' });
    const joins = abby.conn.messages.filter((m) => m.type === 'joined');
    expect(joins).toHaveLength(2);
    expect(joins[1]).toMatchObject({ playerId: abby.id, playerToken: abby.token });
    expect(room.storage.data!.players).toHaveLength(1);
  });

  it('late arrivals wait for the next game', async () => {
    const { host } = await lobbyWithThree();
    await startAndSkipIntro(host);
    const late = await room.player('Grandma');
    expect(late.conn.state.me?.status).toBe('waiting');
    await room.send(late.conn, { type: 'submitFib', text: 'hi' });
    expect(late.conn.lastError()?.code).toBe('NOT_A_CONTESTANT');
  });
});

describe('a full round over the wire', () => {
  it('keeps the truth secret until the reveal, then scores correctly', async () => {
    const { host, tv, abby, owen, dad, players } = await lobbyWithThree();
    for (const c of [host, tv, ...players.map((p) => p.conn)]) c.clear();
    await startAndSkipIntro(host);
    const answer = answerOfCurrentRound();
    expect(tv.state.question?.text).toBeTruthy();
    expect(tv.state.timer?.durationMs).toBe(60_000);

    // Submissions — the TV sees progress only.
    await room.send(abby.conn, { type: 'submitFib', text: 'Abby fib', requestId: 's1' });
    expect(abby.conn.messages.at(-1)).toEqual({ type: 'ack', requestId: 's1' });
    expect(tv.state.submittedIds).toEqual([abby.id].sort());
    expect(tv.raw()).not.toContain('Abby fib');
    await room.send(owen.conn, { type: 'submitFib', text: 'Owen fib' });
    await room.send(dad.conn, { type: 'submitFib', text: answer.toLowerCase() });
    expect(dad.conn.lastError()?.code).toBe('FIB_IS_TRUTH');
    await room.send(dad.conn, { type: 'submitFib', text: 'abby FIB' });
    expect(dad.conn.lastError()?.code).toBe('FIB_DUPLICATE');

    // Nothing sent to anyone so far contains the answer.
    for (const c of [host, tv, ...players.map((p) => p.conn)]) expect(c.raw()).not.toContain(answer);

    await room.send(dad.conn, { type: 'submitFib', text: 'Dad fib' });
    expect(room.storage.data!.phase).toBe('voting');

    // Everyone sees the same ballot, which contains no truth marker.
    const ballots = players.map((p) => p.conn.state.ballot);
    expect(ballots[0]).toEqual(ballots[1]);
    expect(ballots[0]).toEqual(tv.state.ballot);
    for (const c of [host, tv, ...players.map((p) => p.conn)]) {
      expect(c.raw()).not.toContain('isTruth');
      expect(c.raw()).not.toContain('truthId');
    }

    const view = abby.conn.state;
    const fibs = ['Abby fib', 'Owen fib', 'Dad fib'];
    const truth = truthIdFor(view, fibs);

    await room.send(abby.conn, { type: 'vote', choiceId: ballotIdFor(view, 'Abby fib') });
    expect(abby.conn.lastError()?.code).toBe('VOTE_OWN_FIB');
    await room.send(abby.conn, { type: 'vote', choiceId: truth });
    await room.send(abby.conn, { type: 'vote', choiceId: ballotIdFor(view, 'Owen fib') });
    expect(abby.conn.lastError()?.code).toBe('ALREADY_VOTED');
    expect(tv.state.votedIds).toEqual([abby.id]);
    await room.send(owen.conn, { type: 'vote', choiceId: ballotIdFor(view, 'Abby fib') });
    await room.send(dad.conn, { type: 'vote', choiceId: ballotIdFor(view, 'Abby fib') });

    // Voting complete → reveal with authoritative results.
    expect(tv.state.phase).toBe('reveal');
    const reveal = tv.state.reveal!;
    expect(reveal.answer).toBe(answer);
    expect(reveal.truthId).toBe(truth);
    expect(reveal.results[abby.id]).toMatchObject({ truthPoints: 1000, fibPoints: 1000, total: 2000 });
    expect(reveal.results[owen.id]).toMatchObject({ total: 0, fooledBy: abby.id });
    expect(reveal.entries.find((e) => e.text === 'Abby fib')!.voterIds.sort()).toEqual([owen.id, dad.id].sort());
    expect(reveal.order.at(-1)).toBe(truth);

    // Late / repeated votes do nothing.
    await room.send(owen.conn, { type: 'vote', choiceId: truth });
    expect(owen.conn.lastError()?.code).toBe('WRONG_PHASE');

    await room.runUntilPhase('scoreboard');
    const standings = tv.state.standings;
    expect(standings[0]).toMatchObject({ playerId: abby.id, rank: 1, score: 2000, delta: 2000 });
    expect(standings.slice(1).map((r) => r.rank)).toEqual([2, 2]);
    expect(tv.state.highlights?.biggestBluff).toMatchObject({ authorIds: [abby.id], fooledCount: 2 });
    expect(tv.state.highlights?.truthDetectorIds).toEqual([abby.id]);
  });

  it('duplicate "next" clicks never skip a question or double-score', async () => {
    const { host, players } = await lobbyWithThree();
    await startAndSkipIntro(host);
    const expectSub = { phase: 'submission', round: 1 };
    await room.send(host, { type: 'host', action: { kind: 'advance', expect: expectSub } });
    await room.send(host, { type: 'host', action: { kind: 'advance', expect: expectSub } });
    expect(host.lastError()?.code).toBe('STALE_ACTION');
    expect(room.storage.data!.phase).toBe('voting');

    const ballot = players[0]!.conn.state.ballot!;
    for (const p of players) await room.send(p.conn, { type: 'vote', choiceId: ballot[0]!.id });
    expect(room.storage.data!.phase).toBe('reveal');
    const scores = room.storage.data!.players.map((p) => p.score);
    // Every "Next" press is sent twice (double-click / network retry).
    while (room.storage.data!.phase === 'reveal') {
      const d = room.storage.data!;
      const action = { kind: 'advance', expect: { phase: d.phase, round: 1, step: d.round!.revealStep } };
      await room.send(host, { type: 'host', action });
      await room.send(host, { type: 'host', action });
      expect(host.lastError()?.code).toBe('STALE_ACTION');
    }
    expect(room.storage.data!.phase).toBe('scoreboard');
    expect(room.storage.data!.history).toHaveLength(1);
    expect(room.storage.data!.players.map((p) => p.score)).toEqual(scores);
    expect(room.storage.data!.roundIndex).toBe(0);
  });
});

describe('timers', () => {
  it('advances automatically on expiry, even with nobody connected', async () => {
    const { host, abby, players } = await lobbyWithThree();
    await startAndSkipIntro(host);
    await room.send(abby.conn, { type: 'submitFib', text: 'lonely fib' });
    for (const c of room.conns) await room.drop(c);
    expect(players.every((p) => !p.conn.open)).toBe(true);

    await room.advanceTime(59_000);
    expect(room.storage.data!.phase).toBe('submission');
    await room.advanceTime(1_000);
    expect(room.storage.data!.phase).toBe('voting');
    expect(room.storage.data!.round!.ballot).toHaveLength(2);
    await room.runUntilPhase('scoreboard');
    expect(room.storage.data!.players.every((p) => p.score === 0)).toBe(true);
  });

  it('continues correctly after the Durable Object is evicted and reactivated', async () => {
    const { host } = await lobbyWithThree();
    await room.send(host, { type: 'host', action: { kind: 'start' } });
    const deadline = room.storage.alarm!;
    // Simulate eviction: new controller, same storage, no sockets.
    room.conns = [];
    room.boot();
    room.clock.now = deadline + 5 * 60_000; // woke up very late
    await room.controller.onAlarm();
    expect(room.storage.data!.phase).toBe('submission');
    // The new phase gets its full duration from "now", not from the stale deadline.
    expect(room.storage.alarm).toBe(room.clock.now + 60_000);
  });

  it('reconcile marks players offline whose sockets vanished while evicted', async () => {
    await lobbyWithThree();
    room.conns = [];
    room.boot();
    await room.controller.reconcile();
    expect(room.storage.data!.players.every((p) => !p.connected)).toBe(true);
  });

  it('pause freezes the timer and resume restores the remaining time', async () => {
    const { host, tv } = await lobbyWithThree();
    await startAndSkipIntro(host);
    await room.advanceTime(20_000);
    await room.send(host, { type: 'host', action: { kind: 'pause' } });
    expect(tv.state.paused).toBe(true);
    expect(tv.state.timer?.remainingMs).toBe(40_000);
    await room.advanceTime(10 * 60_000);
    expect(room.storage.data!.phase).toBe('submission');
    await room.send(host, { type: 'host', action: { kind: 'resume' } });
    expect(tv.state.timer?.endsAt).toBe(room.clock.now + 40_000);
    await room.advanceTime(40_000);
    expect(room.storage.data!.phase).toBe('voting');
  });

  it('a late vote arriving after expiry but before the alarm is rejected', async () => {
    const { host, abby } = await lobbyWithThree();
    await startAndSkipIntro(host);
    await room.runUntilPhase('voting');
    const ballot = abby.conn.state.ballot!;
    room.clock.now += 30_000; // timer expired, alarm not yet fired
    await room.send(abby.conn, { type: 'vote', choiceId: ballot[0]!.id });
    expect(abby.conn.lastError()?.code).toBe('WRONG_PHASE');
    expect(room.storage.data!.phase).toBe('reveal');
    expect(room.storage.data!.round!.votes).toEqual({});
  });

  it('expires abandoned rooms', async () => {
    const { host, players } = await lobbyWithThree();
    for (const c of [host, ...players.map((p) => p.conn)]) await room.drop(c);
    for (const c of room.conns) await room.drop(c);
    room.clock.now += ROOM_TTL_MS + 1;
    await room.controller.onAlarm();
    expect(room.storage.data).toBeNull();
    expect(await room.controller.exists()).toBe(false);
  });
});

describe('disconnects and reconnects', () => {
  async function midGame() {
    const seats = await lobbyWithThree();
    await startAndSkipIntro(seats.host);
    return seats;
  }

  it('a disconnected player does not block the phase', async () => {
    const { abby, owen, dad, tv } = await midGame();
    await room.send(abby.conn, { type: 'submitFib', text: 'one' });
    await room.send(owen.conn, { type: 'submitFib', text: 'two' });
    await room.drop(dad.conn);
    expect(tv.state.players.find((p) => p.id === dad.id)!.connected).toBe(false);
    expect(room.storage.data!.phase).toBe('voting');
  });

  it('a returning player keeps identity and score, without duplication', async () => {
    const { abby, owen, dad } = await midGame();
    for (const [p, t] of [[abby, 'a'], [owen, 'b'], [dad, 'c']] as [Seat, string][]) {
      await room.send(p.conn, { type: 'submitFib', text: t });
    }
    const truth = truthIdFor(abby.conn.state, ['a', 'b', 'c']);
    await room.send(abby.conn, { type: 'vote', choiceId: truth });
    await room.drop(abby.conn);

    const back = await room.connect();
    await room.send(back, { type: 'hello', role: 'player', playerToken: abby.token });
    expect(back.messages.find((m) => m.type === 'welcome')).toMatchObject({ playerId: abby.id });
    expect(back.state.me).toMatchObject({ playerId: abby.id, voteId: truth, fib: 'a' });
    expect(back.state.phase).toBe('voting');
    expect(room.storage.data!.players).toHaveLength(3);
    expect(room.storage.data!.players.find((p) => p.id === abby.id)!.connected).toBe(true);

    await room.send(owen.conn, { type: 'vote', choiceId: truth });
    await room.send(dad.conn, { type: 'vote', choiceId: truth });
    expect(back.state.reveal!.results[abby.id]!.total).toBe(1000);

    // Refresh again later: score is retained.
    await room.drop(back);
    const again = await room.connect();
    await room.send(again, { type: 'hello', role: 'player', playerToken: abby.token });
    expect(again.state.players.find((p) => p.id === abby.id)!.score).toBe(1000);
  });

  it('an unknown player token is rejected so the client can re-join', async () => {
    const c = await room.connect();
    await room.send(c, { type: 'hello', role: 'player', playerToken: 'forged-token' });
    expect(c.lastError()?.code).toBe('TOKEN_INVALID');
    expect(c.state.me).toBeNull();
    await room.send(c, { type: 'vote', choiceId: 'x' });
    expect(c.lastError()?.code).toBe('NOT_JOINED');
  });

  it('host refresh restores privileges; host absence does not stop the game', async () => {
    const { host, tv } = await midGame();
    expect(tv.state.hostConnected).toBe(true);
    await room.drop(host);
    expect(tv.state.hostConnected).toBe(false);
    await room.runUntilPhase('voting'); // timers still run without the host
    const host2 = await room.host();
    expect(host2.state.isHost).toBe(true);
    expect(host2.state.phase).toBe('voting');
    expect(tv.state.hostConnected).toBe(true);
    await room.send(host2, { type: 'host', action: { kind: 'advance' } });
    expect(room.storage.data!.phase).toBe('reveal');
  });

  it('display refresh receives the current snapshot immediately', async () => {
    const { tv, abby } = await midGame();
    await room.send(abby.conn, { type: 'submitFib', text: 'zzz' });
    await room.drop(tv);
    const tv2 = await room.display();
    expect(tv2.state.phase).toBe('submission');
    expect(tv2.state.submittedIds).toEqual([abby.id]);
    expect(tv2.state.question?.text).toBe(tv.state.question?.text);
  });

  it('a player connected from two tabs stays online until both close', async () => {
    const { abby, tv } = await midGame();
    const tab2 = await room.connect();
    await room.send(tab2, { type: 'hello', role: 'player', playerToken: abby.token });
    await room.drop(abby.conn);
    expect(tv.state.players.find((p) => p.id === abby.id)!.connected).toBe(true);
    await room.drop(tab2);
    expect(tv.state.players.find((p) => p.id === abby.id)!.connected).toBe(false);
  });
});

describe('room isolation', () => {
  it('tokens from one room are useless in another', async () => {
    const roomA = room;
    const abby = await roomA.player('Abby');
    const roomB = new RoomHarness(undefined, 99);
    await roomB.create('GHJK');
    expect(roomB.hostToken).not.toBe(roomA.hostToken);

    const hostAttempt = await roomB.connect();
    await roomB.send(hostAttempt, { type: 'hello', role: 'host', hostToken: roomA.hostToken });
    expect(hostAttempt.lastError()?.code).toBe('NOT_AUTHORIZED');

    const playerAttempt = await roomB.connect();
    await roomB.send(playerAttempt, { type: 'hello', role: 'player', playerToken: abby.token });
    expect(playerAttempt.lastError()?.code).toBe('TOKEN_INVALID');
    expect(roomB.storage.data!.players).toHaveLength(0);

    const tvB = await roomB.display();
    expect(tvB.state.code).toBe('GHJK');
    expect(JSON.stringify(tvB.messages)).not.toContain('Abby');
  });
});

describe('a complete game and rematch', () => {
  it('plays all questions, ends in game over with awards, and rematches with reset scores', async () => {
    const { host, tv, abby, owen, dad, players } = await lobbyWithThree();
    await room.send(host, { type: 'host', action: { kind: 'updateSettings', settings: { questionCount: 5 } } });
    await room.send(host, { type: 'host', action: { kind: 'start' } });
    const expected: Record<string, number> = { [abby.id]: 0, [owen.id]: 0, [dad.id]: 0 };
    const questionIds = new Set<string>();

    for (let r = 1; r <= 5; r++) {
      await room.runUntilPhase('submission');
      expect(tv.state.round).toBe(r);
      questionIds.add(tv.state.question!.id);
      const fibs = players.map((p, i) => `round ${r} fib ${i}`);
      for (const [i, p] of players.entries()) await room.send(p.conn, { type: 'submitFib', text: fibs[i] });
      const view = abby.conn.state;
      const truth = truthIdFor(view, fibs);
      // Abby finds the truth; Owen falls for Abby's fib; Dad falls for Owen's in odd rounds.
      await room.send(abby.conn, { type: 'vote', choiceId: truth });
      await room.send(owen.conn, { type: 'vote', choiceId: ballotIdFor(view, fibs[0]!) });
      await room.send(dad.conn, { type: 'vote', choiceId: r % 2 ? ballotIdFor(view, fibs[1]!) : truth });
      const add = (id: string, n: number) => (expected[id] = (expected[id] ?? 0) + n);
      add(abby.id, 1000 + 500);
      if (r % 2) add(owen.id, 500);
      else add(dad.id, 1000);
      await room.runUntilPhase('scoreboard');
      for (const p of tv.state.players) expect(p.score).toBe(expected[p.id]);
      await room.send(host, { type: 'host', action: { kind: 'advance', expect: { phase: 'scoreboard', round: r } } });
    }

    expect(questionIds.size).toBe(5);
    expect(tv.state.phase).toBe('gameOver');
    expect(tv.state.standings.map((s) => [s.playerId, s.score, s.rank])).toEqual([
      [abby.id, 7500, 1],
      [dad.id, 2000, 2],
      [owen.id, 1500, 3],
    ]);
    const awards = Object.fromEntries(tv.state.awards.map((a) => [a.id, a]));
    expect(awards.manipulator!.playerIds).toEqual([abby.id]);
    expect(awards.factChecker!.playerIds).toEqual([abby.id]);
    expect(awards.believer!.playerIds).toEqual([owen.id]);

    await room.send(abby.conn, { type: 'host', action: { kind: 'rematch' } });
    expect(abby.conn.lastError()?.code).toBe('NOT_AUTHORIZED');
    await room.send(host, { type: 'host', action: { kind: 'rematch' } });
    expect(tv.state.phase).toBe('lobby');
    expect(tv.state.gameNumber).toBe(2);
    expect(tv.state.players.map((p) => p.score)).toEqual([0, 0, 0]);
    expect(tv.state.players).toHaveLength(3);
    await room.send(host, { type: 'host', action: { kind: 'start' } });
    expect(questionIds.has(room.storage.data!.deck[0]!)).toBe(false);
  });
});

describe('hands-free play', () => {
  it('after Start, the game reaches game over with no further host input', async () => {
    const { host, tv, abby, owen, dad, players } = await lobbyWithThree();
    await room.send(host, { type: 'host', action: { kind: 'updateSettings', settings: { questionCount: 5 } } });
    await room.send(host, { type: 'host', action: { kind: 'start' } });
    const hostMessagesAfterStart = host.messages.length;
    await room.drop(host); // the host can even walk away

    for (let r = 1; r <= 5; r++) {
      await room.runUntilPhase('submission');
      const fibs = players.map((p, i) => `auto ${r} fib ${i}`);
      for (const [i, p] of players.entries()) await room.send(p.conn, { type: 'submitFib', text: fibs[i] });
      const truth = truthIdFor(abby.conn.state, fibs);
      await room.send(abby.conn, { type: 'vote', choiceId: truth });
      await room.send(owen.conn, { type: 'vote', choiceId: ballotIdFor(abby.conn.state, fibs[0]!) });
      await room.send(dad.conn, { type: 'vote', choiceId: truth });
      await room.runUntilPhase('scoreboard');
      expect(tv.state.timer?.durationMs).toBe(TIMING.scoreboardMs);
    }
    await room.runUntilPhase('gameOver');
    expect(host.messages.length).toBe(hostMessagesAfterStart);
    expect(tv.state.standings.map((s) => [s.playerId, s.score])).toEqual([
      [abby.id, 7500],
      [dad.id, 5000],
      [owen.id, 0],
    ]);
    expect(room.storage.data!.history).toHaveLength(5);
  });

  it('even with nobody acting at all, timers carry the game to the end', async () => {
    const { host } = await lobbyWithThree();
    await room.send(host, { type: 'host', action: { kind: 'updateSettings', settings: { questionCount: 5 } } });
    await room.send(host, { type: 'host', action: { kind: 'start' } });
    for (const c of room.conns) await room.drop(c);
    await room.runUntilPhase('gameOver', 100);
    expect(room.storage.data!.players.every((p) => p.score === 0)).toBe(true);
  });

  it('host pause on the scoreboard holds the game until resumed', async () => {
    const { host, tv, players } = await lobbyWithThree();
    await room.send(host, { type: 'host', action: { kind: 'start' } });
    await room.runUntilPhase('voting');
    const ballot = players[0]!.conn.state.ballot!;
    for (const p of players) await room.send(p.conn, { type: 'vote', choiceId: ballot[0]!.id });
    await room.runUntilPhase('scoreboard');
    await room.send(host, { type: 'host', action: { kind: 'pause' } });
    expect(tv.state.paused).toBe(true);
    await room.advanceTime(10 * 60_000);
    expect(room.storage.data!.phase).toBe('scoreboard');
    await room.send(host, { type: 'host', action: { kind: 'resume' } });
    await room.advanceTime(TIMING.scoreboardMs);
    expect(room.storage.data!.phase).toBe('question');
    expect(tv.state.round).toBe(2);
  });
});

describe('question intro', () => {
  it('lasts the configured intro time before submissions open', async () => {
    const { host } = await lobbyWithThree();
    await room.send(host, { type: 'host', action: { kind: 'start' } });
    await room.advanceTime(TIMING.questionIntroMs - 1);
    expect(room.storage.data!.phase).toBe('question');
    await room.advanceTime(1);
    expect(room.storage.data!.phase).toBe('submission');
  });
});
