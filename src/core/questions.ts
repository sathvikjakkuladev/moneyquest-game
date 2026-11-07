// Question selection: a shuffled bag per topic and band (no repeats until it's empty), missed
// questions coming back 3–5 questions later until answered right, per-topic accuracy, and options
// shuffled at every showing. Pure and serialisable, so it lives in the save.

import type { Rng } from './rng.ts';
import { between, shuffle } from './rng.ts';
import type { Band, Question, Topic } from './types.ts';

export type Pool = string; // `${topic}|${band}`
export const poolOf = (topic: Topic, band: Band): Pool => `${topic}|${band}`;

export interface Miss { id: string; pool: Pool; due: number }
export interface Accuracy { answered: number; correct: number }
export interface QuestionState {
  bags: Record<Pool, string[]>;
  last: Record<Pool, string>;
  drawn: Record<Pool, number>;
  misses: Miss[];
  accuracy: Partial<Record<Topic, Accuracy>>;
}
export const newQuestionState = (): QuestionState => ({ bags: {}, last: {}, drawn: {}, misses: [], accuracy: {} });

/** Questions battles may use for a topic and band (Money Check questions held out). */
export const battlePool = (bank: readonly Question[], topic: Topic, band: Band, heldOut: ReadonlySet<string>) =>
  bank.filter((q) => q.topic === topic && q.band === band && !heldOut.has(q.id)).map((q) => q.id);

export function draw(state: QuestionState, pool: Pool, ids: readonly string[], rng: Rng): { state: QuestionState; id: string } {
  if (!ids.length) throw new Error(`No questions in pool ${pool}`);
  const n = (state.drawn[pool] ?? 0) + 1;
  const due = state.misses.filter((m) => m.pool === pool && m.due <= n && ids.includes(m.id)).sort((a, b) => a.due - b.due)[0];
  let bag = (state.bags[pool] ?? []).filter((id) => ids.includes(id));
  let id: string;
  if (due) id = due.id;
  else {
    if (!bag.length) {
      bag = shuffle(ids, rng);
      if (bag.length > 1 && bag[0] === state.last[pool]) [bag[0], bag[1]] = [bag[1]!, bag[0]!]; // no back-to-back repeat across rounds
    }
    id = bag.shift()!;
  }
  return {
    id,
    state: { ...state, bags: { ...state.bags, [pool]: bag }, last: { ...state.last, [pool]: id }, drawn: { ...state.drawn, [pool]: n }, misses: due ? state.misses.filter((m) => m !== due) : state.misses },
  };
}

export function record(state: QuestionState, pool: Pool, q: Pick<Question, 'id' | 'topic'>, right: boolean, rng: Rng): QuestionState {
  const a = state.accuracy[q.topic] ?? { answered: 0, correct: 0 };
  const others = state.misses.filter((m) => m.id !== q.id);
  return {
    ...state,
    misses: right ? others : [...others, { id: q.id, pool, due: (state.drawn[pool] ?? 0) + between(rng, 3, 5) }],
    accuracy: { ...state.accuracy, [q.topic]: { answered: a.answered + 1, correct: a.correct + (right ? 1 : 0) } },
  };
}

export interface Shown { id: string; topic: Topic; question: string; options: string[]; correct: number; explanation: string }

/** The question as shown: options in a fresh order, `correct` remapped to match. */
export function show(q: Question, rng: Rng): Shown {
  const order = shuffle([0, 1, 2, 3], rng);
  return { id: q.id, topic: q.topic, question: q.question, options: order.map((i) => q.options[i]!), correct: order.indexOf(q.correct), explanation: q.explanation };
}

/**
 * Bonus zones mix all six topics, weighted toward the player's weakest: weight = 1 + 2 × (1 − accuracy),
 * so a topic answered 0% right is 3× as likely as one answered 100% right. Topics not yet tried
 * count as 50%.
 */
export function pickTopic(accuracy: QuestionState['accuracy'], topics: readonly Topic[], rng: Rng): Topic {
  const w = topics.map((t) => {
    const a = accuracy[t];
    const acc = a && a.answered ? a.correct / a.answered : 0.5;
    return 1 + 2 * (1 - acc);
  });
  let r = rng() * w.reduce((x, y) => x + y, 0);
  for (let i = 0; i < topics.length; i++) if ((r -= w[i]!) < 0) return topics[i]!;
  return topics[topics.length - 1]!;
}
