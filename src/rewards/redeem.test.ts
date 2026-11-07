import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { codeFromHash, normalize, redeem, REWARD_ONLY_ITEMS } from './redeem.ts';
import { makeCode, MAX_SERIAL } from './rewardCodes.ts';

const fixture = (name: string) => new URL(`../../tests/fixtures/reward-cards/${name}`, import.meta.url);
const W = fixture('W-2026-10-07-14-36.csv');
const C = fixture('C-2026-10-07-14-37.csv');
const codes = (u: URL) =>
  readFileSync(u, 'utf8').trim().split('\n').slice(1).map((l) => {
    const [code, reward] = l.split(',');
    return { code: code!, reward: reward! };
  });
const sha = (p: string) => createHash('sha256').update(readFileSync(new URL(p, import.meta.url))).digest('hex');

describe('copied reward files', () => {
  it('are byte-identical to the files the cards were printed with', () => {
    expect(sha('./rewardCodes.ts')).toBe('1bf2fb3afefe147daef120c623ce5d5b529bfc7fac13e4946060b1eeaf170d79');
    expect(sha('./rewardSecret.ts')).toBe('cb3727079b99392c1bbfe0c18f4995d619894b3cab2b67f6e1c5319b7ec70655');
  });
});

// The printed code lists are gitignored, so on a fresh clone these tests are skipped, not failed.
describe.skipIf(!existsSync(W) || !existsSync(C))('all 110 printed reward cards', () => {
  const all = [...codes(W), ...codes(C)];
  it('has 100 Winner and 10 Champion codes, no duplicates', () => {
    expect(all.filter((c) => c.reward === 'W')).toHaveLength(100);
    expect(all.filter((c) => c.reward === 'C')).toHaveLength(10);
    expect(new Set(all.map((c) => c.code)).size).toBe(110);
  });
  it('every code redeems for the right prize', () => {
    for (const { code, reward } of all) {
      const r = redeem(code, []);
      expect(r, code).toMatchObject({ ok: true, code, reward, items: reward === 'W' ? ['hat-laurel'] : ['pet-bull'] });
    }
  });
  it('also accepts the dashed spelling, spaces, lower case and a link', () => {
    const code = all[0]!.code;
    const dashed = `MB-${code[3]}-${code.slice(4)}`;
    for (const t of [dashed, code.toLowerCase(), ` mb ${code.slice(3, 8)} ${code.slice(9)} `, `https://example.org/#/redeem/${code}`]) expect(redeem(t, []).ok, t).toBe(true);
    expect(normalize(dashed)).toBe(code);
  });
});

describe('redeem rules', () => {
  // A valid code for a serial that was never printed, so no printed card's code is in the repo.
  const good = makeCode('W', MAX_SERIAL);
  const typo = good.slice(0, -1) + (good.endsWith('0') ? '1' : '0');
  it('works once per save', () => {
    expect(redeem(good, [good])).toEqual({ ok: false, reason: 'already-used' });
  });
  it('catches a typo and nonsense', () => {
    expect(redeem(typo, []).ok).toBe(false);
    expect(redeem('hello', [])).toEqual({ ok: false, reason: 'not-found' });
  });
  it('reads #/redeem/ links', () => {
    expect(codeFromHash(`#/redeem/${good}`)).toBe(good);
    expect(codeFromHash('#/other')).toBeNull();
  });
  it('the Laurel Wreath and Bull Calf are reward-only', () => {
    expect([...REWARD_ONLY_ITEMS].sort()).toEqual(['hat-laurel', 'pet-bull']);
  });
});
