import type { QuestionBank } from './engine/types';
import { QUESTIONS, type Question } from './questions';

export function makeBank(questions: readonly Question[] = QUESTIONS): QuestionBank {
  const byId = new Map(questions.map((q) => [q.id, q]));
  return { all: questions, get: (id) => byId.get(id) };
}
