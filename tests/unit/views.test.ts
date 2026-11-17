import { describe, expect, it } from 'vitest';
import * as g from '../../server/engine/game';
import { buildView } from '../../server/engine/views';
import { gameWithPlayers, testBank } from '../helpers';

function setup() {
  const t = gameWithPlayers(['Abby', 'Owen', 'Dad']);
  g.startGame(t.s, t.ctx());
  const answer = testBank.get(t.s.round!.questionId)!.answer;
  const views = () =>
    [
      buildView(t.s, { role: 'player', playerId: 'p1' }, t.clock.now, testBank, true),
      buildView(t.s, { role: 'display', playerId: null }, t.clock.now, testBank, true),
      buildView(t.s, { role: 'host', playerId: null }, t.clock.now, testBank, true),
    ].map((v) => JSON.stringify(v));
  return { ...t, answer, views };
}

describe('secrecy of views', () => {
  it('never includes the answer before the round is scored, for any role', () => {
    const t = setup();
    for (const v of t.views()) expect(v).not.toContain(t.answer); // question intro
    g.advance(t.s, t.ctx());
    g.submitFib(t.s, 'p1', 'secret fib one', t.ctx());
    for (const v of t.views()) {
      expect(v).not.toContain(t.answer); // submission
    }
    // Other players' fib contents are hidden during submission.
    const p2view = JSON.stringify(buildView(t.s, { role: 'player', playerId: 'p2' }, t.clock.now, testBank, true));
    expect(p2view).not.toContain('secret fib one');
    g.submitFib(t.s, 'p2', 'secret fib two', t.ctx());
    g.submitFib(t.s, 'p3', 'secret fib three', t.ctx());
    expect(t.s.phase).toBe('voting');
    for (const v of t.views()) {
      // The ballot contains the answer *text* anonymously, but nothing marks it as the truth.
      expect(v).not.toContain('isTruth');
      expect(v).not.toContain('authorIds');
      expect(v).not.toContain('truthId');
      expect(v).not.toContain('"answer"');
    }
  });

  it('shows the same ballot order to every viewer, without authorship', () => {
    const t = setup();
    g.advance(t.s, t.ctx());
    t.players.forEach((p, i) => g.submitFib(t.s, p.id, `fib ${i}`, t.ctx()));
    const ballots = ['p1', 'p2', 'p3'].map(
      (id) => buildView(t.s, { role: 'player', playerId: id }, t.clock.now, testBank, true).ballot,
    );
    expect(ballots[0]).toEqual(ballots[1]);
    expect(ballots[1]).toEqual(ballots[2]);
    expect(Object.keys(ballots[0]![0]!).sort()).toEqual(['id', 'text']);
    // Each player privately learns which entry is their own (so it can be disabled).
    const me = buildView(t.s, { role: 'player', playerId: 'p2' }, t.clock.now, testBank, true).me!;
    expect(t.s.round!.ballot!.find((e) => e.id === me.ownBallotId)!.authorIds).toEqual(['p2']);
  });

  it('never leaks tokens', () => {
    const t = setup();
    for (const v of t.views()) {
      expect(v).not.toContain('host-secret');
      expect(v).not.toContain('tok1');
    }
  });

  it('reveals the truth, authors and voters once voting is complete', () => {
    const t = setup();
    g.advance(t.s, t.ctx());
    t.players.forEach((p, i) => g.submitFib(t.s, p.id, `fib ${i}`, t.ctx()));
    const truth = t.s.round!.ballot!.find((e) => e.isTruth)!.id;
    t.players.forEach((p) => g.castVote(t.s, p.id, truth, t.ctx()));
    const v = buildView(t.s, { role: 'display', playerId: null }, t.clock.now, testBank, true);
    expect(v.phase).toBe('reveal');
    expect(v.reveal!.answer).toBe(t.answer);
    expect(v.reveal!.entries.find((e) => e.isTruth)!.voterIds).toEqual(['p1', 'p2', 'p3']);
    expect(v.reveal!.entries.find((e) => e.authorIds[0] === 'p1')!.text).toBe('fib 0');
  });

  it('reports submission progress without contents', () => {
    const t = setup();
    g.advance(t.s, t.ctx());
    g.submitFib(t.s, 'p3', 'zebra stripes', t.ctx());
    const v = buildView(t.s, { role: 'display', playerId: null }, t.clock.now, testBank, true);
    expect(v.submittedIds).toEqual(['p3']);
    expect(JSON.stringify(v)).not.toContain('zebra');
  });
});
