// Money Check (pre- and post-test) forms: 12 questions each, 2 per topic, two fixed forms per band.
// These 48 questions are held out of battles, so the post-test isn't something a player just saw.
// Rule (a draft for the student to review): in every topic, questions 03 and 11 are form A and
// 07 and 15 are form B, which spreads each form across the topic's list.

import type { Band } from '../core/types.ts';

const TOPIC_CODES = ['ES', 'CD', 'EI', 'IN', 'RI', 'FD'] as const;
const form = (band: 'E' | 'M', nums: string[]) => TOPIC_CODES.flatMap((t) => nums.map((n) => `${t}-${band}-${n}`));

export type FormId = 'A' | 'B';
export const MONEY_CHECK_FORMS: Record<Band, Record<FormId, string[]>> = {
  'K-5': { A: form('E', ['03', '11']), B: form('E', ['07', '15']) },
  '6-8': { A: form('M', ['03', '11']), B: form('M', ['07', '15']) },
};

export const HELD_OUT: ReadonlySet<string> = new Set(Object.values(MONEY_CHECK_FORMS).flatMap((f) => [...f.A, ...f.B]));
