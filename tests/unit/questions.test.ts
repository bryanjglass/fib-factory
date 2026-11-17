import { describe, expect, it } from 'vitest';
import { QUESTIONS } from '../../server/questions';
import { looseKey } from '../../shared/text';

describe('question bank', () => {
  it('has at least 50 questions', () => {
    expect(QUESTIONS.length).toBeGreaterThanOrEqual(50);
  });

  it('has unique ids and unique question text', () => {
    expect(new Set(QUESTIONS.map((q) => q.id)).size).toBe(QUESTIONS.length);
    expect(new Set(QUESTIONS.map((q) => q.text)).size).toBe(QUESTIONS.length);
  });

  it('every question has exactly one blank and a non-empty answer', () => {
    for (const q of QUESTIONS) {
      expect(q.text.match(/_____/g), q.id).toHaveLength(1);
      expect(q.answer.trim().length, q.id).toBeGreaterThan(0);
      expect(q.answer.length, q.id).toBeLessThanOrEqual(40);
    }
  });

  it('never gives the answer away in the question text', () => {
    for (const q of QUESTIONS) {
      const text = looseKey(q.text.replace('_____', ' '));
      expect(text.split(' ').join(' ').includes(` ${looseKey(q.answer)} `), q.id).toBe(false);
    }
  });

  it('supports text, numbers and short phrases', () => {
    expect(QUESTIONS.some((q) => /^\d+$/.test(q.answer))).toBe(true);
    expect(QUESTIONS.some((q) => q.answer.includes(' '))).toBe(true);
    expect(QUESTIONS.some((q) => /^[A-Za-z]+$/.test(q.answer))).toBe(true);
  });

  it('is not importable from the client bundle', async () => {
    const { readdirSync, readFileSync, statSync } = await import('node:fs');
    const { join } = await import('node:path');
    const walk = (dir: string): string[] =>
      readdirSync(dir).flatMap((f) => {
        const p = join(dir, f);
        return statSync(p).isDirectory() ? walk(p) : [p];
      });
    for (const file of [...walk('client/src'), ...walk('shared')]) {
      expect(readFileSync(file, 'utf8'), file).not.toMatch(/server\/(questions|bank)/);
    }
  });
});
