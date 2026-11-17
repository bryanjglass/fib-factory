import { describe, expect, it } from 'vitest';
import { scoreRound } from '../../server/engine/scoring';
import type { BallotEntry } from '../../server/engine/types';

const ballot: BallotEntry[] = [
  { id: 'T', text: 'truth', isTruth: true, authorIds: [] },
  { id: 'A', text: 'abby fib', isTruth: false, authorIds: ['abby'] },
  { id: 'O', text: 'owen fib', isTruth: false, authorIds: ['owen'] },
  { id: 'D', text: 'dad fib', isTruth: false, authorIds: ['dad'] },
];
const everyone = ['abby', 'owen', 'dad', 'mom'];
const authors = new Set(['abby', 'owen', 'dad']);

describe('scoreRound', () => {
  it('awards exactly 1000 for finding the truth', () => {
    const r = scoreRound(ballot, { mom: 'T' }, everyone, authors);
    expect(r.mom!.truthPoints).toBe(1000);
    expect(r.mom!.total).toBe(1000);
    expect(r.mom!.foundTruth).toBe(true);
  });

  it('awards 500 per opponent fooled (spec example: Abby fools Owen and Dad, and finds the truth)', () => {
    const r = scoreRound(ballot, { owen: 'A', dad: 'A', abby: 'T' }, everyone, authors);
    expect(r.abby!.fibPoints).toBe(1000);
    expect(r.abby!.truthPoints).toBe(1000);
    expect(r.abby!.total).toBe(2000);
    expect(r.abby!.fooledIds.sort()).toEqual(['dad', 'owen']);
    expect(r.owen!.total).toBe(0);
    expect(r.owen!.fooledBy).toBe('abby');
    expect(r.dad!.fooledBy).toBe('abby');
  });

  it('awards 500 for a single fooled player', () => {
    const r = scoreRound(ballot, { mom: 'O' }, everyone, authors);
    expect(r.owen!.fibPoints).toBe(500);
    expect(r.mom!.total).toBe(0);
  });

  it('gives nothing for a vote on your own fib', () => {
    const r = scoreRound(ballot, { abby: 'A' }, everyone, authors);
    expect(r.abby!.total).toBe(0);
    expect(r.abby!.votedFor).toBeNull();
  });

  it('gives no voting points to non-voters and no fib points to non-submitters', () => {
    const r = scoreRound(ballot, { abby: 'T', owen: 'T' }, everyone, authors);
    expect(r.mom!.total).toBe(0);
    expect(r.mom!.votedFor).toBeNull();
    expect(r.mom!.submitted).toBe(false);
    expect(r.dad!.total).toBe(0);
  });

  it('ignores votes from non-contestants and unknown entries', () => {
    const r = scoreRound(ballot, { stranger: 'A', mom: 'ZZZ' }, everyone, authors);
    expect(r.abby!.total).toBe(0);
    expect(r.mom!.total).toBe(0);
    expect(r.stranger).toBeUndefined();
  });

  it('is deterministic', () => {
    const votes = { owen: 'A', dad: 'O', mom: 'T', abby: 'D' };
    expect(scoreRound(ballot, votes, everyone, authors)).toEqual(scoreRound(ballot, votes, everyone, authors));
  });
});
