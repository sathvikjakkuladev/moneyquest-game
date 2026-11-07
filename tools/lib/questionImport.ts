// Turns the question-bank CSV (plus reviewed overrides) into validated Question objects.
// Every problem is collected and reported together; any problem means nothing is written.

import type { Band, Question, Topic } from '../../src/core/types.ts';
import { BANDS, TOPICS } from '../../src/core/types.ts';
import { parseCsv } from './csv.ts';

export const HEADER = ['id', 'topic', 'grade_band', 'question', 'option_a', 'option_b', 'option_c', 'option_d', 'correct', 'explanation'] as const;
type Field = (typeof HEADER)[number];
export type Override = Partial<Record<Exclude<Field, 'id' | 'topic' | 'grade_band'>, string>> & { reason: string };
export type Overrides = Record<string, Override>;

const OVERRIDABLE = new Set(['question', 'option_a', 'option_b', 'option_c', 'option_d', 'correct', 'explanation', 'reason']);

export interface ImportResult { questions: Question[]; errors: string[]; applied: string[] }

export function importQuestions(csvText: string, overrides: Overrides = {}): ImportResult {
  const errors: string[] = [];
  let rows: string[][];
  try {
    rows = parseCsv(csvText);
  } catch (e) {
    return { questions: [], errors: [(e as Error).message], applied: [] };
  }
  const header = rows.shift() ?? [];
  if (header.join(',') !== HEADER.join(',')) errors.push(`Header must be: ${HEADER.join(',')} (got: ${header.join(',')})`);

  const ids = new Set<string>();
  for (const [id, o] of Object.entries(overrides)) {
    if (!o.reason?.trim()) errors.push(`Override ${id} has no reason`);
    for (const k of Object.keys(o)) if (!OVERRIDABLE.has(k)) errors.push(`Override ${id} changes "${k}", which can't be overridden`);
  }

  const questions: Question[] = [];
  const applied: string[] = [];
  rows.forEach((raw, i) => {
    const line = i + 2;
    if (raw.length !== HEADER.length) {
      errors.push(`Line ${line}: expected ${HEADER.length} fields, found ${raw.length}`);
      return;
    }
    const r = Object.fromEntries(HEADER.map((h, j) => [h, raw[j]!.trim()])) as Record<Field, string>;
    const o = overrides[r.id];
    if (o) {
      for (const [k, v] of Object.entries(o)) if (k !== 'reason') r[k as Field] = String(v).trim();
      applied.push(r.id);
    }
    const where = `Line ${line} (${r.id || 'no id'})`;
    if (!/^[A-Z]{2}-[EM]-\d{2}$/.test(r.id)) errors.push(`${where}: id should look like ES-E-01`);
    if (ids.has(r.id)) errors.push(`${where}: duplicate id`);
    ids.add(r.id);
    if (!TOPICS.includes(r.topic as Topic)) errors.push(`${where}: unknown topic "${r.topic}"`);
    if (!BANDS.includes(r.grade_band as Band)) errors.push(`${where}: grade_band must be K-5 or 6-8`);
    else if ((r.grade_band === 'K-5') !== (r.id[3] === 'E')) errors.push(`${where}: id band letter doesn't match grade_band`);
    const options = [r.option_a, r.option_b, r.option_c, r.option_d];
    for (const f of ['question', 'option_a', 'option_b', 'option_c', 'option_d', 'explanation'] as const) if (!r[f]) errors.push(`${where}: ${f} is empty`);
    if (new Set(options.map((s) => s.toLowerCase())).size !== 4) errors.push(`${where}: two options are the same`);
    const letter = r.correct.toUpperCase();
    if (!/^[ABCD]$/.test(letter)) errors.push(`${where}: correct must be A, B, C or D (got "${r.correct}")`);
    questions.push({
      id: r.id,
      topic: r.topic as Topic,
      band: r.grade_band as Band,
      question: r.question,
      options: options as Question['options'],
      correct: Math.max(0, 'ABCD'.indexOf(letter)) as Question['correct'],
      explanation: r.explanation,
    });
  });
  for (const id of Object.keys(overrides)) if (!ids.has(id)) errors.push(`Override ${id} matches no question`);
  return { questions, errors, applied };
}

/** How often the correct option is strictly the longest (a "pick the longest" giveaway). */
export const longestIsCorrect = (qs: readonly Question[]) =>
  qs.filter((q) => {
    const len = q.options.map((o) => o.length);
    const c = len[q.correct]!;
    return len.every((l, i) => i === q.correct || l < c);
  }).length;
