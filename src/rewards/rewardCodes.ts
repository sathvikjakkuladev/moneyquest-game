/**
 * rewardCodes.ts
 * --------------
 * Reward codes printed on winner cards for Make Bank, the NHSQA card game
 * in the Quest to Quant kits. A winner scans the card's QR code (or types
 * the code under it) and unlocks a cosmetic the shop doesn't sell.
 *
 * A code looks like   MB-W8K2D-QX7MB
 *   MB     Make Bank
 *   W      which reward the card gives (see REWARDS below)
 *   8K2D   the card's serial number
 *   QX7MB  a check value made from the rest of the code plus a secret word
 *
 * The check value means a made-up code almost never works (about 1 chance in
 * 33 million) and most typos are caught. Each card works ONCE: the class
 * server remembers which codes were used (server/src/redeem.ts).
 *
 * Letters come from "Crockford base 32": digits and capital letters without
 * I, L, O and U, so codes can't be misread. If a kid types O or I/L anyway,
 * we read them as 0 and 1.
 *
 * Shared by the game, the server and tools/make_reward_codes.ts, so value
 * imports here need explicit .ts extensions (Node runs this file directly).
 */

import { REWARD_SECRET } from './rewardSecret.ts';

/** What each kind of winner card unlocks (item ids from data/shop.ts). */
export const REWARDS = {
  W: { name: 'Make Bank Winner', items: ['hat-laurel'], forWho: 'the winner of a Make Bank game' },
  C: { name: 'Make Bank Champion', items: ['pet-bull'], forWho: 'the champion of a Make Bank tournament' },
} as const;

export type RewardKey = keyof typeof REWARDS;
export const isRewardKey = (k: unknown): k is RewardKey => typeof k === 'string' && Object.prototype.hasOwnProperty.call(REWARDS, k);

const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
const SERIAL_LEN = 4; // 32^4 = 1,048,576 cards per reward
const CHECK_LEN = 5; // 32^5 = about 33 million possible check values
export const MAX_SERIAL = 32 ** SERIAL_LEN - 1;

/** Write a number as `len` base-32 characters (with leading zeros). */
function toBase32(n: number, len: number): string {
  let out = '';
  for (let i = 0; i < len; i++) {
    out = ALPHABET[n % 32] + out;
    n = Math.floor(n / 32);
  }
  return out;
}

/**
 * cyrb53: a small, well-mixed hash function (public domain). Turns any text
 * into a big number; changing one letter changes the number completely.
 */
function cyrb53(text: string): number {
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let i = 0; i < text.length; i++) {
    const ch = text.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507);
  h1 ^= Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507);
  h2 ^= Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return 4294967296 * (2097151 & h2) + (h1 >>> 0);
}

/** The check value for a code's reward + serial part. */
function checkFor(body: string, secret: string): string {
  return toBase32(cyrb53(`${secret}|MB|${body}`) % 32 ** CHECK_LEN, CHECK_LEN);
}

/** Make one code. Used by tools/make_reward_codes.ts to print cards. */
export function makeCode(reward: RewardKey, serial: number, secret = REWARD_SECRET): string {
  if (!Number.isInteger(serial) || serial < 0 || serial > MAX_SERIAL) throw new Error(`Serial must be 0-${MAX_SERIAL}.`);
  const body = reward + toBase32(serial, SERIAL_LEN);
  const check = checkFor(body, secret);
  return `MB-${body}-${check}`;
}

export type ParsedCode = { ok: true; code: string; reward: RewardKey } | { ok: false; reason: 'not-found' | 'wrong-check' };

/**
 * Find and check a code in whatever the player typed or scanned: the bare
 * code, the code with spaces or lower-case letters, or a web link with the
 * code inside it (a QR code may hold a link to a class server).
 */
export function parseCode(text: string, secret = REWARD_SECRET): ParsedCode {
  const match = /MB[\s-]*([0-9A-Z]{5})[\s-]*([0-9A-Z]{5})(?![0-9A-Z])/.exec(text.toUpperCase());
  if (!match) return { ok: false, reason: 'not-found' };
  const fix = (s: string) => s.replace(/O/g, '0').replace(/[IL]/g, '1');
  const body = fix(match[1]);
  const check = fix(match[2]);
  const reward = body[0];
  if (!isRewardKey(reward)) return { ok: false, reason: 'not-found' };
  if (checkFor(body, secret) !== check) return { ok: false, reason: 'wrong-check' };
  return { ok: true, code: `MB-${body}-${check}`, reward };
}
