// Money Check: the pre-test (start of the game) and post-test (after the sixth boss). 12 questions,
// 2 per topic; each player takes form A then B, or B then A (picked at random when the save is made).
import type { FormId } from '../data/moneyCheckForms.ts';
import { MONEY_CHECK_FORMS } from '../data/moneyCheckForms.ts';
import type { CheckResult, Slot } from './save.ts';
import type { Band, Question, Topic } from './types.ts';
import { TOPICS } from './types.ts';

export type Which = 'pre' | 'post';

export const formFor = (first: FormId, which: Which): FormId => (which === 'pre' ? first : first === 'A' ? 'B' : 'A');

/** The form's 12 question IDs, interleaved so topics alternate (one of each topic, then the second of each). */
export function checkIds(band: Band, form: FormId): string[] {
  const ids = MONEY_CHECK_FORMS[band][form];
  return [...ids.filter((_, i) => i % 2 === 0), ...ids.filter((_, i) => i % 2 === 1)];
}

/** Score: right answers per topic (0–2) and in total (0–12). */
export function scoreCheck(questions: readonly Question[], right: Record<string, boolean>, band: Band, form: FormId, date = new Date()): CheckResult {
  const perTopic = Object.fromEntries(TOPICS.map((t) => [t, 0])) as Record<Topic, number>;
  for (const q of questions) if (right[q.id]) perTopic[q.topic]++;
  return { date: date.toISOString().slice(0, 10), band, form, perTopic, total: Object.values(perTopic).reduce((a, b) => a + b, 0) };
}

/** Post minus pre, per topic and total. */
export function improvement(pre: CheckResult, post: CheckResult): { perTopic: Record<Topic, number>; total: number } {
  const perTopic = Object.fromEntries(TOPICS.map((t) => [t, post.perTopic[t] - pre.perTopic[t]])) as Record<Topic, number>;
  return { perTopic, total: post.total - pre.total };
}

/** Money Check 2 opens after all six topic bosses, once. */
export const postCheckReady = (s: Slot, topicZones: readonly string[]) => s.moneyCheck.post === null && topicZones.every((z) => s.progress.zonesCleared.includes(z));
