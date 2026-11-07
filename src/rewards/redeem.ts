// Game-side wrapper around the reward-card code checker. rewardCodes.ts and rewardSecret.ts are
// byte-identical copies of the files the 110 cards were printed with: never edit them. Game rules
// (dashed spelling, once per save, links) live here.

import type { RewardKey } from './rewardCodes.ts';
import { parseCode, REWARDS } from './rewardCodes.ts';

/** The prizes the printed cards promise. They can only be unlocked by a card, never bought. */
export const REWARD_ONLY_ITEMS: ReadonlySet<string> = new Set(Object.values(REWARDS).flatMap((r) => [...r.items]));

export type RedeemResult =
  | { ok: true; code: string; reward: RewardKey; items: readonly string[] }
  | { ok: false; reason: 'not-found' | 'wrong-check' | 'already-used' };

/**
 * Printed codes look like MB-W1234-ABCDE (reward letter joined to the serial). Kids may type an
 * extra dash or space after the letter (MB-W-1234-ABCDE), which the copied checker rejects, so
 * join it back first.
 */
export function normalize(text: string): string {
  return text.toUpperCase().replace(/MB[\s-]*([WC])[\s-]+([0-9A-Z]{4})(?![0-9A-Z])/, 'MB-$1$2');
}

/** Check a typed, scanned or linked code. `used` holds the codes this save has already redeemed. */
export function redeem(text: string, used: readonly string[]): RedeemResult {
  const p = parseCode(normalize(text));
  if (!p.ok) return p;
  if (used.includes(p.code)) return { ok: false, reason: 'already-used' };
  return { ok: true, code: p.code, reward: p.reward, items: REWARDS[p.reward].items };
}

/** A `#/redeem/<code>` link (for future cards printed with a URL). */
export function codeFromHash(hash: string): string | null {
  const m = /^#\/redeem\/(.+)$/.exec(hash);
  return m ? decodeURIComponent(m[1]!) : null;
}

export const REDEEM_MESSAGES: Record<Exclude<RedeemResult, { ok: true }>['reason'], string> = {
  'not-found': "That doesn't look like a MoneyQuest card code. Check the letters and try again.",
  'wrong-check': "That code isn't right. Check each letter carefully (it never uses I, L, O or U).",
  'already-used': 'This save has already used that card.',
};
