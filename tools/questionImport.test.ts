import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parseCsv } from './lib/csv.ts';
import { HEADER, importQuestions } from './lib/questionImport.ts';

const H = HEADER.join(',');
const row = (over: Partial<Record<string, string>> = {}) => {
  const r = { id: 'ES-E-01', topic: 'Spending and Saving', grade_band: 'K-5', question: 'Q?', option_a: 'a', option_b: 'b', option_c: 'c', option_d: 'd', correct: 'A', explanation: 'Because.', ...over };
  return HEADER.map((h) => `"${(r as Record<string, string>)[h]!.replace(/"/g, '""')}"`).join(',');
};
const csv = (...rows: string[]) => [H, ...rows].join('\n');

describe('parseCsv', () => {
  it('handles quotes, doubled quotes, commas and newlines inside quotes, CRLF', () => {
    expect(parseCsv('a,"b, c","say ""hi""","line\nbreak"\r\nx,y,z,w\r\n')).toEqual([
      ['a', 'b, c', 'say "hi"', 'line\nbreak'],
      ['x', 'y', 'z', 'w'],
    ]);
  });
  it('throws on an unclosed quote', () => {
    expect(() => parseCsv('a,"b')).toThrow();
  });
});

describe('importQuestions', () => {
  it('accepts a good row and maps the answer letter', () => {
    const r = importQuestions(csv(row({ correct: 'c' })));
    expect(r.errors).toEqual([]);
    expect(r.questions[0]).toMatchObject({ id: 'ES-E-01', band: 'K-5', correct: 2, options: ['a', 'b', 'c', 'd'] });
  });
  it.each([
    ['wrong field count', `${H}\nES-E-01,Spending and Saving,K-5,Q?,a,b,c,d,A`, 'expected 10 fields'],
    ['duplicate id', csv(row(), row()), 'duplicate id'],
    ['unknown topic', csv(row({ topic: 'Taxes' })), 'unknown topic'],
    ['bad band', csv(row({ grade_band: '9-12' })), 'grade_band'],
    ['band letter mismatch', csv(row({ grade_band: '6-8' })), "doesn't match"],
    ['bad answer letter', csv(row({ correct: 'E' })), 'correct must be'],
    ['duplicate options', csv(row({ option_b: 'A' })), 'two options are the same'],
    ['empty field', csv(row({ explanation: '' })), 'explanation is empty'],
    ['bad header', `id,topic\n${row()}`, 'Header must be'],
  ])('rejects %s', (_name, text, msg) => {
    expect(importQuestions(text).errors.join('\n')).toContain(msg);
  });
  it('applies overrides with reasons and rejects bad ones', () => {
    const ok = importQuestions(csv(row()), { 'ES-E-01': { option_a: 'new a', reason: 'clarity' } });
    expect(ok.errors).toEqual([]);
    expect(ok.questions[0]!.options[0]).toBe('new a');
    expect(ok.applied).toEqual(['ES-E-01']);
    expect(importQuestions(csv(row()), { 'ES-E-01': { option_a: 'x', reason: '' } }).errors.join()).toContain('no reason');
    expect(importQuestions(csv(row()), { 'XX-E-99': { option_a: 'x', reason: 'r' } }).errors.join()).toContain('matches no question');
    expect(importQuestions(csv(row()), { 'ES-E-01': { topic: 'Investing', reason: 'r' } as never }).errors.join()).toContain("can't be overridden");
  });
});

describe('the real question bank', () => {
  const text = readFileSync(new URL('../../make-bank-question-bank.csv', import.meta.url), 'utf8');
  const overrides = JSON.parse(readFileSync(new URL('../src/data/question-overrides.json', import.meta.url), 'utf8'));
  it('imports with the reviewed overrides: 180 questions, 15 per topic per band', () => {
    const r = importQuestions(text, overrides);
    expect(r.errors).toEqual([]);
    expect(r.questions).toHaveLength(180);
    const count = new Map<string, number>();
    for (const q of r.questions) count.set(`${q.topic}|${q.band}`, (count.get(`${q.topic}|${q.band}`) ?? 0) + 1);
    expect([...count.values()].every((n) => n === 15)).toBe(true);
    expect(count.size).toBe(12);
  });
});
