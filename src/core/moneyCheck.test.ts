import { describe, expect, it } from 'vitest';
import questionFile from '../data/questions.json';
import { HELD_OUT } from '../data/moneyCheckForms.ts';
import { CSV_HEADER, resultsCsv, toCsv } from './csv.ts';
import { checkIds, formFor, improvement, postCheckReady, scoreCheck } from './moneyCheck.ts';
import { TOPIC_ZONE_ORDER } from './progression.ts';
import { newSlot } from './save.ts';
import type { QuestionFile } from './types.ts';
import { TOPICS } from './types.ts';

const BANK = new Map((questionFile as unknown as QuestionFile).questions.map((q) => [q.id, q]));

describe('Money Check', () => {
  it('pre uses the first form, post the other (counterbalanced)', () => {
    expect([formFor('A', 'pre'), formFor('A', 'post'), formFor('B', 'pre'), formFor('B', 'post')]).toEqual(['A', 'B', 'B', 'A']);
  });
  it('a form is 12 held-out questions, topics alternating', () => {
    const ids = checkIds('K-5', 'A');
    expect(ids).toHaveLength(12);
    expect(ids.every((id) => HELD_OUT.has(id))).toBe(true);
    expect(ids.slice(0, 6).map((id) => BANK.get(id)!.topic)).toEqual([...TOPICS]);
  });
  it('scores per topic and total, and shows improvement', () => {
    const qs = checkIds('6-8', 'A').map((id) => BANK.get(id)!);
    const pre = scoreCheck(qs, Object.fromEntries(qs.slice(0, 5).map((q) => [q.id, true])), '6-8', 'A', new Date('2026-11-07'));
    expect(pre.total).toBe(5);
    expect(pre.perTopic['Spending and Saving']).toBe(1);
    const qs2 = checkIds('6-8', 'B').map((id) => BANK.get(id)!);
    const post = scoreCheck(qs2, Object.fromEntries(qs2.map((q) => [q.id, true])), '6-8', 'B', new Date('2026-12-01'));
    expect(post.total).toBe(12);
    expect(improvement(pre, post).total).toBe(7);
    expect(improvement(pre, post).perTopic['Spending and Saving']).toBe(1);
  });
  it('Money Check 2 opens after all six bosses, once', () => {
    const s = newSlot('Fox', 'K-5', 'A');
    expect(postCheckReady(s, TOPIC_ZONE_ORDER)).toBe(false);
    const done = { ...s, progress: { ...s.progress, zonesCleared: [...TOPIC_ZONE_ORDER] } };
    expect(postCheckReady(done, TOPIC_ZONE_ORDER)).toBe(true);
    const r = scoreCheck([], {}, 'K-5', 'B');
    expect(postCheckReady({ ...done, moneyCheck: { ...done.moneyCheck, post: r } }, TOPIC_ZONE_ORDER)).toBe(false);
  });
});

describe('CSV export', () => {
  it('escapes commas, quotes and newlines', () => {
    expect(toCsv([['a,b', 'say "hi"', 'x\ny', 3]])).toBe('"a,b","say ""hi""","x\ny",3\r\n');
  });
  it('one row per test per save, with nickname, date, band, form, per-topic, total and improvement', () => {
    const qs = checkIds('K-5', 'B').map((id) => BANK.get(id)!);
    const pre = scoreCheck(qs, { [qs[0]!.id]: true }, 'K-5', 'B', new Date('2026-11-07'));
    const post = scoreCheck(qs, { [qs[0]!.id]: true, [qs[1]!.id]: true, [qs[2]!.id]: true }, 'K-5', 'A', new Date('2026-12-01'));
    const a = { ...newSlot('Fox', 'K-5', 'B'), moneyCheck: { firstForm: 'B' as const, pre, post } };
    const b = { ...newSlot('Owl', 'K-5', 'A'), moneyCheck: { firstForm: 'A' as const, pre: null, post: null } };
    const lines = resultsCsv([a, null, b]).trim().split('\r\n');
    expect(lines[0]).toBe(CSV_HEADER.join(','));
    expect(lines).toHaveLength(3); // Owl hasn't taken a check yet
    expect(lines[1]).toBe('Fox,pre,2026-11-07,K-5,B,1,0,0,0,0,0,1,');
    expect(lines[2]!.endsWith(',3,2')).toBe(true);
  });
});
