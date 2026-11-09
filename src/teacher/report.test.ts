import { describe, expect, it } from 'vitest';
import { TOPICS } from '../core/types.ts';
import type { Topic } from '../core/types.ts';
import { parseSummary, summarize, totalCorrect, weekOf } from '../net/progress.ts';
import type { CheckSummary } from '../net/progress.ts';
import { averages, classCsv } from './report.ts';

const check = (total: number, date = '2026-11-07'): CheckSummary => {
  const perTopic = Object.fromEntries(TOPICS.map((t, i) => [t, Math.min(2, Math.max(0, Math.floor(total / 6) + (i < total % 6 ? 1 : 0)))])) as Record<Topic, number>;
  return { date, band: 'K-5', form: 'A', perTopic, total };
};
const students = [
  { name: 'BraveOtter4', progress: { mcPre: check(6), mcPost: check(10) } },
  { name: 'CalmLlama43', progress: { mcPre: check(8), mcPost: null } },
  { name: 'Owl 01', progress: null },
];

describe('class Money Check data', () => {
  it('one CSV row per test taken, with improvement on the post row', () => {
    const lines = classCsv(students).trim().split('\r\n');
    expect(lines).toHaveLength(4);
    expect(lines[0]).toBe('public_name,test,date,band,form,Spending and Saving,Credit and Debt,Employment and Income,Investing,Risk and Insurance,Financial Decision Making,total,improvement');
    expect(lines[1]!.startsWith('BraveOtter4,pre,2026-11-07,K-5,A,')).toBe(true);
    expect(lines[2]!.endsWith(',10,4')).toBe(true);
    expect(lines[3]!.startsWith('CalmLlama43,pre,')).toBe(true);
    expect(lines[3]!.endsWith(',8,')).toBe(true);
  });
  it('averages count only who took each test; the change compares students who took both', () => {
    expect(averages(students)).toEqual({ preCount: 2, preAvg: 7, postCount: 1, postAvg: 10, matchedCount: 1, matchedChange: 4 });
    expect(averages([])).toEqual({ preCount: 0, preAvg: null, postCount: 0, postAvg: null, matchedCount: 0, matchedChange: null });
  });
});

describe('progress summaries', () => {
  const slot = {
    nickname: 'Secret', progress: { level: 3, xp: 200, coins: 5, coinsEarned: 40, zonesCleared: ['piggybank_village'], defeated: ['x'] },
    questions: { accuracy: { Investing: { answered: 5, correct: 3 }, 'Credit and Debt': { answered: 2, correct: 2 } }, bags: { a: 1 } },
    moneyCheck: { firstForm: 'A' as const, pre: check(7), post: null }, inventory: {}, redeemed: ['MB-X'], online: { token: 'm_x' },
  };
  it('contain only what is listed: no nickname, codes, token or inventory', () => {
    const s = summarize(slot);
    expect(Object.keys(s).sort()).toEqual(['accuracy', 'coinsEarned', 'level', 'mcForm', 'mcPost', 'mcPre', 'xp', 'zones']);
    expect(JSON.stringify(s)).not.toMatch(/Secret|MB-X|m_x/);
    expect(totalCorrect(s)).toBe(5);
    expect(parseSummary(JSON.parse(JSON.stringify(s)))).toEqual(s);
  });
  it('are checked strictly: scores must add up and dates look like dates', () => {
    const s = summarize(slot);
    expect(parseSummary({ ...s, mcPre: { ...check(7), total: 12 } })).toBeNull();
    expect(parseSummary({ ...s, mcPre: { ...check(7), date: '+1+1' } })).toBeNull();
    expect(parseSummary({ ...s, mcPre: { ...check(7), date: '=HYPERLINK("x")' } })).toBeNull();
    expect(parseSummary({ ...s, extra: 'dropped' })).toEqual(s);
  });
  it('weeks start on Monday, UTC', () => {
    expect(weekOf(Date.UTC(2026, 10, 9, 0, 0))).toBe('2026-11-09'); // a Monday
    expect(weekOf(Date.UTC(2026, 10, 8, 23, 59))).toBe('2026-11-02'); // the Sunday before
    expect(weekOf(Date.UTC(2026, 10, 15, 12))).toBe('2026-11-09');
  });
});
