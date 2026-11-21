// The Daily Wheel: Headmaster Goldwhisker lets each save spin once a day for coins. The prize is
// picked when the spin starts (and saved right then), so closing the game mid-spin can't re-roll it.
// Wheel coins aren't counted as coins earned (the class leaderboard counts battle winnings).
import type { Slot } from './save.ts';

export interface Segment { coins: number; weight: number; colour: string }

/** Eight slices, drawn in this order round the wheel. Small prizes are common, the jackpot is rare. */
export const SEGMENTS: Segment[] = [
  { coins: 5, weight: 20, colour: '#4dabf7' },
  { coins: 25, weight: 9, colour: '#b16cff' },
  { coins: 10, weight: 18, colour: '#38d9a9' },
  { coins: 50, weight: 4, colour: '#ff922b' },
  { coins: 5, weight: 20, colour: '#4dabf7' },
  { coins: 15, weight: 14, colour: '#f783ac' },
  { coins: 10, weight: 18, colour: '#38d9a9' },
  { coins: 100, weight: 1, colour: '#ffd43b' },
];

/** The device's calendar day, like "2026-11-21". */
export const today = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/** One spin per calendar day. A clock set back to before the last spin doesn't give another. */
export const canSpin = (s: Slot, day: string) => s.daily.spun === null || day > s.daily.spun;

export function pickSegment(rng: () => number): number {
  const total = SEGMENTS.reduce((a, x) => a + x.weight, 0);
  let r = rng() * total;
  for (let i = 0; i < SEGMENTS.length; i++) if ((r -= SEGMENTS[i]!.weight) < 0) return i;
  return 0;
}

export type Spin = { ok: true; slot: Slot; index: number; coins: number } | { ok: false };

export function spin(s: Slot, day: string, rng: () => number): Spin {
  if (!canSpin(s, day)) return { ok: false };
  const index = pickSegment(rng), coins = SEGMENTS[index]!.coins;
  return { ok: true, index, coins, slot: { ...s, progress: { ...s.progress, coins: s.progress.coins + coins }, daily: { spun: day } } };
}
